import { describe, expect, it } from "vitest";
import { presentQuoteRow } from "./universeRows";

/**
 * Pins the shared quote-row presentation contract used by all three
 * Insights universe layouts (grid cards, ruled ledger, signal grid).
 * Before this module the same ternary chain was copy-pasted three times
 * inside Insights.tsx.
 */

describe("presentQuoteRow", () => {
  it("formats a positive mover with a plus sign and positive class", () => {
    expect(presentQuoteRow({ price: 227.5, changePercent: 1.256 })).toEqual({
      liveText: "$227.50",
      pctText: "+1.26%",
      cls: "text-chart-positive",
    });
  });

  it("formats a negative mover without a plus sign", () => {
    expect(presentQuoteRow({ price: 89.1, changePercent: -2.4 })).toEqual({
      liveText: "$89.10",
      pctText: "-2.40%",
      cls: "text-chart-negative",
    });
  });

  it("renders em-dashes for a missing quote", () => {
    expect(presentQuoteRow({})).toEqual({
      liveText: "—",
      pctText: "—",
      cls: "text-muted-foreground",
    });
  });

  it("treats non-finite prices as not-live instead of emitting $NaN", () => {
    expect(presentQuoteRow({ price: Number.NaN }).liveText).toBe("—");
    expect(presentQuoteRow({ price: Number.POSITIVE_INFINITY }).liveText).toBe(
      "—",
    );
  });

  it("keeps zero change neutral-positive with an explicit plus", () => {
    const view = presentQuoteRow({ price: 5, changePercent: 0 });
    expect(view.pctText).toBe("+0.00%");
    expect(view.cls).toBe("text-chart-positive");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "normalizes non-finite changePercent %p to the unavailable state",
    (bad) => {
      expect(presentQuoteRow({ price: 10, changePercent: bad })).toEqual({
        liveText: "$10.00",
        pctText: "—",
        cls: "text-muted-foreground",
      });
    },
  );
});
