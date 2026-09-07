/**
 * client/lib/compareMetrics.ts
 *
 * Typed metric vocabulary for the multi-ticker Compare page — one source of
 * truth for which metrics can be compared, how each resolves a value and a
 * delta out of the per-ticker payloads (`/api/stock-financials`,
 * `/api/stock-metrics`, `/api/stock-quote`), and how to format it.
 *
 * Pure functions only — no React, no fetching. The page feeds each ticker's
 * payloads into `metric.value/change` and renders `formatCompareValue`.
 *
 * Conventions:
 *  - Statement rows are raw USD per row (FMP/Yahoo), sorted NEWEST-first
 *    before reading (the server payload order is not contractual — sort
 *    defensively by `date` desc).
 *  - Money rows display in billions (divisor 1e9).
 *  - Derived margins are percent (revenue > 0 required; else null).
 *  - TTM ratios from `/api/stock-metrics` are already normalized to percent
 *    units at the API boundary (see stockService `fmpToPercent`), so they
 *    render as-is.
 *  - `change` is YoY growth % for statement flow metrics, percentage-point
 *    change for margin rows, intraday % for quote rows, and null when not
 *    derivable (point-in-time balances, single-point TTM ratios).
 */

import type {
  BalanceSheetRow,
  CashFlowRow,
  FinancialStatements,
  IncomeStatementRow,
  StockMetrics,
  StockQuote,
} from "@shared/api";

export type CompareGroup = "revenue" | "balance" | "cashflow" | "valuation" | "market";

export type CompareUnit = "B" | "$" | "%" | "x";

export interface CompareInputs {
  statements?: FinancialStatements | null;
  metrics?: StockMetrics | null;
  quote?: StockQuote | null;
}

export interface CompareMetric {
  /** Stable id (used as React key + CSV column). */
  id: string;
  /** i18n key for the row label. */
  labelKey: string;
  group: CompareGroup;
  unit: CompareUnit;
  /** The displayed value for a ticker's payloads (null = unavailable). */
  value(inputs: CompareInputs): number | null;
  /**
   * The delta for a ticker: YoY % for statement flows, percentage-point
   * change for margins, intraday % for quote rows. Null when not derivable.
   */
  change(inputs: CompareInputs): number | null;
  /** Margin deltas are percentage-points (render "pp") not percent growth. */
  changeIsPp?: boolean;
}

/* ------------------------------------------------------------------ *
 * Row helpers (newest-first ordering)                                *
 * ------------------------------------------------------------------ */

