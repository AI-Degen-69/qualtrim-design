import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the KV-backed JSON cache helper that promotes the
 * revenue-segmentation payload from in-process NodeCache to Vercel KV
 * when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are configured.
 *
 * The helper captures env vars at first-resolve time, so each `it`
 * stubs env FIRST and resets between runs via `__test__.resetSingleton`.
 * Mirrors the pattern in `usageStore.spec.ts`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

describe("kvJsonCache (KV-backed JSON cache helper)", () => {
  beforeEach(async () => {
    const { __test__ } = await import("./kvJsonCache");
    __test__.resetSingleton();
  });

  it("falls back to local NodeCache when KV env vars are unset", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    await kvJsonCache.set("demo:aapl", { v: 1 }, 60);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await kvJsonCache.get("demo:aapl")).toEqual({ v: 1 });
    expect(kvJsonCache.__describeBackend()).toBe("local");
  });

  it("writes through to KV when KV env vars are present, and reads hydrate from KV", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");

    // KV is empty for the first read; service-style write goes to local
    // + a SET command containing the JSON payload and the EX TTL flag.
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(JSON.stringify({ result: null })), // GET miss
      )
      .mockResolvedValueOnce(fakeResponse(JSON.stringify({ result: "OK" }))); // SET ack
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    expect(await kvJsonCache.get("demo:nvda")).toBeNull();
    await kvJsonCache.set("demo:nvda", { v: 42 }, 120);

    // First hit was KV GET (miss), second was KV SET with EX TTL.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const setBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body));
    expect(setBody[0]).toBe("SET");
    expect(setBody[1]).toBe("demo:nvda");
    expect(setBody[2]).toBe(JSON.stringify({ v: 42 }));
    expect(setBody).toContain("EX");
    expect(setBody).toContain(120);

    expect(kvJsonCache.__describeBackend()).toBe("kv");
  });

  it("parses the real Upstash `{ result }` envelope on GET hits (not an [err, value] array)", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    // A GET hit returns `{ result: "<json-string>" }` — the old parse
    // treated the response as an array and read arr[0] (undefined), so
    // every hit looked like a miss and the cross-instance cache never
    // hydrated. Assert the value actually comes back.
    const fetchSpy = vi.fn(async () =>
      fakeResponse(JSON.stringify({ result: JSON.stringify({ v: 99 }) })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    expect(await kvJsonCache.get<{ v: number }>("demo:aapl")).toEqual({
      v: 99,
    });
  });

  it("treats an `{ error }` response as a miss without throwing", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const fetchSpy = vi.fn(async () =>
      fakeResponse(JSON.stringify({ error: "WRONGPASS invalid password" })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    expect(await kvJsonCache.get("demo:aapl")).toBeNull();
  });

  it("hydrates local mirror from KV when local is empty (cold start)", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const fetchSpy = vi.fn(async () =>
      // Upstash REST returns `{ result: <json-string> }` for a GET hit.
      fakeResponse(JSON.stringify({ result: JSON.stringify({ v: 7 }) })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    const v = await kvJsonCache.get<{ v: number }>("demo:aapl");
    expect(v).toEqual({ v: 7 });
    // After hydration, a second read should NOT re-hit KV (warm mirror).
    const v2 = await kvJsonCache.get<{ v: number }>("demo:aapl");
    expect(v2).toEqual({ v: 7 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("swallows KV write errors so a flaky KV never breaks the request path", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    // SET throws (GET is never called because the test only writes).
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("KV network down"));
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    // The awaited set() resolves (KV error caught inside the helper),
    // so it never rejects out of the helper — that's the test.
    await expect(
      kvJsonCache.set("demo:aapl", { v: 1 }, 60),
    ).resolves.toBeUndefined();
    // Local mirror still has the value even though KV SET failed.
    expect(await kvJsonCache.get("demo:aapl")).toEqual({ v: 1 });
  });

  it("returns null on KV read errors instead of throwing", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const fetchSpy = vi.fn(async () => {
      throw new Error("KV timeout");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { kvJsonCache } = await import("./kvJsonCache");
    expect(await kvJsonCache.get("demo:aapl")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("still caches the 'no FMP key' payload for an hour across instances", async () => {
    // The route writes `{ rows: [], rateLimited: false, unavailable: true }`
    // with TTL 3600 when FMP_KEY is unset. KV presence here only affects
    // the write target — the TTL itself is route-level.
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(JSON.stringify({ result: "OK" }))),
    );

    const { kvJsonCache } = await import("./kvJsonCache");
    await kvJsonCache.set(
      "revenueSegmentation_AAPL_annual",
      { rows: [], rateLimited: false, unavailable: true },
      3600,
    );
    expect(await kvJsonCache.get("revenueSegmentation_AAPL_annual")).toEqual({
      rows: [],
      rateLimited: false,
      unavailable: true,
    });
  });

  it("keeps rate-limited payloads on a 5-min KV TTL (quota backoff)", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    // Only SET is called (no GET — `set` writes directly without
    // priming the local mirror). mock.calls[0] is the SET call body.
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(JSON.stringify({ result: "OK" })));
    vi.stubGlobal("fetch", fetchSpy);

    const { kvJsonCache } = await import("./kvJsonCache");
    await kvJsonCache.set(
      "revSeg_AAPL_annual",
      { rows: [], rateLimited: true, unavailable: false },
      300,
    );
    const setBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(setBody[0]).toBe("SET");
    expect(setBody[1]).toBe("revSeg_AAPL_annual");
    expect(setBody[3]).toBe("EX");
    expect(setBody[4]).toBe(300);
  });
});
