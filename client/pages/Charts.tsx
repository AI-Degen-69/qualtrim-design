import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import DCFWidget from "@/components/DCFWidget";
import {
  SectionCardSkeleton,
  HeaderPriceSkeleton,
} from "@/components/Skeleton";
import TickerLogo from "@/components/TickerLogo";
import {
  useStockQuote,
  useStockProfile,
  useStockFinancials,
  useStockMetrics,
  useYahooChartDown,
  useScreenerSearch,
} from "@/hooks/useStockData";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Search,
  X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DataStatusBadge from "@/components/DataStatusBadge";

const POPULAR_TICKERS = [
  "AAPL",
  "NVDA",
  "MSFT",
  "TSLA",
  "AMZN",
  "GOOGL",
  "META",
];

/**
 * Displays a discounted cash flow valuation chart for the selected stock ticker.
 *
 * @returns The charts page with a loading placeholder or valuation widget.
 */
export function Charts() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const ticker = (searchParams.get("ticker") || "AAPL").toUpperCase();

  // Search autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: searchData,
    isLoading: searchLoading,
    isError: searchError,
  } = useScreenerSearch(debouncedQuery, 8);
  const searchResults = searchData?.results ?? [];

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectTicker = (newTicker: string) => {
    setSearchParams({ ticker: newTicker.toUpperCase() });
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  // DCF math depends on the live quote — never feed a hardcoded number.
  const { data: quoteData, isLoading: quoteLoading } = useStockQuote(ticker);
  // Profile gives us a friendly company name and market cap for the page header.
  const { data: profileData, isLoading: profileLoading } =
    useStockProfile(ticker);
  // Financial statements provide actual Free Cash Flow and Net Income.
  const { data: financialsData } = useStockFinancials(ticker);
  // Valuation metrics provide P/E and other TTM ratios.
  const { data: metricsData } = useStockMetrics(ticker);

  // DCF + ranges are quote-driven, but the page is the charts surface — when
  // Yahoo chart history is down, badge [MOCK] so stale bars can't read as live.
  const yahooChartDown = useYahooChartDown();
  const currentPrice = quoteData?.price;

  const dayLow = quoteData?.dayLow ?? null;
  const dayHigh = quoteData?.dayHigh ?? null;
  const yearLow = quoteData?.yearLow ?? null;
  const yearHigh = quoteData?.yearHigh ?? null;

  const dayMidpoint =
    dayLow !== null && dayHigh !== null && dayHigh > dayLow
      ? (dayLow + dayHigh) / 2
      : null;
  const midpointGap =
    currentPrice !== undefined && dayMidpoint !== null
      ? currentPrice - dayMidpoint
      : null;
  const midpointCaption =
    midpointGap === null
      ? null
      : midpointGap >= 0
        ? t("charts.aboveMidpoint", { amount: midpointGap.toFixed(2) })
        : t("charts.belowMidpoint", {
            amount: Math.abs(midpointGap).toFixed(2),
          });

  const yearMidpoint =
    yearLow !== null && yearHigh !== null && yearHigh > yearLow
      ? (yearLow + yearHigh) / 2
      : null;
  const yearMidpointGap =
    currentPrice !== undefined && yearMidpoint !== null
      ? currentPrice - yearMidpoint
      : null;
  const yearMidpointCaption =
    yearMidpointGap === null
      ? null
      : yearMidpointGap >= 0
        ? t("charts.aboveMidpoint", { amount: yearMidpointGap.toFixed(2) })
        : t("charts.belowMidpoint", {
            amount: Math.abs(yearMidpointGap).toFixed(2),
          });

  return (
    <div className="w-full bg-background dark min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <PageHeader
          eyebrow={t("nav.charts")}
          title={profileLoading ? "…" : (profileData?.companyName ?? ticker)}
          titleLeadingAdornment={<TickerLogo ticker={ticker} size="md" />}
          titleAdornment={
            <span
              className="px-2 py-0.5 rounded bg-muted border border-border text-foreground text-xs font-mono font-bold"
              dir="ltr"
            >
              {ticker}
            </span>
          }
          description={
            [profileData?.exchange, profileData?.sector]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          status={currentPrice != null ? "live" : undefined}
          source={currentPrice != null ? "Yahoo Finance" : undefined}
          actions={
            yahooChartDown ? (
              <DataStatusBadge status="mock" source="Chart fallback" />
            ) : undefined
          }
        />

        {/* Ticker Search & Switcher Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3 rounded-xl bg-card border border-border">
          {/* Autocomplete search input */}
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    const trimmed = searchQuery.trim();
                    if (
                      debouncedQuery !== trimmed ||
                      searchLoading ||
                      searchError
                    )
                      return;
                    handleSelectTicker(searchResults[0]?.symbol ?? trimmed);
                  }
                }}
                placeholder={t("charts.searchPlaceholder")}
                aria-label={t("charts.searchPlaceholder")}
                className="w-full pl-9 pr-8 py-1.5 text-sm sm:text-xs bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label={t("charts.clearSearch")}
                  className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Results */}
            {isSearchOpen && debouncedQuery.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                {searchLoading ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    {t("charts.searchingStocks")}
                  </div>
                ) : searchError ? (
                  <div className="p-3 text-xs text-chart-negative text-center">
                    {t("charts.searchError")}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    {t("charts.noMatchingStocks", {
                      query: debouncedQuery.toUpperCase(),
                    })}
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.symbol}
                      onClick={() => handleSelectTicker(item.symbol)}
                      className="w-full px-3 py-2 text-left hover:bg-muted/60 flex items-center justify-between border-b border-border/40 last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-foreground">
                          {item.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {item.name}
                        </span>
                      </div>
                      {item.exchange && (
                        <span className="text-[10px] font-mono text-muted-foreground px-1 rounded bg-muted">
                          {item.exchange}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quick Popular Ticker Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] text-muted-foreground font-medium mr-1 uppercase">
              {t("charts.quickLabel")}
            </span>
            {POPULAR_TICKERS.map((sym) => (
              <button
                key={sym}
                onClick={() => handleSelectTicker(sym)}
                className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-colors ${
                  ticker === sym
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Price + range card */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {quoteLoading ? (
            <div className="p-6">
              <HeaderPriceSkeleton />
            </div>
          ) : !currentPrice ? (
            <div className="p-6 text-center text-muted-foreground text-xl">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {t("index.unavailableApi")}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Price + change */}
              <div className="p-6 flex flex-col justify-between min-h-[160px]">
                <div>
                  <span className="text-xs uppercase font-medium tracking-wider text-muted-foreground">
                    {t("common.price")}
                  </span>
                  <div className="my-2 flex items-baseline gap-2">
                    <span
                      className="text-4xl font-bold font-mono tracking-tight tabular-nums text-foreground"
                      dir="ltr"
                    >
                      ${currentPrice.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold font-mono tabular-nums ${
                        (quoteData?.change ?? 0) >= 0
                          ? "bg-chart-positive/15 text-chart-positive border border-chart-positive/30"
                          : "bg-chart-negative/15 text-chart-negative border border-chart-negative/30"
                      }`}
                      dir="ltr"
                    >
                      {(quoteData?.change ?? 0) >= 0 ? "+" : ""}
                      {(quoteData?.change ?? 0).toFixed(2)} (
                      {(quoteData?.changesPercentage ?? 0) >= 0 ? "+" : ""}
                      {(quoteData?.changesPercentage ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="min-h-[1.25rem] mt-2 flex items-center">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {quoteData?.volume
                      ? t("charts.vol", {
                          amount: (quoteData.volume / 1e6).toFixed(1),
                        })
                      : ""}
                  </span>
                </div>
              </div>

              {/* Day range */}
              <div className="p-6 flex flex-col justify-between min-h-[160px]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase font-medium tracking-wider text-muted-foreground">
                      {t("charts.dayRange")}
                    </span>
                    {dayLow !== null &&
                      dayHigh !== null &&
                      dayHigh > dayLow && (
                        <span
                          className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 border border-border/50"
                          dir="ltr"
                        >
                          {t("charts.inRange", {
                            percent: Math.min(
                              100,
                              Math.max(
                                0,
                                ((currentPrice - dayLow) / (dayHigh - dayLow)) *
                                  100,
                              ),
                            ).toFixed(0),
                          })}
                        </span>
                      )}
                  </div>
                  {dayLow !== null && dayHigh !== null ? (
                    <DualRange
                      low={dayLow}
                      high={dayHigh}
                      current={currentPrice}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
                <div className="min-h-[1.25rem] mt-2 flex items-center">
                  {midpointCaption && (
                    <p
                      className="text-[11px] text-muted-foreground font-mono"
                      dir="ltr"
                    >
                      {midpointCaption}
                    </p>
                  )}
                </div>
              </div>

              {/* 52-week range */}
              <div className="p-6 flex flex-col justify-between min-h-[160px]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase font-medium tracking-wider text-muted-foreground">
                      {t("charts.weekRange")}
                    </span>
                    {yearLow !== null &&
                      yearHigh !== null &&
                      yearHigh > yearLow && (
                        <span
                          className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 border border-border/50"
                          dir="ltr"
                        >
                          {t("charts.inRange", {
                            percent: Math.min(
                              100,
                              Math.max(
                                0,
                                ((currentPrice - yearLow) /
                                  (yearHigh - yearLow)) *
                                  100,
                              ),
                            ).toFixed(0),
                          })}
                        </span>
                      )}
                  </div>
                  {yearLow !== null && yearHigh !== null ? (
                    <DualRange
                      low={yearLow}
                      high={yearHigh}
                      current={currentPrice}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
                <div className="min-h-[1.25rem] mt-2 flex items-center">
                  {yearMidpointCaption && (
                    <p
                      className="text-[11px] text-muted-foreground font-mono"
                      dir="ltr"
                    >
                      {yearMidpointCaption}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* DCF widget */}
        {quoteLoading || currentPrice == null ? (
          <SectionCardSkeleton height={420} />
        ) : (
          (() => {
            const mktCap = profileData?.marketCap ?? null;
            const isFinitePositiveMktCap =
              mktCap != null && Number.isFinite(mktCap) && mktCap > 0;
            const derivedShares =
              isFinitePositiveMktCap && currentPrice > 0
                ? mktCap / currentPrice / 1e9
                : 15.2;

            const sortedCash = financialsData?.cash
              ? financialsData.cash
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                  )
              : [];
            const sortedIncome = financialsData?.income
              ? financialsData.income
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                  )
              : [];

            const latestCash = sortedCash[0];
            const latestIncome = sortedIncome[0];

            const rawFcf = latestCash?.freeCashFlow;
            const derivedFcf =
              rawFcf != null && Number.isFinite(rawFcf) && rawFcf > 0
                ? rawFcf / 1e9
                : isFinitePositiveMktCap
                  ? Math.max(1, mktCap / 1e9 / 25)
                  : 108.8;

            const rawNetIncome = latestIncome?.netIncome;
            const derivedEarnings =
              rawNetIncome != null &&
              Number.isFinite(rawNetIncome) &&
              rawNetIncome > 0
                ? rawNetIncome / 1e9
                : isFinitePositiveMktCap
                  ? Math.max(1, mktCap / 1e9 / (profileData?.peRatio || 25))
                  : 100.9;

            const stockPe =
              profileData?.peRatio ?? metricsData?.metrics?.peRatioTTM ?? 25;
            const initialMultiple =
              stockPe > 0 && stockPe < 150 ? Math.round(stockPe) : 25;

            return (
              <DCFWidget
                key={ticker}
                ticker={ticker}
                companyName={profileData?.companyName}
                currentPrice={currentPrice}
                sharesOutstanding={derivedShares}
                initialFcf={derivedFcf}
                initialEarnings={derivedEarnings}
                initialMultiple={initialMultiple}
              />
            );
          })()
        )}

        {/* Footer hint card */}
        {!quoteLoading && currentPrice && (
          <div className="bg-card/50 border border-border rounded-xl p-4 text-xs text-muted-foreground flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" />
            <span>{t("charts.dcfGuidance")}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="w-3 h-3 text-chart-positive" />
              <TrendingDown className="w-3 h-3 text-chart-negative" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Charts;

/**
 * Horizontal dual-marker range visualization (low / current / high).
 * Renders a graduated scale track with midpoint reference and active marker.
 */
function DualRange({
  low,
  high,
  current,
}: {
  low: number;
  high: number;
  current: number;
}) {
  const { t } = useI18n();
  const pct =
    high > low
      ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100))
      : 50;

  return (
    <div className="space-y-2" dir="ltr">
      {/* Track container */}
      <div className="relative h-2 w-full rounded-full bg-muted/60 border border-border/40 overflow-visible my-3">
        {/* Midpoint marker line */}
        <div
          className="absolute -top-1 bottom-0 w-px bg-muted-foreground/30 z-0 h-4"
          style={{ left: "50%" }}
          title={t("charts.midpointTitle")}
        />

        {/* Active gradient fill up to current position */}
        <div
          className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-chart-positive/20 via-primary/30 to-primary/50"
          style={{ width: `${pct}%` }}
        />

        {/* Current price marker needle/pip */}
        <div
          className="absolute -top-1.5 h-5 w-2.5 -ml-1 rounded-sm bg-primary border border-background shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-1 ring-primary/40 z-10 transition-all cursor-default"
          style={{ left: `${pct}%` }}
          title={`$${current.toFixed(2)} (${pct.toFixed(0)}%)`}
        />
      </div>

      {/* Axis bounds */}
      <div className="flex justify-between items-center text-xs font-mono">
        <div className="flex items-center gap-1 text-chart-negative">
          <span className="text-[10px] text-muted-foreground uppercase font-sans">
            {t("charts.low")}
          </span>
          <span className="font-semibold" dir="ltr">
            ${low.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
          <span>
            {t("charts.mid", { amount: ((low + high) / 2).toFixed(2) })}
          </span>
        </div>
        <div className="flex items-center gap-1 text-chart-positive">
          <span className="text-[10px] text-muted-foreground uppercase font-sans">
            {t("charts.high")}
          </span>
          <span className="font-semibold" dir="ltr">
            ${high.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
