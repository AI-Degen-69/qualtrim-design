import { describe, expect, it } from "vitest";
import {
  altmanZone,
  compositeBand,
  growthScore,
  piotroskiBand,
  profitabilityScore,
} from "./scorecard";

describe("altmanZone", () => {
  it("classifies standard bankruptcy-risk bands", () => {
    expect(altmanZone(3.5)?.key).toBe("scorecard.zone.safe");
    expect(altmanZone(3.0)?.key).toBe("scorecard.zone.safe");
    expect(altmanZone(2.5)?.key).toBe("scorecard.zone.grey");
    expect(altmanZone(1.8)?.key).toBe("scorecard.zone.grey");
    expect(altmanZone(1.2)?.key).toBe("scorecard.zone.distress");
  });

  it("returns null for missing/invalid scores", () => {
    expect(altmanZone(null)).toBeNull();
    expect(altmanZone(Number.NaN)).toBeNull();
    expect(altmanZone(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("assigns the right tones", () => {
    expect(altmanZone(4)?.tone).toBe("positive");
    expect(altmanZone(2.2)?.tone).toBe("neutral");
    expect(altmanZone(1.0)?.tone).toBe("negative");
  });
});

describe("piotroskiBand", () => {
  it("bands the 0–9 score", () => {
    expect(piotroskiBand(9)?.key).toBe("scorecard.band.strong");
    expect(piotroskiBand(7)?.key).toBe("scorecard.band.strong");
    expect(piotroskiBand(6)?.key).toBe("scorecard.band.moderate");
    expect(piotroskiBand(4)?.key).toBe("scorecard.band.moderate");
    expect(piotroskiBand(3)?.key).toBe("scorecard.band.weak");
    expect(piotroskiBand(0)?.key).toBe("scorecard.band.weak");
    expect(piotroskiBand(null)).toBeNull();
  });
});

describe("profitabilityScore", () => {
  it("scores full-strength inputs at 100", () => {
    const score = profitabilityScore(
      { returnOnEquityTTM: 20, returnOnAssetsTTM: 10 },
      { netProfitMargin: 25 },
    );
    expect(score).toBe(100);
  });

  it("scores half-strength inputs at 50", () => {
    const score = profitabilityScore(
      { returnOnEquityTTM: 10, returnOnAssetsTTM: 5 },
      { netProfitMargin: 12.5 },
    );
    expect(score).toBe(50);
  });

  it("renormalizes weights when an input is missing", () => {
    // ROE at 100/100, ROA at 50/100, margin missing → 0.4*100 + 0.3*50 over 0.7
    const score = profitabilityScore(
      { returnOnEquityTTM: 20, returnOnAssetsTTM: 5 },
      {},
    );
    expect(score).toBe(Math.round((0.4 * 100 + 0.3 * 50) / 0.7));
  });

  it("clamps overshoot and returns null with no inputs", () => {
    const over = profitabilityScore(
      { returnOnEquityTTM: 60 },
      { netProfitMargin: 40 },
    );
    expect(over).toBe(100);
    expect(profitabilityScore(undefined, undefined)).toBeNull();
    expect(profitabilityScore({}, {})).toBeNull();
  });
});

describe("growthScore", () => {
  const row = (
    date: string,
    revenue: number,
    eps: number,
  ) => ({
    date,
    symbol: "X",
    reportedCurrency: "USD",
    calendarYear: date.slice(0, 4),
    period: "FY",
    revenue,
    grossProfit: 0,
    ebitda: 0,
    operatingIncome: 0,
    netIncome: 0,
    eps,
  });

  it("scores 20% growth in both revenue and EPS at 100", () => {
    const score = growthScore([row("2023-09-30", 100e9, 2), row("2024-09-28", 120e9, 2.4)]);
    expect(score).toBe(100);
  });

  it("scores flat growth around 33", () => {
    const score = growthScore([row("2023-09-30", 100e9, 2), row("2024-09-28", 100e9, 2)]);
    expect(score).toBe(33);
  });

  it("floors -10%+ declines at zero", () => {
    const score = growthScore([row("2023-09-30", 100e9, 2), row("2024-09-28", 90e9, 1.6)]);
    expect(score).toBe(0);
  });

  it("treats zero prior-year baseline as missing for that input", () => {
    // Revenue flat (100→100) scores 33; EPS prior-year 0 is skipped → 33.
    const score = growthScore([row("2023-09-30", 100e9, 0), row("2024-09-28", 100e9, 2)]);
    expect(score).toBe(33);
  });

  it("returns null with fewer than two rows or no income", () => {
    expect(growthScore([row("2024-09-28", 120e9, 2.4)])).toBeNull();
    expect(growthScore(undefined)).toBeNull();
    expect(growthScore([])).toBeNull();
  });
});

describe("compositeBand", () => {
  it("bands the 0–100 composite", () => {
    expect(compositeBand(85)?.key).toBe("scorecard.band.strong");
    expect(compositeBand(70)?.key).toBe("scorecard.band.strong");
    expect(compositeBand(55)?.key).toBe("scorecard.band.moderate");
    expect(compositeBand(40)?.key).toBe("scorecard.band.moderate");
    expect(compositeBand(25)?.key).toBe("scorecard.band.weak");
    expect(compositeBand(null)).toBeNull();
  });
});