import { describe, expect, it } from "vitest";
import {
  barDirection,
  barGradientId,
  barStroke,
  calculateChartDomain,
  getChartAvailability,
  splitSparklineValues,
} from "./chartStyles";

describe("chart bar styles", () => {
  it("classifies positive and negative values by their side of zero", () => {
    expect(barDirection(12)).toBe("positive");
    expect(barDirection(-12)).toBe("negative");
    expect(barDirection(0)).toBe("neutral");
  });

  it("does not color unavailable values as positive bars", () => {
    expect(barDirection(null)).toBe("neutral");
    expect(barDirection(undefined)).toBe("neutral");
    expect(barDirection(Number.NaN)).toBe("neutral");
    expect(barGradientId("revenue", null)).toBe("colorValue-neutral-revenue");
  });

  it("selects matching directional gradient and border colors", () => {
    expect(barGradientId("revenue", 4)).toBe("colorValue-positive-revenue");
    expect(barGradientId("revenue", -4)).toBe("colorValue-negative-revenue");
    expect(barStroke(4)).toContain("155");
    expect(barStroke(-4)).toContain("6 80%");
  });

  it("splits sparkline values at zero for directional fills", () => {
    expect(
      splitSparklineValues([{ value: 4 }, { value: -3 }, { value: 0 }]),
    ).toEqual([
      { value: 4, positiveValue: 4, negativeValue: 0 },
      { value: -3, positiveValue: 0, negativeValue: -3 },
      { value: 0, positiveValue: 0, negativeValue: 0 },
    ]);
  });

  it("summarises unavailable periods without treating nulls as real data", () => {
    expect(getChartAvailability([null, null, 4, 5], 4)).toEqual({
      availableCount: 2,
      lockedCount: 2,
      totalCount: 4,
      hasUnavailable: true,
      fractionUnavailable: 0.5,
    });

    expect(getChartAvailability([], 12)).toEqual({
      availableCount: 0,
      lockedCount: 12,
      totalCount: 12,
      hasUnavailable: true,
      fractionUnavailable: 1,
    });
  });

  it("keeps a negative-only series from pinning zero to the plot edge", () => {
    const [min, max] = calculateChartDomain([-4.6]);
    expect(min).toBeLessThan(-4.6);
    expect(max).toBe(0);
  });

  it("balances positive-only, mixed, empty, and zero-only series", () => {
    const positive = calculateChartDomain([2, 8]);
    expect(positive[0]).toBe(0);
    expect(positive[1]).toBeGreaterThan(8);

    const mixed = calculateChartDomain([-3, 5]);
    expect(mixed[0]).toBeLessThan(-3);
    expect(mixed[1]).toBeGreaterThan(5);

    expect(calculateChartDomain([])).toEqual([-1, 1]);
    expect(calculateChartDomain([0, null, undefined])).toEqual([-1, 1]);
  });
});
