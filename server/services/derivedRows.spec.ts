import { describe, expect, it } from "vitest";
import { deriveBalanceRows, deriveNetReturned } from "./derivedRows";

describe("deriveBalanceRows", () => {
  it("computes total intangibles = goodwill + intangibles", () => {
    const out = deriveBalanceRows({
      goodwill: 69e9,
      intangibleAssets: 11e9,
    });
    expect(out._derived_totalIntangibles).toBe(80e9);
  });

  it("computes TBV and tangible assets from equity and assets", () => {
    // MSFT-shaped: equity ~$268B, assets ~$512B, intangibles ~$80B.
    const out = deriveBalanceRows({
      goodwill: 69e9,
      intangibleAssets: 11e9,
      totalEquity: 268e9,
      totalAssets: 512e9,
    });
    expect(out._derived_tbv).toBe(268e9 - 80e9);
    expect(out._derived_totalTangible).toBe(512e9 - 80e9);
  });

  it("handles zero intangibles (AAPL-shaped) as real data, not missing", () => {
    // Apple reports ~no goodwill/intangibles: total intangibles must be 0,
    // so TBV ≈ equity — not undefined.
    const out = deriveBalanceRows({
      goodwill: 0,
      intangibleAssets: 0,
      totalEquity: 62e9,
      totalAssets: 350e9,
    });
    expect(out._derived_totalIntangibles).toBe(0);
    expect(out._derived_tbv).toBe(62e9);
    expect(out._derived_totalTangible).toBe(350e9);
  });

  it("omits derived fields when no intangibles inputs exist", () => {
    const out = deriveBalanceRows({
      totalEquity: 62e9,
      totalAssets: 350e9,
    });
    expect(out._derived_totalIntangibles).toBeUndefined();
    expect(out._derived_tbv).toBeUndefined();
    expect(out._derived_totalTangible).toBeUndefined();
  });

  it("falls back to a single component when the other is missing", () => {
    const onlyGoodwill = deriveBalanceRows({
      goodwill: 30e9,
      totalEquity: 100e9,
    });
    expect(onlyGoodwill._derived_totalIntangibles).toBe(30e9);
    expect(onlyGoodwill._derived_tbv).toBe(70e9);

    const onlyIntangibles = deriveBalanceRows({
      intangibleAssets: 12e9,
      totalAssets: 200e9,
    });
    expect(onlyIntangibles._derived_totalIntangibles).toBe(12e9);
    expect(onlyIntangibles._derived_totalTangible).toBe(188e9);
  });

  it("treats null and non-finite values as missing", () => {
    const out = deriveBalanceRows({
      goodwill: null,
      intangibleAssets: Number.NaN,
      totalEquity: 62e9,
    });
    expect(out._derived_totalIntangibles).toBeUndefined();
    expect(out._derived_tbv).toBeUndefined();
  });
});

describe("deriveNetReturned", () => {
  it("sums dividends + net buybacks with a positive return convention", () => {
    // FMP signs outflows negative: -$25B dividends, -$90B net buyback.
    const out = deriveNetReturned({
      dividendsPaid: -25e9,
      salePurchaseOfStock: -90e9,
    });
    expect(out._derived_netReturned).toBe(115e9);
  });

  it("works from dividends alone", () => {
    const out = deriveNetReturned({ dividendsPaid: -15e9 });
    expect(out._derived_netReturned).toBe(15e9);
  });

  it("works from buybacks alone (salePurchaseOfStock fallback)", () => {
    const viaSps = deriveNetReturned({ salePurchaseOfStock: -40e9 });
    expect(viaSps._derived_netReturned).toBe(40e9);

    const viaRepurchase = deriveNetReturned({
      commonStockRepurchased: -40e9,
    });
    expect(viaRepurchase._derived_netReturned).toBe(40e9);
  });

  it("returns an empty row when no inputs exist", () => {
    expect(deriveNetReturned({})).toEqual({});
    expect(
      deriveNetReturned({ dividendsPaid: undefined, salePurchaseOfStock: null }),
    ).toEqual({});
  });

  it("keeps an explicit zero (no dividends) as real data", () => {
    const out = deriveNetReturned({ dividendsPaid: 0 });
    expect(out._derived_netReturned).toBe(0);
  });
});