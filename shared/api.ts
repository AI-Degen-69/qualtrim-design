/**
 * Shared API surface between client and server.
 *
 * Everything returned by the server endpoints under /api/* AND fetched by
 * TanStack Query hooks in client/hooks/useStockData.ts is described here.
 * Server normalizers (server/services/stockService.ts) are responsible for
 * converting upstream FMP / Yahoo Finance shapes into these strict shapes.
 *
 * Conventions:
 *  - camelCase keys only. (FMP stable returns camelCase; legacy v3 sometimes
 *    returns PascalCase — see the normalizer.)
 *  - Numbers are real JS numbers, not strings.
 *  - Dates are ISO 8601 strings (YYYY-MM-DD or full ISO).
 *  - Times in `time` are "bmo" = before market open, "amc" = after market close.
 *  - "MOCK" semantics are NEVER passed on the wire: server downstream code
 *    returns 200 + (empty array | null | default object) and the client decides
 *    whether to show the [MOCK] badge.
 */

/* ------------------------------------------------------------------ *
 * Generic discriminated wrapper for upstream                                        *
 * ------------------------------------------------------------------ */
export type ApiResult<T> = T | null;

/* ------------------------------------------------------------------ *
 * Quote + Index widgets                                              *
 * ------------------------------------------------------------------ */
/** Stock quote / latest market data. */
export interface StockQuote {
  symbol: string;
  name?: string;
  price: number;
  /** Absolute intraday change. */
  change: number;
  /** Percent intraday change (already a number, e.g. 1.17 for 1.17%). */
  changesPercentage: number;
  /** Previous close (used for after-hours delta). */
  previousClose?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  /** 50-day moving average. */
  priceAvg50?: number;
  /** 200-day moving average. Used by DipFinder. */
  priceAvg200?: number;
  marketCap?: number;
  volume?: number;
  avgVolume?: number;
  exchange?: string;
  sharesOutstanding?: number;
  eps?: number;
  pe?: number;
  /** Next earnings announcement date (ISO). */
  earningsAnnouncement?: string | null;
  /** Annualized dividend yield as a percentage when supplied by the quote provider. */
  dividendYield?: number;
  /** Annual cash dividend per share, used to audit/derive yield. */
  dividendRate?: number;
  /** Dividend payout ratio as a percentage when supplied by the quote provider. */
  payoutRatio?: number;
}

/** Marquee index quote for the TopBar pills. */
export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
}

/* ------------------------------------------------------------------ *
 * Company Profile (FMP)                                             *
 * ------------------------------------------------------------------ */
export interface CompanyProfile {
  symbol: string;
  companyName: string;
  description: string;
  sector: string;
  industry: string;
  ceo: string;
  website?: string;
  country?: string;
  state?: string;
  city?: string;
  address?: string;
  phone?: string;
  /** FMP returns this as a number (not always present) or string — normalize to number | null. */
  fullTimeEmployees: number | null;
  beta: number | null;
  /** TTM price-to-earnings. Often used as a single P/E. */
  peRatio: number | null;
  marketCap?: number;
  price?: number;
  exchange?: string;
  /** Friendly exchange name from /stable/ (e.g. "NASDAQ Global Select"). Falls back to short `exchange`. */
  exchangeFullName?: string;
  currency?: string;
  ipoDate?: string;
  image?: string;
  /* -------- /stable/-only identity fields (all optional, blank when absent) -------- */
  /** SEC EDGAR Central Index Key. */
  cik?: string;
  /** International Securities Identification Number. */
  isin?: string;
  /** Committee on Uniform Security Identification Procedures number. */
  cusip?: string;
  /** Most-recent quarterly dividend per share in the listing currency. */
  lastDividend?: number;
  /** True when the ticker tracks a pooled investment fund rather than a company. */
  isEtf?: boolean;
  /** True when the ticker tracks an investment fund (mutual fund / closed-end fund). */
  isFund?: boolean;
  /** True when the security is an American Depositary Receipt. */
  isAdr?: boolean;
  /** True when FMP still tracks active quotes for the ticker. */
  isActivelyTrading?: boolean;
  /** True when the company provided their own logo image (vs. a generic fallback). */
  defaultImage?: boolean;
}

