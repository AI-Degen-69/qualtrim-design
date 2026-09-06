/**
 * Tiny KV-backed JSON cache for one-shot route responses.
 *
 * Why this exists: every other route in `stockService` (and its sibling
 * `api/_router.js`) caches its payload in an in-process `NodeCache`. That
 * is fine for `pnpm dev` and for a single Vercel lambda, but on a
 * multi-region deploy each lambda cold start arrives empty and a user on
 * `lambda B` re-hits FMP for a payload `lambda A` already cached for an
 * hour. Once `KV_REST_API_URL` + `KV_REST_API_TOKEN` are present we
 * promote the cache to **Vercel KV (Upstash-compatible)** so:
 *
 *   1. Cold starts still read the previous lambda's cache key → no
 *      upstream call until KV expires the entry.
 *   2. Free-tier quota (`rateLimited` or HTTP-error-body responses) is
 *      honored across instances — if lambda A discovered the quota is
 *      exhausted, lambda B reads the same `rateLimited: true` payload
 *      from KV and skips the upstream call too, instead of racking up
 *      another 429 to FMP.
 *   3. The locked-premium fallback state persists across deploys /
 *      cold-starts, so the revenue card's "Segments" lock chip stays
 *      stable while the FMP daily window resets.
 *
 * Strategy (lazy hydration pattern, mirrored from `apiUsageTracker`):
 *
 *   get(key) → check local NodeCache first. miss → probe KV. KV hit
 *             → write through to local + return. miss + miss → null.
 *   set(key, value, ttl) → write local + fire-and-forget KV write.
 *
 * KV errors are swallowed + throttled-warned so a flaky KV never breaks
 * a request path; the local NodeCache keeps serving reads. The
 * `kvJsonCache` singleton picks `VercelKvJsonCache` automatically when
 * both env vars are present and falls back to `LocalJsonCache` when not
 * — so the import path stays identical for every consumer.
 *
 * `api/_router.js` ships a hand-written JS twin of this helper so its
 * Vercel serverless runtime (no TS imports across siblings) can mirror
 * the same behaviour without re-implementing the proxy.
 */

import NodeCache from "node-cache";

/* ── env snapshot ────────────────────────────────────────────────────── */

function hasKvEnv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/* ── throttled warning helpers ───────────────────────────────────────── */

const _warned: Record<string, number> = {};
function throttledWarn(key: string, ...args: unknown[]): void {
  const now = Date.now();
  if (_warned[key] && now - _warned[key] < 60_000) return;
  _warned[key] = now;
  // eslint-disable-next-line no-console
  console.warn(...args);
}

/* ── Upstash REST adapter ────────────────────────────────────────────── */

/**
 * Thin Upstash Redis-REST client. Returns `[err, value]` like the
 * Vercel/Upstash SDK would so error cells aren't a special case inside
 * `KvJsonCache`. Bound to a single baseUrl + token at construction
 * time; never reaches the network when `enabled` is false.
 */
class UpstashRestClient {
  readonly baseUrl: string;
  readonly token: string;
  constructor(url: string, token: string) {
    this.baseUrl = url;
    this.token = token;
  }
  get enabled(): boolean {
    return !!(this.baseUrl && this.token);
  }
  async exec(
    cmd: string,
    ...args: (string | number)[]
  ): Promise<[unknown, unknown]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([cmd, ...args]),
        signal: controller.signal,
      });
      if (!r.ok) {
        throw new Error(`KV ${cmd} failed: ${r.status} ${r.statusText}`);
      }
      // Upstash REST returns a single `{ result: ... }` object for a
      // one-command POST (or `{ error: "..." }` on failure) — NOT the
      // `[err, value]` tuple the older Vercel KV docs suggested. Parse
      // the real shape so GET hits actually hydrate instead of always
      // reading as a miss.
      const body = (await r.json()) as { result?: unknown; error?: unknown };
      if (body && typeof body === "object" && "error" in body) {
        return [body.error, null];
      }
      return [null, (body?.result ?? null) as unknown];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/* ── JSON cache interface ────────────────────────────────────────────── */

export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/* ── local baseline (no KV configured) ───────────────────────────────── */

class LocalJsonCache implements JsonCache {
  private readonly cache = new NodeCache({ stdTTL: 3600, maxKeys: 10000 });
  async get<T>(key: string): Promise<T | null> {
    const v = this.cache.get<T>(key);
    return v ?? null;
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, value, Math.max(1, ttlSeconds));
  }
  async del(key: string): Promise<void> {
    this.cache.del(key);
  }
}

/* ── KV-backed cache with local mirror (warm reads) ──────────────────── */

/**
 * Cap on the local mirror TTL when hydrating from KV. The KV entry's
 * own TTL is the source of truth, but the mirror needs a bound so a
 * short-TTL payload (e.g. the 5-min `rateLimited` lock) can't keep
 * serving stale state for the life of a long-lived process after KV
 * has expired it.
 */
