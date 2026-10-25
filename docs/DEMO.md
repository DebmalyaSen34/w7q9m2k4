# Demo guide

Target duration: five to eight minutes, with no more than five minutes per part. Show the deployed app in a clean browser. The two audiences are a utility buyer and a technical reviewer.

## Part one Customer walkthrough

1. **Purpose (30 seconds).** Windward answers two questions: what wind forecast was available when we made the decision, and how accurate was that forecast? Only national Elexon wind data is used.
2. **Replay a decision (60 seconds).** Select January 15 at 09:00. Point out that delivery is January 16, the average forecast is about 7,930 MW, and all 24 hours are covered. Explain that 09:00 is configurable and assumed, not an exchange deadline.
3. **Inspect the evidence (45 seconds).** Hover a chart point and open hourly data to inspect its publication time. Change the cutoff to 05:00, showing that the app only selects revisions available then. Restore 09:00. Export the decision view as CSV if desired.
4. **Compare actuals (45 seconds).** Enable Show actuals. Explain that they were observed after the decision. On January 15, the hourly MAE is about 783 MW. The dashed line distinguishes actuals from forecasts.
5. **Assess the month (60 seconds).** Open Forecast accuracy. The January decision window has 744 matched hours at 09:00. Explain MAE of about 2,039 MW, RMSE about 2,505 MW, and positive bias about 1,748 MW. A positive bias means wind was overestimated. Inspect the daily errors and delivery-hour bias; emphasize that these are retrospective results rather than a future prediction interval.
6. **Scope (15 seconds).** National wind forecasts support analysis, but calculating a utility's purchase requirement would also need demand and contracted supply.

## Part two Technical review

1. **Architecture (45 seconds).** React/TypeScript/Vite and Recharts call three FastAPI endpoints. A read-only SQLite snapshot is bundled with the function. Docker serves the same UI and API locally; Vercel Hobby hosts the demo.
2. **Ingestion (45 seconds).** Show `scripts/ingest.py`: daily bounded requests, retry, cache, WIND filter, all relevant forecast revisions, UTC normalization, duplicate/conflict handling, cadence validation, and atomic snapshot replacement.
3. **Correctness (60 seconds).** Show `backend/analytics.py`: publication cutoff filtering occurs before per-delivery ranking. Explain hourly averages of two actual half-hours, null propagation, MAE/RMSE/bias, and coverage. Mention January 31 mapping to February 1 and the explicit 12-hour stale heuristic.
4. **Verification (45 seconds).** Show Python and browser test output or the green GitHub Actions run. Highlight tests for future-publication leakage, exact cutoff inclusion, gaps, half-hourly forecast variants, retry, mobile layout, and Docker startup.
5. **Handover (30 seconds).** Show the README startup command, API docs, dataset version, and limitations. Disclose AI assistance. End with the public app and repository links.

## Recording and submission

The generated local walkthrough is `artifacts/windward-demo.mp4` (4 minutes 46 seconds). It includes a customer overview followed by technical review and is explicitly labeled as an automated walkthrough with synthesized narration. Recreate it using `node scripts/create-demo.mjs` on macOS with FFmpeg installed and the local app running. Scene text and timings are retained in `artifacts/demo/`.

Review the video before uploading it as unlisted on YouTube. Copy the final unlisted video URL into the submission form alongside these links, then verify all three in an incognito browser:

- App: https://w7q9m2k4.vercel.app
- Repository: https://github.com/DebmalyaSen34/w7q9m2k4

YouTube upload and submission-form delivery are not performed by the demo generator.
