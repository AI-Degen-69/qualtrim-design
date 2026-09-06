import type {
  CompanyProfile,
  FinancialStatements,
  StockMetrics,
  StockQuote,
  YahooFallbackFinancials,
} from "@shared/api";
import { finite, formatMoney } from "./format";
import { cagrAtYearsBack, detectPeriodGranularity } from "./finance";

export interface SpotlightMetricsResult {
  marketCap: string;
  marketCapRaw: number | null;
  pe: string;
  peRaw: number | null;
  cagr3Y: string;
  cagr3YRaw: number | null;
  revenue: string;
  revenueRaw: number | null;
  fcf: string;
  fcfRaw: number | null;
  grossMargin: string;
  grossMarginRaw: number | null;
}

/**
 * Derives the six spotlight fundamental metrics for a given stock,
 * matching the Home page Observatory aesthetic with resilient fallbacks.
 */
export function deriveSpotlightMetrics(params: {
  quote?: StockQuote | null;
  profile?: CompanyProfile | null;
  metrics?: StockMetrics | null;
  annualFinancials?: FinancialStatements | null;
  quarterlyFinancials?: FinancialStatements | null;
  fallback?: YahooFallbackFinancials | null;
}): SpotlightMetricsResult {
  const {
    quote,
    profile,
    metrics,
    annualFinancials,
    quarterlyFinancials,
    fallback,
  } = params;

  // 1. Market Cap
  const mktCapVal = finite(quote?.marketCap) ?? finite(profile?.marketCap);
  const marketCap = mktCapVal !== null ? (formatMoney(mktCapVal) ?? "—") : "—";

  // 2. P/E Ratio
  const peVal = finite(
    quote?.pe ??
      metrics?.ratios?.priceEarningsRatioTTM ??
      metrics?.metrics?.peRatioTTM ??
      profile?.peRatio,
  );
  const pe = peVal !== null && peVal > 0 ? `${peVal.toFixed(1)}x` : "—";

  // 3. 3Y Rev CAGR
  const inc =
    annualFinancials?.income && annualFinancials.income.length > 0
      ? annualFinancials.income
      : (quarterlyFinancials?.income ?? []);
  const incAsc = [...inc].sort((a, b) => (a.date < b.date ? -1 : 1));
  const granularity = detectPeriodGranularity(incAsc);
  const cagrVal =
    incAsc.length > 0
      ? cagrAtYearsBack(incAsc, "revenue", 3, granularity)
      : null;
  const cagr3Y =
    cagrVal !== null ? `${cagrVal >= 0 ? "+" : ""}${cagrVal.toFixed(1)}%` : "—";

  // 4. Revenue (TTM / Latest FY)
  const latestInc = incAsc.length > 0 ? incAsc[incAsc.length - 1] : null;
  const revVal = finite(latestInc?.revenue) ?? finite(fallback?.revenue);
  const revenue = revVal !== null ? (formatMoney(revVal) ?? "—") : "—";

  // 5. Free Cash Flow
  const cash =
    annualFinancials?.cash && annualFinancials.cash.length > 0
      ? annualFinancials.cash
      : (quarterlyFinancials?.cash ?? []);
  const cashAsc = [...cash].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latestCash = cashAsc.length > 0 ? cashAsc[cashAsc.length - 1] : null;
  const fcfVal =
    finite(latestCash?.freeCashFlow) ??
    (finite(latestCash?.operatingCashFlow) !== null &&
    finite(latestCash?.capitalExpenditure) !== null
      ? latestCash!.capitalExpenditure! < 0
        ? latestCash!.operatingCashFlow + latestCash!.capitalExpenditure!
        : latestCash!.operatingCashFlow - latestCash!.capitalExpenditure!
      : null);
  const fcf = fcfVal !== null ? (formatMoney(fcfVal) ?? "—") : "—";

  // 6. Gross Margin
  const gmRatio = metrics?.ratios?.grossProfitMarginTTM;
  const gmCalc =
    latestInc?.revenue && latestInc?.grossProfit
      ? (latestInc.grossProfit / latestInc.revenue) * 100
      : null;
  const gmVal =
    finite(gmRatio) ?? finite(gmCalc) ?? finite(fallback?.grossMargin);
  const grossMargin =
    gmVal !== null && Number.isFinite(gmVal) ? `${gmVal.toFixed(1)}%` : "—";

  return {
    marketCap,
    marketCapRaw: mktCapVal,
    pe,
    peRaw: peVal,
    cagr3Y,
    cagr3YRaw: cagrVal,
    revenue,
    revenueRaw: revVal,
    fcf,
    fcfRaw: fcfVal,
    grossMargin,
    grossMarginRaw: gmVal,
  };
}
