/**
 * Earnings alert persistence layer. Two separate concerns live here:
 *
 *   1. **Snoozed map** — `Record<key, SnoozeEntry>` keyed by `${date}|${SYMBOL}`.
 *      Each entry has `snoozedAt` + `expiresAt` (24h later). Entries auto-expire
 *      on the next "tick" of the alert engine so a user who snoozes AAPL on
 *      Wednesday gets re-prompted Thursday morning if AAPL is still in the
 *      upcoming queue.
 *
 *   2. **History list** — a FIFO array of past alert interactions
 *      (opened / snoozed / dismissed), capped at HISTORY_CAP and pruned
 *      across local-midnight so the history panel never surfaces yesterday's
 *      rows after the day rolls over.
 *
 * Pattern matches `lib/watchlistStore.ts`: SSR-safe `typeof window` guard,
 * defensive schema filter on load, `{ ok, value }` wrappers NOT used here
 * (these ops are fire-and-forget — UI tolerates store failures with silent
 * in-memory fallback so the engine keeps firing).
 */

const STORAGE_SNOOZED = "vantage.earningsAlerts.snoozed";
const STORAGE_HISTORY = "vantage.earningsAlerts.history";
const SNOOZE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_CAP = 50;

export interface SnoozeEntry {
  /** Epoch ms when the user clicked "Snooze". */
  snoozedAt: number;
  /** Epoch ms when this snooze entry should auto-expire and re-fire. */
  expiresAt: number;
}

export type AlertAction = "opened" | "snoozed" | "dismissed";

export interface HistoryEntry {
  key: string;
  symbol: string;
  date: string;
  action: AlertAction;
  ts: number;
}

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

/**
 * Canonical key joining date + symbol so the same event dedupes across
 * the queue (snooze map, history, focused-row highlight). Symbol is
 * uppercase-trimmed so AAPL/appl coalesce.
 */
export function alertKey(date: string, symbol: string): string {
  return `${date}|${symbol.toUpperCase().trim()}`;
}

// ── Snooze ──────────────────────────────────────────────────────────────

/**
 * Read the persisted snooze map. Returns `{}` on SSR, an empty map when
 * storage hasn't been seeded, and silently swallows corrupt-JSON errors
 * (the engine keeps firing in-memory).
 */
export function loadSnoozed(): Record<string, SnoozeEntry> {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_SNOOZED);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SnoozeEntry> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as SnoozeEntry).snoozedAt === "number" &&
        typeof (v as SnoozeEntry).expiresAt === "number"
      ) {
        out[k] = v as SnoozeEntry;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSnoozed(map: Record<string, SnoozeEntry>): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_SNOOZED, JSON.stringify(map));
  } catch {
    // Quota exceeded / private-mode guard — engine keeps working in memory.
  }
}

export function snoozeAlert(
  map: Record<string, SnoozeEntry>,
  key: string,
  now: number = Date.now(),
): Record<string, SnoozeEntry> {
  const entry: SnoozeEntry = { snoozedAt: now, expiresAt: now + SNOOZE_TTL_MS };
  return { ...map, [key]: entry };
}

export function pruneExpiredSnoozed(
  map: Record<string, SnoozeEntry>,
  now: number = Date.now(),
): Record<string, SnoozeEntry> {
  const next: Record<string, SnoozeEntry> = {};
  let removed = 0;
  for (const [k, v] of Object.entries(map)) {
    if (v.expiresAt > now) {
      next[k] = v;
    } else {
      removed++;
    }
  }
  return removed === 0 ? map : next;
}

// ── History ─────────────────────────────────────────────────────────────

/**
 * Read the persisted history list, sorted newest-first and capped at
 * HISTORY_CAP. Returns `[]` on SSR / corrupt JSON.
 */
export function loadHistory(): HistoryEntry[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (h): h is HistoryEntry =>
          !!h &&
          typeof h === "object" &&
          typeof (h as HistoryEntry).key === "string" &&
          typeof (h as HistoryEntry).symbol === "string" &&
          typeof (h as HistoryEntry).date === "string" &&
          typeof (h as HistoryEntry).action === "string" &&
          typeof (h as HistoryEntry).ts === "number",
      )
      .sort((a, b) => b.ts - a.ts)
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_HISTORY,
      JSON.stringify(entries.slice(0, HISTORY_CAP)),
    );
  } catch {
    // ignore
  }
}

/**
 * Prepend a new entry, dedupe by `key` so clicking Open twice on the same
 * event keeps only the latest action. Cap at HISTORY_CAP so the array
 * never grows unbounded.
 */
export function appendHistory(
  entries: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  const next = entries.filter((e) => e.key !== entry.key);
  next.unshift(entry);
  return next.slice(0, HISTORY_CAP);
}

/**
 * Drop entries whose `date` is before today's local-midnight. The TTL
 * rollover is local-calendar-day so Friday's last entry persists into
 * Saturday's morning view until the next user action OR the user clears
 * storage explicitly.
 */
export function pruneOldHistory(
  entries: HistoryEntry[],
  todayIso: string,
): HistoryEntry[] {
  const filtered = entries.filter((e) => e.date >= todayIso);
  return filtered.length === entries.length ? entries : filtered;
}

export const EARNINGS_ALERT_STORAGE_SNOOZED = STORAGE_SNOOZED;
export const EARNINGS_ALERT_STORAGE_HISTORY = STORAGE_HISTORY;
export const EARNINGS_ALERT_HISTORY_CAP = HISTORY_CAP;
export const EARNINGS_ALERT_SNOOZE_TTL_MS = SNOOZE_TTL_MS;
