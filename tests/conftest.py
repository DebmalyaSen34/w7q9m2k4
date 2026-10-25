import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.data import SCHEMA


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "fixture.sqlite"
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    info = {"version": "test", "forecast_interval_minutes": 60, "retrieved_at": "2026-02-05T00:00:00Z", "stale_threshold_hours": 12}
    connection.executemany("INSERT INTO metadata VALUES (?, ?)", [(k, json.dumps(v)) for k, v in info.items()])
    connection.commit()
    yield connection, path
    connection.close()


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setenv("WIND_DB_PATH", str(db[1]))
    with TestClient(app) as client:
        yield client
