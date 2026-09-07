import { describe, expect, it } from "vitest";
import {
  normalizeOwnership,
  toPercent,
  unwrapNumber,
} from "./ownershipNormalizer";

describe("unwrapNumber", () => {
  it("accepts flat numbers and {raw,fmt} wrappers", () => {
    expect(unwrapNumber(0.5)).toBe(0.5);
    expect(unwrapNumber({ raw: 42, fmt: "42" })).toBe(42);
    expect(unwrapNumber({ raw: 42 })).toBe(42);
  });

  it("rejects null/undefined/empty and non-finite", () => {
    expect(unwrapNumber(null)).toBeUndefined();
    expect(unwrapNumber(undefined)).toBeUndefined();
    expect(unwrapNumber("")).toBeUndefined();
    expect(unwrapNumber(Number.NaN)).toBeUndefined();
    expect(unwrapNumber({ raw: Number.NaN })).toBeUndefined();
  });
});

describe("toPercent", () => {
  it("converts Yahoo decimal fractions to percent points", () => {
    expect(toPercent(0.6)).toBe(60);
    expect(toPercent({ raw: 0.035 })).toBe(3.5);
    expect(toPercent(0.002)).toBe(0.2);
  });

  it("passes already-percent values through unchanged", () => {
    expect(toPercent(8.4)).toBe(8.4);
  });
});

describe("normalizeOwnership", () => {
  const msEpoch = Date.UTC(2024, 5, 30);

  it("normalizes a full payload with wrapped and flat values", () => {
    const out = normalizeOwnership({
      defaultKeyStatistics: {
        heldPercentInstitutions: { raw: 0.62 },
        heldPercentInsiders: { raw: 0.0015 },
      },
      institutionOwnership: {
        ownershipList: [
          {
            organization: "Vanguard Group",
            pctHeld: { raw: 0.035 },
            position: { raw: 50_000_000 },
            value: { raw: 10_000_000_000 },
            reportDate: { raw: msEpoch },
          },
        ],
      },
      fundOwnership: {
        ownershipList: [
          {
            organization: "Fidelity",
            pctHeld: 0.028,
            position: 40_000_000,
            value: 8_000_000_000,
            reportDate: msEpoch,
          },
        ],
      },
      insiderHolders: {
        holders: [
          {
            name: "Tim Cook",
            title: "CEO",
            relation: "CEO",
            latestTransDate: { raw: msEpoch },
            shares: { raw: 120_000 },
            value: { raw: 23_000_000 },
          },
        ],
      },
    });

    expect(out.unavailable).toBe(false);
    expect(out.institutionPercent).toBe(62);
    expect(out.insiderPercent).toBeCloseTo(0.15, 5);
    expect(out.institutionHolders[0]).toEqual({
      name: "Vanguard Group",
      pctHeld: 3.5,
      position: 50_000_000,
      value: 10_000_000_000,
      reportDate: "2024-06-30",
    });
    expect(out.fundHolders[0]).toEqual({
      name: "Fidelity",
      pctHeld: 2.8,
      position: 40_000_000,
      value: 8_000_000_000,
      reportDate: "2024-06-30",
    });
    expect(out.insiderHolders[0]).toEqual({
      name: "Tim Cook",
      title: "CEO",
      relation: "CEO",
      latestTransDate: "2024-06-30",
      shares: 120_000,
      value: 23_000_000,
    });
  });

  it("caps each list at 10 rows", () => {
    const ownershipList = Array.from({ length: 15 }, (_, i) => ({
      organization: `Holder ${i}`,
    }));
    const out = normalizeOwnership({ institutionOwnership: { ownershipList } });
    expect(out.institutionHolders.length).toBe(10);
  });

  it("reports unavailable when Yahoo returns nothing usable", () => {
    const out = normalizeOwnership({});
    expect(out.unavailable).toBe(true);
    expect(out.institutionHolders).toEqual([]);
    expect(out.fundHolders).toEqual([]);
    expect(out.insiderHolders).toEqual([]);
    expect(out.institutionPercent).toBeUndefined();
  });

  it("keeps unavailable false when only aggregates exist", () => {
    const out = normalizeOwnership({
      defaultKeyStatistics: { heldPercentInstitutions: 0.5 },
    });
    expect(out.unavailable).toBe(false);
    expect(out.institutionPercent).toBe(50);
    expect(out.institutionHolders).toEqual([]);
  });

  it("handles empty lists gracefully", () => {
    const out = normalizeOwnership({
      institutionOwnership: { ownershipList: [] },
      fundOwnership: { ownershipList: [] },
      insiderHolders: { holders: [] },
    });
    expect(out.unavailable).toBe(true);
    expect(out.institutionHolders).toEqual([]);
  });
});