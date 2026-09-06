/**
 * Per-provider API usage tracker — KV-backed.
 *
 * Reads / writes per-day rolling-window snapshots of upstream call
 * timestamps + a "last rate-limit" timestamp through a usage-store
 * abstraction that defaults to in-process memory and transparently
 * switches to Vercel KV when both `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` are present. This closes the cross-instance state
 * gap that caused "footer shows 0 while FMP dashboard shows 613".
 *
 * Self-contained: ALL store classes (`LocalMemoryStore`,
 * `VercelKvStore`), the `usageStore` singleton, and the tracker facade
 * live in *this* module. There is intentionally no `./usageStore`
 * sibling because Vercel's API bundler drops unresolved relative-import
 * paths inside serverless functions — keeping everything in one file
 * means the dependency graph is trivial and Vercel ships it whole.
 *
 * `server/services/usageStore.ts` is kept as a 1-line re-export shim
 * for backwards compatibility with the existing unit specs and the
 * dynamic-import paths in `api/_router.js`.
 *
 * Lifecycle:
 *   • Module init eagerly hydrates today's buckets for all three
 *     providers in parallel. Returns a stored `hydrationPromise` so
 *     tests can `await` a clean
 *     state boundary.
 *   • `recordCall(provider)` / `recordRateLimit(provider)` mutate the
 *     in-process mirror synchronously (so subsequent reads within the
 *     same lambda see the value immediately) and schedule a
 *     fire-and-forget KV write.
 *   • Usage snapshots are async and await hydration for tests/diagnostics.
 *
 * Free-tier budgets (per docs/data-providers.md):
 *   - FMP           250 calls / 24 h (documented)
 *   - AlphaVantage   25 calls / 24 h (documented)
 *   - Yahoo         200 calls / 1 h  (heuristic; never pushed to)
 */

/* ────────────────────────────  STORE LAYER  ──────────────────────────── */

export type TrackedProvider = "yahoo" | "fmp" | "alphavantage";

/** Snapshot of one provider's bucket — what the store reads/writes atomically. */
export interface BucketSnap {
  /** Epoch-ms call timestamps within the rolling window. */
  timestamps: number[];
  /** Latest observed 429 timestamp (epoch ms); cleared implicitly by window expiry. */
  lastRateLimitAt: number | null;
}

/** Async read/write interface — both adapters satisfy this contract. */
export interface UsageStore {
  load(provider: TrackedProvider, dayISO: string): Promise<BucketSnap>;
  save(
    provider: TrackedProvider,
    dayISO: string,
    snap: BucketSnap,
  ): Promise<void>;
  /**
   * Removes any persisted bucket whose day-key is strictly older than
   * `cutoffDayISO` (lexicographic `YYYY-MM-DD` comparison — works because
   * ISO dates are zero-padded). Returns counts so the caller can
   * surface stats. Never throws across the public surface — failures are
   * logged and surfaced as `{ scannedCount: 0, prunedCount: 0 }`.
   *
   * Throws synchronously ONLY on a malformed `cutoffDayISO` so the bug
   * surfaces at the call site rather than silently no-op'ing.
   */
  pruneOlderThan(
    cutoffDayISO: string,
  ): Promise<{ scannedCount: number; prunedCount: number }>;
}

/**
 * In-process adapter. Default. Holds the latest snapshot per
 * `(provider, day)` in a `Map` keyed by `${provider}:${dayISO}`.
 * Behaves exactly like the original in-process `buckets` map so the
 * unit tests don't have to differentiate between KV and local modes.
 */
