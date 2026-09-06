import { describe, expect, it } from "vitest";
import { chunkSymbols, mergeBatchQuoteResponses } from "./batchQuotes";
import type { BatchQuoteResponse } from "../../shared/api";

describe("chunkSymbols", () => {
  it("keeps requests at or below the route limit", () => {
    const symbols = Array.from({ length: 101 }, (_, i) => `S${i}`);
    const chunks = chunkSymbols(symbols);

    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 1]);
    expect(chunks.flat()).toEqual(symbols);
  });

  it("handles empty input and rejects invalid chunk sizes", () => {
    expect(chunkSymbols([])).toEqual([]);
    expect(() => chunkSymbols(["AAPL"], 0)).toThrow("positive integer");
    expect(() => chunkSymbols(["AAPL"], 1.5)).toThrow("positive integer");
  });
});

describe("mergeBatchQuoteResponses", () => {
  const q = (symbol: string) => ({
    symbol,
    name: "",
    price: 1,
    change: 0,
    changesPercentage: 0,
  });
  const fulfilled = (quotes: BatchQuoteResponse["quotes"]) =>
    ({
      status: "fulfilled",
      value: { quotes },
    }) as PromiseFulfilledResult<BatchQuoteResponse>;
  const rejected = (reason: unknown) =>
    ({ status: "rejected", reason }) as PromiseRejectedResult;

  it("merges quotes from fulfilled batches in request order", () => {
    expect(
      mergeBatchQuoteResponses([
        fulfilled([q("AAPL"), null]),
        fulfilled([q("MSFT")]),
      ]),
    ).toEqual({ quotes: [q("AAPL"), null, q("MSFT")] });
  });

  it("guarantees partial success: one failed batch must not blank the others", () => {
    const result = mergeBatchQuoteResponses([
      rejected(new Error("boom")),
      fulfilled([q("MSFT")]),
    ]);
    expect(result.quotes).toEqual([q("MSFT")]);
  });

  it("throws the first rejection reason when every batch failed", () => {
    expect(() =>
      mergeBatchQuoteResponses([
        rejected(new Error("first")),
        rejected(new Error("second")),
      ]),
    ).toThrow("first");
  });

  it("falls back to a plain error when rejections carry no usable reason", () => {
    expect(() => mergeBatchQuoteResponses([rejected(undefined)])).toThrow(
      "All quote batches failed",
    );
  });
});
