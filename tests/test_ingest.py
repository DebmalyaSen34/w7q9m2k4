from datetime import datetime, timezone

import httpx
import pytest

from backend.data import connect, metadata
from scripts.ingest import build_snapshot, fetch, infer_cadence, normalize, timestamp


def record(start="2026-01-02T00:00:00Z", publish="2026-01-01T08:00:00Z", value=100, fuel="WIND"):
    return {"startTime": start, "publishTime": publish, "generation": value, "fuelType": fuel}


def test_duplicates_removed_and_conflicts_fail():
    values, duplicates = normalize([record(), record()], "WINDFOR")
    assert len(values) == 1 and duplicates == 1
    with pytest.raises(ValueError, match="conflicting"):
        normalize([record(), record(value=200)], "WINDFOR")


def test_actuals_filter_other_fuels_and_outside_range():
    values, _ = normalize([record(), record(fuel="CCGT"), record(start="2026-01-01T23:30:00Z")], "FUELHH")
    assert len(values) == 1


def test_timestamp_requires_timezone_and_normalizes():
    assert timestamp("2026-01-02T01:00:00+01:00") == "2026-01-02T00:00:00Z"
    with pytest.raises(ValueError, match="timezone"):
        timestamp("2026-01-02T01:00:00")


def test_cadence_detection_rejects_mixed_grid():
    records = [record(), record(start="2026-01-02T01:00:00Z"), record(start="2026-01-02T02:00:00Z")]
    values, _ = normalize(records, "WINDFOR")
    assert infer_cadence(values) == 60
    values[("2026-01-02T02:15:00Z", "2026-01-01T08:00:00Z")] = 100
    with pytest.raises(ValueError, match="off-grid"):
        infer_cadence(values)


def test_atomic_snapshot_latest_actual_revision_and_report(tmp_path):
    path = tmp_path / "wind.sqlite"
    actuals = [record(publish="2026-01-02T01:00:00Z", value=90), record(publish="2026-01-03T01:00:00Z", value=120)]
    forecasts = [record(), record(start="2026-01-02T01:00:00Z")]
    info = build_snapshot(actuals, forecasts, path)
    with connect(path) as db:
        assert db.execute("SELECT generation FROM actuals").fetchone()[0] == 120
        assert metadata(db)["forecast_interval_minutes"] == 60
    assert info["actual_revision_count"] == 1
    assert len(info["missing_actual_periods"]) == 1487
    before = path.read_bytes()
    with pytest.raises(ValueError):
        build_snapshot(actuals, [record(), record(value=999)], path)
    assert path.read_bytes() == before


def test_network_retry_and_cached_replay(tmp_path, monkeypatch):
    attempts = []
    def handler(request):
        attempts.append(request)
        return httpx.Response(503 if len(attempts) == 1 else 200, json=[])
    monkeypatch.setattr("scripts.ingest.time.sleep", lambda _: None)
    begin = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 1, 2, tzinfo=timezone.utc)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert fetch(client, "WINDFOR", begin, end, tmp_path) == []
        assert fetch(client, "WINDFOR", begin, end, tmp_path) == []
    assert len(attempts) == 2


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, None, True])
def test_invalid_generation_rejected(value):
    with pytest.raises(ValueError, match="Invalid"):
        normalize([record(value=value)], "WINDFOR")
