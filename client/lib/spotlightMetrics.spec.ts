import { describe, it, expect } from "vitest";
import { deriveSpotlightMetrics } from "./spotlightMetrics";
import type {
  FinancialStatements,
  StockMetrics,
  StockQuote,
  CompanyProfile,
  YahooFallbackFinancials,
} from "@shared/api";

describe("deriveSpotlightMetrics", () => {
  it("derives all 6 metrics when full statement and quote data are present", () => {
    const quote: Partial<StockQuote> = {
      symbol: "AAPL",
      price: 231.42,
      changesPercentage: 1.48,
      marketCap: 3.52e12,
      pe: 34.2,
    };
    const profile: Partial<CompanyProfile> = {
      companyName: "Apple Inc.",
      sector: "Technology",
      exchange: "NASDAQ",
    };
    const annualFinancials: FinancialStatements = {
      income: [
        {
          date: "2021-09-30",
          calendarYear: "2021",
          period: "FY",
          revenue: 365.8e9,
          grossProfit: 152.8e9,
          ebitda: 120.2e9,
          netIncome: 94.6e9,
          eps: 5.61,
          symbol: "AAPL",
          reportedCurrency: "USD",
        },
        {
          date: "2022-09-30",
          calendarYear: "2022",
          period: "FY",
          revenue: 394.3e9,
          grossProfit: 170.7e9,
          ebitda: 130.5e9,
          netIncome: 99.8e9,
          eps: 6.11,
          symbol: "AAPL",
          reportedCurrency: "USD",
        },
        {
          date: "2023-09-30",
          calendarYear: "2023",
          period: "FY",
          revenue: 383.3e9,
          grossProfit: 169.1e9,
          ebitda: 125.8e9,
          netIncome: 96.9e9,
          eps: 6.13,
          symbol: "AAPL",
          reportedCurrency: "USD",
        },
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "FY",
          revenue: 391.0e9,
          grossProfit: 180.7e9,
          ebitda: 133.1e9,
          netIncome: 101.5e9,
          eps: 6.58,
          symbol: "AAPL",
          reportedCurrency: "USD",
        },
      ],
      balance: [],
      cash: [
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "FY",
          operatingCashFlow: 118.2e9,
          freeCashFlow: 108.8e9,
          symbol: "AAPL",
          reportedCurrency: "USD",
        },
      ],
    };
    const metrics: Partial<StockMetrics> = {
      ratios: {
        grossProfitMarginTTM: 45.9,
      },
    };

    const result = deriveSpotlightMetrics({
      quote: quote as StockQuote,
      profile: profile as CompanyProfile,
      metrics: metrics as StockMetrics,
      annualFinancials,
    });

    expect(result.marketCap).toBe("$3.52T");
    expect(result.pe).toBe("34.2x");
    expect(result.cagr3Y).toBe("+2.2%");
    expect(result.revenue).toBe("$391.00B");
    expect(result.fcf).toBe("$108.80B");
    expect(result.grossMargin).toBe("45.9%");
  });

  it("handles negative / unprofitable P/E gracefully as em-dash", () => {
    const quote: Partial<StockQuote> = {
      symbol: "TEST",
      marketCap: 500e6,
      pe: -12.5,
    };
    const result = deriveSpotlightMetrics({
      quote: quote as StockQuote,
    });
    expect(result.pe).toBe("—");
  });

  it("calculates gross margin from income statement when ratios are missing", () => {
    const annualFinancials: FinancialStatements = {
      income: [
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "FY",
          revenue: 100e9,
          grossProfit: 45e9,
          ebitda: 30e9,
          netIncome: 20e9,
          eps: 2.0,
          symbol: "TEST",
          reportedCurrency: "USD",
        },
      ],
      balance: [],
      cash: [],
    };
    const result = deriveSpotlightMetrics({
      annualFinancials,
    });
    expect(result.grossMargin).toBe("45.0%");
  });

  it("falls back to Yahoo single-point snapshot when primary statements are missing", () => {
    const fallback: Partial<YahooFallbackFinancials> = {
      revenue: 50e9,
      grossMargin: 38.5,
    };
    const result = deriveSpotlightMetrics({
      fallback: fallback as YahooFallbackFinancials,
    });
    expect(result.revenue).toBe("$50.00B");
    expect(result.grossMargin).toBe("38.5%");
  });

  it("calculates FCF from operatingCashFlow and negative capitalExpenditure outflow when freeCashFlow is missing", () => {
    const annualFinancials: FinancialStatements = {
      income: [],
      balance: [],
      cash: [
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "FY",
          operatingCashFlow: 100e9,
          capitalExpenditure: -20e9,
          symbol: "TEST",
          reportedCurrency: "USD",
        },
      ],
    };
    const result = deriveSpotlightMetrics({
      annualFinancials,
    });
    expect(result.fcf).toBe("$80.00B");
  });

  it("uses quarterlyFinancials when annualFinancials is omitted", () => {
    const quarterlyFinancials: FinancialStatements = {
      income: [
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "Q3",
          revenue: 25e9,
          grossProfit: 10e9,
          ebitda: 8e9,
          netIncome: 5e9,
          eps: 1.0,
          symbol: "TEST",
          reportedCurrency: "USD",
        },
      ],
      balance: [],
      cash: [
        {
          date: "2024-09-30",
          calendarYear: "2024",
          period: "Q3",
          freeCashFlow: 6e9,
          symbol: "TEST",
          reportedCurrency: "USD",
        },
      ],
    };
    const result = deriveSpotlightMetrics({
      quarterlyFinancials,
    });
    expect(result.revenue).toBe("$25.00B");
    expect(result.fcf).toBe("$6.00B");
    expect(result.grossMargin).toBe("40.0%");
  });
});
