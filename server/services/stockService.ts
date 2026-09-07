import yahooFinanceDefault from "yahoo-finance2";
import { apiUsageTracker, __test__ as usageTestSeam } from "./apiUsageTracker";
import NodeCache from "node-cache";
import { kvJsonCache } from "../helpers/kvJsonCache";
import {
  AnalystTrendPoint,
  AnalystTrends,
  BatchQuoteResponse,
  CashFlowRow,
  ChartSeries,
  CompanyProfile,
  EarningsEvent,
  FinancialStatements,
  FinancialScores,
  FxCurrency,
  FxRatesResponse,
  IncomeStatementRow,
  BalanceSheetRow,
  InsiderTransaction,
  InsightsTabEntry,
  InsightsTabId,
  InsightsTabResponse,
  KeyMetricsTTM,
  NewsItem,
  ProviderHealthEntry,
  ProviderHealthFeature,
  ProviderHealthResponse,
  RatiosTTM,
  RevenueSegmentRow,
  RevenueSegmentation,
  SectorHeatmapMetadata,
  SectorHeatmapResponse,
  SmaDistanceResponse,
  SmaDistanceRow,
  StockMetrics,
  StockOwnership,
  StockQuote,
  YahooFallbackFinancials,
  AvailabilityState,
} from "../../shared/api";
import { insightsTabLabels, insightsTabUniverses } from "./insightsUniverses";
import { normalizeOwnership } from "./ownershipNormalizer";
import {
  normalizeDividendYield,
  normalizeYahooPercentage,
  normalizeYahooQuote,
} from "./yahooQuoteShape";

export { normalizeYahooPercentage };
// Relative path (not `@shared/...`) so the helper resolves cleanly under Vite's
// config-file resolver, which doesn't apply its own `resolve.alias` map when
// bundling vite.config.ts at startup. The TS path alias still works — this is
// purely a runtime resolution concern at config-load time.
import {
  aggregateSectorHeatmap,
  type SectorHeatmapInputRow,
} from "../../shared/aggregateSectorHeatmap";
import {
  buildFmpBatchUrl,
  buildHeatmapRows,
  buildSectorHeatmapCacheKey,
  canonicalSymbols,
  createInFlightRegistry,
  orderByRequestedSymbols,
  resolveOrderedBatch,
} from "./marketDataReliability";
import { normalizeSectorMeta } from "../../shared/sectorMeta";
import { providerStatusFromProbe } from "../../shared/providerHealth";
import {
  classifyTransaction,
  parseTransactionPrice,
  resolveTransactionValue,
} from "./insiderUtils";
import { mergeFinancialStatements } from "./financialStatementFallback";

// yahoo-finance2 v4 ships the class as its default export. Use one shared
// instance per process; constructing it "throwaway" per call degrades
// Yahoo's rate-limit grace and triggers the survey notice on every fetch.
const yahooFinanceInner = new yahooFinanceDefault({
  suppressNotices: ["yahooSurvey"],
});
// Wrap each method in a Proxy that records one call per top-level
// invocation in apiUsageTracker. Every fetchYahooQuote / yahooFinance.quoteSummary
// / yahooFinance.chart / yahooFinance.search call auto-counts without
// each call site having to opt in. The proxy only intercepts function
// props; non-function props (constants, promises) pass through.
const yahooFinance: typeof yahooFinanceInner = new Proxy(yahooFinanceInner, {
  get(target, prop: string | symbol) {
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (...args: unknown[]) => {
        apiUsageTracker.recordCall("yahoo");
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
});
// Re-export the test seam so vitest can reset the bucket between specs.
export { usageTestSeam };

/**
 * Upstream-aware stock data layer.
 *
 * Strategy: this file discusses with FMP via the /stable/ path, which is
 * the only endpoint family FMP still serves for current keys (the legacy
 * /api/v3/ endpoints were deprecated in 2025 — see docs/endpoints.md). Set
 * FMP_USE_STABLE=0 to opt back into the legacy v3 shapes for
 * grandfather-licensed keys.
 *
 * Every function returns the shared shape from shared/api.ts (never `any`).
 * Normalizers live inline so callers don't have to know which upstream API
 * was used for any given field.
 */

// ---- Cache ----------------------------------------------------------------
const cache = new NodeCache({ stdTTL: 3600, maxKeys: 10000 });
const QUOTE_TTL = 60; // 1 min — quotes are the only thing we ever refetch live
const QUOTE_NEGATIVE_TTL = 15; // Briefly suppress repeated misses without hiding recovery.
const TRENDING_MOVERS_TTL = 60; // 1 min — movers are live-by-nature, same cadence as quotes
const TRENDING_MOVERS_MAX = 30; // cap the Trending tab so the batch-quote fan-out stays lean
const TRENDING_MOVERS_RATE_LIMIT_TTL = 300; // 5 min — hard backoff after an FMP 429 (quota exhausted)
const PROFILE_NEGATIVE_TTL = 30; // Provider outages/not-found responses are retryable.
const CHART_NEGATIVE_TTL = 30; // Avoid retry storms while preserving recovery from provider outages.
const SECTOR_HEATMAP_TTL = 900; // 15 min — heatmap recomputation cache (day deltas are slow-moving)
const MAX_EARNINGS_ENRICH_SYMBOLS = 100; // protect provider quotas on unusually large calendars
// Health probes: 2 of the 5 calls are FMP (quote + batch-quote; the other
// three — Yahoo quote, Yahoo chart, AlphaVantage quote — are keyless or
// keyed on separate budgets), so 1-min polling would burn ~120 FMP
// requests/hour against the 250/day free cap. 5 min keeps worst-case FMP
// spend ~24/hour while staying reactive (widgets also badge on their own
// request failures immediately, independent of this).
const PROVIDER_HEALTH_TTL = 300; // seconds — server re-probes at most every 5 min
const PROVIDER_HEALTH_TIMEOUT_MS = 8_000; // per-provider probe timeout

// ---- Warn throttling --------------------------------------
const lastWarnAt = new Map<string, number>();
const WARN_THROTTLE_MS = 60_000;
const WARN_MAP_SOFT_CAP = 512;
let lastWarnSweepAt = 0;

const quoteInFlight = createInFlightRegistry();
const batchQuoteInFlight = createInFlightRegistry();
const profileInFlight = createInFlightRegistry();
const chartInFlight = createInFlightRegistry();
const heatmapInFlight = createInFlightRegistry();
const healthInFlight = createInFlightRegistry();
// Coalesces concurrent fallback-financials calls during a Yahoo outage
// (when many requesters see FMP's 429 at once and pivot to the Yahoo
// fallback path). Same module-scoped lifetime as the other registries.
const yahooFallbackInFlight = createInFlightRegistry();
// Coalesces concurrent Trending-tab mover fetches (FMP biggest-gainers /
// biggest-losers / most-actives) behind one upstream round-trip.
const trendingMoversInFlight = createInFlightRegistry();

/** Throttle to once-per-key per minute. Logs once per (function, symbol) per minute. Keys embed dynamic ids (symbol, label), so the map is bounded two ways: an amortized sweep (at most once per window) drops expired entries, and a hard cap evicts oldest-inserted keys. The throttle check runs BEFORE eviction — a repeated-but-throttled key must not make room it doesn't need, or sustained repeats drain fresh guards from other keys. Mirrors the bounded throttle in api/_router.js. */
function throttledWarn(key: string, ...args: unknown[]): void {
  const now = Date.now();
  if (now - lastWarnSweepAt >= WARN_THROTTLE_MS) {
    lastWarnSweepAt = now;
    for (const [k, at] of lastWarnAt) {
      if (now - at >= WARN_THROTTLE_MS) lastWarnAt.delete(k);
    }
  }
  const last = lastWarnAt.get(key);
  if (last !== undefined && now - last < WARN_THROTTLE_MS) return;
  while (lastWarnAt.size >= WARN_MAP_SOFT_CAP) {
    const oldest = lastWarnAt.keys().next().value;
    if (oldest === undefined) break;
    lastWarnAt.delete(oldest);
  }
  lastWarnAt.set(key, now);
  console.warn(...args);
}

// ---- Key/env --------------------------------------------------------------
const FMP_KEY = process.env.FMP_KEY || "";
const AV_KEY = process.env.AV_KEY || "";

/**
 * FMP deprecated the legacy /api/v3/ endpoints for all but pre-Aug-2025
 * subscribers; /stable/ is the canonical API now. We default to /stable/
 * and allow opting back into the legacy v3 shapes with FMP_USE_STABLE=0
 * (e.g. for grandfather-licensed keys).
 */
const FMP_USE_STABLE = process.env.FMP_USE_STABLE !== "0";
const FMP_BASE = FMP_USE_STABLE
  ? "https://financialmodelingprep.com/stable"
  : "https://financialmodelingprep.com/api/v3";

/** Earnings-calendar endpoint name — `/stable/` uses `earnings-calendar` (plural, hyphen); legacy v3 still accepts `earning_calendar` (singular, underscore). Hoisted alongside `FMP_BASE` so both shape decisions read the same env var at module init. */
const EARNINGS_ENDPOINT = FMP_USE_STABLE
  ? "earnings-calendar"
  : "earning_calendar";

/**
 * Chart endpoint — `/stable/` exposes EOD bars via `historical-price-eod/full`
 * (full OHLC + vwap) and `/historical-price-eod/light` (lean: just
 * `{symbol,date,price,volume}` — NO open/high/low/close). The legacy v3
 * path `historical-price-full` 404s on `/stable/`. We pick `/full` so the
 * chart UI sees real OHLC bar geometry; Yahoo historical remains the
 * always-on fallback.
 */
const CHART_ENDPOINT = FMP_USE_STABLE
  ? "historical-price-eod/full"
  : "historical-price-full";

/**
 * Quote endpoint — `/stable/` requires the query-param shape `?symbol=...`;
 * `quote/{symbol}` (path-segment) 404s on `/stable/`. v3 accepted both. We
 * pick the shape that works on the active base so the rest of the file stays
 * branchless.
 */
const QUOTE_USE_QUERY_PARAM = FMP_USE_STABLE;

/**
 * Market-movers endpoints. `/stable/` renamed `gainers`/`losers`/`actives` to
 * `biggest-gainers`/`biggest-losers`/`most-actives`; legacy v3 keeps the
 * `stock_market/*` family for grandfather-licensed keys.
 */
const MOVERS_ENDPOINTS = FMP_USE_STABLE
  ? {
      gainers: "biggest-gainers",
      losers: "biggest-losers",
      actives: "most-actives",
    }
  : {
      gainers: "stock_market/gainers",
      losers: "stock_market/losers",
      actives: "stock_market/actives",
    };

/**
 * Determines whether an FMP API key is configured.
 *
 * @returns `true` if an FMP API key is available, `false` otherwise.
 */
function hasFmp(): boolean {
  return typeof FMP_KEY === "string" && FMP_KEY.length > 0;
}

/** Result of a status-aware fetch. */
export interface FetchJSONResult<T> {
  data: T | null;
  /** HTTP status, or null when the request never completed (timeout/network). */
  status: number | null;
}

/**
 * Status-aware variant of `fetchJSON`. Callers that need to distinguish a
 * transient network failure from an explicit HTTP 429 rate-limit (e.g. the
 * Trending movers fetcher) use this to pick the right backoff.
 */
export async function fetchJSONStatus<T = any>(
  url: string,
  label: string,
  timeoutMs = 12000,
): Promise<FetchJSONResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      // 404 / 403 / 429 from FMP shows up here — caller decides what to do.
      throttledWarn(
        `fetcher:${label}:http`,
        `[stockService] ${label} failed: http_${res.status}`,
      );
      return { data: null, status: res.status };
    }
    try {
      return { data: (await res.json()) as T, status: res.status };
    } catch {
      throttledWarn(
        `fetcher:${label}:json`,
        `[stockService] ${label} failed: invalid_json`,
      );
      return { data: null, status: res.status };
    }
  } catch (e: any) {
    const kind = e?.name === "AbortError" ? "timeout" : "network_error";
    throttledWarn(
      `fetcher:${label}:${kind}`,
      `[stockService] ${label} failed: ${kind}`,
    );
    return { data: null, status: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches JSON data from a URL within the specified timeout.
 *
 * Exported only as a test seam: the diagnostic classification
 * (http_<status> / invalid_json / timeout / network_error) is exercised
 * deterministically in server/services/stockService.spec.ts with a mocked
 * global fetch. Not part of the public service API.
 *
 * @param url - The URL to request
 * @param label - Identifier used for warning messages
 * @param timeoutMs - Maximum request duration in milliseconds
 * @returns The parsed response data, or `null` when the request fails
 */
export async function fetchJSON<T = any>(
  url: string,
  label: string,
  timeoutMs = 12000,
): Promise<T | null> {
  return (await fetchJSONStatus<T>(url, label, timeoutMs)).data;
}

/**
 * Builds an FMP API URL with the configured API key and query parameters.
 *
 * @param endpoint - The FMP API endpoint path
 * @param params - Additional query parameters
 * @returns The complete FMP API URL
 */
function fmpUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
): string {
  const qs = new URLSearchParams({
    apikey: FMP_KEY,
    ...(params as any),
  }).toString();
  return `${FMP_BASE}/${endpoint}?${qs}`;
}

/**
 * Builds a single-ticker FMP URL using the active endpoint format.
 *
 * @param name - The FMP endpoint name
 * @param symbol - The ticker symbol
 * @param extra - Additional query parameters
 * @returns The complete FMP request URL
 */
function tickerUrl(
  name: string,
  symbol: string,
  extra: Record<string, string | number | boolean> = {},
): string {
  if (QUOTE_USE_QUERY_PARAM) {
    const qs = new URLSearchParams({
      apikey: FMP_KEY,
      symbol,
      ...(extra as any),
    }).toString();
    return `${FMP_BASE}/${name}?${qs}`;
  }
  const qs = new URLSearchParams({
    apikey: FMP_KEY,
    ...(extra as any),
  }).toString();
  return `${FMP_BASE}/${name}/${symbol}?${qs}`;
}

// ---- Provider health helpers ------------------------------------------------
// Upstream error-body detection lives here; status classification
// (200 / 402 / 403 / 429 / other, plus the null-probe timeout branch) is
// shared with the client in shared/providerHealth.ts — see
// `providerStatusFromProbe`. FMP and AlphaVantage ALSO return HTTP 200
// with an error body (e.g. {"Error Message": "You have exceeded..."} /
// AV {"Note": ...}) for rate limits and bad keys — detect those and
// treat them as degraded too.
function detectUpstreamError(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object") return null;
    const msg =
      parsed["Error Message"] ??
      parsed.Note ??
      parsed.Information ??
      parsed.error ??
      parsed.message ??
      null;
    return typeof msg === "string" && msg.length > 0 ? msg : null;
  } catch {
    return null;
  }
}