/* ------------------------------------------------------------------ *
 * Financial statements (FMP) — one period per row                 *
 * ------------------------------------------------------------------ */
export interface IncomeStatementRow {
  date: string;
  symbol: string;
  reportedCurrency: string;
  calendarYear: string;
  period: string; // FY / Q1 / Q2 / ...
  revenue: number;
  costOfRevenue?: number;
  grossProfit: number;
  operatingIncome?: number;
  operatingExpense?: number;
  ebitda: number;
  netIncome: number;
  eps: number;
  epsDiluted?: number;
  /**
   * Row-level provenance. Present only when the row came from SEC EDGAR
   * XBRL backfill (`"sec"`) — FMP/Yahoo rows leave it unset so recent
   * payloads stay tight. Lets the charts surface badge which periods are
   * SEC-sourced history beyond the FMP free window.
   */
  dataSource?: "fmp" | "yahoo" | "sec";
}

export interface BalanceSheetRow {
  date: string;
  symbol: string;
  reportedCurrency: string;
  calendarYear: string;
  period: string;
  totalAssets: number;
  totalLiabilities?: number;
  totalEquity?: number;
  totalDebt?: number;
  cashAndCashEquivalents: number;
  netDebt?: number;
  /** SEC EDGAR XBRL backfill provenance (see IncomeStatementRow.dataSource). */
  dataSource?: "fmp" | "yahoo" | "sec";
}

export interface CashFlowRow {
  date: string;
  symbol: string;
  reportedCurrency: string;
  calendarYear: string;
  period: string;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  freeCashFlow?: number;
  stockBasedCompensation?: number;
  dividendPayments?: number;
  /** SEC EDGAR XBRL backfill provenance (see IncomeStatementRow.dataSource). */
  dataSource?: "fmp" | "yahoo" | "sec";
}

export type FinancialStatementProvider = "fmp" | "yahoo" | null;

export interface FinancialStatementSources {
  income: FinancialStatementProvider;
  balance: FinancialStatementProvider;
  cash: FinancialStatementProvider;
}

export interface FinancialStatements {
  income: IncomeStatementRow[];
  balance: BalanceSheetRow[];
  cash: CashFlowRow[];
  /** Provider used for each independent statement; null means unavailable. */
  sources?: FinancialStatementSources;
}

/* ------------------------------------------------------------------ *
 * Revenue by segment (FMP revenue-product-segmentation)           *
 * ------------------------------------------------------------------ */
/** One product/segment line within a period's revenue breakdown. */
export interface RevenueSegmentPoint {
  name: string;
  /** Segment revenue in raw USD (already a number, never a formatted string). */
  revenue: number;
}

/** One reporting period's revenue broken down by product/segment. */
export interface RevenueSegmentRow {
  /** Report date (YYYY-MM-DD). */
  date: string;
  symbol: string;
  reportedCurrency: string;
  /** Fiscal year label (e.g. "2025") — aligns with IncomeStatementRow.calendarYear. */
  fiscalYear: string;
  period: string; // FY / Q1 / Q2 / ...
  /** Sum of the parsed segment revenues (raw USD); null when no segments parsed. */
  totalRevenue: number | null;
  products: RevenueSegmentPoint[];
}

/**
 * Response shape for `/api/stock-revenue-segmentation`. The client uses
 * `rows` to render the segment-filtered revenue card, and `rateLimited` to
 * fall back to the plain total-revenue card while still surfacing the
 * segment filters as a locked premium feature.
 */
export interface RevenueSegmentation {
  rows: RevenueSegmentRow[];
  /** True when FMP returned HTTP 429/403 or an error body (free-tier quota). */
  rateLimited: boolean;
  /** True when no FMP key is configured — segments were never attempted. */
  unavailable: boolean;
}

