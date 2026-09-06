import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { EarningsEvent } from "@shared/api";

import { useWatchlists } from "@/hooks/useWatchlists";
import {
  EARNINGS_ALERT_STORAGE_HISTORY,
  EARNINGS_ALERT_STORAGE_SNOOZED,
  alertKey,
  appendHistory,
  loadHistory,
  loadSnoozed,
  pruneExpiredSnoozed,
  pruneOldHistory,
  saveHistory,
  saveSnoozed,
  snoozeAlert as snoozeAlertPure,
  type AlertAction,
  type HistoryEntry,
  type SnoozeEntry,
} from "@/lib/earningsAlertStore";
import { eventEpochMs, isWithin24h } from "@/lib/alertUtils";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ── Public types ─────────────────────────────────────────────────────────

export interface UpcomingAlert {
  key: string;
  event: EarningsEvent;
  /** Hours until scheduled fire (negative if already fired within grace). */
  hoursUntil: number;
}

/**
 * Engine state — the consolidated state machine that previously lived
 * across four separate `useState` calls. The four fields transition
 * together as a single reducer:
 *
 *   - `todayIso` — local calendar day. Drives the calendar queryKey,
 *     the history day-prune, and the 24h window used by `selectUpcoming`.
 *     Updated **only** when changed, so re-renders stay focused on the
 *     actual day roll-over.
 *   - `tick` — monotonic counter, bumped every 60s by the heartbeat
 *     effect. Forces the `upcoming` selector to re-evaluate even when
 *     TanStack Query hasn't refetched yet (so events rolling past the
 *     24h boundary drop out of the queue without a network round-trip).
 *   - `snoozedMap` — authoritative snooze map; pruned in the reducer
 *     on every `tick` and on every cross-tab `load/snoozed` replace so
 *     the in-memory state is always consistent.
 *   - `history` — authoritative history list; day-pruned in the reducer
 *     alongside the same transitions.
 *
 * Exported so future specs (or refactors that swap the engine's inner
 * loop) can speak the same vocabulary as the reducer.
 */
export type EngineState = {
  todayIso: string;
  tick: number;
  snoozedMap: Record<string, SnoozeEntry>;
  history: HistoryEntry[];
};

/**
 * Tagged-union action set. Time is passed in the payload (the reducer
 * never reads `Date.now()` directly) so transitions are pure — unit
 * tests can drive them with deterministic timestamps.
 */
export type EngineAction =
  | { type: "tick"; now: number; freshTodayIso: string }
  | { type: "snooze"; key: string; now: number }
  | {
      type: "acknowledge";
      key: string;
      action: AlertAction;
      now: number;
    }
  | { type: "load/snoozed"; map: Record<string, SnoozeEntry> }
  | { type: "load/history"; entries: HistoryEntry[] };

/**
 * Forward-looking policy placeholder. Module-scope config (NOT state),
 * so adding a new capability flag — e.g. "alert only when
 * |epsEstimated - consensus| > X" — is a one-line edit + one new
 * filter step in `selectUpcoming`. No reducer churn.
 *
 * (If the policy ever becomes user-configurable, promote to state with
 * a `set-policy` action — the seam is already here.)
 */
export type AlertPolicy = {
  /** Skip alert unless EPS estimate differs from consensus by at least
   *  this many USD. Currently undefined → no-op. */
  minEpsDeltaUsd?: number;
};

/** Default policy: no-op. Frozen so accidental mutations surface as
 *  type errors / runtime exceptions rather than silent divergence. */
export const DEFAULT_ALERT_POLICY: AlertPolicy = Object.freeze({});

export type EngineData = {
  upcoming: UpcomingAlert[];
  history: HistoryEntry[];
  todayIso: string;
  isLoading: boolean;
  snooze: (key: string) => void;
  acknowledge: (key: string, action: AlertAction) => void;
};

// ── Reducer ──────────────────────────────────────────────────────────────

