import json
from datetime import date
from math import sqrt

import pytest

from backend.analytics import accuracy, forecast, metrics


def seed(db, target="2026-01-02T00:00:00Z"):
    db.executemany("INSERT INTO forecasts VALUES (?, ?, ?)", [
        (target, "2026-01-01T08:00:00Z", 80),
        (target, "2026-01-01T09:00:00Z", 100),
        (target, "2026-01-01T09:00:01Z", 900),
    ])
    db.executemany("INSERT INTO actuals VALUES (?, ?, ?)", [
        (target, "2026-01-02T01:00:00Z", 60),
        (target.replace("00:00:00", "00:30:00"), "2026-01-02T01:00:00Z", 100),
    ])
    db.commit()


def test_cutoff_inclusive_and_future_excluded(db):
    seed(db[0])
    result = forecast(db[0], date(2026, 1, 1), "09:00")
    assert result["points"][0]["forecast_mw"] == 100
    assert result["points"][0]["actual_mw"] == 80
    assert result["points"][0]["error_mw"] == 20
    assert result["points"][0]["publish_times"] == ["2026-01-01T09:00:00Z"]
    assert result["metrics"]["valid_pairs"] == 1
    assert result["metrics"]["expected_pairs"] == 24
    assert forecast(db[0], date(2026, 1, 1), "08:59")["points"][0]["forecast_mw"] == 80


def test_missing_actual_half_hour_excludes_pair_but_not_forecast(db):
    seed(db[0])
    db[0].execute("DELETE FROM actuals WHERE start_time LIKE '%00:30:00Z'")
    result = forecast(db[0], date(2026, 1, 1), "09:00")
    assert result["points"][0]["forecast_mw"] == 100
    assert result["points"][0]["actual_mw"] is None
    assert result["metrics"]["mae_mw"] is None
    assert result["metrics"]["coverage_percent"] == 0


def test_no_eligible_forecast_never_substitutes_later_revision(db):
    seed(db[0])
    result = forecast(db[0], date(2026, 1, 1), "00:00")
    assert result["forecast_coverage"] == 0
    assert result["points"][0]["actual_mw"] == 80
    assert result["points"][0]["error_mw"] is None


def test_half_hour_forecasts_select_revisions_then_average(db):
    seed(db[0])
    db[0].execute("UPDATE metadata SET value = ? WHERE key='forecast_interval_minutes'", (json.dumps(30),))
    db[0].executemany("INSERT INTO forecasts VALUES (?, ?, ?)", [
        ("2026-01-02T00:30:00Z", "2026-01-01T08:30:00Z", 140),
        ("2026-01-02T00:30:00Z", "2026-01-01T10:00:00Z", 999),
    ])
    result = forecast(db[0], date(2026, 1, 1), "09:00")
    assert result["points"][0]["forecast_mw"] == 120
    assert result["points"][0]["error_mw"] == 40
    assert len(result["points"][0]["publish_times"]) == 2
    db[0].execute("DELETE FROM forecasts WHERE start_time LIKE '%00:30:00Z'")
    assert forecast(db[0], date(2026, 1, 1), "09:00")["points"][0]["forecast_mw"] is None


def test_month_boundary_and_stale_flag(db):
    target = "2026-02-01T00:00:00Z"
    db[0].execute("INSERT INTO forecasts VALUES (?, ?, ?)", (target, "2026-01-30T20:00:00Z", 50))
    result = forecast(db[0], date(2026, 1, 31), "09:00")
    assert result["delivery_date"] == "2026-02-01"
    assert result["points"][0]["start_time"] == target
    assert result["points"][-1]["start_time"] == "2026-02-01T23:00:00Z"
    assert result["points"][0]["forecast_age_hours"] == 13
    assert result["stale_hours"] == 1


def test_metrics_hand_calculated_and_zero_is_valid():
    result = metrics([{"error_mw": 0}, {"error_mw": -3}, {"error_mw": 9}, {"error_mw": None}])
    assert result["mae_mw"] == 4
    assert result["rmse_mw"] == pytest.approx(sqrt(30))
    assert result["bias_mw"] == 2
    assert result["coverage_percent"] == 75
    assert metrics([])["bias_mw"] is None


def test_accuracy_uses_same_daily_cutoff_and_counts_gaps(db):
    seed(db[0])
    result = accuracy(db[0], date(2026, 1, 1), date(2026, 1, 2), "09:00")
    assert result["metrics"]["mae_mw"] == 20
    assert result["metrics"]["expected_pairs"] == 48
    assert result["daily"][1]["mae_mw"] is None
    assert result["hourly"][0]["valid_pairs"] == 1
    assert result["hourly"][0]["expected_pairs"] == 2
