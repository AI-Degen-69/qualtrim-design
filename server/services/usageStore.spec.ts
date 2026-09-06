import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalMemoryStore,
  VercelKvStore,
  __test__ as usageStoreTest,
  type BucketSnap,
  type TrackedProvider,
} from "./usageStore";

/** Two instantiations of every test below share a single fetch mock so
 *  the recorded URLs/bodies are easy to assert against. */
function mockFetch(response: () => Promise<unknown>) {
  return vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: response,
    text: async () => JSON.stringify(response),
    headers: init?.headers,
  }));
}

beforeEach(() => {
  // `resetStore()` (NOT `reset()`) — `reset()` is mirror-only in the
  // refactored apiUsageTracker; the spec exercises the store layer, so
  // we reset only the default-backing-store side here.
  usageStoreTest.resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LocalMemoryStore", () => {
  it("returns an empty bucket for an unseen (provider, day)", async () => {
    const s = new LocalMemoryStore();
    const snap = await s.load("fmp", "2026-08-04");
    expect(snap).toEqual({ timestamps: [], lastRateLimitAt: null });
  });

  it("round-trips a save → load", async () => {
    const s = new LocalMemoryStore();
    await s.save("fmp", "2026-08-04", {
      timestamps: [1, 2, 3],
      lastRateLimitAt: 9,
    });
    const loaded = await s.load("fmp", "2026-08-04");
    expect(loaded.timestamps).toEqual([1, 2, 3]);
    expect(loaded.lastRateLimitAt).toBe(9);
  });

  it("isolates buckets per provider per day", async () => {
    const s = new LocalMemoryStore();
    await s.save("fmp", "2026-08-04", {
      timestamps: [1],
      lastRateLimitAt: null,
    });
    await s.save("alphavantage", "2026-08-04", {
      timestamps: [2, 3],
      lastRateLimitAt: null,
    });
    await s.save("fmp", "2026-08-05", {
      timestamps: [4],
      lastRateLimitAt: null,
    });
    const f1 = await s.load("fmp", "2026-08-04");
    const a1 = await s.load("alphavantage", "2026-08-04");
    const f2 = await s.load("fmp", "2026-08-05");
    expect(f1.timestamps).toEqual([1]);
    expect(a1.timestamps).toEqual([2, 3]);
    expect(f2.timestamps).toEqual([4]);
  });

  it("returns defensive copies — mutating the caller's array doesn't corrupt the store", async () => {
    const s = new LocalMemoryStore();
    await s.save("fmp", "2026-08-04", {
      timestamps: [1, 2, 3],
      lastRateLimitAt: null,
    });
    const loaded = await s.load("fmp", "2026-08-04");
    loaded.timestamps.push(99);
    loaded.timestamps.length = 0;
    const reloaded = await s.load("fmp", "2026-08-04");
    expect(reloaded.timestamps).toEqual([1, 2, 3]);
  });

  it("pruneOlderThan deletes buckets strictly older than the cutoff day", async () => {
    const s = new LocalMemoryStore();
    await s.save("fmp", "2026-06-01", {
      timestamps: [1],
      lastRateLimitAt: null,
    });
    await s.save("fmp", "2026-06-15", {
      timestamps: [2],
      lastRateLimitAt: null,
    });
    await s.save("alphavantage", "2026-06-20", {
      timestamps: [3],
      lastRateLimitAt: 5,
    });
    await s.save("fmp", "2026-07-01", {
      timestamps: [4],
      lastRateLimitAt: null,
    });
    await s.save("yahoo", "2026-07-20", {
      timestamps: [5],
      lastRateLimitAt: null,
    });
    // Cutoff 2026-07-02 keeps the `day < cutoff` semantics straight: the
    // 2026-07-01 bucket is deleted because it is strictly earlier than
    // the 2026-07-02 cutoff, making the strict-less boundary unambiguous.
    const result = await s.pruneOlderThan("2026-07-02");
    expect(result).toEqual({ scannedCount: 5, prunedCount: 4 });
    expect(await s.load("fmp", "2026-06-01")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    expect(await s.load("fmp", "2026-06-15")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    expect(await s.load("alphavantage", "2026-06-20")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    expect(await s.load("fmp", "2026-07-01")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    // 2026-07-20 stays (above cutoff).
    const kept = await s.load("yahoo", "2026-07-20");
    expect(kept.timestamps).toEqual([5]);
  });

  it("pruneOlderThan returns 0/0 when nothing falls below the cutoff", async () => {
    const s = new LocalMemoryStore();
    await s.save("fmp", "2026-08-01", {
      timestamps: [1],
      lastRateLimitAt: null,
    });
    await s.save("fmp", "2026-08-02", {
      timestamps: [2],
      lastRateLimitAt: null,
    });
    const result = await s.pruneOlderThan("2026-01-01");
    expect(result).toEqual({ scannedCount: 2, prunedCount: 0 });
    expect((await s.load("fmp", "2026-08-01")).timestamps).toEqual([1]);
    expect((await s.load("fmp", "2026-08-02")).timestamps).toEqual([2]);
  });

  it("pruneOlderThan throws on a malformed cutoff so the call site surfaces the bug", async () => {
    const s = new LocalMemoryStore();
    await expect(s.pruneOlderThan("yesterday")).rejects.toThrow(/YYYY-MM-DD/);
    await expect(s.pruneOlderThan("2026-13-40")).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("VercelKvStore — happy path", () => {
  it("save() POSTs the Upstash SET command with the JSON-serialized bucket", async () => {
    const recorded: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        recorded.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: "OK" }),
          text: async () => '{"result":"OK"}',
        };
      }),
    );

    const s = new VercelKvStore({
      url: "https://kv.example/",
      token: "test-token",
    });
    await s.save("fmp", "2026-08-04", {
      timestamps: [100, 200],
      lastRateLimitAt: 50,
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toBe("https://kv.example/");
    expect(recorded[0].init?.method).toBe("POST");
    expect(
      (recorded[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test-token");
    const body = JSON.parse(recorded[0].init?.body as string);
    expect(body[0]).toBe("SET");
    expect(body[1]).toBe("vantage:usage:fmp:2026-08-04");
    expect(JSON.parse(body[2])).toEqual({
      timestamps: [100, 200],
      lastRateLimitAt: 50,
    });
  });

  it("load() POSTs the Upstash GET command and parses the JSON body", async () => {
    const sample: BucketSnap = { timestamps: [10, 20, 30], lastRateLimitAt: 7 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        // Upstash REST returns `{ result: "<json>" }` — the old
        // `[err, value]` parse made every GET hit look like a miss.
        json: async () => ({ result: JSON.stringify(sample) }),
        text: async () => JSON.stringify({ result: JSON.stringify(sample) }),
      })),
    );

    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("fmp", "2026-08-04");
    expect(loaded).toEqual(sample);
  });

  it("returns an empty bucket when the key does not exist (Upstash returns `{ result: null }`)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: null }),
        text: async () => '{"result":null}',
      })),
    );

    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("alphavantage", "2026-08-04");
    expect(loaded).toEqual({ timestamps: [], lastRateLimitAt: null });
  });

  it("treats an `{ error }` response as a miss (empty bucket) without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: "WRONGPASS invalid password" }),
        text: async () => '{"error":"WRONGPASS invalid password"}',
      })),
    );

    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("fmp", "2026-08-04");
    expect(loaded).toEqual({ timestamps: [], lastRateLimitAt: null });
  });

  it("falls back to an empty bucket when the stored value is malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: "not-json{{" }),
        text: async () => JSON.stringify({ result: "not-json{{" }),
      })),
    );
    // Should warn but not throw, and return [] / null.
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("yahoo", "2026-08-04");
    expect(loaded).toEqual({ timestamps: [], lastRateLimitAt: null });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("filters non-number timestamps out of the parsed payload", async () => {
    const real = { timestamps: [1, "bad", 3, null, 5], lastRateLimitAt: 9 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: JSON.stringify(real) }),
        text: async () => "",
      })),
    );
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("fmp", "2026-08-04");
    expect(loaded.timestamps).toEqual([1, 3, 5]);
    expect(loaded.lastRateLimitAt).toBe(9);
  });

  it("throws if instantiated without URL+token (constructor guard)", () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    expect(() => new VercelKvStore()).toThrow(/KV_REST_API_URL/);
  });
});

