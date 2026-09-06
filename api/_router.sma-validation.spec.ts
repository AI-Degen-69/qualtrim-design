import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { handleSmaDistances } from "./_router";

/**
 * Route-validation parity for `_router.js`'s SMA handler against the
 * Express twin in `server/routes/stock-data.ts` (which delegates to the
 * shared `parseSymbolsQuery`). Before this spec existed the serverless
 * copy silently diverged: it forwarded invalid tickers to Yahoo
 * per-symbol instead of 400-ing, emitted a different over-limit error,
 * kept duplicates, and produced a NaN windowSize for `?window=abc`.
 */

vi.mock("../server/services/apiUsageTracker.js", () => ({
  default: {
    recordCall: vi.fn(),
    recordRateLimit: vi.fn(),
    getProviderReport: vi.fn(() => ({})),
    hydrationPromise: Promise.resolve(),
  },
}));

vi.mock("yahoo-finance2", () => {
  const inst = {
    historical: vi.fn(async () => []),
    quote: vi.fn(async () => null),
  };
  const YF = class {
    constructor() {
      return inst;
    }
  };
  return { default: YF, __inst: inst };
});

function makeRes() {
  const statusCalls: number[] = [];
  let jsonBody: unknown;
  const res = {
    status(status: number) {
      statusCalls.push(status);
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
  } as unknown as Response;
  return { res, statusCalls, getJson: () => jsonBody };
}

const makeReq = (query: Record<string, unknown>) => ({ query }) as any;

describe("api/_router.js handleSmaDistances validation ↔ Express contract", () => {
  let historical: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = (await import("yahoo-finance2")) as any;
    historical = mod.__inst.historical;
    historical.mockClear();
  });

  it("rejects a missing symbols parameter like the Express twin", async () => {
    const { res, statusCalls, getJson } = makeRes();
    await handleSmaDistances(makeReq({}), res);
    expect(statusCalls).toEqual([400]);
    expect(getJson()).toEqual({ error: "symbols parameter required" });
    expect(historical).not.toHaveBeenCalled();
  });

  it("rejects invalid tickers with the canonical error body", async () => {
    const { res, statusCalls, getJson } = makeRes();
    await handleSmaDistances(makeReq({ symbols: "AAPL,BAD!" }), res);
    expect(statusCalls).toEqual([400]);
    expect(getJson()).toMatchObject({
      error: "invalid symbol parameter",
      symbols: ["BAD!"],
    });
    expect(historical).not.toHaveBeenCalled();
  });

  it("rejects invalid tickers supplied via repeated symbol params", async () => {
    const { res, statusCalls } = makeRes();
    await handleSmaDistances(makeReq({ symbol: ["AAPL", "1NVDA"] }), res);
    expect(statusCalls).toEqual([400]);
    expect(historical).not.toHaveBeenCalled();
  });

  it("emits the canonical over-limit error message", async () => {
    const suffix = (n: number) =>
      n < 26
        ? String.fromCharCode(65 + n)
        : String.fromCharCode(65 + Math.floor(n / 26) - 1) +
          String.fromCharCode(65 + (n % 26));
    const many = Array.from({ length: 51 }, (_, i) => `T${suffix(i)}`).join(
      ",",
    );
    const { res, statusCalls, getJson } = makeRes();
    await handleSmaDistances(makeReq({ symbols: many }), res);
    expect(statusCalls).toEqual([400]);
    expect(String((getJson() as { error: string }).error)).toContain(
      "Maximum is 50",
    );
    expect(historical).not.toHaveBeenCalled();
  });

  it("dedupes and case-folds before hitting Yahoo", async () => {
    const { res, statusCalls } = makeRes();
    await handleSmaDistances(
      makeReq({ symbol: ["aapl", "AAPL", "MSFT"] }),
      res,
    );
    expect(statusCalls).toEqual([]);
    expect(historical).toHaveBeenCalledTimes(2);
    const requested = historical.mock.calls.map((c) => c[0]);
    expect(requested).toContain("AAPL");
    expect(requested).toContain("MSFT");
  });

  it("survives ?window=abc and clamps the window to 200 closes", async () => {
    // 201 valid closes: a correct windowSize of 200 samples exactly 200
    // rows; the old NaN bug (slice(-NaN) → whole array) would sample 201.
    const closes = Array.from({ length: 201 }, (_, i) => ({
      close: 100 + i,
      date: `2026-0${(i % 9) + 1}-15`,
    }));
    historical.mockResolvedValue(closes);
    const { res, statusCalls, getJson } = makeRes();
    await handleSmaDistances(makeReq({ symbols: "AAPL", window: "abc" }), res);
    expect(statusCalls).toEqual([]);
    expect(
      Number.isFinite(
        Number(historical.mock.calls[0]?.[1]?.period1?.getTime()),
      ),
    ).toBe(true);
    const row = (getJson() as { rows: Array<{ sampleSize: number }> }).rows[0];
    expect(row.sampleSize).toBe(200);
  });
});
