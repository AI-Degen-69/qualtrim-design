import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  WATCHLIST_SYSTEM_ID,
  __watchlistInternal,
  addSymbols as addSymbolsPure,
  createWatchlist as createWatchlistPure,
  deleteWatchlist as deleteWatchlistPure,
  removeSymbol as removeSymbolPure,
  renameWatchlist as renameWatchlistPure,
  reorderSymbols as reorderSymbolsPure,
  saveActiveWatchlistId,
  saveWatchlists,
  type Result,
  type Watchlist,
  type WatchlistSymbolEntry,
} from "@/lib/watchlistStore";

const { subscribe, getSnapshot, getServerSnapshot } = __watchlistInternal;

/**
 * `useWatchlists()` returns the live watchlists snapshot + mutation
 * actions. Every consumer on the React tree reads through the same
 * `useSyncExternalStore(subscribe, getSnapshot)` so all calls see the
 * SAME snapshot reference — fixing the prior same-tab divergence where
 * strip / history panel / Watchlists page each instantiated their own
 * useState stack. Mutations go through `saveWatchlists` /
 * `saveActiveWatchlistId` which write to localStorage AND call
 * `setNextSnapshot`, so identical data is shared across consumers
 * regardless of which component triggered the change.
 *
 * Cross-tab sync still uses the browser's `storage` event (registered
 * once on the first subscribe, lazily).
 */
export function useWatchlists() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The mutation callbacks close over `snap.lists` so they always operate
  // on the freshest snapshot. `useCallback` keeps the function identity
  // stable across re-renders UNLESS the snapshot changes, so consumers
  // don't see spurious re-subscribes.

  const createWatchlist = useCallback(
    (name: string, initial: WatchlistSymbolEntry[] = []): Result<Watchlist> => {
      const result = createWatchlistPure(snap.lists, name, initial);
      if (result.ok) {
        saveWatchlists([...snap.lists, result.value]);
        // Promote the new list to active so the page lands on it
        // immediately; mirrors the pre-refactor behavior.
        saveActiveWatchlistId(result.value.id);
      }
      return result;
    },
    [snap.lists],
  );

  const deleteWatchlist = useCallback(
    (id: string): Result<Watchlist[]> => {
      const result = deleteWatchlistPure(snap.lists, id);
      if (result.ok) {
        saveWatchlists(result.value);
        // If we just deleted the active list, fall back to a system list
        // (or the first remaining list).
        if (snap.activeId === id) {
          const fallback =
            result.value.find((l) => l.isSystem)?.id ??
            result.value[0]?.id ??
            WATCHLIST_SYSTEM_ID;
          saveActiveWatchlistId(fallback);
        }
      }
      return result;
    },
    [snap.lists, snap.activeId],
  );

  const renameWatchlist = useCallback(
    (id: string, newName: string): Result<Watchlist[]> => {
      const result = renameWatchlistPure(snap.lists, id, newName);
      if (result.ok) saveWatchlists(result.value);
      return result;
    },
    [snap.lists],
  );

  const addSymbols = useCallback(
    (
      listId: string,
      candidates: WatchlistSymbolEntry[],
    ): Result<Watchlist[]> => {
      const result = addSymbolsPure(snap.lists, listId, candidates);
      if (result.ok) saveWatchlists(result.value);
      return result;
    },
    [snap.lists],
  );

  const removeSymbol = useCallback(
    (listId: string, symbol: string) => {
      saveWatchlists(removeSymbolPure(snap.lists, listId, symbol));
    },
    [snap.lists],
  );

  const reorderSymbols = useCallback(
    (listId: string, orderedSymbols: WatchlistSymbolEntry[]) => {
      saveWatchlists(reorderSymbolsPure(snap.lists, listId, orderedSymbols));
    },
    [snap.lists],
  );

  const setActiveId = useCallback((id: string) => {
    saveActiveWatchlistId(id);
  }, []);

  const active = useMemo(
    () =>
      snap.lists.find((l) => l.id === snap.activeId) ?? snap.lists[0] ?? null,
    [snap.lists, snap.activeId],
  );

  const systemList = useMemo(
    () => snap.lists.find((l) => l.isSystem) ?? null,
    [snap.lists],
  );

  return {
    lists: snap.lists,
    activeId: snap.activeId,
    active,
    systemList,
    setActiveId,
    createWatchlist,
    deleteWatchlist,
    renameWatchlist,
    addSymbols,
    removeSymbol,
    reorderSymbols,
  };
}

// ── Provider + Context ───────────────────────────────────────────────────

const WatchlistsContext = createContext<ReturnType<
  typeof useWatchlists
> | null>(null);

/**
 * Mount once inside `AppLayout` (or as close to the React root as
 * makes sense). Every page-bound reader reaches the same snapshot via
 * the underlying singleton store, so the Provider is mostly a tree-
 * scoping marker + a clean boundary for tests.
 *
 * If you forget to wrap, `useWatchlistsContext()` falls back to the
 * shared singleton so the page still works. That's deliberate — the
 * Provider is for **clarity**, not for must-have dedup (that's the
 * store's job).
 */
export function WatchlistsProvider({ children }: { children: ReactNode }) {
  const wl = useWatchlists();
  // `createElement` instead of JSX so this file can stay as `.ts` (the
  // pre-existing extension) without renaming. Same resulting tree at
  // runtime; just fewer glob edits.
  return createElement(WatchlistsContext.Provider, { value: wl }, children);
}

/**
 * Read the shared watchlists snapshot via the Provider. Falls through to
 * the singleton store when no Provider is mounted so untested paths
 * remain functional.
 */
export function useWatchlistsContext() {
  const hookResult = useWatchlists();
  const ctx = useContext(WatchlistsContext);
  return ctx ?? hookResult;
}

/**
 * Helper hook for rename UX: controlled input + draft state so callers
 * don't have to reimplement it on every form. Exposes
 *   `{ name, setName, isEditing, beginEdit, cancelEdit, commitEdit }`.
 *
 * The page wires this into the active list's title inline-edit affordance;
 * the system list's commit silently no-ops per `renameWatchlist`'s guard
 * — the UI is responsible for hiding the edit pencil on system rows.
 */
export function useInlineRename(
  initial: string,
  onCommit: (name: string) => Result<unknown>,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initial);

  useEffect(() => {
    // Refresh draft whenever the underlying name changes (e.g. tab switch).
    setName(initial);
  }, [initial]);

  const beginEdit = useCallback(() => setIsEditing(true), []);
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setName(initial);
  }, [initial]);

  const commitEdit = useCallback(() => {
    const result = onCommit(name);
    if (result.ok) setIsEditing(false);
    return result;
  }, [name, onCommit]);

  return { name, setName, isEditing, beginEdit, cancelEdit, commitEdit };
}
