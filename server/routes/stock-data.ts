import { RequestHandler } from "express";
import { stockService } from "../services/stockService";
// Shared symbols-query validation (also consumed by the Vercel
// `_router.js` twin) — see server/services/symbolsQuery.ts.
import {
  MAX_SYMBOLS,
  parseSymbolsQuery,
  TICKER_PATTERN,
} from "../services/symbolsQuery";
import type {
  BatchQuoteResponse,
  ChartSeries,
  CompanyProfile,
  EarningsEvent,
  FinancialStatements,
  FxCurrency,
  FxRatesResponse,
  IndexQuote,
  InsightsTabResponse,
  RevenueSegmentation,
  SmaDistanceResponse,
  StockMetrics,
  StockQuote,
  ProviderHealthResponse,
  SectorHeatmapMetadata,
  SectorHeatmapResponse,
  YahooFallbackFinancials,
} from "../../shared/api";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return TICKER_PATTERN.test(symbol) ? symbol : null;
}

const MAX_SECTOR_LEN = 64;
const SECTOR_NAME_PATTERN = /^[A-Za-z0-9 &\-]+$/; // Letters, digits, spaces, ampersand, hyphen only

/**
 * Parse the optional `sectorMeta=SYM:SECTOR,SYM2:SECTOR2` query parameter
 * into a symbol→sector map. Returns `null` when the payload is malformed
 * (bad ticker, blank/oversized sector, too many entries) so the route can
 * reject it safely — curated metadata must never loosen the symbol
 * validation guarantees the route already enforces for `symbols`.
 */
function parseSectorMeta(value: unknown): SectorHeatmapMetadata | null {
  if (value === undefined) return {};
  if (Array.isArray(value)) return null; // Reject arrays explicitly — symbol-list semantics don't apply to metadata.
  if (typeof value !== "string" || value.trim().length === 0) return {};
  const entries = value.split(",");
  if (entries.length > MAX_SYMBOLS) return null;
  const out: SectorHeatmapMetadata = {};
  for (const entry of entries) {
    const pair = entry.trim();
    if (!pair) continue;
    const sep = pair.indexOf(":");
    if (sep <= 0 || sep === pair.length - 1) return null;
    const symbol = parseTicker(pair.slice(0, sep));
    if (!symbol) return null;
    const sector = pair.slice(sep + 1).trim();
    if (!sector || sector.length > MAX_SECTOR_LEN) return null;
    if (!SECTOR_NAME_PATTERN.test(sector)) return null; // Reject invalid characters
    out[symbol] = sector;
  }
  return out;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Whole days between two YYYY-MM-DD strings (to − from). */
function dateRangeDays(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
    86_400_000
  );
}

/**
 * Parse `?currencies=USD,ILS,…` into the supported FxCurrency list.
 * Lenient by design: entries are uppercased and unknown codes are
 * dropped individually — a request survives as long as ONE supported
 * currency remains (callers 400 on an empty result). Duplicates are
 * removed preserving first-seen order so repeated query values cannot
 * amplify upstream pair requests. If this ever flips to strict
 * validation, update handleFxRates's spec AND the client, which relies
 * on partial success for mixed lists.
 */
function parseFxCurrencies(raw: string): FxCurrency[] {
  const seen = new Set<FxCurrency>();
  const out: FxCurrency[] = [];
  for (const entry of raw.split(",")) {
    const code = entry.trim().toUpperCase();
    if (
      (code === "USD" || code === "ILS" || code === "EUR" || code === "GBP") &&
      !seen.has(code)
    ) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

export const handleStockQuote: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const quote = await stockService.getQuote(symbol);
  res.json(quote satisfies StockQuote | null);
};

export const handleBatchQuotes: RequestHandler = async (req, res) => {
  const parsed = parseSymbolsQuery(
    req.query.symbols !== undefined ? req.query.symbols : req.query.symbol,
  );
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const result: BatchQuoteResponse = await stockService.getBatchQuotes(
    parsed.symbols,
  );
  res.json(result);
};

/**
 * @deprecated The client now hits `/api/stock-overview` for company
 * profile data. This route forwards to `getProfile` so the response shape
 * is `CompanyProfile` (NOT a `StockQuote` — the original alias was a bug).
 */
export const handleStockProfile: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const result = await stockService.getProfileValidation(symbol);
  if (result.unavailable) {
    return res
      .status(503)
      .json({ error: "profile service temporarily unavailable" });
  }
  res.json(result.profile);
};

export const handleStockOverview: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const result = await stockService.getProfileValidation(symbol);
  if (result.unavailable) {
    return res
      .status(503)
      .json({ error: "profile service temporarily unavailable" });
  }
  res.json(result.profile);
};

