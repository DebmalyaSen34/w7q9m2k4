/** Generate a narrated MP4 walkthrough on macOS. Requires say, ffmpeg, Chromium. */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("artifacts/demo");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const base = process.env.BASE_URL || "http://127.0.0.1:8000";
const chapters = [];
let elapsed = 0;
const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function slide(kicker, title, body) {
  await page.setContent(
    `<html><head><style>body{margin:0;background:#f2f6ed;color:#203d30;font-family:Arial,sans-serif}main{padding:82px 100px}small{font-size:17px;letter-spacing:3px;color:#668055}h1{font-size:54px;letter-spacing:-2px;max-width:1100px;margin:25px 0 38px}p{font-size:26px;line-height:1.65;max-width:1100px;margin:20px 0}strong{color:#2f7147}pre{background:#19392d;color:#d3e8c3;padding:28px;border-radius:12px;font-size:21px;line-height:1.6;white-space:pre-wrap}footer{position:fixed;bottom:32px;left:100px;right:100px;display:flex;justify-content:space-between;color:#627458;font-size:16px}</style></head><body><main><small>${kicker}</small><h1>${title}</h1>${body}</main><footer><span>Windward · January 2026</span><span>Automated walkthrough · synthesized narration</span></footer></body></html>`,
  );
}

async function app() {
  await page.goto(base);
  await page
    .getByTestId("delivery-date")
    .filter({ hasText: "16 Jan" })
    .waitFor();
  await page.evaluate(() => {
    document.body.style.zoom = "0.82";
  });
  await page.evaluate(() => document.fonts.ready);
}

async function capture(title, narration) {
  const index = chapters.length + 1;
  const prefix = resolve(output, String(index).padStart(2, "0"));
  await page.screenshot({ path: prefix + ".png" });
  writeFileSync(prefix + ".txt", narration);
  execFileSync("say", [
    "-v",
    "Daniel",
    "-r",
    "155",
    "-f",
    prefix + ".txt",
    "-o",
    prefix + ".aiff",
  ]);
  const duration =
    Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=nw=1:nk=1",
          prefix + ".aiff",
        ],
        { encoding: "utf8" },
      ).trim(),
    ) + 0.8;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    prefix + ".png",
    "-i",
    prefix + ".aiff",
    "-t",
    String(duration),
    "-vf",
    "format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-tune",
    "stillimage",
    "-crf",
    "23",
    "-r",
    "15",
    "-af",
    "apad",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    prefix + ".mp4",
  ]);
  chapters.push({ title, start: elapsed, duration, file: prefix + ".mp4" });
  elapsed += duration;
  console.log(`Rendered ${title}: ${Math.round(duration)} seconds`);
}

