"""Polite Socrata pacing in slam_pipeline.net (BetaNYC/SLAM#106).

Same rules as BoardStat's Soda client (BetaNYC/BoardStat#128): at least 2 s between requests
to one Socrata host, a wider gap after a 429, Retry-After honored on 429 and 503, capped
exponential backoff, X-App-Token only when SOCRATA_APP_TOKEN is set. No network: urlopen,
the clock and sleep are all faked.
"""

import datetime as dt
import email.message
import io
import urllib.error

import pytest

from slam_pipeline import net

NYC = "https://data.cityofnewyork.us/resource/abcd-1234.json?$limit=1"
NYS = "https://data.ny.gov/resource/wxyz-9876.json?$limit=1"
OTHER = "https://geosearch.planninglabs.nyc/v2/search?text=x"


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.sleeps: list[float] = []

    def monotonic(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)
        self.now += s


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def ok(body=b"[]"):
    return Resp(body)


def http_error(code, headers=None, body=b"err"):
    msg = email.message.Message()
    for k, v in (headers or {}).items():
        msg[k] = v
    return urllib.error.HTTPError("https://x", code, "status", msg, io.BytesIO(body))


class FakeUrlopen:
    """Plays back a script of responses (bytes bodies) or exceptions; records requests."""

    def __init__(self, clock, script, took=0.0):
        self.clock, self.script, self.took = clock, list(script), took
        self.requests = []

    def __call__(self, req, timeout=None):
        self.requests.append(req)
        self.clock.now += self.took
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


@pytest.fixture
def clock(monkeypatch):
    c = FakeClock()
    monkeypatch.setattr(net.time, "monotonic", c.monotonic)
    monkeypatch.setattr(net.time, "sleep", c.sleep)
    monkeypatch.setattr(net.random, "uniform", lambda a, b: 0.0)
    monkeypatch.delenv("SLAM_SODA_MIN_INTERVAL", raising=False)
    monkeypatch.delenv("SLAM_SODA_MAX_INTERVAL", raising=False)
    monkeypatch.delenv("SOCRATA_APP_TOKEN", raising=False)
    monkeypatch.setattr(net, "_PACERS", {})
    return c


def play(monkeypatch, clock, script, took=0.0):
    fake = FakeUrlopen(clock, script, took)
    monkeypatch.setattr(net.urllib.request, "urlopen", fake)
    return fake


def test_two_seconds_between_requests_to_one_host(monkeypatch, clock):
    play(monkeypatch, clock, [ok(), ok(), ok()])
    for _ in range(3):
        net.get_json(NYC)
    assert clock.sleeps == [2.0, 2.0]  # none before the first request


def test_gap_is_per_host(monkeypatch, clock):
    play(monkeypatch, clock, [ok(), ok(), ok()])
    net.get_json(NYC)
    net.get_json(NYS)  # a different portal: no wait
    net.get_json(NYC)  # 0 s have passed on the fake clock since the first NYC request
    assert clock.sleeps == [2.0]


def test_no_wait_when_requests_are_already_slow(monkeypatch, clock):
    play(monkeypatch, clock, [ok(), ok()], took=30.0)
    net.get_json(NYC)
    net.get_json(NYC)
    assert clock.sleeps == []


def test_429_doubles_gap_then_successes_decay_it(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(429), http_error(429), ok(), ok(), ok()])
    net.get_json(NYC)
    pacer = net._PACERS["data.cityofnewyork.us"]
    assert pacer.gap == 4.0  # 2 -> 4 -> 8 after two 429s, halved once by the success
    net.get_json(NYC)
    assert pacer.gap == 2.0
    net.get_json(NYC)
    assert pacer.gap == 2.0  # never below the floor


def test_gap_is_capped(monkeypatch, clock):
    monkeypatch.setenv("SLAM_SODA_MAX_INTERVAL", "5")
    play(monkeypatch, clock, [http_error(429)] * 5 + [ok()])
    net.get_json(NYC)
    assert net._PACERS["data.cityofnewyork.us"].gap == 2.5  # capped at 5, halved by the success


def test_retry_after_seconds_is_honored(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(429, {"Retry-After": "37"}), ok()])
    assert net.get_json(NYC) == []
    # 37 s asked for; the pacer then sees 37 s have passed and adds no wait of its own.
    assert clock.sleeps == [37.0]


def test_retry_after_http_date_on_503(monkeypatch, clock):
    when = dt.datetime.now(dt.UTC) + dt.timedelta(seconds=90)
    hdr = when.strftime("%a, %d %b %Y %H:%M:%S GMT")
    play(monkeypatch, clock, [http_error(503, {"Retry-After": hdr}), ok()])
    net.get_json(NYC)
    assert 80 <= clock.sleeps[0] <= 91


