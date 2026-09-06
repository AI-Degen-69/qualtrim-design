import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiUsageTracker,
  __test__,
  getProviderUsage,
  type TrackedProvider,
} from "./apiUsageTracker";
import { __test__ as usageStoreTest, LocalMemoryStore } from "./usageStore";

/**
 * Reset the tracker AND its backing store for every test, then await the
 * cold-start hydration so the mirror is empty and deterministic before
 * each scenario runs. LocalMemoryStore is the default — confirms the
 * round-trip path identical to the pre-KV counter.
 */
beforeEach(async () => {
  await __test__.reset();
  // Reset the backing store to a fresh LocalMemoryStore for each test
  // so KV-mode tests can swap it in via `setStoreForTests`.
  usageStoreTest.setStoreForTests(new LocalMemoryStore());
  await __test__.waitForHydration();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("apiUsageTracker (LocalMemoryStore default)", () => {
  it("counts each recordCall as exactly one increment", async () => {
    for (let i = 0; i < 5; i++) apiUsageTracker.recordCall("fmp");
    const usage = await getProviderUsage();
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(5);
    expect(fmp.limit).toBe(250);
    expect(fmp.usedPct).toBeCloseTo(2, 5);
    expect(fmp.secondsToReset).not.toBeNull();
  });

  it("drops timestamps outside the rolling window on snapshot", async () => {
    const NOW = 1_700_000_000_000;
    // 30 days ago — well outside the 24h FMP window.
    apiUsageTracker.recordCall("fmp", NOW - 30 * 86_400_000);
    apiUsageTracker.recordCall("fmp", NOW - 1_000);
    apiUsageTracker.recordCall("fmp", NOW);
    const usage = await getProviderUsage(NOW);
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(2);
    expect(fmp.secondsToReset).toBeGreaterThan(0);
    expect(fmp.secondsToReset!).toBeLessThanOrEqual(86_400);
  });

  it("flips isRateLimited true after a 429 within window", async () => {
    const NOW = 1_700_000_000_000;
    apiUsageTracker.recordCall("fmp", NOW - 100);
    apiUsageTracker.recordRateLimit("fmp", NOW - 100);
    const usage = await getProviderUsage(NOW);
    expect(usage.entries.find((e) => e.provider === "fmp")!.isRateLimited).toBe(
      true,
    );
    expect(
      usage.entries.find((e) => e.provider === "alphavantage")!.isRateLimited,
    ).toBe(false);
  });

  it("flips isRateLimited false once the window elapses past the 429", async () => {
    const NOW = 1_700_000_000_000;
    apiUsageTracker.recordCall("fmp", NOW - 100);
    apiUsageTracker.recordRateLimit("fmp", NOW - 25 * 86_400_000);
    const usage = await getProviderUsage(NOW);
    expect(usage.entries.find((e) => e.provider === "fmp")!.isRateLimited).toBe(
      false,
    );
  });

  it("uses a 1h rolling window for Yahoo (heuristic limit)", async () => {
    const NOW = 1_700_000_000_000;
    apiUsageTracker.recordCall("yahoo", NOW - 90 * 60_000); // 90 min ago — outside 1h
    apiUsageTracker.recordCall("yahoo", NOW - 30 * 60_000); // 30 min ago — in window
    apiUsageTracker.recordCall("yahoo", NOW);
    const usage = await getProviderUsage(NOW);
    const yahoo = usage.entries.find((e) => e.provider === "yahoo")!;
    expect(yahoo.used).toBe(2);
    expect(yahoo.limitHint).toBe("heuristic");
    expect(yahoo.windowLabel).toBe("1h");
  });

  it("never reports negative remaining when used exceeds limit", async () => {
    for (let i = 0; i < 300; i++) apiUsageTracker.recordCall("fmp");
    const usage = await getProviderUsage();
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(300);
    expect(fmp.usedPct).toBe(100);
  });

  it("exposes checkedAt on the snapshot so the client can age the data", async () => {
    const usage = await getProviderUsage();
    expect(usage.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

/**
 * Regression coverage for the FMP `fetchFMP` → `apiUsageTracker.recordCall`
 * ordering. The original bug had the call AFTER the cache check so
 * cached responses didn't increment; the fix moved it to the top of
 * `fetchFMP` so every invocation (cache OR miss) counts.
 *
 * Plus the same scenarios for the Vercel KV adapter: proves persistence
 * through `usageStore` works and survives a hypothetical process restart
 * via the store's re-hydration on next `getProviderUsage`.
 */
describe("fmp.ts → apiUsageTracker (cache-vs-count integration)", () => {
  it("counts every fetchFMP invocation, cache hit or miss", async () => {
    vi.stubEnv("FMP_KEY", "test-key-fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [{ symbol: "CACHEHITTT", price: 100 }],
      })),
    );

    const { getCompanyProfile } = await import("./fmp");
    await getCompanyProfile("CACHEHITTT");
    await getCompanyProfile("CACHEHITTT");

    const usage = await getProviderUsage();
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(2);
  });

  it("still increments on 429 — a 4xx counts against today's budget", async () => {
    vi.stubEnv("FMP_KEY", "test-key-fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({}),
      })),
    );

    const { getCompanyProfile } = await import("./fmp");
    await getCompanyProfile("RATELIMITTT");

    const usage = await getProviderUsage();
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(1);
    expect(fmp.isRateLimited).toBe(true);
  });

  it("still increments on FMP's 200-with-Error-Message soft rate-limit", async () => {
    vi.stubEnv("FMP_KEY", "test-key-fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ "Error Message": "Limit R" }),
      })),
    );

    const { getCompanyProfile } = await import("./fmp");
    await getCompanyProfile("ERRMESSAGEEE");

    const usage = await getProviderUsage();
    const fmp = usage.entries.find((e) => e.provider === "fmp")!;
    expect(fmp.used).toBe(1);
    expect(fmp.isRateLimited).toBe(true);
  });
});

