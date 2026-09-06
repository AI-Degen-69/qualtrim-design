import NodeCache from "node-cache";
import { apiUsageTracker } from "./apiUsageTracker";

// Cache FMP responses for 12 hours (fundamentals don't change frequently)
const cache = new NodeCache({ stdTTL: 43200, checkperiod: 600 });

const FMP_KEY = process.env.FMP_KEY || process.env.VITE_FMP_KEY;
const BASE_URL = "https://financialmodelingprep.com";

async function fetchFMP(
  path: string,
  useCache: boolean = true,
): Promise<any | null> {
  if (!FMP_KEY) {
    console.error("[FMP] API key is missing. Set FMP_KEY in .env");
    return null;
  }

  // ── Cost accounting ─────────────────────────────────────────────────────
  // Count every invocation of `fetchFMP` (cache hit OR miss) so the
  // user-facing budget pill tracks surface-frequency — i.e. "every time
  // the app needed an FMP-shaped answer". This intentionally OVER-counts
  // relative to FMP's server-side dashboard (which only sees cache misses
  // as real upstream HTTP requests) but is conservative-by-design:
  //
  //   * FMP dashboard refuses calls past 250/day.
  //   * Our tracker reflects the user-facing rate of asking for fresh
  //     data, which is what the user perceives as "using the API".
  //
  // The tracker is in-process (singleton `buckets` map). On every dev
  // server restart / Vercel cold-start the counter resets to 0 — which
  // is the dominant source of divergence with FMP's dashboard. Until
  // we move to a persistent store, surface this in the UI tooltip
  // ("usage.singleInstanceNote") rather than mask it.
  apiUsageTracker.recordCall("fmp");

  const cacheKey = `fmp:${path}`;
  if (useCache) {
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;
  }

  try {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}/${path}${separator}apikey=${FMP_KEY}`;
    const res = await fetch(url);
    // Re-arm the rate-limit flag on a hard 4xx — a 429 is the canonical
    // signal, 403 is reported by FMP for some revokes, both are surfaced
    // on the footer's pill. The pre-fetch `recordCall` fired above; we
    // don't double-count here.
    if (res.status === 429 || res.status === 403) {
      apiUsageTracker.recordRateLimit("fmp");
    }
    if (!res.ok) {
      console.error(`[FMP] Error ${res.status} for ${path}`);
      if (res.status === 429 || res.status === 403) return null;
      return null;
    }
    const data = await res.json();

    // FMP returns { "Error Message": "..." } on rate limit / errors —
    // also a 200 OK from FMP's perspective but rate-limited content.
    if (data && data["Error Message"]) {
      console.error(`[FMP] Error for ${path}:`, data["Error Message"]);
      apiUsageTracker.recordRateLimit("fmp");
      return null;
    }

    // Cache valid responses (arrays with data, or objects with historical)
    if (
      (Array.isArray(data) && data.length > 0) ||
      (data && Array.isArray(data.historical) && data.historical.length > 0)
    ) {
      cache.set(cacheKey, data);
    }

    return data;
  } catch (e) {
    console.error(`[FMP] Fetch error for ${path}:`, e);
    return null;
  }
}

/**
 * Fetch annual income statements (5 years).
 */
export async function getIncomeStatements(
  ticker: string,
  period: "annual" | "quarter" = "annual",
) {
  const periodParam = period === "quarter" ? "&period=quarter" : "";
  const data = await fetchFMP(
    `stable/income-statement?symbol=${ticker}&limit=5${periodParam}`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch annual balance sheet statements (5 years).
 */
export async function getBalanceSheets(
  ticker: string,
  period: "annual" | "quarter" = "annual",
) {
  const periodParam = period === "quarter" ? "&period=quarter" : "";
  const data = await fetchFMP(
    `stable/balance-sheet-statement?symbol=${ticker}&limit=5${periodParam}`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch annual cash flow statements (5 years).
 */
export async function getCashFlowStatements(
  ticker: string,
  period: "annual" | "quarter" = "annual",
) {
  const periodParam = period === "quarter" ? "&period=quarter" : "";
  const data = await fetchFMP(
    `stable/cash-flow-statement?symbol=${ticker}&limit=5${periodParam}`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch key metrics (5 years annual).
 */
export async function getKeyMetrics(ticker: string) {
  const data = await fetchFMP(`stable/key-metrics?symbol=${ticker}&limit=5`);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch TTM key metrics.
 */
export async function getKeyMetricsTTM(ticker: string) {
  const data = await fetchFMP(
    `stable/key-metrics-ttm?symbol=${ticker}&limit=1`,
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : {};
}

/**
 * Fetch financial ratios (5 years annual).
 */
export async function getRatios(ticker: string) {
  const data = await fetchFMP(
    `stable/ratios?symbol=${ticker}&limit=5&period=annual`,
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch TTM financial ratios.
 */
export async function getRatiosTTM(ticker: string) {
  const data = await fetchFMP(`stable/ratios-ttm?symbol=${ticker}&limit=1`);
  return Array.isArray(data) && data.length > 0 ? data[0] : {};
}

/**
 * Fetch financial scores (includes Piotroski).
 */
export async function getFinancialScores(ticker: string) {
  const data = await fetchFMP(
    `stable/financial-scores?symbol=${ticker}&limit=1`,
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : {};
}

/**
 * Fetch stock price change percentages (YTD, 1Y, 3Y, etc).
 */
export async function getPriceChange(ticker: string) {
  const data = await fetchFMP(`stable/stock-price-change?symbol=${ticker}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/**
 * Fetch company profile / overview from FMP.
 */
export async function getCompanyProfile(ticker: string) {
  const data = await fetchFMP(`stable/profile?symbol=${ticker}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/**
 * Fetch earnings calendar / historical earnings.
 */
export async function getEarnings(ticker: string) {
  const data = await fetchFMP(`stable/earnings?symbol=${ticker}`);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch dividends history.
 */
export async function getDividends(ticker: string) {
  const data = await fetchFMP(`stable/dividends?symbol=${ticker}`);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch insider trading transactions.
 */
export async function getInsiderTrades(ticker: string) {
  const data = await fetchFMP(`stable/insider-trades?symbol=${ticker}`);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch sector PE snapshot for a given date.
 */
export async function getSectorPE(date?: string) {
  const dateParam = date || new Date().toISOString().slice(0, 10);
  const data = await fetchFMP(`stable/sector-pe-snapshot?date=${dateParam}`);
  if (!data || !Array.isArray(data)) return {};
  // Convert to { SectorName: avgPE } map
  const map: Record<string, number> = {};
  for (const row of data) {
    if (row.sector && row.pe != null) {
      map[row.sector] = parseFloat(row.pe);
    }
  }
  return map;
}

/**
 * Fetch earnings calendar for a date range.
 */
export async function getEarningsCalendar(from?: string, to?: string) {
  const today = new Date();
  const fromStr =
    from || new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const toStr =
    to || new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const data = await fetchFMP(
    `stable/earning-calendar?from=${fromStr}&to=${toStr}`,
  );
  return Array.isArray(data) ? data : [];
}
