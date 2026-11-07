"""Small stdlib HTTP helpers plus structured logging.

Read-only GETs only. Requests to a Socrata portal (NYC Open Data, data.ny.gov) are paced
politely, per BetaNYC/SLAM#106 and the same design as BoardStat's `Soda` client
(BetaNYC/BoardStat#128):

- at least SODA_MIN_INTERVAL seconds between request starts to the same host (monotonic
  clock); a 429 doubles the gap (up to SODA_MAX_INTERVAL) and each success halves it back;
- a Retry-After header on 429 or 503 is honored (seconds or HTTP date, RFC 9110 §10.2.3),
  capped at RETRY_AFTER_CAP; otherwise capped exponential backoff with a little jitter;
- 429, 5xx, timeouts, resets and truncated bodies are retried; other 4xx fail at once;
- `X-App-Token` is sent only when SOCRATA_APP_TOKEN is set, and only to Socrata hosts.

Socrata publishes no request-rate number. Without a token requests share lower limits, and a
429 can come even with one (https://dev.socrata.com/docs/app-tokens,
https://dev.socrata.com/docs/response-codes). The pipeline is single-threaded, so requests to
one host never run in parallel. Other hosts (GeoSearch, ArcGIS) keep the simpler retry in
_get_other and are paced by their callers.
"""

from __future__ import annotations

import email.utils
import http.client
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime

import truststore

# Use the OS trust store for TLS. uv-managed Pythons do not see the macOS keychain roots,
# so urllib fails with CERTIFICATE_VERIFY_FAILED without this.
# https://truststore.readthedocs.io/ (truststore.inject_into_ssl)
truststore.inject_into_ssl()

USER_AGENT = "BetaNYC-SLAM-v2-prototype/0.1 (+https://github.com/BetaNYC/SLAM)"

SOCRATA_HOSTS = frozenset({"data.cityofnewyork.us", "data.ny.gov", "api.us.socrata.com"})

# Same numbers as BoardStat (#128), which came from NYC Open Data's own 429s and 503s on
# 2026-11-06. Change the gap with SLAM_SODA_MIN_INTERVAL / SLAM_SODA_MAX_INTERVAL (seconds).
SODA_MIN_INTERVAL = 2.0
SODA_MAX_INTERVAL = 60.0
RETRY_AFTER_CAP = 300.0
BACKOFF_CAP = 120.0
SODA_TRIES = 6  # waits of about 2, 4, 8, 16, 32 s: rides out a minute-long 503 spell
OTHER_TRIES = 3

# A reset mid-download (seen 2026-11-05 on a live build) is a ConnectionError, and a truncated
# or dropped response an http.client.HTTPException; both are worth a retry.
RETRYABLE = (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError,
             http.client.HTTPException)


def log(event: str, **fields) -> None:
    """One JSON line per event on stderr: script, event, timestamp, fields."""
    rec = {"script": "slam_pipeline", "event": event,
           "ts": datetime.now(UTC).isoformat(timespec="seconds"), **fields}
    print(json.dumps(rec, default=str), file=sys.stderr, flush=True)


def env_seconds(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"{name}={raw!r} is not a number of seconds") from exc
    if value < 0:
        raise ValueError(f"{name}={raw!r} must not be negative")
    return value


def retry_after_seconds(headers) -> float | None:
    """Seconds asked for by a Retry-After header (a delay or an HTTP date), or None."""
    raw = ((headers.get("Retry-After") if headers is not None else None) or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return float(raw)
    try:
        when = email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0.0, (when - datetime.now(UTC)).total_seconds())


class HostPacer:
    """The gap between request starts to one Socrata host, widened by 429s."""

    def __init__(self, host: str):
        self.host = host
        self.min_interval = env_seconds("SLAM_SODA_MIN_INTERVAL", SODA_MIN_INTERVAL)
        self.max_interval = max(env_seconds("SLAM_SODA_MAX_INTERVAL", SODA_MAX_INTERVAL),
                                self.min_interval)
        self.gap = self.min_interval
        self.last_start: float | None = None

    def wait(self) -> None:
        if self.last_start is not None:
            left = self.last_start + self.gap - time.monotonic()
            if left > 0:
                time.sleep(left)
        self.last_start = time.monotonic()

    def slow_down(self) -> None:
        self.gap = min(self.max_interval, max(self.gap * 2, self.min_interval, 1.0))
        log("http_slow_down", host=self.host, gap_s=round(self.gap, 1))

    def speed_up(self) -> None:
        self.gap = max(self.min_interval, self.gap / 2)