/** Probe a URL with a bounded timeout; null on network error/timeout. */
async function probeUrlStatus(url: string): Promise<{
  status: number;
  latencyMs: number;
  errorMessage: string | null;
} | null> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    return {
      status: res.status,
      latencyMs: Date.now() - started,
      errorMessage: detectUpstreamError(text),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Race a promise against a timeout, clearing the timer when it settles first. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ---- Normalizers ----------------------------------------------------------
/** Convert an FMP profile object (camelCase OR PascalCase) to our shared shape. */
function normalizeProfile(raw: any): CompanyProfile {
  if (!raw || typeof raw !== "object") {
    return {
      symbol: "",
      companyName: "",
      description: "",
      sector: "",
      industry: "",
      ceo: "",
      fullTimeEmployees: null,
      beta: null,
      peRatio: null,
    };
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "")
        return raw[k];
    }
    return undefined;
  };
  const toNum = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : null;
  };
  const toBool = (v: unknown): boolean | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (s === "true") return true;
      if (s === "false") return false;
    }
    return undefined;
  };

  const employeesRaw = pick("fullTimeEmployees", "FullTimeEmployees");
  return {
    symbol: String(pick("symbol", "Symbol") ?? ""),
    companyName: String(pick("companyName", "CompanyName") ?? ""),
    description: String(pick("description", "Description") ?? ""),
    sector: String(pick("sector", "Sector") ?? ""),
    industry: String(pick("industry", "Industry") ?? ""),
    ceo: String(pick("ceo", "CEO") ?? ""),
    website: pick("website", "Website"),
    country: pick("country", "Country"),
    state: pick("state", "State"),
    city: pick("city", "City"),
    address: pick("address", "Address"),
    phone: pick("phone", "Phone"),
    fullTimeEmployees: employeesRaw ? toNum(employeesRaw) : null,
    beta: toNum(pick("beta", "Beta")),
    peRatio: toNum(pick("peRatio", "PERatio", "pe")),
    marketCap: toNum(pick("marketCap", "mktCap", "MarketCap")),
    price: toNum(pick("price", "Price")),
    exchange: pick("exchange", "Exchange"),
    exchangeFullName: pick("exchangeFullName", "ExchangeFullName"),
    currency: pick("currency", "Currency"),
    ipoDate: pick("ipoDate", "IpoDate"),
    image: pick("image", "Image"),
    /* ---- /stable/-only identity fields (always optional; absent on legacy v3) ---- */
    cik: pick("cik"),
    isin: pick("isin"),
    cusip: pick("cusip"),
    lastDividend: toNum(pick("lastDividend", "LastDividend")) ?? undefined,
    isEtf: toBool(pick("isEtf", "IsEtf")),
    isFund: toBool(pick("isFund", "IsFund")),
    isAdr: toBool(pick("isAdr", "IsAdr")),
    isActivelyTrading: toBool(pick("isActivelyTrading", "IsActivelyTrading")),
    defaultImage: toBool(pick("defaultImage", "DefaultImage")),
  };
}

/**
 * FMP's percentage metrics arrive as decimal fractions (0.269 = 26.9%)
 * and can exceed 1 — AAPL ROE ≈ 1.52 = 152%. Convert to percent units
 * at the API boundary so renderers (`formatPercent`) display them
 * correctly and the payload matches the Yahoo path's percent-unit
 * convention. Strict ×100 (unlike `normalizeYahooPercentage`) because
 * FMP consistently reports fractions.
 */
export function fmpToPercent(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n * 100 : undefined;
}

function normalizeQuote(raw: any): StockQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const toNum = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : undefined;
  };
  const price = toNum(raw.price);
  if (price === undefined || price <= 0) return null;
  return {
    symbol: String(raw.symbol ?? ""),
    name: raw.name ?? raw.companyName,
    price,
    change: toNum(raw.change) ?? 0,
    // /stable/ returns `changePercentage` (no 's'); legacy v3 returns
    // `changesPercentage`; very-legacy returns `changePercent`. Maintain
    // backward compatibility without breaking the /stable/ upgrade.
    changesPercentage:
      toNum(
        raw.changesPercentage ?? raw.changePercentage ?? raw.changePercent,
      ) ?? 0,
    previousClose: toNum(raw.previousClose),
    dayLow: toNum(raw.dayLow),
    dayHigh: toNum(raw.dayHigh),
    yearLow: toNum(raw.yearLow),
    yearHigh: toNum(raw.yearHigh),
    priceAvg50: toNum(raw.priceAvg50),
    priceAvg200: toNum(raw.priceAvg200),
    marketCap: toNum(raw.marketCap ?? raw.mktCap),
    volume: toNum(raw.volume),
    avgVolume: toNum(raw.avgVolume),
    exchange: raw.exchange,
    sharesOutstanding: toNum(raw.sharesOutstanding),
    eps: toNum(raw.eps),
    pe: toNum(raw.pe),
    earningsAnnouncement: raw.earningsAnnouncement ?? null,
    dividendRate: toNum(raw.dividendRate),
    dividendYield: normalizeDividendYield(
      raw.dividendYield,
      raw.dividendRate,
      price,
    ),
    payoutRatio: normalizeYahooPercentage(raw.payoutRatio),
  };
}

/**
 * Normalizes raw income statement data into the shared income statement format.
 *
 * @param raw - The raw income statement record to normalize.
 * @returns An income statement row with normalized fields and default values for missing core metrics.
 */
function normalizeIncomeRow(raw: any): IncomeStatementRow {
  const toNum = (v: any) => (v === undefined ? undefined : Number(v));
  // /stable/ statements expose `fiscalYear` (e.g. 2025), not `calendarYear`.
  // The shared row type and client charts key off `calendarYear`, so prefer
  // it but fall back to `fiscalYear` so the restored free-tier data renders.
  const year = raw.calendarYear ?? raw.fiscalYear ?? "";
  return {
    date: String(raw.date ?? ""),
    symbol: String(raw.symbol ?? ""),
    reportedCurrency: String(raw.reportedCurrency ?? "USD"),
    calendarYear: String(year),
    period: String(raw.period ?? ""),
    revenue: toNum(raw.revenue) ?? 0,
    costOfRevenue: toNum(raw.costOfRevenue),
    grossProfit: toNum(raw.grossProfit) ?? 0,
    operatingIncome: toNum(raw.operatingIncome),
    operatingExpense: toNum(raw.operatingExpense),
    ebitda: toNum(raw.ebitda) ?? 0,
    netIncome: toNum(raw.netIncome) ?? 0,
    eps: toNum(raw.eps) ?? 0,
    epsDiluted: toNum(raw.epsDiluted),
  };
}

/**
 * Converts a raw balance sheet record into a normalized balance sheet row.
 *
 * @param raw - The source balance sheet record.
 * @returns A normalized balance sheet row with numeric financial values.
 */
function normalizeBalanceRow(raw: any): BalanceSheetRow {
  const toNum = (v: any) => (v === undefined ? undefined : Number(v));
  const year = raw.calendarYear ?? raw.fiscalYear ?? "";
  return {
    date: String(raw.date ?? ""),
    symbol: String(raw.symbol ?? ""),
    reportedCurrency: String(raw.reportedCurrency ?? "USD"),
    calendarYear: String(year),
    period: String(raw.period ?? ""),
    totalAssets: toNum(raw.totalAssets) ?? 0,
    totalLiabilities: toNum(raw.totalLiabilities),
    totalEquity: toNum(raw.totalEquity),
    totalDebt: toNum(raw.totalDebt),
    cashAndCashEquivalents: toNum(raw.cashAndCashEquivalents) ?? 0,
    netDebt: toNum(raw.netDebt),
  };
}

/**
 * Normalizes a cash flow statement row into the shared cash flow format.
 *
 * @param raw - The source cash flow statement data.
 * @returns A normalized cash flow statement row.
 */
function normalizeCashRow(raw: any): CashFlowRow {
  const toNum = (v: any) => (v === undefined ? undefined : Number(v));
  const year = raw.calendarYear ?? raw.fiscalYear ?? "";
  return {
    date: String(raw.date ?? ""),
    symbol: String(raw.symbol ?? ""),
    reportedCurrency: String(raw.reportedCurrency ?? "USD"),
    calendarYear: String(year),
    period: String(raw.period ?? ""),
    operatingCashFlow: toNum(raw.operatingCashFlow) ?? 0,
    capitalExpenditure: toNum(raw.capitalExpenditure),
    freeCashFlow: toNum(raw.freeCashFlow) ?? 0,
    stockBasedCompensation: toNum(raw.stockBasedCompensation),
    dividendPayments: toNum(raw.dividendPayments),
  };
}

/**
 * Normalizes an earnings calendar record into the shared earnings event format.
 *
 * @param raw - The upstream earnings record to normalize
 * @returns An earnings event with normalized identifiers, dates, timing, and financial values
 */
function normalizeEarningEvent(raw: any): EarningsEvent {
  const toNum = (v: any): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    symbol: String(raw.symbol ?? ""),
    date: String(raw.date ?? ""),
    marketCap: toNum(raw.marketCap ?? raw.mktCap),
    epsEstimated: toNum(raw.epsEstimated ?? raw.epsEstimate),
    eps: toNum(raw.eps),
    revenueEstimated: toNum(raw.revenueEstimated ?? raw.revenueEstimate),
    revenue: toNum(raw.revenue),
    time: String(raw.time ?? "bmo"),
  };
}

/**
 * Normalizes a Yahoo Finance news item into the shared news format.
 *
 * @param raw - A flat or content-wrapped Yahoo Finance news item
 * @returns A normalized news item with title, publisher, publication time, link, and optional media metadata
 */
function normalizeNewsItem(raw: any): NewsItem {
  // Yahoo v4 shape from .search(): flat. Legacy content-wrapped shape sometimes
  // appears when proxying — handle both.
  const c = raw.content ?? raw;
  const t = c.providerPublishTime ?? c.pubDate ?? raw.providerPublishTime;
  return {
    title: String(c.title ?? c.headline ?? raw.title ?? ""),
    publisher: String(c.providerName ?? c.publisher ?? raw.publisher ?? "News"),
    providerPublishTime:
      typeof t === "number" ? t : Math.floor(Date.now() / 1000),
    link: String(c.clickUrl ?? c.url ?? c.link ?? raw.link ?? "#"),
    thumbnail:
      c.thumbnail?.resolutions?.[0]?.url ?? c.thumbnail ?? raw.thumbnail,
    type: c.type ?? raw.type,
  };
}

// ---- Helpers used only by normalizeInsider ---------------------------------
// Kept file-local because Yahoo's `quoteSummary` shape has three real-world
// variants we need to absorb (Date object, ISO string, `{raw, fmt}` object,
// plain number). Centralizing them here means we can write tests against
// the through-line by mutating one helper. Plus a 1990 sanity bound matching
// `client/lib/finance.PLAUSIBLE_DATE_MIN_MS` (kept in lockstep — a future
// contributor who tunes one MUST tune the other so the date column doesn't
// read different UTC dates on the client vs. the workspace).
const INSIDER_DATE_MIN_MS = Date.UTC(1990, 0, 1);

