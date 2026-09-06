import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateStockData } from "./stockAggregator";

/**
 * G1 integration shaping spec for Candidate 6 (zero-value semantics).
 *
 * aggregateStockData is network-bound (Yahoo/FMP/Finnhub), so the three
 * provider modules are mocked at the module boundary. These tests pin what
 * quickStats renders when a provider returns a literal 0:
 *
 *   - 0 is REAL data (breakeven FCF, debt-free balance sheet) and must
 *     render as "$0" / "0.00%" — not the missing-data em-dash.
 *   - null / undefined still mean "no data" and render "—".
 *   - non-finite values must never leak as "NaN" through toFixed paths.
 *
 * Previously the truthiness guards (x ? … : "—") collapsed 0 into the
 * missing-data branch, so a breakeven company showed "—" everywhere.
 */

const mocks = vi.hoisted(() => ({
  yahooQuote: vi.fn(),
  yahooProfile: vi.fn(),
  yahooFinancial: vi.fn(),
  yahooPriceHistory: vi.fn(),
  yahooEstimates: vi.fn(),
  news: vi.fn(),
  income: vi.fn(),
  balance: vi.fn(),
  cashFlow: vi.fn(),
  metrics: vi.fn(),
  metricsTTM: vi.fn(),
  ratios: vi.fn(),
  ratiosTTM: vi.fn(),
  scores: vi.fn(),
  priceChange: vi.fn(),
  profile: vi.fn(),
  earnings: vi.fn(),
  insiderTrades: vi.fn(),
}));

vi.mock("./yahooFinance", () => ({
  fetchYahooQuote: mocks.yahooQuote,
  fetchYahooProfile: mocks.yahooProfile,
  fetchYahooFinancialData: mocks.yahooFinancial,
  fetchYahooPriceHistory: mocks.yahooPriceHistory,
  fetchYahooAnalystEstimates: mocks.yahooEstimates,
}));

vi.mock("./fmp", () => ({
  getIncomeStatements: mocks.income,
  getBalanceSheets: mocks.balance,
  getCashFlowStatements: mocks.cashFlow,
  getKeyMetrics: mocks.metrics,
  getKeyMetricsTTM: mocks.metricsTTM,
  getRatios: mocks.ratios,
  getRatiosTTM: mocks.ratiosTTM,
  getFinancialScores: mocks.scores,
  getPriceChange: mocks.priceChange,
  getCompanyProfile: mocks.profile,
  getEarnings: mocks.earnings,
  getInsiderTrades: mocks.insiderTrades,
}));

vi.mock("./finnhub", () => ({
  fetchCompanyNews: mocks.news,
}));

type QuickStatBlock = {
  label: string;
  value: string;
  details: { label: string; value: string }[];
};

function block(stats: QuickStatBlock[], label: string): QuickStatBlock {
  const found = stats.find((s) => s.label === label);
  if (!found) throw new Error(`quickStats block not found: ${label}`);
  return found;
}

function detail(
  b: { details: { label: string; value: string }[] },
  label: string,
) {
  return b.details.find((d) => d.label === label)?.value;
}

beforeEach(() => {
  mocks.yahooQuote.mockResolvedValue({
    name: "Test Corp",
    exchange: "NYSE",
    price: 100,
    change: 0,
    changePercent: 0,
    marketCap: 1e9,
  });
  mocks.yahooProfile.mockResolvedValue({});
  mocks.yahooFinancial.mockResolvedValue({});
  mocks.yahooPriceHistory.mockResolvedValue(null);
  mocks.yahooEstimates.mockResolvedValue(null);
  mocks.news.mockResolvedValue([]);
  mocks.income.mockResolvedValue([]);
  mocks.balance.mockResolvedValue([]);
  mocks.cashFlow.mockResolvedValue([]);
  mocks.metrics.mockResolvedValue([]);
  mocks.metricsTTM.mockResolvedValue({});
  mocks.ratios.mockResolvedValue([]);
  mocks.ratiosTTM.mockResolvedValue({});
  mocks.scores.mockResolvedValue({});
  mocks.priceChange.mockResolvedValue(null);
  mocks.profile.mockResolvedValue(null);
  mocks.earnings.mockResolvedValue([]);
  mocks.insiderTrades.mockResolvedValue([]);
});