/* ------------------------------------------------------------------ *
 * Key Metrics + Ratios + Scores                                     *
 * ------------------------------------------------------------------ */
export interface KeyMetricsTTM {
  revenuePerShareTTM?: number;
  netIncomePerShareTTM?: number;
  operatingCashFlowPerShareTTM?: number;
  peRatioTTM?: number;
  dividendYieldTTM?: number;
  priceToSalesRatioTTM?: number;
  priceToBookRatioTTM?: number;
  evToSalesTTM?: number;
  evToEBITDATTM?: number;
  evToOperatingCashFlowTTM?: number;
  returnOnEquityTTM?: number;
  returnOnAssetsTTM?: number;
  /**
   * Return on invested capital TTM (FMP `key-metrics-ttm`). FMP reports
   * it as a decimal fraction (0.44 = 44%); the FMP metrics path
   * normalizes it to percent units (44.05) at the API boundary —
   * renderers display it directly.
   */
  roicTTM?: number;
  freeCashFlowYieldTTM?: number;
}

export interface RatiosTTM {
  priceToSalesRatioTTM?: number;
  priceToBookRatioTTM?: number;
  priceToEarningsGrowthRatioTTM?: number;
  /** Headline P/E TTM — present on /stable/ratios-ttm, used to back-fill StockQuote.pe. */
  priceEarningsRatioTTM?: number;
  /** P/operating-cash-flow TTM — FMP's actual field name on `/stable/ratios-ttm`. */
  priceToOperatingCashFlowRatioTTM?: number;
  /** Legacy alias for the older `/ratios` field name; read alongside `priceToOperatingCashFlowRatioTTM`. */
  priceToCashFlowRatioTTM?: number;
  /** Price to free cash flow TTM (FMP `/stable/ratios-ttm`). */
  priceToFreeCashFlowRatioTTM?: number;
  netProfitMargin?: number;
  operatingProfitMarginTTM?: number;
  grossProfitMarginTTM?: number;
  dividendPayoutRatioTTM?: number;
  currentRatio?: number;
  quickRatio?: number;
  debtToEquityRatio?: number;
}

export interface FinancialScores {
  symbol: string;
  altmanZScore?: number;
  piotroskiScore?: number; // 0–9
}

/**
 * Why a metric value is missing / not fully available.
 * - `available`    — value present, render it normally.
 * - `pro`         — gated behind the provider's paid plan; not reachable on any free tier. UI: lock + "Pro".
 * - `rateLimited` — free-tier quota exhausted (HTTP 429); populates once the window resets. UI: clock (amber).
 * - `calcBroken`  — derived from ≥2 inputs and one input is missing. UI: sigma/"?" (neutral).
 * - `stale`       — served from cache but older than the freshness threshold. UI: clock/slash (muted).
 * - `notFound`    — no such endpoint / provider 404 / hard error. UI: red "✕"/"E".
 * - `nullByDesign`— legitimately absent for this instrument (e.g. no dividend). Neutral dash, not an error.
 */
export type AvailabilityState =
  | "available"
  | "pro"
  | "rateLimited"
  | "calcBroken"
  | "stale"
  | "notFound"
  | "nullByDesign";

export interface StockMetrics {
  metrics: KeyMetricsTTM;
  ratios: RatiosTTM;
  scores: FinancialScores | null;
  /** Provider that supplied the metric snapshot; absent only for legacy payloads. */
  source?: FinancialStatementProvider;
  /**
   * Per-metric availability. Keys mirror the leaf metric names used by the
   * UI (e.g. "pcf", "pfcf", "fcfYield", "roic"). Omitted key ⇒ "available".
   */
  availability?: Partial<Record<string, AvailabilityState>>;
}

/* ------------------------------------------------------------------ *
 * Yahoo fallback financials (FMP rate-limited path)                 *
 * ------------------------------------------------------------------ */

