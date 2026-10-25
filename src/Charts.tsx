import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Accuracy, Point } from "./types";
import { day, number, published } from "./api";

const grid = "#e8ede9";
const green = "#357852";
const blue = "#527dba";
const axis = { fill: "#64736c", fontSize: 12 };

function ForecastTooltip({
  active,
  payload,
  showActuals,
}: {
  active?: boolean;
  payload?: readonly { payload: Point }[];
  showActuals: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{point.hour} UK · hourly average</strong>
      <p>
        Forecast <b>{number(point.forecast_mw)} MW</b>
      </p>
      {showActuals && (
        <p>
          Actual <b>{number(point.actual_mw)} MW</b>
        </p>
      )}
      <small>
        {point.publish_times.length
          ? `Published ${point.publish_times.map(published).join(" / ")} UK`
          : "No forecast available at cutoff"}
      </small>
    </div>
  );
}

export function ForecastChart({
  points,
  showActuals,
}: {
  points: Point[];
  showActuals: boolean;
}) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Hourly wind forecast in megawatts. Exact values and publication times are available in the data table below."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 15, right: 12, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="forecast-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8bbf87" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#8bbf87" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
          <XAxis
            dataKey="hour"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
            dy={10}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(value) => number(value)}
            domain={[0, "auto"]}
          />
          <Tooltip content={<ForecastTooltip showActuals={showActuals} />} />
          <Area
            name="Forecast"
            type="linear"
            dataKey="forecast_mw"
            stroke={green}
            strokeWidth={2.5}
            fill="url(#forecast-fill)"
            connectNulls={false}
            isAnimationActive={false}
          />
          {showActuals && (
            <Line
              name="Actual generation"
              type="linear"
              dataKey="actual_mw"
              stroke={blue}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ daily }: { daily: Accuracy["daily"] }) {
  return (
    <div
      className="chart small"
      role="img"
      aria-label="Daily mean absolute error in megawatts"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={daily}
          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
          <XAxis
            dataKey="decision_date"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={35}
            tickFormatter={(v) => day(v, true)}
          />
          <YAxis width={55} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => [`${number(Number(value), 1)} MW`, "MAE"]}
            labelFormatter={(v) => `Decision ${day(String(v), true)}`}
          />
          <Area
            type="linear"
            dataKey="mae_mw"
            stroke={green}
            strokeWidth={2}
            fill="#eef5e9"
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlyChart({ hourly }: { hourly: Accuracy["hourly"] }) {
  return (
    <div
      className="chart small"
      role="img"
      aria-label="Signed forecast bias by delivery hour in megawatts"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={hourly}
          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
          <XAxis
            dataKey="hour"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={25}
          />
          <YAxis width={55} tick={axis} tickLine={false} axisLine={false} />
          <ReferenceLine y={0} stroke="#91a298" />
          <Tooltip
            formatter={(value) => [`${number(Number(value), 1)} MW`, "Bias"]}
            labelFormatter={(v) => `${v} UK`}
          />
          <Bar
            dataKey="bias_mw"
            fill="#79998b"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
