/**
 * client/lib/finance.ts
 *
 * Pure, side-effect-free analytics utilities. Used by the Portfolio page to
 * derive IRR / CAGR / Sharpe / Sortino / Volatility from a cashflow series
 * or a daily-close series. No fetchers here — UI components thread the data
 * in; the math stays deterministic and testable.
 */

const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE = 0.045;

export interface CashflowPoint {
  date: string;
  amount: number;
}

export interface IIRResult {
  rate: number | null;
  iterations: number;
  reason: "converged" | "no_sign_change" | "too_few_points" | "no_convergence";
}

export type FinancialPeriod = "annual" | "quarter";

/** Percentage change from an older value to a newer value. */
export function yoyGrowth(previous: number, current: number): number | null {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0)
    return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * CAGR as a percentage, with explicit positive-endpoint semantics. Negative
 * earnings/revenue are not forced through a fractional power and become null.
 */
export function cagrPercent(
  startValue: number,
  endValue: number,
  years: number,
): number | null {
  const rate = cagr(startValue, endValue, years);
  return rate === null ? null : rate * 100;
}

/** Calculates the annualized compound growth rate as a decimal. */
export function cagr(
  startValue: number,
  endValue: number,
  years: number,
): number | null {
  if (
    !Number.isFinite(startValue) ||
    !Number.isFinite(endValue) ||
    startValue <= 0 ||
    endValue <= 0 ||
    !Number.isFinite(years) ||
    years <= 0
  )
    return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Computes the annualized IRR for dated cashflows using a safe bisection.
 */
export function irrBisection(
  cashflows: CashflowPoint[],
  opts: { low?: number; high?: number; tol?: number; maxIter?: number } = {},
): IIRResult {
  const low0 = opts.low ?? -0.999;
  const high0 = opts.high ?? 1.0;
  const tol = opts.tol ?? 1e-7;
  const maxIter = opts.maxIter ?? 200;
  if (cashflows.length < 2)
    return { rate: null, iterations: 0, reason: "too_few_points" };

  const sorted = [...cashflows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const t0 = new Date(sorted[0].date).getTime();
  if (!Number.isFinite(t0))
    return { rate: null, iterations: 0, reason: "too_few_points" };
  const npv = (r: number) =>
    sorted.reduce((acc, cf) => {
      const years =
        (new Date(cf.date).getTime() - t0) / (365.25 * 24 * 3600 * 1000);
      return acc + cf.amount / Math.pow(1 + r, years);
    }, 0);

  let lo = low0;
  let hi = high0;
  let vLo = npv(lo);
  const vHi = npv(hi);
  if (!Number.isFinite(vLo) || !Number.isFinite(vHi) || vLo * vHi >= 0)
    return { rate: null, iterations: 0, reason: "no_sign_change" };

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (!Number.isFinite(v))
      return { rate: null, iterations: i, reason: "no_convergence" };
    if (Math.abs(v) < tol)
      return { rate: mid, iterations: i, reason: "converged" };
    if (v * vLo < 0) hi = mid;
    else {
      lo = mid;
      vLo = v;
    }
  }
  return { rate: (lo + hi) / 2, iterations: maxIter, reason: "no_convergence" };
}

export function metricStatementKey(name: string): MetricStatementKey | null {
  return METRIC_KEY_MAP[name] ?? null;
}

export interface MetricStatementKey {
  statement: "income" | "balance" | "cash";
  key: string;
  divisor: number;
}

const METRIC_KEY_MAP: Record<string, MetricStatementKey> = {
  "insights.revenue": { statement: "income", key: "revenue", divisor: 1e9 },
  "insights.ebitda": { statement: "income", key: "ebitda", divisor: 1e9 },
  "insights.grossProfit": {
    statement: "income",
    key: "grossProfit",
    divisor: 1e9,
  },
  "insights.operatingIncome": {
    statement: "income",
    key: "operatingIncome",
    divisor: 1e9,
  },
  "insights.netIncome": { statement: "income", key: "netIncome", divisor: 1e9 },
  "insights.eps": { statement: "income", key: "eps", divisor: 1 },
  "insights.cashAndEquivalents": {
    statement: "balance",
    key: "cashAndCashEquivalents",
    divisor: 1e9,
  },
  "insights.totalAssets": {
    statement: "balance",
    key: "totalAssets",
    divisor: 1e9,
  },
  // Stocknest-style derived rows computed in the statement normalization
  // (server/services/derivedRows.ts) — plotable by any series consumer
  // (charts grid, compare vocabulary, future surfaces).
  "insights.totalIntangibles": {
    statement: "balance",
    key: "_derived_totalIntangibles",
    divisor: 1e9,
  },
  "insights.tangibleBookValue": {
    statement: "balance",
    key: "_derived_tbv",
    divisor: 1e9,
  },
  "insights.totalTangibleAssets": {
    statement: "balance",
    key: "_derived_totalTangible",
    divisor: 1e9,
  },
  "insights.netReturned": {
    statement: "cash",
    key: "_derived_netReturned",
    divisor: 1e9,
  },
};

export function projectMetricSeries(
  metricName: string,
  statements:
    | {
        income?: ReadonlyArray<unknown>;
        balance?: ReadonlyArray<unknown>;
        cash?: ReadonlyArray<unknown>;
      }
    | null
    | undefined,
): { date: string; value: number }[] {
  const meta = metricStatementKey(metricName);
  if (!meta || !statements) return [];
  const rows = (statements[meta.statement] ?? []) as ReadonlyArray<unknown>;
  const projected = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      const raw = Number(record[meta.key]);
      if (!Number.isFinite(raw)) return null;
      const period = String(record.period ?? "").trim();
      const yearPart = String(record.calendarYear ?? "").trim();
      const isQuarter = /^Q[1-4]$/.test(period);
      const qMatch = /^Q([1-4])$/.exec(period);
      const year = Number(yearPart) || 0;
      return {
        date: isQuarter ? `${period} ${yearPart}` : `FY ${yearPart}`,
        value: raw / meta.divisor,
        chronoKey: qMatch ? year * 10 + Number(qMatch[1]) : year * 10,
      };
    })
    .filter(
      (p): p is { date: string; value: number; chronoKey: number } =>
        p !== null,
    );
  projected.sort((a, b) => a.chronoKey - b.chronoKey);
  return projected.map(({ date, value }) => ({ date, value }));
}