/**
 * Single-point fundamentals surfaced via Yahoo's `defaultKeyStatistics` /
 * `financialData` / `earningsTrend` modules. Used ONLY when FMP is
 * rate-limited (HTTP 429) AND the primary `/api/stock-financials`
 * payload is empty — a compact 4-card view of the same shape the user
 * would have seen, with every value labeled "(Yahoo estimate)" so
 * stale-free-tier data can't read as a real primary source.
 *
 * The grid can't show YoY / CAGR series here — Yahoo free tier doesn't
 * ship historical fundamentals — so the page renders 4 single-point
 * cards (Revenue, EBITDA, Gross Profit, EPS-est) instead of the
 * 8-card YoY/CAGR grid the FMP path uses.
 *
 * Numbers are NEVER coerced from null/missing to 0: a missing
 * `revenue` renders `—` on the card so users don't read a real value
 * of zero. Money figures are in raw USD; the page divides by 1e9 for
 * the B-suffix display.
 */
export interface YahooFallbackFinancials {
  /** TTM revenue in raw USD (Yahoo `financialData.totalRevenue`). */
  revenue: number | null;
  /** TTM EBITDA in raw USD (Yahoo `financialData.ebitda`). */
  ebitda: number | null;
  /** TTM gross profit in raw USD (Yahoo `financialData.grossProfits`). */
  grossProfit: number | null;
  /** TTM operating margin as percent (e.g. 18.5 = 18.5%). */
  operatingMargin: number | null;
  /** TTM profit margin as percent. */
  profitMargin: number | null;
  /** TTM gross margin as percent. */
  grossMargin: number | null;
  /** Yahoo-reported revenue growth as percent (most recent YoY). */
  revenueGrowth: number | null;
  /** Yahoo-reported earnings growth as percent (most recent YoY). */
  earningsGrowth: number | null;
  /** Cash + equivalents in raw USD (balance sheet snapshot). */
  totalCash: number | null;
  /** Total debt in raw USD (balance sheet snapshot). */
  totalDebt: number | null;
  /** Enterprise value in raw USD (Yahoo `defaultKeyStatistics.enterpriseValue`). */
  enterpriseValue: number | null;
  /** Trailing EPS (TTM USD per share). */
  trailingEps: number | null;
  /** Forward EPS (next FY USD per share) from analyst consensus. */
  forwardEps: number | null;
  /**
   * Next-quarter EPS estimate (consensus avg, $/share). Sourced from
   * `earningsTrend` row where `period === "+1q"`. Used as the EPS card
   * value in the fallback grid because forward EPS is annual.
   */
  epsEstimateNextQtr: number | null;
  /**
   * Next-quarter revenue estimate (consensus avg, raw USD). Empty data
   * points render `—` rather than a derived 0.
   */
  revenueEstimateNextQtr: number | null;
}

/* ------------------------------------------------------------------ *
 * Analyst estimates (Yahoo earningsTrend)                          *
 * ------------------------------------------------------------------ */
export type AnalystPeriodCode = "-1y" | "-7d" | "0q" | "0y" | "+1q" | "+1y";

export interface AnalystTrendPoint {
  period: AnalystPeriodCode | string;
  endDate?: string;
  growth?: { raw: number; fmt: string } | number;
  earningsEstimate?: {
    avg: number | null;
    low: number | null;
    high: number | null;
  };
  revenueEstimate?: {
    avg: number | null;
    low: number | null;
    high: number | null;
  };
  epsTrend?: {
    current: number | null;
    sevenDaysAgo: number | null;
    thirtyDaysAgo: number | null;
  };
  epsRevisions?: { upLast7Days: number | null; upLast30Days: number | null };
}

export type AnalystTrends = AnalystTrendPoint[];

/* ------------------------------------------------------------------ *
 * Insider transactions (Yahoo)                                     *
 * ------------------------------------------------------------------ */
export type InsiderTransactionCategory =
  | "purchase"
  | "sale"
  | "award"
  | "gift"
  | "optionExercise"
  | "withholding"
  | "disposal"
  | "optionGrant"
  | "conversion"
  | "other";