/**
 * Pure reducer. All prune logic — expired snoozed entries + old
 * history rows — lives here as declarative cases inside the `tick`
 * transition (and re-applied defensively inside `load/*` so cross-tab
 * data that arrived stale is cleaned up). Persistence is a separate
 * effect that just write-throughs the latest state.
 *
 * Today-tick coupling: `todayIso` is only replaced when the day
 * actually rolled over (referentially-equal short-circuit), so a tick
 * that doesn't move the day doesn't invalidate components that bind
 * `todayIso` as a dep.
 */
export function engineReducer(
  state: EngineState,
  action: EngineAction,
): EngineState {
  switch (action.type) {
    case "tick": {
      return {
        tick: state.tick + 1,
        todayIso:
          action.freshTodayIso === state.todayIso
            ? state.todayIso
            : action.freshTodayIso,
        // Always re-prune on tick — cheap (n ≤ ~10 entries) and
        // guarantees expiry happens at the heartbeat cadence even if
        // no `snooze` action has touched the map recently.
        snoozedMap: pruneExpiredSnoozed(state.snoozedMap, action.now),
        // Always re-prune history on tick — gated by freshTodayIso so
        // 23:59 → 00:01 stops showing yesterday's rows.
        history: pruneOldHistory(state.history, action.freshTodayIso),
      };
    }
    case "snooze": {
      const [date, symbol] = action.key.split("|");
      return {
        ...state,
        snoozedMap: snoozeAlertPure(state.snoozedMap, action.key, action.now),
        history: appendHistory(state.history, {
          key: action.key,
          symbol: symbol ?? "",
          date: date ?? "",
          action: "snoozed",
          ts: action.now,
        }),
      };
    }
    case "acknowledge": {
      const [date, symbol] = action.key.split("|");
      return {
        ...state,
        history: appendHistory(state.history, {
          key: action.key,
          symbol: symbol ?? "",
          date: date ?? "",
          action: action.action,
          ts: action.now,
        }),
      };
    }
    case "load/snoozed": {
      // Defensive re-prune: storage values that arrived stale (e.g.
      // another tab kept the page open across a long sleep) are still
      // clean when they land in state.
      return {
        ...state,
        snoozedMap: pruneExpiredSnoozed(action.map),
      };
    }
    case "load/history": {
      // loadHistory in earningsAlertStore already caps + sorts; the
      // reducer trusts that contract and applies the same-day prune.
      return {
        ...state,
        history: pruneOldHistory(action.entries, state.todayIso),
      };
    }
    default:
      return state;
  }
}

// ── Selector ─────────────────────────────────────────────────────────────

/**
 * Pure selector: derives the live alert queue from the calendar data,
 * the watchlist union, and the engine's accumulated filters.
 *
 * Each filter is a named case — adding a future capability flag (a
 * new `AlertPolicy` field, or any other dimension) is one new case
 * here, not a new `useEffect` somewhere else. That is the entire
 * point of the useReducer refactor.
 *
 * Note: `tick` is intentionally not consulted inside this function —
 * `selectUpcoming` is pure over its inputs. The engine re-evaluates
 * this memo once per minute by including `state.tick` in its dep
 * array; that coupling lives at the call site, not in the selector.
 */
export function selectUpcoming(
  state: EngineState,
  data: EarningsEvent[] | undefined,
  watchlistSymbols: Set<string>,
  now: number,
  policy: AlertPolicy = DEFAULT_ALERT_POLICY,
): UpcomingAlert[] {
  if (!data) return [];
  const snoozedKeys = new Set(Object.keys(state.snoozedMap));
  const historyKeys = new Set(state.history.map((h) => h.key));
  // `tick` forwarded into state by the caller — referenced here for
  // future policy work that depends on "time since last tick" without
  // re-plumbing the selector. Today: no-op.
  void state.tick;
  void policy;
  return (
    data
      .filter((e) => passWatchlist(e, watchlistSymbols))
      .filter((e) => pass24hWindow(e, now))
      .filter((e) => passSnoozed(e, snoozedKeys))
      .filter((e) => passHistory(e, historyKeys))
      // Extension point — when a new AlertPolicy dimension is added,
      // append `.filter((e) => passPolicyX(e, policy))` here.
      .map((e) => ({
        key: alertKey(e.date, e.symbol),
        event: e,
        hoursUntil: (eventEpochMs(e) - now) / (60 * 60 * 1000),
      }))
      .sort((a, b) => eventEpochMs(a.event) - eventEpochMs(b.event))
  );
}

