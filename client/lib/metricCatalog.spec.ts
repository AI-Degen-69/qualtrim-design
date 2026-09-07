import { describe, expect, it } from "vitest";
import { metricStatementKey } from "./finance";
import {
  METRIC_CATALOG,
  chartMetricAllowsPriceOverlay,
  chartMetricById,
  chartMetricSupportsTtm,
} from "./metricCatalog";

const GRID_IDS = [
  "insights.revenue",
  "insights.ebitda",
  "insights.grossProfit",
  "insights.operatingIncome",
  "insights.netIncome",
  "insights.eps",
  "insights.cashAndEquivalents",
  "insights.totalAssets",
  "insights.fcf",
];

describe("chart metric catalog", () => {
  it("covers the full ticker-page grid vocabulary, in grid order", () => {
    expect(METRIC_CATALOG.map((m) => m.id)).toEqual(GRID_IDS);
  });

  it("has unique ids and a working lookup", () => {
    const ids = METRIC_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(chartMetricById(id)?.id).toBe(id);
    }
    expect(chartMetricById("insights.nope")).toBeUndefined();
  });

  it("mirrors the finance statement binding exactly (no drift)", () => {
    for (const entry of METRIC_CATALOG) {
      const binding = metricStatementKey(entry.id);
      expect(binding, `binding for ${entry.id}`).not.toBeNull();
      expect(binding?.statement).toBe(entry.statement);
      expect(binding?.key).toBe(entry.field);
      expect(binding?.divisor).toBe(entry.divisor);
    }
  });

  it("flags flow metrics TTM-capable and balance stocks not", () => {
    expect(chartMetricSupportsTtm("insights.revenue")).toBe(true);
    expect(chartMetricSupportsTtm("insights.fcf")).toBe(true);
    expect(chartMetricSupportsTtm("insights.eps")).toBe(true);
    expect(chartMetricSupportsTtm("insights.cashAndEquivalents")).toBe(false);
    expect(chartMetricSupportsTtm("insights.totalAssets")).toBe(false);
    expect(chartMetricSupportsTtm("insights.nope")).toBe(false);
  });

  it("allows the price overlay on dollar flows/per-share, not balance stocks", () => {
    expect(chartMetricAllowsPriceOverlay("insights.revenue")).toBe(true);
    expect(chartMetricAllowsPriceOverlay("insights.fcf")).toBe(true);
    expect(chartMetricAllowsPriceOverlay("insights.eps")).toBe(true);
    expect(chartMetricAllowsPriceOverlay("insights.cashAndEquivalents")).toBe(
      false,
    );
    expect(chartMetricAllowsPriceOverlay("insights.totalAssets")).toBe(false);
    expect(chartMetricAllowsPriceOverlay("insights.nope")).toBe(false);
  });

  it("describes fcf from the cash statement with billion display units", () => {
    const fcf = chartMetricById("insights.fcf");
    expect(fcf).toMatchObject({
      id: "insights.fcf",
      statement: "cash",
      field: "freeCashFlow",
      divisor: 1e9,
      unit: "B",
      group: "cashflow",
    });
  });

  it("uses only the supported unit and chart vocabularies", () => {
    for (const entry of METRIC_CATALOG) {
      expect(["B", "$"]).toContain(entry.unit);
      expect(["bar", "line"]).toContain(entry.chart);
    }
  });
});
