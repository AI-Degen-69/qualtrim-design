import YahooFinance from "yahoo-finance2";
import NodeCache from "node-cache";
import type { FinancialStatements } from "@shared/api";

// Cache sector data for 15 minutes — sector/industry rarely changes
const sectorCache = new NodeCache({ stdTTL: 900, checkperiod: 300 });

// Suppress Yahoo survey notices
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Fetch a real-time quote for a single ticker via Yahoo Finance.
 * Returns price, change, changePercent, marketCap, exchange, name.
 */
export async function fetchYahooQuote(ticker: string) {
  try {
    const result = await yf.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics"],
    });
    const price = result.price as any;
    const sd = result.summaryDetail as any;
    const dks = result.defaultKeyStatistics as any;

    return {
      price: price?.regularMarketPrice ?? null,
      change: price?.regularMarketChange ?? null,
      changePercent: price?.regularMarketChangePercent
        ? price.regularMarketChangePercent * 100
        : null,
      afterHoursPrice: price?.postMarketPrice ?? null,
      afterHoursChange: price?.postMarketChange ?? null,
      afterHoursChangePercent: price?.postMarketChangePercent
        ? price.postMarketChangePercent * 100
        : null,
      marketCap: price?.marketCap ?? null,
      exchange: price?.exchangeName ?? null,
      name: price?.longName ?? price?.shortName ?? null,
      trailingPE: sd?.trailingPE ?? null,
      forwardPE: sd?.forwardPE ?? null,
      pegRatio: dks?.pegRatio ?? null,
      priceToBook: dks?.priceToBook ?? null,
      enterpriseToEbitda: dks?.enterpriseToEbitda ?? null,
      beta: dks?.beta ?? null,
      dividendYield: sd?.dividendYield ? sd.dividendYield * 100 : null,
      payoutRatio: sd?.payoutRatio ? sd.payoutRatio * 100 : null,
      exDividendDate: sd?.exDividendDate
        ? new Date(sd.exDividendDate * 1000).toLocaleDateString()
        : null,
      fiftyTwoWeekHigh: sd?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: sd?.fiftyTwoWeekLow ?? null,
      avgVolume: sd?.averageVolume ?? null,
    };
  } catch (e) {
    console.error(`[YahooFinance] Quote error for ${ticker}:`, e);
    return null;
  }
}

/**
 * Fetch company profile info via Yahoo Finance.
 */
export async function fetchYahooProfile(ticker: string) {
  try {
    const result = await yf.quoteSummary(ticker, {
      modules: ["assetProfile", "summaryProfile"],
    });
    const profile = (result.assetProfile || result.summaryProfile || {}) as any;
    return {
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
      website: profile.website ?? null,
      employees: profile.fullTimeEmployees ?? null,
      description: profile.longBusinessSummary ?? null,
      ceo: profile.companyOfficers?.[0]?.name ?? null,
      address: profile.address1 ?? null,
      city: profile.city ?? null,
      state: profile.state ?? null,
      country: profile.country ?? null,
      phone: profile.phone ?? null,
    };
  } catch (e) {
    console.error(`[YahooFinance] Profile error for ${ticker}:`, e);
    return null;
  }
}

/**
 * Fetch historical daily price data via Yahoo Finance.
 * Returns array of { date, open, high, low, close, volume }.
 */
export async function fetchYahooPriceHistory(
  ticker: string,
  years: number = 1,
): Promise<
  Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>
> {
  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - years);
    const chart = await yf.chart(ticker, {
      period1: period1.toISOString().slice(0, 10),
      interval: "1d",
    });
    const quotes = Array.isArray(chart.quotes) ? chart.quotes : [];
    return quotes
      .filter((q: any) => q?.date)
      .map((q: any) => ({
        date: new Date(q.date).toISOString().slice(0, 10),
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close ?? null,
        volume: q.volume ?? null,
      }))
      .filter((q) => q.close !== null)
      .reverse();
  } catch (e) {
    console.error(`[YahooFinance] Price history error for ${ticker}:`, e);
    return [];
  }
}