export function detectPeriodGranularity(
  rows: ReadonlyArray<{ readonly period?: string | null }>,
): FinancialPeriod {
  if (!Array.isArray(rows) || rows.length === 0) return "annual";
  return /^Q[1-4]$/.test(String(rows[rows.length - 1].period ?? "").trim())
    ? "quarter"
    : "annual";
}

export function cagrAtYearsBack<T>(
  arr: ReadonlyArray<T>,
  key: string,
  years: number,
  granularity: FinancialPeriod,
): number | null {
  if (
    !Array.isArray(arr) ||
    arr.length < 2 ||
    !Number.isFinite(years) ||
    years <= 0
  )
    return null;
  const stepBack = granularity === "quarter" ? years * 4 : years;
  const startIdx = arr.length - 1 - stepBack;
  if (startIdx < 0) return null;
  const start = Number((arr[startIdx] as Record<string, unknown>)[key]);
  const end = Number((arr[arr.length - 1] as Record<string, unknown>)[key]);
  return cagrPercent(start, end, years);
}

function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) out.push(cur / prev - 1);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function annualizedVolatility(
  closes: number[],
  tradingDaysPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (closes.length < 2) return null;
  const r = dailyReturns(closes);
  if (r.length === 0) return null;
  const m = mean(r);
  return (
    Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / r.length) *
    Math.sqrt(tradingDaysPerYear)
  );
}

export function sharpeRatio(
  closes: number[],
  riskFreeAnnual = DEFAULT_RISK_FREE,
  tradingDaysPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (closes.length < 2) return null;
  const r = dailyReturns(closes);
  if (r.length === 0) return null;
  const rfPerDay = riskFreeAnnual / tradingDaysPerYear;
  const m = mean(r) - rfPerDay;
  const std = Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length);
  return std === 0 ? null : (m / std) * Math.sqrt(tradingDaysPerYear);
}

export function sortinoRatio(
  closes: number[],
  riskFreeAnnual = DEFAULT_RISK_FREE,
  tradingDaysPerYear = TRADING_DAYS_PER_YEAR,
): number | null {
  if (closes.length < 2) return null;
  const r = dailyReturns(closes);
  if (r.length === 0) return null;
  const rfPerDay = riskFreeAnnual / tradingDaysPerYear;
  const downside = r.filter((x) => x < rfPerDay);
  if (downside.length === 0) return null;
  const dd = Math.sqrt(
    downside.reduce((s, x) => s + (x - rfPerDay) ** 2, 0) / downside.length,
  );
  return dd === 0
    ? null
    : ((mean(r) - rfPerDay) / dd) * Math.sqrt(tradingDaysPerYear);
}

export function totalReturn(closes: number[]): number | null {
  if (closes.length < 2 || closes[0] <= 0) return null;
  return closes[closes.length - 1] / closes[0] - 1;
}

const PLAUSIBLE_DATE_MIN_MS = Date.UTC(1990, 0, 1);
function _strictToTimestamp(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const ms = value < 1e12 ? value * 1000 : value;
    return ms < PLAUSIBLE_DATE_MIN_MS ? null : ms;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    const y = +iso[1];
    const m = +iso[2];
    const d = +iso[3];
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990) return null;
    return Date.UTC(y, m - 1, d);
  }
  const ms = Date.parse(value);
  return !Number.isFinite(ms) || ms < PLAUSIBLE_DATE_MIN_MS ? null : ms;
}
function _toTimestamp(
  value: string | number | null | undefined,
  sink: number,
): number {
  return _strictToTimestamp(value) ?? sink;
}
export function parseTradeDateMs(
  value: string | number | null | undefined,
): number {
  return _toTimestamp(value, 0);
}
export function parseTradeDateAsc(
  value: string | number | null | undefined,
): number {
  return _toTimestamp(value, Number.MAX_SAFE_INTEGER);
}
export function parseTradeDate(
  value: string | number | null | undefined,
): number | null {
  return _strictToTimestamp(value);
}
export function formatTradeDateShort(
  value: string | number | null | undefined,
): string | null {
  const ms = parseTradeDate(value);
  return ms === null
    ? null
    : new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
}
export function formatTradeDateLocale(
  value: string | number | null | undefined,
): string | null {
  const ms = parseTradeDate(value);
  return ms === null ? null : new Date(ms).toLocaleDateString();
}
export function formatEarningsDate(
  value: string | number | null | undefined,
): string | null {
  const ms = parseTradeDate(value);
  return ms === null
    ? null
    : new Date(ms).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