export interface InsiderTransaction {
  filerName: string;
  filerRelation?: string;
  transactionText: string;
  /**
   * Trade-date as a UTC ms number. Upstream Yahoo `quoteSummary` returns
   * several real-world shapes:
   *   - a native `Date` object,
   *   - an ISO `YYYY-MM-DD` string,
   *   - a `{ raw: <epoch seconds>, fmt: "..." }` object (legacy / some sessions),
   *   - a plain unix-second number.
   * The normalizer in `stockService.normalizeInsider` collapses all four to
   * a safe UTC ms (or `null` for everything pre-1990 / unparseable). UI
   * text uses `Finance.formatTradeDateLocale` over UTC ms.
   */
  startDate: number | null;
  /** Yahoo single-letter code: `P`urchase, `S`ale, `A`ward, `G`ift, `M` option
   * exercise, `F` tax withholding, `D`isposal, `C`onversion, etc. Drives the
   * type-label and the price/value rendering branches in CompanyProfile.
   * Optional because some legacy payloads and the mock path omit it. */
  transactionCode?: string | null;
  /** Number of securities transferred, not a dollar amount. */
  shares: number;
  /** Reported transaction value, or a derived value for an exact reported price. */
  value: number | null;
  valueSource?: "reported" | "derived" | null;
  /** Reported execution/exercise price when parseable; null for ranges or missing data. */
  price: number | null;
  /** Lower/upper bounds when Yahoo reports a price range. */
  priceLow?: number | null;
  priceHigh?: number | null;
  /** Daily close on the transaction date, shown only as market context. */
  marketClosePrice?: number | null;
  category: InsiderTransactionCategory;
  isAdministrative: boolean;
}

/* ------------------------------------------------------------------ *
 * News (Yahoo .search().news)                                       *
 * ------------------------------------------------------------------ */
export interface NewsItem {
  title: string;
  publisher: string;
  /** unix seconds — UI converts to a localized date. */
  providerPublishTime: number;
  link: string;
  /** Optional thumbnail URL — Yahoo v4 sometimes has it. */
  thumbnail?: string;
  type?: string;
}

/* ------------------------------------------------------------------ *
 * Earnings calendar (FMP ?from=YYYY-MM-DD&to=YYYY-MM-DD)           *
 * ------------------------------------------------------------------ */
export type EarningsCallTime = "bmo" | "amc" | "dmh" | string;

export interface EarningsEvent {
  symbol: string;
  /** FMP returns an ISO date, e.g. "2024-08-01". */
  date: string;
  /** Optional market cap enrichment used by earnings filters. */
  marketCap?: number | null;
  epsEstimated: number | null;
  /** FMP gives this only if actual EPS is reported. */
  eps: number | null;
  revenueEstimated: number | null;
  revenue: number | null;
  time: EarningsCallTime;
}

/* ------------------------------------------------------------------ *
 * Chart (FMP historical-price-full)                                *
 * ------------------------------------------------------------------ */
export interface ChartPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  change: number;
  changePercent: number;
}

export interface ChartSeries {
  symbol: string;
  historical: ChartPoint[];
}

/* ------------------------------------------------------------------ *
 * Inclusion list for batch quotes                                   *
 * ------------------------------------------------------------------ */
export interface BatchQuoteResponse {
  /** One entry per ticker, in the same order as requested. Missing symbols become null. */
  quotes: (StockQuote | null)[];
}

/* ------------------------------------------------------------------ *
 * Demo / ping                                                        *
 * ------------------------------------------------------------------ */
export interface DemoResponse {
  message: string;
}
export interface PingResponse {
  message: string;
}

/* ------------------------------------------------------------------ *
 * Insights tab universes (server-curated lists per Insights tab)   *
 * ------------------------------------------------------------------ */
export type InsightsTabId =
  | "sp500"
  | "trending"
  | "growth"
  | "dividend"
  | "buyback"
  | "ai"
  | "cloud"
  | "ev"
  | "leisure";

