import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Info,
  Leaf,
  RefreshCw,
  Wind,
} from "lucide-react";
import { useApi, day, number, published } from "./api";
import { DailyChart, ForecastChart, HourlyChart } from "./Charts";
import type { Accuracy, Dataset, Forecast } from "./types";

function Metric({
  label,
  value,
  unit,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{note}</p>
    </article>
  );
}

function Status({
  error,
  loading,
  retry,
}: {
  error: string | null;
  loading: boolean;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="status error" role="alert">
        <Info size={24} />
        <h2>We couldn’t load this view</h2>
        <p>{error}</p>
        <button className="button" onClick={retry}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="status loading" role="status">
        <RefreshCw size={26} />
        <p>Loading the wind record…</p>
      </div>
    );
  return null;
}

function DataNote({ dataset }: { dataset: Dataset }) {
  return (
    <div className="data-note">
      <span>
        <Database size={14} /> Elexon Insights · FUELHH WIND + WINDFOR
      </span>
      <span>
        Retrieved {published(dataset.retrieved_at)} UK · Snapshot{" "}
        {dataset.version.slice(0, 8)}
      </span>
    </div>
  );
}

function downloadCsv(result: Forecast, actuals: boolean) {
  const header = [
    "Delivery time (UTC)",
    "Forecast MW",
    "Publication times (UTC)",
    ...(actuals ? ["Actual MW", "Error MW"] : []),
  ];
  const rows = result.points.map((p) => [
    p.start_time,
    p.forecast_mw ?? "",
    p.publish_times.join(" | "),
    ...(actuals ? [p.actual_mw ?? "", p.error_mw ?? ""] : []),
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `windward-${result.delivery_date}-${result.cutoff.replace(":", "")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DecisionView({
  cutoff,
  setCutoff,
}: {
  cutoff: string;
  setCutoff: (value: string) => void;
}) {
  const [decisionDate, setDecisionDate] = useState("2026-01-15");
  const [showActuals, setShowActuals] = useState(false);
  const request = useApi<Forecast>(
    `/api/forecast?decision_date=${encodeURIComponent(decisionDate)}&cutoff=${encodeURIComponent(cutoff)}`,
  );
  const result = request.data;
  const stepDate = (offset: number) => {
    const value = new Date(decisionDate + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + offset);
    setDecisionDate(value.toISOString().slice(0, 10));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE DAY-AHEAD PICTURE</div>
          <h1>A clearer view of tomorrow.</h1>
          <p>Explore the wind forecast available when the decision was made.</p>
        </div>
        <span className="period-badge">
          <CalendarDays size={15} /> January 2026 replay
        </span>
      </div>
      <section className="controls" aria-label="Forecast controls">
        <div className="date-control">
          <label htmlFor="decision-date">Decision date</label>
          <div className="input-group">
            <button
              aria-label="Previous decision day"
              disabled={decisionDate <= "2026-01-01" || !decisionDate}
              onClick={() => stepDate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <input
              id="decision-date"
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={decisionDate}
              onChange={(e) => setDecisionDate(e.target.value)}
            />
            <button
              aria-label="Next decision day"
              disabled={decisionDate >= "2026-01-31" || !decisionDate}
              onClick={() => stepDate(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="cutoff">
            Decision cutoff <span>UK time</span>
          </label>
          <div className="time-input">
            <Clock3 size={16} />
            <input
              id="cutoff"
              type="time"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
            />
          </div>
        </div>
        <div className="delivery-arrow">
          <ArrowRight size={20} />
        </div>
        <div className="delivery">
          <span>Delivery day</span>
          <strong data-testid="delivery-date">
            {result ? day(result.delivery_date, true) : "—"}
          </strong>
        </div>
        <div className="control-note">
          <Info size={15} />
          <span>
            09:00 is an assumed cutoff.
            <br />
            Adjust it to replay a different decision.
          </span>
        </div>
      </section>
      <Status {...request} />
      {result && (
        <>
          <section className="metrics" aria-label="Forecast summary">
            <Metric
              accent
              label="Average forecast"
              value={number(result.mean_forecast_mw)}
              unit="MW"
              note={`Across ${result.forecast_coverage} available delivery hours`}
            />
            <Metric
              label="Peak wind forecast"
              value={number(result.peak_forecast_mw)}
              unit="MW"
              note="Highest hourly forecast for the delivery day"
            />
            <Metric
              label="Forecast coverage"
              value={`${result.forecast_coverage}/24`}
              unit="hours"
              note={
                result.forecast_coverage === 24
                  ? "A forecast is available for every hour"
                  : "Gaps are shown where no forecast was available"
              }
            />
            <Metric
              label="Forecast freshness"
              value={String(result.stale_hours)}
              unit="stale hours"
              note="Published more than 12 hours before cutoff"
            />
          </section>
          <section className="panel forecast-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">NATIONAL WIND GENERATION</div>
                <h2>
                  Wind outlook <span>· {day(result.delivery_date, true)}</span>
                </h2>
              </div>
              <button
                className="button secondary"
                onClick={() => downloadCsv(result, showActuals)}
              >
                <ArrowDownToLine size={16} /> Export CSV
              </button>
            </div>
            <div className="chart-toolbar">
              <div className="legend">
                <span>
                  <i /> Forecast at cutoff
                </span>
                {showActuals && (
                  <span>
                    <i className="actual" /> Actual generation
                  </span>
                )}
              </div>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showActuals}
                  onChange={(e) => setShowActuals(e.target.checked)}
                />
                <span className="toggle" aria-hidden="true" />
                Show actuals
              </label>
            </div>
            <div className="axis-caption">Generation (MW)</div>
            {result.forecast_coverage === 0 ? (
              <div className="empty">
                <Wind size={28} />
                <h3>No forecast available at this cutoff</h3>
                <p>
                  Try a later cutoff. Later publications are never substituted
                  automatically.
                </p>
              </div>
            ) : (
              <ForecastChart points={result.points} showActuals={showActuals} />
            )}
            <div className="chart-footer">
              <span>Delivery hour · Europe/London (GMT)</span>
              <span>
                <Clock3 size={13} /> Available by {result.cutoff} UK on{" "}
                {day(result.decision_date, true)}
              </span>
            </div>
          </section>
          {(result.forecast_coverage < 24 || result.stale_hours > 0) && (
            <p className="notice">
              <Info size={17} /> {24 - result.forecast_coverage} hours without
              an eligible forecast; {result.stale_hours} hours use forecasts
              older than 12 hours at the cutoff. Treat gaps and stale values
              with care.
            </p>
          )}
          {showActuals && (
            <div className="retrospective">
              <span className="small-icon">
                <Activity size={19} />
              </span>
              <div>
                <strong>Retrospective comparison</strong>
                <p>
                  MAE {number(result.metrics.mae_mw, 1)} MW · Bias{" "}
                  {number(result.metrics.bias_mw, 1)} MW ·{" "}
                  {result.metrics.valid_pairs}/24 matched hours. Actuals were
                  observed after the decision.
                </p>
              </div>
            </div>
          )}
          <details className="panel data-table">
            <summary>
              Explore hourly data{" "}
              <span>Forecast values and publication history</span>
            </summary>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Hourly wind generation and eligible forecast publication times
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Delivery hour (UK)</th>
                    <th scope="col">Forecast (MW)</th>
                    {showActuals && (
                      <>
                        <th scope="col">Actual (MW)</th>
                        <th scope="col">Error (MW)</th>
                      </>
                    )}
                    <th scope="col">Published (UK)</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.points.map((point) => (
                    <tr key={point.start_time}>
                      <td>{point.hour}</td>
                      <td>{number(point.forecast_mw, 1)}</td>
                      {showActuals && (
                        <>
                          <td>{number(point.actual_mw, 1)}</td>
                          <td>{number(point.error_mw, 1)}</td>
                        </>
                      )}
                      <td>
                        {point.publish_times.map(published).join(" / ") || "—"}
                      </td>
                      <td>
                        {point.forecast_mw === null
                          ? "Missing forecast"
                          : point.stale
                            ? "Stale forecast"
                            : "Available"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <DataNote dataset={result.dataset} />
        </>
      )}
    </>
  );
}

function AccuracyView({
  cutoff,
  setCutoff,
}: {
  cutoff: string;
  setCutoff: (value: string) => void;
}) {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-01-31");
  const request = useApi<Accuracy>(
    `/api/accuracy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&cutoff=${encodeURIComponent(cutoff)}`,
  );
  const result = request.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LEARN FROM THE RECORD</div>
          <h1>Put forecast error in perspective.</h1>
          <p>
            Measure how the available forecasts compared with delivered wind.
          </p>
        </div>
        <span className="period-badge">
          <Activity size={15} /> Retrospective evaluation
        </span>
      </div>
      <section className="controls" aria-label="Accuracy controls">
        <div>
          <label htmlFor="from">First decision date</label>
          <input
            id="from"
            type="date"
            value={from}
            min="2026-01-01"
            max="2026-01-31"
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="to">Last decision date</label>
          <input
            id="to"
            type="date"
            value={to}
            min="2026-01-01"
            max="2026-01-31"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="accuracy-cutoff">
            Daily cutoff <span>UK time</span>
          </label>
          <input
            id="accuracy-cutoff"
            type="time"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
          />
        </div>
        <div className="control-note">
          <Info size={15} />
          <span>
            The same cutoff applies to every decision day.
            <br />
            Each decision is evaluated against next-day actuals.
          </span>
        </div>
      </section>
      <Status {...request} />
      {result && (
        <>
          <section className="metrics" aria-label="Accuracy summary">
            <Metric
              accent
              label="Mean absolute error"
              value={number(result.metrics.mae_mw, 1)}
              unit="MW"
              note="Typical size of the forecast error"
            />
            <Metric
              label="Root mean square error"
              value={number(result.metrics.rmse_mw, 1)}
              unit="MW"
              note="Gives greater weight to larger misses"
            />
            <Metric
              label="Signed forecast bias"
              value={number(result.metrics.bias_mw, 1)}
              unit="MW"
              note="Positive means wind was overestimated"
            />
            <Metric
              label="Comparison coverage"
              value={number(result.metrics.coverage_percent, 1)}
              unit="%"
              note={`${result.metrics.valid_pairs} of ${result.metrics.expected_pairs} hours have complete pairs`}
            />
          </section>
          {result.metrics.valid_pairs === 0 && (
            <p className="notice">
              <Info size={17} /> No complete forecast/actual pairs exist for
              this selection. Try another cutoff or date range.
            </p>
          )}
          <div className="chart-grid">
            <section className="panel">
              <div className="panel-header">
                <div className="eyebrow">ERROR THROUGH THE MONTH</div>
                <h2>Daily forecast error</h2>
                <p>Mean absolute error (MW) · by decision date</p>
              </div>
              <DailyChart daily={result.daily} />
            </section>
            <section className="panel">
              <div className="panel-header">
                <div className="eyebrow">PATTERNS WITHIN THE DAY</div>
                <h2>Bias by delivery hour</h2>
                <p>Forecast minus actual (MW) · UK time</p>
              </div>
              <HourlyChart hourly={result.hourly} />
            </section>
          </div>
          <div className="retrospective">
            <span className="small-icon">
              <Info size={20} />
            </span>
            <div>
              <strong>Read the error alongside its coverage.</strong>
              <p>
                Only complete hourly pairs enter these metrics. Missing data is
                never treated as zero. This is a retrospective assessment, not a
                prediction interval or a procurement recommendation.
              </p>
            </div>
          </div>
          <details className="panel data-table">
            <summary>
              Explore accuracy data{" "}
              <span>Daily metrics and delivery-hour breakdown</span>
            </summary>
            <div className="table-scroll">
              <table>
                <caption>By decision day</caption>
                <thead>
                  <tr>
                    <th scope="col">Decision date</th>
                    <th scope="col">Delivery date</th>
                    <th scope="col">MAE (MW)</th>
                    <th scope="col">RMSE (MW)</th>
                    <th scope="col">Bias (MW)</th>
                    <th scope="col">Matched hours</th>
                  </tr>
                </thead>
                <tbody>
                  {result.daily.map((row) => (
                    <tr key={row.decision_date}>
                      <td>{day(row.decision_date, true)}</td>
                      <td>{day(row.delivery_date, true)}</td>
                      <td>{number(row.mae_mw, 1)}</td>
                      <td>{number(row.rmse_mw, 1)}</td>
                      <td>{number(row.bias_mw, 1)}</td>
                      <td>
                        {row.valid_pairs}/{row.expected_pairs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table>
                <caption>By delivery hour (UK)</caption>
                <thead>
                  <tr>
                    <th scope="col">Hour</th>
                    <th scope="col">MAE (MW)</th>
                    <th scope="col">RMSE (MW)</th>
                    <th scope="col">Bias (MW)</th>
                    <th scope="col">Matched hours</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hourly.map((row) => (
                    <tr key={row.hour}>
                      <td>{row.hour}</td>
                      <td>{number(row.mae_mw, 1)}</td>
                      <td>{number(row.rmse_mw, 1)}</td>
                      <td>{number(row.bias_mw, 1)}</td>
                      <td>
                        {row.valid_pairs}/{row.expected_pairs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <DataNote dataset={result.dataset} />
        </>
      )}
    </>
  );
}

export default function App() {
  const [view, setView] = useState<"decision" | "accuracy">("decision");
  const [cutoff, setCutoff] = useState("09:00");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Windward home">
          <span className="brand-icon">
            <Wind size={27} />
          </span>
          windward<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">WIND INTELLIGENCE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "decision" ? "active" : ""}
            aria-current={view === "decision" ? "page" : undefined}
            onClick={() => setView("decision")}
          >
            <Wind size={19} /> Day-ahead outlook <ChevronRight size={15} />
          </button>
          <button
            className={view === "accuracy" ? "active" : ""}
            aria-current={view === "accuracy" ? "page" : undefined}
            onClick={() => setView("accuracy")}
          >
            <BarChart3 size={19} /> Forecast accuracy <ChevronRight size={15} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="scope-icon">
            <Leaf size={22} />
          </div>
          <strong>One source. A clearer picture.</strong>
          <p>
            National wind generation.
            <br />
            Grounded in Elexon data.
          </p>
          <div className="region">
            <span className="dot" /> Great Britain · MW
          </div>
        </div>
        <div className="sidebar-footer">
          JANUARY 2026 <span>HISTORICAL REPLAY</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {view === "decision" ? "Day-ahead outlook" : "Forecast accuracy"}
            </strong>
          </div>
          <span className="source-badge">
            <Check size={13} /> Elexon source data
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          {view === "decision" ? (
            <DecisionView cutoff={cutoff} setCutoff={setCutoff} />
          ) : (
            <AccuracyView cutoff={cutoff} setCutoff={setCutoff} />
          )}
          <details className="methodology">
            <summary>
              <Info size={15} /> How to read this dashboard
            </summary>
            <p>
              January 1–31 decisions map to January 2–February 1 deliveries. For
              each interval, we select the latest Elexon forecast published at
              or before the decision cutoff. Times are shown in Europe/London;
              January is GMT. The default 09:00 cutoff is an assumption, not an
              exchange deadline.
            </p>
            <p>
              Half-hourly actual MW readings are averaged into hourly values. If
              forecasts are half-hourly, eligible revisions are selected
              separately before averaging. Incomplete hours are excluded from
              error metrics. Error = forecast − actual. MAE measures average
              absolute error; RMSE emphasizes larger errors; bias measures
              systematic over- or underestimation.
            </p>
            <p>
              “Stale” means published more than 12 hours before the cutoff; it
              is an application indicator, not an Elexon quality flag. Actuals
              are retrieved outturn values and are shown only for retrospective
              analysis. National wind data alone cannot determine an individual
              utility’s purchase requirement.
            </p>
          </details>
          <footer className="page-footer">
            <span>Windward · Wind forecast intelligence</span>
            <a href="/api/docs" target="_blank" rel="noreferrer">
              API documentation <ArrowRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
