import { defaultWatchlist } from "./mockData";

/**
 * Per-symbol entry inside a watchlist. `name` is the optional display
 * fallback — system lists seed this from the curated universe; user lists
 * populate it lazily once `useValidateSymbols` resolves a profile so the
 * earnings sidebar can show "Apple Inc." instead of "AAPL".
 *
 * Storing `name?` per symbol (vs. a sidecar lookup map) keeps reorders
 * cheap: dragging a row to a new position is just an array splice, no key
 * remapping required.
 */
export interface WatchlistSymbolEntry {
  symbol: string;
  name?: string;
}

/**
 * One watchlist as persisted in localStorage and surfaced by
 * `useWatchlists()`. The seeded `Market Leaders` list carries the
 * `isSystem: true` flag and CANNOT be renamed or deleted — UI level + this
 * layer both enforce that (silent no-op + log in dev) so a buggy caller
 * can't accidentally drop the curated universe.
 *
 * `version` is the schema version for migration forward. Bumping the
 * version triggers a migration hook in `loadWatchlists()`.
 */
export interface Watchlist {
  id: string;
  name: string;
  symbols: WatchlistSymbolEntry[];
  isSystem: boolean;
  createdAt: number;
  version: 1;
}

const STORAGE_KEY = "vantage.watchlists";
const ACTIVE_KEY = "vantage.watchlists.activeId";
const SCHEMA_VERSION = 1 as const;
const SYSTEM_LIST_ID = "system.default";
const SYSTEM_LIST_NAME = "Market Leaders";

/**
 * Build the seed system list from the curated `defaultWatchlist` curatorial
 * universe. `createdAt: 0` so sort-by-recent always places user-created lists
 * above the seeded one.
 */
function makeSystemWatchlist(): Watchlist {
  return {
    id: SYSTEM_LIST_ID,
    name: SYSTEM_LIST_NAME,
    symbols: defaultWatchlist.map((t) => ({ symbol: t.symbol, name: t.name })),
    isSystem: true,
    createdAt: 0,
    version: SCHEMA_VERSION,
  };
}

// ── SSR safety ────────────────────────────────────────────────────────────
//
// `localStorage` doesn't exist in Node-side renders / SSR / tests. All
// public functions short-circuit to safe defaults when `typeof window`
// is undefined so the page can mount during build-time prerenders without
// crashing.

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

// ── IO ────────────────────────────────────────────────────────────────────

/**
 * Read watchlists from localStorage. Returns the seed system list when
 * storage is empty (first-ever load) or corrupted JSON.
 *
 * Migration: any record at an older `version` falls back to its seeded
 * defaults — we don't attempt a live upgrade because the schema happened
 * to break once before with a different shape, and a future-proof
 * upgrade path can fill in here.
 */
export function loadWatchlists(): Watchlist[] {
  if (!hasStorage()) return [makeSystemWatchlist()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [makeSystemWatchlist()];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [makeSystemWatchlist()];
    const lists = parsed
      .filter(isWatchlist)
      .filter((l) => l.version === SCHEMA_VERSION);
    return ensureSystemPresent(lists);
  } catch {
    return [makeSystemWatchlist()];
  }
}

function isWatchlist(x: unknown): x is Watchlist {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.isSystem === "boolean" &&
    typeof o.createdAt === "number" &&
    Array.isArray(o.symbols)
  );
}

/**
 * Guarantee the seeded system list is always present. If a user nukes
 * localStorage (or migrates from a version that didn't have it), we
 * re-seed the system list at the end of the array.
 */
function ensureSystemPresent(lists: Watchlist[]): Watchlist[] {
  const hasSystem = lists.some((l) => l.isSystem);
  return hasSystem ? lists : [...lists, makeSystemWatchlist()];
}

/**
 * Read the active watchlist ID. Falls back to the first system list
 * (the seed) when nothing is set yet — typically the only first-load case.
 */
export function loadActiveWatchlistId(lists: Watchlist[]): string {
  if (!hasStorage()) return lists[0]?.id ?? SYSTEM_LIST_ID;
  const raw = window.localStorage.getItem(ACTIVE_KEY);
  if (raw && lists.some((l) => l.id === raw)) return raw;
  return lists[0]?.id ?? SYSTEM_LIST_ID;
}

/**
 * Atomic-ish write: clear the storage first, write the new payload so a
 * mid-write crash doesn't leave partial JSON. Browser `localStorage.setItem`
 * is sync within a tab's main thread.
 */
