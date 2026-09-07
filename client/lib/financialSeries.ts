/**
 * client/lib/financialSeries.ts
 *
 * Shared series-shaping helpers for the Stocknest-style financial chart
 * cards and the expanded chart modal. One source of truth for:
 *
 *   - the per-metric bar color ladder (Revenue green, Gross Profit blue, ...)
 *   - frequency models: annual / quarterly / TTM (rolling 4-quarter sum for
 *     flow statements, latest-quarter point for balance-sheet stocks)
 *   - range windows (2Y / 5Y / 10Y / All) sliced off the END of a series
 *   - per-period YoY % points for the modal's YoY toggle
 *   - compact x-axis labels ("Q2 2025" → "Q2 '25", "FY 2024" → "2024")
 *
 * Pure functions only — no React, no fetching. The callers (InsightsCard,
 * ChartModal, Index.tsx) feed in the annual `metric.data` array and the
 * quarterly statements payload from `useStockFinancials(ticker, { period:
 * "quarter" })` and get back display-ready points.
 */

import { metricStatementKey, projectMetricSeries } from "@/lib/finance";

export type ChartFrequency = "quarterly" | "annual" | "ttm";
export type ChartRange = "2Y" | "5Y" | "10Y" | "All";

export const CHART_RANGES: readonly ChartRange[] = ["2Y", "5Y", "10Y", "All"];
export const CHART_FREQUENCIES: readonly ChartFrequency[] = [
  "quarterly",
  "annual",
  "ttm",
];

/** Years covered by a finite range; `All` returns Infinity. */
export function rangeYears(range: ChartRange): number {
  switch (range) {
    case "2Y":
      return 2;
    case "5Y":
      return 5;
    case "10Y":
      return 10;
    default:
      return Infinity;
  }
}

/** Period count a range maps to for a given frequency (quarters = years×4). */
export function rangePeriodCount(
  range: ChartRange,
  frequency: ChartFrequency,
): number {
  const years = rangeYears(range);
  if (!Number.isFinite(years)) return Infinity;
  return frequency === "annual" ? years : years * 4;
}

/** i18n key for the frequency badge / tab label. */
export function frequencyLabelKey(frequency: ChartFrequency): string {
  switch (frequency) {
    case "quarterly":
      return "chart.quarterly";
    case "ttm":
      return "chart.ttm";
    default:
      return "chart.annual";
  }
}

/**
 * Compact x-axis label. Provider dates arrive as "Q2 2025" (projected
 * quarters) or "FY 2024"/"2024" (annual). Stocknest's axis reads "Q2 '25",
 * and annual bars read as the bare year — compress accordingly and leave
 * anything else untouched.
 */
export function compactPeriodLabel(date: string): string {
  const quarter = /^(Q[1-4])\s+(\d{4})$/.exec(date);
  if (quarter) return `${quarter[1]} '${quarter[2].slice(-2)}`;
  const fiscal = /^FY\s+(\d{4})$/.exec(date);
  if (fiscal) return fiscal[1];
  return date;
}

/**
 * Compact y-axis readout. Values arrive pre-scaled to the metric's unit
 * (billions for "B", raw per-share dollars for "$"), so this only formats —
 * it never rescales.
 */
export function formatAxisValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) {
    if (unit === "B") return "0B";
    if (unit === "$") return "$0";
    if (unit === "%") return "0%";
    return "0";
  }
  if (unit === "%") return `${Math.round(value)}%`;
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  const rounded = value.toFixed(digits);
  if (unit === "B") return `${rounded}B`;
  if (unit === "$") return `$${rounded}`;
  return `${rounded}${unit || ""}`;
}

/**
 * Per-metric bar color, expressed against the design-token CSS variables so
 * cards, modal, and legend always agree. Mirrors Stocknest's semantic
 * ladder (Revenue green, Gross Profit blue, Operating Income orange, ...)
 * mapped onto Vantage's chart tokens. Falls back through the legacy
 * `FinancialMetric.color` name before landing on amber.
 */
const METRIC_CHART_COLORS: Record<string, string> = {
  "insights.revenue": "hsl(var(--chart-green))",
  "insights.ebitda": "hsl(var(--chart-cyan))",
  "insights.grossProfit": "hsl(var(--chart-blue))",
  "insights.operatingIncome": "hsl(var(--chart-orange))",
  "insights.netIncome": "hsl(var(--chart-purple))",
  "insights.eps": "hsl(var(--chart-pink))",
  "insights.cashAndEquivalents": "hsl(var(--chart-amber))",
  "insights.totalAssets": "hsl(var(--chart-accent))",
  // Free cash flow — cash-generated, so it shares the cash-family amber.
  "insights.fcf": "hsl(var(--chart-amber))",
};

const LEGACY_COLOR_FALLBACK: Record<string, string> = {
  green: "hsl(var(--chart-green))",
  blue: "hsl(var(--chart-blue))",
  purple: "hsl(var(--chart-purple))",
  orange: "hsl(var(--chart-orange))",
  pink: "hsl(var(--chart-pink))",
  cyan: "hsl(var(--chart-cyan))",
  amber: "hsl(var(--chart-amber))",
};