export class LocalMemoryStore implements UsageStore {
  private readonly map = new Map<string, BucketSnap>();
  private static key(p: TrackedProvider, dayISO: string): string {
    return `${p}:${dayISO}`;
  }
  async load(p: TrackedProvider, dayISO: string): Promise<BucketSnap> {
    const found = this.map.get(LocalMemoryStore.key(p, dayISO));
    return found
      ? {
          timestamps: found.timestamps.slice(),
          lastRateLimitAt: found.lastRateLimitAt,
        }
      : { timestamps: [], lastRateLimitAt: null };
  }
  async save(
    p: TrackedProvider,
    dayISO: string,
    snap: BucketSnap,
  ): Promise<void> {
    this.map.set(LocalMemoryStore.key(p, dayISO), {
      timestamps: snap.timestamps.slice(),
      lastRateLimitAt: snap.lastRateLimitAt,
    });
  }
  /** Diagnostic peek — for tests only. */
  __peek(p: TrackedProvider, dayISO: string): BucketSnap | null {
    const v = this.map.get(LocalMemoryStore.key(p, dayISO));
    return v
      ? { timestamps: v.timestamps.slice(), lastRateLimitAt: v.lastRateLimitAt }
      : null;
  }
  /** Test seam — clears all keys. */
  __clear(): void {
    this.map.clear();
  }
  async pruneOlderThan(
    cutoffDayISO: string,
  ): Promise<{ scannedCount: number; prunedCount: number }> {
    if (!isValidDayISO(cutoffDayISO)) {
      throw new Error(
        `pruneOlderThan: cutoffDayISO must be YYYY-MM-DD, got ${cutoffDayISO}`,
      );
    }
    let scannedCount = 0;
    let prunedCount = 0;
    for (const [key] of this.map.entries()) {
      scannedCount++;
      // Keys are encoded as `${provider}:${dayISO}`; the trailing
      // YYYY-MM-DD is reliable as `key.slice(-10)` because every
      // tracked provider name is shorter than the date.
      const dayISO = key.length >= 10 ? key.slice(-10) : "";
      if (isValidDayISO(dayISO) && dayISO < cutoffDayISO) {
        this.map.delete(key);
        prunedCount++;
      }
    }
    return { scannedCount, prunedCount };
  }
}

/**
 * Vercel KV adapter. Uses the Upstash-style REST endpoint:
 *
 *   POST {KV_REST_API_URL}
 *   Authorization: Bearer {KV_REST_API_TOKEN}
 *   body: ["GET","vantage:usage:{provider}:{day}"]
 *      → returns { "result": "<value>" }   (or { "result": null } if missing)
 *   body: ["SET","vantage:usage:{provider}:{day}", "{json}"]
 *      → returns { "result": "OK" }
 *
 * Failures return { "error": "..." } — parsed as an [error, null] tuple
 * so callers keep their existing `if (err || value === null)` guards.
 *
 * Errors are swallowed and logged so a flaky KV never breaks a request
 * path — the in-process mirror remains the source of truth for THIS
 * lambda until the next cold-start hydration.
 */
export class VercelKvStore implements UsageStore {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(opts?: { url?: string; token?: string }) {
    this.baseUrl = opts?.url ?? process.env.KV_REST_API_URL ?? "";
    this.token = opts?.token ?? process.env.KV_REST_API_TOKEN ?? "";
    if (!this.baseUrl || !this.token) {
      throw new Error(
        "VercelKvStore requires both KV_REST_API_URL and KV_REST_API_TOKEN env vars (or constructor opts).",
      );
    }
  }

  private keyFor(p: TrackedProvider, dayISO: string): string {
    return `vantage:usage:${p}:${dayISO}`;
  }

