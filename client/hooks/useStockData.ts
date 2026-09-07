import { useMemo } from "react";
import { useQuery, useQueries, keepPreviousData } from "@tanstack/react-query";
import type {
  AnalystTrends,
  BatchQuoteResponse,
  ChartSeries,
  CompanyProfile,
  EarningsEvent,
  FinancialStatements,
  FxCurrency,
  FxRatesResponse,
  IndexQuote,
  InsightsTabId,
  InsightsTabResponse,
  InsightsTabEntry,
  InsiderTransaction,
  NewsItem,
  ProviderHealthResponse,
  RevenueSegmentation,
  SmaDistanceResponse,
  ScreenerFundamentalResponse,
  SectorHeatmapMetadata,
  SectorHeatmapResponse,
  StockMetrics,
  StockOwnership,
  StockQuote,
  YahooFallbackFinancials,
} from "@shared/api";
import type { QuickStat } from "@/lib/mockData";
import { serializeSectorMeta } from "@shared/sectorMeta";
import type { CompanyProfile as ApiCompanyProfile } from "@shared/api";
import { chunkSymbols, mergeBatchQuoteResponses } from "@/lib/batchQuotes";
import { isProviderStatus } from "@/lib/providerHealth";

interface IndexQuotesResponse {
  dow: IndexQuote | null;
  sp500: IndexQuote | null;
  nasdaq: IndexQuote | null;
}

/**
 * Fetches JSON data from a URL.
 *
 * @param url - The URL to request
 * @param init - Optional request configuration
 * @returns The parsed response data
 * @throws An error when the response status indicates failure
 */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

/**
 * Retrieves the latest quote for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @returns The query result containing the stock quote, or `null` when no quote is available
 */
