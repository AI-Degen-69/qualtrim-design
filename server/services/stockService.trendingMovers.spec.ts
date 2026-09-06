import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TrendingModule = typeof import("./stockService");

/** Fresh module per test — the movers cache and in-flight registry are module-scoped. */
async function freshModule(): Promise<TrendingModule> {
  vi.resetModules();
  return import("./stockService");
}

/** Minimal Response double; only `ok`/`status`/`json` are read by fetchJSONStatus. */
function fakeMoversResponse(rows: unknown[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => rows),
  } as unknown as Response;
}

function row(symbol: string, name = symbol) {
  return { symbol, name };
}

beforeEach(() => {
  // Must be set before the module import (stockService reads FMP_KEY at load).
  process.env.FMP_KEY = "test-fmp-key";
});

afterEach(() => {
  delete process.env.FMP_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchTrendingMovers", () => {
  it("de-dupes in gainers → most-active → losers order (case-insensitive)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("biggest-gainers"))
          return fakeMoversResponse([
            row("AAPL", "Apple"),
            row("MSFT", "Microsoft"),
          ]);
        if (url.includes("most-actives"))
          return fakeMoversResponse([
            row("msft", "Microsoft"),
            row("GOOGL", "Alphabet"),
          ]);
        if (url.includes("biggest-losers"))
          return fakeMoversResponse([
            row("aapl", "Apple"),
            row("NFLX", "Netflix"),
          ]);
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    const { fetchTrendingMovers } = await freshModule();
    const { entries, rateLimited } = await fetchTrendingMovers();

    expect(entries.map((e) => e.symbol)).toEqual([
      "AAPL",
      "MSFT",
      "GOOGL",
      "NFLX",
    ]);
    expect(rateLimited).toBe(false);
  });

  it("caps the merged list at 30 (gainers + actives fill the cap)", async () => {
    const makeRows = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => row(`${prefix}${i}`));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("biggest-gainers"))
          return fakeMoversResponse(makeRows("G", 15));
        if (url.includes("most-actives"))
          return fakeMoversResponse(makeRows("A", 15));
        if (url.includes("biggest-losers"))
          return fakeMoversResponse(makeRows("L", 15));
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    const { fetchTrendingMovers } = await freshModule();
    const { entries } = await fetchTrendingMovers();

    expect(entries).toHaveLength(30);
    expect(entries[0].symbol).toBe("G0");
    expect(entries[14].symbol).toBe("G14");
    expect(entries[15].symbol).toBe("A0");
    expect(entries[29].symbol).toBe("A14");
  });

  it("flags rate-limited when every movers endpoint returns 429 with no rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeMoversResponse([], 429)),
    );

    const { fetchTrendingMovers } = await freshModule();
    const { entries, rateLimited } = await fetchTrendingMovers();

    expect(entries).toEqual([]);
    expect(rateLimited).toBe(true);
  });

  it("does not flag rate-limited when partial data still arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("biggest-gainers")
          ? fakeMoversResponse([row("AAPL", "Apple")])
          : fakeMoversResponse([], 429),
      ),
    );

    const { fetchTrendingMovers } = await freshModule();
    const { entries, rateLimited } = await fetchTrendingMovers();

    expect(entries.map((e) => e.symbol)).toEqual(["AAPL"]);
    expect(rateLimited).toBe(false);
  });
});

describe("stockService.getTrendingUniverse", () => {
  it("returns the curated list without fetching when FMP is unconfigured", async () => {
    delete process.env.FMP_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { stockService } = await freshModule();
    const res = await stockService.getTrendingUniverse();

    expect(res.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns live movers when FMP responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("biggest-gainers"))
          return fakeMoversResponse([
            row("AAPL", "Apple"),
            row("MSFT", "Microsoft"),
          ]);
        if (url.includes("most-actives"))
          return fakeMoversResponse([row("GOOGL", "Alphabet")]);
        if (url.includes("biggest-losers"))
          return fakeMoversResponse([row("NFLX", "Netflix")]);
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    const { stockService } = await freshModule();
    const res = await stockService.getTrendingUniverse();

    expect(res.map((e) => e.symbol)).toEqual(["AAPL", "MSFT", "GOOGL", "NFLX"]);
  });

  it("backs off for the full rate-limit TTL after a 429 instead of re-firing after 15s", async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    const fetchSpy = vi.fn(async () => fakeMoversResponse([], 429));
    vi.stubGlobal("fetch", fetchSpy);

    const { stockService } = await freshModule();
    const first = await stockService.getTrendingUniverse();
    expect(first.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 20s exceeds the old 15s negative TTL; the 5-min 429 backoff must hold.
    await vi.advanceTimersByTimeAsync(20_000);
    const second = await stockService.getTrendingUniverse();
    expect(second.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