function passWatchlist(e: EarningsEvent, wl: Set<string>): boolean {
  return wl.has((e.symbol ?? "").toUpperCase());
}

function pass24hWindow(e: EarningsEvent, now: number): boolean {
  return isWithin24h(e, now);
}

function passSnoozed(e: EarningsEvent, snoozedKeys: Set<string>): boolean {
  return !snoozedKeys.has(alertKey(e.date, e.symbol));
}

function passHistory(e: EarningsEvent, historyKeys: Set<string>): boolean {
  return !historyKeys.has(alertKey(e.date, e.symbol));
}

// ── Hook ─────────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 60_000;

/**
 * `useEarningsAlertsInternal()` — the actual engine. Owns the
 * reducer, the heartbeat effect, the persist-through effects, the
 * storage event bridge, and the calendar `useQuery`. Called exactly
 * once by `<EarningsAlertEngine>`.
 *
 * Refactor notes:
 *   - The four `useState` calls collapsed into one `useReducer`.
 *   - The three "side-effect after state changed" effects collapsed
 *     into: (1) heartbeat (dispatches `tick`), (2) write-through
 *     snooze persistence, (3) write-through history persistence.
 *     Snooze expiry and history day-prune moved INTO the reducer.
 *   - The cross-tab bridge dispatches `load/*` instead of imperatively
 *     calling setters, and the reducer defensively re-prunes the
 *     incoming data so outer-tab lifecycle drift can't pollute state.
 *   - The "future policy" hook is a `policy` argument threaded into
 *     `selectUpcoming`. Currently module-scope default  = no-op.
 */
