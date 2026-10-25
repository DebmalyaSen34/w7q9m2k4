"""Point-in-time forecast selection. No forecast issued after a cutoff is eligible."""
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from zoneinfo import ZoneInfo

from backend.data import metadata

UK = ZoneInfo("Europe/London")
FIRST_DATE = date(2026, 1, 1)
LAST_DATE = date(2026, 1, 31)


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def metrics(points):
    errors = [point["error_mw"] for point in points if point["error_mw"] is not None]
    count = len(errors)
    return {
        "mae_mw": sum(abs(e) for e in errors) / count if count else None,
        "rmse_mw": sqrt(sum(e * e for e in errors) / count) if count else None,
        "bias_mw": sum(errors) / count if count else None,
        "valid_pairs": count,
        "expected_pairs": len(points),
        "coverage_percent": count / len(points) * 100 if points else 0,
    }


def forecast(connection, decision_date: date, cutoff: str):
    cutoff_at = datetime.combine(decision_date, time.fromisoformat(cutoff), UK)
    delivery = decision_date + timedelta(days=1)
    start = datetime.combine(delivery, time.min, UK)
    end = start + timedelta(days=1)
    info = metadata(connection)
    cadence = info["forecast_interval_minutes"]
    if cadence not in (30, 60):
        raise ValueError("Unsupported forecast interval")
    actuals = {r["start_time"]: r["generation"] for r in connection.execute(
        "SELECT * FROM actuals WHERE start_time >= ? AND start_time < ?", (iso(start), iso(end))
    )}
    selected = {r["start_time"]: dict(r) for r in connection.execute("""
        SELECT start_time, publish_time, generation FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY start_time ORDER BY publish_time DESC) AS rank
          FROM forecasts WHERE start_time >= ? AND start_time < ? AND publish_time <= ?
        ) WHERE rank = 1
    """, (iso(start), iso(end), iso(cutoff_at)))}
    points = []
    for hour in range(24):
        target = start + timedelta(hours=hour)
        actual_parts = [actuals.get(iso(target + timedelta(minutes=m))) for m in (0, 30)]
        forecast_parts = [selected.get(iso(target + timedelta(minutes=m))) for m in range(0, 60, cadence)]
        actual = sum(actual_parts) / 2 if all(v is not None for v in actual_parts) else None
        predicted = (sum(v["generation"] for v in forecast_parts) / len(forecast_parts)
                     if all(v is not None for v in forecast_parts) else None)
        publications = sorted({v["publish_time"] for v in forecast_parts if v is not None})
        ages = [(cutoff_at - datetime.fromisoformat(p)).total_seconds() / 3600 for p in publications]
        points.append({
            "start_time": iso(target), "hour": target.strftime("%H:%M"),
            "forecast_mw": predicted, "actual_mw": actual,
            "error_mw": predicted - actual if predicted is not None and actual is not None else None,
            "publish_times": publications, "forecast_age_hours": max(ages) if ages else None,
            "stale": max(ages) > 12 if ages else False,
        })
    values = [p["forecast_mw"] for p in points if p["forecast_mw"] is not None]
    return {
        "decision_date": decision_date.isoformat(), "delivery_date": delivery.isoformat(),
        "cutoff": cutoff, "cutoff_at": iso(cutoff_at), "timezone": "Europe/London", "unit": "MW",
        "points": points, "metrics": metrics(points),
        "forecast_coverage": len(values), "stale_hours": sum(p["stale"] for p in points),
        "mean_forecast_mw": sum(values) / len(values) if values else None,
        "peak_forecast_mw": max(values) if values else None,
        "dataset": info,
    }


def accuracy(connection, first: date, last: date, cutoff: str):
    days = []
    points = []
    by_hour = [[] for _ in range(24)]
    current = first
    while current <= last:
        result = forecast(connection, current, cutoff)
        days.append({"decision_date": current.isoformat(), "delivery_date": result["delivery_date"], **result["metrics"]})
        points.extend(result["points"])
        for i, point in enumerate(result["points"]):
            by_hour[i].append(point)
        current += timedelta(days=1)
    return {
        "from": first.isoformat(), "to": last.isoformat(), "cutoff": cutoff,
        "timezone": "Europe/London", "unit": "MW", "metrics": metrics(points), "daily": days,
        "hourly": [{"hour": f"{i:02d}:00", **metrics(p)} for i, p in enumerate(by_hour)],
        "dataset": metadata(connection),
    }
