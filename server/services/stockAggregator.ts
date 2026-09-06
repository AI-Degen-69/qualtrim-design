import {
  fetchYahooQuote,
  fetchYahooProfile,
  fetchYahooPriceHistory,
  fetchYahooFinancialData,
  fetchYahooAnalystEstimates,
} from "./yahooFinance";
import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getKeyMetrics,
  getKeyMetricsTTM,
  getRatios,
  getRatiosTTM,
  getFinancialScores,
  getPriceChange,
  getCompanyProfile,
  getEarnings,
  getInsiderTrades,
} from "./fmp";
import { fetchCompanyNews, type NewsItem } from "./finnhub";
import { formatLargeNumber } from "@shared/format";

/**
 * Map FMP financial statements into chart-ready quarterly/annual arrays.
 */
function mapChartData(
  incList: any[],
  balList: any[],
  cfList: any[],
  isAnnual: boolean,
) {
  const maxLen = Math.max(incList.length, balList.length, cfList.length);
  const data: any[] = [];
  const limit = Math.min(maxLen, 20);

  for (let i = limit - 1; i >= 0; i--) {
    const inc = incList[i] || {};
    const bal = balList[i] || {};
    const cf = cfList[i] || {};
    const rawDate = inc.date || bal.date || cf.date || "0000-00-00";
    const d = new Date(rawDate);
    const label = isAnnual
      ? d.getFullYear().toString()
      : `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;

    data.push({
      date: rawDate,
      period: label,
      revenue: inc.revenue ?? null,
      ebitda: inc.ebitda ?? null,
      netIncome: inc.netIncome ?? null,
      fcf: cf.freeCashFlow ?? null,
      eps: inc.eps ?? null,
      shares: inc.weightedAverageShsOut ?? null,
      cash: bal.cashAndCashEquivalents ?? null,
      debt: bal.totalDebt ?? null,
      grossProfit: inc.grossProfit ?? null,
      operatingIncome: inc.operatingIncome ?? null,
      stockholdersEquity: bal.totalStockholdersEquity ?? null,
      totalAssets: bal.totalAssets ?? null,
      operatingCashFlow: cf.netCashProvidedByOperatingActivities ?? null,
    });
  }
  return data;
}

/**
 * Compute CAGR from chart data.
 */
function computeCAGR(data: any[], key: string, years: number): number | null {
  if (!data || data.length < 2) return null;
  const currentVal = data[data.length - 1]?.[key];
  const offset = years;
  const pastVal = data[Math.max(0, data.length - 1 - offset)]?.[key];
  if (!pastVal || !currentVal || pastVal <= 0 || currentVal <= 0) return null;
  const cagr = (Math.pow(currentVal / pastVal, 1 / years) - 1) * 100;
  return parseFloat(cagr.toFixed(2));
}

/**
 * Compute YoY growth from chart data.
 */
function computeYoY(data: any[], key: string): number | null {
  if (!data || data.length < 5) return null;
  const currentVal = data[data.length - 1]?.[key];
  const pastVal = data[data.length - 5]?.[key]; // 4 quarters ago = 1 year
  if (!pastVal || !currentVal || pastVal <= 0) return null;
  const yoy = ((currentVal - pastVal) / Math.abs(pastVal)) * 100;
  return parseFloat(yoy.toFixed(2));
}

/**
 * True when a metric value is a real number — including 0.
 *
 * C6 semantics: a literal 0 (breakeven free cash flow, a debt-free balance
 * sheet) is real data and renders as "$0" / "0.00%" / "0.00x". Only null,
 * undefined, or non-finite values mean "no data" and render as "—".
 */
function hasValue(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * Main aggregator: fetch all data for a ticker from multiple sources.
 * Yahoo = real-time quotes, profile, financial data, price history (FREE, unlimited).
 * FMP = financial statements, ratios, key metrics (250 req/day free tier).
 * Falls back gracefully when any source fails.
 */
export async function aggregateStockData(ticker: string) {
  const symbol = ticker.toUpperCase();

  // Phase 1: Yahoo Finance (free, unlimited) + Finnhub news — fetch in parallel
  const [
    yahooQuote,
    yahooProfile,
    yahooFinancial,
    yahooPriceHistory,
    yahooEstimates,
    finnhubNews,
  ] = await Promise.all([
    fetchYahooQuote(symbol),
    fetchYahooProfile(symbol),
    fetchYahooFinancialData(symbol),
    fetchYahooPriceHistory(symbol, 1),
    fetchYahooAnalystEstimates(symbol),
    fetchCompanyNews(symbol).catch(() => [] as NewsItem[]),
  ]);

  // Phase 2: FMP (rate-limited, 250/day) — fetch in parallel
  // Use try/catch per call so a failure doesn't kill everything
  const [
    fmpIncome,
    fmpBalance,
    fmpCashFlow,
    fmpMetrics,
    fmpMetricsTTM,
    fmpRatios,
    fmpRatiosTTM,
    fmpScores,
    fmpPriceChange,
    fmpProfile,
    fmpEarnings,
    fmpInsiderTrades,
  ] = await Promise.all([
    getIncomeStatements(symbol).catch(() => []),
    getBalanceSheets(symbol).catch(() => []),
    getCashFlowStatements(symbol).catch(() => []),
    getKeyMetrics(symbol).catch(() => []),
    getKeyMetricsTTM(symbol).catch(() => ({})),
    getRatios(symbol).catch(() => []),
    getRatiosTTM(symbol).catch(() => ({})),
    getFinancialScores(symbol).catch(() => ({})),
    getPriceChange(symbol).catch(() => null),
    getCompanyProfile(symbol).catch(() => null),
    getEarnings(symbol).catch(() => []),
    getInsiderTrades(symbol).catch(() => []),
  ]);

  // Build chart data from FMP statements
  const chartDataAnnual = mapChartData(
    fmpIncome,
    fmpBalance,
    fmpCashFlow,
    true,
  );

  // Also fetch quarterly for finer chart data
  let chartDataQuarterly: any[] = [];
  try {
    const [qInc, qBal, qCf] = await Promise.all([
      getIncomeStatements(symbol, "quarter"),
      getBalanceSheets(symbol, "quarter"),
      getCashFlowStatements(symbol, "quarter"),
    ]);
    chartDataQuarterly = mapChartData(qInc, qBal, qCf, false);
  } catch {
    // Fall back to annual
  }

  const effectiveQuarterly =
    chartDataQuarterly.length > 0 ? chartDataQuarterly : chartDataAnnual;

  // ── Build Quick Stats (matching the mock data structure) ──
  const marketCap = yahooQuote?.marketCap ?? fmpMetricsTTM?.marketCap ?? null;
  const peTtm = yahooQuote?.trailingPE ?? fmpMetrics[0]?.peRatio ?? null;
  const peNtm = yahooQuote?.forwardPE ?? null;
  const priceToSales = fmpRatiosTTM?.priceToSalesRatioTTM ?? null;
  const evToEbitda =
    yahooQuote?.enterpriseToEbitda ??
    fmpMetrics[0]?.enterpriseValueMultiple ??
    null;
  const priceToBook =
    yahooQuote?.priceToBook ?? fmpRatiosTTM?.priceToBookRatioTTM ?? null;

  const fcf = yahooFinancial?.freeCashFlow ?? null;
  const fcfYield =
    hasValue(fcf) && hasValue(marketCap) && marketCap !== 0
      ? (fcf / marketCap) * 100
      : null;
  const operatingCashFlow = yahooFinancial?.operatingCashFlow ?? null;
  const payoutRatio =
    yahooQuote?.payoutRatio ?? fmpRatiosTTM?.dividendPayoutRatioTTM ?? null;

  const grossMargin = yahooFinancial?.grossMargin ?? null;
  const operatingMargin = yahooFinancial?.operatingMargin ?? null;
  const netMargin = yahooFinancial?.profitMargin ?? null;
  const qEarningsYoY =
    yahooFinancial?.earningsGrowth ??
    computeYoY(effectiveQuarterly, "netIncome");
  const qRevenueYoY =
    yahooFinancial?.revenueGrowth ?? computeYoY(effectiveQuarterly, "revenue");

  const totalAssets = fmpBalance[0]?.totalAssets ?? null;
  const totalDebt =
    yahooFinancial?.totalDebt ?? fmpBalance[0]?.totalDebt ?? null;
  const totalCash =
    yahooFinancial?.totalCash ?? fmpBalance[0]?.cashAndCashEquivalents ?? null;
  const debtToEquity =
    hasValue(fmpBalance[0]?.totalDebt) &&
    hasValue(fmpBalance[0]?.totalStockholdersEquity) &&
    fmpBalance[0].totalStockholdersEquity !== 0
      ? fmpBalance[0].totalDebt / fmpBalance[0].totalStockholdersEquity
      : null;
  const currentRatio = fmpRatios[0]?.currentRatio ?? null;
  const quickRatio = fmpRatios[0]?.quickRatio ?? null;

  const divYield = yahooQuote?.dividendYield ?? null;
  const exDivDate = yahooQuote?.exDividendDate ?? null;
  const pegRatio = yahooQuote?.pegRatio ?? fmpRatios[0]?.pegRatio ?? null;
  const roe =
    yahooFinancial?.returnOnEquity ??
    (fmpRatios[0]?.returnOnEquity != null
      ? fmpRatios[0].returnOnEquity * 100
      : null);
  const roa =
    yahooFinancial?.returnOnAssets ??
    (fmpRatios[0]?.returnOnAssets != null
      ? fmpRatios[0].returnOnAssets * 100
      : null);
  const piotroskiScore = fmpScores?.piotroskiScore ?? null;

  const fiftyTwoWeekHigh = yahooQuote?.fiftyTwoWeekHigh ?? null;
  const fiftyTwoWeekLow = yahooQuote?.fiftyTwoWeekLow ?? null;
  const avgVolume = yahooQuote?.avgVolume ?? null;
  const beta = yahooQuote?.beta ?? null;

  const quickStats = [
    {
      label: "Valuation",
      value: hasValue(marketCap) ? formatLargeNumber(marketCap) : "—",
      details: [
        {
          label: "Market Cap",
          value: hasValue(marketCap) ? formatLargeNumber(marketCap) : "—",
        },
        {
          label: "P/E (TTM / NTM)",
          value: `${hasValue(peTtm) ? peTtm.toFixed(2) : "—"} | ${hasValue(peNtm) ? peNtm.toFixed(2) : "—"}`,
        },
        {
          label: "Price to Sales",
          value: hasValue(priceToSales) ? priceToSales.toFixed(2) : "—",
        },
        {
          label: "EV to EBITDA",
          value: hasValue(evToEbitda) ? evToEbitda.toFixed(2) : "—",
        },
        {
          label: "Price to Book",
          value: hasValue(priceToBook) ? priceToBook.toFixed(2) : "—",
        },
      ],
    },
    {
      label: "Cash Flow",
      value: hasValue(fcf) ? formatLargeNumber(fcf) : "—",
      details: [
        {
          label: "Operating Cash Flow (TTM)",
          value: hasValue(operatingCashFlow)
            ? formatLargeNumber(operatingCashFlow)
            : "—",
        },
        {
          label: "FCF (Free Cash Flow TTM)",
          value: hasValue(fcf) ? formatLargeNumber(fcf) : "—",
        },
        {
          label: "FCF Yield",
          value: hasValue(fcfYield) ? `${fcfYield.toFixed(2)}%` : "—",
        },
        {
          label: "Dividend/Price",
          value: hasValue(divYield) ? `${divYield.toFixed(2)}%` : "—",
        },
        {
          label: "Cash Amount",
          value: hasValue(totalCash) ? formatLargeNumber(totalCash) : "—",
        },
      ],
    },
    {
      label: "Margins & Growth",
      value: hasValue(grossMargin) ? `${grossMargin.toFixed(1)}%` : "—",
      details: [
        {
          label: "Gross Margin (TTM)",
          value: hasValue(grossMargin) ? `${grossMargin.toFixed(2)}%` : "—",
        },
        {
          label: "Operating Margin",
          value: hasValue(operatingMargin)
            ? `${operatingMargin.toFixed(2)}%`
            : "—",
        },
        {
          label: "Net Margin",
          value: hasValue(netMargin) ? `${netMargin.toFixed(2)}%` : "—",
        },
        {
          label: "Quarterly Earnings (YoY)",
          value: hasValue(qEarningsYoY) ? `${qEarningsYoY.toFixed(2)}%` : "—",
        },
        {
          label: "Quarterly Revenue (YoY)",
          value: hasValue(qRevenueYoY) ? `${qRevenueYoY.toFixed(2)}%` : "—",
        },
      ],
    },
    {
      label: "Balance",
      value: hasValue(totalAssets) ? formatLargeNumber(totalAssets) : "—",
      details: [
        {
          label: "Total Assets",
          value: hasValue(totalAssets) ? formatLargeNumber(totalAssets) : "—",
        },
        {
          label: "Total Debt",
          value: hasValue(totalDebt) ? formatLargeNumber(totalDebt) : "—",
        },
        {
          label: "Debt to Equity",
          value: hasValue(debtToEquity) ? `${debtToEquity.toFixed(2)}x` : "—",
        },
        {
          label: "Current Ratio",
          value: hasValue(currentRatio) ? `${currentRatio.toFixed(2)}x` : "—",
        },
        {
          label: "Quick Ratio",
          value: hasValue(quickRatio) ? `${quickRatio.toFixed(2)}x` : "—",
        },
      ],
    },
    {
      label: "Dividend",
      value: hasValue(divYield) ? `${divYield.toFixed(2)}%` : "—",
      details: [
        {
          label: "Dividend Yield",
          value: hasValue(divYield) ? `${divYield.toFixed(2)}%` : "—",
        },
        {
          label: "Payout Ratio",
          value: hasValue(payoutRatio) ? `${payoutRatio.toFixed(2)}%` : "—",
        },
        { label: "Next Ex-Date", value: exDivDate || "—" },
      ],
    },
    {
      label: "Trading",
      value: hasValue(fiftyTwoWeekHigh)
        ? `$${fiftyTwoWeekHigh.toFixed(2)}`
        : "—",
      details: [
        {
          label: "52-Week High",
          value: hasValue(fiftyTwoWeekHigh)
            ? `$${fiftyTwoWeekHigh.toFixed(2)}`
            : "—",
        },
        {
          label: "52-Week Low",
          value: hasValue(fiftyTwoWeekLow)
            ? `$${fiftyTwoWeekLow.toFixed(2)}`
            : "—",
        },
        {
          label: "Average Volume",
          value: hasValue(avgVolume)
            ? formatLargeNumber(avgVolume, { omit$: true })
            : "—",
        },
        { label: "Beta", value: hasValue(beta) ? beta.toFixed(2) : "—" },
      ],
    },
  ];

  // ── Build Financial Metrics (chart data matching mock structure) ──
  // FMP returns raw dollar amounts; convert to billions for chart display
  const buildMetric = (
    name: string,
    type: "bar" | "line" | "area",
    color: string,
    unit: string,
    dataKey: string,
    sourceData: any[],
    divisor: number = 1,
  ) => {
    const data = sourceData.map((d) => ({
      date: d.period || d.date,
      value: d[dataKey] != null ? d[dataKey] / divisor : 0,
    }));
    return {
      name,
      type,
      color,
      unit,
      data,
      yoy: computeYoY(sourceData, dataKey),
      cagr3Y: computeCAGR(sourceData, dataKey, 3),
      cagr5Y: computeCAGR(sourceData, dataKey, 5),
    };
  };

  const financialMetrics = [
    buildMetric(
      "Revenue",
      "bar",
      "chart-green",
      "B",
      "revenue",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "EBITDA",
      "bar",
      "chart-orange",
      "B",
      "ebitda",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Gross Profit",
      "line",
      "chart-blue",
      "B",
      "grossProfit",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Operating Income",
      "bar",
      "chart-orange",
      "B",
      "operatingIncome",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Net Income",
      "bar",
      "chart-orange",
      "B",
      "netIncome",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Cash & Equivalents",
      "bar",
      "chart-orange",
      "B",
      "cash",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Free Cash Flow",
      "line",
      "chart-cyan",
      "B",
      "fcf",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Shareholders Equity",
      "line",
      "chart-purple",
      "B",
      "stockholdersEquity",
      chartDataAnnual,
      1e9,
    ),
    buildMetric(
      "Total Assets",
      "line",
      "chart-blue",
      "B",
      "totalAssets",
      chartDataAnnual,
      1e9,
    ),
    buildMetric("EPS", "line", "chart-pink", "$", "eps", chartDataAnnual, 1),
  ].filter((m) => m.data.some((d) => d.value !== 0));

  return {
    symbol,
    name: yahooQuote?.name || fmpProfile?.companyName || null,
    exchange: yahooQuote?.exchange || fmpProfile?.exchange || null,

    quote: {
      price: yahooQuote?.price ?? null,
      change: yahooQuote?.change ?? null,
      changePercent: yahooQuote?.changePercent ?? null,
      afterHoursPrice: yahooQuote?.afterHoursPrice ?? null,
      afterHoursChange: yahooQuote?.afterHoursChange ?? null,
      afterHoursChangePercent: yahooQuote?.afterHoursChangePercent ?? null,
    },

    profile: {
      sector: yahooProfile?.sector || fmpProfile?.sector || null,
      industry: yahooProfile?.industry || fmpProfile?.industry || null,
      website: yahooProfile?.website || null,
      employees:
        yahooProfile?.employees || fmpProfile?.fullTimeEmployees || null,
      description: yahooProfile?.description || fmpProfile?.description || null,
      ceo: yahooProfile?.ceo || fmpProfile?.ceo || null,
      country: yahooProfile?.country || null,
    },

    priceChange: fmpPriceChange
      ? {
          ytd: fmpPriceChange.ytd ?? null,
          "1Y": fmpPriceChange["1Y"] ?? null,
          "3Y": fmpPriceChange["3Y"] ?? null,
        }
      : null,

    quickStats,
    financialMetrics,
    priceHistory: yahooPriceHistory,
    analystEstimates: yahooEstimates,
    insiderTrades: fmpInsiderTrades.slice(0, 20),
    earnings: fmpEarnings.slice(0, 8),

    ratios: {
      peTtm,
      peNtm,
      pegRatio,
      priceToBook,
      priceToSales,
      evToEbitda,
      roe,
      roa,
      profitMargin: netMargin,
      operatingMargin,
      grossMargin,
      piotroskiScore,
      fcfYield,
      dividendYield: divYield,
      payoutRatio,
      beta,
    },

    sectorPE: {}, // Fetched separately via /api/insights/sector-pe to avoid per-ticker waste
    news: finnhubNews,
  };
}