/**
 * Fetch chart price history with flexible period and interval.
 * Supports intraday (5m, 15m, 30m) and daily/weekly intervals.
 * Period maps:
 *   "1d"  → 1 day, interval "5m"
 *   "5d"  → 5 days, interval "15m"
 *   "1mo" → 1 month, interval "1d"
 *   "3mo" → 3 months, interval "1d"
 *   "1y"  → 1 year, interval "1d"
 *   "5y"  → 5 years, interval "1wk"
 */
export async function fetchChartHistory(
  ticker: string,
  period: "1d" | "5d" | "1mo" | "3mo" | "1y" | "5y",
): Promise<
  Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>
> {
  try {
    const now = new Date();
    let period1: Date;
    let interval: string;

    switch (period) {
      case "1d":
        period1 = new Date(now);
        period1.setDate(period1.getDate() - 1);
        interval = "5m";
        break;
      case "5d":
        period1 = new Date(now);
        period1.setDate(period1.getDate() - 6);
        interval = "15m";
        break;
      case "1mo":
        period1 = new Date(now);
        period1.setMonth(period1.getMonth() - 1);
        interval = "1d";
        break;
      case "3mo":
        period1 = new Date(now);
        period1.setMonth(period1.getMonth() - 3);
        interval = "1d";
        break;
      case "1y":
        period1 = new Date(now);
        period1.setFullYear(period1.getFullYear() - 1);
        interval = "1d";
        break;
      case "5y":
        period1 = new Date(now);
        period1.setFullYear(period1.getFullYear() - 5);
        interval = "1wk";
        break;
      default:
        period1 = new Date(now);
        period1.setFullYear(period1.getFullYear() - 1);
        interval = "1d";
    }

    const chart = await yf.chart(ticker, {
      period1: period1.toISOString().slice(0, 10),
      interval: interval as any,
    });
    const quotes = Array.isArray(chart.quotes) ? chart.quotes : [];
    return quotes
      .filter((q: any) => q?.date)
      .map((q: any) => ({
        date: new Date(q.date).toISOString().slice(0, 10),
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close ?? null,
        volume: q.volume ?? null,
      }))
      .filter((q) => q.close !== null)
      .reverse();
  } catch (e) {
    console.error(
      `[YahooFinance] Chart history error for ${ticker} (${period}):`,
      e,
    );
    // Fallback: try daily data
    if (period === "1d" || period === "5d") {
      const days = period === "1d" ? 1 : 6;
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - days);
      try {
        const chart = await yf.chart(ticker, {
          period1: fallback.toISOString().slice(0, 10),
          interval: "1d",
        });
        const quotes = Array.isArray(chart.quotes) ? chart.quotes : [];
        return quotes
          .filter((q: any) => q?.date)
          .map((q: any) => ({
            date: new Date(q.date).toISOString().slice(0, 10),
            open: q.open ?? null,
            high: q.high ?? null,
            low: q.low ?? null,
            close: q.close ?? null,
            volume: q.volume ?? null,
          }))
          .filter((q) => q.close !== null)
          .reverse();
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Fetch analyst earnings estimates via Yahoo Finance.
 */
export async function fetchYahooAnalystEstimates(ticker: string) {
  try {
    const result = await yf.quoteSummary(ticker, {
      modules: ["earningsTrend"],
    });
    const trend = (result as any).earningsTrend?.trend || [];
    return trend.map((t: any) => ({
      date: t.period,
      estimatedEpsAvg: t.earningsEstimate?.avg ?? null,
      estimatedRevenueAvg: t.revenueEstimate?.avg ?? null,
      earningsGrowth: t.growth ?? null,
    }));
  } catch (e) {
    console.error(`[YahooFinance] Analyst estimates error for ${ticker}:`, e);
    return [];
  }
}

/**
 * Fetch financial data (margins, cash flow, balance sheet) via Yahoo Finance.
 */
export async function fetchYahooFinancialData(ticker: string) {
  try {
    const result = await yf.quoteSummary(ticker, {
      modules: ["financialData", "defaultKeyStatistics", "earningsTrend"],
    });
    const fd = (result.financialData || {}) as any;
    const dks = (result.defaultKeyStatistics || {}) as any;
    const trends = (result as any).earningsTrend?.trend || [];

    const nextYearTrend = trends.find((t: any) => t.period === "+1y");
    const nextYearEps = nextYearTrend?.earningsEstimate?.avg;
    const ltgTrend = trends.find((t: any) => t.period === "+5y");
    const ltgRate =
      typeof ltgTrend?.growth === "number" ? ltgTrend.growth : null;

    return {
      revenue: fd.totalRevenue ?? null,
      ebitda: fd.ebitda ?? null,
      grossProfit: fd.grossProfits ?? null,
      operatingCashFlow: fd.operatingCashflow ?? null,
      freeCashFlow: fd.freeCashflow ?? null,
      profitMargin: fd.profitMargins ? fd.profitMargins * 100 : null,
      operatingMargin: fd.operatingMargins ? fd.operatingMargins * 100 : null,
      grossMargin: fd.grossMargins ? fd.grossMargins * 100 : null,
      returnOnEquity: fd.returnOnEquity ? fd.returnOnEquity * 100 : null,
      returnOnAssets: fd.returnOnAssets ? fd.returnOnAssets * 100 : null,
      totalCash: fd.totalCash ?? null,
      totalDebt: fd.totalDebt ?? null,
      revenuePerShare: fd.revenuePerShare ?? null,
      earningsGrowth: fd.earningsGrowth ? fd.earningsGrowth * 100 : null,
      revenueGrowth: fd.revenueGrowth ? fd.revenueGrowth * 100 : null,
      enterpriseValue: dks.enterpriseValue ?? null,
      trailingEps: dks.trailingEps ?? null,
      forwardEps: dks.forwardEps ?? null,
      sharesOutstanding: dks.sharesOutstanding ?? null,
      floatShares: dks.floatShares ?? null,
      nextYearEps: nextYearEps ?? null,
      longTermGrowthRate: ltgRate,
    };
  } catch (e) {
    console.error(`[YahooFinance] Financial data error for ${ticker}:`, e);
    return null;
  }
}

/**
 * Fetch sector/industry data for a batch of tickers.
 * Yahoo's quote() endpoint doesn't always return sector info,
 * so we use quoteSummary with summaryProfile module.
 * Returns a map of ticker -> { sector, industry }.
 */
export async function fetchYahooBatchSectors(
  tickers: string[],
): Promise<Record<string, { sector: string | null; industry: string | null }>> {
  const cacheKey = `batch-sectors:${tickers.sort().join(",")}`;
  const cached =
    sectorCache.get<
      Record<string, { sector: string | null; industry: string | null }>
    >(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    tickers.map(async (t) => {
      const result = await yf.quoteSummary(t, { modules: ["summaryProfile"] });
      const profile = (result.summaryProfile || {}) as any;
      return {
        sector: profile.sector ?? null,
        industry: profile.industry ?? null,
      };
    }),
  );
  const map: Record<
    string,
    { sector: string | null; industry: string | null }
  > = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.sector) {
      map[tickers[i].toUpperCase()] = r.value;
    }
  });

  if (Object.keys(map).length > 0) {
    sectorCache.set(cacheKey, map);
  }
  return map;
}

/**
 * Fetch a simple batch of quotes for multiple tickers.
 * Uses Yahoo Finance quote endpoint for each ticker.
 */
export async function fetchYahooBatchQuotes(tickers: string[]) {
  const results = await Promise.allSettled(
    tickers.map(async (t) => {
      const quote = await yf.quote(t);
      return {
        ticker: t.toUpperCase(),
        price: quote.regularMarketPrice ?? null,
        change: quote.regularMarketChange ?? null,
        // Yahoo quote() returns regularMarketChangePercent already as a percentage (e.g., 0.94 = 0.94%)
        // Unlike quoteSummary which returns it as a decimal (0.0094)
        changePercent: quote.regularMarketChangePercent ?? null,
        marketCap: quote.marketCap ?? null,
        name: quote.longName ?? quote.shortName ?? null,
        exchange: quote.fullExchangeName ?? quote.exchangeName ?? null,
        sector: (quote as any).sector ?? null,
        industry: (quote as any).industry ?? null,
      };
    }),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          ticker: tickers[i].toUpperCase(),
          price: null,
          change: null,
          changePercent: null,
          marketCap: null,
          name: null,
          exchange: null,
          sector: null,
          industry: null,
        },
  );
}
