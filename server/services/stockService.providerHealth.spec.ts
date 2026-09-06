import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderHealthEntry } from "../../shared/api";

// Mock yahoo-finance2 BEFORE any import of stockService so the probe run
// never touches the network. `mock`-prefixed names are the one exception
// Vitest allows in a hoisted vi.mock factory.
const mockQuote = vi.fn();
const mockChart = vi.fn();

vi.mock("yahoo-finance2", () => {
  class MockYahooFinance {
    constructor(_opts?: unknown) {}
    quote = mockQuote;
    chart = mockChart;
    search = vi.fn();
    quoteSummary = vi.fn();
  }
  return { default: MockYahooFinance };
});

type StockService = typeof import("./stockService").stockService;

/** Minimal Response double for `probeUrlStatus` (only status/ok/text are read). */
function fakeProbe(status: number, body = ""): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: vi.fn(async () => body),
  } as unknown as Response;
}

/** Stub a globally healthy FMP/AV (200, empty body) so only the Yahoo probes decide. */
function stubHealthyFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => fakeProbe(200, "[]")),
  );
}

/**
 * Fresh module per test — `getProviderHealth` caches its result for 5 min
 * and coalesces via an in-flight registry, so without `vi.resetModules()`
 * every test after the first would read the previous run's cache.
 */
async function freshService(): Promise<StockService> {
  vi.resetModules();
  const mod = await import("./stockService");
  return mod.stockService;
}

function entryOf(
  providers: ProviderHealthEntry[],
  provider: string,
  feature: string,
) {
  return providers.find(
    (p) => p.provider === provider && p.feature === feature,
  );
}

beforeEach(() => {
  // Must be set BEFORE the module import (stockService reads env at load).
  process.env.FMP_KEY = "test-fmp-key";
  process.env.AV_KEY = "test-av-key";
  mockQuote.mockReset();
  mockChart.mockReset();
});

afterEach(() => {
  delete process.env.FMP_KEY;
  delete process.env.AV_KEY;
  vi.unstubAllGlobals();
});

describe("stockService.getProviderHealth (full probe run)", () => {
  it("probes every provider/feature and stays healthy when only ok + known_restriction are present", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }, { close: 101 }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("financialmodelingprep.com")
          ? url.includes("batch-quote")
            ? fakeProbe(
                402,
                JSON.stringify({ "Error Message": "Restricted Endpoint" }),
              )
            : fakeProbe(200, JSON.stringify([{ price: 200 }]))
          : fakeProbe(
              200,
              JSON.stringify({ "Global Quote": { "05. price": "200" } }),
            ),
      ),
    );

    const stockService = await freshService();
    const res = await stockService.getProviderHealth();

    expect(res.providers.map((p) => `${p.provider}:${p.feature}`)).toEqual([
      "yahoo:quote",
      "yahoo:chart",
      "fmp:quote",
      "fmp:batch-quote",
      "alphavantage:quote",
    ]);
    expect(entryOf(res.providers, "yahoo", "quote")?.status).toBe("ok");
    expect(entryOf(res.providers, "yahoo", "chart")?.status).toBe("ok");
    expect(entryOf(res.providers, "fmp", "quote")?.status).toBe("ok");
    expect(entryOf(res.providers, "fmp", "batch-quote")?.status).toBe(
      "known_restriction",
    );
    expect(entryOf(res.providers, "alphavantage", "quote")?.status).toBe("ok");
    expect(res.healthy).toBe(true);
  });

  it("marks Yahoo quote down (timeout) without masking the healthy chart probe", async () => {
    mockQuote.mockRejectedValue(new Error("timeout"));
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }] });
    stubHealthyFetch();

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "yahoo", "quote")).toMatchObject({
      status: "down",
      detail: "timeout",
    });
    expect(entryOf(res.providers, "yahoo", "chart")?.status).toBe("ok");
    expect(res.healthy).toBe(false);
  });

  it("marks Yahoo chart down (timeout) without masking the healthy quote probe", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockRejectedValue(new Error("timeout"));
    stubHealthyFetch();

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "yahoo", "quote")?.status).toBe("ok");
    expect(entryOf(res.providers, "yahoo", "chart")).toMatchObject({
      status: "down",
      detail: "timeout",
    });
    expect(res.healthy).toBe(false);
  });

  it("distinguishes a chart-only outage (empty series) from a healthy quote probe", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [] });
    stubHealthyFetch();

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "yahoo", "quote")?.status).toBe("ok");
    expect(entryOf(res.providers, "yahoo", "chart")).toMatchObject({
      status: "down",
      detail: "empty chart",
    });
    expect(res.healthy).toBe(false);
  });

  it("treats an FMP 200-with-error-body as degraded (rate limit / bad key)", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("financialmodelingprep.com")
          ? fakeProbe(
              200,
              JSON.stringify({
                "Error Message": "You have exceeded the daily limit",
              }),
            )
          : fakeProbe(200, JSON.stringify({})),
      ),
    );

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "fmp", "quote")).toMatchObject({
      status: "degraded",
      detail: "You have exceeded the daily limit",
    });
    expect(res.healthy).toBe(false);
  });

  it("keeps healthy=true when the only problem is a paid-gated batch-quote (known_restriction)", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("financialmodelingprep.com")
          ? url.includes("batch-quote")
            ? fakeProbe(
                402,
                JSON.stringify({ "Error Message": "Restricted Endpoint" }),
              )
            : fakeProbe(200, JSON.stringify([{ price: 200 }]))
          : fakeProbe(
              200,
              JSON.stringify({ "Global Quote": { "05. price": "200" } }),
            ),
      ),
    );

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "fmp", "batch-quote")?.status).toBe(
      "known_restriction",
    );
    expect(res.healthy).toBe(true);
  });

  it("marks AlphaVantage down with a network-error detail when its probe throws", async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("alphavantage")) throw new TypeError("fetch failed");
        return fakeProbe(200, "[]");
      }),
    );

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "alphavantage", "quote")).toMatchObject({
      status: "down",
      detail: "network error",
    });
    expect(res.healthy).toBe(false);
  });

  it("reports FMP and AlphaVantage as not_configured when no keys are set", async () => {
    delete process.env.FMP_KEY;
    delete process.env.AV_KEY;
    mockQuote.mockResolvedValue({ regularMarketPrice: 200 });
    mockChart.mockResolvedValue({ quotes: [{ close: 100 }] });

    const res = await (await freshService()).getProviderHealth();

    expect(entryOf(res.providers, "fmp", "quote")?.status).toBe(
      "not_configured",
    );
    expect(entryOf(res.providers, "fmp", "batch-quote")?.status).toBe(
      "not_configured",
    );
    expect(entryOf(res.providers, "alphavantage", "quote")?.status).toBe(
      "not_configured",
    );
    expect(entryOf(res.providers, "yahoo", "quote")?.status).toBe("ok");
    expect(res.healthy).toBe(false);
  });
});
