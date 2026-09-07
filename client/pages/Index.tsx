import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  Clock,
  ExternalLink,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import AnimatedNumber from "@/components/AnimatedNumber";
import ChartModal from "@/components/ChartModal";
import InsightsCard from "@/components/InsightsCard";
import PricingModal from "@/components/PricingModal";
import RevenueSegmentsCard from "@/components/RevenueSegmentsCard";
import CompanyProfile from "@/components/CompanyProfile";
import StockFundamentalsStrip from "@/components/StockFundamentalsStrip";
import TickerLogo from "@/components/TickerLogo";
import { deriveSpotlightMetrics } from "@/lib/spotlightMetrics";
import {
  AnalystCardSkeleton,
  HeaderPriceSkeleton,
  MetricCardSkeleton,
  NewsCardSkeleton,
} from "@/components/Skeleton";
import type { FinancialMetric } from "@/lib/mockData";
import {
  useStockQuote,
  useStockProfile,
  useStockFinancials,
  useStockMetrics,
  useStockAnalyst,
  useProviderHealth,
  useScreenerAsset,
  useStockYahooFallbackFinancials,
  useStockNews,
  useTickerEarningsCalendar,
} from "@/hooks/useStockData";
import DataStatusBadge from "@/components/DataStatusBadge";
import PageHeader from "@/components/PageHeader";
import { nextUpcomingEarningsDate } from "@/lib/earningsDate";
import {
  cagrAtYearsBack,
  detectPeriodGranularity,
  formatEarningsDate,
  yoyGrowth,
} from "@/lib/finance";

type EstimateRow = {
  period: string;
  avg: number | null;
  low: number | null;
  high: number | null;
};