/** Lightweight entry in a tab universe — the client overlays live prices via `useBatchQuotes`. */
export interface InsightsTabEntry {
  symbol: string;
  /** Curated display name (Yahoo / FMP profile will replace once live). */
  name: string;
  /** Optional sector — surfaced as a chip in the card. */
  sector?: string;
}

export interface InsightsTabResponse {
  tab: InsightsTabId;
  label: string; // localized label, computed by the handler against ?lang=… for SSR parity.
  entries: InsightsTabEntry[];
}

/* ------------------------------------------------------------------ *
 * Per-ticker SMA-200 distance (computed by the server)               *
 * ------------------------------------------------------------------ */
export interface SmaDistanceRow {
  symbol: string;
  /** 200-day SMA. null when fewer than 200 closes were available. */
  sma200: number | null;
  /** (close - sma200) / sma200 * 100. null when sma200 is null. */
  distancePct: number | null;
  /** Number of closes used to compute the SMA — surfaces under-N as [PARTIAL]. */
  sampleSize: number;
  /** That symbol's latest quote price, falling back to the latest historical close. */
  price: number | null;
}

export interface SmaDistanceResponse {
  rows: SmaDistanceRow[];
}

/**
 * One cell of the sector heatmap — a sector's average % move DURING one
 * trading day. `date` is the day the move ENDED on, so for a 5-day heatmap
 * ending 2025-03-21, the heatmap shows the 5 days that ended:
 *   2025-03-17, 2025-03-18, 2025-03-19, 2025-03-20, 2025-03-21
 * `movePct` is null when no ticker in the sector had a close on `date`,
 * `isPartial` is true on the rightmost column (today vs yesterday, i.e.
 * still in-session intraday), and `withPrice`/`total` count how many tickers
 * contributed so the UI can show "12 of 14 contributed".
 */
export interface SectorHeatmapCell {
  date: string;
  movePct: number | null;
  withPrice: number;
  total: number;
  isPartial: boolean;
}

/**
 * One row of the sector heatmap — a sector's 5 daily % moves plus a
 * weekNet rollup. `weekNet` is the average per-ticker cumulative return
 * from the heatmap's oldest column's close to its newest column's close,
 * expressed as a percentage. Sort rows by `weekNet` desc so the hottest
 * sector lands at the top, mirroring Bloomberg's HSPA / HEAT layout.
 */
export interface SectorHeatmapRow {
  sector: string;
  cells: SectorHeatmapCell[];
  weekNet: number | null;
  /** Total tickers in the universe belonging to this sector. */
  universeCount: number;
}

/**
 * Tracks move history for tickers whose universe row lacks a sector tag.
 * Surfaced separately so the heatsheet footer can quote the count without
 * silently misattributing those tickers to a placeholder sector.
 */
export interface SectorHeatmapUntagged {
  symbol: string;
  cells: Array<{
    date: string;
    movePct: number | null;
    isPartial: boolean;
  }>;
}

/**
 * Optional curated symbol→sector map attached to a heatmap request. The
 * Insights universe ships editorial tags per ticker; when present, the
 * server groups by these tags and only falls back to provider profile
 * sectors for symbols without a curated tag. Wire form (query param
 * `sectorMeta`): `SYM:SECTOR,SYM2:SECTOR2` — see `shared/sectorMeta.ts`.
 */
export type SectorHeatmapMetadata = Record<string, string>;

/**
 * Server response for `GET /api/sector-heatmap?symbols=…&days=5`. Column
 * axis (`days`) is oldest → newest ISO dates, matching `rows[*].cells` index
 * order. `generatedAt` is the server's cache-write ISO timestamp so the
 * client can show "Updated 12 min ago" without re-fetching.
 */
