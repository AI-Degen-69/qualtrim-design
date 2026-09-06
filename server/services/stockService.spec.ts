import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchJSON,
  isFmpErrorPayload,
  normalizeRevenueSegmentationRows,
} from "./stockService";

/** Minimal Response double with a scriptable .json(). */
function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn(async () => JSON.parse(body)),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchJSON (diagnostic classification)", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse('{"price":100}')),
    );
    await expect(
      fetchJSON("https://example.test/x", "probe", 1000),
    ).resolves.toEqual({ price: 100 });
  });

  it("returns null and classifies an HTTP failure as http_<status>", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse("{}", false, 402)),
    );
    await expect(
      fetchJSON("https://example.test/x", "probe", 1000),
    ).resolves.toBeNull();
  });

  it("returns null and classifies malformed JSON as invalid_json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse("{not json")),
    );
    await expect(
      fetchJSON("https://example.test/x", "probe", 1000),
    ).resolves.toBeNull();
  });

  it("returns null and classifies an abort as timeout", async () => {
    let abort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => {
      abort = reject;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          abort(err);
        });
        return aborted;
      }),
    );
    await expect(
      fetchJSON("https://example.test/x", "probe", 5),
    ).resolves.toBeNull();
  });

  it("returns null and classifies network failures as network_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      fetchJSON("https://example.test/x", "probe", 1000),
    ).resolves.toBeNull();
  });
});

describe("normalizeRevenueSegmentationRows (FMP revenue-product-segmentation)", () => {
  it("normalizes the nested `products` shape", () => {
    const raw = [
      {
        date: "2025-09-27",
        symbol: "AAPL",
        fiscalYear: "2025",
        period: "FY",
        reportedCurrency: "USD",
        products: [
          { name: "iPhone", revenue: 200e9 },
          { name: "Services", revenue: 100e9 },
        ],
      },
      {
        date: "2024-09-28",
        symbol: "AAPL",
        fiscalYear: "2024",
        period: "FY",
        products: [{ name: "iPhone", revenue: 190e9 }],
      },
    ];
    const rows = normalizeRevenueSegmentationRows(raw, "AAPL");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      symbol: "AAPL",
      fiscalYear: "2025",
      period: "FY",
      reportedCurrency: "USD",
      totalRevenue: 300e9,
    });
    expect(rows[0].products).toEqual([
      { name: "iPhone", revenue: 200e9 },
      { name: "Services", revenue: 100e9 },
    ]);
    // A period with a single product still sums correctly.
    expect(rows[1].totalRevenue).toBe(190e9);
  });

  it("normalizes the flat `data` shape with product/value aliases", () => {
    const raw = [
      {
        date: "2025-09-27",
        symbol: "AAPL",
        fiscalYear: "2025",
        data: [{ product: "iPhone", value: "200000000000" }],
      },
    ];
    const rows = normalizeRevenueSegmentationRows(raw, "AAPL");
    expect(rows[0].products).toEqual([
      { name: "iPhone", revenue: 200000000000 },
    ]);
    expect(rows[0].totalRevenue).toBe(200000000000);
  });

  it("falls back to the calendarYear / date-prefix when fiscalYear is absent", () => {
    const rows = normalizeRevenueSegmentationRows(
      [
        {
          date: "2023-10-01",
          calendarYear: "2024",
          products: [{ name: "A", revenue: 1 }],
        },
      ],
      "AAPL",
    );
    expect(rows[0].fiscalYear).toBe("2024");
    const fromDate = normalizeRevenueSegmentationRows(
      [{ date: "2023-10-01", products: [{ name: "A", revenue: 1 }] }],
      "AAPL",
    );
    expect(fromDate[0].fiscalYear).toBe("2023");
  });

  it("skips malformed product entries but keeps the period row", () => {
    const rows = normalizeRevenueSegmentationRows(
      [
        {
          date: "2025-09-27",
          products: [
            { name: "iPhone", revenue: 10 },
            { name: "", revenue: 5 }, // blank name → dropped
            { name: "Mac", revenue: "not-a-number" }, // NaN → dropped
          ],
        },
      ],
      "AAPL",
    );
    expect(rows[0].products).toEqual([{ name: "iPhone", revenue: 10 }]);
    expect(rows[0].totalRevenue).toBe(10);
  });

  it("returns an empty array for non-array payloads", () => {
    expect(normalizeRevenueSegmentationRows(null, "AAPL")).toEqual([]);
    expect(normalizeRevenueSegmentationRows(undefined, "AAPL")).toEqual([]);
    expect(normalizeRevenueSegmentationRows({ error: "boom" }, "AAPL")).toEqual(
      [],
    );
    expect(normalizeRevenueSegmentationRows("nope", "AAPL")).toEqual([]);
  });
});

describe("isFmpErrorPayload (200-with-error-body detection)", () => {
  it("detects the canonical FMP quota / bad-key error bodies", () => {
    expect(
      isFmpErrorPayload({
        "Error Message": "You have exceeded your daily limit",
      }),
    ).toBe(true);
    expect(isFmpErrorPayload({ error: "boom" })).toBe(true);
    expect(isFmpErrorPayload({ message: "invalid key" })).toBe(true);
  });

  it("returns false for data shapes", () => {
    expect(isFmpErrorPayload(null)).toBe(false);
    expect(isFmpErrorPayload(undefined)).toBe(false);
    expect(isFmpErrorPayload([])).toBe(false);
    expect(isFmpErrorPayload([{ date: "2025-09-27", products: [] }])).toBe(
      false,
    );
    expect(isFmpErrorPayload({ rows: [] })).toBe(false);
    expect(isFmpErrorPayload({ message: 42 })).toBe(false); // non-string message
  });
});