function toNumberLoose(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const raw = obj.raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    const fmt = obj.fmt;
    if (typeof fmt === "string") {
      const n = Number(fmt);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function toDateMs(value: unknown): number | null {
  // Accepts: Date object, ISO string (YYYY-MM-DD or full ISO), {raw, fmt}, plain number.
  // Returns `null` for everything pre-1990 (Yahoo sanity guard) so the UI
  // renders "—" instead of "1/1/1970".
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms >= INSIDER_DATE_MIN_MS ? ms : null;
  }
  if (typeof value === "number") {
    // Mirror the Yahoo runtime convention from client/lib/finance.ts: < 1e12
    // is unix-seconds, larger is already ms.
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) && ms >= INSIDER_DATE_MIN_MS ? ms : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= INSIDER_DATE_MIN_MS) return parsed;
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const raw = obj.raw;
    if (typeof raw === "number") {
      const ms = raw < 1e12 ? raw * 1000 : raw;
      if (Number.isFinite(ms) && ms >= INSIDER_DATE_MIN_MS) return ms;
    } else if (typeof raw === "string") {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed) && parsed >= INSIDER_DATE_MIN_MS)
        return parsed;
    }
    const fmt = obj.fmt;
    if (typeof fmt === "string") {
      const parsed = Date.parse(fmt);
      if (Number.isFinite(parsed) && parsed >= INSIDER_DATE_MIN_MS)
        return parsed;
    }
  }
  return null;
}

/**
 * Normalizes an upstream insider transaction into the shared transaction format.
 *
 * @param raw - The upstream transaction data to normalize
 * @returns A normalized insider transaction with numeric shares, value, and price fields
 */
function normalizeInsider(raw: any): InsiderTransaction {
  const shares = Math.abs(toNumberLoose(raw.shares) ?? 0);
  const parsedPrice = parseTransactionPrice(raw.transactionText ?? raw.type);
  const resolvedValue = resolveTransactionValue(raw.value, shares, parsedPrice);
  const transaction = classifyTransaction(
    raw.transactionText ?? raw.type,
    raw.transactionCode,
  );
  // Date extraction is the high-risk one — Yahoo v4 returns startDate as a
  // native Date object OR an ISO string OR a {raw, fmt} object OR a plain
  // unix-second number. The legacy code only handled the `.raw` object
  // shape so Date objects (the dominant v4 shape) flattened to 0 and the
  // UI rendered "—" for every row. `toDateMs` collapses all four to a
  // safe UTC-ms number (or `null` for everything pre-1990 / unparseable)
  // so UI text via `formatTradeDateLocale` reads as a real date.
  const startDate = toDateMs(raw.startDate);
  return {
    filerName: String(raw.filerName ?? raw.name ?? "Insider"),
    filerRelation:
      typeof raw.filerRelation === "string"
        ? raw.filerRelation
        : (raw.filerRelation?.raw ?? undefined),
    transactionText: String(raw.transactionText ?? raw.type ?? "Transaction"),
    // Pass through the per-transaction single-letter code so the UI can
    // branch on it (purchase / sale / award / gift / etc) and render the
    // right format. Optional here because some sessions omit it.
    transactionCode:
      typeof raw.transactionCode === "string"
        ? raw.transactionCode.trim().toUpperCase() || null
        : null,
    startDate,
    shares,
    value: resolvedValue.value,
    valueSource: resolvedValue.source,
    price: parsedPrice?.exact ?? null,
    priceLow: parsedPrice?.low ?? null,
    priceHigh: parsedPrice?.high ?? null,
    marketClosePrice: null,
    category: transaction.category,
    isAdministrative: transaction.isAdministrative,
  };
}

/**
 * Converts a raw chart data record into a normalized chart point.
 *
 * @param raw - The source chart data record
 * @returns A chart point with normalized date, price, volume, and change values
 */
function normalizeChartPoint(raw: any) {
  return {
    date: String(raw.date ?? ""),
    open: Number(raw.open ?? 0),
    high: Number(raw.high ?? 0),
    low: Number(raw.low ?? 0),
    close: Number(raw.close ?? 0),
    adjClose: Number(raw.adjClose ?? raw.close ?? 0),
    volume: Number(raw.volume ?? 0),
    change: Number(raw.change ?? 0),
    changePercent: Number(raw.changePercent ?? 0),
  };
}

/**
 * Retrieves one year of daily historical price data for a symbol.
 *
 * @param symbol - The ticker symbol to retrieve
 * @returns The normalized chart series, or `null` when no data is available
 */
async function fetchProfileWithAvailability(
  symbol: string,
): Promise<{ profile: CompanyProfile | null; unavailable: boolean }> {
  let yahooProfile: CompanyProfile | null = null;
  try {
    // Yahoo is the stable identity fallback. FMP profile remains preferred
    // when configured, but a free-tier FMP miss must not erase a valid name.
    const [yahoo, yahooSummary] = await Promise.all([
      yahooFinance.quote(symbol).catch(() => null) as any,
      (yahooFinance as any)
        .quoteSummary(symbol, {
          modules: ["assetProfile", "defaultKeyStatistics"],
        })
        .catch(() => null) as any,
    ]);
    const assetProfile = yahooSummary?.assetProfile;
    const defaultKeyStats = yahooSummary?.defaultKeyStatistics;
    const yahooName = yahoo?.longName ?? yahoo?.shortName ?? yahoo?.displayName;
    const yahooExchange = yahoo?.fullExchangeName ?? yahoo?.exchange;
    const officers: any[] = assetProfile?.companyOfficers ?? [];
    const ceoOfficer =
      officers.find((o: any) => /ceo/i.test(o?.title ?? "")) ?? officers[0];
    const firstTradeDate = yahoo?.firstTradeDateMilliseconds
      ? new Date(yahoo.firstTradeDateMilliseconds).toISOString().slice(0, 10)
      : defaultKeyStats?.fundInceptionDate
        ? new Date(defaultKeyStats.fundInceptionDate).toISOString().slice(0, 10)
        : undefined;

    yahooProfile = yahooName
      ? {
          symbol,
          companyName: String(yahooName),
          description: String(
            assetProfile?.longBusinessSummary ??
              yahoo?.longBusinessSummary ??
              "",
          ),
          sector: String(assetProfile?.sector ?? yahoo?.sector ?? ""),
          industry: String(assetProfile?.industry ?? yahoo?.industry ?? ""),
          ceo: String(ceoOfficer?.name ?? ""),
          website: assetProfile?.website || undefined,
          country: assetProfile?.country || undefined,
          ipoDate: firstTradeDate,
          fullTimeEmployees: Number.isFinite(
            Number(assetProfile?.fullTimeEmployees),
          )
            ? Number(assetProfile.fullTimeEmployees)
            : null,
          beta: Number.isFinite(Number(yahoo?.beta))
            ? Number(yahoo.beta)
            : null,
          peRatio: Number.isFinite(Number(yahoo?.trailingPE))
            ? Number(yahoo.trailingPE)
            : null,
          marketCap: Number.isFinite(Number(yahoo?.marketCap))
            ? Number(yahoo.marketCap)
            : null,
          price: Number.isFinite(Number(yahoo?.regularMarketPrice))
            ? Number(yahoo.regularMarketPrice)
            : null,
          exchange: yahooExchange,
          currency: yahoo?.currency,
        }
      : null;

    if (!hasFmp())
      return { profile: yahooProfile, unavailable: yahooProfile === null };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const response = await fetch(tickerUrl("profile", symbol), {
        signal: ctrl.signal,
      });
      if (!response.ok) {
        throttledWarn(
          `profile/${symbol}`,
          `[stockService] profile/${symbol} HTTP ${response.status}`,
        );
        return { profile: yahooProfile, unavailable: yahooProfile === null };
      }
      const raw = (await response.json()) as any;
      const row = Array.isArray(raw) ? raw[0] : raw;
      const profile = row ? normalizeProfile(row) : null;
      const matchesRequestedSymbol =
        profile?.symbol.trim().toUpperCase() === symbol.toUpperCase();
      const hasCompanyName = Boolean(profile?.companyName?.trim());
      return {
        profile:
          matchesRequestedSymbol && hasCompanyName ? profile : yahooProfile,
        unavailable: false,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    throttledWarn(
      `profile/${symbol}`,
      `[stockService] profile/${symbol} failed: ${error?.message ?? error}`,
    );
    return { profile: yahooProfile, unavailable: yahooProfile === null };
  }
}

async function yahooChart(symbol: string): Promise<ChartSeries | null> {
  try {
    // yahoo-finance2 v4 deprecated historical() in favor of chart(). The v4
    // historical() shim maps to chart() but explicitly passes period2:
    // undefined, which fails ChartOptions validation — so call chart()
    // directly with an explicit end date instead.
    // period1 (1y ago) + interval "1d" gives ~252 trading-day closes — more
    // than enough for SMA-200.
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);
    const raw: any = await yahooFinance.chart(symbol, {
      period1,
      period2: new Date(),
      interval: "1d",
    });
    const rows: any[] = Array.isArray(raw) ? raw : (raw?.quotes ?? []);
    if (rows.length === 0) return null;
    const historical = rows.map((r: any) => ({
      date: String(
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : (r.date ?? ""),
      ),
      open: Number(r.open ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
      close: Number(r.close ?? 0),
      adjClose: Number(r.adjclose ?? r.close ?? 0),
      volume: Number(r.volume ?? 0),
      change: Number(r.change ?? 0),
      changePercent: Number(r.changePercent ?? 0),
    }));
    return {
      symbol: String(symbol),
      historical,
    };
  } catch (e: any) {
    throttledWarn(
      `yahoo_chart:${symbol}`,
      `[stockService] yahoo chart failed for ${symbol}: ${e?.message ?? e}`,
    );
    return null;
  }
}
/**
 * Retrieves and normalizes a quote for a symbol from Yahoo Finance.
 *
 * @returns A normalized stock quote, or `null` when no quote is available.
 */
async function yahooQuote(symbol: string): Promise<StockQuote | null> {
  try {
    // yahoo-finance2 v4 returns camelCase already for the regularMarket* fields.
    const q: any = await yahooFinance.quote(symbol);
    // Field mapping lives in the shared `yahooQuoteShape.ts` module so the
    // Vercel `_router.js` twin cannot drift from this path again.
    return normalizeYahooQuote(q, symbol);
  } catch (e: any) {
    // Yahoo v4 throws if the symbol is unknown — fall through to MOCK.
    throttledWarn(
      `yahoo_quote:${symbol}`,
      `[stockService] yahoo quote failed for ${symbol}: ${e?.message ?? e}`,
    );
    return null;
  }
}

export interface TrendingMoversResult {
  entries: InsightsTabEntry[];
  /** True when FMP returned 429 and no rows were collected — signals a hard backoff. */
  rateLimited: boolean;
}

/**
 * Fetches FMP's live market movers and maps them to lightweight
 * InsightsTabEntry rows for the Trending tab. Order is gainers → most-active
 * → losers so the list reads "what's moving" without a client-side re-sort.
 *
 * The `/stable/` movers paths were renamed (see MOVERS_ENDPOINTS) — the old
 * `/stable/gainers` + `/actives` paths 404 (docs/alpha-scope-missing-metrics.md).
 */
export async function fetchTrendingMovers(): Promise<TrendingMoversResult> {
  const [gainers, losers, actives] = await Promise.all([
    fetchJSONStatus<any[]>(
      fmpUrl(MOVERS_ENDPOINTS.gainers),
      "trending movers (gainers)",
      10000,
    ),
    fetchJSONStatus<any[]>(
      fmpUrl(MOVERS_ENDPOINTS.losers),
      "trending movers (losers)",
      10000,
    ),
    fetchJSONStatus<any[]>(
      fmpUrl(MOVERS_ENDPOINTS.actives),
      "trending movers (actives)",
      10000,
    ),
  ]);

  const seen = new Set<string>();
  const out: InsightsTabEntry[] = [];
  const collect = (list: any[] | null) => {
    if (!Array.isArray(list)) return;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const symbol = String(row.symbol ?? "")
        .trim()
        .toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      const name = String(row.name ?? row.companyName ?? "").trim() || symbol;
      seen.add(symbol);
      out.push({ symbol, name });
    }
  };

  collect(gainers.data);
  collect(actives.data);
  collect(losers.data);

  // Only an empty result is treated as rate-limited: partial data is still
  // worth serving normally, and a lone 429 beside healthy 200s shouldn't
  // back off the whole tab.
  const rateLimited =
    out.length === 0 &&
    [gainers, losers, actives].some((r) => r.status === 429);

  return { entries: out.slice(0, TRENDING_MOVERS_MAX), rateLimited };
}