describe("VercelKvStore — failure modes", () => {
  it("returns [] / null and logs when KV responds non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("no body");
        },
        text: async () => "",
      })),
    );
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const loaded = await s.load("fmp", "2026-08-04");
    expect(loaded).toEqual({ timestamps: [], lastRateLimitAt: null });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("save() swallows non-OK responses (best-effort, never throws to caller)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({}),
        text: async () => "",
      })),
    );
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    await expect(
      s.save("fmp", "2026-08-04", { timestamps: [1], lastRateLimitAt: null }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("VercelKvStore — pruneOlderThan", () => {
  it("walks SCAN with cursor + filters by trailing :YYYY-MM-DD, then DELs in batches", async () => {
    // Stateful fetch mock: SCAN iterates cursor "0" → "3" → "0"; DEL
    // takes whatever keys we pass it.
    const scancalls: string[] = [];
    const delcalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        const cmd = body[0];
        if (cmd === "SCAN") {
          const cursor = body[1];
          scancalls.push(cursor);
          if (cursor === "0") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                result: [
                  "3",
                  [
                    "vantage:usage:fmp:2026-06-01",
                    "vantage:usage:fmp:2026-06-15",
                  ],
                ],
              }),
              text: async () => "",
            };
          }
          // cursor "3" — second page returns one more + closed cursor.
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: ["0", ["vantage:usage:fmp:2026-07-01"]],
            }),
            text: async () => "",
          };
        }
        if (cmd === "DEL") {
          const keys = body.slice(1);
          delcalls.push(...keys);
          return {
            ok: true,
            status: 200,
            json: async () => ({ result: keys.length }),
            text: async () => "",
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: "OK" }),
          text: async () => "",
        };
      }),
    );
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const result = await s.pruneOlderThan("2026-07-01");
    expect(result).toEqual({ scannedCount: 3, prunedCount: 2 });
    expect(scancalls).toEqual(["0", "3"]);
    // Only the two below-cutoff keys get DEL'd; the 2026-07-01 stays.
    expect(delcalls).toEqual([
      "vantage:usage:fmp:2026-06-01",
      "vantage:usage:fmp:2026-06-15",
    ]);
  });

  it("returns 0/0 + warns when SCAN responds non-OK (no DEL attempted)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal",
        json: async () => {
          throw new Error("no body");
        },
        text: async () => "",
      })),
    );
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    const result = await s.pruneOlderThan("2026-08-01");
    expect(result).toEqual({ scannedCount: 0, prunedCount: 0 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws on a malformed cutoff (call-site bug surfacing)", async () => {
    const s = new VercelKvStore({ url: "https://kv.example", token: "tok" });
    await expect(s.pruneOlderThan("not-a-date")).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("default-store factory (KV env detection)", () => {
  it("falls back to LocalMemoryStore when KV env vars are missing", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    usageStoreTest.reset();
    // After reset() the factory re-reads env → fresh LocalMemoryStore.
    const current = usageStoreTest.current();
    expect(current).toBeInstanceOf(LocalMemoryStore);
  });

  it("returns VercelKvStore when both KV env vars are present", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    usageStoreTest.resetStore();
    const current = usageStoreTest.current();
    expect(current).toBeInstanceOf(VercelKvStore);
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
  });

  it("silently falls back to LocalMemoryStore when only one KV env var is set", async () => {
    // The factory's outer `if (URL && TOKEN)` short-circuits when TOKEN
    // is missing — so construction is never attempted and no warn is
    // logged. This matches the documented env-var contract; the warn
    // path only fires for construction errors inside the try/catch.
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    usageStoreTest.resetStore();
    expect(usageStoreTest.current()).toBeInstanceOf(LocalMemoryStore);
    vi.stubEnv("KV_REST_API_URL", "");
  });

  it("constructs VercelKvStore via opts even when env vars are empty (test override path)", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    usageStoreTest.resetStore();
    // The `__test__.setStoreForTests` path uses the singleton as-is
    // (doesn't re-run the factory); the constructor-opts path can
    // deliver explicit url+token even when env is empty.
    const store = new VercelKvStore({
      url: "https://kv.example",
      token: "explicit-token",
    });
    expect(store).toBeInstanceOf(VercelKvStore);
  });
});