export const handleStockFinancials: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  // Granularity is opt-in via `?period=quarter`; unknown strings fall
  // back to annual rather than 400-ing the caller so existing clients
  // keep working untouched. (A 400 here would be backwards-incompatible.)
  const periodRaw = String(req.query.period ?? "")
    .trim()
    .toLowerCase();
  const period: "annual" | "quarter" =
    periodRaw === "quarter" ? "quarter" : "annual";
  const data: FinancialStatements = await stockService.getFinancialStatements(
    symbol,
    period,
  );
  res.json(data);
};

export const handleStockMetrics: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data: StockMetrics = await stockService.getMetrics(symbol);
  res.json(data);
};

/**
 * Revenue broken down by product segment (FMP `revenue-product-segmentation`).
 * The response carries `rateLimited` (free-tier quota hit) so the client
 * falls back to the plain total-revenue card while keeping the segment
 * filters visible as a locked premium feature. `period` (annual|quarter)
 * selects the reporting granularity served to the chart modal's toggle.
 */
export const handleRevenueSegmentation: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const period: "annual" | "quarter" =
    req.query.period === "quarter" ? "quarter" : "annual";
  const data: RevenueSegmentation = await stockService.getRevenueSegmentation(
    symbol,
    period,
  );
  res.json(data);
};

/**
 * Yahoo-driven fallback for the Index financial-metrics grid when FMP is
 * rate-limited (HTTP 429 from `/stable/`). Mirrors the parity handler
 * `handleStockYahooFallbackFinancials` in `api/_router.js` so the local
 * dev server and Vercel both return the same response shape.
 * Always returns a `YahooFallbackFinancials` (never throws): missing
 * upstream values normalise to `null` so the client renders em-dashes
 * instead of misleading zeros.
 */
export const handleStockYahooFallbackFinancials: RequestHandler = async (
  req,
  res,
) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data: YahooFallbackFinancials =
    await stockService.getYahooFallbackFinancials(symbol);
  res.json(data);
};

/**
 * Per-provider API usage for the footer's progress bars. Returns a
 * rolling-window call count + reset horizon for each tracked provider
 * (FMP / AV / Yahoo). Cheap to compute (in-process singleton tracker),
 * so the route serves a 5-second freshness cache to dampen any client
 * poll storms.
 *
 * Diagnostic mode: `?mode=status` returns a tiny `{ store, kvConfigured, ready }`
 * object so the user can verify post-provisioning that Vercel KV has
 * taken over from the in-process store. Probe with:
 */
export const handleStockAnalyst: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data = await stockService.getAnalystEstimates(symbol);
  res.json(data);
};

export const handleStockInsider: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data = await stockService.getInsiderTrading(symbol);
  res.json(data);
};

export const handleStockNews: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data = await stockService.getNews(symbol);
  res.json(data);
};

export const handleEarningsCalendar: RequestHandler = async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return res
      .status(400)
      .json({ error: "from and to must be valid YYYY-MM-DD dates" });
  }
  const rangeDays = dateRangeDays(from, to);
  if (rangeDays < 0 || rangeDays > 31) {
    return res
      .status(400)
      .json({ error: "date range must be between 0 and 31 days" });
  }
  const data: EarningsEvent[] = await stockService.getEarningsCalendar(
    from,
    to,
  );
  res.json(data);
};

export const handleStockChart: RequestHandler = async (req, res) => {
  const symbol = parseTicker(req.query.symbol);
  if (!symbol)
    return res.status(400).json({ error: "valid symbol parameter required" });
  const data: ChartSeries | null = await stockService.getChart(symbol);
  res.json(data);
};

export const handleIndexQuotes: RequestHandler = async (_req, res) => {
  const data = await stockService.getIndexQuotes();
  // Wrap in a typed shape for the client; missing entries are null.
  const wrap = (q: StockQuote | null, name: string): IndexQuote | null =>
    q
      ? {
          symbol: q.symbol,
          name,
          price: q.price,
          change: q.change,
          changesPercentage: q.changesPercentage,
        }
      : null;
  res.json({
    dow: wrap(data.dow, "Dow Jones"),
    sp500: wrap(data.sp500, "S&P 500"),
    nasdaq: wrap(data.nasdaq, "Nasdaq"),
  });
};

