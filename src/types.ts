export interface Metrics {
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  valid_pairs: number;
  expected_pairs: number;
  coverage_percent: number;
}
export interface Dataset {
  version: string;
  retrieved_at: string;
  forecast_interval_minutes: number;
  missing_actual_periods: string[];
  stale_threshold_hours: number;
}
export interface Point {
  start_time: string;
  hour: string;
  forecast_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  publish_times: string[];
  forecast_age_hours: number | null;
  stale: boolean;
}
export interface Forecast {
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  cutoff_at: string;
  points: Point[];
  metrics: Metrics;
  forecast_coverage: number;
  stale_hours: number;
  mean_forecast_mw: number | null;
  peak_forecast_mw: number | null;
  dataset: Dataset;
}
export interface Accuracy {
  from: string;
  to: string;
  cutoff: string;
  metrics: Metrics;
  daily: (Metrics & { decision_date: string; delivery_date: string })[];
  hourly: (Metrics & { hour: string })[];
  dataset: Dataset;
}