function byDateDesc(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

function sortedRows<T extends { date: string }>(
  rows: readonly T[] | undefined,
): T[] {
  return rows ? [...rows].sort(byDateDesc) : [];
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Latest row of a statement array (newest date first), or null. */
function latest<T extends { date: string }>(
  rows: readonly T[] | undefined,
): T | null {
  return sortedRows(rows)[0] ?? null;
}

/** The row (in an array) whose reporting `date` matches, or null. */
function rowByDate<T extends { date: string }>(
  rows: readonly T[] | undefined,
  date: string,
): T | null {
  if (!rows) return null;
  return rows.find((r) => r.date === date) ?? null;
}

/** The row one period before `latest` (same array), or null. */
function prior<T extends { date: string }>(
  rows: readonly T[] | undefined,
  latestRow: T | null,
): T | null {
  if (!latestRow) return null;
  const sorted = sortedRows(rows);
  const idx = sorted.findIndex((r) => r.date === latestRow.date);
  // sorted is newest-first: the older row sits at the NEXT index.
  return idx >= 0 && idx + 1 < sorted.length ? (sorted[idx + 1] ?? null) : null;
}

/** (cur - prev) / |prev| as a signed percent; guards zero/non-finite baselines. */
function percentChange(cur: number | null, prev: number | null): number | null {
  if (
    cur === null ||
    prev === null ||
    !Number.isFinite(cur) ||
    !Number.isFinite(prev) ||
    prev === 0
  ) {
    return null;
  }
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** numerator/denominator as a percent, or null when either side is unusable. */
function marginPct(numV: number | null, denV: number | null): number | null {
  if (
    numV === null ||
    denV === null ||
    !Number.isFinite(denV) ||
    denV === 0
  ) {
    return null;
  }
  return (numV / denV) * 100;
}

/* ------------------------------------------------------------------ *
 * Value/delta builders per statement family                          *
 * ------------------------------------------------------------------ */

function statementFlow(
  statement: "income" | "balance" | "cash",
  field: string,
  opts?: { delta?: "yoy" | null; divisor?: number },
): Pick<CompareMetric, "value" | "change"> {
  const divisor = opts?.divisor ?? 1;
  const rowsFor = (inputs: CompareInputs) =>
    inputs.statements
      ? (inputs.statements[statement] as unknown as Array<
          Record<string, unknown> & { date: string }
        >)
      : undefined;
  return {
    value: (inputs) => {
      const row = latest(rowsFor(inputs));
      const raw = row ? num(row[field]) : null;
      return raw === null ? null : raw / divisor;
    },
    change: (inputs) => {
      if (opts?.delta !== "yoy") return null;
      const rows = rowsFor(inputs);
      const cur = latest(rows);
      const prev = prior(rows, cur);
      return percentChange(
        cur ? num(cur[field]) : null,
        prev ? num(prev[field]) : null,
      );
    },
  };
}

function money(inputs: CompareInputs, field: string, statement: "income" | "balance" | "cash"): number | null {
  const row = latest(
    inputs.statements?.[statement] as unknown as
      | Array<Record<string, unknown> & { date: string }>
      | undefined,
  );
  const raw = row ? num(row[field]) : null;
  return raw === null ? null : raw / 1e9;
}

function moneyYoY(inputs: CompareInputs, field: string, statement: "income" | "cash"): number | null {
  const rows = inputs.statements?.[statement] as unknown as
    | Array<Record<string, unknown> & { date: string }>
    | undefined;
  const cur = latest(rows);
  const prev = prior(rows, cur);
  return percentChange(
    cur ? num(cur[field]) : null,
    prev ? num(prev[field]) : null,
  );
}

/* ------------------------------------------------------------------ *
 * The vocabulary                                                     *
 * ------------------------------------------------------------------ */

const BILLION = 1e9;

export const COMPARE_METRICS: readonly CompareMetric[] = [
  // ── Revenue & profitability (income statement, latest FY) ────────────
  {
    id: "revenue",
    labelKey: "metrics.revenue",
    group: "revenue",
    unit: "B",
    ...statementFlow("income", "revenue", { delta: "yoy", divisor: BILLION }),
  },
  {
    id: "grossProfit",
    labelKey: "metrics.grossProfit",
    group: "revenue",
    unit: "B",
    ...statementFlow("income", "grossProfit", {
      delta: "yoy",
      divisor: BILLION,
    }),
  },
  {
    id: "ebitda",
    labelKey: "metrics.ebitda",
    group: "revenue",
    unit: "B",
    ...statementFlow("income", "ebitda", { delta: "yoy", divisor: BILLION }),
  },
  {
    id: "operatingIncome",
    labelKey: "metrics.operatingIncome",
    group: "revenue",
    unit: "B",
    ...statementFlow("income", "operatingIncome", {
      delta: "yoy",
      divisor: BILLION,
    }),
  },
  {
    id: "netIncome",
    labelKey: "metrics.netIncome",
    group: "revenue",
    unit: "B",
    ...statementFlow("income", "netIncome", { delta: "yoy", divisor: BILLION }),
  },
  {
    id: "eps",
    labelKey: "metrics.eps",
    group: "revenue",
    unit: "$",
    ...statementFlow("income", "eps", { delta: "yoy", divisor: 1 }),
  },
  {
    id: "grossMargin",
    labelKey: "compare.metric.grossMargin",
    group: "revenue",
    unit: "%",
    value: (inputs) => {
      const row = latest(inputs.statements?.income);
      return row
        ? marginPct(num(row.grossProfit), num(row.revenue))
        : null;
    },
    change: (inputs) => {
      const rows = inputs.statements?.income;
      const cur = latest(rows);
      const prev = prior(rows, cur);
      const curM = cur ? marginPct(num(cur.grossProfit), num(cur.revenue)) : null;
      const prevM = prev
        ? marginPct(num(prev.grossProfit), num(prev.revenue))
        : null;
      return curM !== null && prevM !== null ? curM - prevM : null;
    },
    changeIsPp: true,
  },
  {
    id: "operatingMargin",
    labelKey: "fundamentals.operatingMargin",
    group: "revenue",
    unit: "%",
    value: (inputs) => {
      const row = latest(inputs.statements?.income);
      return row
        ? marginPct(num(row.operatingIncome), num(row.revenue))
        : null;
    },
    change: (inputs) => {
      const rows = inputs.statements?.income;
      const cur = latest(rows);
      const prev = prior(rows, cur);
      const curM = cur
        ? marginPct(num(cur.operatingIncome), num(cur.revenue))
        : null;
      const prevM = prev
        ? marginPct(num(prev.operatingIncome), num(prev.revenue))
        : null;
      return curM !== null && prevM !== null ? curM - prevM : null;
    },
    changeIsPp: true,
  },
  {
    id: "netMargin",
    labelKey: "compare.metric.netMargin",
    group: "revenue",
    unit: "%",
    value: (inputs) => {
      const row = latest(inputs.statements?.income);
      return row ? marginPct(num(row.netIncome), num(row.revenue)) : null;
    },
    change: (inputs) => {
      const rows = inputs.statements?.income;
      const cur = latest(rows);
      const prev = prior(rows, cur);
      const curM = cur ? marginPct(num(cur.netIncome), num(cur.revenue)) : null;
      const prevM = prev
        ? marginPct(num(prev.netIncome), num(prev.revenue))
        : null;
      return curM !== null && prevM !== null ? curM - prevM : null;
    },
    changeIsPp: true,
  },

  // ── Balance sheet (latest period) ────────────────────────────────────
  {
    id: "cashAndEquivalents",
    labelKey: "metrics.cashEquivalents",
    group: "balance",
    unit: "B",
    value: (inputs) => money(inputs, "cashAndCashEquivalents", "balance"),
    change: () => null,
  },
  {
    id: "totalAssets",
    labelKey: "metrics.totalAssets",
    group: "balance",
    unit: "B",
    value: (inputs) => money(inputs, "totalAssets", "balance"),
    change: () => null,
  },
  {
    id: "totalEquity",
    labelKey: "metrics.shareholdersEquity",
    group: "balance",
    unit: "B",
    value: (inputs) => money(inputs, "totalEquity", "balance"),
    change: () => null,
  },
  {
    id: "totalDebt",
    labelKey: "compare.metric.totalDebt",
    group: "balance",
    unit: "B",
    value: (inputs) => money(inputs, "totalDebt", "balance"),
    change: () => null,
  },
  {
    id: "netDebt",
    labelKey: "fundamentals.netDebt",
    group: "balance",
    unit: "B",
    value: (inputs) => money(inputs, "netDebt", "balance"),
    change: () => null,
  },
  {
    id: "debtToEquity",
    labelKey: "compare.metric.debtToEquity",
    group: "balance",
    unit: "x",
    value: (inputs) => {
      const row = latest(inputs.statements?.balance);
      if (!row) return null;
      const debt = num(row.totalDebt);
      const equity = num(row.totalEquity);
      if (debt === null || equity === null || equity === 0) return null;
      return debt / equity;
    },
    change: () => null,
  },

  // ── Cash flow (latest FY) ────────────────────────────────────────────
  {
    id: "operatingCashFlow",
    labelKey: "compare.metric.operatingCashFlow",
    group: "cashflow",
    unit: "B",
    value: (inputs) => money(inputs, "operatingCashFlow", "cash"),
    change: (inputs) => moneyYoY(inputs, "operatingCashFlow", "cash"),
  },
  {
    id: "freeCashFlow",
    labelKey: "metrics.freeCashFlow",
    group: "cashflow",
    unit: "B",
    value: (inputs) => money(inputs, "freeCashFlow", "cash"),
    change: (inputs) => moneyYoY(inputs, "freeCashFlow", "cash"),
  },
  {
    id: "capex",
    labelKey: "compare.metric.capex",
    group: "cashflow",
    unit: "B",
    value: (inputs) => money(inputs, "capitalExpenditure", "cash"),
    change: () => null,
  },
  {
    id: "fcfMargin",
    labelKey: "compare.metric.fcfMargin",
    group: "cashflow",
    unit: "%",
    value: (inputs) => {
      // FCF margin is FCF over revenue for the SAME reporting period. Cash
      // and income feeds can end at different fiscal dates (income usually
      // leads), so pick the income row that matches the selected cash-flow
      // row's date instead of taking each feed's latest independently — a
      // mismatched pair would silently compare different fiscal years.
      const cashRow = latest(inputs.statements?.cash);
      if (!cashRow) return null;
      const incomeRow = rowByDate(inputs.statements?.income, cashRow.date);
      return marginPct(
        num(cashRow.freeCashFlow),
        incomeRow ? num(incomeRow.revenue) : null,
      );
    },
    change: (inputs) => {
      const cashRows = inputs.statements?.cash;
      const incomeRows = inputs.statements?.income;
      const curCash = latest(cashRows);
      const prevCash = prior(cashRows, curCash);
      // Match income to each cash row by date — never pair different years.
      const curInc = curCash ? rowByDate(incomeRows, curCash.date) : null;
      const prevInc = prevCash ? rowByDate(incomeRows, prevCash.date) : null;
      const curM = marginPct(
        curCash ? num(curCash.freeCashFlow) : null,
        curInc ? num(curInc.revenue) : null,
      );
      const prevM = marginPct(
        prevCash ? num(prevCash.freeCashFlow) : null,
        prevInc ? num(prevInc.revenue) : null,
      );
      return curM !== null && prevM !== null ? curM - prevM : null;
    },
    changeIsPp: true,
  },

  // ── Valuation (TTM ratios, already percent-normalized) ───────────────
  {
    id: "pe",
    labelKey: "fundamentals.pe",
    group: "valuation",
    unit: "x",
    value: (inputs) =>
      inputs.metrics?.metrics?.peRatioTTM ??
      inputs.metrics?.ratios?.priceEarningsRatioTTM ??
      null,
    change: () => null,
  },
  {
    id: "ps",
    labelKey: "fundamentals.priceToSales",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.metrics?.priceToSalesRatioTTM ?? null,
    change: () => null,
  },
  {
    id: "pb",
    labelKey: "fundamentals.priceToBook",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.metrics?.priceToBookRatioTTM ?? null,
    change: () => null,
  },
  {
    id: "evEbitda",
    labelKey: "fundamentals.evToEbitda",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.metrics?.evToEBITDATTM ?? null,
    change: () => null,
  },
  {
    id: "evSales",
    labelKey: "compare.metric.evSales",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.metrics?.evToSalesTTM ?? null,
    change: () => null,
  },
  {
    id: "dividendYield",
    labelKey: "fundamentals.dividendYield",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.metrics?.dividendYieldTTM ?? null,
    change: () => null,
  },
  {
    id: "fcfYield",
    labelKey: "fundamentals.fcfYield",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.metrics?.freeCashFlowYieldTTM ?? null,
    change: () => null,
  },
  {
    id: "roe",
    labelKey: "compare.metric.roe",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.metrics?.returnOnEquityTTM ?? null,
    change: () => null,
  },
  {
    id: "roa",
    labelKey: "compare.metric.roa",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.metrics?.returnOnAssetsTTM ?? null,
    change: () => null,
  },
  {
    id: "roic",
    labelKey: "fundamentals.roic",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.metrics?.roicTTM ?? null,
    change: () => null,
  },
  {
    id: "profitMarginTtm",
    labelKey: "fundamentals.profitMargin",
    group: "valuation",
    unit: "%",
    value: (inputs) => inputs.metrics?.ratios?.netProfitMargin ?? null,
    change: () => null,
  },
  {
    id: "currentRatio",
    labelKey: "compare.metric.currentRatio",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.ratios?.currentRatio ?? null,
    change: () => null,
  },
  {
    id: "quickRatio",
    labelKey: "compare.metric.quickRatio",
    group: "valuation",
    unit: "x",
    value: (inputs) => inputs.metrics?.ratios?.quickRatio ?? null,
    change: () => null,
  },

  // ── Market (live quote) ──────────────────────────────────────────────
  {
    id: "marketCap",
    labelKey: "metrics.marketCap",
    group: "market",
    unit: "B",
    value: (inputs) => {
      const mc = inputs.quote?.marketCap;
      return mc != null && Number.isFinite(mc) ? mc / BILLION : null;
    },
    change: (inputs) =>
      inputs.quote?.changesPercentage != null &&
      Number.isFinite(inputs.quote.changesPercentage)
        ? inputs.quote.changesPercentage
        : null,
  },
  {
    id: "price",
    labelKey: "compare.metric.price",
    group: "market",
    unit: "$",
    value: (inputs) =>
      inputs.quote?.price != null && Number.isFinite(inputs.quote.price)
        ? inputs.quote.price
        : null,
    change: (inputs) =>
      inputs.quote?.changesPercentage != null &&
      Number.isFinite(inputs.quote.changesPercentage)
        ? inputs.quote.changesPercentage
        : null,
  },
  {
    id: "dayChange",
    labelKey: "compare.metric.dayChange",
    group: "market",
    unit: "%",
    value: (inputs) =>
      inputs.quote?.changesPercentage != null &&
      Number.isFinite(inputs.quote.changesPercentage)
        ? inputs.quote.changesPercentage
        : null,
    change: () => null,
  },
] as const;

export const COMPARE_GROUPS: readonly CompareGroup[] = [
  "revenue",
  "balance",
  "cashflow",
  "valuation",
  "market",
];

export function compareGroupLabelKey(group: CompareGroup): string {
  return `compare.group.${group}`;
}

export function metricsByGroup(group: CompareGroup): CompareMetric[] {
  return COMPARE_METRICS.filter((m) => m.group === group) as CompareMetric[];
}

/* ------------------------------------------------------------------ *
 * Formatting                                                          *
 * ------------------------------------------------------------------ */

/**
 * Format a metric value for a table cell, e.g. "385.60B", "6.1%", "28.40".
 * Statement quantities ("B") and per-share/price values ("$") are rendered
 * WITHOUT a currency symbol — statement rows carry each company's reporting
 * currency, which differs per ticker, so the per-column currency badge is the
 * authority; a hardcoded "$" would mislabel EUR/GBP-reporting tickers.
 */
export function formatCompareValue(value: number, metric: CompareMetric): string {
  if (!Number.isFinite(value)) return "—";
  if (metric.unit === "B") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}B`;
  }
  if (metric.unit === "$") {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (metric.unit === "%") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }
  // "x" — valuation multiples & ratios
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a delta chip, e.g. "+12.3%", "-5.2%", "+1.2pp", "-0.8pp". */
export function formatCompareChange(
  change: number,
  metric: CompareMetric,
): string {
  const sign = change >= 0 ? "+" : "";
  const suffix = metric.changeIsPp ? "pp" : "%";
  return `${sign}${change.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${suffix}`;
}

/** Sum of metrics a group contributes (used for the "X metrics" hint). */
export const COMPARE_METRIC_COUNT = COMPARE_METRICS.length;