export function saveWatchlists(lists: Watchlist[]): void {
  if (!hasStorage()) return;
  try {
    const ensured = ensureSystemPresent(lists);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ensured));
    // Tell the in-memory subscription source so `useSyncExternalStore`
    // consumers (Watchlists page, alert engine, ...) re-render in the
    // SAME tab without waiting for a route change. The prior design wrote
    // localStorage and trusted `useEffect([lists])` on every consumer
    // to redrive an apply — that was the divergence the Provider lift
    // fixes. Now the write-side is responsible for the notify.
    setNextSnapshot({
      lists: ensured,
      activeId: getCurrentSnapshot().activeId,
    });
  } catch (e) {
    // Quota exceeded / private-mode guard. Dev-only console hint; the
    // UI keeps working in memory for the rest of the session.
    if (import.meta.env.DEV) {
      console.warn("[watchlistStore] save failed", e);
    }
  }
}

export function saveActiveWatchlistId(id: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
    setNextSnapshot({ lists: getCurrentSnapshot().lists, activeId: id });
  } catch {
    // ignore
  }
}

// ── CRUD with system protection ──────────────────────────────────────────

/**
 * `Result<T>` is a discriminated union for ops that can fail cleanly via
 * the system-list guard without throwing. UI renderers turn this into a
 * toast / banner.
 *
 * The union is split across two `&` intersections so TS narrows on
 * `r.ok === true` / `r.ok === false` reliably even when the consumer is
 * inferred (e.g. from a callback return). Some sites in this codebase
 * pass `Result<Watchlist>` through `useCallback`-returned closures and
 * the inferer occasionally collapses the union — the explicit literal
 * types here dodge that by being unambiguous per-branch.
 */
export type Result<T> =
  | { ok: true; value: T; reason?: undefined }
  | { ok: false; reason: string; value?: undefined };

