import logging
import sqlite3
import time
from contextlib import closing
from datetime import date

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import analytics
from backend.data import ROOT, connect, metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("windward")
app = FastAPI(title="Windward Wind Forecast API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def request_log(request: Request, call_next):
    started = time.monotonic()
    response = await call_next(request)
    logger.info("%s %s status=%s duration_ms=%.1f", request.method, request.url.path, response.status_code, (time.monotonic() - started) * 1000)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(sqlite3.Error)
async def database_error(request: Request, exc: sqlite3.Error):
    logger.exception("Snapshot unavailable: %s", request.url.path, exc_info=exc)
    return JSONResponse(status_code=503, content={"detail": "The wind dataset is unavailable. Run the ingestion command and redeploy, or retry after the service is restored."})


def valid_date(value: date):
    if not analytics.FIRST_DATE <= value <= analytics.LAST_DATE:
        raise HTTPException(422, "Decision dates must be between 2026-01-01 and 2026-01-31.")
    return value


cutoff_query = Query(default="09:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$", description="Decision cutoff in Europe/London, HH:MM. 09:00 is an assumption, not an exchange deadline.")


@app.get("/api/health")
def health():
    with closing(connect()) as db:
        info = metadata(db)
        counts = {name: db.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0] for name in ("forecasts", "actuals")}
        if not all(counts.values()):
            raise HTTPException(503, "The dataset has no forecast or actual records. Run ingestion.")
        return {"status": "ok", "dataset": info, "records": counts}


@app.get("/api/forecast")
def get_forecast(decision_date: date, cutoff: str = cutoff_query):
    valid_date(decision_date)
    with closing(connect()) as db:
        return analytics.forecast(db, decision_date, cutoff)


@app.get("/api/accuracy")
def get_accuracy(first: date = Query(alias="from"), last: date = Query(alias="to"), cutoff: str = cutoff_query):
    valid_date(first)
    valid_date(last)
    if first > last:
        raise HTTPException(422, "The start decision date must be on or before the end date.")
    with closing(connect()) as db:
        return analytics.accuracy(db, first, last, cutoff)


# Docker serves the same frontend build; Vercel serves dist through its CDN.
if (ROOT / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
