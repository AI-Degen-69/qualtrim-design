import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { portfolios } from "@/lib/mockData";
import BatchQuoteFallbackHint from "@/components/BatchQuoteFallbackHint";
import {
  useBatchQuotes,
  useFxRates,
  useMultiChart,
  useEarningsCalendar,
  useYahooDown,
} from "@/hooks/useStockData";
import {
  annualizedVolatility,
  cagr as cagrOf,
  irrBisection,
  sharpeRatio as sharpeOf,
  sortinoRatio as sortinoOf,
} from "@/lib/finance";
import { ChevronDown, RefreshCw, Calendar } from "lucide-react";
import type { FxCurrency, StockQuote } from "@shared/api";

type Currency = FxCurrency;
type SortKey = "volatility" | "sharpe" | "weight" | "gainLoss";

const CURRENCY_OPTIONS: {
  value: Currency;
  symbol: string;
  labelKey: string;
}[] = [
  { value: "USD", symbol: "$", labelKey: "common.usd" },
  { value: "ILS", symbol: "\u20AA", labelKey: "common.ils" },
  { value: "EUR", symbol: "\u20AC", labelKey: "common.eur" },
  { value: "GBP", symbol: "\u00A3", labelKey: "common.gbp" },
];

/**
 * Formats a numeric value as currency for display.
 *
 * @param value - The amount to format.
 * @param currency - The currency in which to display the amount.
 * @param compact - Whether to omit decimal places.
 * @returns The formatted currency value, or `—` when the value is unavailable or invalid.
 */