describe("aggregateStockData quickStats — zero-value semantics (C6)", () => {
  it("renders a zero market cap as $0, not the missing-data em-dash", async () => {
    mocks.yahooQuote.mockResolvedValue({ name: "Shell Co", marketCap: 0 });

    const res = await aggregateStockData("TEST");
    const valuation = block(res.quickStats, "Valuation");

    expect(valuation.value).toBe("$0");
    expect(detail(valuation, "Market Cap")).toBe("$0");
  });

  it("renders breakeven free cash flow as $0 and its yield as 0.00%", async () => {
    mocks.yahooFinancial.mockResolvedValue({
      freeCashFlow: 0,
      operatingCashFlow: 0,
    });

    const res = await aggregateStockData("TEST");
    const cashFlow = block(res.quickStats, "Cash Flow");

    expect(cashFlow.value).toBe("$0");
    expect(detail(cashFlow, "FCF (Free Cash Flow TTM)")).toBe("$0");
    expect(detail(cashFlow, "FCF Yield")).toBe("0.00%");
  });

  it("renders a debt-free balance sheet as $0 total debt with a 0.00x ratio", async () => {
    mocks.balance.mockResolvedValue([
      { totalAssets: 0, totalDebt: 0, totalStockholdersEquity: 2e8 },
    ]);

    const res = await aggregateStockData("TEST");
    const balance = block(res.quickStats, "Balance");

    expect(balance.value).toBe("$0");
    expect(detail(balance, "Total Debt")).toBe("$0");
    expect(detail(balance, "Debt to Equity")).toBe("0.00x");
  });

  it("renders zero margins and growth as percentages, not em-dashes", async () => {
    mocks.yahooFinancial.mockResolvedValue({
      grossMargin: 0,
      operatingMargin: 0,
      profitMargin: 0,
      earningsGrowth: 0,
      revenueGrowth: 0,
    });

    const res = await aggregateStockData("TEST");
    const margins = block(res.quickStats, "Margins & Growth");

    expect(margins.value).toBe("0.0%");
    expect(detail(margins, "Net Margin")).toBe("0.00%");
    expect(detail(margins, "Quarterly Earnings (YoY)")).toBe("0.00%");
  });

  it("still renders an em-dash when the provider returns null (no data)", async () => {
    mocks.yahooQuote.mockResolvedValue({ name: "No Cap", marketCap: null });

    const res = await aggregateStockData("TEST");
    const valuation = block(res.quickStats, "Valuation");

    expect(valuation.value).toBe("—");
    expect(detail(valuation, "Market Cap")).toBe("—");
  });

  it("never leaks NaN through a toFixed percentage path", async () => {
    mocks.yahooFinancial.mockResolvedValue({ grossMargin: Number.NaN });

    const res = await aggregateStockData("TEST");
    const margins = block(res.quickStats, "Margins & Growth");

    expect(margins.value).toBe("—");
  });

  it("renders an em-dash when a zero numerator meets a non-finite denominator", async () => {
    // 0 / Infinity evaluates to 0, which must NOT render as a real 0.00%
    // when the denominator itself is non-finite garbage (CodeRabbit, PR #56).
    mocks.yahooQuote.mockResolvedValue({
      name: "Inf Cap",
      marketCap: Number.POSITIVE_INFINITY,
    });
    mocks.yahooFinancial.mockResolvedValue({ freeCashFlow: 0 });

    const res = await aggregateStockData("TEST");
    const cashFlow = block(res.quickStats, "Cash Flow");

    expect(cashFlow.value).toBe("$0");
    expect(detail(cashFlow, "FCF Yield")).toBe("—");
  });

  it("renders an em-dash when equity is non-finite despite a zero debt", async () => {
    mocks.balance.mockResolvedValue([
      {
        totalAssets: 0,
        totalDebt: 0,
        totalStockholdersEquity: Number.POSITIVE_INFINITY,
      },
    ]);

    const res = await aggregateStockData("TEST");
    const balance = block(res.quickStats, "Balance");

    expect(balance.value).toBe("$0");
    expect(detail(balance, "Total Debt")).toBe("$0");
    expect(detail(balance, "Debt to Equity")).toBe("—");
  });

  it("keeps the sign before the currency symbol for negative cash flow", async () => {
    mocks.yahooFinancial.mockResolvedValue({
      freeCashFlow: -4_800_000,
      operatingCashFlow: -3_000_000,
    });

    const res = await aggregateStockData("TEST");
    const cashFlow = block(res.quickStats, "Cash Flow");

    expect(cashFlow.value).toBe("-$4.80M");
    expect(detail(cashFlow, "FCF (Free Cash Flow TTM)")).toBe("-$4.80M");
  });
});