export function metricChartColor(
  metricId: string,
  legacyColor?: string,
): string {
  return (
    METRIC_CHART_COLORS[metricId] ??
    (legacyColor ? LEGACY_COLOR_FALLBACK[legacyColor] : undefined) ??
    "hsl(var(--chart-accent))"
  );
}

/**
 * Balance-sheet rows are point-in-time stocks of value — a "TTM cash" bar is
 * just the latest quarter's balance, not a sum. Income/cash-flow rows are
 * flows, where TTM = trailing 4 quarters summed.
 */
export function metricIsStockVariable(metricName: string): boolean {
  return metricStatementKey(metricName)?.statement === "balance";
}

type StatementsLike = {
  income?: ReadonlyArray<unknown>;
  balance?: ReadonlyArray<unknown>;
  cash?: ReadonlyArray<unknown>;
} | null
  | undefined;

/**
 * Rolling-trailing-twelve-month series built from quarterly statements.
 * Flow metrics sum the trailing 4 quarters into each bar (bar i covers
 * quarters i-3..i, dated as quarter i); stock variables reuse the
 * point-in-time quarterly balances. Returns [] when fewer than four
 * quarters exist (and always for stock variables with no quarterly data),
 * signaling the caller to fall back to the annual series.
 */
export function buildTtmSeries(
  metricName: string,
  statements: StatementsLike,
): { date: string; value: number }[] {
  const quarterly = projectMetricSeries(metricName, statements);
  if (quarterly.length === 0) return [];
  if (metricIsStockVariable(metricName)) return quarterly;
  if (quarterly.length < 4) return [];
  return quarterly.slice(3).map((point, i) => ({
    date: point.date,
    value: quarterly
      .slice(i, i + 4)
      .reduce((sum, q) => (Number.isFinite(q.value) ? sum + q.value : sum), 0),
  }));
}

export interface FrequencySeries {
  points: { date: string; value: number | null }[];
  /**
   * Frequency the returned points actually represent. When the quarterly
   * source has no usable rows the annual series stands in — callers badge
   * and slice with THIS, not the requested frequency, so a TTM selection
   * can never display annual bars under a TTM badge.
   */
  effectiveFrequency: ChartFrequency;
}

/**
 * Display series for one metric at a given frequency. `annualData` is the
 * pre-built ascending series from Index.tsx (already in display units);
 * quarterly and TTM are projected from the quarterly statements payload.
 * Falls back to the annual series (with `effectiveFrequency: "annual"`)
 * whenever the finer-grained source has no usable rows, so a symbol without
 * quarterly coverage still renders.
 */
export function buildFrequencySeries({
  metricName,
  annualData,
  quarterlyStatements,
  frequency,
}: {
  metricName: string;
  annualData: ReadonlyArray<{ date: string; value: number | null }>;
  quarterlyStatements: StatementsLike;
  frequency: ChartFrequency;
}): FrequencySeries {
  if (frequency === "annual") {
    return { points: [...annualData], effectiveFrequency: "annual" };
  }
  const projected = projectMetricSeries(metricName, quarterlyStatements);
  if (frequency === "quarterly") {
    return projected.length > 0
      ? { points: projected, effectiveFrequency: "quarterly" }
      : { points: [...annualData], effectiveFrequency: "annual" };
  }
  const ttm = buildTtmSeries(metricName, quarterlyStatements);
  return ttm.length > 0
    ? { points: ttm, effectiveFrequency: "ttm" }
    : { points: [...annualData], effectiveFrequency: "annual" };
}

/** Keep the last `count` points of an ascending series (`All` = untouched). */
export function takeLast<T>(
  series: readonly T[],
  count: number,
): T[] {
  if (!Number.isFinite(count) || count >= series.length) return [...series];
  if (count <= 0) return [];
  return series.slice(-count);
}

/** Slice a series to the visible range window for its frequency. */
export function sliceSeriesByRange<T>(
  series: readonly T[],
  range: ChartRange,
  frequency: ChartFrequency,
): T[] {
  return takeLast(series, rangePeriodCount(range, frequency));
}

/**
 * Per-period YoY % points: each bar vs. the same season one year earlier.
 * Quarterly strides 4 rows (Q2 vs Q2) and TTM strides 4 windows (rolling
 * year ending Q2 '26 vs rolling year ending Q2 '25 — consecutive TTM points
 * are only one quarter apart, so a stride of 1 would compare overlapping
 * windows, not years); annual strides 1 (consecutive fiscal years). Leading
 * points without a full lookback are dropped, and non-finite / zero-baseline
 * comparisons yield no point rather than an Infinity bar.
 */
export function buildYoYPoints(
  series: readonly { date: string; value: unknown }[],
  frequency: ChartFrequency,
): { date: string; value: number }[] {
  const stride = frequency === "annual" ? 1 : 4;
  const points: { date: string; value: number }[] = [];
  for (let i = stride; i < series.length; i++) {
    const current = series[i].value;
    const prior = series[i - stride].value;
    if (
      typeof current !== "number" ||
      typeof prior !== "number" ||
      !Number.isFinite(current) ||
      !Number.isFinite(prior) ||
      prior === 0
    ) {
      continue;
    }
    points.push({
      date: series[i].date,
      value: ((current - prior) / Math.abs(prior)) * 100,
    });
  }
  return points;
}