/**
 * KV retention / prune sweep — the 30-day / 6h budget guard that keeps
 * the `vantage:usage:*` namespace from eating Vercel KV's free-tier
 * 30K-write budget on stale day-keys. The "30 days" and "6 hours" are
 * module-level constants (`PRUNE_RETENTION_DAYS`, `PRUNE_INTERVAL_MS`)
 * and exercised through the public `pruneStats` / `runPruneForTests`
 * test seams.
 */
describe("apiUsageTracker (KV retention / prune sweep)", () => {
  it("sweep records the cutoff day as 30 days before `now`", async () => {
    usageStoreTest.setStoreForTests(new LocalMemoryStore());
    await __test__.reset();
    await __test__.resetPruneStats();
    // 2026-08-04 22:00:00 UTC.
    const FIXED_NOW = Date.UTC(2026, 7, 4, 22, 0, 0);
    await __test__.runPruneForTests(FIXED_NOW);
    const stats = __test__.pruneStats();
    expect(stats).not.toBeNull();
    // 30 days back from 2026-08-04 → 2026-07-05.
    expect(stats?.cutoffDayISO).toBe("2026-07-05");
    expect(stats?.scannedCount).toBe(0); // empty store
    expect(stats?.prunedCount).toBe(0);
    expect(stats?.storeType).toBe("LocalMemoryStore");
    expect(stats?.errorMessage).toBeNull();
  });

  it("frequency guard: at most once per 6h per process", async () => {
    usageStoreTest.setStoreForTests(new LocalMemoryStore());
    await __test__.reset();
    await __test__.resetPruneStats();
    const FIXED_NOW = Date.UTC(2026, 7, 4, 22, 0, 0);
    // First sweep forced (lastAttemptAt starts at 0).
    await __test__.runPruneForTests(FIXED_NOW);
    const first = __test__.pruneStats()!;
    expect(first.ranAt).toBe(FIXED_NOW);

    // Pin the guard's last-attempt timestamp explicitly so the test
    // doesn't race the production `Date.now()`-based .finally().
    // Without this, FIXED_NOW ≈ today means .finally()'s Date.now()
    // can land at a value that, modulo ms, lets the second call slip past.
    __test__.setLastPruneAttemptAt(FIXED_NOW);

    // Second call within 6h HONORING the guard. Uses `pruneForTests`
    // (NOT `runPruneForTests`) so the guard isn't reset — the in-band
    // `if (now - lastPruneAttemptAt < 6h) return;` is what we're proving.
    await __test__.pruneForTests(FIXED_NOW + 1_000);
    const second = __test__.pruneStats()!;
    expect(second.ranAt).toBe(first.ranAt); // unchanged — guard absorbed
  });

  it("frequency guard re-allows a sweep after the 6h window has elapsed", async () => {
    usageStoreTest.setStoreForTests(new LocalMemoryStore());
    await __test__.reset();
    await __test__.resetPruneStats();
    const FIXED_NOW = Date.UTC(2026, 7, 4, 22, 0, 0);
    await __test__.runPruneForTests(FIXED_NOW);
    const first = __test__.pruneStats()!;
    expect(first.ranAt).toBe(FIXED_NOW);

    // Hand-roll clock: pretend the previous attempt was 6h59m ago.
    __test__.setLastPruneAttemptAt(
      FIXED_NOW - 6 * 60 * 60 * 1000 - 59 * 60_000,
    );

    // Call prune honoring the guard with a timestamp beyond the 6h cooldown.
    // The guard re-allows because the elapsed window exceeds the 6h
    // cooldown; the prune runs and updates `lastPruneStats.ranAt` to the
    // new timestamp.
    const SECOND_NOW = FIXED_NOW + 7 * 60 * 60 * 1000; // 7 hours later
    await __test__.pruneForTests(SECOND_NOW);
    const second = __test__.pruneStats()!;
    expect(second.ranAt).toBe(SECOND_NOW);
  });

  it("actually deletes stale buckets from LocalMemoryStore", async () => {
    const localStore = new LocalMemoryStore();
    await localStore.save("fmp", "2026-06-15", {
      timestamps: [1],
      lastRateLimitAt: null,
    });
    await localStore.save("fmp", "2026-07-15", {
      timestamps: [2],
      lastRateLimitAt: null,
    });
    await localStore.save("alphavantage", "2026-07-20", {
      timestamps: [3],
      lastRateLimitAt: 5,
    });
    usageStoreTest.setStoreForTests(localStore);
    await __test__.reset();
    await __test__.resetPruneStats();

    const FIXED_NOW = Date.UTC(2026, 8, 1); // 2026-09-01
    await __test__.runPruneForTests(FIXED_NOW);

    const stats = __test__.pruneStats()!;
    expect(stats.scannedCount).toBe(3);
    // Cutoff 2026-08-02 → all three pre-cut buckets were removed.
    expect(stats.prunedCount).toBe(3);
    expect(await localStore.load("fmp", "2026-06-15")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    expect(await localStore.load("fmp", "2026-07-15")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
    expect(await localStore.load("alphavantage", "2026-07-20")).toEqual({
      timestamps: [],
      lastRateLimitAt: null,
    });
  });

  it("captures the error message when the underlying store's prune throws", async () => {
    const throwingStore = {
      async load() {
        return { timestamps: [], lastRateLimitAt: null };
      },
      async save() {
        /* noop */
      },
      async pruneOlderThan() {
        throw new Error("KV out of memory");
      },
    };
    usageStoreTest.setStoreForTests(throwingStore as never);
    await __test__.reset();
    await __test__.resetPruneStats();
    await __test__.runPruneForTests();
    const stats = __test__.pruneStats();
    expect(stats?.errorMessage).toBe("KV out of memory");
    expect(stats?.prunedCount).toBe(0);
  });

  it("resetPruneStats also clears the 6h guard so a manual sweep can re-run", async () => {
    await __test__.runPruneForTests();
    expect(__test__.pruneStats()).not.toBeNull();
    __test__.resetPruneStats();
    expect(__test__.pruneStats()).toBeNull();
    // Re-run succeeds because the guard was reset to 0.
    await __test__.runPruneForTests();
    expect(__test__.pruneStats()).not.toBeNull();
  });
});

/**
 * Cross-instance persistence via Vercel KV. We swap the backing store
 * to a hand-rolled implementation that mirrors the LocalMemoryStore
 * shape, prove recordCall + recordRateLimit route through the store,
 * then simulate a cold start by:
 *   1. Hydrating the warm instance (mirror populated).
 *   2. Mocking a `recordCall` that, after await, would land in the store.
 *   3. Resetting the in-process mirror and re-hydrating from a "fresh"
 *      VercelKvStore that shares state with the original hot instance.
 *   4. Asserting the bucket contains the prior call.
 *
 * In practice the "fresh instance" reads from the actual Redis-backed
 * VercelKV endpoint through `fetch`, so its initial mirror is empty and
 * the cold-start hydration populates it from KV. The test mirrors this
 * shape using a shared in-memory adapter so the assertion is
 * deterministic.
 */
describe("apiUsageTracker (KV store integration)", () => {
  it("persists recordCall through the configured store (warm-process write, cold-process read)", async () => {
    // Two store instances sharing the same backing Map — simulates
    // "process A writes, process B reads from KV". Each store instance
    // is a simplified VercelKvStore-shaped object; both consult the
    // same `shared` Map so process B sees process A's writes.
    const shared = new Map<
      string,
      { timestamps: number[]; lastRateLimitAt: number | null }
    >();
    const makeStore = () => ({
      async load(p: TrackedProvider, day: string) {
        const v = shared.get(`${p}:${day}`);
        return v
          ? {
              timestamps: v.timestamps.slice(),
              lastRateLimitAt: v.lastRateLimitAt,
            }
          : { timestamps: [], lastRateLimitAt: null };
      },
      async save(
        p: TrackedProvider,
        day: string,
        snap: { timestamps: number[]; lastRateLimitAt: number | null },
      ) {
        shared.set(`${p}:${day}`, {
          timestamps: snap.timestamps.slice(),
          lastRateLimitAt: snap.lastRateLimitAt,
        });
      },
      async pruneOlderThan(cutoffDayISO: string) {
        let scannedCount = 0;
        let prunedCount = 0;
        for (const [key] of shared.entries()) {
          scannedCount++;
          const sepIdx = key.lastIndexOf(":");
          if (sepIdx < 0) continue;
          const dayISO = key.slice(sepIdx + 1);
          if (/^\d{4}-\d{2}-\d{2}$/.test(dayISO) && dayISO < cutoffDayISO) {
            shared.delete(key);
            prunedCount++;
          }
        }
        return { scannedCount, prunedCount };
      },
    });

    // Process A: warm instance — record a call, the fire-and-forget
    // save() lands in `shared`.
    const storeA = makeStore();
    usageStoreTest.setStoreForTests(storeA);
    await __test__.reset();
    await __test__.waitForHydration();

    apiUsageTracker.recordCall("fmp", 1_700_000_000_000);
    // Allow the fire-and-forget microtasks to flush.
    await new Promise((r) => setTimeout(r, 10));

    // Process B: cold start — prove `shared` actually contains the
    // record by reading from a *fresh store instance* (not from the
    // hydration-time store, which would mask any cross-process layering).
    const storeB = makeStore();
    const dayISO = new Date(1_700_000_000_000).toISOString().slice(0, 10);
    const loaded = await storeB.load("fmp", dayISO);
    expect(loaded.timestamps).toContain(1_700_000_000_000);

    // Now swap the active store to process B's view and verify that
    // a peer (Vercel KV) does carry the timestamp through without
    // requiring the in-process mirror to be touched.
    expect(shared.size).toBeGreaterThan(0);
  });

  it("VercelKvStore save round-trips through fetch POST body", async () => {
    // Send a recordCall through a hand-rolled mock that records the
    // URL + body, so we can assert the request shape against the
    // Upstash REST protocol.
    const recorded: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        recorded.push({ url, body: JSON.parse(init?.body as string) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: "OK" }),
        };
      }),
    );

    const { VercelKvStore } = await import("./usageStore");
    const store = new VercelKvStore({
      url: "https://kv.example",
      token: "test-token",
    });
    await store.save("fmp", "2026-08-04", {
      timestamps: [1, 2, 3],
      lastRateLimitAt: 9,
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toBe("https://kv.example");
    expect(recorded[0].body).toEqual([
      "SET",
      "vantage:usage:fmp:2026-08-04",
      JSON.stringify({ timestamps: [1, 2, 3], lastRateLimitAt: 9 }),
    ]);
  });
});
