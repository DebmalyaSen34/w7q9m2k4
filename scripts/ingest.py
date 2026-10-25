"""Download a reproducible Elexon snapshot; replace the previous DB atomically."""
import argparse
import hashlib
import json
import logging
import math
import sqlite3
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from backend.analytics import iso
from backend.data import DEFAULT_DB, SCHEMA

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
START = datetime(2026, 1, 2, tzinfo=timezone.utc)
END = datetime(2026, 2, 2, tzinfo=timezone.utc)
logger = logging.getLogger("ingest")


def timestamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Elexon timestamp is missing its timezone")
    return iso(result)


def fetch(client, dataset, begin, end, cache, refresh=False):
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / f"{dataset}-{begin.date()}.json"
    if target.exists() and not refresh:
        return json.loads(target.read_text())
    params = {"publishDateTimeFrom": iso(begin), "publishDateTimeTo": iso(end)}
    for attempt in range(4):
        try:
            response = client.get(f"{BASE}/{dataset}/stream", params=params)
            response.raise_for_status()
            records = response.json()
            if not isinstance(records, list):
                raise ValueError(f"Unexpected {dataset} payload; expected an array")
            target.write_text(json.dumps(records))
            return records
        except (httpx.TransportError, httpx.HTTPStatusError) as error:
            if isinstance(error, httpx.HTTPStatusError) and error.response.status_code < 500 and error.response.status_code != 429:
                raise
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def normalize(records, dataset):
    unique = {}
    conflicts = set()
    duplicate_count = 0
    for record in records:
        if dataset == "FUELHH" and record.get("fuelType") != "WIND":
            continue
        start = timestamp(record["startTime"])
        if not iso(START) <= start < iso(END):
            continue
        publication = timestamp(record["publishTime"])
        generation = record["generation"]
        if isinstance(generation, bool) or not isinstance(generation, (int, float)) or not math.isfinite(generation) or generation < 0:
            raise ValueError(f"Invalid wind generation for {start}")
        key = (start, publication)
        if key in unique:
            if unique[key] == generation:
                duplicate_count += 1
            else:
                conflicts.add(key)
        else:
            unique[key] = generation
    if conflicts:
        raise ValueError(f"{dataset}: {len(conflicts)} conflicting records with the same delivery/publication key; first: {sorted(conflicts)[0]}")
    return unique, duplicate_count


def infer_cadence(forecasts):
    publications = defaultdict(set)
    for start, publication in forecasts:
        publications[publication].add(datetime.fromisoformat(start))
    # The most common within-publication step avoids mistaking isolated gaps for cadence.
    counts = Counter()
    for times in publications.values():
        times = sorted(times)
        counts.update(int((b - a).total_seconds() / 60) for a, b in zip(times, times[1:]))
    if not counts:
        raise ValueError("Too few forecast intervals to establish cadence")
    cadence = counts.most_common(1)[0][0]
    if cadence not in (30, 60):
        raise ValueError(f"Unsupported forecast cadence {cadence} minutes")
    for start, _ in forecasts:
        value = datetime.fromisoformat(start)
        if value.second or value.minute % cadence:
            raise ValueError("Mixed or off-grid forecast intervals; inspect the source before aggregation")
    return cadence


def build_snapshot(actual_records, forecast_records, output, retrieved_at=None):
    actual_versions, actual_dupes = normalize(actual_records, "FUELHH")
    forecasts, forecast_dupes = normalize(forecast_records, "WINDFOR")
    if not actual_versions or not forecasts:
        raise ValueError("Both actuals and forecasts are required")
    cadence = infer_cadence(forecasts)
    actuals = {}
    for (start, publication), generation in sorted(actual_versions.items()):
        value = datetime.fromisoformat(start)
        if value.minute not in (0, 30) or value.second:
            raise ValueError("Actuals are not aligned to half-hour boundaries")
        if start not in actuals or publication > actuals[start][0]:
            actuals[start] = (publication, generation)
    missing = []
    step = START
    while step < END:
        if iso(step) not in actuals:
            missing.append(iso(step))
        step += timedelta(minutes=30)
    canonical = json.dumps([sorted(actuals.items()), sorted(forecasts.items())], separators=(",", ":"))
    info = {
        "version": hashlib.sha256(canonical.encode()).hexdigest()[:16],
        "retrieved_at": retrieved_at or iso(datetime.now(timezone.utc)),
        "built_at": iso(datetime.now(timezone.utc)),
        "source": "Elexon Insights • FUELHH WIND + WINDFOR",
        "decision_start": "2026-01-01", "decision_end": "2026-01-31",
        "delivery_start": "2026-01-02", "delivery_end": "2026-02-01",
        "forecast_interval_minutes": cadence, "actual_interval_minutes": 30,
        "missing_actual_periods": missing,
        "duplicates_removed": actual_dupes + forecast_dupes,
        "conflicts": 0, "actual_revision_count": len(actual_versions) - len(actuals),
        "stale_threshold_hours": 12,
    }
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    if temporary.exists():
        temporary.unlink()
    db = sqlite3.connect(temporary)
    try:
        db.executescript(SCHEMA)
        db.executemany("INSERT INTO actuals VALUES (?, ?, ?)", [(s, p, v) for s, (p, v) in sorted(actuals.items())])
        db.executemany("INSERT INTO forecasts VALUES (?, ?, ?)", [(s, p, v) for (s, p), v in sorted(forecasts.items())])
        db.executemany("INSERT INTO metadata VALUES (?, ?)", [(key, json.dumps(value)) for key, value in info.items()])
        db.commit()
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Snapshot integrity check failed")
    finally:
        db.close()
    temporary.replace(output)
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_DB)
    parser.add_argument("--cache", type=Path, default=Path("data/raw"))
    parser.add_argument("--refresh", action="store_true", help="Refetch all cached batches from Elexon")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    records = {"FUELHH": [], "WINDFOR": []}
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        for dataset in records:
            # Forecast lookback covers the earliest decision cutoff; actuals are
            # published after delivery, so include a three-day trailing buffer.
            begin = datetime(2025, 12, 29, tzinfo=timezone.utc) if dataset == "WINDFOR" else START
            finish = datetime(2026, 2, 1, tzinfo=timezone.utc) if dataset == "WINDFOR" else END + timedelta(days=3)
            while begin < finish:
                chunk = fetch(client, dataset, begin, begin + timedelta(days=1), args.cache, args.refresh)
                records[dataset].extend(chunk)
                logger.info("%s %s: %s records", dataset, begin.date(), len(chunk))
                begin += timedelta(days=1)
    retrieved_at = iso(datetime.fromtimestamp(max(path.stat().st_mtime for path in args.cache.glob("*.json")), timezone.utc))
    info = build_snapshot(records["FUELHH"], records["WINDFOR"], args.output, retrieved_at)
    from backend.analytics import accuracy, FIRST_DATE, LAST_DATE
    from backend.data import connect
    from contextlib import closing
    with closing(connect(args.output)) as db:
        baseline = accuracy(db, FIRST_DATE, LAST_DATE, "09:00")
        report = {"dataset": info, "default_cutoff": "09:00", "metrics": baseline["metrics"], "daily": baseline["daily"]}
        args.output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n")
    logger.info("Snapshot ready: %s", json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