/**
 * Sector × days heatmap for an Insights universe. Fanned out server-side
 * from `getChart` per symbol, then aggregated by sector in one pass.
 * Whole-aggregation cached for 15 minutes; per-ticker chart cache reused.
 *
 * Query params:
 *   - `symbols=AAPL,MSFT,…` (required, comma-separated; max 50)
 *   - `days=5` (optional, clamped 3-10; default 5)
 *   - `sectors=Technology,Healthcare` (optional allowlist; rows outside the
 *     allowlist flow into `untagged[]` instead of `rows`)
 *   - `sectorMeta=AAPL:Technology,MSFT:Technology` (optional curated
 *     symbol→sector map from the Insights universe; validated tickers,
 *     sector names ≤ 64 chars, max `MAX_SYMBOLS` entries)
 */
export const handleSectorHeatmap: RequestHandler = async (req, res) => {
  const parsed = parseSymbolsQuery(
    req.query.symbols !== undefined ? req.query.symbols : req.query.symbol,
  );
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const { symbols } = parsed;
  const daysRaw = Number(req.query.days ?? 5);
  const days = Math.max(
    3,
    Math.min(10, Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 5),
  );
  const sectorsRaw = String(req.query.sectors || "").trim();
  const sectorAllow =
    sectorsRaw.length > 0
      ? sectorsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
  // Validate sector allowlist names with the same character-set constraint
  if (sectorAllow) {
    for (const sector of sectorAllow) {
      if (sector.length > MAX_SECTOR_LEN || !SECTOR_NAME_PATTERN.test(sector)) {
        return res.status(400).json({ error: "invalid sectors parameter" });
      }
    }
  }
  // Optional curated symbol→sector metadata from the Insights universe.
  // Malformed or oversized payloads are rejected without touching the
  // symbol validation guarantees above.
  const sectorMeta = parseSectorMeta(req.query.sectorMeta);
  if (sectorMeta === null) {
    return res.status(400).json({ error: "invalid sector metadata parameter" });
  }
  const data: SectorHeatmapResponse = await stockService.getSectorHeatmap(
    symbols,
    days,
    sectorAllow,
    sectorMeta,
  );
  res.json(data);
};

/**
 * Curated ticker universe for an Insights tab (Phase 1). The client overlays
 * live prices via `/api/stock-batch-quotes?symbols=…`.
 */
export const handleInsightsTab: RequestHandler = async (req, res) => {
  const tab = String(req.query.tab || "sp500");
  const data: InsightsTabResponse = await stockService.getInsightsTab(tab);
  res.json(data);
};

/**
 * Returns all curated ticker universes for the multi-select filter feature.
 */
export const handleInsightsTabsAll: RequestHandler = async (_req, res) => {
  const data = await stockService.getAllInsightsTabs();
  res.json(data);
};

/**
 * SMA-200 distance for a list of symbols. Symbols are supplied via repeated
 * `symbol=AAPL&symbol=MSFT` OR a single comma-separated `symbols=AAPL,MSFT`
 * parameter — both work because Express populates an array either way.
 *
 * `?window=20` (default 200, max 200) selects the SMA window directly.
 */
export const handleSmaDistances: RequestHandler = async (req, res) => {
  const listRaw = req.query.symbols ?? req.query.symbol;
  const parsed = parseSymbolsQuery(listRaw);
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const { symbols } = parsed;
  const windowRaw = Number(req.query.window ?? 200);
  const windowSize = Number.isFinite(windowRaw) ? windowRaw : 200;
  const data: SmaDistanceResponse = await stockService.getSmaDistancesFor(
    symbols,
    windowSize,
  );
  res.json(data);
};

/**
 * Live FX rates for cross-currency display (Phase 2). Currencies supplied as
 * `?currencies=USD,ILS,EUR` (any order; default USD,ILS,EUR). Yahoo offloads
 * the heavy lifting.
 */
/**
 * Live provider health (Yahoo, FMP, AlphaVantage) for the UI status
 * indicator — lets the app surface provider outages instead of silently
 * degrading. Cached server-side 5 min; see stockService.getProviderHealth.
 */
export const handleProviderHealth: RequestHandler = async (_req, res) => {
  const data: ProviderHealthResponse = await stockService.getProviderHealth();
  res.json(data);
};

export const handleFxRates: RequestHandler = async (req, res) => {
  // Default only when the parameter is ABSENT: an explicitly empty
  // `?currencies=` parses to zero supported currencies and must 400
  // like any other all-unsupported list, per parseFxCurrencies's
  // documented contract.
  const raw =
    req.query.currencies === undefined
      ? "USD,ILS,EUR"
      : String(req.query.currencies);
  const currencies = parseFxCurrencies(raw);
  if (currencies.length === 0) {
    return res.status(400).json({ error: "currencies parameter required" });
  }
  const data: FxRatesResponse = await stockService.getFxRates(currencies);
  res.json(data);
};