export interface SectorHeatmapResponse {
  days: string[];
  rows: SectorHeatmapRow[];
  untagged: SectorHeatmapUntagged[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ *
 * FX rates (Yahoo Finance: USDEUR=X, USDILS=X, EURILS=X)            *
 * ------------------------------------------------------------------ */
export type FxCurrency = "USD" | "ILS" | "EUR" | "GBP";

export interface FxRatesResponse {
  /** Example: { USDILS: 3.75, USDEUR: 0.92, ILSUSD: 0.267, … } */
  rates: Record<string, number>;
  /** ISO timestamp the rates were fetched at server-side. */
  fetchedAt: string;
  /** Source label so the UI can render a tiny "FX from Yahoo" footnote. */
  source: string;
}

/* ------------------------------------------------------------------ *
 * Portfolio analytics (Phase 2)                                     *
 * ------------------------------------------------------------------ */
/** Signed cashflow point. `amount` is USD by convention; negative = invested, positive = received. */
export interface PortfolioCashflow {
  /** ISO date string. */
  date: string;
  amount: number;
}

export interface PortfolioMetrics {
  /** Internal Rate of Return as decimal (e.g. 0.094 = 9.4% APR). */
  irr: number | null;
  /** Compound annual growth rate as decimal. */
  cagr: number | null;
  /** Annualized volatility of daily returns, as decimal. */
  volatility: number | null;
  /** Sharpe ratio (rf = 4.5% default). */
  sharpe: number | null;
  /** Sortino ratio (downside deviation only). */
  sortino: number | null;
  /** Alpha vs SPY (placeholder; null when benchmark unavailable). */
  alpha: number | null;
  /** Beta vs SPY (placeholder; null when benchmark unavailable). */
  beta: number | null;
  /** Free-text note flagging anything derived. */
  derived: string[];
}

/* ------------------------------------------------------------------ *
 * Provider health (GET /api/provider-health)                        *
 * ------------------------------------------------------------------ */
export type ProviderName = "yahoo" | "fmp" | "alphavantage";

/**
 * Live status of a single data-provider FEATURE probe. The response carries
 * one entry per (provider, feature) — FMP appears twice (`quote` +
 * `batch-quote`) and Yahoo twice (`quote` + `chart`) so the UI can separate
 * temporary outages from plan limits and chart-specific outages from
 * quote outages:
 *  - `ok`                — probe succeeded (HTTP 200 / real data returned)
 *  - `known_restriction` — reachable, but the endpoint is NOT on the current
 *                          plan (HTTP 402 Payment Required, e.g. FMP
 *                          `batch-quote` on the free tier). Expected, not an
 *                          outage — the app falls back to another provider.
 *                          HTTP 403 is deliberately NOT folded in: it's
 *                          ambiguous between plan gating and a broken key,
 *                          so it reports as `degraded` and keeps surfacing.
 *  - `degraded`          — reachable but rate-limited (HTTP 429) or an
 *                          upstream error body (HTTP 200 + `Error Message`).
 *  - `down`              — unreachable / errored / timed out (temporary outage).
 *  - `not_configured`    — env key missing, provider never called.
 */
export type ProviderStatus =
  | "ok"
  | "known_restriction"
  | "degraded"
  | "down"
  | "not_configured";

/** Which feature of a provider a health entry probes. */
export type ProviderHealthFeature = "quote" | "batch-quote" | "chart";

export interface ProviderHealthEntry {
  provider: ProviderName;
  feature: ProviderHealthFeature;
  status: ProviderStatus;
  /** Round-trip probe latency in ms; null when not configured. */
  latencyMs: number | null;
  /** Short reason when not ok (e.g. "http_402", "timeout"). */
  detail?: string;
}

export interface ProviderHealthResponse {
  /** ISO timestamp the probes ran at server-side. */
  checkedAt: string;
  providers: ProviderHealthEntry[];
  /** True when no entry is `down` / `degraded` / `not_configured` (`known_restriction` is an expected plan limitation, not an outage). */
  healthy: boolean;
}

/* ------------------------------------------------------------------ *
 * Error shape used by route handlers                                *
 * ------------------------------------------------------------------ */
export interface ApiError {
  error: string;
}