/**
 * Parses the FMP `revenue-product-segmentation` payload into the shared
 * `RevenueSegmentRow` shape. FMP has shipped both a nested shape (each
 * period row carries a `products: [{name, revenue}]` array) and a flatter
 * shape (`data: [{name, revenue}]`), so the parser probes both, plus
 * `product`/`segment` and `value`/`revenueValue` aliases for robustness
 * against upstream field renames. Period rows without parseable products
 * are still emitted (`products: []`, `totalRevenue: null`) so callers can
 * tell "no segment data for this period" from "payload malformed".
 */
export function normalizeRevenueSegmentationRows(
  raw: unknown,
  symbol: string,
): RevenueSegmentRow[] {
  if (!Array.isArray(raw)) return [];
  const toFinite = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const rows: RevenueSegmentRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = String(row.date ?? "");
    const fiscalYear = String(
      row.fiscalYear ?? row.calendarYear ?? (date ? date.slice(0, 4) : ""),
    );
    const period = String(row.period ?? "FY");
    const rawProducts = Array.isArray(row.products)
      ? row.products
      : Array.isArray(row.data)
        ? row.data
        : [];
    const products: RevenueSegmentRow["products"] = [];
    for (const entryRaw of rawProducts) {
      if (!entryRaw || typeof entryRaw !== "object") continue;
      const entry = entryRaw as Record<string, unknown>;
      const name = String(
        entry.name ?? entry.product ?? entry.segment ?? "",
      ).trim();
      const revenue = toFinite(
        entry.revenue ?? entry.value ?? entry.revenueValue,
      );
      if (!name || revenue === null) continue;
      products.push({ name, revenue });
    }
    rows.push({
      date,
      symbol: String(row.symbol ?? symbol),
      reportedCurrency: String(row.reportedCurrency ?? "USD"),
      fiscalYear,
      period,
      totalRevenue:
        products.length > 0
          ? products.reduce((acc, p) => acc + p.revenue, 0)
          : null,
      products,
    });
  }
  return rows;
}

/**
 * True when an FMP payload is an error object rather than data. FMP signals
 * quota exhaustion / bad keys with HTTP 200 + `{"Error Message": ...}` (and
 * occasionally `{error}` / `{message}`), which the JSON fetcher would
 * otherwise mistake for a legitimately empty response.
 */
export function isFmpErrorPayload(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj["Error Message"] === "string" ||
    typeof obj.error === "string" ||
    typeof obj.message === "string"
  );
}

