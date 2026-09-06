/**
 * Shared Yahoo-quote shape normalizer — the single source of truth for
 * turning a raw `yahoo-finance2` quote payload into the API's
 * `StockQuote` shape.
 *
 * Consumed by BOTH runtimes:
 *   • `server/services/stockService.ts` (local dev / Express), and
 *   • `api/_router.js` (Vercel serverless) via the `.js`-extension
 *     import trick also used for `apiUsageTracker.js`.
 *
 * Self-contained by design: the only relative import is type-only
 * (erased at transpile), so Vercel's serverless bundler ships this
 * module whole. Do NOT add runtime value imports here — duplicate the
 * logic instead, or move it into this file and update both callers.
 *
 * History: before this module existed the mapping lived twice and had
 * drifted — `_router.js` multiplied `earningsTimestamp` by 1000
 * unconditionally (year-52k dates for ms-epoch inputs on Vercel only),
 * skipped the decimal→percent dividend-yield conversion, coerced
 * empty-string numerics to 0, and served quotes with price 0 instead of
 * null. `api/_router.yahoo-quote-parity.spec.ts` pins the contract.
 */

import type { StockQuote } from "../../shared/api";

export function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeYahooPercentage(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

/**
 * Normalize Yahoo's mixed quote conventions into percentage points.
 * Prefer dividendRate / price because it is auditable and prevents a
 * decimal-vs-percent mismatch from displaying an impossible yield.
 */
export function normalizeDividendYield(
  rawYield: unknown,
  dividendRate: unknown,
  price: unknown,
): number | undefined {
  // toFiniteNumber (not Number()) so null/"" don't coerce to 0 — a null
  // dividendRate must fall through to the direct yield, and a null
  // dividendYield must stay undefined rather than masquerade as 0%.
  const direct = toFiniteNumber(rawYield);
  const rate = toFiniteNumber(dividendRate);
  const currentPrice = toFiniteNumber(price);
  if (
    Number.isFinite(rate) &&
    rate >= 0 &&
    Number.isFinite(currentPrice) &&
    currentPrice > 0
  ) {
    const derived = (rate / currentPrice) * 100;
    // A declared rate and current price are auditable; prefer them over
    // Yahoo's version-dependent dividendYield field.
    return derived <= 20 ? derived : undefined;
  }
  if (!Number.isFinite(direct) || direct < 0 || direct > 20) return undefined;
  // QuoteSummary's decimal form (0.0004 = 0.04%) is normalized here too.
  return direct <= 1 ? direct * 100 : direct;
}

/**
 * Yahoo reports `earningsTimestamp` in seconds, but has been observed to
 * emit millisecond values from some endpoints/versions. Heuristic: epoch
 * seconds fit under 1e12 until year 33658, so anything below is seconds.
 * Non-numeric garbage yields `null` rather than an Invalid-Date throw.
 */
function normalizeEarningsAnnouncement(timestamp: unknown): string | null {
  if (timestamp === undefined || timestamp === null || timestamp === "") {
    return null;
  }
  const ms =
    typeof timestamp === "number" && timestamp < 1e12
      ? timestamp * 1000
      : timestamp;
  const date = new Date(ms as Parameters<DateConstructor["parse"]>[0]);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeYahooQuote(
  raw: any,
  fallbackSymbol?: string,
): StockQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const price = toFiniteNumber(raw.regularMarketPrice);
  if (price === undefined || price <= 0) return null;
  return {
    symbol: String(raw.symbol ?? fallbackSymbol ?? ""),
    name: raw.longName ?? raw.shortName ?? raw.displayName,
    price,
    change: toFiniteNumber(raw.regularMarketChange) ?? 0,
    changesPercentage: toFiniteNumber(raw.regularMarketChangePercent) ?? 0,
    previousClose: toFiniteNumber(raw.regularMarketPreviousClose),
    dayLow: toFiniteNumber(raw.regularMarketDayLow),
    dayHigh: toFiniteNumber(raw.regularMarketDayHigh),
    yearLow: toFiniteNumber(raw.fiftyTwoWeekLow),
    yearHigh: toFiniteNumber(raw.fiftyTwoWeekHigh),
    priceAvg50: toFiniteNumber(raw.fiftyDayAverage),
    priceAvg200: toFiniteNumber(raw.twoHundredDayAverage),
    marketCap: toFiniteNumber(raw.marketCap),
    volume: toFiniteNumber(raw.regularMarketVolume),
    avgVolume: toFiniteNumber(
      raw.averageDailyVolume10Day ?? raw.averageDailyVolume3Month,
    ),
    exchange: raw.exchange,
    sharesOutstanding: toFiniteNumber(raw.sharesOutstanding),
    eps: toFiniteNumber(raw.epsTrailingTwelveMonths),
    pe: toFiniteNumber(raw.trailingPE),
    earningsAnnouncement: normalizeEarningsAnnouncement(raw.earningsTimestamp),
    dividendRate: toFiniteNumber(raw.dividendRate),
    dividendYield: normalizeDividendYield(
      raw.dividendYield,
      raw.dividendRate,
      price,
    ),
    payoutRatio: normalizeYahooPercentage(raw.payoutRatio),
  };
}
