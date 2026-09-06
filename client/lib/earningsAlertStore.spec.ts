import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadSnoozed,
  saveSnoozed,
  loadHistory,
  saveHistory,
  appendHistory,
  pruneExpiredSnoozed,
  pruneOldHistory,
  snoozeAlert,
  alertKey,
  EARNINGS_ALERT_STORAGE_HISTORY,
  EARNINGS_ALERT_STORAGE_SNOOZED,
} from "./earningsAlertStore";

// In-memory storage stub to keep tests free of happy-dom / jsdom (the
// project's vitest config doesn't ship one). Mirrors the watchlistStore
// spec's pattern.

function installInMemoryStorage() {
  const backing = new Map<string, string>();
  const stub = {
    getItem: (k: string) =>
      backing.has(k) ? (backing.get(k) as string) : null,
    setItem: (k: string, v: string) => backing.set(k, String(v)),
    removeItem: (k: string) => backing.delete(k),
    clear: () => backing.clear(),
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    get length() {
      return backing.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: stub },
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
}

describe("earningsAlertStore", () => {
  beforeEach(() => {
    installInMemoryStorage();
  });
  afterEach(() => {
    teardownStorage();
  });

  describe("alertKey", () => {
    it("uppercases the symbol and joins with a pipe", () => {
      expect(alertKey("2025-09-15", "aapl")).toBe("2025-09-15|AAPL");
      expect(alertKey("2025-09-15", "AAPL ")).toBe("2025-09-15|AAPL");
    });
  });

  describe("snooze + persistence", () => {
    it("returns empty on first load", () => {
      expect(loadSnoozed()).toEqual({});
    });

    it("round-trips through save → load", () => {
      const stub = (globalThis as any).window.localStorage;
      const map = {
        "2025-09-15|AAPL": { snoozedAt: 100, expiresAt: 100 + 24 * 3600_000 },
      };
      saveSnoozed(map);
      expect(stub.getItem(EARNINGS_ALERT_STORAGE_SNOOZED)).not.toBeNull();
      expect(loadSnoozed()).toEqual(map);
    });

    it("snoozeAlert inserts a 24h-TTL entry", () => {
      const out = snoozeAlert({}, "2025-09-15|AAPL", 1_000_000);
      expect(out["2025-09-15|AAPL"]).toEqual({
        snoozedAt: 1_000_000,
        expiresAt: 1_000_000 + 24 * 3600_000,
      });
    });

    it("pruneExpiredSnoozed drops expired entries", () => {
      const now = 1_000_000;
      const map = {
        "2025-09-15|AAPL": { snoozedAt: now - 1_000_000, expiresAt: now - 100 },
        "2025-09-16|MSFT": { snoozedAt: now, expiresAt: now + 1_000_000 },
      };
      const out = pruneExpiredSnoozed(map, now);
      expect(Object.keys(out)).toEqual(["2025-09-16|MSFT"]);
    });

    it("falls back to {} on corrupt JSON", () => {
      const stub = (globalThis as any).window.localStorage;
      stub.setItem(EARNINGS_ALERT_STORAGE_SNOOZED, "{not-valid-json");
      expect(loadSnoozed()).toEqual({});
    });
  });

  describe("history", () => {
    it("returns empty on first load", () => {
      expect(loadHistory()).toEqual([]);
    });

    it("dedupes by key (latest wins) and caps at 50", () => {
      let entries = [];
      for (let i = 0; i < 60; i++) {
        entries = appendHistory(entries, {
          key: `day|${i}`,
          symbol: "X" + i,
          date: "2099-09-15",
          action: "dismissed",
          ts: i,
        });
      }
      expect(entries).toHaveLength(50);
      expect(entries[0].key).toBe("day|59");

      // re-appending the same key overrides earlier
      entries = appendHistory(entries, {
        key: "day|2",
        symbol: "X2",
        date: "2099-09-15",
        action: "opened",
        ts: 9999,
      });
      expect(entries.filter((e) => e.key === "day|2")).toHaveLength(1);
      expect(entries.find((e) => e.key === "day|2")?.action).toBe("opened");
    });

    it("pruneOldHistory keeps entries on/after today", () => {
      const entries = [
        {
          key: "yest|AAPL",
          symbol: "AAPL",
          date: "2000-01-01",
          action: "dismissed" as const,
          ts: 1,
        },
        {
          key: "today|MSFT",
          symbol: "MSFT",
          date: "2099-09-15",
          action: "opened" as const,
          ts: 2,
        },
      ];
      const out = pruneOldHistory(entries, "2099-09-15");
      expect(out).toHaveLength(1);
      expect(out[0].key).toBe("today|MSFT");
    });

    it("falls back to [] on non-array JSON", () => {
      const stub = (globalThis as any).window.localStorage;
      stub.setItem(EARNINGS_ALERT_STORAGE_HISTORY, '{"not":"array"}');
      expect(loadHistory()).toEqual([]);
    });
  });

  describe("SSR safety", () => {
    it("all loaders return safe empty values when window is undefined", () => {
      teardownStorage();
      expect(loadSnoozed()).toEqual({});
      expect(loadHistory()).toEqual([]);
      // save is a no-op; doesn't throw
      saveSnoozed({});
      saveHistory([]);
    });
  });
});