def test_retry_after_is_capped(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(429, {"Retry-After": "99999"}), ok()])
    net.get_json(NYC)
    assert clock.sleeps[0] == net.RETRY_AFTER_CAP


def test_retry_after_ignored_on_other_5xx(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(500, {"Retry-After": "37"}), ok()])
    net.get_json(NYC)
    assert clock.sleeps == [2.0]  # 2**1 backoff, not 37


def test_backoff_is_exponential_and_capped(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(503)] * 8 + [ok()])
    assert net.get_json(NYC, retries=9) == []
    # Backoff 2, 4, ... capped at BACKOFF_CAP; the 2 s pacing gap is always already covered.
    assert clock.sleeps == [2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 120.0, 120.0]


def test_default_tries_ride_out_a_short_503_spell(monkeypatch, clock):
    fake = play(monkeypatch, clock, [http_error(503)] * 5 + [ok(b'[{"ok": 1}]')])
    assert net.get_json(NYC) == [{"ok": 1}]
    assert len(fake.requests) == net.SODA_TRIES == 6


def test_timeouts_and_resets_are_retried(monkeypatch, clock):
    fake = play(monkeypatch, clock, [TimeoutError("timed out"),
                                     ConnectionResetError(54, "Connection reset by peer"),
                                     urllib.error.URLError("dns"), ok()])
    assert net.get_json(NYC) == []
    assert len(fake.requests) == 4


def test_no_sleep_after_the_last_failed_try(monkeypatch, clock):
    play(monkeypatch, clock, [http_error(503), http_error(503)])
    with pytest.raises(RuntimeError, match="after 2 attempts"):
        net.get_json(NYC, retries=2)
    assert clock.sleeps == [2.0]


def test_other_4xx_fails_at_once(monkeypatch, clock):
    fake = play(monkeypatch, clock, [http_error(400, body=b"bad SoQL"), ok()])
    with pytest.raises(RuntimeError, match="HTTP 400: bad SoQL"):
        net.get_json(NYC)
    assert len(fake.requests) == 1
    assert clock.sleeps == []


def test_app_token_sent_only_when_set(monkeypatch, clock):
    fake = play(monkeypatch, clock, [ok(), ok()])
    net.get_json(NYC)
    assert fake.requests[0].get_header("X-app-token") is None
    monkeypatch.setenv("SOCRATA_APP_TOKEN", "tok-secret-123")
    net.get_json(NYC)
    assert fake.requests[1].get_header("X-app-token") == "tok-secret-123"


def test_app_token_never_logged_and_not_sent_elsewhere(monkeypatch, clock, capsys):
    monkeypatch.setenv("SOCRATA_APP_TOKEN", "tok-secret-123")
    fake = play(monkeypatch, clock, [http_error(429), ok(), ok()])
    net.get_json(NYC)
    net.get_json(OTHER)
    assert fake.requests[2].get_header("X-app-token") is None  # GeoSearch is not Socrata
    err = capsys.readouterr().err
    assert "tok-secret-123" not in err
    assert '"app_token": true' in err


def test_non_socrata_hosts_are_not_paced(monkeypatch, clock):
    play(monkeypatch, clock, [ok(), ok()])
    net.get_json(OTHER)
    net.get_json(OTHER)
    assert clock.sleeps == []
    assert net._PACERS == {}


def test_env_configures_intervals(monkeypatch, clock):
    monkeypatch.setenv("SLAM_SODA_MIN_INTERVAL", "0.5")
    monkeypatch.setenv("SLAM_SODA_MAX_INTERVAL", "10")
    p = net.HostPacer("data.ny.gov")
    assert (p.min_interval, p.max_interval, p.gap) == (0.5, 10.0, 0.5)


def test_defaults(clock):
    p = net.HostPacer("data.ny.gov")
    assert (p.min_interval, p.max_interval) == (2.0, 60.0)


def test_bad_env_value_fails_loudly(monkeypatch, clock):
    monkeypatch.setenv("SLAM_SODA_MIN_INTERVAL", "fast")
    with pytest.raises(ValueError, match="not a number"):
        net.HostPacer("data.ny.gov")


def test_fetch_all_pages_are_paced(monkeypatch, clock):
    fake = play(monkeypatch, clock, [ok(b'[{"a": 1}, {"a": 2}]'), ok(b'[{"a": 3}]')])
    rows = net.fetch_all("data.ny.gov", "wxyz-9876", select=["a"], where="a > 0", order="a",
                         page_size=2)
    assert [r["a"] for r in rows] == [1, 2, 3]
    assert len(fake.requests) == 2
    assert clock.sleeps == [2.0]