function formatEstimate(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function formatRevenueEstimate(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(1);
}

function toBillions(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value / 1e9;
}

function IndexEstimateTable({
  title,
  rows,
  format,
  tone,
  translatePeriod,
  t,
}: {
  title: string;
  rows: EstimateRow[];
  format: (value: number | null) => string;
  tone: "primary" | "positive";
  translatePeriod: (period: string) => string;
  t: (key: string) => string;
}) {
  return (
    <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              tone === "positive" ? "bg-chart-positive" : "bg-primary"
            }`}
          />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 border-b border-border/40 pb-1.5 text-[10px] font-mono uppercase font-bold text-muted-foreground/80">
        <div>{t("insights.period")}</div>
        <div className="text-right">{t("insights.avg")}</div>
        <div className="text-right">{t("insights.low")}</div>
        <div className="text-right">{t("insights.high")}</div>
      </div>
      <div className="space-y-1">
        {rows.map((row, index) => (
          <div
            key={`${title}-${index}`}
            className="grid grid-cols-4 items-center gap-2 py-1 text-xs font-mono rounded px-1 -mx-1 hover:bg-muted/30 transition-colors"
          >
            <div className="truncate text-muted-foreground font-medium">
              {translatePeriod(row.period)}
            </div>
            <div
              className="text-right font-mono font-bold tabular-nums"
              dir="ltr"
            >
              <span
                className={`rounded px-1.5 py-0.5 ${
                  tone === "positive"
                    ? "bg-chart-positive/10 text-chart-positive border border-chart-positive/20"
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}
              >
                {format(row.avg)}
              </span>
            </div>
            <div
              className="text-right font-mono tabular-nums text-muted-foreground/90 font-medium"
              dir="ltr"
            >
              {format(row.low)}
            </div>
            <div
              className="text-right font-mono tabular-nums text-muted-foreground/90 font-medium"
              dir="ltr"
            >
              {format(row.high)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-2 text-center text-xs text-muted-foreground/60 italic font-sans">
            No estimate data available
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Displays a localized stock overview with quote information, company details, financial metrics, and interactive charts for the selected ticker.
 */
export default function Index() {
  const { t } = useI18n();
  const { ticker: urlTicker } = useParams<{ ticker?: string }>();
  const [selectedMetric, setSelectedMetric] = useState<FinancialMetric | null>(
    null,
  );
  // Page-level upgrade modal — opened by the locked-chip / banner
  // Upgrade CTAs (rendered through `onUpgradeClick` callbacks on the
  // RevenueSegmentsCard → InsightsCard → ChartModal chain). Keeps the
  // modal instance single even if the user clicks Upgrade from both
  // the card and the modal banner in one session.
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const ticker = urlTicker?.toUpperCase() || "AAPL";

  const {
    data: quoteData,
    isLoading: quoteLoading,
    dataUpdatedAt: quoteUpdatedAt,
  } = useStockQuote(ticker);
  const { data: overviewData, isLoading: overviewLoading } =
    useStockProfile(ticker);
  // isFetched becomes true once the first query attempt settles (success
  // OR failure). We need it to distinguish "still loading" from "loaded
  // with no data" — otherwise the metrics grid shows skeletons forever
  // when FMP returns null (which happens on the free tier for many tickers).
  const {
    data: financialsData,
    isFetched: financialsFetched,
    dataUpdatedAt: financialsUpdatedAt,
    refetch: refetchFinancials,
  } = useStockFinancials(ticker);
  const {
    data: quarterlyFinancialsData,
    isLoading: quarterlyFinancialsLoading,
  } = useStockFinancials(ticker, { period: "quarter" });
  const { data: stockMetricsData, isLoading: stockMetricsLoading } =
    useStockMetrics(ticker);
  const { data: analystData, isLoading: analystLoading } =
    useStockAnalyst(ticker);
  const { data: newsData, isLoading: newsLoading } = useStockNews(ticker);
  const todayIso = new Date().toISOString().slice(0, 10);
  const calendarToIso = new Date(Date.now() + 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: earningsCalendar = [] } = useTickerEarningsCalendar(
    ticker,
    todayIso,
    calendarToIso,
  );
  // Stable header badge value — always rendered (placeholder while analyst
  // data loads) so the header row never changes height or jumps. `AnimatedNumber`
  // counts it up from zero (ease-out cubic) the moment data lands; `tabular-nums`
  // on the badge keeps the width steady while digits tick.
  const targetEps = analystData?.[0]?.earningsEstimate?.avg;
  // First-paint skeleton for the analyst card: block while either the quote
  // or the analyst estimate is still loading so the card frame never snaps.
  const analystCardLoading = quoteLoading || analystLoading;

  // Provider-health probe (already polled by the global indicator) — when
  // FMP is degraded we KNOW the financials fetch likely landed on a 429,
  // so the empty-state below can surface the actual cause instead of a
  // vague "Retry" button. Shares the same query key as the global banner;
  // React Query dedupes so this is a zero-cost subscription.
  const { data: providerHealth } = useProviderHealth();
  const fmpProbe = providerHealth?.providers?.find(
    (p) => p.provider === "fmp" && p.feature === "quote",
  );
  // Any FMP feature on the quote-plane being degraded is enough — the free
  // tier's 250/day budget lets a single 429 in any quote-path probe stand
  // in for "the whole /stable/ surface is rate-limited" because the
  // window is a rolling 24h. showFmpRateLimit then renders a localized
  // hint under the empty-state with hours-until-reset math.
  const fmpDown =
    fmpProbe?.status === "down" || fmpProbe?.status === "degraded";

  const metrics = useMemo(() => {
    // Keep the data decision separate from rendering: an empty API response
    // must remain empty here so the page can label the local demo series MOCK.
    if (!financialsFetched) return [];
    if (!financialsData || financialsData.income.length === 0) return [];

    let metricsResult: FinancialMetric[] = [];

    const inc = financialsData?.income ?? [];
    const bal = financialsData?.balance ?? [];
    if (inc.length > 0) {
      const incAsc = [...inc].sort((a, b) => (a.date < b.date ? -1 : 1));
      const balAsc = [...bal].sort((a, b) => (a.date < b.date ? -1 : 1));

      const safeYoy = (arr: typeof inc, key: keyof (typeof inc)[number]) => {
        if (arr.length < 2) return null;
        const prev = arr[arr.length - 2][key] as number;
        const current = arr[arr.length - 1][key] as number;
        return yoyGrowth(prev, current);
      };

      // CAGR helpers close the gap between the working "1Y YoY" column and
      // the 3Y / 5Y columns the modal used to render as "-" because the
      // metric builder never set their fields. `detectPeriodGranularity`
      // reads the most recent row's `period` label so an annual series
      // uses a 1-row stride back per year and a quarterly series uses
      // 4 rows per year. The helper returns `null` when the series is
      // too short, so the modal renders "-" cleanly without throwing.
      const granularity = detectPeriodGranularity(incAsc);
      const safeCagrAtYears = (
        arr: typeof inc,
        key: keyof (typeof inc)[number],
        years: number,
      ): number | null => cagrAtYearsBack(arr, key, years, granularity);

      metricsResult = [
        {
          name: "insights.revenue",
          unit: "B",
          yoy: safeYoy(incAsc, "revenue"),
          cagr3Y: safeCagrAtYears(incAsc, "revenue", 3),
          data: incAsc.map((d) => ({
            date: d.calendarYear,
            value: d.revenue / 1e9,
          })),
          type: "bar",
          color: "blue",
        },
        {
          name: "insights.ebitda",
          unit: "B",
          yoy: safeYoy(incAsc, "ebitda"),
          cagr3Y: safeCagrAtYears(incAsc, "ebitda", 3),
          data: incAsc.map((d) => ({
            date: d.calendarYear,
            value: d.ebitda / 1e9,
          })),
          type: "bar",
          color: "blue",
        },
        {
          name: "insights.grossProfit",
          unit: "B",
          yoy: safeYoy(incAsc, "grossProfit"),
          cagr3Y: safeCagrAtYears(incAsc, "grossProfit", 3),
          data: incAsc.map((d) => ({
            date: d.calendarYear,
            value: d.grossProfit / 1e9,
          })),
          type: "bar",
          color: "blue",
        },
        {
          name: "insights.operatingIncome",
          unit: "B",
          yoy: safeYoy(incAsc, "operatingIncome"),
          cagr3Y: safeCagrAtYears(incAsc, "operatingIncome", 3),
          data: (
            incAsc.filter(
              (row) => row.operatingIncome !== undefined,
            ) as typeof inc
          ).map((d) => ({
            date: d.calendarYear,
            value: (d.operatingIncome ?? 0) / 1e9,
          })),
          type: "bar",
          color: "blue",
        },
        {
          name: "insights.netIncome",
          unit: "B",
          yoy: safeYoy(incAsc, "netIncome"),
          cagr3Y: safeCagrAtYears(incAsc, "netIncome", 3),
          data: incAsc.map((d) => ({
            date: d.calendarYear,
            value: d.netIncome / 1e9,
          })),
          type: "bar",
          color: "blue",
        },
        {
          name: "insights.eps",
          unit: "$",
          yoy: safeYoy(incAsc, "eps"),
          cagr3Y: safeCagrAtYears(incAsc, "eps", 3),
          data: incAsc.map((d) => ({ date: d.calendarYear, value: d.eps })),
          type: "line",
          color: "blue",
        },
        {
          name: "insights.cashAndEquivalents",
          unit: "B",
          yoy:
            balAsc.length >= 2
              ? yoyGrowth(
                  balAsc[balAsc.length - 2].cashAndCashEquivalents,
                  balAsc[balAsc.length - 1].cashAndCashEquivalents,
                )
              : null,
          cagr3Y: cagrAtYearsBack(
            balAsc,
            "cashAndCashEquivalents",
            3,
            granularity,
          ),
          data: balAsc.map((d) => ({
            date: d.calendarYear,
            value: d.cashAndCashEquivalents / 1e9,
          })),
          type: "bar",
          color: "green",
        },
        {
          name: "insights.totalAssets",
          unit: "B",
          yoy:
            balAsc.length >= 2
              ? yoyGrowth(
                  balAsc[balAsc.length - 2].totalAssets,
                  balAsc[balAsc.length - 1].totalAssets,
                )
              : null,
          cagr3Y: cagrAtYearsBack(balAsc, "totalAssets", 3, granularity),
          data: balAsc.map((d) => ({
            date: d.calendarYear,
            value: (d.totalAssets ?? 0) / 1e9,
          })),
          type: "bar",
          color: "purple",
        },
      ];
    }
    return metricsResult;
  }, [financialsData]);

  // ── Yahoo fallback path (FMP rate-limited) ────────────────────────────────
  // When FMP is degraded AND the primary metrics grid is empty, swap to a
  // Yahoo-driven 4-card snapshot view: Revenue / EBITDA / Gross Profit /
  // EPS-est, each labeled "(Yahoo estimate)" so stale-free-tier data
  // can't read as a real primary source. Gated by `enabled` so a healthy
  // FMP probe never fires the Yahoo round-trip. Shares the query key
  // `["stockYahooFallbackFinancials", ticker]` with any other observer,
  // so React Query dedupes across renders.
  const { data: yahooFallbackData } = useStockYahooFallbackFinancials(ticker, {
    enabled: fmpDown && financialsFetched && metrics.length === 0,
  });
  // `hasAnyFallbackValue` gates the fallback render on the basis that a
  // valid Yahoo response always carries at least one finite number — a
  // payload of all `null` (which the server emits on total upstream
  // failure) should fall through to the existing "Metrics unavailable"
  // empty-state rather than render four dashes posing as a snapshot.
  const hasAnyFallbackValue = (yf?: typeof yahooFallbackData): boolean => {
    if (!yf) return false;
    return (
      yf.revenue !== null ||
      yf.ebitda !== null ||
      yf.grossProfit !== null ||
      yf.operatingMargin !== null ||
      yf.profitMargin !== null ||
      yf.grossMargin !== null ||
      yf.revenueGrowth !== null ||
      yf.earningsGrowth !== null ||
      yf.totalCash !== null ||
      yf.totalDebt !== null ||
      yf.enterpriseValue !== null ||
      yf.trailingEps !== null ||
      yf.forwardEps !== null ||
      yf.epsEstimateNextQtr !== null ||
      yf.revenueEstimateNextQtr !== null
    );
  };
  const showYahooFallback =
    fmpDown &&
    financialsFetched &&
    metrics.length === 0 &&
    hasAnyFallbackValue(yahooFallbackData);
  // Never substitute local demo metrics for a missing provider response.
  // Historical cards are shown only when real statement data was fetched;
  // Yahoo fallback is intentionally limited to its explicit single-point view.
  const displayMetrics = metrics.length > 0 ? metrics : [];

  // Locale-aware earnings-date formatted via `formatEarningsDate` (en:
  // "Apr 22, 2026", he: "22 באפר 2026"). The previous `toISOString().slice(0,10)`
  // produced bare ISO "2026-04-22" which read like a YAML key to non-technical
  // users. `formatEarningsDate` also survives upstream Unix-second epoch
  // values because it routes through `parseTradeDate` (handles both halves).
  const earningsDate = useMemo(() => {
    const raw = nextUpcomingEarningsDate(
      ticker,
      quoteData?.earningsAnnouncement,
      earningsCalendar,
    );
    return formatEarningsDate(raw);
  }, [ticker, quoteData?.earningsAnnouncement, earningsCalendar]);

  // NOTE: `categoryColor` and `getCategoryStyle` previously lived here to
  // color news-pill chips per category, but Index.tsx no longer renders
  // news pills (the CompanyProfile sub-component handles news). Both
  // aliases are removed so future readers don't wire them back up — news
  // styling lives in `client/components/CompanyProfile.tsx`.

  const spotlight = useMemo(
    () =>
      deriveSpotlightMetrics({
        quote: quoteData,
        profile: overviewData,
        metrics: stockMetricsData,
        annualFinancials: financialsData,
        quarterlyFinancials: quarterlyFinancialsData,
        fallback: yahooFallbackData,
      }),
    [
      quoteData,
      overviewData,
      stockMetricsData,
      financialsData,
      quarterlyFinancialsData,
      yahooFallbackData,
    ],
  );

  const sma50Delta = useMemo(() => {
    if (
      !quoteData?.price ||
      !quoteData?.priceAvg50 ||
      quoteData.priceAvg50 <= 0
    )
      return null;
    return (
      ((quoteData.price - quoteData.priceAvg50) / quoteData.priceAvg50) * 100
    );
  }, [quoteData?.price, quoteData?.priceAvg50]);

  const sma200Delta = useMemo(() => {
    if (
      !quoteData?.price ||
      !quoteData?.priceAvg200 ||
      quoteData.priceAvg200 <= 0
    )
      return null;
    return (
      ((quoteData.price - quoteData.priceAvg200) / quoteData.priceAvg200) * 100
    );
  }, [quoteData?.price, quoteData?.priceAvg200]);

  const year52Stats = useMemo(() => {
    if (!quoteData?.yearLow || !quoteData?.yearHigh || !quoteData?.price)
      return null;
    const range = quoteData.yearHigh - quoteData.yearLow;
    if (range <= 0) return null;
    const pctOfRange = Math.max(
      0,
      Math.min(100, ((quoteData.price - quoteData.yearLow) / range) * 100),
    );
    const distFromHigh =
      ((quoteData.price - quoteData.yearHigh) / quoteData.yearHigh) * 100;
    return {
      range,
      pctOfRange,
      distFromHigh,
    };
  }, [quoteData?.yearLow, quoteData?.yearHigh, quoteData?.price]);

  const translatePeriod = (period: string) => {
    if (period === "0q") return t("insights.currentQtr");
    if (period === "0y") return t("insights.currentYear");
    if (period === "+1y") return t("insights.nextYear");
    return period;
  };

  const epsEstimates = useMemo(() => {
    const list: EstimateRow[] = [];
    for (const trend of analystData ?? []) {
      if (!["0q", "0y", "+1y"].includes(trend.period)) continue;
      if (trend.earningsEstimate) {
        list.push({
          period: trend.period,
          avg: trend.earningsEstimate.avg ?? null,
          low: trend.earningsEstimate.low ?? null,
          high: trend.earningsEstimate.high ?? null,
        });
      }
    }
    return list;
  }, [analystData]);

  const revenueEstimates = useMemo(() => {
    const list: EstimateRow[] = [];
    for (const trend of analystData ?? []) {
      if (!["0q", "0y", "+1y"].includes(trend.period)) continue;
      if (trend.revenueEstimate) {
        list.push({
          period: trend.period,
          avg: toBillions(trend.revenueEstimate.avg),
          low: toBillions(trend.revenueEstimate.low),
          high: toBillions(trend.revenueEstimate.high),
        });
      }
    }
    return list;
  }, [analystData]);

  return (
    <div className="relative min-h-full w-full bg-background dark text-foreground">
      {/* Background Graticule & Observatory Starfield Grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-30"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.25)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.25)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ==================================================================== */}
        {/* HERO OBSERVATORY SPOTLIGHT CARD */}
        {/* ==================================================================== */}
        <div className="mb-10 rounded-panel border border-border bg-card p-6 lg:p-8 space-y-6 shadow-xs">
          {/* Eyebrow & Live Data Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-positive opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-chart-positive" />
              </span>
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                {t("nav.insights")} · {ticker}
              </span>
              {overviewData?.exchange && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-xs font-mono text-muted-foreground/80">
                    {overviewData.exchange}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {earningsDate && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-muted/40 border border-border/60 text-xs font-mono text-muted-foreground">
                  <span className="text-muted-foreground/70">
                    {t("index.earnings")}:
                  </span>
                  <span className="text-primary font-semibold" dir="ltr">
                    {earningsDate}
                  </span>
                </div>
              )}
              {quoteData && (
                <DataStatusBadge
                  status="live"
                  source="Yahoo Finance"
                  updatedAt={quoteUpdatedAt}
                  compact
                  iconOnly
                />
              )}
            </div>
          </div>

          {/* Main Hero Grid: Left Identity & Price + Right 6 Metric Tiles */}
          <div
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center"
            dir="ltr"
          >
            {/* Left Column: Asset Identity & Hero Price */}
            <div className="lg:col-span-5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-xl bg-background border border-border/80 shadow-xs flex items-center justify-center shrink-0">
                  <TickerLogo
                    ticker={ticker}
                    size="lg"
                    className="rounded-lg"
                    ariaLabel={`${ticker} company logo`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
                      {ticker}
                    </span>
                    {quoteData?.changesPercentage !== undefined && (
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded font-semibold border ${
                          quoteData.changesPercentage >= 0
                            ? "bg-chart-positive/10 text-chart-positive border-chart-positive/20"
                            : "bg-chart-negative/10 text-chart-negative border-chart-negative/20"
                        }`}
                        dir="ltr"
                      >
                        {quoteData.changesPercentage >= 0 ? "+" : ""}
                        {quoteData.changesPercentage.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-0.5">
                    {(overviewData?.companyName &&
                    overviewData.companyName.toUpperCase() !== ticker
                      ? overviewData.companyName
                      : undefined) ??
                      quoteData?.name ??
                      ticker}
                    {overviewData?.sector && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-foreground/80 font-medium">
                          {overviewData.sector}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Large Hero Price */}
              <div>
                {quoteLoading ? (
                  <HeaderPriceSkeleton />
                ) : quoteData?.price ? (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span
                      className="text-4xl sm:text-5xl font-extrabold text-foreground tabular-nums tracking-tight font-mono"
                      dir="ltr"
                    >
                      <AnimatedNumber
                        value={quoteData.price}
                        placeholder={null}
                        format={(v) => `$${v.toFixed(2)}`}
                      />
                    </span>
                    {quoteData.change !== undefined && (
                      <span
                        className={`text-base sm:text-lg font-mono font-semibold tabular-nums ${
                          quoteData.change >= 0
                            ? "text-chart-positive"
                            : "text-chart-negative"
                        }`}
                        dir="ltr"
                      >
                        <AnimatedNumber
                          value={quoteData.change ?? null}
                          placeholder={null}
                          format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
                        />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-lg">
                    {t("index.unavailableApi")}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: 6 Key Fundamental Readouts */}
            <div className="lg:col-span-7">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* 1. Market Cap */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.marketCap")}
                  </div>
                  <div
                    className="text-base sm:text-lg font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {quoteLoading ? "…" : spotlight.marketCap}
                  </div>
                </div>

                {/* 2. P/E Ratio */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.pe")}
                  </div>
                  <div
                    className="text-base sm:text-lg font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {quoteLoading || stockMetricsLoading ? "…" : spotlight.pe}
                  </div>
                </div>

                {/* 3. 3Y Rev CAGR */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.cagr3Y")}
                  </div>
                  <div
                    className={`text-base sm:text-lg font-bold font-mono tabular-nums ${
                      spotlight.cagr3YRaw !== null
                        ? spotlight.cagr3YRaw >= 0
                          ? "text-chart-positive"
                          : "text-chart-negative"
                        : "text-foreground"
                    }`}
                    dir="ltr"
                  >
                    {!financialsFetched && quoteLoading
                      ? "…"
                      : spotlight.cagr3Y}
                  </div>
                </div>

                {/* 4. Revenue (TTM) */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.revenue")}
                  </div>
                  <div
                    className="text-base sm:text-lg font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {!financialsFetched && quoteLoading
                      ? "…"
                      : spotlight.revenue}
                  </div>
                </div>

                {/* 5. Free Cash Flow */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.fcf")}
                  </div>
                  <div
                    className="text-base sm:text-lg font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {!financialsFetched && quoteLoading ? "…" : spotlight.fcf}
                  </div>
                </div>

                {/* 6. Gross Margin */}
                <div className="p-3 sm:p-3.5 rounded-[6px] bg-background/60 border border-border/80 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    {t("landing.spotlight.grossMargin")}
                  </div>
                  <div
                    className="text-base sm:text-lg font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {stockMetricsLoading && quoteLoading
                      ? "…"
                      : spotlight.grossMargin}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full Stock Fundamentals Strip breakdown */}
          <StockFundamentalsStrip
            quote={quoteData}
            metrics={stockMetricsData}
            annualFinancials={financialsData}
            quarterlyFinancials={quarterlyFinancialsData}
            marketCap={quoteData?.marketCap ?? overviewData?.marketCap}
            loading={
              quoteLoading || stockMetricsLoading || quarterlyFinancialsLoading
            }
          />
        </div>

        {/* Charts Grid - 4x2 — three render states driven by query fetch status */}
        <div className="mb-5 mt-10 flex flex-wrap items-end justify-between gap-3 text-left">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold text-foreground tracking-tight">
                {t("index.financialMetricsTitle")}
              </h2>
              {financialsData && (
                <DataStatusBadge
                  status="live"
                  source="Financial statements API"
                  updatedAt={financialsUpdatedAt}
                  compact
                  iconOnly
                />
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground/80">
              {showYahooFallback
                ? "Historical statements are unavailable; no synthetic series is shown."
                : "Only recently fetched provider statement data is displayed."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 text-left">
          {/* Cache-key switch (e.g. /stock/AAPL → /stock/MSFT) resets isFetched
              to false even though we may have stale data on disk; the skeleton
              flash masks the cache-miss transition so don't add an enabled:
              guard here without also handling that path. */}
          {!financialsFetched ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </>
          ) : showYahooFallback ? (
            <div className="col-span-full rounded-panel border border-chart-blue/30 bg-chart-blue/5 px-6 py-8 text-center">
              <DataStatusBadge
                status="estimate"
                source="Yahoo Finance"
                updatedAt={financialsUpdatedAt}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Showing a single-point estimate instead of a historical YoY/CAGR
                series.
              </p>
            </div>
          ) : displayMetrics.length === 0 ? (
            <div className="col-span-full bg-card border border-border rounded-panel px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("index.metricsUnavailable", { ticker })}
              </p>
              {/* When FMP is degraded AND metrics are empty, the "Retry"
                    button by itself is a misleading hint — it's the budget,
                    not the request. Surface the real cause (free-tier 429)
                    so users know why Retry is honest about a likely no-op,
                    and links them to docs that explain the rate limit. Hidden
                    until both conditions are met so a benign empty-upstream
                    state (e.g. a symbol FMP doesn't cover) still reads as
                    "no data" without alarm. */}
              {fmpDown && (
                <p className="mt-3 text-xs text-chart-amber/90 max-w-md mx-auto leading-relaxed">
                  {t("index.metricsRateLimitedUnknownReset")}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  // .catch(() => null) future-proofs against the void-discard
                  // shape — if anyone later awaits this or chains .then(), the
                  // pipeline still won't surface an unhandled rejection. The
                  // FMP free tier frequently returns the same empty array on
                  // refetch, so this button is honest about a likely no-op.
                  refetchFinancials().catch(() => null);
                }}
                className="mt-4 text-xs text-primary hover:opacity-80 transition-opacity"
              >
                {t("index.metricsRetry")}
              </button>
            </div>
          ) : (
            displayMetrics.map((metric, idx) => {
              // Revenue is the one card that can show a product-segment
              // breakdown (FMP revenue-product-segmentation) with segment
              // filters. When the free-tier quota is exhausted the card falls
              // back to this exact total-revenue render but keeps the segment
              // filters visible as a locked premium feature.
              if (metric.name === "insights.revenue") {
                return (
                  <RevenueSegmentsCard
                    key={idx}
                    metric={metric}
                    ticker={ticker}
                    onUpgradeClick={() => setIsUpgradeOpen(true)}
                  />
                );
              }
              const latestVal = metric.data[metric.data.length - 1]?.value;
              const yoyChange = metric.yoy;
              return (
                <InsightsCard
                  key={idx}
                  title={
                    t(metric.name) === metric.name
                      ? metric.name.split(".")[1]
                      : t(metric.name)
                  }
                  value={
                    latestVal == null
                      ? "—"
                      : `${latestVal.toFixed(2)}${metric.unit === "$" ? "" : metric.unit}`
                  }
                  badgeText={
                    yoyChange == null
                      ? "—"
                      : `${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(2)}%`
                  }
                  badgeType={
                    yoyChange == null
                      ? "neutral"
                      : yoyChange >= 0
                        ? "positive"
                        : "negative"
                  }
                  metricId={metric.name}
                  metricData={metric}
                  ticker={ticker}
                />
              );
            })
          )}
        </div>

        {/* Unified Wall Street Analyst & Technical Momentum 2-Column Section */}
        <div className="my-10 text-left">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-xs">
                  <ChartNoAxesCombined className="w-4 h-4" />
                </div>
                <h2 className="font-display text-base sm:text-lg font-bold text-foreground tracking-tight">
                  {t("insights.analystEstimates")} & Price Corridor
                </h2>
                {analystData && analystData.length > 0 && (
                  <DataStatusBadge
                    status="live"
                    source="Yahoo Finance consensus"
                    compact
                    iconOnly
                  />
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground/80">
                Wall Street price corridor, technical moving averages, and
                forward consensus estimates.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Card 1: Technical Momentum & Wall St. Corridor */}
            <div className="rounded-panel border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-md flex flex-col justify-between space-y-4 shadow-xs hover:border-border transition-all">
              {analystCardLoading ? (
                <AnalystCardSkeleton />
              ) : (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
                      </span>
                      <h3 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-foreground flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-primary" />
                        <span>Price Corridor & Momentum</span>
                      </h3>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-mono font-bold px-2.5 py-1 rounded-[4px] border whitespace-nowrap tabular-nums ${
                        targetEps != null
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                          : "bg-muted/40 text-muted-foreground/70 border-border/40"
                      }`}
                    >
                      Target EPS:{" "}
                      <AnimatedNumber
                        value={targetEps}
                        format={(v) => `$${v.toFixed(2)}`}
                      />
                    </span>
                  </div>

                  {/* 52-Week Price Range Corridor */}
                  {quoteData?.yearLow &&
                    quoteData?.yearHigh &&
                    quoteData?.price && (
                      <div className="p-3.5 rounded-lg bg-background/50 border border-border/50 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-muted-foreground font-medium">
                            52W Corridor
                          </span>
                          {year52Stats && (
                            <span className="text-[11px] font-semibold text-foreground/80 px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                              {year52Stats.pctOfRange.toFixed(0)}% of 52W Range
                            </span>
                          )}
                        </div>

                        {(() => {
                          const range = quoteData.yearHigh - quoteData.yearLow;
                          const finalPct = Math.max(
                            0,
                            Math.min(
                              100,
                              range > 0
                                ? ((quoteData.price - quoteData.yearLow) /
                                    range) *
                                    100
                                : 50,
                            ),
                          );
                          const barColor =
                            finalPct > 66
                              ? "bg-chart-positive"
                              : finalPct >= 33
                                ? "bg-amber-400"
                                : "bg-chart-negative";
                          const textColor =
                            finalPct > 66
                              ? "text-chart-positive"
                              : finalPct >= 33
                                ? "text-amber-400"
                                : "text-chart-negative";
                          const pctOf = (price: number) =>
                            Math.max(
                              0,
                              Math.min(
                                100,
                                range > 0
                                  ? ((price - quoteData.yearLow) / range) * 100
                                  : 50,
                              ),
                            );

                          return (
                            <div className="space-y-1.5 pt-1">
                              <div className="relative w-full h-2.5 bg-muted/80 rounded-full overflow-hidden">
                                <AnimatedNumber
                                  value={quoteData.price}
                                  placeholder={null}
                                >
                                  {(price) => (
                                    <div
                                      className={`h-full rounded-full transition-all ${barColor}`}
                                      style={{ width: `${pctOf(price)}%` }}
                                    />
                                  )}
                                </AnimatedNumber>
                              </div>
                              <div className="flex items-center justify-between text-xs font-mono tabular-nums text-muted-foreground pt-0.5">
                                <span>
                                  Low:{" "}
                                  <strong
                                    className="text-foreground font-bold"
                                    dir="ltr"
                                  >
                                    ${quoteData.yearLow.toFixed(2)}
                                  </strong>
                                </span>
                                <span
                                  className="text-center font-bold text-foreground"
                                  dir="ltr"
                                >
                                  Current:{" "}
                                  <span className={textColor}>
                                    ${quoteData.price.toFixed(2)}
                                  </span>
                                </span>
                                <span>
                                  High:{" "}
                                  <strong
                                    className="text-foreground font-bold"
                                    dir="ltr"
                                  >
                                    ${quoteData.yearHigh.toFixed(2)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  {/* 2 Moving Averages */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    {/* 50-Day Moving Average */}
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-border transition-colors">
                      <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                        <span>50-Day SMA</span>
                        {sma50Delta !== null && (
                          <span
                            className={`text-[10px] font-bold ${
                              sma50Delta >= 0
                                ? "text-chart-positive"
                                : "text-chart-negative"
                            }`}
                            dir="ltr"
                          >
                            {sma50Delta >= 0 ? "+" : ""}
                            {sma50Delta.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div
                        className="font-mono font-bold text-foreground text-sm sm:text-base tabular-nums"
                        dir="ltr"
                      >
                        <AnimatedNumber
                          value={quoteData?.priceAvg50 ?? null}
                          format={(v) => `$${v.toFixed(2)}`}
                        />
                      </div>
                    </div>

                    {/* 200-Day Moving Average */}
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-border transition-colors">
                      <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                        <span>200-Day SMA</span>
                        {sma200Delta !== null && (
                          <span
                            className={`text-[10px] font-bold ${
                              sma200Delta >= 0
                                ? "text-chart-positive"
                                : "text-chart-negative"
                            }`}
                            dir="ltr"
                          >
                            {sma200Delta >= 0 ? "+" : ""}
                            {sma200Delta.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div
                        className="font-mono font-bold text-foreground text-sm sm:text-base tabular-nums"
                        dir="ltr"
                      >
                        <AnimatedNumber
                          value={quoteData?.priceAvg200 ?? null}
                          format={(v) => `$${v.toFixed(2)}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Multi-Period Forward Consensus Forecasts (EPS & Revenue) */}
            <div className="rounded-panel border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-md flex flex-col justify-between space-y-4 shadow-xs hover:border-border transition-all">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-border/50 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-positive opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-chart-positive" />
                    </span>
                    <h3 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-foreground flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-primary" />
                      <span>Forward Estimates Table</span>
                    </h3>
                  </div>
                  {analystData && analystData.length > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground/80 px-2 py-0.5 rounded bg-muted/60 border border-border/40 uppercase">
                      Consensus
                    </span>
                  )}
                </div>

                <div className="space-y-3.5">
                  <IndexEstimateTable
                    title="EPS Consensus"
                    rows={epsEstimates}
                    format={formatEstimate}
                    tone="primary"
                    translatePeriod={translatePeriod}
                    t={t}
                  />
                  <IndexEstimateTable
                    title="Revenue Consensus ($B)"
                    rows={revenueEstimates}
                    format={formatRevenueEstimate}
                    tone="positive"
                    translatePeriod={translatePeriod}
                    t={t}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Company Profile Section */}
        <CompanyProfile ticker={ticker} />
      </div>

      {/* Chart Modal */}
      {selectedMetric && (
        <ChartModal
          metric={selectedMetric}
          isOpen={selectedMetric !== null}
          onClose={() => setSelectedMetric(null)}
          ticker={ticker}
          annualStatements={financialsData}
        />
      )}

      {/* Pricing modal — placeholder wired from the locked CTA. */}
      <PricingModal
        context="revenueSegments"
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
      />
    </div>
  );
}
