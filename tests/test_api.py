import sqlite3

import pytest

from backend.data import connect
from tests.test_analytics import seed


@pytest.mark.parametrize("query", [
    "decision_date=2025-12-31", "decision_date=2026-02-01", "decision_date=invalid",
    "decision_date=2026-01-01&cutoff=24:00", "decision_date=2026-01-01&cutoff=09:60",
    "decision_date=2026-01-01&cutoff=9:00", "decision_date=2026-01-01&cutoff=09:00:00",
])
def test_invalid_forecast_input(client, query):
    assert client.get("/api/forecast?" + query).status_code == 422


def test_invalid_accuracy_range(client):
    assert client.get("/api/accuracy?from=2026-01-31&to=2026-01-01").status_code == 422
    assert client.get("/api/accuracy?from=2026-01-01&to=2026-02-01").status_code == 422


def test_forecast_contract_and_health(client, db):
    seed(db[0])
    response = client.get("/api/forecast?decision_date=2026-01-01")
    assert response.status_code == 200
    body = response.json()
    assert body["cutoff_at"] == "2026-01-01T09:00:00Z"
    assert len(body["points"]) == 24
    assert body["points"][0]["error_mw"] == 20
    assert response.headers["cache-control"] == "no-store"
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["dataset"]["version"] == "test"
    assert health["records"]["forecasts"] == 3


def test_missing_snapshot_returns_actionable_503(client, monkeypatch, tmp_path):
    monkeypatch.setenv("WIND_DB_PATH", str(tmp_path / "missing.sqlite"))
    response = client.get("/api/forecast?decision_date=2026-01-01")
    assert response.status_code == 503
    assert "ingestion" in response.json()["detail"]
    assert not (tmp_path / "missing.sqlite").exists()


def test_snapshot_is_read_only(db):
    with connect(db[1]) as connection:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            connection.execute("DELETE FROM forecasts")