function fmtMoney(
  value: number | null | undefined,
  currency: Currency,
  compact = false,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "\u2014";
  const fractionDigits = compact ? 0 : 2;
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
  try {
    return new Intl.NumberFormat(undefined, opts).format(value);
  } catch {
    // Fall back to plain prefix if Intl currency isn't supported in this runtime.
    const sym =
      CURRENCY_OPTIONS.find((c) => c.value === currency)?.symbol ?? "$";
    return `${sym}${value.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
  }
}

/**
 * Formats a numeric ratio as a percentage string.
 *
 * @param value - The ratio to format.
 * @param digits - The number of decimal places to display.
 * @returns The formatted percentage, or `—` when `value` is unavailable or not finite.
 */
function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "\u2014";
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Extracts valid positive closing prices from historical chart data.
 *
 * @param chart - Chart data containing historical closing prices.
 * @returns An array of finite closing prices greater than zero.
 */
function historicalCloses(
  chart: { historical?: { close: number }[] } | null | undefined,
): number[] {
  if (!chart || !chart.historical) return [];
  return chart.historical
    .map((p) => Number(p.close))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Displays portfolio holdings, performance metrics, currency-converted values, and upcoming earnings events.
 *
 * @returns The rendered portfolio dashboard
 */
export function Portfolio() {
  const { t } = useI18n();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    portfolios[0].id,
  );
  const [currency, setCurrency] = useState<Currency>("USD");
  const [divOverlay, setDivOverlay] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("weight");

  const activePortfolio =
    portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0];

  // ---- Live data wiring --------------------------------------------------
  const symbols = useMemo(
    () => activePortfolio.holdings.map((h) => h.ticker),
    [activePortfolio],
  );

  // FX is requested for the union of USD + chosen currency so the multiplier
  // paints every display value correctly.
  const { data: fxData, isLoading: fxLoading } = useFxRates(
    useMemo(() => Array.from(new Set(["USD", currency])), [currency]),
  );

  const { data: batch, isLoading: quotesLoading } = useBatchQuotes(symbols);
  const quotes = (batch?.quotes ?? []) as (StockQuote | null)[];

  // Build a map from ticker symbol to quote for safe lookup
  const quoteMap = useMemo(() => {
    const map = new Map<string, StockQuote | null>();
    quotes.forEach((q) => {
      if (q) map.set(q.symbol, q);
    });
    return map;
  }, [quotes]);

  // For the dividend overlay we'll surface the next earnings / payday event.
  const { from: today, to: plusEightWeeks } = useMemo(() => {
    const f = new Date();
    const t = new Date();
    t.setDate(t.getDate() + 56); // 8 weeks
    return {
      from: f.toISOString().slice(0, 10),
      to: t.toISOString().slice(0, 10),
    };
  }, []);
  const { data: earningsData } = useEarningsCalendar(today, plusEightWeeks);

  // Per-holding 1Y chart for vol/Sharpe; cached 1h server-side so 12 charts
  // cost ~1 round trip per refetch.
  const chartResults = useMultiChart(symbols);

  // ---- FX multiplier ------------------------------------------------------
  // fxRate.rates["USDILS"] = 3.75 (i.e. 1 USD = 3.75 ILS). Multiply USD value
  // by this to get ILS. Round-trip USDUSD = 1 baseline.
  const fxRate = useMemo(() => {
    if (currency === "USD") return 1;
    const pair = `USD${currency}`;
    return fxData?.rates?.[pair] ?? null;
  }, [currency, fxData?.rates]);

  const fxFailed =
    !fxLoading && fxData && Object.keys(fxData.rates).length <= 1;

  // ---- Portfolio-level analytics (USD; we multiply once at display) ------
  const portfolioMetrics = useMemo(() => {
    const cfs = activePortfolio.cashflows.map((c) => ({
      date: c.date,
      amount: c.amount,
    }));
    cfs.push({
      date: new Date().toISOString().slice(0, 10),
      amount: activePortfolio.currentValue,
    });
    const irrRes = irrBisection(cfs);

    let cagrVal: number | null = null;
    if (activePortfolio.cashflows.length === 1) {
      const firstDate = activePortfolio.cashflows[0].date;
      const startVal = Math.abs(activePortfolio.cashflows[0].amount);
      const endVal = activePortfolio.currentValue + activePortfolio.gainLoss;
      const days =
        (new Date().getTime() - new Date(firstDate).getTime()) /
        (1000 * 60 * 60 * 24);
      const years = days / 365.25;
      if (years > 0.2 && startVal > 0) {
        cagrVal = cagrOf(startVal, endVal, years);
      }
    }
    return {
      irr: irrRes.rate,
      cagr: cagrVal,
    };
  }, [activePortfolio]);

  // ---- Per-holding analytics --------------------------------------------
  const holdingsData = useMemo(() => {
    return activePortfolio.holdings.map((holding, i) => {
      const liveQuote = quoteMap.get(holding.ticker) ?? null;
      const livePrice = liveQuote?.price ?? null;
      const liveChange = liveQuote?.changesPercentage ?? null;
      const chart = chartResults[i]?.data ?? null;
      const closes = historicalCloses(chart);
      const vol = closes.length >= 20 ? annualizedVolatility(closes) : null;
      const sharpe = closes.length >= 20 ? sharpeOf(closes, 0.045) : null;
      const sortino = closes.length >= 20 ? sortinoOf(closes, 0.045) : null;

      return {
        ...holding,
        livePrice,
        liveChange,
        volatility: vol,
        sharpe,
        sortino,
      };
    });
  }, [activePortfolio, quoteMap, chartResults]);

  // ---- Sorted holdings ---------------------------------------------------
  const sortedHoldings = useMemo(() => {
    const arr = [...holdingsData];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "volatility":
          return (b.volatility ?? -Infinity) - (a.volatility ?? -Infinity);
        case "sharpe":
          return (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity);
        case "weight":
          return b.weight - a.weight;
        case "gainLoss":
        default:
          return b.gainLoss - a.gainLoss;
      }
    });
    return arr;
  }, [holdingsData, sortKey]);

  // Normalized risk metric aggregations excluding missing values
  const weightedMetric = (key: "volatility" | "sharpe" | "sortino") => {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const h of sortedHoldings) {
      const val = h[key];
      if (val != null && Number.isFinite(val)) {
        weightedSum += val * h.weight;
        totalWeight += h.weight;
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
  };

  // ---- Display helpers ---------------------------------------------------
  const usd2display = (usd: number | null | undefined) => {
    if (usd === null || usd === undefined || !Number.isFinite(usd)) return null;
    if (currency === "USD") return usd;
    if (fxRate === null) return null;
    return usd * fxRate;
  };

  const gainLossFxAware = usd2display(activePortfolio.gainLoss);
  const gainLossPct =
    activePortfolio.currentValue > 0
      ? (activePortfolio.gainLoss / activePortfolio.currentValue) * 100
      : 0;

  const currentValueDisplay = usd2display(activePortfolio.currentValue);
  const annualIncomeDisplay = usd2display(activePortfolio.annualIncome);

  const liveCount = quotes.filter(Boolean).length;
  const yahooDown = useYahooDown();

  return (
    <div className="space-y-8">
      {/* ---- Top-of-page FX-fallback banner (only when conversion can't be honest) ---- */}
      {currency !== "USD" && (fxLoading || fxRate === null) && (
        <div
          className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300 flex items-start gap-2"
          role="status"
        >
          <span className="font-semibold uppercase tracking-wide text-xs mt-0.5">
            FX
          </span>
          <div>
            {t("portfolio.fxBannerBody")}
            <span className="text-amber-400 ml-1">
              [{t("portfolio.fxStale")}]
            </span>
          </div>
        </div>
      )}

      {/* ---- Controls (portfolio picker, currency, div overlay, refresh) ---- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={selectedPortfolioId}
              onChange={(e) => setSelectedPortfolioId(e.target.value)}
              aria-label="Select portfolio"
              className="appearance-none bg-secondary/50 border border-border text-lg font-bold py-2 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer text-foreground"
            >
              {portfolios.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  className="bg-popover text-popover-foreground"
                >
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              aria-label="Currency"
              className="appearance-none bg-secondary/50 border border-border text-sm py-2.5 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer text-foreground"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-popover text-popover-foreground"
                >
                  {opt.symbol} {opt.value}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer px-3 py-2 bg-secondary/30 rounded-md border border-border transition-colors">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="checkbox"
              checked={divOverlay}
              onChange={(e) => setDivOverlay(e.target.checked)}
              className="rounded border-border bg-secondary text-primary focus:ring-primary cursor-pointer"
            />
            {t("portfolio.divOverlay")}
          </label>
        </div>

        <div className="flex items-center gap-2">
          {fxFailed && (
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded text-amber-400 bg-amber-500/10">
              {t("portfolio.fxStale")}
            </span>
          )}
          {liveCount > 0 && liveCount < symbols.length && (
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded text-amber-300 bg-amber-500/10">
              {t("portfolio.partial")} {liveCount}/{symbols.length}
            </span>
          )}
          {(liveCount === 0 || yahooDown) && !quotesLoading && (
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded text-amber-400 bg-amber-500/10">
              [MOCK] {t("portfolio.noPrice")}
            </span>
          )}
          <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-4 rounded-lg transition-colors shadow-sm text-sm">
            <RefreshCw className="w-4 h-4" />
            {t("portfolio.updatePortfolio")}
          </button>
        </div>
      </div>

      {/* ---- Top KPI strip (currency-converted) ---- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2">
            {t("portfolio.currentValue")}
          </p>
          <p
            className="text-2xl font-bold font-mono tabular-nums text-foreground"
            dir="ltr"
          >
            {fmtMoney(currentValueDisplay, currency, true)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2 whitespace-nowrap">
            {t("portfolio.gainLoss")}
          </p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${(gainLossFxAware ?? 0) >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
            dir="ltr"
          >
            {gainLossFxAware === null
              ? "\u2014"
              : fmtMoney(gainLossFxAware, currency, false)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2 whitespace-nowrap">
            {t("portfolio.gainLossPct")}
          </p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${gainLossPct >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
            dir="ltr"
          >
            {gainLossPct >= 0 ? "+" : ""}
            {gainLossPct.toFixed(2)}%
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2">
            {t("portfolio.annualIncome")}
          </p>
          <p
            className="text-2xl font-bold font-mono tabular-nums text-primary"
            dir="ltr"
          >
            {fmtMoney(annualIncomeDisplay, currency, false)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2 whitespace-nowrap">
            {t("portfolio.dividendYield")}
          </p>
          <p
            className="text-2xl font-bold font-mono tabular-nums text-primary"
            dir="ltr"
          >
            {activePortfolio.dividendYield.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* ---- Analytics strip (IRR, CAGR, Vol, Sharpe, Sortino) ---- */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            {t("portfolio.analyticsTitle")}
          </h3>
          <span className="text-xs uppercase tracking-wide px-2 py-1 rounded text-amber-300 bg-amber-500/10">
            {t("portfolio.derived")}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("portfolio.irr")}
            </p>
            <p
              className={`text-xl font-bold font-mono tabular-nums ${(portfolioMetrics.irr ?? -1) >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
              dir="ltr"
            >
              {portfolioMetrics.irr === null
                ? "\u2014"
                : fmtPct(portfolioMetrics.irr)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("portfolio.synthCashflows")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("portfolio.cagr")}
            </p>
            <p
              className={`text-xl font-bold font-mono tabular-nums ${(portfolioMetrics.cagr ?? -1) >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
              dir="ltr"
            >
              {portfolioMetrics.cagr === null
                ? "\u2014"
                : fmtPct(portfolioMetrics.cagr)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("portfolio.oneYearBasis")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("portfolio.volatility")}
            </p>
            <p
              className="text-xl font-bold font-mono tabular-nums text-chart-amber"
              dir="ltr"
            >
              {(() => {
                const vol = weightedMetric("volatility");
                return vol !== null ? fmtPct(vol) : "\u2014";
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("portfolio.weightedAvg")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("portfolio.sharpe")}
            </p>
            <p
              className="text-xl font-bold font-mono tabular-nums text-primary"
              dir="ltr"
            >
              {(() => {
                const ws = weightedMetric("sharpe");
                return ws !== null ? ws.toFixed(2) : "\u2014";
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">rf 4.5%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("portfolio.sortino")}
            </p>
            <p
              className="text-xl font-bold font-mono tabular-nums text-primary"
              dir="ltr"
            >
              {(() => {
                const ws = weightedMetric("sortino");
                return ws !== null ? ws.toFixed(2) : "\u2014";
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("portfolio.downsideOnly")}
            </p>
          </div>
        </div>
      </div>

      {/* ---- Holdings table per-holding volatility + dividend overlay ---- */}
      <div className="bg-card border border-border rounded-xl p-6 relative">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h3 className="text-xl font-bold text-foreground">
            {t("portfolio.holdings")}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BatchQuoteFallbackHint />
            <label htmlFor="portfolio-sort-select">
              {t("portfolio.sortBy")}:
            </label>
            <div className="relative">
              <select
                id="portfolio-sort-select"
                aria-label={t("portfolio.sortBy") || "Sort by"}
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="appearance-none bg-secondary/50 border border-border text-xs font-medium py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer text-foreground"
              >
                <option
                  value="weight"
                  className="bg-popover text-popover-foreground"
                >
                  {t("portfolio.weight")}
                </option>
                <option
                  value="gainLoss"
                  className="bg-popover text-popover-foreground"
                >
                  {t("portfolio.gainLoss")}
                </option>
                <option
                  value="volatility"
                  className="bg-popover text-popover-foreground"
                >
                  {t("portfolio.volatility")}
                </option>
                <option
                  value="sharpe"
                  className="bg-popover text-popover-foreground"
                >
                  {t("portfolio.sharpe")}
                </option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead className="text-xs text-muted-foreground uppercase border-b border-border">
              <tr>
                <th className="pb-3 font-medium">{t("common.symbol")}</th>
                <th className="pb-3 font-medium text-right">
                  {t("common.price")}
                </th>
                <th className="pb-3 font-medium text-right">
                  {t("common.change")}
                </th>
                <th className="pb-3 font-medium text-right">
                  {t("portfolio.weight")}
                </th>
                <th className="pb-3 font-medium text-right">
                  {t("portfolio.gainLoss")}
                </th>
                <th className="pb-3 font-medium text-right">
                  {t("portfolio.volatility")}
                </th>
                <th className="pb-3 font-medium text-right">
                  {t("portfolio.sharpe")}
                </th>
                {divOverlay && (
                  <th className="pb-3 font-medium text-right">
                    {t("portfolio.nextEvent")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedHoldings.map((h, i) => {
                const nextEarning = (earningsData ?? []).find(
                  (e) => e.symbol === h.ticker,
                );
                const todayStr = new Date().toISOString().slice(0, 10);
                const eventDate = nextEarning?.date ?? "";
                const eventSoon =
                  eventDate &&
                  eventDate >= todayStr &&
                  eventDate <= plusEightWeeks;
                return (
                  <tr
                    key={h.ticker + i}
                    className="hover:bg-muted/30 transition-colors border-b border-border last:border-0"
                  >
                    <td className="py-4 font-bold text-base text-foreground">
                      {h.ticker}
                    </td>
                    <td
                      className="py-4 text-right font-medium font-mono tabular-nums"
                      dir="ltr"
                    >
                      {h.livePrice !== null
                        ? fmtMoney(usd2display(h.livePrice), currency, false)
                        : "\u2014"}
                    </td>
                    <td
                      className={`py-4 text-right font-medium font-mono tabular-nums ${(h.liveChange ?? 0) >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                      dir="ltr"
                    >
                      {h.liveChange === null || h.liveChange === undefined
                        ? "\u2014"
                        : `${h.liveChange >= 0 ? "+" : ""}${h.liveChange.toFixed(2)}%`}
                    </td>
                    <td
                      className="py-4 text-right font-medium font-mono tabular-nums"
                      dir="ltr"
                    >
                      {h.weight.toFixed(1)}%
                    </td>
                    <td
                      className={`py-4 text-right font-medium font-mono tabular-nums whitespace-nowrap ${h.gainLoss >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                      dir="ltr"
                    >
                      {h.gainLoss >= 0 ? "+" : ""}
                      {h.gainLoss.toFixed(2)}%
                    </td>
                    <td
                      className="py-4 text-right font-medium font-mono tabular-nums text-chart-amber"
                      dir="ltr"
                    >
                      {fmtPct(h.volatility)}
                    </td>
                    <td
                      className="py-4 text-right font-medium font-mono tabular-nums text-primary"
                      dir="ltr"
                    >
                      {h.sharpe !== null && Number.isFinite(h.sharpe)
                        ? h.sharpe.toFixed(2)
                        : "\u2014"}
                    </td>
                    {divOverlay && (
                      <td
                        className="py-4 text-right text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        {eventSoon
                          ? `${eventDate} (${nextEarning!.time === "bmo" ? "BMO" : "AMC"})`
                          : "\u2014"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Below-the-fold: plain-language analytics paragraphs ------------- */}
      <div className="bg-card/50 border border-border rounded-xl p-6 text-sm text-muted-foreground space-y-2">
        <p>
          <span className="text-foreground font-semibold">
            {t("portfolio.irrExplainTitle")}:
          </span>{" "}
          {t("portfolio.irrExplainBody", {
            rate:
              portfolioMetrics.irr === null
                ? "—"
                : fmtPct(portfolioMetrics.irr),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("portfolio.reviewReminder")}
        </p>
      </div>
    </div>
  );
}

export default Portfolio;