export function useStockQuote(ticker: string) {
  return useQuery({
    queryKey: ["stockQuote", ticker],
    queryFn: () =>
      fetchJSON<StockQuote | null>(
        `/api/stock-quote?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
    refetchInterval: 60_000,
  });
}

/**
 * Fetches quotes for multiple stock tickers.
 *
 * @param tickers - The stock ticker symbols to fetch.
 * @returns The query result containing the batch quote response.
 */
export function useBatchQuotes(tickers: string[]) {
  const sortedTickers = tickers.slice().sort();
  const key = sortedTickers.join(",");
  return useQuery({
    queryKey: ["batchQuotes", key],
    queryFn: async () => {
      // The route caps each request at 50 symbols. Insights can combine
      // several universes, so split rather than turning the entire quote
      // request into one 400 and leaving every card blank.
      const batches = chunkSymbols(sortedTickers);
      const responses = await Promise.allSettled(
        batches.map((batch) =>
          fetchJSON<BatchQuoteResponse>(
            `/api/stock-batch-quotes?symbols=${encodeURIComponent(batch.join(","))}`,
          ),
        ),
      );
      return mergeBatchQuoteResponses(responses);
    },
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
  });
}

/**
 * Fetches the Dow, S&P 500, and Nasdaq index quotes.
 *
 * @returns The query result containing the index quotes.
 */
export function useIndexQuotes() {
  return useQuery({
    queryKey: ["indexQuotes"],
    queryFn: () => fetchJSON<IndexQuotesResponse>(`/api/index-quotes`),
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Fetches curated ticker data for an Insights tab.
 *
 * @param tab - The Insights tab whose data to retrieve
 * @returns The query result containing the tab's Insights data
 */
export function useInsightsTab(tab: InsightsTabId) {
  return useQuery({
    queryKey: ["insightsTab", tab],
    queryFn: () =>
      fetchJSON<InsightsTabResponse>(
        `/api/insights-tab?tab=${encodeURIComponent(tab)}`,
      ),
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetches all curated ticker universes at once for multi-select filtering.
 *
 * @returns The query result containing all tab universes
 */
export function useAllInsightsTabs() {
  return useQuery({
    queryKey: ["insightsTabsAll"],
    queryFn: () =>
      fetchJSON<Record<InsightsTabId, InsightsTabEntry[]>>(
        `/api/insights-tabs-all`,
      ),
    staleTime: 5 * 60_000,
  });
}

/**
 * Retrieves each symbol's distance from its simple moving average.
 *
 * @param symbols - Symbols to include in the response
 * @param windowSize - Number of periods used to calculate the moving average
 * @returns The query result containing SMA distance data
 */
export function useSmaDistances(symbols: string[], windowSize: number = 200) {
  const key = symbols.slice().sort().join(",") + `|w=${windowSize}`;
  return useQuery({
    queryKey: ["smaDistances", key],
    queryFn: () =>
      fetchJSON<SmaDistanceResponse>(
        `/api/sma-distances?symbols=${encodeURIComponent(symbols.join(","))}&window=${windowSize}`,
      ),
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * Live provider health (Yahoo / FMP / AlphaVantage) for the global status
 * indicator and the [MOCK]-badge wiring. Polled every minute against a
 * 5-min server cache (the cache is the FMP-budget control — each probe run
 * costs 2 FMP calls — so the poll mostly re-reads the same payload; the
 * fresh payload lands within ~60s of a server re-probe).
 */
export function useProviderHealth() {
  return useQuery({
    queryKey: ["providerHealth"],
    queryFn: () => fetchJSON<ProviderHealthResponse>(`/api/provider-health`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * True while Yahoo's QUOTE health probe reports `down`.
 *
 * Yahoo is the keyless workhorse behind batch-quote fallbacks (free FMP
 * tier 402s on `batch-quote`, so per-symbol Yahoo is what keeps those
 * widgets alive) and the sole source for news / analyst / insider data.
 * Widgets that render mock fallbacks for those features OR this into
 * their [MOCK] badge condition so an outage reads on the widget itself
 * instead of only the top banner — this also catches the case where a
 * stale payload lingers in the React Query cache and would otherwise
 * look live.
 *
 * Scoped to `feature: "quote"` (NOT the chart probe): Yahoo now reports
 * two features, and a chart-only outage (Charts page, heatmaps, SMA) must
 * not flip the [MOCK] badges on quote/news widgets — those don't consume
 * charts. The global banner in `ProviderHealthIndicator` still surfaces
 * the chart outage independently via its per-feature detail lines.
 *
 * Shares the same query key as `ProviderHealthIndicator`; React Query
 * dedupes the fetch across observers, so every extra caller costs zero
 * additional requests.
 */
export function useYahooDown() {
  const { data } = useProviderHealth();
  return isProviderStatus(data?.providers, "yahoo", "quote", "down");
}

/**
 * True while Yahoo's CHART health probe reports `down`.
 *
 * Charts are FMP-primary with a Yahoo fallback, so this flags the fallback
 * being unavailable — chart-driven widgets (Charts page, sector heatmap,
 * SMA/DipFinder) may be showing stale history even while a fresh payload
 * lingers in the React Query cache. They OR this into their [MOCK] badge
 * condition so a chart-only outage reads on the widget itself instead of
 * only the top banner.
 *
 * NOTE: because FMP `/stable/historical-price-eod/full` is live on the free
 * tier, this can fire while FMP still serves fresh bars — conservative by
 * design (stale-looking data is worse than a yellow badge). Gate harder
 * (e.g. on FMP chart availability) if that ever reads too noisy.
 *
 * Scoped to `feature: "chart"` (NOT the quote probe): a chart outage must
 * not flip the quote/news [MOCK] badges, and vice versa.
 *
 * Shares the same query key as `useProviderHealth`; React Query dedupes the
 * fetch across observers, so every extra caller costs zero requests.
 */
export function useYahooChartDown() {
  const { data } = useProviderHealth();
  return isProviderStatus(data?.providers, "yahoo", "chart", "down");
}

/**
 * True while FMP's `batch-quote` health probe reports `known_restriction` —
 * the endpoint is not on the current plan (HTTP 402 on the free tier), so
 * batch quotes fall back to per-symbol Yahoo calls. Quote-table widgets show
 * a small "Yahoo fallback" chip off this so users understand why prices are
 * fetched one ticker at a time instead of in one batch request.
 *
 * Shares the same query key as `useProviderHealth`; React Query dedupes the
 * fetch across observers, so every extra caller costs zero requests.
 */
export function useFmpBatchQuoteRestricted() {
  const { data } = useProviderHealth();
  return isProviderStatus(
    data?.providers,
    "fmp",
    "batch-quote",
    "known_restriction",
  );
}

/**
 * Retrieves exchange rates for the requested currencies.
 *
 * @param currencies - The currencies to include in the exchange-rate response.
 * @returns The query result containing the requested foreign-exchange rates.
 */
export function useFxRates(currencies: FxCurrency[] = ["USD", "ILS", "EUR"]) {
  const key = currencies.slice().sort().join(",");
  return useQuery({
    queryKey: ["fxRates", key],
    queryFn: () =>
      fetchJSON<FxRatesResponse>(
        `/api/fx-rates?currencies=${encodeURIComponent(currencies.join(","))}`,
      ),
    staleTime: 60 * 60_000, // 1h — FX doesn't move intraday
  });
}

/**
 * Retrieves the company profile for a stock ticker.
 *
 * @param ticker - The stock ticker symbol.
 * @returns The company profile, or `null` when no profile is available.
 */
export function useStockProfile(ticker: string) {
  return useQuery({
    queryKey: ["stockProfile", ticker],
    queryFn: () =>
      fetchJSON<CompanyProfile | null>(
        `/api/stock-overview?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
  });
}

/**
 * Fetches financial statements for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @param opts - Optional granularity: `'annual'` (default) or `'quarter'`.
 *   Annual and quarterly calls use different cache keys so both can run in
 *   parallel without colliding. Annual is the historical default; quarterly
 *   powers the new chart-modal granularity toggle (Q1..Q4 bars instead of
 *   full-year bars). The `enabled` flag gates the query so quarterly requests
 *   only fire when the modal is open in quarterly mode.
 * @returns The query result containing the stock's financial statements
 */
export function useStockFinancials(
  ticker: string,
  opts?: { period?: "annual" | "quarter"; enabled?: boolean },
) {
  const period = opts?.period ?? "annual";
  const enabled = opts?.enabled ?? true;
  return useQuery({
    queryKey: ["stockFinancials", ticker, period],
    queryFn: () =>
      fetchJSON<FinancialStatements>(
        `/api/stock-financials?symbol=${encodeURIComponent(ticker)}&period=${period}`,
      ),
    enabled: !!ticker && enabled,
  });
}

/**
 * Retrieves financial metrics, valuation ratios, and investment scores for a stock.
 *
 * @param ticker - The stock ticker symbol.
 * @returns A query result containing the stock metrics data.
 */
export function useStockMetrics(ticker: string) {
  return useQuery({
    queryKey: ["stockMetrics", ticker],
    queryFn: () =>
      fetchJSON<StockMetrics>(
        `/api/stock-metrics?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
  });
}

/**
 * Fetches revenue broken down by product segment for a stock ticker.
 *
 * The response carries `rateLimited` (free-tier FMP quota exhausted) and
 * `unavailable` (no FMP key), letting the revenue card fall back to the
 * plain total-revenue series while keeping the segment filters visible as
 * a locked premium feature. `retry: false` + a server-side 5-min backoff
 * cache means a quota hit doesn't hammer the endpoint on every mount.
 *
 * @param ticker - The stock ticker symbol
 * @param opts - Optional granularity: `'annual'` (default) or `'quarter'`.
 *   Annual and quarterly requests use separate cache keys and FMP calls, so
 *   the chart modal's granularity toggle can run both without colliding.
 *   `enabled` gates the query — the modal only fetches quarterly rows once
 *   the user switches the segment view to quarterly.
 * @returns The query result containing the revenue segmentation response
 */
export function useStockRevenueSegmentation(
  ticker: string,
  opts?: { period?: "annual" | "quarter"; enabled?: boolean },
) {
  const period = opts?.period ?? "annual";
  const enabled = opts?.enabled ?? true;
  return useQuery({
    queryKey: ["stockRevenueSegmentation", ticker, period],
    queryFn: () =>
      fetchJSON<RevenueSegmentation>(
        `/api/stock-revenue-segmentation?symbol=${encodeURIComponent(ticker)}&period=${period}`,
      ),
    enabled: !!ticker && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Retrieves analyst trend data for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @returns The query result containing analyst trend data
 */
export function useStockAnalyst(ticker: string) {
  return useQuery({
    queryKey: ["stockAnalyst", ticker],
    queryFn: () =>
      fetchJSON<AnalystTrends>(
        `/api/stock-analyst?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
  });
}

/**
 * Yahoo-driven fallback for the Index financial-metrics grid when the
 * FMP primary is rate-limited (HTTP 429 from `/stable/`). The
 * `enabled` flag should be `true` ONLY when:
 *
 *   1. `useProviderHealth()` reports FMP `quote` is `down` or `degraded`,
 *      AND
 *   2. `useStockFinancials(ticker)` has resolved with an empty income
 *      series (`metrics.length === 0`).
 *
 * Gating the query itself (rather than rendering-conditionally) keeps
 * Yahoo load at zero during healthy operation. `staleTime: 5min` matches
 * the server-side cache TTL so a switch back to "healthy" doesn't keep
 * re-fetching stale Yahoo data unnecessarily. Shares the same query key
 * seed `["stockYahooFallbackFinancials", ticker]` so React Query dedupes
 * across observers.
 */
export function useStockYahooFallbackFinancials(
  ticker: string,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["stockYahooFallbackFinancials", ticker],
    queryFn: () =>
      fetchJSON<YahooFallbackFinancials>(
        `/api/stock-yahoo-fallback-financials?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker && (opts?.enabled ?? true),
    staleTime: 5 * 60_000,
  });
}

/**
 * Retrieves insider transaction data for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @returns The query result containing insider transactions
 */
export function useStockInsider(ticker: string) {
  return useQuery({
    queryKey: ["stockInsider", ticker],
    queryFn: () =>
      fetchJSON<InsiderTransaction[]>(
        `/api/stock-insider?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
  });
}

/**
 * Institutional / fund / top-insider ownership snapshot from the free Yahoo
 * `quoteSummary` modules. Slow-moving → 1h staleTime matches the server's
 * 1h KV TTL so re-mounts reuse the cache instead of re-hitting Yahoo.
 */
export function useStockOwnership(ticker: string) {
  return useQuery({
    queryKey: ["stockOwnership", ticker],
    queryFn: () =>
      fetchJSON<StockOwnership>(
        `/api/stock-ownership?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
    staleTime: 60 * 60_000,
  });
}

/**
 * Retrieves news articles for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @returns The query result containing the stock news articles
 */
export function useStockNews(ticker: string) {
  return useQuery({
    queryKey: ["stockNews", ticker],
    queryFn: () =>
      fetchJSON<NewsItem[]>(
        `/api/stock-news?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
  });
}

/**
 * Retrieves earnings events within a specified date range.
 *
 * @param from - The start date of the range
 * @param to - The end date of the range
 * @returns The query result containing the earnings events
 */
export function useTickerEarningsCalendar(
  ticker: string,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ["tickerEarningsCalendar", ticker, from, to],
    queryFn: async () => {
      const events = await fetchJSON<EarningsEvent[]>(
        `/api/earnings-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      return events.filter(
        (event) => event.symbol.toUpperCase() === ticker.toUpperCase(),
      );
    },
    enabled: !!ticker && !!from && !!to,
    staleTime: 5 * 60_000,
  });
}

export function useEarningsCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ["earningsCalendar", from, to],
    queryFn: () =>
      fetchJSON<EarningsEvent[]>(
        `/api/earnings-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: !!from && !!to,
  });
}

/**
 * Fetches historical chart data for a stock ticker.
 *
 * @param ticker - The stock ticker symbol
 * @returns The chart series, or `null` when no data is available
 */
export function useStockChart(ticker: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  return useQuery({
    queryKey: ["stockChart", ticker],
    queryFn: () =>
      fetchJSON<ChartSeries | null>(
        `/api/stock-chart?symbol=${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker && enabled,
  });
}

/**
 * Fetches chart data for multiple symbols in parallel.
 *
 * @returns Query results in the same order as the input symbols.
 */
export function useMultiChart(symbols: string[]) {
  return useQueries({
    queries: symbols.map((sym) => ({
      queryKey: ["stockChart", sym],
      queryFn: () =>
        fetchJSON<ChartSeries | null>(
          `/api/stock-chart?symbol=${encodeURIComponent(sym)}`,
        ),
      enabled: !!sym,
      staleTime: 60 * 60_000, // 1 hr — chart historical is heavy
    })),
  });
}

/**
 * Aggregates news across many symbols into a single chronologically-sorted
 * feed, tagged with the originating ticker. Powers the Watchlists sidebar
 * "Recent News" panel so users see headlines for the tickers they care about
 * without having to drill into each stock page.
 *
 * Strategy:
 *   1. Run `useStockNews` in parallel for every requested symbol via
 *      `useQueries` (bounded to at most the first 8 symbols — beyond that,
 *      the per-request upstream quota starts to risk 429s on Yahoo's
 *      news endpoint).
 *   2. Flatten the results, drop items the upstream omitted, attach the
 *      symbol, then sort by `providerPublishTime` descending.
 *
 * Caveat: many symbols share the same headline pool (e.g. AAPL/JPM/MSFT all
 * appear on "Fed signals rate cut" macro stories). When that happens the
 * same headline appears N times in the output. We accept this for now —
 * the Watclists panel caps the render at 5 items so the duplicate is at
 * most one row visible per ticker entry, and renderers can de-dup later.
 */
export function useWatchlistNews(symbols: string[], limit = 30) {
  // Cap the per-symbol fan-out at 8 — Yahoo's news endpoint degrades fast
  // past that on free-tier rate limits. The remaining symbols still appear
  // in the UI watchlist table; only the news aggregation sees the cap.
  const bounded = useMemo(() => symbols.slice(0, 8), [symbols]);
  const results = useQueries({
    queries: bounded.map((sym) => ({
      queryKey: ["stockNews", sym],
      queryFn: () =>
        fetchJSON<NewsItem[]>(
          `/api/stock-news?symbol=${encodeURIComponent(sym)}`,
        ),
      enabled: !!sym,
      staleTime: 5 * 60_000,
    })),
  });
  const unified = useMemo(
    () =>
      results
        .flatMap((q, i) =>
          (q.data ?? []).map((n) => ({
            ...n,
            symbol: bounded[i],
            providerPublishTime: n.providerPublishTime ?? 0,
          })),
        )
        .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
        .slice(0, limit),
    [results, bounded, limit],
  );
  return useMemo(
    () => ({
      items: unified,
      isLoading: results.some((q) => q.isLoading),
      isAnyFailing: results.some((q) => q.isError),
      perSymbolCount: bounded.map((sym, i) => ({
        symbol: sym,
        isLive: !!results[i]?.data && results[i]!.data!.length > 0,
        count: results[i]?.data?.length ?? 0,
      })),
    }),
    [unified, results, bounded],
  );
}

// Composite-hook local types — NOT exported. Kept inline because the slide-over
// relies on inference from the hook's return value (no direct import here).
// `QuickStat` is imported from `@/lib/mockData` for single-source-of-truth.
interface SlideOverQuote {
  price: number;
  change: number;
  changePercent: number;
  afterHoursPrice?: number;
  afterHoursChange?: number;
}
interface SlideOverRatios {
  peTtm?: number;
  peNtm?: number;
  priceToBook?: number;
  priceToSales?: number;
  evToEbitda?: number;
  dividendYield?: number;
  pegRatio?: number;
  beta?: number;
}
interface SlideOverProfile {
  description?: string;
}
interface SlideOverStockData {
  name: string;
  exchange: string;
  quote: SlideOverQuote | null;
  ratios: SlideOverRatios | null;
  /** No backend coverage yet — kept null so the slide-over's `{priceChange && …}` hides the strip. */
  priceChange: { ytd?: number; "1Y"?: number; "3Y"?: number } | null;
  /** Mock-only data — always empty in production; slide-over's `length > 0 && …` skips the section. */
  quickStats: QuickStat[];
  profile: SlideOverProfile | null;
}

/**
 * Composite hook aggregating profile + quote + metrics into the shape
 * `StockSlideOver` reads. Each underlying query runs in parallel via TanStack
 * Query.
 *
 * Loading is true while ANY of the three is pending (slide-over shows a
 * spinner). Error is true only when the two load-bearing queries (profile+
 * quote) BOTH fail — metrics alone erroring shouldn't blow away a usable
 * price header just because the ratio grid couldn't populate. Sections of
 * the slide-over that don't have any data (priceChange strip, quickStats,
 * P/E Forward row, after-hours price) are kept as `null`/empty and the
 * slide-over's section-level `{x && …}` guards hide them gracefully.
 *
 * @param ticker - The stock ticker symbol
 * @returns `{ data, isLoading, isError }` matching `StockSlideOver`'s API
 */
export function useStockData(ticker: string) {
  const profileQ = useStockProfile(ticker);
  const quoteQ = useStockQuote(ticker);
  const metricsQ = useStockMetrics(ticker);

  const profile = profileQ.data ?? null;
  const quote = quoteQ.data ?? null;
  const metrics = metricsQ.data ?? null;

  // `data` is null until at least one of the three resolves so the slide-over
  // shows its spinner instead of a half-populated card.
  const data: SlideOverStockData | null =
    !profile && !quote && !metrics
      ? null
      : {
          name: profile?.companyName ?? ticker,
          exchange: profile?.exchange ?? "",
          quote: quote
            ? {
                price: quote.price,
                change: quote.change,
                changePercent: quote.changesPercentage,
                // /stock-quote doesn't carry after-hours data. Explicit
                // `undefined` keeps the keys present so slide-over's direct
                // access (`quote.afterHoursPrice`) typechecks; the slide-over's
                // `!= null` guard then hides the row.
                afterHoursPrice: undefined,
                afterHoursChange: undefined,
              }
            : null,
          ratios: metrics
            ? {
                peTtm:
                  profile?.peRatio ??
                  metrics.ratios?.priceEarningsRatioTTM ??
                  undefined,
                peNtm: undefined,
                priceToBook:
                  metrics.ratios?.priceToBookRatioTTM ??
                  metrics.metrics?.priceToBookRatioTTM ??
                  undefined,
                priceToSales:
                  metrics.ratios?.priceToSalesRatioTTM ??
                  metrics.metrics?.priceToSalesRatioTTM ??
                  undefined,
                evToEbitda: metrics.metrics?.evToEBITDATTM ?? undefined,
                dividendYield: metrics.metrics?.dividendYieldTTM ?? undefined,
                pegRatio:
                  metrics.ratios?.priceToEarningsGrowthRatioTTM ?? undefined,
                // Profile.beta is the canonical source (already on /stock-overview).
                beta: profile?.beta ?? undefined,
              }
            : null,
          priceChange: null,
          quickStats: [],
          profile: profile ? { description: profile.description } : null,
        };

  return {
    data,
    isLoading: profileQ.isLoading || quoteQ.isLoading || metricsQ.isLoading,
    isError: profileQ.isError && quoteQ.isError,
  };
}

/**
 * Sector × days heatmap for the live Insights universe. Server fans out
 * `getChart` (and `getProfile` only for symbols lacking a curated tag),
 * aggregates by sector tag in one pass, and caches the entire heatmap
 * server-side for 15 minutes. The query key embeds the sorted symbol list,
 * day count, AND the normalized curated sector map so a changed mapping
 * never reuses a stale cached aggregation. Client staleTime below lets
 * React Query refetch slightly faster than the server TTL for snappier UX.
 *
 * @param sectors Optional curated symbol→sector map from the Insights
 *   universe; the server prefers these tags and falls back to provider
 *   profile sectors only for symbols without a curated tag.
 */
export function useSectorHeatmap(
  symbols: string[],
  days: number = 5,
  sectors?: SectorHeatmapMetadata,
) {
  const sortedSyms = symbols.slice().sort();
  const key = sortedSyms.join(",");
  const metaKey = serializeSectorMeta(sectors ?? {});
  return useQuery({
    queryKey: ["sectorHeatmap", key, `d=${days}`, `m=${metaKey || "*"}`],
    queryFn: () => {
      const url = `/api/sector-heatmap?symbols=${encodeURIComponent(key)}&days=${encodeURIComponent(String(days))}`;
      const metaUrl = metaKey
        ? `${url}&sectorMeta=${encodeURIComponent(metaKey)}`
        : url;
      return fetchJSON<SectorHeatmapResponse>(metaUrl);
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    // Keep the previous universe's heatmap visible while a new one is in
    // flight — prevents the one-render flash of an empty block when users
    // switch tabs across the 5-minute refetch window. `keepPreviousData`
    // is keyed on queryKey so a tab switch produces a different key and
    // we won't replay the old aggregates onto the new universe.
    placeholderData: keepPreviousData,
  });
}

/**
 * Validate a batch of candidate symbols against `/api/stock-overview`.
 * Powers the Add-Watchlist sheet's preview chips so we don't blindly
 * commit a typo ("APPL" for Apple) into the persisted store.
 *
 * Strategy:
 *   - Validate every candidate in sequential batches of eight so a large
 *     paste cannot create an unbounded upstream request burst.
 *   - A candidate is "valid" when the upstream returned a non-null
 *     CompanyProfile whose `symbol` matches the requested symbol.
 *     Unrecognized candidates surface as `invalid`; request failures surface
 *     separately as `unavailable`, and neither is persisted.
 *
 * `staleTime: 5min` for the complete candidate set keeps repeated validation
 * of the same Add-sheet session cheap (users often re-paste while iterating).
 */
export function useValidateSymbols(candidates: string[]) {
  const normalized = useMemo(
    () =>
      Array.from(
        new Set(candidates.map((s) => s.toUpperCase().trim()).filter(Boolean)),
      ),
    [candidates],
  );
  const validation = useQuery({
    queryKey: ["validateStockProfiles", [...normalized].sort().join(",")],
    queryFn: async ({ signal }) => {
      const profiles: Array<{ symbol: string; profile: ApiCompanyProfile }> =
        [];
      const invalid: string[] = [];
      const unavailable: string[] = [];
      const batchSize = 8;

      // Validate every format-clean candidate, but keep upstream concurrency
      // bounded so a large paste cannot create an unbounded request burst.
      const throwIfAborted = () => {
        if (signal.aborted) {
          throw new DOMException("Validation aborted", "AbortError");
        }
      };

      for (let i = 0; i < normalized.length; i += batchSize) {
        throwIfAborted();
        const batch = normalized.slice(i, i + batchSize);
        const settled = await Promise.all(
          batch.map(async (sym) => {
            try {
              const response = await fetch(
                `/api/stock-overview?symbol=${encodeURIComponent(sym)}`,
                { signal },
              );
              if (response.status === 503) {
                return { sym, profile: null, unavailable: true };
              }
              if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
              }
              const profile =
                (await response.json()) as ApiCompanyProfile | null;
              return { sym, profile, unavailable: false };
            } catch (error) {
              if (signal.aborted) throw error;
              // A timeout, 429, or provider outage is not proof that the
              // ticker is invalid. Keep it separate so the UI can ask the
              // user to retry rather than silently dropping it.
              return { sym, profile: null, unavailable: true };
            }
          }),
        );
        // Do not cache partial results if the query was superseded while the
        // current batch was in flight.
        throwIfAborted();
        for (const {
          sym,
          profile,
          unavailable: requestUnavailable,
        } of settled) {
          if (requestUnavailable) {
            unavailable.push(sym);
          } else if (
            profile &&
            typeof profile.symbol === "string" &&
            profile.symbol.toUpperCase() === sym
          ) {
            profiles.push({ symbol: sym, profile });
          } else {
            // Do not accept a provider response for a different security.
            invalid.push(sym);
          }
        }
      }
      return { profiles, invalid, unavailable };
    },
    enabled: normalized.length > 0,
    staleTime: 5 * 60_000,
  });

  return useMemo(
    () => ({
      valid: validation.data?.profiles ?? [],
      invalid: validation.data?.invalid ?? [],
      unavailable: validation.data?.unavailable ?? [],
      isValidating: validation.isPending || validation.isFetching,
    }),
    [validation.data, validation.isPending, validation.isFetching],
  );
}

export type { IndexQuotesResponse };
// ------ FinanceDatabase Hooks ------

export interface ScreenerAsset {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  mic_code: string;
  country: string;
  type: string;
  asset_type: string;
  sector: string;
  industry: string;
  market_cap: number;
  summary: string;
}

export interface ScreenerSearchResult {
  symbol: string;
  name: string;
  asset_type: string;
  exchange: string;
  country: string;
  sector: string;
}

export interface ScreenerFilterResponse {
  total: number;
  results: ScreenerAsset[];
}

export function useScreenerSearch(query: string, limit: number = 10) {
  return useQuery({
    queryKey: ["screenerSearch", query, limit],
    queryFn: () =>
      fetchJSON<{ results: ScreenerSearchResult[] }>(
        `/api/screener/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      ),
    enabled: query.length >= 1,
    staleTime: 5 * 60_000,
  });
}

export function useScreenerFilter(
  filters: {
    q?: string;
    sector?: string[];
    industry?: string[];
    country?: string[];
    asset_type?: string[];
    exclude_dots?: boolean;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  },
  limit: number = 50,
  offset: number = 0,
) {
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  if (filters.q?.trim()) queryParams.set("q", filters.q.trim());
  if (filters.sector?.length)
    queryParams.set("sector", filters.sector.join(","));
  if (filters.industry?.length)
    queryParams.set("industry", filters.industry.join(","));
  if (filters.country?.length)
    queryParams.set("country", filters.country.join(","));
  if (filters.asset_type?.length)
    queryParams.set("asset_type", filters.asset_type.join(","));
  if (filters.exclude_dots) queryParams.set("exclude_dots", "1");
  if (filters.sort_by) queryParams.set("sort_by", filters.sort_by);
  if (filters.sort_dir) queryParams.set("sort_dir", filters.sort_dir);

  return useQuery({
    queryKey: ["screenerFilter", queryParams.toString()],
    queryFn: () =>
      fetchJSON<ScreenerFilterResponse>(
        `/api/screener/filter?${queryParams.toString()}`,
      ),
    staleTime: 5 * 60_000,
  });
}

export function useScreenerAsset(ticker: string) {
  return useQuery({
    queryKey: ["screenerAsset", ticker],
    queryFn: () =>
      fetchJSON<ScreenerAsset>(
        `/api/screener/asset/${encodeURIComponent(ticker)}`,
      ),
    enabled: !!ticker,
    staleTime: 60 * 60_000, // Assets rarely change metadata
  });
}

export interface ScreenerFacets {
  asset_types: string[];
  sectors: string[];
  countries: string[];
}

export function useScreenerFacets() {
  return useQuery({
    queryKey: ["screenerFacets"],
    queryFn: () => fetchJSON<ScreenerFacets>("/api/screener/facets"),
    staleTime: 24 * 60 * 60_000, // Facets don't change within a session
  });
}

/**
 * Live fundamental screen — the server narrows the FinanceDatabase
 * universe with the same metadata filters, fans out Yahoo-primary metrics
 * (row-level cached), applies the numeric metric ranges, and paginates.
 * `metricRanges` maps screener metric ids (pe, roe, …) to min/max bounds;
 * the query is `enabled` only once the user pressed Screen with ≥1 range.
 */
export function useScreenerFundamentalFilter(
  opts: {
    q?: string;
    sector?: string[];
    industry?: string[];
    country?: string[];
    asset_type?: string[];
    exclude_dots?: boolean;
    market_cap?: string[];
    metricRanges: Record<
      string,
      { min?: number; max?: number } | undefined
    >;
    limit: number;
    offset: number;
    enabled: boolean;
  },
) {
  const params = new URLSearchParams({
    limit: opts.limit.toString(),
    offset: opts.offset.toString(),
  });
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.sector?.length) params.set("sector", opts.sector.join(","));
  if (opts.industry?.length) params.set("industry", opts.industry.join(","));
  if (opts.country?.length) params.set("country", opts.country.join(","));
  if (opts.asset_type?.length)
    params.set("asset_type", opts.asset_type.join(","));
  if (opts.exclude_dots) params.set("exclude_dots", "1");
  if (opts.market_cap?.length)
    params.set("market_cap", opts.market_cap.join(","));
  for (const [id, range] of Object.entries(opts.metricRanges)) {
    if (!range) continue;
    if (range.min === undefined && range.max === undefined) continue;
    params.set(id, `${range.min ?? ""}:${range.max ?? ""}`);
  }
  return useQuery({
    queryKey: ["screenerFundamental", params.toString()],
    queryFn: () =>
      fetchJSON<ScreenerFundamentalResponse>(
        `/api/screener/fundamental-filter?${params.toString()}`,
      ),
    enabled: opts.enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
