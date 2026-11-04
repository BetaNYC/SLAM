"""Small stdlib HTTP helpers plus structured logging.

Anonymous, read-only GETs only. Socrata allows unauthenticated requests
(https://dev.socrata.com/docs/app-tokens.html: requests without an app token
are subject to lower, shared throttling limits), so we keep volume small.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime

import truststore

# Use the OS trust store for TLS. uv-managed Pythons do not see the macOS
# keychain roots, so urllib fails with CERTIFICATE_VERIFY_FAILED without this.
# https://truststore.readthedocs.io/ (truststore.inject_into_ssl)
truststore.inject_into_ssl()

USER_AGENT = "BetaNYC-SLAM-v2-prototype/0.1 (+https://github.com/BetaNYC/SLAM)"


def log(event: str, **fields) -> None:
    """One JSON line per event on stderr: script, event, timestamp, fields."""
    rec = {"script": "slam_pipeline", "event": event,
           "ts": datetime.now(UTC).isoformat(timespec="seconds"), **fields}
    print(json.dumps(rec, default=str), file=sys.stderr, flush=True)


def get_json(url: str, *, retries: int = 3, timeout: int = 60):
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                   "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            log("http_retry", url=url, attempt=attempt, error=str(exc))
            time.sleep(2 * attempt)
    raise RuntimeError(f"GET failed after {retries} attempts: {url}: {last}")


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
