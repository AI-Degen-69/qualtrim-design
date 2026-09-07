import { describe, expect, it } from "vitest";
import {
  COMPARE_METRICS,
  formatCompareChange,
  formatCompareValue,
  metricsByGroup,
  type CompareInputs,
} from "./compareMetrics";

function metric(id: string) {
  const m = COMPARE_METRICS.find((m) => m.id === id);
  if (!m) throw new Error(`unknown metric ${id}`);
  return m;
}

/** Synthetic AAPL-like payloads. Statement rows may be given in ANY order —
 * the vocabulary sorts newest-first defensively. */
function fixture(): CompareInputs {
  return {
    statements: {
      income: [
        {
          date: "2024-09-28",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2024",
          period: "FY",
          revenue: 400e9,
          grossProfit: 170e9,
          ebitda: 130e9,
          operatingIncome: 120e9,
          netIncome: 100e9,
          eps: 6.5,
        },
        {
          date: "2023-09-30",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2023",
          period: "FY",
          revenue: 350e9,
          grossProfit: 150e9,
          ebitda: 115e9,
          operatingIncome: 110e9,
          netIncome: 95e9,
          eps: 6.0,
        },
      ],
      balance: [
        {
          date: "2024-09-28",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2024",
          period: "FY",
          totalAssets: 350e9,
          totalLiabilities: 288e9,
          totalEquity: 62e9,
          totalDebt: 100e9,
          cashAndCashEquivalents: 30e9,
          netDebt: 70e9,
        },
      ],
      cash: [
        {
          date: "2024-09-28",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2024",
          period: "FY",
          operatingCashFlow: 110e9,
          capitalExpenditure: -11e9,
          freeCashFlow: 100e9,
        },
        {
          date: "2023-09-30",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2023",
          period: "FY",
          operatingCashFlow: 100e9,
          capitalExpenditure: -11e9,
          freeCashFlow: 89e9,
        },
      ],
    },
    metrics: {
      metrics: {
        peRatioTTM: 28,
        priceToSalesRatioTTM: 7.5,
        priceToBookRatioTTM: 45,
        evToEBITDATTM: 22,
        evToSalesTTM: 8,
        dividendYieldTTM: 0.5,
        freeCashFlowYieldTTM: 2.1,
        returnOnEquityTTM: 160,
        returnOnAssetsTTM: 28,
        roicTTM: 55,
      },
      ratios: {
        netProfitMargin: 25,
        currentRatio: 1.1,
        quickRatio: 0.9,
        priceEarningsRatioTTM: 27,
      },
      scores: null,
    },
    quote: {
      symbol: "AAPL",
      price: 233.1,
      change: 2.7,
      changesPercentage: 1.17,
      marketCap: 3.4e12,
    },
  };
}