// ---- Public service --------------------------------------------------------
export const stockService = {
  /**
   * Quote for a single ticker. Yahoo → FMP → AlphaVantage fallback chain.
   *
   * The FMP /stable/ shape uses `?symbol=…` query params. If Yahoo didn't
   * yield EPS (yahoofinance dropped `epsTrailingTwelveMonths` on some
   * tickers), we back-fill EPS from `key-metrics-ttm.netIncomePerShareTTM`
   * — `/stable/` quote stripped the embedded `eps` field. PE is back-filled
   * from `ratios-ttm.priceEarningsRatioTTM` when Yahoo's trailingPE is null.
   */
  async getQuote(symbol: string): Promise<StockQuote | null> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const cacheKey = `quote_${normalizedSymbol}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as StockQuote | null;

    return quoteInFlight.getOrCreate(cacheKey, async () => {
      if (cache.has(cacheKey)) return cache.get(cacheKey) as StockQuote | null;

      let result: StockQuote | null = await yahooQuote(normalizedSymbol);
      if (!result && hasFmp()) {
        const url = QUOTE_USE_QUERY_PARAM
          ? fmpUrl("quote", { symbol: normalizedSymbol })
          : fmpUrl(`quote/${normalizedSymbol}`);
        const raw = await fetchJSON<any>(url, `quote/${normalizedSymbol}`);
        if (raw) {
          const row = Array.isArray(raw) ? raw[0] : raw;
          result = normalizeQuote(row);
          if (result && (result.eps === undefined || result.pe === undefined)) {
            const metrics = await this.getMetrics(normalizedSymbol);
            if (result.eps === undefined) {
              const eps = metrics.metrics?.netIncomePerShareTTM;
              if (eps && Number.isFinite(eps)) result.eps = eps;
            }
            if (result.pe === undefined) {
              const ratiosPe = metrics.ratios?.priceEarningsRatioTTM ?? null;
              if (ratiosPe && Number.isFinite(ratiosPe)) result.pe = ratiosPe;
            }
          }
        }
      }
      if (!result && AV_KEY) {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${normalizedSymbol}&apikey=${AV_KEY}`;
        apiUsageTracker.recordCall("alphavantage");
        const raw = await fetchJSON<any>(url, `av quote/${normalizedSymbol}`);
        const g = raw?.["Global Quote"];
        if (g) {
          const toNum = (s: unknown) => {
            const n = Number(String(s ?? "").replace(/[%,$]/g, ""));
            return Number.isFinite(n) ? n : undefined;
          };
          result = normalizeQuote({
            symbol: g["01. symbol"] ?? normalizedSymbol,
            price: toNum(g["05. price"]),
            change: toNum(g["09. change"]),
            changesPercentage: toNum(g["10. change percent"]),
            previousClose: toNum(g["08. previous close"]),
          });
        }
      }

      cache.set(cacheKey, result, result ? QUOTE_TTL : QUOTE_NEGATIVE_TTL);
      return result;
    });
  },

  /**
   * Batch quotes use the verified active FMP shape when configured. A partial
   * provider response falls back only for missing symbols, with bounded
   * concurrency, and every caller receives its own requested order.
   */
  async getBatchQuotes(symbols: string[]): Promise<BatchQuoteResponse> {
    if (symbols.length === 0) return { quotes: [] };
    const requested = symbols.map((symbol) => symbol.trim().toUpperCase());
    const canonical = canonicalSymbols(requested);
    const cacheKey = `batch_${canonical.join(",")}`;
    const cached = cache.get<BatchQuoteResponse>(cacheKey);
    if (cached)
      return { quotes: orderByRequestedSymbols(requested, cached.quotes) };

    const canonicalPayload = await batchQuoteInFlight.getOrCreate(
      cacheKey,
      async () => {
        const existing = cache.get<BatchQuoteResponse>(cacheKey);
        if (existing) return existing;

        const quotes = await resolveOrderedBatch<StockQuote>({
          symbols: canonical,
          concurrency: 8,
          fetchBatch: async (batchSymbols) => {
            if (!hasFmp()) return null;
            const raw = await fetchJSON<any>(
              buildFmpBatchUrl(
                FMP_BASE,
                FMP_KEY,
                batchSymbols,
                QUOTE_USE_QUERY_PARAM,
              ),
              `batch quote: ${batchSymbols.length}`,
              18000,
            );
            const rows = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.data)
                ? raw.data
                : null;
            if (!rows) return null;
            return rows
              .map(normalizeQuote)
              .filter((quote): quote is StockQuote => quote !== null);
          },
          fetchSingle: (singleSymbol) => this.getQuote(singleSymbol),
        });
        const payload: BatchQuoteResponse = { quotes };
        const hasLiveQuote = quotes.some(Boolean);
        cache.set(
          cacheKey,
          payload,
          hasLiveQuote ? QUOTE_TTL : QUOTE_NEGATIVE_TTL,
        );
        return payload;
      },
    );

    return {
      quotes: orderByRequestedSymbols(requested, canonicalPayload.quotes),
    };
  },

  async getProfile(symbol: string): Promise<CompanyProfile | null> {
    return (await this.getProfileValidation(symbol)).profile;
  },

  async getProfileValidation(
    symbol: string,
  ): Promise<{ profile: CompanyProfile | null; unavailable: boolean }> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    // Namespaced from the prod twin: `api/_router.js` (the Vercel
    // router) stores a FLAT CompanyProfile under `profile_<SYMBOL>`, while
    // this service path stores `{ profile, unavailable }`. The prefix
    // keeps the shapes apart so a dev instance sharing the KV store
    // can never poison prod's reads with the wrong envelope.
    const cacheKey = `profile_ts_${normalizedSymbol}`;
    const cached = await kvJsonCache.get<{
      profile: CompanyProfile | null;
      unavailable: boolean;
    }>(cacheKey);
    if (cached) return cached;

    return profileInFlight.getOrCreate(cacheKey, async () => {
      // Re-check inside the in-flight lock so two concurrent misses that
      // both waited on the registry still don't issue duplicate upstream
      // calls — the registry serialises them, and the second lockee finds
      // the freshly-written KV entry from the first.
      const inFlightCached = await kvJsonCache.get<{
        profile: CompanyProfile | null;
        unavailable: boolean;
      }>(cacheKey);
      if (inFlightCached) return inFlightCached;
      const result = await fetchProfileWithAvailability(normalizedSymbol);
      // 1h on a real profile so a second lambda (cold start) reads the same
      // company description / sector instead of hitting FMP again. Short
      // backoff on the unavailable path so the next deployment can recover.
      const ttl = result.profile ? 3600 : PROFILE_NEGATIVE_TTL;
      await kvJsonCache.set(cacheKey, result, ttl);
      return result;
    });
  },

  /**
   * Fetch historical financial statements via Yahoo Finance fundamentalsTimeSeries.
   * Used as a fallback when FMP is unavailable or rate limited.
   */
  async getYahooFinancialStatements(
    ticker: string,
    period: "annual" | "quarter" = "annual",
    limit: number = period === "quarter" ? 7 : 5,
  ): Promise<FinancialStatements> {
    try {
      const type = period === "quarter" ? "quarterly" : "annual";
      const fallbackDate = new Date();
      // To get 20 quarters, we need at least 5 years. 6 years gives a safe buffer (24 quarters).
      fallbackDate.setFullYear(fallbackDate.getFullYear() - 6);
      let res: any[] = await yahooFinance.fundamentalsTimeSeries(ticker, {
        module: "all",
        type,
        period1: fallbackDate.toISOString(),
      });
      if (!res || res.length === 0) {
        return {
          income: [],
          balance: [],
          cash: [],
          sources: { income: null, balance: null, cash: null },
        };
      }

      // Yahoo returns chronological order. Slice to get the most recent `limit` items.
      if (res.length > limit) {
        res = res.slice(-limit);
      }

      // Normalize to our expected format
      const getPeriod = (r: any) => {
        if (period === "annual") return "FY";
        const m = new Date(r.date).getMonth(); // 0-11
        return `Q${Math.ceil((m + 1) / 3)}`;
      };

      const hasFinite = (value: unknown): boolean => {
        const n = Number(value);
        return Number.isFinite(n);
      };
      const incomeRows = res.filter(
        (r: any) =>
          hasFinite(r.totalRevenue ?? r.revenue) ||
          hasFinite(r.grossProfit) ||
          hasFinite(r.netIncome) ||
          hasFinite(r.basicEPS ?? r.dilutedEPS),
      );
      const balanceRows = res.filter(
        (r: any) =>
          hasFinite(r.totalAssets) ||
          hasFinite(r.totalDebt) ||
          hasFinite(
            r.cashAndCashEquivalents ??
              r.cashCashEquivalentsAndShortTermInvestments,
          ),
      );
      const cashRows = res.filter(
        (r: any) =>
          hasFinite(
            r.operatingCashFlow ?? r.cashFlowFromContinuingOperatingActivities,
          ) ||
          hasFinite(r.freeCashFlow) ||
          hasFinite(r.capitalExpenditure),
      );

      const income = incomeRows.map((r: any) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        symbol: ticker,
        reportedCurrency: "USD",
        calendarYear: new Date(r.date).getFullYear().toString(),
        period: getPeriod(r),
        revenue: r.totalRevenue || 0,
        costOfRevenue: r.costOfRevenue || r.reconciledCostOfRevenue || 0,
        grossProfit: r.grossProfit || 0,
        operatingIncome: r.operatingIncome || 0,
        operatingExpense: r.operatingExpense || 0,
        ebitda: r.EBITDA || r.normalizedEBITDA || 0,
        netIncome: r.netIncome || 0,
        eps: r.basicEPS || 0,
        epsDiluted: r.dilutedEPS || 0,
      }));

      const balance = balanceRows.map((r: any) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        symbol: ticker,
        reportedCurrency: "USD",
        calendarYear: new Date(r.date).getFullYear().toString(),
        period: getPeriod(r),
        totalAssets: r.totalAssets || 0,
        totalLiabilities: r.totalLiabilitiesNetMinorityInterest || 0,
        totalEquity: r.stockholdersEquity || 0,
        totalDebt: r.totalDebt || 0,
        cashAndCashEquivalents:
          r.cashAndCashEquivalents ||
          r.cashCashEquivalentsAndShortTermInvestments ||
          0,
        netDebt: r.netDebt || 0,
      }));

      const cash = cashRows.map((r: any) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        symbol: ticker,
        reportedCurrency: "USD",
        calendarYear: new Date(r.date).getFullYear().toString(),
        period: getPeriod(r),
        operatingCashFlow:
          r.operatingCashFlow ||
          r.cashFlowFromContinuingOperatingActivities ||
          0,
        capitalExpenditure: r.capitalExpenditure || 0,
        freeCashFlow: r.freeCashFlow || 0,
      }));

      return {
        income,
        balance,
        cash,
        sources: {
          income: income.length > 0 ? "yahoo" : null,
          balance: balance.length > 0 ? "yahoo" : null,
          cash: cash.length > 0 ? "yahoo" : null,
        },
      };
    } catch (e) {
      throttledWarn(
        `yahooFinance:fundamentalsTimeSeries:${ticker}`,
        `[YahooFinance] Failed to fetch fundamentalsTimeSeries for ${ticker}:`,
        e,
      );
      return {
        income: [],
        balance: [],
        cash: [],
        sources: { income: null, balance: null, cash: null },
      };
    }
  },

  async getFinancialStatements(
    symbol: string,
    period: "annual" | "quarter" = "annual",
  ): Promise<FinancialStatements> {
    const cacheKey = `financials_${symbol}_${period}`;
    const cached = await kvJsonCache.get<FinancialStatements>(cacheKey);
    if (cached) return cached;

    let result: FinancialStatements = { income: [], balance: [], cash: [] };
    const limit = period === "quarter" ? 7 : 5;
    let primary: FinancialStatements = {
      income: [],
      balance: [],
      cash: [],
    };

    if (hasFmp()) {
      const extra: Record<string, string | number> = { limit };
      if (period === "quarter") extra.period = "quarter";
      const [incomeRaw, balanceRaw, cashRaw] = await Promise.all([
        fetchJSON<any[]>(
          tickerUrl("income-statement", symbol, extra),
          `income/${symbol}/${period}`,
        ),
        fetchJSON<any[]>(
          tickerUrl("balance-sheet-statement", symbol, extra),
          `balance/${symbol}/${period}`,
        ),
        fetchJSON<any[]>(
          tickerUrl("cash-flow-statement", symbol, extra),
          `cash/${symbol}/${period}`,
        ),
      ]);

      primary = {
        income: Array.isArray(incomeRaw)
          ? incomeRaw.map(normalizeIncomeRow)
          : [],
        balance: Array.isArray(balanceRaw)
          ? balanceRaw.map(normalizeBalanceRow)
          : [],
        cash: Array.isArray(cashRaw) ? cashRaw.map(normalizeCashRow) : [],
      };
    }

    // FMP is preferred when each statement is available. Yahoo supplies an
    // independent fallback, so one missing FMP statement does not hide the
    // other two. Avoid the extra Yahoo request when FMP already returned all
    // three statement families; otherwise fetch Yahoo and merge per family.
    const hasAllPrimaryStatements =
      primary.income.length > 0 &&
      primary.balance.length > 0 &&
      primary.cash.length > 0;
    const fallback = hasAllPrimaryStatements
      ? { income: [], balance: [], cash: [] }
      : await this.getYahooFinancialStatements(symbol, period, limit);
    result = mergeFinancialStatements(primary, fallback);

    // 1h KV TTL — earnings reports anchor once per quarter so this stays
    // warm across cold starts without serving stale pre-earnings figures.
    // Cross-lambda propagation matters here: a freshly-deployed peer
    // skipping the FMP re-fetch after `Object` writeback is the same win
    // as the locked-premium route.
    await kvJsonCache.set(cacheKey, result, 3600);
    return result;
  },

  /**
   * Revenue broken down by product segment (FMP `revenue-product-segmentation`).
   *
   * Distinct from `getFinancialStatements` (total revenue): this endpoint
   * splits each reporting period into per-product lines. Both annual and
   * quarterly periods are served (the chart modal's granularity toggle
   * requests quarters so each bar is one 10-Q segment filing). The FMP
   * free (Basic) plan caps responses at ~10 rows per call, so annual uses
   * `limit=5` (five fiscal years) and quarterly `limit=8` (two years of
   * quarters) — each a single call.
   *
   * Free-tier fallback: an HTTP 429/403 (or an FMP error body) flips
   * `rateLimited` instead of returning an empty payload, so the client can
   * keep the segment filters visible as a locked premium feature while
   * rendering the plain total-revenue card. No FMP key → `unavailable: true`
   * and the network is never touched.
   *
   * Caching: this payload is durable — once one lambda discovers the FMP
   * quota is exhausted, every other instance should see the same
   * `rateLimited: true` state on its cold start so we don't rack up
   * another 429. The KV-backed `kvJsonCache` (local NodeCache mirror +
   * Vercel KV when `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set) gives
   * us that cross-instance propagation; without it, this method still
   * works correctly per-instance via the local cache. Rate-limited
   * payloads back off briefly (5 min) so the page doesn't re-hit a
   * quota FMP still refuses; real data sticks for an hour.
   */
  async getRevenueSegmentation(
    symbol: string,
    period: "annual" | "quarter" = "annual",
  ): Promise<RevenueSegmentation> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    // Annual and quarterly payloads cache under separate keys so the modal's
    // granularity toggle never serves one period's rows as the other.
    const cacheKey = `revenueSegmentation_${normalizedSymbol}_${period}`;
    const cached = await kvJsonCache.get<RevenueSegmentation>(cacheKey);
    if (cached) return cached;

    if (!hasFmp()) {
      const noKeyResult: RevenueSegmentation = {
        rows: [],
        rateLimited: false,
        unavailable: true,
      };
      // No FMP key is a stable config — cache it for an hour so the
      // client doesn't refetch a known-missing dependency on every page
      // load. A live KV write also lets a freshly-deployed instance
      // learn the config from its peers instead of probing every time.
      await kvJsonCache.set(cacheKey, noKeyResult, 3600);
      return noKeyResult;
    }

    apiUsageTracker.recordCall("fmp");
    // Status-aware fetch so a hard 429 never masquerades as "no data" —
    // the client needs `rateLimited` to pick the fallback card view.
    const url = tickerUrl("revenue-product-segmentation", normalizedSymbol, {
      period,
      limit: period === "quarter" ? 8 : 5,
    });
    const result = await fetchJSONStatus<any>(
      url,
      `revenue-segmentation/${normalizedSymbol}`,
      12000,
    );

    let rows: RevenueSegmentRow[] = [];
    let rateLimited = false;
    if (result.status === 429 || result.status === 403) {
      rateLimited = true;
      apiUsageTracker.recordRateLimit("fmp");
    } else if (result.data) {
      rows = normalizeRevenueSegmentationRows(result.data, normalizedSymbol);
      // FMP also signals quota exhaustion with HTTP 200 + an error body —
      // that parses to a non-array object, which normalizes to zero rows.
      // Treat it as rate-limited rather than "no segment data".
      if (rows.length === 0 && isFmpErrorPayload(result.data)) {
        rateLimited = true;
        apiUsageTracker.recordRateLimit("fmp");
      }
    }

    const payload: RevenueSegmentation = {
      rows,
      rateLimited,
      unavailable: false,
    };
    // Rate-limited payloads back off briefly (5 min KV TTL) so the page
    // doesn't re-hit a quota FMP still refuses — KV writes are durable,
    // so a cold-started lambda on the other side of the cluster reads
    // the same `rateLimited: true` and skips the upstream call too.
    // Real data sticks for an hour.
    await kvJsonCache.set(cacheKey, payload, rateLimited ? 300 : 3600);
    return payload;
  },

  async getMetrics(symbol: string): Promise<StockMetrics> {
    const cacheKey = `metrics_${symbol}`;
    const cached = await kvJsonCache.get<StockMetrics>(cacheKey);
    if (cached) return cached;

    const extract = (value: unknown): number | undefined => {
      if (value === undefined || value === null || value === "")
        return undefined;
      if (typeof value === "object" && value !== null && "raw" in value) {
        return extract((value as { raw?: unknown }).raw);
      }
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };

    const getYahooMetrics = async (): Promise<StockMetrics> => {
      try {
        const raw: any = await yahooFinance.quoteSummary(symbol, {
          modules: [
            "defaultKeyStatistics",
            "financialData",
            "summaryDetail",
            "price",
          ],
        });
        const dks = raw?.defaultKeyStatistics ?? {};
        const fd = raw?.financialData ?? {};
        const sd = raw?.summaryDetail ?? {};
        const price = raw?.price ?? {};
        // Yahoo's free cash flow + market cap let us derive the
        // price-to-cash-flow coverage ratios without FMP's premium
        // /ratios-ttm endpoint. Falls back to null when a field is missing.
        const marketCap = extract(price.marketCap) ?? null;
        const operatingCashFlow = extract(fd.operatingCashflow) ?? null;
        const freeCashFlow = extract(fd.freeCashflow) ?? null;
        // A finite number is real data even at a literal 0 (breakeven FCF,
        // zero-dividend yield) — only non-finite values mean "missing".
        // Denominator operands additionally reject 0 so a division can
        // never produce Infinity that leaks through toFixed rendering.
        const hasValue = (v: number | null): v is number =>
          v !== null && Number.isFinite(v);
        const pcf =
          hasValue(operatingCashFlow) &&
          hasValue(marketCap) &&
          operatingCashFlow !== 0
            ? marketCap / operatingCashFlow
            : null;
        const pfcf =
          hasValue(freeCashFlow) && hasValue(marketCap) && freeCashFlow !== 0
            ? marketCap / freeCashFlow
            : null;
        const fcfYield =
          hasValue(freeCashFlow) && hasValue(marketCap) && marketCap !== 0
            ? (freeCashFlow / marketCap) * 100
            : null;
        const metrics: KeyMetricsTTM = {
          revenuePerShareTTM: extract(fd.revenuePerShare),
          netIncomePerShareTTM: extract(dks.trailingEps),
          peRatioTTM: extract(sd.trailingPE),
          dividendYieldTTM: normalizeYahooPercentage(
            extract(sd.dividendYield) ??
              extract(sd.trailingAnnualDividendYield),
          ),
          // EV/Revenue is a different ratio (mapped to evToSalesTTM
          // below) — it must not masquerade as price-to-sales.
          priceToSalesRatioTTM: extract(sd.priceToSalesTrailing12Months),
          priceToBookRatioTTM: extract(dks.priceToBook),
          evToSalesTTM: extract(dks.enterpriseToRevenue),
          evToEBITDATTM: extract(dks.enterpriseToEbitda),
          returnOnEquityTTM: fmpToPercent(extract(fd.returnOnEquity)),
          returnOnAssetsTTM: fmpToPercent(extract(fd.returnOnAssets)),
          freeCashFlowYieldTTM: fcfYield ?? undefined,
        };
        const ratios: RatiosTTM = {
          priceEarningsRatioTTM: extract(sd.trailingPE),
          priceToBookRatioTTM: extract(dks.priceToBook),
          priceToSalesRatioTTM: extract(sd.priceToSalesTrailing12Months),
          priceToEarningsGrowthRatioTTM: extract(dks.pegRatio),
          priceToOperatingCashFlowRatioTTM: pcf ?? undefined,
          priceToFreeCashFlowRatioTTM: pfcf ?? undefined,
          netProfitMargin: normalizeYahooPercentage(extract(fd.profitMargins)),
          operatingProfitMarginTTM: normalizeYahooPercentage(
            extract(fd.operatingMargins),
          ),
          grossProfitMarginTTM: normalizeYahooPercentage(
            extract(fd.grossMargins),
          ),
          dividendPayoutRatioTTM: normalizeYahooPercentage(
            extract(sd.payoutRatio),
          ),
          currentRatio: extract(fd.currentRatio),
          quickRatio: extract(fd.quickRatio),
          debtToEquityRatio: extract(fd.debtToEquity),
        };
        const hasValues =
          Object.values(metrics).some((v) => v !== undefined) ||
          Object.values(ratios).some((v) => v !== undefined);
        // Availability: derived metrics that lack an input are calcBroken,
        // roic is FMP-premium only (Yahoo never supplies it), so it's pro.
        const availability: Partial<Record<string, AvailabilityState>> = {
          pcf: pcf === null ? "calcBroken" : "available",
          pfcf: pfcf === null ? "calcBroken" : "available",
          fcfYield: fcfYield === null ? "calcBroken" : "available",
          roic: "pro",
        };
        return {
          metrics: hasValues ? metrics : {},
          ratios: hasValues ? ratios : {},
          scores: null,
          source: hasValues ? "yahoo" : null,
          availability: hasValues ? availability : undefined,
        };
      } catch (error: any) {
        throttledWarn(
          `metrics-yahoo:${symbol}`,
          `[stockService] Yahoo metrics ${symbol} failed: ${error?.message ?? error}`,
        );
        return { metrics: {}, ratios: {}, scores: null, source: null };
      }
    };

    if (!hasFmp()) {
      const result = await getYahooMetrics();
      // 1h KV TTL — metrics are slow-moving; cross-lambda propagation
      // means a fresh peer doesn't re-fetch the same Yahoo quoteSummary.
      await kvJsonCache.set(cacheKey, result, 3600);
      return result;
    }
    const [mRes, rRes, sRes] = await Promise.all([
      fetchJSONStatus<any[]>(
        tickerUrl("key-metrics-ttm", symbol),
        `metrics/${symbol}`,
      ),
      fetchJSONStatus<any[]>(
        tickerUrl("ratios-ttm", symbol),
        `ratios/${symbol}`,
      ),
      fetchJSONStatus<any[]>(
        tickerUrl("financial-scores", symbol),
        `scores/${symbol}`,
      ),
    ]);
    const m = mRes.data;
    const r = rRes.data;
    const s = sRes.data;
    const m0 = Array.isArray(m) ? m[0] : m;
    const r0 = Array.isArray(r) ? r[0] : r;
    const s0 = Array.isArray(s) ? s[0] : s;
    const hasObjectValues = (value: unknown): boolean =>
      Boolean(
        value &&
          typeof value === "object" &&
          Object.keys(value as object).length > 0,
      );
    // Classify the FMP failure so the UI can show *why* a value is missing.
    const classifyFmp = (
      status: number | null,
      hasData: boolean,
    ): AvailabilityState | undefined => {
      if (hasData) return undefined; // present → no badge
      if (status === 429 || status === 403) return "rateLimited";
      if (status === 404 || status === null) return "notFound";
      // 200 but empty payload ⇒ premium endpoint returned nothing on free tier
      return "pro";
    };
    const fmpAvailability: Partial<Record<string, AvailabilityState>> = {
      roic: classifyFmp(mRes.status, hasObjectValues(m0)),
      payoutDate: classifyFmp(rRes.status, hasObjectValues(r0)),
    };
    if (!hasObjectValues(m0) && !hasObjectValues(r0) && !hasObjectValues(s0)) {
      const result = await getYahooMetrics();
      // FMP premium endpoints (roic, payoutDate) are paid-only — Yahoo's
      // free tier never supplies them, so mark them `pro` regardless of
      // whether FMP 429'd (no subscription) or returned empty (free tier).
      const merged: StockMetrics = {
        ...result,
        availability: {
          ...(result.availability ?? {}),
          roic: "pro",
          payoutDate: "pro",
        },
      };
      await kvJsonCache.set(cacheKey, merged, 3600);
      return merged;
    }
    // FMP reports percentage metrics as decimal fractions (0.269 =
    // 26.9%, and values can exceed 1 — AAPL ROE ≈ 1.52 = 152%). Convert
    // to percent units at the boundary so renderers (formatPercent)
    // display them correctly, matching the Yahoo path's percent-unit
    // convention. Spread the raw records first so every non-percent
    // field flows through untouched, then override the percent fields.
    const mRaw = (m0 || {}) as Record<string, unknown>;
    const rRaw = (r0 || {}) as Record<string, unknown>;
    const metrics: KeyMetricsTTM = {
      ...(mRaw as KeyMetricsTTM),
      dividendYieldTTM: fmpToPercent(mRaw.dividendYieldTTM),
      freeCashFlowYieldTTM: fmpToPercent(mRaw.freeCashFlowYieldTTM),
      returnOnEquityTTM: fmpToPercent(mRaw.returnOnEquityTTM),
      returnOnAssetsTTM: fmpToPercent(mRaw.returnOnAssetsTTM),
      roicTTM: fmpToPercent(mRaw.roicTTM),
    };
    const ratios: RatiosTTM = {
      ...(rRaw as RatiosTTM),
      netProfitMargin: fmpToPercent(rRaw.netProfitMargin),
      operatingProfitMarginTTM: fmpToPercent(rRaw.operatingProfitMarginTTM),
      grossProfitMarginTTM: fmpToPercent(rRaw.grossProfitMarginTTM),
      dividendPayoutRatioTTM: fmpToPercent(rRaw.dividendPayoutRatioTTM),
    };
    const result: StockMetrics = {
      metrics,
      ratios,
      scores: s0
        ? {
            symbol: String(s0.symbol ?? symbol),
            altmanZScore: s0.altmanZScore,
            piotroskiScore: s0.piotroskiScore,
          }
        : null,
      source: "fmp",
      availability: fmpAvailability,
    };
    await kvJsonCache.set(cacheKey, result, 3600);
    return result;
  },

  /** Yahoo earningsTrend. */
  async getAnalystEstimates(symbol: string): Promise<AnalystTrends> {
    const cacheKey = `analyst_${symbol}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as AnalystTrends;
    try {
      const raw: any = await yahooFinance.quoteSummary(symbol, {
        modules: ["earningsTrend"],
      });
      const trend = raw?.earningsTrend?.trend ?? [];
      // Yahoo earningsTrend values come in two real-world shapes:
      //   1. `{ raw: number, fmt: "x.xx" }` objects (the documented form)
      //   2. plain numbers (some symbols/sessions flatten the shape)
      // Older code only handled #1, which made the client render "0.00" for
      // every cell when Yahoo returned #2 with `.raw` undefined. The
      // helper below accepts either, returning `null` for genuinely
      // missing data so the renderer can show "—" instead of misleading
      // zeros.
      const extract = (v: unknown): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        if (typeof v === "object" && v !== null) {
          const obj = v as Record<string, unknown>;
          const raw = obj.raw;
          const fmt = obj.fmt;
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string") {
            const n = Number(raw);
            if (Number.isFinite(n)) return n;
          }
          if (typeof fmt === "string") {
            const n = Number(fmt);
            if (Number.isFinite(n)) return n;
          }
        }
        return null;
      };
      const normalized: AnalystTrendPoint[] = trend.map((p: any) => ({
        period: String(p.period ?? ""),
        endDate: p.endDate,
        growth: extract(p.growth),
        earningsEstimate: p.earningsEstimate
          ? {
              avg: extract(p.earningsEstimate.avg),
              low: extract(p.earningsEstimate.low),
              high: extract(p.earningsEstimate.high),
            }
          : undefined,
        revenueEstimate: p.revenueEstimate
          ? {
              avg: extract(p.revenueEstimate.avg),
              low: extract(p.revenueEstimate.low),
              high: extract(p.revenueEstimate.high),
            }
          : undefined,
        epsTrend: p.epsTrend
          ? {
              current: extract(p.epsTrend.current),
              sevenDaysAgo: extract(p.epsTrend["7daysAgo"]),
              thirtyDaysAgo: extract(p.epsTrend["30daysAgo"]),
            }
          : undefined,
      }));
      cache.set(cacheKey, normalized);
      return normalized;
    } catch (e: any) {
      throttledWarn(
        `analyst:${symbol}`,
        `[stockService] analyst ${symbol} failed: ${e?.message ?? e}`,
      );
      return [];
    }
  },

  /**
   * Yahoo-driven fallback path for the Index financial-metrics grid when
   * the FMP primary is rate-limited (HTTP 429 from `/stable/`). Surfaces
   * a 4-card compact view of single-point fundamentals + estimates so the
   * page renders honest live numbers with a "(Yahoo estimate)" chip
   * instead of collapsing to "Metrics unavailable" + a no-op retry.
   *
   * - Yahoo free tier doesn't ship historical fundamentals, so this
   *   serves a SNAPSHOT, not a series — the YoY/CAGR 8-card FMP grid
   *   is replaced by 4 single-point cards (Revenue, EBITDA, Gross
   *   Profit, EPS-est). Anything missing upstream normalises to `null`
   *   and renders as `—` so a real `0` can't be confused with "no data".
   * - Cached 5 minutes via the shared `cache` and coalesced via a small
   *   in-flight registry so concurrent calls during a Yahoo outage
   *   don't replicate the upstream call.
   * - Mirrors the parity handler `handleStockYahooFallbackFinancials`
   *   in `api/_router.js` so Vercel (which uses the plain-JS router)
   *   gets the same response shape and coalescing semantics.
   *
   * The provider-health probe + the index metrics grid decide WHEN this
   * is invoked; this method only decides WHAT to return when it is.
   */
  async getYahooFallbackFinancials(
    symbol: string,
  ): Promise<YahooFallbackFinancials> {
    const cacheKey = `yahoo_fallback_financials_${symbol}`;
    if (cache.has(cacheKey))
      return cache.get<YahooFallbackFinancials>(
        cacheKey,
      ) as YahooFallbackFinancials;
    return yahooFallbackInFlight.getOrCreate(cacheKey, async () => {
      // Re-check inside the in-flight registry: another concurrent caller
      // may have populated the cache between the outer miss and the
      // registry getOrCreate lock.
      const inFlight = cache.get<YahooFallbackFinancials>(cacheKey);
      if (inFlight) return inFlight;
      // Coerce both `{ raw, fmt }` object and bare number shapes — Yahoo's
      // `defaultKeyStatistics` module returns bare numbers while
      // `financialData` returns objects. Missing anything → `null`.
      const extractNum = (v: unknown): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        if (typeof v === "object" && v !== null) {
          const obj = v as Record<string, unknown>;
          const raw = obj.raw;
          const fmt = obj.fmt;
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string") {
            const n = Number(raw);
            if (Number.isFinite(n)) return n;
          }
          if (typeof fmt === "string") {
            const n = Number(fmt);
            if (Number.isFinite(n)) return n;
          }
        }
        return null;
      };
      // `margin: 0.18` (a fraction) is what Yahoo ships; downstream UI
      // treats margin fields as percent so multiply by 100 here.
      const extractMarginPct = (v: unknown): number | null => {
        const n = extractNum(v);
        return n === null ? null : n * 100;
      };
      try {
        // Same modules + shape as handleStockMetrics — `defaultKeyStatistics`
        // (EV, eps, debt ratio) + `financialData` (revenue, EBITDA, margins)
        // + `earningsTrend` (consensus next-quarter EPS / revenue).
        const raw: any = await yahooFinance
          .quoteSummary(symbol, {
            modules: ["defaultKeyStatistics", "financialData", "earningsTrend"],
          })
          .catch(() => ({}));
        const dks = raw?.defaultKeyStatistics || {};
        const fd = raw?.financialData || {};
        const trends: any[] = raw?.earningsTrend?.trend ?? [];
        const nextQtr = trends.find((t) => t?.period === "+1q");
        const epsEstNext = nextQtr?.earningsEstimate?.avg;
        const revEstNext = nextQtr?.revenueEstimate?.avg;
        const result: YahooFallbackFinancials = {
          revenue: extractNum(fd.totalRevenue),
          ebitda: extractNum(fd.ebitda),
          grossProfit: extractNum(fd.grossProfits),
          operatingMargin: extractMarginPct(fd.operatingMargins),
          profitMargin: extractMarginPct(fd.profitMargins),
          grossMargin: extractMarginPct(fd.grossMargins),
          revenueGrowth: extractMarginPct(fd.revenueGrowth),
          earningsGrowth: extractMarginPct(fd.earningsGrowth),
          totalCash: extractNum(fd.totalCash),
          totalDebt: extractNum(fd.totalDebt),
          enterpriseValue: extractNum(dks.enterpriseValue),
          trailingEps: extractNum(dks.trailingEps),
          forwardEps: extractNum(dks.forwardEps),
          epsEstimateNextQtr: extractNum(epsEstNext),
          revenueEstimateNextQtr: extractNum(revEstNext),
        };
        cache.set(cacheKey, result, 300);
        return result;
      } catch (e: any) {
        throttledWarn(
          `yahoo-fallback:${symbol}`,
          `[stockService] yahoo fallback ${symbol} failed: ${e?.message ?? e}`,
        );
        // All-null sentinel shape so the client renders four em-dash cards
        // instead of the prior "Metrics unavailable" empty-state. The
        // contract: never throw, always return the strict shape.
        const empty: YahooFallbackFinancials = {
          revenue: null,
          ebitda: null,
          grossProfit: null,
          operatingMargin: null,
          profitMargin: null,
          grossMargin: null,
          revenueGrowth: null,
          earningsGrowth: null,
          totalCash: null,
          totalDebt: null,
          enterpriseValue: null,
          trailingEps: null,
          forwardEps: null,
          epsEstimateNextQtr: null,
          revenueEstimateNextQtr: null,
        };
        cache.set(cacheKey, empty, 300);
        return empty;
      }
    });
  },

  // Internal helper exposed for tests only — keep the API surface clean.

  async getInsiderTrading(symbol: string): Promise<InsiderTransaction[]> {
    const cacheKey = `insider_${symbol}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as InsiderTransaction[];
    try {
      const raw: any = await yahooFinance.quoteSummary(symbol, {
        modules: ["insiderTransactions"],
      });
      const txs = raw?.insiderTransactions?.transactions ?? [];
      const normalized = txs.map((t: any) => normalizeInsider(t));

      // Market close is reference context only; it is never used as the
      // transaction price. Fetch one daily close series for the transaction
      // window and attach exact-date matches when Yahoo provides them.
      const dated = normalized.filter(
        (transaction) => transaction.startDate !== null,
      );
      if (dated.length > 0) {
        try {
          const earliest = Math.min(
            ...dated.map((transaction) => transaction.startDate as number),
          );
          const period1 = new Date(
            Math.max(Date.UTC(2020, 0, 1), earliest - 7 * 86400000),
          );
          const chart: any = await yahooFinance.chart(symbol, {
            period1,
            period2: new Date(),
            interval: "1d",
          });
          const closes = new Map<string, number>();
          for (const point of chart?.quotes ?? []) {
            const close = Number(point?.close);
            if (!Number.isFinite(close)) continue;
            const date =
              point?.date instanceof Date
                ? point.date.toISOString().slice(0, 10)
                : String(point?.date ?? "").slice(0, 10);
            if (/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) closes.set(date, close);
          }
          for (const transaction of normalized) {
            if (transaction.startDate === null) continue;
            const date = new Date(transaction.startDate)
              .toISOString()
              .slice(0, 10);
            transaction.marketClosePrice = closes.get(date) ?? null;
          }
        } catch (error: any) {
          throttledWarn(
            `insider-close:${symbol}`,
            `[stockService] insider market-close context failed for ${symbol}: ${error?.message ?? error}`,
          );
        }
      }

      cache.set(cacheKey, normalized);
      return normalized;
    } catch (e: any) {
      throttledWarn(
        `insider:${symbol}`,
        `[stockService] insider ${symbol} failed: ${e?.message ?? e}`,
      );
      return [];
    }
  },

  /**
   * Institutional / fund / insider ownership snapshot from the free Yahoo
   * `quoteSummary` modules (`defaultKeyStatistics` + `institutionOwnership`
   * + `fundOwnership` + `insiderHolders`). Slow-moving data → 1h KV TTL
   * so cold starts reuse the same snapshot instead of re-hitting Yahoo.
   * Never falls back to premium FMP ownership endpoints — when Yahoo
   * returns nothing, `unavailable: true` is honest.
   */
  async getOwnership(symbol: string): Promise<StockOwnership> {
    const cacheKey = `ownership_${symbol}`;
    const cached = await kvJsonCache.get<StockOwnership>(cacheKey);
    if (cached) return cached;
    const empty: StockOwnership = {
      institutionHolders: [],
      fundHolders: [],
      insiderHolders: [],
      unavailable: true,
    };
    try {
      const raw: any = await yahooFinance.quoteSummary(symbol, {
        modules: [
          "defaultKeyStatistics",
          "institutionOwnership",
          "fundOwnership",
          "insiderHolders",
        ],
      });
      const result = normalizeOwnership(raw);
      await kvJsonCache.set(cacheKey, result, 3600);
      return result;
    } catch (e: any) {
      throttledWarn(
        `ownership:${symbol}`,
        `[stockService] ownership ${symbol} failed: ${e?.message ?? e}`,
      );
      await kvJsonCache.set(cacheKey, empty, 3600);
      return empty;
    }
  },

  /**
   * Yahoo v4 .search() returned news in a flat shape but as of recent
   * v4 updates the response key changed to `quotes`/`news` mixing. We
   * accept either shape.
   */
  async getNews(symbol: string): Promise<NewsItem[]> {
    const cacheKey = `news_${symbol}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as NewsItem[];
    try {
      // newsCount: 12 — bumped from 5 so the in-app news card on /stock/:ticker
      // has enough rows for a real news-feed feel (with thumbnails).
      // 12 is comfortable under Yahoo's ~20-25 free-tier ceiling.
      const raw: any = await yahooFinance.search(symbol, { newsCount: 12 });
      const items = raw?.news ?? [];
      const normalized = items.map(normalizeNewsItem);
      cache.set(cacheKey, normalized);
      return normalized;
    } catch (e: any) {
      throttledWarn(
        `news:${symbol}`,
        `[stockService] news ${symbol} failed: ${e?.message ?? e}`,
      );
      return [];
    }
  },

  async getEarningsCalendar(
    from: string,
    to: string,
  ): Promise<EarningsEvent[]> {
    const cacheKey = `earnings_cal_${from}_${to}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as EarningsEvent[];
    if (!hasFmp()) return [];
    const raw = await fetchJSON<any[]>(
      fmpUrl(EARNINGS_ENDPOINT, { from, to }),
      `earnings ${from}..${to}`,
    );
    const result: EarningsEvent[] = Array.isArray(raw)
      ? raw.map(normalizeEarningEvent)
      : [];

    // FMP's calendar often omits market cap, while the client uses it for
    // the large/mid/small filters. Enrich distinct returned symbols from the
    // quote cache; getBatchQuotes keeps concurrency bounded. Keep a service-level
    // ceiling as a second line of defense against unusually large provider
    // responses exhausting the upstream quote budget.
    const symbols = Array.from(
      new Set(
        result
          .map((event) => event.symbol.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    const enrichSymbols = symbols.slice(0, MAX_EARNINGS_ENRICH_SYMBOLS);
    if (enrichSymbols.length > 0) {
      const quotes = await this.getBatchQuotes(enrichSymbols);
      const marketCaps = new Map<string, number>();
      for (const quote of quotes.quotes) {
        if (
          !quote?.symbol ||
          quote.marketCap === undefined ||
          quote.marketCap <= 0
        )
          continue;
        marketCaps.set(quote.symbol.toUpperCase(), quote.marketCap);
      }
      for (const event of result) {
        event.marketCap ??= marketCaps.get(event.symbol.toUpperCase()) ?? null;
      }
    }

    cache.set(cacheKey, result);
    return result;
  },

  async getChart(symbol: string): Promise<ChartSeries | null> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const cacheKey = `chart_${normalizedSymbol}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) as ChartSeries | null;

    return chartInFlight.getOrCreate(cacheKey, async () => {
      if (cache.has(cacheKey)) return cache.get(cacheKey) as ChartSeries | null;

      // Try FMP first using the path shape that works on the active base:
      //   /stable/ → historical-price-eod/full?symbol=X (1 year daily OHLC)
      //   /api/v3/ → historical-price-full/X?timeseries=N (1 year daily)
      // On failure (404/402/403) fall back to Yahoo historical which is always on.
      if (hasFmp()) {
        try {
          const url = QUOTE_USE_QUERY_PARAM
            ? fmpUrl(CHART_ENDPOINT, { symbol: normalizedSymbol })
            : fmpUrl(`${CHART_ENDPOINT}/${normalizedSymbol}`, {
                timeseries: 200,
              });
          const raw = await fetchJSON<any>(url, `chart/${normalizedSymbol}`);
          if (raw) {
            // /stable/ of {symbol, historical: [...]}; v3 same shape (keyed under "historical").
            const rows = Array.isArray(raw.historical)
              ? raw.historical
              : Array.isArray(raw)
                ? raw
                : [];
            const series: ChartSeries = {
              symbol: String(raw.symbol ?? normalizedSymbol),
              historical: rows.map(normalizeChartPoint),
            };
            if (series.historical.length > 0) {
              cache.set(cacheKey, series);
              return series;
            }
          }
        } catch (error) {
          // A restricted/rate-limited FMP chart must not prevent the Yahoo
          // fallback from running. Heatmap callers intentionally tolerate
          // per-symbol failures, but this path should still recover data.
          throttledWarn(
            `chart:fmp:${normalizedSymbol}`,
            `FMP chart ${normalizedSymbol}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      const yahoo = await yahooChart(normalizedSymbol);
      if (yahoo) {
        cache.set(cacheKey, yahoo);
        return yahoo;
      }
      cache.set(cacheKey, null, CHART_NEGATIVE_TTL);
      return null;
    });
  },

  /**
   * Marquee indices for the TopBar pills (Dow Jones, S&P 500, Nasdaq).
   *
   * /stable/ multi-symbol quote is paid-gated (402) and Yahoo Finance is
   * reliably on for index symbols (^GSPC, ^IXIC, ^DJI). We hit Yahoo FIRST
   * and only consult FMP for whichever index Yahoo didn't return. Saves one
   * upstream call per refresh on the common case and avoids the 402 noise
   * in the server log.
   */
  async getIndexQuotes(): Promise<{
    dow: StockQuote | null;
    sp500: StockQuote | null;
    nasdaq: StockQuote | null;
  }> {
    const cacheKey = "index_quotes";
    if (cache.has(cacheKey)) return cache.get(cacheKey) as any;

    // 1. Yahoo-first (parallel). Each index is a normal quote in y-finance v2.
    const [yahooSp, yahooIx, yahooDj] = await Promise.all([
      yahooQuote("^GSPC"),
      yahooQuote("^IXIC"),
      yahooQuote("^DJI"),
    ]);
    let out = {
      sp500: yahooSp,
      nasdaq: yahooIx,
      dow: yahooDj,
    };

    // 2. FMP fallback only for the missing ones. /stable/ indices are paid,
    // so we surface 402 as "no data" rather than crashing.
    if (
      hasFmp() &&
      (!out.sp500?.symbol || !out.dow?.symbol || !out.nasdaq?.symbol)
    ) {
      try {
        const raw = await fetchJSON<any>(
          fmpUrl("quote", { symbol: "^GSPC,^IXIC,^DJI" }),
          "index quotes (fmp fallback)",
          10000,
        );
        const arr: any[] = Array.isArray(raw) ? raw : [];
        const find = (suffix: string) => {
          const match = arr.find((r: any) =>
            String(r.symbol ?? "").endsWith(suffix),
          );
          return match ? normalizeQuote(match) : null;
        };
        out = {
          sp500: out.sp500 ?? find("GSPC"),
          nasdaq: out.nasdaq ?? find("IXIC"),
          dow: out.dow ?? find("DJI"),
        };
      } catch {
        // Already warned by fetchJSON's throttled warn — silent here.
      }
    }

    cache.set(cacheKey, out, QUOTE_TTL);
    return out;
  },

  /**
   * Live "Trending" universe. When FMP is configured this returns the real
   * market movers (biggest gainers → most-active → biggest losers), capped
   * and de-duplicated; otherwise it falls back to the curated editorial
   * list. The client overlays live prices via `useBatchQuotes`, so these
   * rows only carry identity (symbol + name).
   */
  async getTrendingUniverse(): Promise<InsightsTabEntry[]> {
    if (!hasFmp()) return insightsTabUniverses.trending;

    const cacheKey = "trending_movers";
    const cached = cache.get<InsightsTabEntry[]>(cacheKey);
    if (cached) return cached;

    return trendingMoversInFlight.getOrCreate(cacheKey, async () => {
      const inFlightCached = cache.get<InsightsTabEntry[]>(cacheKey);
      if (inFlightCached) return inFlightCached;

      const { entries, rateLimited } = await fetchTrendingMovers();
      const result =
        entries.length > 0 ? entries : insightsTabUniverses.trending;
      // Transient failures recover quickly, but an explicit 429 means the
      // daily quota is exhausted — back off hard so we stop re-firing the
      // three movers calls into an already-throttled key.
      const ttl =
        entries.length > 0
          ? TRENDING_MOVERS_TTL
          : rateLimited
            ? TRENDING_MOVERS_RATE_LIMIT_TTL
            : QUOTE_NEGATIVE_TTL;
      cache.set(cacheKey, result, ttl);
      return result;
    });
  },

  /**
   * Universe for a single Insights tab. `trending` resolves to the live
   * mover list; every other tab stays curated. Labels return as English
   * stable strings so the client can map them to i18n keys.
   */
  async getInsightsTab(tab: string): Promise<InsightsTabResponse> {
    const validKey = (
      Object.keys(insightsTabUniverses) as InsightsTabId[]
    ).includes(tab as InsightsTabId)
      ? (tab as InsightsTabId)
      : "sp500";
    const entries =
      validKey === "trending"
        ? await this.getTrendingUniverse()
        : (insightsTabUniverses[validKey] ?? insightsTabUniverses.sp500);
    return {
      tab: validKey,
      label: insightsTabLabels[validKey],
      entries,
    };
  },

  /**
   * Returns all universes at once for the client-side multi-filter. The
   * `trending` key is replaced with the live mover list when FMP responds.
   */
  async getAllInsightsTabs(): Promise<
    Record<InsightsTabId, InsightsTabEntry[]>
  > {
    return {
      ...insightsTabUniverses,
      trending: await this.getTrendingUniverse(),
    };
  },

  /**
   * Live FX rates for cross-currency portfolio display (Phase 2).
   * Pulls USDEUR=X / USDILS=X / etc. from Yahoo in parallel and returns the
   * pair-quoted JSON the Portfolio UI uses for currency conversion. Cache 1h.
   */
  async getFxRates(
    currencies: FxCurrency[] = ["USD", "ILS", "EUR"],
  ): Promise<FxRatesResponse> {
    const cacheKey = `fx_${currencies.slice().sort().join(",")}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as FxRatesResponse;
    }
    const pairs: string[] = [];
    for (const base of currencies) {
      for (const quote of currencies) {
        if (base !== quote) pairs.push(`${base}${quote}=X`);
      }
    }
    const settled = await Promise.all(
      pairs.map(async (sym) => {
        try {
          const r = await yahooFinance.quote(sym);
          const px = Number(r?.regularMarketPrice ?? NaN);
          return Number.isFinite(px) && px > 0
            ? ([sym.replace("=X", ""), px] as const)
            : null;
        } catch {
          return null;
        }
      }),
    );
    const rates: Record<string, number> = { USDUSD: 1 };
    for (const s of settled) {
      if (s) rates[s[0]] = s[1];
    }
    const out: FxRatesResponse = {
      rates,
      fetchedAt: new Date().toISOString(),
      source: "yahoo",
    };
    cache.set(cacheKey, out, 3600);
    return out;
  },

  /**
   * Sector × days heatmap for an Insights universe. Cache the FULL
   * aggregation result for 15 minutes — every per-ticker chart is
   * independently cached in `getChart` for 1h, so a 30-ticker universe on
   * the first warm call burns ~30 upstream Yahoo requests; subsequent
   * refreshes inside the TTL window are pure node-cache reads.
   *
   * Curated sector metadata from the Insights universe (`sectorMeta`) is
   * the trusted source for sector assignment: when a symbol has a curated
   * tag, the provider profile call is skipped entirely and the tag is used
   * as-is. Provider profile sectors are consulted only for symbols without
   * a curated tag. Symbols with neither fall into `untagged`.
   *
   * The `sectors` arg lets the caller scope the heatmap to a subset of
   * sectors (e.g. "Tech only"); rows whose sector isn't in the allowlist
   * flow into `untagged` so the UI can still count them. Pass `[]` to
   * include every distinct sector in `symbols`.
   *
   * Cache key includes the sorted symbol list, the day count, the sector
   * allowlist, and the normalized sector metadata so distinct calls never
   * reuse an aggregation computed for a different sector mapping.
   */
  async getSectorHeatmap(
    symbols: string[],
    days: number = 5,
    sectorAllow: string[] | null = null,
    sectorMeta: SectorHeatmapMetadata = {},
  ): Promise<SectorHeatmapResponse> {
    if (symbols.length === 0) {
      return {
        days: [],
        rows: [],
        untagged: [],
        generatedAt: new Date().toISOString(),
      };
    }
    const sortedSyms = canonicalSymbols(symbols);
    const allowKey =
      sectorAllow && sectorAllow.length > 0
        ? sectorAllow.slice().sort().join(",")
        : "*";
    // Normalize curated metadata once and keep only entries for symbols that
    // are actually part of this request — stray metadata for other tickers
    // would otherwise pollute the cache key without changing the result.
    const requestedSet = new Set(sortedSyms);
    const curated = normalizeSectorMeta(sectorMeta);
    const curatedForRequest: Record<string, string> = {};
    for (const [sym, sector] of Object.entries(curated)) {
      if (requestedSet.has(sym)) curatedForRequest[sym] = sector;
    }
    const cacheKey = buildSectorHeatmapCacheKey({
      days,
      allowKey,
      meta: curatedForRequest,
      symbols: sortedSyms,
    });
    const cached = cache.get<SectorHeatmapResponse>(cacheKey);
    if (cached) return cached;

    return heatmapInFlight.getOrCreate(cacheKey, async () => {
      const inFlightCached = cache.get<SectorHeatmapResponse>(cacheKey);
      if (inFlightCached) return inFlightCached;

      // Fan out `getChart` per symbol; `getProfile` only for symbols lacking
      // a curated tag (curated tags are trusted universe metadata). Both
      // operations coalesce independently, so overlapping heatmap requests
      // share work.
      const rows = await buildHeatmapRows<SectorHeatmapInputRow>({
        symbols: sortedSyms,
        curated: curatedForRequest,
        getChart: (sym) => this.getChart(sym),
        getProfile: (sym) => this.getProfile(sym),
      });

      const todayIso = new Date().toISOString().slice(0, 10);
      const result = aggregateSectorHeatmap(rows, days, {
        allowedSectors: sectorAllow,
        todayIso,
      });
      // Use short negative TTL for empty results to allow recovery from transient provider issues
      const isEmpty = result.rows.length === 0;
      cache.set(
        cacheKey,
        result,
        isEmpty ? CHART_NEGATIVE_TTL : SECTOR_HEATMAP_TTL,
      );
      return result;
    });
  },

  /**
   * SMA-200 distance per symbol. Computed from `getChart` (which now
   * Yahoo-first), taking the trailing N closes (default 200) and
   * reducing to a mean. Cheap when symbols is < 25; deeper caching
   * recommended if expanded.
   */
  async getSmaDistancesFor(
    symbols: string[],
    windowSize: number = 200,
  ): Promise<SmaDistanceResponse> {
    if (symbols.length === 0) return { rows: [] };
    const cap = Math.max(5, Math.min(200, Math.floor(windowSize)));
    const rows: SmaDistanceRow[] = [];
    const BATCH_SIZE = 8;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batchRows = await Promise.all(
        symbols
          .slice(i, i + BATCH_SIZE)
          .map(async (sym): Promise<SmaDistanceRow> => {
            try {
              const [chart, quote] = await Promise.all([
                this.getChart(sym.toUpperCase()),
                this.getQuote(sym.toUpperCase()),
              ]);
              if (!chart || chart.historical.length === 0) {
                return {
                  symbol: sym,
                  sma200: null,
                  distancePct: null,
                  sampleSize: 0,
                  price: null,
                };
              }
              // Newest-last so `slice(-cap)` gives the most recent N closes.
              // Using date sort — proxies are different, FYI historical may
              // already be in date-asc order from Yahoo.
              const historical = [...chart.historical].sort((a, b) =>
                a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
              );
              const closes = historical
                .map((p) => Number(p.close))
                .filter((n) => Number.isFinite(n) && n > 0);
              const tail = closes.slice(-cap);
              if (tail.length === 0) {
                return {
                  symbol: sym,
                  sma200: null,
                  distancePct: null,
                  sampleSize: 0,
                  price: null,
                };
              }
              const sum = tail.reduce((s, n) => s + n, 0);
              const mean = sum / tail.length;
              const price = quote?.price ?? tail[tail.length - 1];
              const distancePct =
                mean > 0 ? ((price - mean) / mean) * 100 : null;
              return {
                symbol: sym,
                sma200: mean,
                distancePct,
                sampleSize: tail.length,
                price,
              };
            } catch (e: any) {
              throttledWarn(
                `sma:${sym}`,
                `[stockService] sma ${sym} failed: ${e?.message ?? e}`,
              );
              return {
                symbol: sym,
                sma200: null,
                distancePct: null,
                sampleSize: 0,
                price: null,
              };
            }
          }),
      );
      rows.push(...batchRows);
    }
    return { rows };
  },

  /**
   * Live provider health probe so the UI can surface outages instead of
   * silently degrading. Probes one entry PER FEATURE (see
   * `ProviderHealthFeature`):
   *   - yahoo:        quote + chart — keyless real quote round-trip AND a
   *                   historical chart round-trip, so chart-only outages
   *                   (Charts page, heatmaps, SMA) surface separately from
   *                   quote outages instead of hiding under "quote ok"
   *   - fmp:          quote + batch-quote (batch-quote is 402 paid-gated on
   *                   the free tier → `known_restriction`, NOT an outage)
   *   - alphavantage: quote
   * Mirrors scripts/fmp-audit.ts classification. Cached 5 min + coalesced
   * via the in-flight registry so concurrent UI polls share one probe run
   * (the 1-min client poll therefore hits the cache 4/5 times).
   */
  async getProviderHealth(): Promise<ProviderHealthResponse> {
    const cacheKey = "provider_health";
    const cached = cache.get<ProviderHealthResponse>(cacheKey);
    if (cached) return cached;

    return healthInFlight.getOrCreate(cacheKey, async () => {
      const inFlight = cache.get<ProviderHealthResponse>(cacheKey);
      if (inFlight) return inFlight;

      const probeFmp = async (
        feature: ProviderHealthFeature,
        url: string,
      ): Promise<ProviderHealthEntry> => {
        const probeStart = Date.now();
        apiUsageTracker.recordCall("fmp");
        const result = await probeUrlStatus(url);
        const { status, detail } = providerStatusFromProbe(result);
        return {
          provider: "fmp",
          feature,
          status,
          latencyMs: result ? result.latencyMs : Date.now() - probeStart,
          detail,
        };
      };

      const providers = await Promise.all([
        // Yahoo — keyless; a real quote round-trip is the honest probe.
        (async (): Promise<ProviderHealthEntry> => {
          const probeStart = Date.now();
          try {
            const q: any = await withTimeout(
              yahooFinance.quote("AAPL"),
              PROVIDER_HEALTH_TIMEOUT_MS,
            );
            const price = Number(q?.regularMarketPrice ?? 0);
            return {
              provider: "yahoo",
              feature: "quote",
              status: price > 0 ? "ok" : "down",
              latencyMs: Date.now() - probeStart,
              detail: price > 0 ? undefined : "empty quote",
            };
          } catch (e: any) {
            return {
              provider: "yahoo",
              feature: "quote",
              status: "down",
              latencyMs: Date.now() - probeStart,
              detail: e?.message ?? "error",
            };
          }
        })(),
        // Yahoo — chart: a real historical round-trip distinguishes
        // chart-only outages (Charts page, sector heatmaps, SMA-200) from
        // quote outages. Mirrors `yahooChart()`; any positive close counts
        // as data, so a partial series still reads `ok`.
        (async (): Promise<ProviderHealthEntry> => {
          const probeStart = Date.now();
          try {
            const period1 = new Date();
            period1.setFullYear(period1.getFullYear() - 1);
            const raw: any = await withTimeout(
              yahooFinance.chart("AAPL", {
                period1,
                period2: new Date(),
                interval: "1d",
              }),
              PROVIDER_HEALTH_TIMEOUT_MS,
            );
            const rows: any[] = Array.isArray(raw) ? raw : (raw?.quotes ?? []);
            const hasClose = rows.some((r: any) => Number(r?.close ?? 0) > 0);
            return {
              provider: "yahoo",
              feature: "chart",
              status: hasClose ? "ok" : "down",
              latencyMs: Date.now() - probeStart,
              detail: hasClose ? undefined : "empty chart",
            };
          } catch (e: any) {
            return {
              provider: "yahoo",
              feature: "chart",
              status: "down",
              latencyMs: Date.now() - probeStart,
              detail: e?.message ?? "error",
            };
          }
        })(),
        // FMP — quote + batch-quote probes (only when a key is configured).
        hasFmp()
          ? (async (): Promise<ProviderHealthEntry[]> => {
              const quoteUrl = QUOTE_USE_QUERY_PARAM
                ? fmpUrl("quote", { symbol: "AAPL" })
                : fmpUrl(`quote/AAPL`);
              const batchUrl = QUOTE_USE_QUERY_PARAM
                ? fmpUrl("batch-quote", { symbols: "AAPL,MSFT,NVDA" })
                : fmpUrl(`batch-quote/AAPL,MSFT,NVDA`);
              return [
                await probeFmp("quote", quoteUrl),
                await probeFmp("batch-quote", batchUrl),
              ];
            })()
          : Promise.resolve<ProviderHealthEntry[]>([
              {
                provider: "fmp",
                feature: "quote",
                status: "not_configured",
                latencyMs: null,
              },
              {
                provider: "fmp",
                feature: "batch-quote",
                status: "not_configured",
                latencyMs: null,
              },
            ]),
        // AlphaVantage — only probed when a key is configured.
        AV_KEY
          ? (async (): Promise<ProviderHealthEntry> => {
              const probeStart = Date.now();
              const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${AV_KEY}`;
              apiUsageTracker.recordCall("alphavantage");
              const result = await probeUrlStatus(url);
              const { status, detail } = providerStatusFromProbe(result);
              return {
                provider: "alphavantage",
                feature: "quote",
                status,
                latencyMs: result ? result.latencyMs : Date.now() - probeStart,
                detail,
              };
            })()
          : Promise.resolve<ProviderHealthEntry>({
              provider: "alphavantage",
              feature: "quote",
              status: "not_configured",
              latencyMs: null,
            }),
      ]);

      const flat: ProviderHealthEntry[] = providers.flat();
      const result: ProviderHealthResponse = {
        checkedAt: new Date().toISOString(),
        providers: flat,
        // known_restriction is an expected plan limitation, not an outage.
        healthy: flat.every(
          (p) => p.status === "ok" || p.status === "known_restriction",
        ),
      };
      cache.set(cacheKey, result, PROVIDER_HEALTH_TTL);
      return result;
    });
  },
};