  private async exec<T = unknown>(
    cmd: string,
    ...args: (string | number)[]
  ): Promise<[unknown, T | null]> {
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
      if (!r.ok)
        throw new Error(`KV ${cmd} failed: ${r.status} ${r.statusText}`);
      // Upstash REST returns a single `{ result: ... }` object for a
      // one-command POST (or `{ error: "..." }` on failure) — NOT the
      // `[err, value]` tuple. Parse the real shape so GET hits actually
      // hydrate instead of always reading as a miss.
      const body = (await r.json()) as { result?: unknown; error?: unknown };
      if (body && typeof body === "object" && "error" in body) {
        return [body.error, null];
      }
      return [null, (body?.result as T | null) ?? null];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async load(p: TrackedProvider, dayISO: string): Promise<BucketSnap> {
    try {
      const [err, value] = await this.exec<string | null>(
        "GET",
        this.keyFor(p, dayISO),
      );
      if (err || value === null)
        return { timestamps: [], lastRateLimitAt: null };
      const parsed = JSON.parse(value) as Partial<BucketSnap>;
      return {
        timestamps: Array.isArray(parsed.timestamps)
          ? parsed.timestamps.filter((n): n is number => typeof n === "number")
          : [],
        lastRateLimitAt:
          typeof parsed.lastRateLimitAt === "number"
            ? parsed.lastRateLimitAt
            : null,
      };
    } catch (e) {
      console.warn(
        "[usageStore] KV load failed (returning empty):",
        e instanceof Error ? e.message : e,
      );
      return { timestamps: [], lastRateLimitAt: null };
    }
  }

  async save(
    p: TrackedProvider,
    dayISO: string,
    snap: BucketSnap,
  ): Promise<void> {
    try {
      await this.exec("SET", this.keyFor(p, dayISO), JSON.stringify(snap));
    } catch (e) {
      console.warn(
        "[usageStore] KV save failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  /**
   * Walks every `vantage:usage:*` key via Upstash SCAN, filters to those
   * whose trailing `YYYY-MM-DD` is strictly less than `cutoffDayISO`,
   * then DELs them in batches of 100. Cursor iteration caps at 50
   * rounds as a runaway-safety so a misbehaving KV doesn't hang the
   * hydration chain forever.
   */
  async pruneOlderThan(
    cutoffDayISO: string,
  ): Promise<{ scannedCount: number; prunedCount: number }> {
    if (!isValidDayISO(cutoffDayISO)) {
      throw new Error(
        `pruneOlderThan: cutoffDayISO must be YYYY-MM-DD, got ${cutoffDayISO}`,
      );
    }
    let scannedCount = 0;
    const toDelete: string[] = [];
    let cursor = "0";
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    try {
      do {
        iterations++;
        if (iterations > MAX_ITERATIONS) {
          console.warn(
            "[usageStore] SCAN cursor did not converge; aborting prune",
          );
          break;
        }
        const [, batch] = await this.exec<[string, string[]]>(
          "SCAN",
          cursor,
          "MATCH",
          "vantage:usage:*",
          "COUNT",
          100,
        );
        if (!batch) break;
        cursor = batch[0] ?? "0";
        const keys = Array.isArray(batch[1]) ? batch[1] : [];
        for (const key of keys) {
          scannedCount++;
          const m = (key as string).match(/:(\d{4}-\d{2}-\d{2})$/);
          if (m && m[1] < cutoffDayISO) {
            toDelete.push(key);
          }
        }
      } while (cursor !== "0");
    } catch (e) {
      // SCAN failures are logged but do NOT swallow what we've already
      // scanned — return the partial counts so the diagnostic remains
      // honest about the attempt.
      console.warn(
        "[usageStore] pruneOlderThan SCAN loop failed:",
        e instanceof Error ? e.message : e,
      );
      return { scannedCount, prunedCount: 0 };
    }

    let prunedCount = 0;
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      try {
        await this.exec("DEL", ...chunk);
        prunedCount += chunk.length;
      } catch (e) {
        console.warn(
          `[usageStore] pruneOlderThan DEL batch failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    return { scannedCount, prunedCount };
  }
}

/**
 * Mutable backing store. Exposed via a delegating proxy so test code
 * can call `__test__.setStoreForTests(...)` to swap the active store
 * for the lifetime of the test, without the caller ever needing to
 * re-import the module.
 */
let _backing: UsageStore = createDefaultStore();

function createDefaultStore(): UsageStore {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      return new VercelKvStore();
    } catch (e) {
      console.warn(
        "[usageStore] Falling back to LocalMemoryStore:",
        e instanceof Error ? e.message : e,
      );
      return new LocalMemoryStore();
    }
  }
  return new LocalMemoryStore();
}

/**
 * The exported `usageStore` is a delegating proxy whose methods forward
 * to whichever adapter `_backing` currently points at.
 *
 *   await usageStore.load("fmp", day);                       // → _backing.load(...)
 *   await usageStore.save("fmp", day, snap);                  // → _backing.save(...)
 *   await usageStore.pruneOlderThan("2026-08-04");           // → _backing.pruneOlderThan(...)
 */
export const usageStore: UsageStore = {
  load: (provider, day) => _backing.load(provider, day),
  save: (provider, day, snap) => _backing.save(provider, day, snap),
  pruneOlderThan: (cutoffDayISO) => _backing.pruneOlderThan(cutoffDayISO),
};

/**
 * Validates that a string is a real YYYY-MM-DD calendar day — format
 * AND semantically valid (e.g. "2026-13-40" passes the regex but isn't
 * a real date). Used by both store adapters' `pruneOlderThan` so a
 * malformed cutoff surfaces at the call site rather than silently
 * no-op'ing.
 */
function isValidDayISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return false;
  // Round-trip: Date.parse then back to ISO + slice — guards against
  // "2026-02-30" silently rolling over to "2026-03-02".
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/* ────────────────────────────  TRACKER LAYER  ──────────────────────────── */

interface ProviderConfig {
  /** Hard-documented limit if known; informational if heuristic. */
  limit: number;
  /** Rolling window length in ms. */
  windowMs: number;
  /** Whether the limit is the documented free-tier cap or a heuristic. */
  limitHint: "documented" | "heuristic";
}

const PROVIDER_CONFIG: Record<TrackedProvider, ProviderConfig> = {
  fmp: { limit: 250, windowMs: 24 * 60 * 60 * 1000, limitHint: "documented" },
  alphavantage: {
    limit: 25,
    windowMs: 24 * 60 * 60 * 1000,
    limitHint: "documented",
  },
  // Yahoo: estimate, never push to it. Mark as heuristic so the pill
  // doesn't read as a hard cap.
  yahoo: { limit: 200, windowMs: 60 * 60 * 1000, limitHint: "heuristic" },
};

const ALL_PROVIDERS: TrackedProvider[] = ["fmp", "alphavantage", "yahoo"];

/**
 * In-process mirror — fast read path for THIS lambda instance. Populated
 * from `usageStore.load(...)` on cold start and re-populated lazily when
 * the day rolls over. Mutations are applied synchronously so the very
 * next `getProviderUsage` snapshot reflects them.
 */
interface Mirror {
  /** ISO `YYYY-MM-DD` (UTC). Resets at midnight UTC. */
  day: string;
  /** Timestamps within the rolling window for this provider on this day. */
  timestamps: number[];
  /** Most recent observed 429 timestamp (epoch ms); null when absent. */
  lastRateLimitAt: number | null;
}

const mirrors: Record<TrackedProvider, Mirror | null> = {
  fmp: null,
  alphavantage: null,
  yahoo: null,
};

function todayISO(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function pruneTimestamps(
  snap: BucketSnap,
  windowMs: number,
  now: number,
): void {
  const cut = now - windowMs;
  const kept = snap.timestamps.filter((t) => t >= cut);
  if (kept.length !== snap.timestamps.length) snap.timestamps = kept;
}

/* ── Eager hydration on module init ── */

let hydrationPromise: Promise<void> = (async () => {
  const today = todayISO();
  await Promise.all(
    ALL_PROVIDERS.map(async (p) => {
      try {
        const snap = await usageStore.load(p, today);
        // Don't clobber an already-populated mirror (a recordCall may
        // have landed concurrently with hydration).
        const cur = mirrors[p];
        if (
          cur &&
          cur.day === today &&
          (cur.timestamps.length > 0 || cur.lastRateLimitAt !== null)
        ) {
          return;
        }
        mirrors[p] = {
          day: today,
          timestamps: snap.timestamps.slice(),
          lastRateLimitAt: snap.lastRateLimitAt,
        };
      } catch (e) {
        console.warn(
          `[apiUsageTracker] hydrate ${p} failed:`,
          e instanceof Error ? e.message : e,
        );
        mirrors[p] = { day: today, timestamps: [], lastRateLimitAt: null };
      }
    }),
  );
  // After today's buckets are in, sweep KV for stale day-keys.
  // Frequency-guarded (max once per 6h per process) so the cost is
  // bounded; the SCAN runs only on cold starts / first load after a
  // long idle, not on every request.
  void pruneOldBucketsIfDue();
})();

/* ── KV retention policy ─────────────────────────────────────────────── */
//
// Free-tier Vercel KV is 30K writes / 300K reads per month. Without a
// retention sweep, every day-bucket that `recordCall` writes stays in
// KV forever; eventually we eat the 30K write budget on SCAN operations
// alone. Solution: prune buckets older than 30 days at cold start,
// guarded so the SCAN runs at most once per 6h per process.

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PRUNE_RETENTION_DAYS = 30;

/** Snapshot of the most recent retention sweep. */
export interface PruneStats {
  /** Epoch ms when this prune attempt finished. */
  ranAt: number;
  /** The cutoff used (YYYY-MM-DD). Buckets with day < this were removed. */
  cutoffDayISO: string;
  /** Total vantage:usage:* keys observed this run. */
  scannedCount: number;
  /** Keys actually deleted this run. */
  prunedCount: number;
  /** Resolved backing-store type at sweep time ("LocalMemoryStore" | "VercelKvStore"). */
  storeType: string;
  /** Non-null iff the sweep failed mid-flight (partial counts still returned). */
  errorMessage: string | null;
}

let lastPruneStats: PruneStats | null = null;
let lastPruneAttemptAt = 0;

/**
 * Retention sweep across the active backing store. Frequency-guarded so
 * it fires at most once per `PRUNE_INTERVAL_MS` per process; the in-process
 * guard is sufficient because cold-start hydration is the only call site.
 *
 * Never throws across the public surface — the lastPruneStats object
 * captures the failure mode (and its partial scannable count) so the
 * ?mode=retention diagnostic stays informative.
 */
async function pruneOldBucketsIfDue(now: number = Date.now()): Promise<void> {
  if (now - lastPruneAttemptAt < PRUNE_INTERVAL_MS) return;
  lastPruneAttemptAt = now;

  const cutoff = new Date(now - PRUNE_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const store = _backing;
  try {
    const { scannedCount, prunedCount } = await store.pruneOlderThan(cutoff);
    lastPruneStats = {
      ranAt: now,
      cutoffDayISO: cutoff,
      scannedCount,
      prunedCount,
      storeType: store.constructor.name,
      errorMessage: null,
    };
  } catch (e) {
    lastPruneStats = {
      ranAt: now,
      cutoffDayISO: cutoff,
      scannedCount: 0,
      prunedCount: 0,
      storeType: store.constructor.name,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

function scheduleFlush(provider: TrackedProvider): void {
  const m = mirrors[provider];
  if (!m) return;
  // Fire-and-forget — read, merge, write to avoid clobbering other instances' timestamps.
  // Pruning is anchored to the MAX timestamp in the merged set rather
  // than to wall-clock `Date.now()` so timestamps that arrived via the
  // store (peer instances, accumulated history) keep their relative
  // window validity. An empty merged set falls back to Date.now() so
  // a brand-new day still gets sane expiry semantics.
  (async () => {
    try {
      const stored = await usageStore.load(provider, m.day);
      const cfg = PROVIDER_CONFIG[provider];
      const merged = Array.from(
        new Set([...stored.timestamps, ...m.timestamps]),
      );
      const refNow = merged.length > 0 ? Math.max(...merged) : Date.now();
      const pruned = merged.filter((t) => t >= refNow - cfg.windowMs);
      // Keep the most recent rate-limit timestamp.
      const lastRateLimitAt =
        stored.lastRateLimitAt !== null && m.lastRateLimitAt !== null
          ? Math.max(stored.lastRateLimitAt, m.lastRateLimitAt)
          : (stored.lastRateLimitAt ?? m.lastRateLimitAt);
      await usageStore.save(provider, m.day, {
        timestamps: pruned,
        lastRateLimitAt,
      });
    } catch (e) {
      console.warn(
        `[apiUsageTracker] flush ${provider} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  })();
}

/**
 * Synchronously returns the mirror for `provider`, creating it on first
 * use and updating `day` when the calendar rolls over. NEVER replaces
 * the mirror object on day mismatch — the in-process timestamps we've
 * accumulated across day boundaries stay put, so callers from the
 * same process can't lose history by virtue of the wall clock drifting.
 *
 * Cross-process data is merged best-effort via a fire-and-forget lazy
 * hydrate so we still pick up timestamps from peer instances (Vercel KV)
 * without blocking the synchronous push path.
 */
function updateMirror(provider: TrackedProvider, now: number): Mirror {
  const today = todayISO(now);
  let m = mirrors[provider];
  if (!m) {
    // First time: create empty mirror and lazily hydrate from the store.
    m = { day: today, timestamps: [], lastRateLimitAt: null };
    mirrors[provider] = m;
    lazyHydrateFromStore(provider, today);
  } else if (m.day !== today) {
    // Day rolled over. KEEP the existing mirror (the in-process
    // timestamps we accumulated are still meaningful for read accuracy
    // within their rolling window). Update the day label so subsequent
    // reads can detect rollovers if they care, and fire a hydrate so
    // peer-instance data from the new day gets merged in.
    m.day = today;
    lazyHydrateFromStore(provider, today);
  }
  return m;
}

/**
 * Fire-and-forget async hydrate. Reads the day's bucket from
 * `usageStore`, unions those timestamps with the in-process mirror
 * (preserving local pushes), then prunes against the data-driven
 * rolling-window reference (max(merged timestamps, Date.now())) so we
 * don't drop older-but-still-valid entries that reach us from peers.
 *
 * No-op if the mirror has changed since the call was scheduled (e.g.
 * another day-rollover happened mid-await) — protects against
 * overwriting a fresher mirror with stale merged data.
 */
function lazyHydrateFromStore(provider: TrackedProvider, day: string): void {
  (async () => {
    try {
      const snap = await usageStore.load(provider, day);
      const cur = mirrors[provider];
      if (!cur || cur.day !== day) return;
      const cfg = PROVIDER_CONFIG[provider];
      const allTs = [...snap.timestamps, ...cur.timestamps];
      const refNow = allTs.length > 0 ? Math.max(...allTs) : Date.now();
      const cut = refNow - cfg.windowMs;
      const merged = Array.from(new Set(allTs)).filter((t) => t >= cut);
      const lastRateLimit =
        snap.lastRateLimitAt !== null && cur.lastRateLimitAt !== null
          ? Math.max(snap.lastRateLimitAt, cur.lastRateLimitAt)
          : (snap.lastRateLimitAt ?? cur.lastRateLimitAt);
      cur.timestamps = merged;
      if (lastRateLimit !== null) cur.lastRateLimitAt = lastRateLimit;
    } catch (e) {
      console.warn(
        `[apiUsageTracker] lazyHydrate ${provider}/${day} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  })();
}

export const apiUsageTracker = {
  /**
   * Increment the per-day call count. Synchronous against the in-process
   * mirror so the very next `getProviderUsage` sees the new entry;
   * fire-and-forget only the cross-process store write. Day rollovers
   * update `m.day` in place and jest-spawn a lazy hydrate without
   * blocking the caller.
   */
  recordCall(provider: TrackedProvider, now: number = Date.now()): void {
    const cfg = PROVIDER_CONFIG[provider];
    const m = updateMirror(provider, now);
    m.timestamps.push(now);
    pruneTimestamps(m, cfg.windowMs, now);
    scheduleFlush(provider);
  },
  /**
   * Mark the provider as currently rate-limited. Same sync-mirror + async
   * store-flush shape as recordCall.
   */
  recordRateLimit(provider: TrackedProvider, now: number = Date.now()): void {
    const m = updateMirror(provider, now);
    m.lastRateLimitAt = now;
    scheduleFlush(provider);
  },
};

const PROVIDER_LABELS: Record<TrackedProvider, string> = {
  fmp: "FMP",
  alphavantage: "AlphaVantage",
  yahoo: "Yahoo Finance",
};

function buildEntry(provider: TrackedProvider, now: number) {
  const cfg = PROVIDER_CONFIG[provider];
  const m = mirrors[provider];
  const snap: BucketSnap = m
    ? { timestamps: m.timestamps.slice(), lastRateLimitAt: m.lastRateLimitAt }
    : { timestamps: [], lastRateLimitAt: null };
  // Always prune timestamps against the rolling window before calculating used,
  // regardless of whether the day matches — ensures stale prior-day entries
  // cannot affect the reported count.
  pruneTimestamps(snap, cfg.windowMs, now);

  const used = snap.timestamps.length;
  const remaining = Math.max(0, cfg.limit - used);
  const usedPct = Math.min(100, (used / cfg.limit) * 100);
  const oldestInWindow = snap.timestamps[0] ?? null;
  const resetsAtMs =
    oldestInWindow !== null ? oldestInWindow + cfg.windowMs : null;
  return {
    provider,
    label: PROVIDER_LABELS[provider],
    used,
    limit: cfg.limit,
    usedPct,
    remaining,
    windowMs: cfg.windowMs,
    windowLabel: cfg.windowMs === 24 * 60 * 60 * 1000 ? "24h" : "1h",
    resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : null,
    secondsToReset: resetsAtMs
      ? Math.max(0, Math.floor((resetsAtMs - now) / 1000))
      : null,
    isRateLimited:
      snap.lastRateLimitAt !== null &&
      now - snap.lastRateLimitAt < cfg.windowMs,
    lastRateLimitAt: snap.lastRateLimitAt
      ? new Date(snap.lastRateLimitAt).toISOString()
      : null,
    limitHint: cfg.limitHint,
  };
}

/**
 * Return the per-provider usage snapshot. Each entry is ordered so the
 * documented free-tier providers (FMP / AV) come first — the
 * interpretive pill leads with a true count.
 *
 * Async because the tracker awaits cold-start KV hydration on
 * serverless cold starts; first request after a cold start costs ~50ms
 * for the cross-instance hydrate, subsequent ones are sync.
 */
export async function getProviderUsage(
  now: number = Date.now(),
  opts: { awaitHydration?: boolean } = {},
): Promise<{
  checkedAt: string;
  entries: ReturnType<typeof buildEntry>[];
}> {
  if (opts.awaitHydration !== false) {
    await hydrationPromise;
  }
  return {
    checkedAt: new Date(now).toISOString(),
    entries: [
      buildEntry("fmp", now),
      buildEntry("alphavantage", now),
      buildEntry("yahoo", now),
    ],
  };
}

/* ── Test seams ── */

export const __test__ = {
  /**
   * Reset in-process mirrors only. Does NOT touch the backing
   * `usageStore` — tests that swap stores (`setStoreForTests(...)`)
   * need their swap to survive a `reset()` so they can prove
   * cross-instance persistence. Callers that want BOTH mirror and
   * store reset should chain `await __test__.reset()` followed by
   * `__test__.resetStore()`.
   *
   * `VI. unstubAllEnvs()` in afterEach between tests will already
   * reset env vars to their pre-stub state, so test specs that
   * `vi.stubEnv("KV_REST_API_URL", "https://…")` between runs
   * should chain `__test__.resetStore()` to pick up the change.
   */
  async reset(now: number = Date.now()): Promise<void> {
    const today = todayISO(now);
    for (const key of ALL_PROVIDERS) {
      mirrors[key] = { day: today, timestamps: [], lastRateLimitAt: null };
    }
  },
  configSnapshot(): Record<TrackedProvider, ProviderConfig> {
    return JSON.parse(JSON.stringify(PROVIDER_CONFIG));
  },
  /** Resolve once module-init hydration finishes. */
  waitForHydration(): Promise<void> {
    return hydrationPromise;
  },
  /** Diagnostic: read a provider's mirror without triggering hydration. */
  peekMirror(provider: TrackedProvider): Mirror | null {
    const m = mirrors[provider];
    return m
      ? {
          day: m.day,
          timestamps: m.timestamps.slice(),
          lastRateLimitAt: m.lastRateLimitAt,
        }
      : null;
  },
  /** Replace the active backing store for tests. */
  setStoreForTests(s: UsageStore): void {
    _backing = s;
  },
  /** Return the active backing store (used by `?mode=status` route). */
  current(): UsageStore {
    return _backing;
  },
  /** Reset the backing store to the env-detected default. */
  resetStore(): void {
    _backing = createDefaultStore();
  },
  /** Diagnostic: last retention-sweep result, or `null` if never run. */
  pruneStats(): PruneStats | null {
    return lastPruneStats ? { ...lastPruneStats } : null;
  },
  /** Test seam — clears the in-process prune stats + resets the 6h guard to 0. */
  resetPruneStats(): void {
    lastPruneStats = null;
    lastPruneAttemptAt = 0;
  },
  /** Test seam — directly manipulate the frequency-guard's last-attempt timestamp. */
  setLastPruneAttemptAt(ms: number): void {
    lastPruneAttemptAt = ms;
  },
  /**
   * Test seam — force-runs the retention sweep regardless of the 6h
   * guard, so specs can verify the prune path without waiting. Real
   * code paths should rely on hydration → pruneOldBucketsIfDue instead.
   */
  runPruneForTests(now: number = Date.now()): Promise<void> {
    lastPruneAttemptAt = 0;
    return pruneOldBucketsIfDue(now).finally(() => {
      // Restore the post-run timestamp so subsequent in-band calls respect
      // the 6h guard after the forced test sweep completes.
      lastPruneAttemptAt = Date.now();
    });
  },
  /**
   * Test seam — invokes the retention sweep HONORING the 6h guard.
   * Lets specs verify the in-band absorption behavior end-to-end
   * (`runPruneForTests` resets the guard, which would mask it).
   */
  pruneForTests(now: number = Date.now()): Promise<void> {
    return pruneOldBucketsIfDue(now);
  },
};
