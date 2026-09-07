import { describe, it, expect } from "vitest";
import type { StockMetrics } from "../../shared/api";
import {
  SCREENER_METRIC_FILTERS,
  SCREENER_METRIC_FILTER_IDS,
  buildMetricValues,
  hasActiveMetricFilters,
  matchesMetricFilters,
  parseMetricFilterParam,
  runConcurrent,
  screenerMetricValue,
  type MetricFilterMap,
} from "./screenerMetrics";

function yahooMetrics(
  overrides: Partial<StockMetrics> = {},
): StockMetrics {
  return {
    metrics: {
      peRatioTTM: 25,
      priceToBookRatioTTM: 8,
      evToEBITDATTM: 18,
      dividendYieldTTM: 0.5,
      returnOnEquityTTM: 150,
      returnOnAssetsTTM: 30,
      freeCashFlowYieldTTM: 2,
    },
    ratios: {
      priceToEarningsGrowthRatioTTM: 2.1,
      netProfitMargin: 26,
      operatingProfitMarginTTM: 31,
      grossProfitMarginTTM: 46,
      currentRatio: 1.1,
      debtToEquityRatio: 1.6,
    },
    scores: null,
    source: "yahoo",
    ...overrides,
  };
}

describe("SCREENER_METRIC_FILTERS vocabulary", () => {
  it("exposes at least 12 live filters (issue bar)", () => {
    expect(SCREENER_METRIC_FILTERS.length).toBeGreaterThanOrEqual(12);
  });

  it("has unique ids matching the metric sections", () => {
    expect(new Set(SCREENER_METRIC_FILTER_IDS).size).toBe(
      SCREENER_METRIC_FILTERS.length,
    );
    for (const def of SCREENER_METRIC_FILTERS) {
      expect(["metrics", "ratios"]).toContain(def.section);
    }
  });

  it("extracts normalized values from both sections", () => {
    const m = yahooMetrics();
    const pe = SCREENER_METRIC_FILTERS.find((d) => d.id === "pe")!;
    const net = SCREENER_METRIC_FILTERS.find((d) => d.id === "netMargin")!;
    expect(screenerMetricValue(m, pe)).toBe(25);
    expect(screenerMetricValue(m, net)).toBe(26);
  });

  it("returns undefined for missing fields", () => {
    const m = yahooMetrics({ metrics: {} });
    const pe = SCREENER_METRIC_FILTERS.find((d) => d.id === "pe")!;
    expect(screenerMetricValue(m, pe)).toBeUndefined();
  });
});

describe("parseMetricFilterParam", () => {
  it("parses min:max, bare min, bare max", () => {
    expect(parseMetricFilterParam("5:20")).toEqual({ min: 5, max: 20 });
    expect(parseMetricFilterParam(":20")).toEqual({ max: 20 });
    expect(parseMetricFilterParam("5:")).toEqual({ min: 5 });
    expect(parseMetricFilterParam("5.5:10.25")).toEqual({
      min: 5.5,
      max: 10.25,
    });
  });

  it("returns undefined for empty or garbage input", () => {
    expect(parseMetricFilterParam("")).toBeUndefined();
    expect(parseMetricFilterParam(":")).toBeUndefined();
    expect(parseMetricFilterParam("abc")).toBeUndefined();
    expect(parseMetricFilterParam(undefined as unknown as string)).toBeUndefined();
  });
});

describe("hasActiveMetricFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveMetricFilters({})).toBe(false);
    expect(hasActiveMetricFilters({ pe: { min: undefined, max: undefined } })).toBe(false);
  });

  it("is true when either bound is set", () => {
    expect(hasActiveMetricFilters({ pe: { min: 5 } })).toBe(true);
    expect(hasActiveMetricFilters({ pe: { max: 30 } })).toBe(true);
  });
});

describe("matchesMetricFilters", () => {
  it("passes when filters match the row", () => {
    const filters: MetricFilterMap = { pe: { min: 10, max: 30 }, roe: { min: 100 } };
    expect(matchesMetricFilters(yahooMetrics(), filters)).toBe(true);
  });

  it("fails on min and on max violations", () => {
    expect(matchesMetricFilters(yahooMetrics(), { pe: { min: 30 } })).toBe(false);
    expect(matchesMetricFilters(yahooMetrics(), { pe: { max: 20 } })).toBe(false);
  });

  it("ignores filters with no bounds set", () => {
    expect(
      matchesMetricFilters(yahooMetrics(), { pe: { min: undefined, max: undefined } }),
    ).toBe(true);
  });

  it("fails an active filter when the row's value is missing — never silently includes", () => {
    const m = yahooMetrics({ metrics: { ...yahooMetrics().metrics, peRatioTTM: undefined } });
    expect(matchesMetricFilters(m, { pe: { min: 5 } })).toBe(false);
    // …but the same row passes filters that are not active.
    expect(matchesMetricFilters(m, { roe: { min: 100 } })).toBe(true);
  });

  it("handles boundary values inclusively", () => {
    expect(matchesMetricFilters(yahooMetrics(), { pe: { min: 25, max: 25 } })).toBe(true);
  });
});

describe("buildMetricValues", () => {
  it("keys values by filter id, undefined for missing", () => {
    const m = yahooMetrics({ ratios: {} });
    const values = buildMetricValues(m);
    expect(values.pe).toBe(25);
    expect(values.netMargin).toBeUndefined();
    expect(Object.keys(values).sort()).toEqual([...SCREENER_METRIC_FILTER_IDS].sort());
  });
});

describe("runConcurrent", () => {
  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    await runConcurrent([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("preserves input order in the output array", async () => {
    const out = await runConcurrent(
      ["a", "b", "c", "d"],
      2,
      async (s, i) => `${s}${i}`,
    );
    expect(out).toEqual(["a0", "b1", "c2", "d3"]);
  });

  it("handles empty input and single-item input", async () => {
    expect(await runConcurrent([], 8, async () => 1)).toEqual([]);
    expect(await runConcurrent(["x"], 8, async () => 1)).toEqual([1]);
  });
});