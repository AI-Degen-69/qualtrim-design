import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  loadWatchlists,
  saveWatchlists,
  loadActiveWatchlistId,
  saveActiveWatchlistId,
  createWatchlist,
  deleteWatchlist,
  renameWatchlist,
  addSymbols,
  removeSymbol,
  reorderSymbols,
  applyDragReorder,
  isValidTickerFormat,
  unwrap,
  WATCHLIST_SYSTEM_ID,
  WATCHLIST_SYSTEM_DEFAULT_NAME,
  __watchlistInternal,
} from "./watchlistStore";

// `loadWatchlists` and friends touch `window.localStorage`. We stub it on
// `globalThis` so the spec runs in plain Node without needing happy-dom
// (the project's vitest config doesn't ship one). The stub mimics the
// browser's Storage interface cleanly enough for our needs.

function installInMemoryStorage() {
  const backing = new Map<string, string>();
  // Per-event listener registry. The watchlists store's subscription
  // source attaches a `storage` listener lazily on first subscribe;
  // tests fire synthetic events through this map to exercise the bridge.
  const listeners = new Map<string, Set<(e: any) => void>>();
  const stub = {
    getItem: (k: string) =>
      backing.has(k) ? (backing.get(k) as string) : null,
    setItem: (k: string, v: string) => backing.set(k, String(v)),
    removeItem: (k: string) => backing.delete(k),
    clear: () => {
      backing.clear();
      listeners.clear();
    },
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    get length() {
      return backing.size;
    },
  };
  // Full `window`-shaped stub: the watchlists store's bridge handler
  // attaches a `storage` listener on first subscribe; the spec needs
  // that surface area to not throw.
  const win: any = {
    localStorage: stub,
    addEventListener: (event: string, cb: (e: any) => void) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb);
    },
    removeEventListener: (event: string, cb: (e: any) => void) => {
      listeners.get(event)?.delete(cb);
    },
    // Test-only helper to synthesize a `storage` event from another
    // tab. The watchlists bridge re-reads from localStorage and notifies.
    __fireStorageEvent: (key: string) => {
      const set = listeners.get("storage");
      if (!set) return;
      const ev = { key, newValue: backing.get(key) ?? null, oldValue: null };
      for (const cb of Array.from(set)) cb(ev);
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: win,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    configurable: true,
    writable: true,
  });
  return stub;
}

function teardownStorage() {
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: undefined,
    configurable: true,
  });
}