const KV_HYDRATE_MIRROR_TTL = 3600;

/**
 * Reads: local → KV (hydrate local on hit) → null.
 * Writes: local sync, KV fire-and-forget (errors swallowed + throttled-logged).
 *
 * The mirror is intentionally one-way: writes hit KV too so the next
 * cold start hydrates from KV, but reads don't go back to KV on every
 * call (the throttle is the local mirror). This keeps warm-path latency
 * at a single in-process lookup while preserving durability for the
 * route-handler use cases (segmentation, premium-rate-limit state, etc.).
 */
class VercelKvJsonCache implements JsonCache {
  private readonly cache = new NodeCache({ stdTTL: 3600, maxKeys: 10000 });
  private readonly kv: UpstashRestClient;
  constructor(kv: UpstashRestClient) {
    this.kv = kv;
  }
  async get<T>(key: string): Promise<T | null> {
    const local = this.cache.get<T>(key);
    if (local !== undefined) return local;

    try {
      const [err, value] = await this.kv.exec("GET", key);
      if (err || value === null || value === undefined) return null;
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      // Hydrate the local mirror so subsequent reads in this process
      // don't re-hit KV. The KV entry's own TTL is the source of
      // truth, but the mirror gets a bounded cap (1h) so a short-TTL
      // payload like the 5-min `rateLimited` lock can't serve stale
      // for the life of a long-lived process after KV expires it.
      this.cache.set(key, parsed as T, KV_HYDRATE_MIRROR_TTL);
      return parsed as T;
    } catch (e) {
      throttledWarn(
        `kvJsonCache.get:${key}`,
        "[kvJsonCache] KV GET failed (returning null):",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, value, Math.max(1, ttlSeconds));
    try {
      await this.kv.exec(
        "SET",
        key,
        JSON.stringify(value),
        "EX",
        Math.max(1, ttlSeconds),
      );
    } catch (e) {
      throttledWarn(
        `kvJsonCache.set:${key}`,
        "[kvJsonCache] KV SET failed (local cache still updated):",
        e instanceof Error ? e.message : e,
      );
    }
  }
  async del(key: string): Promise<void> {
    this.cache.del(key);
    try {
      await this.kv.exec("DEL", key);
    } catch (e) {
      throttledWarn(
        `kvJsonCache.del:${key}`,
        "[kvJsonCache] KV DEL failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/* ── singleton ───────────────────────────────────────────────────────── */

/**
 * Lazy-init singleton. We *can't* construct `VercelKvJsonCache` at
 * import time because (a) tests use `vi.stubEnv` after import, and
 * (b) cold-start timing wants this to be a no-op when KV env vars are
 * missing. Falls back to `LocalJsonCache` automatically; `null` is
 * never returned.
 */
class KvJsonCacheSingleton implements JsonCache {
  private impl: JsonCache | null = null;
  private resolve(): JsonCache {
    if (this.impl !== null) return this.impl;
    if (hasKvEnv()) {
      try {
        const kv = new UpstashRestClient(
          process.env.KV_REST_API_URL!,
          process.env.KV_REST_API_TOKEN!,
        );
        if (kv.enabled) {
          this.impl = new VercelKvJsonCache(kv);
          return this.impl;
        }
      } catch (e) {
        throttledWarn(
          "kvJsonCache:init",
          "[kvJsonCache] Falling back to local cache:",
          e instanceof Error ? e.message : e,
        );
      }
    }
    this.impl = new LocalJsonCache();
    return this.impl;
  }
  async get<T>(key: string): Promise<T | null> {
    return this.resolve().get<T>(key);
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    return this.resolve().set<T>(key, value, ttlSeconds);
  }
  async del(key: string): Promise<void> {
    return this.resolve().del(key);
  }
  /** Test-only helper — lets specs inject a stub backend. */
  __setImplForTests(impl: JsonCache | null): void {
    this.impl = impl;
  }
  /** Test-only helper — reports which backend is currently active. */
  __describeBackend(): "kv" | "local" {
    return this.resolve() instanceof VercelKvJsonCache ? "kv" : "local";
  }
}

export const kvJsonCache: JsonCache & {
  __setImplForTests(impl: JsonCache | null): void;
  __describeBackend(): "kv" | "local";
} = new KvJsonCacheSingleton();

/* ── test-only export ────────────────────────────────────────────────── */

export const __test__ = {
  UpstashRestClient,
  VercelKvJsonCache,
  LocalJsonCache,
  KvJsonCacheSingleton,
  /**
   * Reset the singleton's backing impl between tests so a `vi.stubEnv`
   * of `KV_REST_API_URL` / `KV_REST_API_TOKEN` is reflected on the
   * next call. Mirrors the pattern in `usageStore.spec.ts`.
   */
  resetSingleton(): void {
    (kvJsonCache as KvJsonCacheSingleton).__setImplForTests(null);
  },
};
