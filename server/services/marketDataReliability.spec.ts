import { describe, expect, it, vi } from "vitest";
import {
  buildFmpBatchUrl,
  buildHeatmapRows,
  buildSectorHeatmapCacheKey,
  canonicalSymbols,
  createInFlightRegistry,
  orderByRequestedSymbols,
  resolveOrderedBatch,
} from "./marketDataReliability";

interface TestQuote {
  symbol: string;
  price: number;
}

describe("marketDataReliability", () => {
  it("canonicalizes symbols for shared provider work", () => {
    expect(canonicalSymbols([" msft", "AAPL", "MSFT", "", "aapl"])).toEqual([
      "AAPL",
      "MSFT",
    ]);
  });

  it("builds the stable and legacy FMP batch shapes", () => {
    const stable = new URL(
      buildFmpBatchUrl(
        "https://financialmodelingprep.com/stable",
        "secret",
        ["MSFT", "AAPL"],
        true,
      ),
    );
    expect(stable.pathname).toBe("/stable/batch-quote");
    expect(stable.searchParams.get("symbols")).toBe("AAPL,MSFT");
    expect(stable.searchParams.get("apikey")).toBe("secret");

    const legacy = new URL(
      buildFmpBatchUrl(
        "https://financialmodelingprep.com/api/v3",
        "secret",
        ["MSFT", "AAPL"],
        false,
      ),
    );
    expect(legacy.pathname).toBe("/api/v3/quote/AAPL,MSFT");
    expect(legacy.searchParams.get("apikey")).toBe("secret");
  });

  it("remaps provider records into the caller's order and preserves nulls", () => {
    const rows = orderByRequestedSymbols<TestQuote>(
      ["MSFT", "AAPL", "NVDA"],
      [
        { symbol: "AAPL", price: 100 },
        { symbol: "MSFT", price: 200 },
      ],
    );
    expect(rows).toEqual([
      { symbol: "MSFT", price: 200 },
      { symbol: "AAPL", price: 100 },
      null,
    ]);
  });

  it("falls back only for missing records and keeps requested order", async () => {
    const fetchSingle = vi.fn(
      async (symbol: string): Promise<TestQuote | null> => ({
        symbol,
        price: symbol === "NVDA" ? 300 : 0,
      }),
    );
    const result = await resolveOrderedBatch<TestQuote>({
      symbols: ["MSFT", "AAPL", "NVDA"],
      fetchBatch: async () => [
        { symbol: "AAPL", price: 100 },
        { symbol: "MSFT", price: 200 },
      ],
      fetchSingle,
      concurrency: 2,
    });

    expect(result).toEqual([
      { symbol: "MSFT", price: 200 },
      { symbol: "AAPL", price: 100 },
      { symbol: "NVDA", price: 300 },
    ]);
    expect(fetchSingle).toHaveBeenCalledTimes(1);
    expect(fetchSingle).toHaveBeenCalledWith("NVDA");
  });

  it("keeps unavailable symbols null after fallback exhaustion", async () => {
    const result = await resolveOrderedBatch<TestQuote>({
      symbols: ["AAPL", "MSFT"],
      fetchBatch: async () => null,
      fetchSingle: async (symbol) =>
        symbol === "AAPL" ? { symbol, price: 100 } : null,
    });
    expect(result).toEqual([{ symbol: "AAPL", price: 100 }, null]);
  });

  it("bounds fallback concurrency by processing groups sequentially", async () => {
    let active = 0;
    let peak = 0;
    const result = await resolveOrderedBatch<TestQuote>({
      symbols: ["A", "B", "C", "D", "E"],
      fetchBatch: async () => [],
      concurrency: 2,
      fetchSingle: async (symbol) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { symbol, price: 1 };
      },
    });
    expect(result).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("coalesces concurrent work and clears entries after resolution", async () => {
    const registry = createInFlightRegistry();
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<string>((resolve) => {
      release = () => resolve("ok");
    });
    const operation = vi.fn(async () => {
      calls += 1;
      return pending;
    });

    const first = registry.getOrCreate("same", operation);
    const second = registry.getOrCreate("same", operation);
    expect(second).toBe(first);
    expect(calls).toBe(0);
    release();
    await expect(first).resolves.toBe("ok");
    await expect(registry.getOrCreate("same", operation)).resolves.toBe("ok");
    expect(calls).toBe(2);
  });

  describe("buildSectorHeatmapCacheKey", () => {
    const base = {
      days: 5,
      allowKey: "*",
      meta: {} as Record<string, string>,
      symbols: ["AAPL", "MSFT"],
    };

    it("separates cache keys for different sector mappings", () => {
      const curated = buildSectorHeatmapCacheKey({
        ...base,
        meta: { AAPL: "Technology", MSFT: "Technology" },
      });
      const different = buildSectorHeatmapCacheKey({
        ...base,
        meta: { AAPL: "Technology", MSFT: "Healthcare" },
      });
      const none = buildSectorHeatmapCacheKey(base);
      expect(curated).not.toBe(different);
      expect(curated).not.toBe(none);
    });

    it("is invariant to symbol order and metadata map insertion order", () => {
      const a = buildSectorHeatmapCacheKey({
        ...base,
        symbols: ["AAPL", "MSFT"],
      });
      const b = buildSectorHeatmapCacheKey({
        ...base,
        symbols: ["MSFT", "AAPL"],
      });
      expect(a).toBe(b);
      // The raw map is canonicalized internally (sorted SYM:SECTOR pairs),
      // so insertion order never changes the key.
      const m1 = buildSectorHeatmapCacheKey({
        ...base,
        meta: { MSFT: "Tech", AAPL: "Tech" },
      });
      const m2 = buildSectorHeatmapCacheKey({
        ...base,
        meta: { AAPL: "Tech", MSFT: "Tech" },
      });
      expect(m1).toBe(m2);
    });

    it("treats absent metadata distinctly from present metadata", () => {
      const noMeta = buildSectorHeatmapCacheKey(base);
      const withMeta = buildSectorHeatmapCacheKey({
        ...base,
        meta: { AAPL: "Technology" },
      });
      expect(noMeta).not.toBe(withMeta);
    });
  });

  describe("buildHeatmapRows", () => {
    const chart = (symbol: string) => Promise.resolve({ symbol });

    it("skips getProfile entirely when every symbol has a curated tag", async () => {
      const getProfile = vi.fn(async () => null);
      const rows = await buildHeatmapRows({
        symbols: ["AAPL", "MSFT"],
        curated: { AAPL: "Technology", MSFT: "Technology" },
        getChart: chart,
        getProfile,
      });
      expect(rows.map((r) => r.sector)).toEqual(["Technology", "Technology"]);
      expect(getProfile).not.toHaveBeenCalled();
    });

    it("calls getProfile only for symbols missing a curated tag", async () => {
      const getProfile = vi.fn(async (symbol: string) => ({
        sector: "Energy",
      }));
      const rows = await buildHeatmapRows({
        symbols: ["AAPL", "MSFT", "XOM"],
        curated: { AAPL: "Technology" },
        getChart: chart,
        getProfile,
      });
      expect(rows).toEqual([
        { symbol: "AAPL", sector: "Technology", chart: { symbol: "AAPL" } },
        { symbol: "MSFT", sector: "Energy", chart: { symbol: "MSFT" } },
        { symbol: "XOM", sector: "Energy", chart: { symbol: "XOM" } },
      ]);
      expect(getProfile).toHaveBeenCalledTimes(2);
      expect(getProfile).toHaveBeenCalledWith("MSFT");
      expect(getProfile).toHaveBeenCalledWith("XOM");
    });

    it("leaves sector null when neither curated nor provider tags exist", async () => {
      const rows = await buildHeatmapRows({
        symbols: ["AAPL"],
        curated: {},
        getChart: chart,
        getProfile: async () => null,
      });
      expect(rows[0].sector).toBeNull();
    });

    it("preserves requested symbol order and bounds concurrency", async () => {
      let active = 0;
      let peak = 0;
      const rows = await buildHeatmapRows({
        symbols: ["A", "B", "C", "D", "E"],
        curated: {},
        concurrency: 2,
        getChart: async (symbol) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active -= 1;
          return { symbol };
        },
        getProfile: async () => null,
      });
      expect(rows.map((r) => r.symbol)).toEqual(["A", "B", "C", "D", "E"]);
      expect(peak).toBeLessThanOrEqual(2);
    });
  });

  it("clears rejected work so a later retry is not poisoned", async () => {
    const registry = createInFlightRegistry();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce("recovered");

    await expect(registry.getOrCreate("retry", operation)).rejects.toThrow(
      "provider down",
    );
    await expect(registry.getOrCreate("retry", operation)).resolves.toBe(
      "recovered",
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
