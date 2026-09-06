import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockMetrics } from "../../shared/api";

// Mock yahoo-finance2 so getYahooMetrics never touches the network.
const mockQuoteSummary = vi.fn();
vi.mock("yahoo-finance2", () => {
  class MockYahooFinance {
    constructor(_opts?: unknown) {}
    quote = vi.fn();
    chart = vi.fn();
    search = vi.fn();
    quoteSummary = mockQuoteSummary;
  }
  return { default: MockYahooFinance };
});

// Mock the KV-backed cache so getMetrics never reads a stale cached payload.
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
vi.mock("../helpers/kvJsonCache", () => ({
  kvJsonCache: {
    get: mockCacheGet,
    set: mockCacheSet,
    __describeBackend: () => "local",
  },
}));

type StockService = typeof import("./stockService").stockService;

/** Minimal Response double with a scriptable .json(). */
function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn(async () => JSON.parse(body)),
  } as unknown as Response;
}

function freshService(): Promise<StockService> {
  vi.resetModules();
  return import("./stockService").then((m) => m.stockService);
}

/**
 * Build a fake Yahoo quoteSummary payload with real cash-flow + market cap
 * so getYahooMetrics computes pcf/pfcf/fcfYield and the derived metrics
 * come back as `available`.
 */
function yahooWithCashFlow(marketCap: number, fcf: number, ocf: number) {
  return {
    price: { marketCap: { raw: marketCap } },
    financialData: {
      freeCashflow: { raw: fcf },
      operatingCashflow: { raw: ocf },
      profitMargins: { raw: 0.1 },
      operatingMargins: { raw: 0.1 },
      grossMargins: { raw: 0.1 },
      currentRatio: { raw: 1.5 },
      quickRatio: { raw: 1.2 },
      debtToEquity: { raw: 0.5 },
    },
    defaultKeyStatistics: { payoutRatio: { raw: 0.2 } },
    summaryDetail: {},
  };
}

beforeEach(() => {
  process.env.FMP_KEY = "test-fmp-key";
  mockCacheGet.mockReset();
  mockCacheSet.mockReset();
  mockQuoteSummary.mockReset();
  // Cache miss by default → getMetrics runs the live fetch path.
  mockCacheGet.mockResolvedValue(null);
  mockQuoteSummary.mockResolvedValue(yahooWithCashFlow(1e9, 1e8, 2e8));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getMetrics availability classification", () => {
  it("marks roic as rateLimited when FMP key-metrics-ttm returns 429 but ratios has data", async () => {
    const svc = await freshService();
    // FMP: key-metrics-ttm → 429, ratios-ttm → 200 with data, scores → 200 empty
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("key-metrics-ttm"))
          return fakeResponse("{}", false, 429);
        if (url.includes("ratios-ttm"))
          return fakeResponse('[{"priceToSalesRatioTTM":1.5}]');
        return fakeResponse("[]");
      }),
    );

    const metrics: StockMetrics = await svc.getMetrics("TEST");
    expect(metrics.source).toBe("fmp");
    expect(metrics.availability?.roic).toBe("rateLimited");
    // ratios endpoint had data, so payoutDate is not gated
    expect(metrics.availability?.payoutDate).toBeUndefined();
  });

  it("marks roic as pro when FMP key-metrics-ttm returns 200 but empty (free-tier premium)", async () => {
    const svc = await freshService();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("key-metrics-ttm")) return fakeResponse("[]");
        if (url.includes("ratios-ttm"))
          return fakeResponse('[{"priceToSalesRatioTTM":1.5}]');
        return fakeResponse("[]");
      }),
    );

    const metrics: StockMetrics = await svc.getMetrics("TEST");
    expect(metrics.source).toBe("fmp");
    expect(metrics.availability?.roic).toBe("pro");
  });

  it("marks roic as notFound when FMP key-metrics-ttm returns 404", async () => {
    const svc = await freshService();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("key-metrics-ttm"))
          return fakeResponse("{}", false, 404);
        if (url.includes("ratios-ttm"))
          return fakeResponse('[{"priceToSalesRatioTTM":1.5}]');
        return fakeResponse("[]");
      }),
    );

    const metrics: StockMetrics = await svc.getMetrics("TEST");
    expect(metrics.source).toBe("fmp");
    expect(metrics.availability?.roic).toBe("notFound");
  });

  it("falls back to Yahoo and marks roic/payoutDate as pro when all FMP endpoints are empty", async () => {
    const svc = await freshService();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse("[]")), // every FMP endpoint empty
    );

    const metrics: StockMetrics = await svc.getMetrics("TEST");
    expect(metrics.source).toBe("yahoo");
    // Yahoo free tier never supplies roic/payoutDate → pro (paid-only)
    expect(metrics.availability?.roic).toBe("pro");
    expect(metrics.availability?.payoutDate).toBe("pro");
    // Yahoo-supplied derived metrics are available
    expect(metrics.availability?.pcf).toBe("available");
    expect(metrics.availability?.fcfYield).toBe("available");
  });
});
