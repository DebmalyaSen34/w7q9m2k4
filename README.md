# Windward

A historical wind forecast dashboard for UK day-ahead electricity decisions in January 2026. Explore what was known at a selected cutoff, then compare that forecast with delivered wind generation.

**Live app:** https://w7q9m2k4.vercel.app  
**Public repository:** https://github.com/DebmalyaSen34/w7q9m2k4  
**API documentation:** https://w7q9m2k4.vercel.app/api/docs

**Stack:** React 19, TypeScript, Vite, Recharts, Python/FastAPI, SQLite. The deployed application reads a bundled real Elexon snapshot. No API key, external database, paid service, or scheduled job is required.

## Run locally

Requires Node 22.12+ and Python 3.12+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci
npm run build
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. The checked-in snapshot makes the app usable immediately without contacting Elexon. For frontend development, run `npm run dev` in a second terminal; Vite proxies `/api` to port 8000.

## Docker

```bash
docker compose up --build
```

Open http://localhost:8000. The multi-stage image builds React, serves it with FastAPI, runs as an unprivileged user, and uses a read-only root filesystem under Compose. `PORT` can be set for other container platforms. CI builds and smoke-tests the container.

## Data and reproducibility

```bash
# Resume downloaded daily batches, or download them if absent
.venv/bin/python -m scripts.ingest
# Explicitly obtain fresh responses instead of reusing the cache
.venv/bin/python -m scripts.ingest --refresh
```

Ingestion uses Elexon's public stream endpoints:

- [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream): actual readings filtered to WIND.
- [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream): all returned forecast revisions relevant to the delivery window.

Requests use `publishDateTimeFrom` and `publishDateTimeTo`, one day per request. Forecast publications run from December 29, 2025 through January 31, 2026. Actual publications are fetched from January 2 through February 4, allowing a three-day trailing publication buffer. Records are then filtered to deliveries from January 2 through February 1. Actuals are the latest versions **within those fetched publication batches**; subsequent corrections outside the buffer are not reconstructed.

The supplied snapshot contains 1,488 actual readings and 17,864 forecast revisions. Ingestion confirms 60-minute forecast spacing and 30-minute actual spacing, removes identical duplicates, rejects conflicting delivery/publication keys, and rejects invalid or mixed-grid records. It atomically replaces the snapshot only after validation. Raw responses are cached under ignored `data/raw/`; `data/wind.report.json` records coverage and the baseline metrics. The content hash identifies the normalized data independently of build time. `retrieved_at` is the most recent raw-batch download; `built_at` records snapshot assembly.

At 09:00 UK, the bundled snapshot has 744/744 matched hourly pairs, MAE **2,038.9 MW**, RMSE **2,504.8 MW**, and bias **+1,747.9 MW**. These are retrospective results over this exact period and data definition, not future uncertainty estimates.

## Calculation rules

- Decision dates are January 1–31. Delivery dates are the next calendar day, including February 1.
- The user selects a cutoff in `Europe/London`; default 09:00 is an explicit assumption, not an exchange deadline. January uses GMT. Storage and API timestamps use UTC.
- Select the latest forecast whose publication time is **at or before** the cutoff for each delivery interval. No later revision is substituted.
- Treat hourly forecast MW as the representative value for that delivery hour. Average both half-hourly actual MW readings. For a half-hourly forecast dataset, select each half-hour's eligible revision before averaging.
- Every constituent interval must exist. Gaps remain null, and incomplete hours do not enter metrics. Zero is a valid reading.
- Error = forecast − actual. MAE = mean absolute error; RMSE = square root of mean squared error; bias = mean signed error. Positive bias means overforecasting.
- Stale means the oldest constituent forecast was published more than 12 hours before the cutoff. This is a UI heuristic, not an Elexon quality flag.
- The accuracy view applies the same cutoff independently to every decision day. Actuals are retrospective outturn observations; historical actual-publication availability is not replayed.

National wind data alone cannot determine a utility's purchase volume. The app contains no demand, prices, trading integration, model training, or probabilistic forecast claims.

## Project layout

| Location | Responsibility |
| --- | --- |
| `src/` | Dashboard views, charts, request lifecycle, responsive styles, and API types |
| `backend/` | FastAPI routes, indexed read-only SQLite access, forecast selection and metrics |
| `api/index.py` | Vercel ASGI entry point |
| `scripts/ingest.py` | Retriable ingestion, validation, deduplication, snapshot/report generation |
| `data/` | Bundled SQLite snapshot and coverage report |
| `tests/`, `e2e/` | Python correctness tests and Playwright browser scenarios |
| `docs/` | Architecture and demo handover |
| `Dockerfile`, `compose.yaml`, `vercel.json` | Local container and Vercel deployment configuration |

## API

Interactive OpenAPI documentation is at `/api/docs`.

| Route | Query | Response |
| --- | --- | --- |
| `GET /api/forecast` | `decision_date=2026-01-15&cutoff=09:00` | 24 hourly points, publication timestamps, freshness, coverage, metrics, snapshot metadata |
| `GET /api/accuracy` | `from=2026-01-01&to=2026-01-31&cutoff=09:00` | Overall, daily, and hour-of-day error metrics and paired counts |
| `GET /api/health` | none | Readiness, record counts, and snapshot version |

Invalid dates, reversed ranges, and malformed cutoffs return 422. An unavailable database returns an actionable 503. Missing observations are null; no-pair metrics are null. The API opens SQLite in read-only mode and logs method, route, status, and duration. Set `WIND_DB_PATH` only to use a different local snapshot.

## Verify

```bash
.venv/bin/python -m pytest -q
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start a local FastAPI server automatically. Set `BASE_URL=https://your-deployment.vercel.app` to test a deployed app in fresh browser contexts. Scenarios include date and cutoff changes, actuals visibility, accuracy filters, missing values, failed requests and retry, and mobile overflow. Python tests cover leakage prevention, interval aggregation, missing data, null metrics, exact cutoff inclusion, month boundaries, stale values, ingestion validation, retries, API validation, and read-only database access.

## Deployment

Vercel serves the Vite build and routes `/api/*` to the Python function. `data/wind.sqlite` is explicitly included in the function bundle. Each request opens a local read-only connection; no filesystem writes or Elexon network calls occur during requests. To update data, run ingestion, review its report, test, and redeploy.

Use a personal Vercel Hobby project for this challenge demo. A client production service requires a separate hosting/usage assessment. Keep the public production deployment reachable without authentication for review; preview protection can remain enabled.

## AI use

OpenAI Codex assisted with implementation, tests, documentation, and verification. The dataset was downloaded from Elexon; it is not synthetic. The demo recording is an automated walkthrough and any generated narration is identified as such.

## Demo

See [the demo guide](docs/DEMO.md) for a customer walkthrough followed by technical review, kept below ten minutes. The source challenge document is excluded from Git and deployment bundles.

To recreate the narrated MP4 on macOS, start the app and run `node scripts/create-demo.mjs` (requires FFmpeg, the macOS Daniel voice, and Playwright Chromium). The output is `artifacts/windward-demo.mp4`, with scene images, narration text, and chapter timing under `artifacts/demo/`. It is an automated walkthrough with synthesized narration, not a recording of the candidate. Review it before uploading to YouTube as unlisted; the script does not publish or submit it.