/**
 * Test/consumer helper — narrows a Result to its success branch or
 * throws. Lets spec files do `const value = unwrap(createWatchlist(...))`
 * without scattering `if (!r.ok) throw ...` guards.
 */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap on failed Result: ${r.reason}`);
}

/**
 * Test/consumer helper — returns the success value or `fallback` if the
 * result is a failure. Safe alternative when callers want to silently
 * degrade on system-list rejections in non-test code paths.
 */
export function unwrapOr<T>(r: Result<T>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * Generate a stable ID for a new user list. Uses `crypto.randomUUID()` when
 * available (modern browsers + Node 19+); falls back to a timestamped
 * pseudo-UUID for older runtimes so the page never throws.
 */
export function newWatchlistId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // RFC4122-ish v4 fallback — no PII entropy requirements here.
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a new user watchlist. Empty symbol array — use `addSymbols` to
 * populate. Refuses to create a list whose name collides with an existing
 * one (the active or any other) so the switcher never has two ambiguous
 * chips that say "Tech".
 */
export function createWatchlist(
  lists: Watchlist[],
  name: string,
  initial: WatchlistSymbolEntry[] = [],
): Result<Watchlist> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "empty_name" };
  if (lists.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, reason: "duplicate_name" };
  }
  const watchlist: Watchlist = {
    id: newWatchlistId(),
    name: trimmed,
    symbols: dedupeSymbols(initial),
    isSystem: false,
    createdAt: Date.now(),
    version: SCHEMA_VERSION,
  };
  return { ok: true, value: watchlist };
}

/**
 * Delete a list. Refuses when the target is the seeded system list.
 * Returns the new array; callers wire the result to `saveWatchlists`.
 */
export function deleteWatchlist(
  lists: Watchlist[],
  id: string,
): Result<Watchlist[]> {
  const target = lists.find((l) => l.id === id);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.isSystem) return { ok: false, reason: "is_system" };
  return { ok: true, value: lists.filter((l) => l.id !== id) };
}

/**
 * Rename a list. Same system guard as `deleteWatchlist`.
 */
export function renameWatchlist(
  lists: Watchlist[],
  id: string,
  newName: string,
): Result<Watchlist[]> {
  const target = lists.find((l) => l.id === id);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.isSystem) return { ok: false, reason: "is_system" };
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, reason: "empty_name" };
  const collision = lists.some(
    (l) => l.id !== id && l.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (collision) return { ok: false, reason: "duplicate_name" };
  return {
    ok: true,
    value: lists.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
  };
}

/**
 * Append symbols to a non-system list. Dedupe against what's already there
 * and against the other lists' symbols so the user can't accidentally
 * scatter the same ticker across multiple lists — that's a deliberate
 * cross-list check, since "I already track NVDA on Tech Watch" is the
 * most useful UX info we can give.
 *
 * System list IS allowed to gain symbols — only delete/rename are
 * blocked at the list level. (Drag-to-reorder inside the system list
 * is also supported because the seed ticker order is just a starting
 * point, not sacred.)
 */
export function addSymbols(
  lists: Watchlist[],
  listId: string,
  candidates: WatchlistSymbolEntry[],
): Result<Watchlist[]> {
  const target = lists.find((l) => l.id === listId);
  if (!target) return { ok: false, reason: "not_found" };
  const existing = new Set(target.symbols.map((s) => s.symbol.toUpperCase()));
  const additions: WatchlistSymbolEntry[] = [];
  for (const c of candidates) {
    const sym = c.symbol.toUpperCase().trim();
    if (!isValidTickerFormat(sym)) continue;
    if (existing.has(sym)) continue;
    additions.push({ symbol: sym, name: c.name });
    existing.add(sym);
  }
  return {
    ok: true,
    value: lists.map((l) =>
      l.id === listId ? { ...l, symbols: [...l.symbols, ...additions] } : l,
    ),
  };
}

/**
 * Remove a single symbol from any list (system included — deletion within
 * a system list is fine).
 */
export function removeSymbol(
  lists: Watchlist[],
  listId: string,
  symbol: string,
): Watchlist[] {
  return lists.map((l) =>
    l.id === listId
      ? {
          ...l,
          symbols: l.symbols.filter(
            (s) => s.symbol.toUpperCase() !== symbol.toUpperCase(),
          ),
        }
      : l,
  );
}

/**
 * Apply a new ordering to one list's symbols. The caller passes the
 * reordered array — typically built by splicing the dragged entry from
 * `fromIndex` to `toIndex` after a drop event.
 *
 * Defensive: silently no-ops when from === to or out-of-range indices.
 */
export function reorderSymbols(
  lists: Watchlist[],
  listId: string,
  orderedSymbols: WatchlistSymbolEntry[],
): Watchlist[] {
  return lists.map((l) =>
    l.id === listId ? { ...l, symbols: orderedSymbols } : l,
  );
}

/**
 * Best-effort reorder helper for HTML5 drag-reorder. Takes the current
 * order, the source index, and the destination index (where the dragged
 * row should land), splices, and returns the new array.
 *
 * If `toIndex >= fromIndex` it's "dropped below" so the destination index
 * is treated as if the dragged row will be removed first.
 */
export function applyDragReorder<T>(
  arr: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= arr.length ||
    toIndex < 0 ||
    toIndex > arr.length ||
    fromIndex === toIndex
  ) {
    return arr;
  }
  const next = arr.slice();
  const [moved] = next.splice(fromIndex, 1);
  // `toIndex` is the slot in the FINAL array (after the move), so we
  // clamp it to the new length and splice without further adjustment —
  // Array.splice already inserts at the desired final position once the
  // source row has been removed.
  const insertAt = Math.min(toIndex, next.length);
  next.splice(insertAt, 0, moved);
  return next;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Tickers are 1-5 uppercase letters (US equities), with optional `.XX`
 * share-class suffix and `-` for preferreds (e.g. `BRK.B`, `RDS-A`).
 * This deliberately rejects free-form strings so accidental CSV paste of
 * "Apple Inc" or company names can't land a malformed entry into the
 * store.
 */
export function isValidTickerFormat(symbol: string): boolean {
  if (!symbol) return false;
  // A-Z, optional .X or -X share-class suffix. Length 1-6 inclusive.
  return /^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(symbol);
}

function dedupeSymbols(arr: WatchlistSymbolEntry[]): WatchlistSymbolEntry[] {
  const seen = new Set<string>();
  const out: WatchlistSymbolEntry[] = [];
  for (const s of arr) {
    const sym = s.symbol.toUpperCase().trim();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push({ symbol: sym, name: s.name });
  }
  return out;
}

// ── Constants re-exported for callers ─────────────────────────────────────
export const WATCHLIST_STORAGE_KEY = STORAGE_KEY;
export const WATCHLIST_ACTIVE_KEY = ACTIVE_KEY;
export const WATCHLIST_SYSTEM_ID = SYSTEM_LIST_ID;
export const WATCHLIST_SYSTEM_DEFAULT_NAME = SYSTEM_LIST_NAME;

// ── Subscription source (React `useSyncExternalStore`) ────────────────────
//
// The store owns ONE module-level snapshot of `{ lists, activeId }` that
// every consumer reads via `useSyncExternalStore`. Same-tab mutations
// propagate by the IO-side functions above calling `setNextSnapshot`;
//
// useSyncExternalStore reads   :     useSyncExternalStore(subscribe, )
//                                  ³
//                                  ³
//                          store.subscribe(cb)
//                                  ³    (module-level Set)
//                                  ³
//   saveWatchlists / saveActive  --> setNextSnapshot(...) -->
//                                  notify all listeners -->
//                                  React re-renders all consumers
//
// Cross-tab sync is bridged through the browser's `storage` event:
//   1. An external tab writes to localStorage.
//   2. The bridge listener (registered lazily on first subscribe) fires.
//   3. We re-read from localStorage and call setNextSnapshot with the
//      fresh value, so every consumer on *this* tab also re-renders.
//
// SSR-safe: getServerSnapshot returns just the seeded system list, so
// builds that pre-render without window-localStorage still mount.

interface WatchlistSnapshot {
  lists: Watchlist[];
  activeId: string;
}

const listeners = new Set<() => void>();
let bridgeAttached = false;
let initialized = false;

let snapshot: WatchlistSnapshot = {
  lists: [makeSystemWatchlist()],
  activeId: SYSTEM_LIST_ID,
};

/** Re-read from localStorage. Called on first consumer subscribe and from
 *  the cross-tab bridge listener. SSR-safe — returns the seed when no
 *  window is available. */
function readFromStorage(): WatchlistSnapshot {
  if (!hasStorage()) {
    return { lists: [makeSystemWatchlist()], activeId: SYSTEM_LIST_ID };
  }
  const lists = loadWatchlists();
  return { lists, activeId: loadActiveWatchlistId(lists) };
}

function getCurrentSnapshot(): WatchlistSnapshot {
  if (!initialized) {
    initialized = true;
    snapshot = readFromStorage();
  }
  return snapshot;
}

function setNextSnapshot(next: WatchlistSnapshot): void {
  if (next.lists === snapshot.lists && next.activeId === snapshot.activeId) {
    return;
  }
  snapshot = next;
  // Snapshot to an array so a listener that unsubs itself inside the
  // callback doesn't reorder the iteration.
  for (const cb of Array.from(listeners)) {
    try {
      cb();
    } catch {
      // never let a subscriber's throw block the others
    }
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined" && !bridgeAttached) {
    bridgeAttached = true;
    // `storage` events fire in OTHER tabs (the originating tab does NOT
    // emit one), so for same-tab mutation propagation we rely on
    // setNextSnapshot from `saveWatchlists`/`saveActiveWatchlistId`.
    // This listener catches cross-tab changes only.
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY || e.key === ACTIVE_KEY) {
        const fresh = readFromStorage();
        setNextSnapshot(fresh);
      }
    });
  }
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshotValue(): WatchlistSnapshot {
  return getCurrentSnapshot();
}

const cachedServerSnapshot: WatchlistSnapshot = {
  lists: [makeSystemWatchlist()],
  activeId: SYSTEM_LIST_ID,
};

const SERVER_SNAPSHOT: WatchlistSnapshot = {
  lists: [makeSystemWatchlist()],
  activeId: SYSTEM_LIST_ID,
};

function getServerSnapshotValue(): WatchlistSnapshot {
  // Used by useSyncExternalStore on the server pass only. Always safe
  // because we don't touch `window`.
  return SERVER_SNAPSHOT;
}

/** Test-only escape hatch. Clears the singleton snapshot + listeners +
 *  bridge so each spec starts with a clean slate. Specs that depend on
 *  the snapshot should call this in `beforeEach`. */
function __resetSnapshotForTesting(): void {
  initialized = false;
  snapshot = { lists: [makeSystemWatchlist()], activeId: SYSTEM_LIST_ID };
  listeners.clear();
  bridgeAttached = false;
}

/** Forwarded for `useWatchlists`; tests use this directly to verify
 *  same-tab propagation. */
export const __watchlistInternal = {
  subscribe,
  getSnapshot: getSnapshotValue,
  getServerSnapshot: getServerSnapshotValue,
  __resetSnapshotForTesting,
};