_PACERS: dict[str, HostPacer] = {}


def pacer_for(host: str) -> HostPacer:
    p = _PACERS.get(host)
    if p is None:
        p = _PACERS[host] = HostPacer(host)
        log("soda_pacing", host=host, min_interval_s=p.min_interval, max_interval_s=p.max_interval,
            app_token=bool(os.environ.get("SOCRATA_APP_TOKEN", "").strip()))
    return p


def get_json(url: str, *, retries: int | None = None, timeout: int = 60):
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    if host in SOCRATA_HOSTS:
        return _get_socrata(url, host, tries=retries or SODA_TRIES, timeout=timeout)
    return _get_other(url, tries=retries or OTHER_TRIES, timeout=timeout)


def _request(url: str, extra: dict[str, str] | None = None) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                "Accept": "application/json", **(extra or {})})


def _get_socrata(url: str, host: str, *, tries: int, timeout: int):
    pacer = pacer_for(host)
    token = os.environ.get("SOCRATA_APP_TOKEN", "").strip()
    extra = {"X-App-Token": token} if token else {}  # never logged
    last: Exception | None = None
    for attempt in range(1, tries + 1):
        status: int | None = None
        headers = None
        try:
            pacer.wait()
            with urllib.request.urlopen(_request(url, extra), timeout=timeout) as resp:
                data = json.load(resp)
            pacer.speed_up()
            return data
        except urllib.error.HTTPError as exc:  # before RETRYABLE: HTTPError is a URLError
            status, headers = exc.code, exc.headers
            if status != 429 and status < 500:
                body = exc.read()[:300].decode("utf-8", "replace")
                raise RuntimeError(f"GET {url} returned HTTP {status}: {body}") from exc
            last = exc
        except RETRYABLE as exc:
            last = exc
        if status == 429:
            pacer.slow_down()
        if attempt == tries:
            break
        asked = retry_after_seconds(headers) if status in (429, 503) else None
        if asked is not None:
            wait = min(RETRY_AFTER_CAP, asked)
        else:
            wait = min(BACKOFF_CAP, 2**attempt) + random.uniform(0, 1)
        log("http_retry", url=url, attempt=attempt, status=status, wait_s=round(wait, 1),
            retry_after=asked, error=str(last)[:200])
        time.sleep(wait)
    raise RuntimeError(f"GET failed after {tries} attempts: {url}: {last}")


def _get_other(url: str, *, tries: int, timeout: int):
    """Non-Socrata hosts: unchanged from before #106 (linear backoff, any URLError retried)."""
    last: Exception | None = None
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(_request(url), timeout=timeout) as resp:
                return json.load(resp)
        except RETRYABLE as exc:
            last = exc
            log("http_retry", url=url, attempt=attempt, error=str(exc))
            time.sleep(2 * attempt)
    raise RuntimeError(f"GET failed after {tries} attempts: {url}: {last}")


def soql_url(domain: str, dataset_id: str, params: dict, fmt: str = "json") -> str:
    return f"https://{domain}/resource/{dataset_id}.{fmt}?" + urllib.parse.urlencode(params)


def fetch_all(domain: str, dataset_id: str, *, select: list[str], where: str, order: str,
              page_size: int = 50000, group: str | None = None) -> list[dict]:
    """Page through a SoQL query with $limit/$offset and a stable $order
    (https://dev.socrata.com/docs/queries/offset.html, .../queries/order.html: results are
    not implicitly ordered, so paging needs an $order). `group` is SoQL $group
    (https://dev.socrata.com/docs/queries/group.html)."""
    rows: list[dict] = []
    offset = 0
    while True:
        params = {"$select": ",".join(select), "$where": where, "$order": order,
                  "$limit": page_size, "$offset": offset}
        if group:
            params["$group"] = group
        page = get_json(soql_url(domain, dataset_id, params))
        if not isinstance(page, list):
            raise RuntimeError(f"{dataset_id}: expected a JSON array, got {type(page).__name__}: "
                               f"{str(page)[:300]}")
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def view_metadata(domain: str, dataset_id: str) -> dict:
    return get_json(f"https://{domain}/api/views/{dataset_id}.json")
