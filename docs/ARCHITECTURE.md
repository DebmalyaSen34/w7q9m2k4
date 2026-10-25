# Architecture and technical review

The browser sends one request per view/filter selection to FastAPI. The Python service opens the deployed SQLite snapshot in read-only mode, selects eligible forecasts, computes metrics, and returns JSON. Recharts renders the returned observations without transforming the underlying metrics. Each chart has a table alternative.

## Data model

`actuals(start_time PRIMARY KEY, publish_time, generation)` holds the latest retrieved WIND actual per half-hour. `forecasts(start_time, publish_time, generation)` has a composite primary key, preserving revisions. `metadata(key, value)` stores the source definition, interval cadence, retrieval/build timestamps, content version, and validation counts. A publication index complements the forecast primary key.

The query filters publication timestamps before applying `ROW_NUMBER() OVER (PARTITION BY start_time ORDER BY publish_time DESC)`. Filtering before ranking is essential: ranking all records and filtering afterward could discard the valid historical forecast. Canonical UTC timestamps make lexicographic database comparisons correct. Half-hour constituents are combined only after revision selection.

## Request and failure behavior

FastAPI validates dates and cutoff formatting. Unsupported ranges return 422. Database failures return 503 with recovery guidance. The frontend aborts superseded requests, discards obsolete results, times out requests after 15 seconds, and offers retry. It clears previous data when filters change to avoid displaying stale results under a new date. Missing observations remain null throughout the pipeline.

The snapshot is packaged with the app, so serverless instances do not coordinate a database, perform ingestion, or rely on mutable local storage. An open connection belongs to one request and is closed afterward. SQLite queries and aggregation run in FastAPI's synchronous handler threadpool.

## Deployment and reproducibility

Vercel routes static assets to its CDN and API paths to `api/index.py`. Docker builds the same React output and serves it through FastAPI's static mount. Dependencies are pinned; npm has a lockfile. CI runs Python tests, the production frontend build, browser tests, and a Docker smoke test. The deployment needs no secrets or paid data service.

Ingestion runs separately. It caches daily public responses, retries transient failures, normalizes timestamps, detects conflicting keys, validates cadence, and writes a temporary database. The old snapshot remains untouched if validation fails. After SQLite integrity checking succeeds, the new file replaces the old one atomically. The report summarizes default-cutoff coverage; runtime controls compute arbitrary cutoffs from preserved revisions.

## Deliberate limits

- Fixed January decision window; the date and 24-hour aggregation logic is deliberately scoped to January/GMT. Supporting other months requires DST-day tests and variable-length delivery-day handling.
- Forecast cadence is inferred from within-publication timestamp spacing and must be consistently aligned to 30 or 60 minutes. Mixed-frequency feeds fail ingestion rather than silently guessing.
- Published hourly forecast MW is treated as representative for its hour. No interpolation or statistical model is introduced.
- The forecast lookback is three days before January 1; extremely old forecasts outside that window are not recovered.
- Actual publication retrieval ends after a three-day buffer. Later corrections outside these batches are not included.
- This is historical forecast accuracy, not real-time monitoring or calibrated procurement risk. No historical monthly result is presented as information available to an earlier January decision.