try {
  await slide(
    "PART ONE · CUSTOMER OVERVIEW",
    "A clearer view of tomorrow.",
    "<p><strong>What wind forecast was available at the decision cutoff?</strong></p><p><strong>How accurate was it when the power was delivered?</strong></p><p>Real Elexon national wind data. January 2026 decisions.<br>Configurable cutoffs. Traceable forecast revisions.</p>",
  );
  await capture(
    "Customer overview",
    "Welcome to Windward. This automated walkthrough uses synthesized narration. The application answers two questions for an electricity buyer: what wind forecast was available when the decision was made, and how accurate was it when power was delivered? The pilot uses real Elexon national wind data for January twenty twenty six. Every forecast selection is traceable to its publication time. This is historical decision analysis, not a live trading system.",
  );
  await app();
  await capture(
    "Replay a decision",
    "The day ahead outlook starts with a decision date and a configurable cutoff. January fifteenth maps to delivery on January sixteenth. The default is nine AM UK time, clearly identified as an assumption rather than an exchange deadline. Here, average forecast wind generation is about seven thousand nine hundred and thirty megawatts, with forecasts available for all twenty four delivery hours. The chart shows the next day profile. Forecast freshness counts hours using publications older than twelve hours at the cutoff.",
  );
  await page.getByLabel("Decision cutoff").fill("05:00");
  await page.getByText("Available by 05:00 UK").waitFor();
  await page.getByText("Explore hourly data").click();
  await page.locator(".data-table").scrollIntoViewIfNeeded();
  await capture(
    "Audit publication times",
    "Changing the cutoff to five AM replays the information available earlier that morning. The hourly table shows the chosen forecast and its publication time for every delivery hour. A revision published after the cutoff is never substituted, even if it would be more accurate. This prevents hindsight from making historical forecasts look better than they actually were. Missing forecasts stay missing rather than becoming zero. The same data can be exported as a CSV for further review.",
  );
  await app();
  await page.getByLabel("Show actuals").check();
  await page.locator(".forecast-panel").scrollIntoViewIfNeeded();
  await capture(
    "Compare delivered generation",
    "Actual generation is hidden by default because it was not known at the decision cutoff. Switching it on reveals a dashed comparison line and a retrospective error summary. For this decision day, mean absolute error is about seven hundred and eighty three megawatts. The application averages both half hourly actual readings into each hour. If either constituent reading is missing, that hour is excluded from accuracy calculations, and the coverage count makes the gap visible.",
  );
  await page.getByRole("button", { name: "Forecast accuracy" }).click();
  await page
    .getByText("744 hours have complete pairs", { exact: false })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(
    "Evaluate the January record",
    "The accuracy view evaluates the same cutoff independently across the selected decision dates. At nine AM, all seven hundred and forty four delivery hours have complete comparisons. Mean absolute error is about two thousand and thirty nine megawatts. Root mean square error is about two thousand five hundred and five, giving larger misses more weight. Positive bias of about one thousand seven hundred and forty eight means wind was overestimated on average. The daily chart and delivery hour breakdown help locate patterns. These retrospective metrics are not future prediction intervals, and national wind data alone cannot determine a utility purchase volume.",
  );
  await slide(
    "PART TWO · TECHNICAL REVIEW",
    "A small, reproducible full stack.",
    "<p><strong>React + TypeScript + Vite + Recharts</strong><br>Controls, charts, data tables and explicit loading/error states.</p><p><strong>Python + FastAPI</strong><br>Forecast replay, date-range accuracy and health endpoints.</p><p><strong>Read-only SQLite snapshot</strong><br>1,488 actual readings · 17,864 forecast revisions.</p><p>Vercel hosts the demo. Docker serves the same UI and API locally.</p>",
  );
  await capture(
    "Architecture",
    "For the technical review, the frontend is React and TypeScript, built with Vite and charted with Recharts. It calls three FastAPI endpoints: forecast, accuracy, and health. The backend opens a bundled SQLite snapshot in read only mode for each request. It has one thousand four hundred and eighty eight actual readings and seventeen thousand eight hundred and sixty four forecast revisions. Requests do not contact Elexon or write to an ephemeral serverless disk. Vercel Hobby hosts the application, and the Docker image serves the same frontend build and API.",
  );
  const source = readFileSync("backend/analytics.py", "utf8");
  const sql = source.slice(
    source.indexOf("SELECT start_time"),
    source.indexOf('""", (iso(start)'),
  );
  await slide(
    "TECHNICAL REVIEW · CORRECTNESS",
    "Filter first. Rank second.",
    `<pre>${escape(sql.trim())}</pre><p>Eligible publication time ≤ cutoff. Latest revision per delivery interval.<br>Complete hourly pairs only. Error = forecast − actual.</p>`,
  );
  await capture(
    "Selection and ingestion",
    "The key correctness rule is visible in this query. We filter publication times before ranking revisions for each delivery interval. This guarantees that the selected forecast existed by the cutoff. Ingestion is a separate repeatable command using bounded daily requests, timeouts, retries, and a raw response cache. It filters actuals to wind, normalizes timestamps to UTC, removes identical duplicates, rejects conflicting keys, and validates interval cadence. Only after validation does the temporary database atomically replace the previous snapshot. A content hash and coverage report make the result auditable.",
  );
  await slide(
    "TECHNICAL REVIEW · HANDOVER",
    "Test the boundaries that matter.",
    "<p><strong>29 Python tests</strong><br>Cutoff inclusion, future-revision exclusion, gaps, aggregation,<br>month boundaries, metrics, retries and read-only storage.</p><p><strong>5 browser scenarios</strong><br>Filters, actuals toggle, error recovery, missing data and mobile layout.</p><p><strong>Reproducible delivery</strong><br>README, API documentation, Docker, CI and real source data.</p><p>AI-assisted implementation. Explicit assumptions and limitations.</p>",
  );
  await capture(
    "Verification and handover",
    "Twenty nine Python tests and five browser scenarios pass locally. They check cutoff boundaries, future revision exclusion, missing constituents, hand calculated metrics, the January to February transition, input validation, network retries, and read only storage. Browser checks cover changing filters, revealing actuals, handling gaps and failed requests, retrying, and fitting a mobile viewport. The repository includes the README, architecture notes, API documentation, a Docker build and continuous integration checks. Limitations are explicit: January only, a bounded forecast lookback and actual publication buffer, and no reconstruction of when actuals were historically available. OpenAI Codex assisted with implementation and verification.",
  );
  writeFileSync(
    resolve(output, "concat.txt"),
    chapters.map((c) => `file '${c.file}'`).join("\n"),
  );
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    resolve(output, "concat.txt"),
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    resolve("artifacts/windward-demo.mp4"),
  ]);
  writeFileSync(
    resolve(output, "chapters.json"),
    JSON.stringify(chapters, null, 2),
  );
  console.log(
    `Demo ready: ${Math.round(elapsed)} seconds, artifacts/windward-demo.mp4`,
  );
} finally {
  await browser.close();
}