describe("watchlistStore", () => {
  beforeEach(() => {
    installInMemoryStorage();
    // Reset the module-level snapshot between specs so cross-test
    // pollution from the `useSyncExternalStore` source doesn't leak.
    __watchlistInternal.__resetSnapshotForTesting();
  });
  afterEach(() => {
    teardownStorage();
  });

  describe("storage IO", () => {
    it("returns the seeded system list when storage is empty", () => {
      const lists = loadWatchlists();
      expect(lists).toHaveLength(1);
      expect(lists[0].isSystem).toBe(true);
      expect(lists[0].id).toBe(WATCHLIST_SYSTEM_ID);
      expect(lists[0].name).toBe(WATCHLIST_SYSTEM_DEFAULT_NAME);
      expect(lists[0].symbols.length).toBeGreaterThan(0);
      expect(lists[0].symbols[0]).toMatchObject({ symbol: expect.any(String) });
    });

    it("round-trips through save -> load", () => {
      const stub = installInMemoryStorage();
      const lists = loadWatchlists();
      const newList = unwrap(
        createWatchlist(lists, "My Tech", [
          { symbol: "AAPL" },
          { symbol: "MSFT" },
        ]),
      );
      saveWatchlists([...lists, newList]);
      expect(stub.getItem("vantage.watchlists")).not.toBeNull();
      const reloaded = loadWatchlists();
      expect(reloaded.find((l) => l.id === newList.id)?.name).toBe("My Tech");
    });

    it("rejects malformed stored JSON and falls back to seed", () => {
      installInMemoryStorage();
      const anyStorage = (globalThis as any).localStorage;
      anyStorage.setItem("vantage.watchlists", "{not-valid-json}");
      const lists = loadWatchlists();
      expect(lists).toHaveLength(1);
      expect(lists[0].isSystem).toBe(true);
    });

    it("re-seeds the system list whenever it's missing from storage", () => {
      installInMemoryStorage();
      const anyStorage = (globalThis as any).localStorage;
      anyStorage.setItem(
        "vantage.watchlists",
        JSON.stringify([
          {
            id: "user1",
            name: "User 1",
            symbols: [],
            isSystem: false,
            createdAt: 1,
            version: 1,
          },
        ]),
      );
      const lists = loadWatchlists();
      expect(lists).toHaveLength(2);
      expect(lists.some((l) => l.isSystem)).toBe(true);
    });

    it("persists active watchlist id", () => {
      const stub = installInMemoryStorage();
      const lists = loadWatchlists();
      saveActiveWatchlistId(lists[0].id);
      expect(stub.getItem("vantage.watchlists.activeId")).toBe(lists[0].id);
      const activeId = loadActiveWatchlistId(lists);
      expect(activeId).toBe(lists[0].id);
    });

    it("falls back gracefully when activeId references a stale list", () => {
      installInMemoryStorage();
      const lists = loadWatchlists();
      const activeId = loadActiveWatchlistId(lists);
      expect(activeId).toBe(WATCHLIST_SYSTEM_ID);
    });
  });

  describe("system list protection", () => {
    it("refuses to delete the seeded system list", () => {
      const lists = loadWatchlists();
      const result = deleteWatchlist(lists, WATCHLIST_SYSTEM_ID);
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe("is_system");
    });

    it("refuses to rename the seeded system list", () => {
      const lists = loadWatchlists();
      const result = renameWatchlist(lists, WATCHLIST_SYSTEM_ID, "Other name");
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe("is_system");
    });

    it("ALLOWS adding symbols to the system list", () => {
      const lists = loadWatchlists();
      const result = addSymbols(lists, WATCHLIST_SYSTEM_ID, [
        { symbol: "PLTR" },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const sys = result.value.find((l) => l.id === WATCHLIST_SYSTEM_ID);
        expect(sys?.symbols.some((s) => s.symbol === "PLTR")).toBe(true);
      }
    });

    it("ALLOWS reordering symbols inside the system list", () => {
      const lists = loadWatchlists();
      const sys = lists.find((l) => l.id === WATCHLIST_SYSTEM_ID)!;
      const reversed = [...sys.symbols].reverse();
      const next = reorderSymbols(lists, WATCHLIST_SYSTEM_ID, reversed);
      const sysNext = next.find((l) => l.id === WATCHLIST_SYSTEM_ID);
      expect(sysNext?.symbols[0].symbol).toBe(
        sys.symbols[sys.symbols.length - 1].symbol,
      );
    });
  });

  describe("createWatchlist", () => {
    it("creates a new user list", () => {
      const lists = loadWatchlists();
      const value = unwrap(
        createWatchlist(lists, "My Tech", [{ symbol: "MSFT" }]),
      );
      expect(value.isSystem).toBe(false);
      expect(value.name).toBe("My Tech");
      expect(value.symbols).toEqual([{ symbol: "MSFT" }]);
    });

    it("trims whitespace in the name", () => {
      const lists = loadWatchlists();
      expect(unwrap(createWatchlist(lists, "  spaced  ", [])).name).toBe(
        "spaced",
      );
    });

    it("rejects empty name", () => {
      const lists = loadWatchlists();
      const result = createWatchlist(lists, "   ", []);
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe("empty_name");
    });

    it("rejects duplicate names (case-insensitive)", () => {
      const lists = loadWatchlists();
      const result = createWatchlist(lists, "MARKET LEADERS", []);
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe("duplicate_name");
    });
  });

  describe("addSymbols / dedupe", () => {
    it("dedupes uppercase variants", () => {
      const lists = loadWatchlists();
      const created = unwrap(
        createWatchlist(lists, "My List", [{ symbol: "aapl" }]),
      );
      const updated = unwrap(
        addSymbols([...lists, created], created.id, [
          { symbol: "AAPL" },
          { symbol: "msft" },
          { symbol: "MSFT" },
        ]),
      );
      const updatedList = updated.find((l) => l.id === created.id)!;
      expect(updatedList.symbols.map((s) => s.symbol)).toEqual([
        "AAPL",
        "MSFT",
      ]);
    });

    it("rejects invalid ticker formats", () => {
      const lists = loadWatchlists();
      const created = unwrap(createWatchlist(lists, "My List"));
      const updated = unwrap(
        addSymbols([...lists, created], created.id, [
          { symbol: "TOOLONGTICKER" },
          { symbol: "123" },
          { symbol: "ok-aapl" }, // not a valid format (lowercase "aapl" suffix)
          { symbol: "MSFT" }, // ok
        ]),
      );
      const updatedList = updated.find((l) => l.id === created.id)!;
      expect(updatedList.symbols.map((s) => s.symbol)).toEqual(["MSFT"]);
    });

    it("preserves display name when provided", () => {
      const lists = loadWatchlists();
      const created = unwrap(createWatchlist(lists, "My List"));
      const updated = unwrap(
        addSymbols([...lists, created], created.id, [
          { symbol: "AAPL", name: "Apple Inc." },
        ]),
      );
      const updatedList = updated.find((l) => l.id === created.id)!;
      expect(updatedList.symbols[0]).toMatchObject({
        symbol: "AAPL",
        name: "Apple Inc.",
      });
    });
  });

  describe("reorder math", () => {
    it("applyDragReorder moves down correctly", () => {
      const arr = ["a", "b", "c", "d"];
      expect(applyDragReorder(arr, 0, 3)).toEqual(["b", "c", "d", "a"]);
    });

    it("applyDragReorder moves up correctly", () => {
      const arr = ["a", "b", "c", "d"];
      expect(applyDragReorder(arr, 3, 0)).toEqual(["d", "a", "b", "c"]);
    });

    it("applyDragReorder is a no-op when from===to", () => {
      const arr = ["a", "b", "c"];
      expect(applyDragReorder(arr, 1, 1)).toEqual(arr);
    });

    it("applyDragReorder is a no-op on out-of-range indices", () => {
      const arr = ["a", "b", "c"];
      expect(applyDragReorder(arr, -1, 2)).toEqual(arr);
      expect(applyDragReorder(arr, 5, 2)).toEqual(arr);
    });
  });

  describe("isValidTickerFormat", () => {
    it("accepts plain uppercase 1-5 character tickers", () => {
      expect(isValidTickerFormat("A")).toBe(true);
      expect(isValidTickerFormat("AAPL")).toBe(true);
      expect(isValidTickerFormat("MSFT")).toBe(true);
      expect(isValidTickerFormat("BRK")).toBe(true);
    });

    it("accepts share-class suffix variants", () => {
      expect(isValidTickerFormat("BRK.B")).toBe(true);
      expect(isValidTickerFormat("RDS-A")).toBe(true);
    });

    it("rejects lowercase + bad chars + overlong", () => {
      expect(isValidTickerFormat("aapl")).toBe(false);
      expect(isValidTickerFormat("TOOLONGTICKER")).toBe(false);
      expect(isValidTickerFormat("AAPL!")).toBe(false);
      expect(isValidTickerFormat("1234")).toBe(false);
    });
  });

  describe("removeSymbol", () => {
    it("removes a symbol from any list (system included)", () => {
      const lists = loadWatchlists();
      const next = removeSymbol(lists, WATCHLIST_SYSTEM_ID, "AAPL");
      const sys = next.find((l) => l.id === WATCHLIST_SYSTEM_ID)!;
      expect(sys.symbols.find((s) => s.symbol === "AAPL")).toBeUndefined();
    });
  });

  describe("subscription source (useSyncExternalStore)", () => {
    it("emits a snapshot to subscribers when saveWatchlists is called", () => {
      installInMemoryStorage();
      const initial = __watchlistInternal.getSnapshot();
      const created = unwrap(createWatchlist(initial.lists, "Tech", []));
      // Capture before-save listener count for invariant check.
      const cursor = {
        seen: null as null | { lists: number; activeId: string },
      };
      const unsub = __watchlistInternal.subscribe(() => {
        const s = __watchlistInternal.getSnapshot();
        cursor.seen = { lists: s.lists.length, activeId: s.activeId };
      });
      saveWatchlists([...initial.lists, created]);
      expect(created.id).toBeTruthy();
      expect(cursor.seen).not.toBeNull();
      expect(cursor.seen!.lists).toBe(initial.lists.length + 1);
      unsub();
    });

    it("emits a snapshot to subscribers when saveActiveWatchlistId is called", () => {
      installInMemoryStorage();
      const initial = __watchlistInternal.getSnapshot();
      const created = unwrap(createWatchlist(initial.lists, "Tech 2", []));
      saveWatchlists([...initial.lists, created]);
      const cursor: Array<string | null> = [null];
      const unsub = __watchlistInternal.subscribe(() => {
        const s = __watchlistInternal.getSnapshot();
        cursor[0] = s.activeId;
      });
      saveActiveWatchlistId(created.id);
      expect(cursor[0]).toBe(created.id);
      unsub();
    });

    it("does NOT fire when the same lists/activeId are re-written", () => {
      installInMemoryStorage();
      saveWatchlists(loadWatchlists()); // no-op
      let fired = 0;
      const unsub = __watchlistInternal.subscribe(() => {
        fired += 1;
      });
      saveActiveWatchlistId(WATCHLIST_SYSTEM_ID); // already system
      expect(fired).toBe(0);
      unsub();
    });

    it("getServerSnapshot never touches window", () => {
      teardownStorage();
      const server = __watchlistInternal.getServerSnapshot();
      expect(server.lists.length).toBe(1);
      expect(server.lists[0].isSystem).toBe(true);
      installInMemoryStorage();
    });

    it("cross-tab bridge fires subscribers when a `storage` event arrives", () => {
      installInMemoryStorage();
      const initial = __watchlistInternal.getSnapshot();
      const created = unwrap(createWatchlist(initial.lists, "Bridge Test", []));
      saveWatchlists([...initial.lists, created]);

      const win = (globalThis as any).window;
      win.localStorage.setItem("vantage.watchlists.activeId", created.id);

      const cursor: Array<string | null> = [null];
      const unsub = __watchlistInternal.subscribe(() => {
        cursor[0] = __watchlistInternal.getSnapshot().activeId;
      });

      // Synthesize a storage event from another tab. The bridge inside
      // `subscribe` re-reads localStorage and notifies every subscriber.
      win.__fireStorageEvent("vantage.watchlists.activeId");
      expect(cursor[0]).toBe(created.id);
      unsub();
    });
  });
});