function useEarningsAlertsInternal(
  policy: AlertPolicy = DEFAULT_ALERT_POLICY,
): EngineData {
  const wl = useWatchlists();

  const [state, dispatch] = useReducer(engineReducer, undefined, () => ({
    todayIso: todayIsoLocal(),
    tick: 0,
    snoozedMap: loadSnoozed(),
    history: loadHistory(),
  }));

  // (1) Heartbeat — single source-of-truth driver. The rest of the
  // engine reacts to the dispatched `tick` action.
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({
        type: "tick",
        now: Date.now(),
        freshTodayIso: todayIsoLocal(),
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  // (2) Snooze persist-through.
  useEffect(() => {
    saveSnoozed(state.snoozedMap);
  }, [state.snoozedMap]);

  // (3) History persist-through.
  useEffect(() => {
    saveHistory(state.history);
  }, [state.history]);

  // Cross-tab bridge: another tab updated the snooze or history
  // store. We do NOT trust the raw values — the reducer defensively
  // re-prunes on `load/*` so cross-tab drift can't surface expired
  // snoozes or yesterday's rows.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key === EARNINGS_ALERT_STORAGE_SNOOZED) {
        dispatch({ type: "load/snoozed", map: loadSnoozed() });
      } else if (e.key === EARNINGS_ALERT_STORAGE_HISTORY) {
        dispatch({ type: "load/history", entries: loadHistory() });
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Derived upstream: the watchlist union set (memoized on identity).
  const watchlistSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const l of wl.lists) {
      for (const s of l.symbols) {
        const sym = (s.symbol ?? "").toUpperCase().trim();
        if (sym) set.add(sym);
      }
    }
    return set;
  }, [wl.lists]);

  // Calendar fetch — queryKey includes todayIso so day-rollover
  // re-keys the cache. Polling cadence unchanged.
  const calendarQ = useQuery<EarningsEvent[]>({
    // Stable key — any number of `useEarningsAlerts` consumers sharing
    // the same TanStack QueryClient land on this single cache entry.
    queryKey: ["earningsCalendar", "alerts", state.todayIso],
    queryFn: () =>
      fetchJSON<EarningsEvent[]>(
        `/api/earnings-calendar?from=${encodeURIComponent(state.todayIso)}&to=${encodeURIComponent(addDaysIso(state.todayIso, 7))}`,
      ),
    enabled: watchlistSymbols.size > 0,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // `upcoming` derivation. Re-evaluated on any state field change
  // (including `tick`, so the 24h-boundary re-applies every minute),
  // AND on calendar data / watchlist / policy. `Date.now()` is
  // captured at memo invalidation time — same as the pre-refactor
  // semantics. Selector stays pure; the impure call to `Date.now()`
  // lives at the boundary, where it's testable.
  const upcoming = useMemo<UpcomingAlert[]>(() => {
    return selectUpcoming(
      state,
      calendarQ.data,
      watchlistSymbols,
      Date.now(),
      policy,
    );
  }, [state, calendarQ.data, watchlistSymbols, policy]);

  const snooze = useCallback((key: string) => {
    dispatch({ type: "snooze", key, now: Date.now() });
  }, []);

  const acknowledge = useCallback((key: string, action: AlertAction) => {
    dispatch({ type: "acknowledge", key, action, now: Date.now() });
  }, []);

  // Memoize the EngineData object so the Provider's `value` prop
  // doesn't churn on every Provider re-render. Without this, every
  // AppLayout re-render would mint a new object literal and force
  // Strip + HistoryPanel to re-render even when none of the engine's
  // fields changed (e.g., navigation-triggered AppLayout renders).
  return useMemo(
    () => ({
      upcoming,
      history: state.history,
      todayIso: state.todayIso,
      isLoading: calendarQ.isLoading,
      snooze,
      acknowledge,
    }),
    [
      upcoming,
      state.history,
      state.todayIso,
      calendarQ.isLoading,
      snooze,
      acknowledge,
    ],
  );
}

// ── Provider + Context ───────────────────────────────────────────────────

const EarningsAlertEngineContext = createContext<EngineData | null>(null);

/**
 * Single mount point for the alert engine. Wraps the React tree once
 * (typically inside `AppLayout` alongside `<WatchlistsProvider>`) so:
 *   - The `useReducer` runs once. One `useQuery`, one 60s heartbeat,
 *     one storage listener for the whole app.
 *   - The state machine's transitions are co-located with the data
 *     they touch — a future policy is a single new selector case,
 *     not a new `useEffect` scattered across the file.
 *
 * Provider surface is unchanged from the pre-reducer version: same
 * EngineData shape, same `useEarningsAlerts()` consumer. The refactor
 * is internal.
 */
export function EarningsAlertEngine({ children }: { children: ReactNode }) {
  const data = useEarningsAlertsInternal();
  return createElement(
    EarningsAlertEngineContext.Provider,
    { value: data },
    children,
  );
}

/**
 * Public consumer. Reads from the Provider's Context — the only path
 * that keeps the engine singleton: one `useQuery`, one 60s heartbeat,
 * one storage listener, one `useReducer` instance. Throws a helpful
 * message when no Provider is mounted so a forgotten wrap surfaces
 * immediately during dev rather than producing a phantom second
 * engine.
 */
export function useEarningsAlerts(): EngineData {
  const ctx = useContext(EarningsAlertEngineContext);
  if (ctx === null) {
    throw new Error(
      "[useEarningsAlerts] must be called inside <EarningsAlertEngine>. " +
        "Wrap your tree with the Provider once (usually in AppLayout) and " +
        "try again.",
    );
  }
  return ctx;
}
