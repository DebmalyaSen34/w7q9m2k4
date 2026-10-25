"""SQLite snapshot format shared by ingestion and the read-only API."""
import json
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "wind.sqlite"

SCHEMA = """
CREATE TABLE actuals (
 start_time TEXT PRIMARY KEY, publish_time TEXT NOT NULL, generation REAL NOT NULL
);
CREATE TABLE forecasts (
 start_time TEXT NOT NULL, publish_time TEXT NOT NULL, generation REAL NOT NULL,
 PRIMARY KEY (start_time, publish_time)
);
CREATE INDEX forecast_publication ON forecasts(publish_time, start_time);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect(path=None):
    target = Path(path or os.environ.get("WIND_DB_PATH", DEFAULT_DB)).resolve()
    connection = sqlite3.connect(target.as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def metadata(connection):
    return {row["key"]: json.loads(row["value"]) for row in connection.execute("SELECT * FROM metadata")}
