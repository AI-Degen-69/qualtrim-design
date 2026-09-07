import { describe, expect, it } from "vitest";
import type { ChartPoint } from "@shared/api";
import {
  buildCloseOverlay,
  latestCloseForLabel,
  overlayHasPoints,
  parseFiscalLabel,
} from "./priceOverlay";

function point(date: string, adjClose: number): ChartPoint {
  return {
    date,
    open: adjClose,
    high: adjClose,
    low: adjClose,
    close: adjClose,
    adjClose,
    volume: 0,
    change: 0,
    changePercent: 0,
  };
}

describe("parseFiscalLabel", () => {
  it("understands quarterly, FY, and bare-year labels", () => {
    expect(parseFiscalLabel("Q1 2025")).toEqual({ year: 2025, quarter: 1 });
    expect(parseFiscalLabel("Q4 2024")).toEqual({ year: 2024, quarter: 4 });
    expect(parseFiscalLabel("FY 2024")).toEqual({ year: 2024, quarter: null });
    expect(parseFiscalLabel("FY2024")).toEqual({ year: 2024, quarter: null });
    expect(parseFiscalLabel("2024")).toEqual({ year: 2024, quarter: null });
  });

  it("rejects labels that are not fiscal periods (locked placeholder bars)", () => {
    expect(parseFiscalLabel("Locked - 2")).toBeNull();
    expect(parseFiscalLabel("")).toBeNull();
    expect(parseFiscalLabel("Q5 2025")).toBeNull();
    expect(parseFiscalLabel("Q1")).toBeNull();
  });
});

describe("latestCloseForLabel", () => {
  const history = [
    point("2022-12-15", 30),
    point("2022-12-30", 40), // year-end 2022
    point("2023-03-31", 50), // Q1 2023 close
    point("2023-06-30", 60), // Q2 2023 close
    point("2023-12-29", 70), // year-end 2023
    point("2024-03-28", 80), // Q1 2024 close
  ];

  it("maps an annual label to the latest close within that calendar year", () => {
    expect(latestCloseForLabel(history, "2022")).toBe(40);
    expect(latestCloseForLabel(history, "2023")).toBe(70);
  });

  it("maps a quarterly label to the latest close within that calendar quarter", () => {
    expect(latestCloseForLabel(history, "Q1 2023")).toBe(50);
    expect(latestCloseForLabel(history, "Q2 2023")).toBe(60);
    expect(latestCloseForLabel(history, "Q1 2024")).toBe(80);
  });

  it("never exceeds the label: a label past the history pins to the newest close", () => {
    // A period label can sit slightly past the history (fiscal/calendar
    // offset); the overlay pins to the newest available close rather than
    // inventing a price or silently dropping the bar.
    expect(latestCloseForLabel(history, "Q3 2024")).toBe(80);
    expect(latestCloseForLabel(history, "2025")).toBe(80);
  });

  it("falls back to the most recent close before a fiscal/calendar mismatch label", () => {
    // A company with a Dec-end fiscal Q1 2025 reports around 2024-12-28; the
    // best available close sits inside calendar Q4 2024.
    expect(latestCloseForLabel(history, "Q1 2025")).toBe(80);
  });

  it("returns null for unparseable labels and empty history", () => {
    expect(latestCloseForLabel(history, "Locked - 1")).toBeNull();
    expect(latestCloseForLabel([], "2023")).toBeNull();
  });
});

describe("buildCloseOverlay / overlayHasPoints", () => {
  const history = [
    point("2021-12-31", 20),
    point("2022-12-30", 40),
    point("2023-12-29", 70),
  ];

  it("returns a parallel array aligned to the labels", () => {
    const aligned = buildCloseOverlay(["2021", "2022", "2023"], history);
    expect(aligned).toEqual([20, 40, 70]);
    expect(overlayHasPoints(aligned)).toBe(true);
  });

  it("nulls entries with no matching price and reports no points", () => {
    const aligned = buildCloseOverlay(["2015", "2016"], history);
    expect(aligned).toEqual([null, null]);
    expect(overlayHasPoints(aligned)).toBe(false);
  });

  it("tolerates history in any order (uses the latest date, not array order)", () => {
    const shuffled = [...history].reverse();
    expect(buildCloseOverlay(["2021", "2023"], shuffled)).toEqual([20, 70]);
  });
});
