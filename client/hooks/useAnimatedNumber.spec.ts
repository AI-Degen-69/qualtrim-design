// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  animatedValue,
  easeOutCubic,
  shouldAnimate,
} from "./useAnimatedNumber";

describe("easeOutCubic", () => {
  it("maps 0 → 0 and 1 → 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("starts fast and decelerates toward the end", () => {
    // Ease-out cubic: the first half covers more than half the distance.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    // Still monotonically increasing through the second half.
    expect(easeOutCubic(0.75)).toBeGreaterThan(easeOutCubic(0.5));
    expect(easeOutCubic(0.9)).toBeGreaterThan(easeOutCubic(0.75));
  });

  it("clamps out-of-range progress to [0, 1]", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("animatedValue", () => {
  it("returns the target when duration is zero or already elapsed", () => {
    expect(animatedValue(0, 10, 0, 0)).toBe(10);
    expect(animatedValue(0, 10, 1000, 600)).toBe(10);
  });

  it("hits the exact target at the end of the duration", () => {
    expect(animatedValue(5, 12, 600, 600)).toBe(12);
  });

  it("interpolates monotonically from `from` to `to`", () => {
    const values = [0, 150, 300, 450, 600].map((elapsed) =>
      animatedValue(0, 100, elapsed, 600),
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(100);
  });

  it("animates downward to a smaller target", () => {
    expect(animatedValue(10, 4, 300, 600)).toBeLessThan(10);
    expect(animatedValue(10, 4, 300, 600)).toBeGreaterThan(4);
    expect(animatedValue(10, 4, 600, 600)).toBe(4);
  });
});

describe("shouldAnimate", () => {
  it("returns false when reduced motion is preferred — the value jumps to target", () => {
    expect(shouldAnimate(0, 100, true)).toBe(false);
    expect(shouldAnimate(10, 4, true)).toBe(false);
  });

  it("returns true for a real count-up", () => {
    expect(shouldAnimate(0, 100, false)).toBe(true);
    expect(shouldAnimate(10, 4, false)).toBe(true);
  });

  it("returns false when from and to are equal (nothing to animate)", () => {
    expect(shouldAnimate(100, 100, false)).toBe(false);
  });
});