describe("compareMetrics vocabulary", () => {
  it("covers at least 20 metrics across all five groups", () => {
    expect(COMPARE_METRICS.length).toBeGreaterThanOrEqual(20);
    for (const group of [
      "revenue",
      "balance",
      "cashflow",
      "valuation",
      "market",
    ] as const) {
      expect(metricsByGroup(group).length).toBeGreaterThan(0);
    }
  });

  it("reads the latest FY row regardless of payload order", () => {
    const inputs = fixture();
    expect(metric("revenue").value(inputs)).toBeCloseTo(400, 5);
    expect(metric("eps").value(inputs)).toBeCloseTo(6.5, 5);
  });

  it("computes YoY growth deltas for income flows", () => {
    const inputs = fixture();
    expect(metric("revenue").change(inputs)).toBeCloseTo(14.2857, 2);
    expect(metric("eps").change(inputs)).toBeCloseTo(8.3333, 2);
  });

  it("computes YoY growth deltas for cash-flow flows", () => {
    const inputs = fixture();
    expect(metric("freeCashFlow").change(inputs)).toBeCloseTo(12.3595, 2);
  });

  it("derives margins in percent and reports pp deltas", () => {
    const inputs = fixture();
    expect(metric("grossMargin").value(inputs)).toBeCloseTo(42.5, 5);
    // 42.5 - (150/350*100 = 42.8571) ≈ -0.3571
    expect(metric("grossMargin").change(inputs)).toBeCloseTo(-0.3571, 2);
    expect(metric("netMargin").value(inputs)).toBeCloseTo(25, 5);
  });

  it("guards zero/absent revenue in margin derivations", () => {
    const inputs = fixture();
    inputs.statements = {
      income: [
        {
          date: "2024-09-28",
          symbol: "X",
          reportedCurrency: "USD",
          calendarYear: "2024",
          period: "FY",
          revenue: 0,
          grossProfit: 10e9,
          operatingIncome: 5e9,
          ebitda: 6e9,
          netIncome: 3e9,
          eps: 0.2,
        },
      ],
      balance: [],
      cash: [],
    };
    expect(metric("grossMargin").value(inputs)).toBeNull();
    expect(metric("grossMargin").change(inputs)).toBeNull();
    expect(metric("revenue").value(inputs)).toBeCloseTo(0, 5);
  });

  it("pairs FCF margin income to the cash row's own reporting date", () => {
    // Cash ends FY2024; income LAGS (no FY2024 row yet). The margin must
    // pair FY2024 FCF with FY2024 revenue — absent that income row the
    // margin is null, never a silently mismatched fiscal-year comparison.
    const inputs = fixture();
    inputs.statements = {
      ...inputs.statements!,
      cash: [
        {
          date: "2024-09-28",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2024",
          period: "FY",
          operatingCashFlow: 110e9,
          capitalExpenditure: -11e9,
          freeCashFlow: 100e9,
        },
        {
          date: "2023-09-30",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2023",
          period: "FY",
          operatingCashFlow: 100e9,
          capitalExpenditure: -11e9,
          freeCashFlow: 89e9,
        },
      ],
      income: [
        {
          date: "2023-09-30",
          symbol: "AAPL",
          reportedCurrency: "USD",
          calendarYear: "2023",
          period: "FY",
          revenue: 350e9,
          grossProfit: 150e9,
          operatingIncome: 110e9,
          ebitda: 115e9,
          netIncome: 95e9,
          eps: 6.0,
        },
      ],
    };
    // Latest cash (FY2024) has no FY2024 income row → null, not a 2023 mix.
    expect(metric("fcfMargin").value(inputs)).toBeNull();
    expect(metric("fcfMargin").change(inputs)).toBeNull();

    // Add the FY2024 income row → pairs by date (25.0% vs prior 89/350).
    inputs.statements!.income = [
      ...inputs.statements!.income,
      {
        date: "2024-09-28",
        symbol: "AAPL",
        reportedCurrency: "USD",
        calendarYear: "2024",
        period: "FY",
        revenue: 400e9,
        grossProfit: 170e9,
        operatingIncome: 120e9,
        ebitda: 130e9,
        netIncome: 100e9,
        eps: 6.5,
      },
    ];
    expect(metric("fcfMargin").value(inputs)).toBeCloseTo(25, 5);
    // (100/400=25.0) - (89/350≈25.4286) ≈ -0.4286pp
    expect(metric("fcfMargin").change(inputs)).toBeCloseTo(-0.4286, 2);
  });

  it("falls back from metrics to ratios for P/E TTM", () => {
    const inputs = fixture();
    inputs.metrics = {
      metrics: {},
      ratios: { priceEarningsRatioTTM: 27 },
      scores: null,
    };
    expect(metric("pe").value(inputs)).toBeCloseTo(27, 5);
  });

  it("reads balance ratios and money in billions", () => {
    const inputs = fixture();
    expect(metric("debtToEquity").value(inputs)).toBeCloseTo(100 / 62, 5);
    expect(metric("totalAssets").value(inputs)).toBeCloseTo(350, 5);
    expect(metric("netDebt").value(inputs)).toBeCloseTo(70, 5);
  });

  it("reads quote-driven market rows", () => {
    const inputs = fixture();
    expect(metric("marketCap").value(inputs)).toBeCloseTo(3400, 5);
    expect(metric("price").value(inputs)).toBeCloseTo(233.1, 5);
    expect(metric("price").change(inputs)).toBeCloseTo(1.17, 5);
    expect(metric("dayChange").value(inputs)).toBeCloseTo(1.17, 5);
  });

  it("returns null for missing payloads instead of NaN", () => {
    const empty: CompareInputs = {};
    for (const m of COMPARE_METRICS) {
      expect(m.value(empty)).toBeNull();
      expect(m.change(empty)).toBeNull();
    }
  });

  it("returns null deltas for point-in-time balance metrics", () => {
    const inputs = fixture();
    expect(metric("cashAndEquivalents").change(inputs)).toBeNull();
    expect(metric("totalEquity").change(inputs)).toBeNull();
    expect(metric("pe").change(inputs)).toBeNull();
  });
});

describe("formatCompareValue", () => {
  it("formats billions with a B suffix and NO currency symbol", () => {
    // Statement figures are in each company's reporting currency — the
    // per-column currency badge is the authority, never a hardcoded "$".
    expect(formatCompareValue(385.6, metric("revenue"))).toBe("385.60B");
    expect(formatCompareValue(0.02, metric("revenue"))).toBe("0.02B");
  });

  it("formats per-share dollars without a currency symbol", () => {
    expect(formatCompareValue(6.5, metric("eps"))).toBe("6.50");
  });

  it("formats percent and ratio units", () => {
    expect(formatCompareValue(6.1, metric("grossMargin"))).toBe("6.1%");
    expect(formatCompareValue(28.4, metric("pe"))).toBe("28.40");
    expect(formatCompareValue(1.6, metric("debtToEquity"))).toBe("1.60");
  });
});

describe("formatCompareChange", () => {
  it("formats percent growth deltas with sign", () => {
    expect(formatCompareChange(12.3, metric("revenue"))).toBe("+12.3%");
    expect(formatCompareChange(-5.2, metric("revenue"))).toBe("-5.2%");
  });

  it("formats margin deltas in percentage points", () => {
    expect(formatCompareChange(1.2, metric("grossMargin"))).toBe("+1.2pp");
    expect(formatCompareChange(-0.8, metric("grossMargin"))).toBe("-0.8pp");
  });
});