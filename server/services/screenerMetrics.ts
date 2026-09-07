import type { StockMetrics } from "../../shared/api";

/**
 * Screener metric-filter vocabulary + evaluation.
 *
 * Pure logic shared by the Express screener route and unit tests. The
 * `_router.js` Vercel twin carries its own JS copy (the serverless
 * bundler cannot import TS), but must stay behavior-identical to this
 * module — see `api/_router.js` `handleScreenerFundamentalFilter`.
 *
 * Every extractor reads a field already normalized at the
 * `/api/stock-metrics` boundary (Yahoo `quoteSummary` modules), so a
 * screen's semantics match the rest of the app and require no new
 * provider calls. Units mirror the app's conventions: percentage fields
 * are percent units (12.5 = 12.5%), ratios are unit-free, multiples are
 * `x`.
 */

export type NumericRange = { min?: number; max?: number };
export type MetricFilterMap = Record<string, NumericRange>;

export interface ScreenerMetricFilterDef {
  id: string;
  section: "metrics" | "ratios";
  field: string;
  unit: "x" | "percent" | "ratio";
  step: number;
}

export const SCREENER_METRIC_FILTERS: ScreenerMetricFilterDef[] = [
  { id: "pe", section: "metrics", field: "peRatioTTM", unit: "x", step: 1 },
  {
    id: "pb",
    section: "metrics",
    field: "priceToBookRatioTTM",
    unit: "x",
    step: 0.1,
  },
  {
    id: "peg",
    section: "ratios",
    field: "priceToEarningsGrowthRatioTTM",
    unit: "x",
    step: 0.1,
  },
  {
    id: "evEbitda",
    section: "metrics",
    field: "evToEBITDATTM",
    unit: "x",
    step: 1,
  },
  {
    id: "evSales",
    section: "metrics",
    field: "evToSalesTTM",
    unit: "x",
    step: 1,
  },
  {
    id: "dividendYield",
    section: "metrics",
    field: "dividendYieldTTM",
    unit: "percent",
    step: 0.5,
  },
  {
    id: "grossMargin",
    section: "ratios",
    field: "grossProfitMarginTTM",
    unit: "percent",
    step: 1,
  },
  {
    id: "netMargin",
    section: "ratios",
    field: "netProfitMargin",
    unit: "percent",
    step: 1,
  },
  {
    id: "operatingMargin",
    section: "ratios",
    field: "operatingProfitMarginTTM",
    unit: "percent",
    step: 1,
  },
  {
    id: "roe",
    section: "metrics",
    field: "returnOnEquityTTM",
    unit: "percent",
    step: 1,
  },
  {
    id: "roa",
    section: "metrics",
    field: "returnOnAssetsTTM",
    unit: "percent",
    step: 1,
  },
  {
    id: "currentRatio",
    section: "ratios",
    field: "currentRatio",
    unit: "ratio",
    step: 0.1,
  },
  {
    id: "debtEquity",
    section: "ratios",
    field: "debtToEquityRatio",
    unit: "ratio",
    step: 0.1,
  },
  {
    id: "fcfYield",
    section: "metrics",
    field: "freeCashFlowYieldTTM",
    unit: "percent",
    step: 0.5,
  },
];

export const SCREENER_METRIC_FILTER_IDS: string[] = SCREENER_METRIC_FILTERS.map(
  (d) => d.id,
);

/** Pull one filter's value out of a StockMetrics snapshot. */
export function screenerMetricValue(
  metrics: StockMetrics,
  def: ScreenerMetricFilterDef,
): number | undefined {
  const section = def.section === "metrics" ? metrics.metrics : metrics.ratios;
  if (!section) return undefined;
  const v = (section as Record<string, unknown>)[def.field];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Any active filter (min or max set) with a missing value fails the row. */
export function matchesMetricFilters(
  metrics: StockMetrics,
  filters: MetricFilterMap,
): boolean {
  for (const def of SCREENER_METRIC_FILTERS) {
    const range = filters[def.id];
    if (!range) continue;
    const { min, max } = range;
    if (min === undefined && max === undefined) continue;
    const v = screenerMetricValue(metrics, def);
    // A screen must never silently include a row it couldn't evaluate —
    // an active filter with no value means "does not qualify".
    if (v === undefined) return false;
    if (min !== undefined && v < min) return false;
    if (max !== undefined && v > max) return false;
  }
  return true;
}

/** True when at least one numeric metric filter is active. */
export function hasActiveMetricFilters(filters: MetricFilterMap): boolean {
  return Object.values(filters).some(
    (r) => r && (r.min !== undefined || r.max !== undefined),
  );
}

/**
 * Parse a single `id=min:max` filter param (e.g. `pe=5:20`, `roe=:15`).
 * Returns `{ min?, max? }` or undefined when neither bound parses.
 */
export function parseMetricFilterParam(raw: string): NumericRange | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const [minStr, maxStr] = raw.split(":");
  const parse = (s: string | undefined): number | undefined => {
    if (s === undefined || s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const min = parse(minStr);
  const max = parse(maxStr);
  if (min === undefined && max === undefined) return undefined;
  return { min, max };
}

/** Extract the metric values a response row should carry (by filter id). */
export function buildMetricValues(
  metrics: StockMetrics,
): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const def of SCREENER_METRIC_FILTERS) {
    out[def.id] = screenerMetricValue(metrics, def);
  }
  return out;
}

/** Bounded parallel runner — never exceeds `concurrency` in flight. */
export async function runConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: n }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}