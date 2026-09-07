import { describe, expect, it } from "vitest";
import {
  buildFrequencySeries,
  buildTtmSeries,
  buildYoYPoints,
  compactPeriodLabel,
  formatAxisValue,
  metricChartColor,
  metricIsStockVariable,
  rangePeriodCount,
  sliceSeriesByRange,
} from "./financialSeries";

/**
 * Regression net for the Stocknest-style chart series shapers. These pure
 * helpers decide what every chart card and the expanded modal actually
 * draw — a wrong TTM window, YoY stride, or range slice silently skews the
 * bars, so the business rules are pinned here:
 *
 *   - TTM = trailing 4 quarters summed for flows, point-in-time for stocks
 *   - YoY stride: quarterly 4 rows, TTM 4 windows, annual 1
 *   - ranges slice off the END of the ascending series (2Y=2/8, 5Y=5/20)
 *   - compact axis labels ("Q2 2025" → "Q2 '25", "FY 2024" → "2024")
 */

// Five ascending quarters, values 1..5 (B units) — easy to sum by hand.
const quarterlyFlow = [
  { date: "Q1 2024", value: 1 },
  { date: "Q2 2024", value: 2 },
  { date: "Q3 2024", value: 3 },
  { date: "Q4 2024", value: 4 },
  { date: "Q1 2025", value: 5 },
];

const statements = { income: [], balance: [], cash: [] };

describe("buildTtmSeries", () => {
  it("falls back to the annual series and reports the effective frequency", () => {
    // projectMetricSeries reads rows by statement key; empty statements →
    // annual fallback. The effective frequency must say "annual" so the
    // card never badges annual bars as TTM.
    const annual = [
      { date: "2023", value: 6 },
      { date: "2024", value: 10 },
    ];
    const result = buildFrequencySeries({
      metricName: "insights.revenue",
      annualData: annual,
      quarterlyStatements: statements,
      frequency: "ttm",
    });
    expect(result.points).toEqual(annual);
    expect(result.effectiveFrequency).toBe("annual");
  });

  it("returns [] under four quarters and falls back at the caller", () => {
    expect(buildTtmSeries("insights.revenue", statements)).toEqual([]);
  });

  it("keeps the requested frequency when quarterly rows exist", () => {
    const annual = [{ date: "2024", value: 10 }];
    const result = buildFrequencySeries({
      metricName: "insights.revenue",
      annualData: annual,
      quarterlyStatements: {
        income: [
          { period: "Q1", calendarYear: "2025", revenue: 1e9 },
          { period: "Q2", calendarYear: "2025", revenue: 2e9 },
        ],
      },
      frequency: "quarterly",
    });
    expect(result.effectiveFrequency).toBe("quarterly");
    expect(result.points).toEqual([
      { date: "Q1 2025", value: 1 },
      { date: "Q2 2025", value: 2 },
    ]);
  });

  it("flags balance-sheet metrics as stock variables", () => {
    expect(metricIsStockVariable("insights.cashAndEquivalents")).toBe(true);
    expect(metricIsStockVariable("insights.revenue")).toBe(false);
  });
});

describe("sliceSeriesByRange / rangePeriodCount", () => {
  const series = [
    { date: "2020", value: 1 },
    { date: "2021", value: 2 },
    { date: "2022", value: 3 },
    { date: "2023", value: 4 },
    { date: "2024", value: 5 },
  ];

  it("keeps the tail for finite ranges (annual 2Y = last 2 points)", () => {
    expect(sliceSeriesByRange(series, "2Y", "annual")).toEqual([
      { date: "2023", value: 4 },
      { date: "2024", value: 5 },
    ]);
  });

  it("scales quarters by 4× years and passes All through", () => {
    expect(rangePeriodCount("2Y", "quarterly")).toBe(8);
    expect(rangePeriodCount("5Y", "ttm")).toBe(20);
    expect(rangePeriodCount("10Y", "annual")).toBe(10);
    expect(rangePeriodCount("All", "quarterly")).toBe(Infinity);
    // Series shorter than the window → whole series, not padded zeros.
    expect(sliceSeriesByRange(series, "10Y", "annual")).toEqual(series);
  });
});

describe("buildYoYPoints", () => {
  it("strides 4 rows for quarterly (same quarter, prior year)", () => {
    const points = buildYoYPoints(quarterlyFlow, "quarterly");
    // First point with a full 4-row lookback is Q1 2025 (5) vs Q1 2024 (1).
    expect(points).toEqual([{ date: "Q1 2025", value: 400 }]);
  });

  it("strides 4 windows for TTM (rolling year vs rolling year −1y)", () => {
    const ttm = [
      { date: "Q4 2024", value: 10 },
      { date: "Q1 2025", value: 12 },
      { date: "Q2 2025", value: 14 },
      { date: "Q3 2025", value: 16 },
      { date: "Q4 2025", value: 20 },
    ];
    // First comparable window: Q4 2025 TTM (20) vs Q4 2024 TTM (10) → +100%.
    expect(buildYoYPoints(ttm, "ttm")).toEqual([
      { date: "Q4 2025", value: 100 },
    ]);
  });

  it("strides 1 for annual and drops zero-baseline points", () => {
    const annual = [
      { date: "2023", value: 100 },
      { date: "2024", value: 0 },
      { date: "2025", value: 110 },
    ];
    // 2024 vs 2023 → -100%; 2025 vs 2024 skipped (zero baseline).
    expect(buildYoYPoints(annual, "annual")).toEqual([
      { date: "2024", value: -100 },
    ]);
  });
});

describe("labels & formatting", () => {
  it("compacts provider period labels for the x-axis", () => {
    expect(compactPeriodLabel("Q2 2025")).toBe("Q2 '25");
    expect(compactPeriodLabel("FY 2024")).toBe("2024");
    expect(compactPeriodLabel("2023")).toBe("2023");
  });

  it("formats compact axis values per unit without ugly zeros", () => {
    expect(formatAxisValue(0, "B")).toBe("0B");
    expect(formatAxisValue(0, "$")).toBe("$0");
    expect(formatAxisValue(416.16, "B")).toBe("416B");
    expect(formatAxisValue(5.5, "$")).toBe("$5.5");
    expect(formatAxisValue(33.17, "%")).toBe("33%");
  });
});

describe("metricChartColor", () => {
  it("maps known metric ids to token colors and falls back safely", () => {
    expect(metricChartColor("insights.revenue")).toContain("--chart-green");
    expect(metricChartColor("insights.grossProfit")).toContain("--chart-blue");
    expect(metricChartColor("unknown.metric", "purple")).toContain(
      "--chart-purple",
    );
    expect(metricChartColor("unknown.metric")).toContain("--chart-accent");
  });
});
