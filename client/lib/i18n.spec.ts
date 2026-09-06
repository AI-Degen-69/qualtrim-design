import { describe, expect, it } from "vitest";
import {
  getPluralCategory,
  resolvePluralKey,
  translateCountry,
  translateSector,
  enDict,
  heDict,
} from "./i18n";
import { solveTemplate } from "./icu";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Read a source file and extract all static string arguments to i18n `t(...)`.
 *
 * IMPORTANT: This is a STATIC ANALYSIS heuristic. It catches ONLY string-literal
 * keys passed to a function named `t`. Dynamic keys (`t(dynamicName)`) and
 * keys from other libraries' `t()` functions in test files are NOT extracted.
 *
 * Matches:
 *   - `t("literal.key")` / `t('literal.key')`
 *   - `t("key", { vars })`
 *
 * Skips spec/test files entirely — they often have their own `t` helpers for
 * time-formatting or assertions that aren't i18n-related.
 */
function extractTCallKeys(filePath: string): string[] {
  const raw = readFileSync(filePath, "utf-8");
  const keys: string[] = [];

  // Match `t("...")` or `t('...')` — static string literal keys passed to
  // the i18n `t()` function. This deliberately avoids catching:
  //   - Backtick template literals: t(`...${expr}...`)
  //   - Variable arguments: t(variableName)
  //   - t() calls in .spec.ts files (filtered at the caller level)
  const doubleQRe = /t\(\s*"([^"']+)"\s*[,)]/g;
  let m: RegExpExecArray | null;
  while ((m = doubleQRe.exec(raw)) !== null) {
    keys.push(m[1]);
  }

  const singleQRe = /t\(\s*'([^"']+)'\s*[,)]/g;
  while ((m = singleQRe.exec(raw)) !== null) {
    keys.push(m[1]);
  }

  return keys;
}

/**
 * Plural suffixes used by the dictionary.
 */
const PLURAL_SUFFIXES = ["_one", "_two", "_few", "_many", "_other"] as const;

/**
 * Check whether a base key has at least one plural-form entry in the dict.
 */
function hasPluralForm(key: string, dict: Record<string, string>): boolean {
  for (const sfx of PLURAL_SUFFIXES) {
    if (`${key}${sfx}` in dict) return true;
  }
  return false;
}

/**
 * Check whether a key exists in the dict (either as bare key or plural form).
 */
function keyExists(key: string, dict: Record<string, string>): boolean {
  if (key in dict) return true;
  if (hasPluralForm(key, dict)) return true;
  return false;
}

// ── Source file discovery ────────────────────────────────────────────────

/**
 * Discover all client-side source files (.ts, .tsx) excluding:
 *   - Test files (*.spec.ts, *.spec.tsx)
 *   - The dictionary file itself (i18n.tsx)
 *   - node_modules
 */
function discoverSourceFiles(): string[] {
  // `globSync` from node:fs (Node 22+) with `ignore` sometimes has issues
  // with path separators on Windows, so we filter results manually.
  const root = process.cwd();

  // Use a broad glob and filter
  const allFiles = globSync("client/**/*.{ts,tsx}", {
    cwd: root,
  });

  return allFiles.filter((f) => {
    const normalized = f.replace(/\\/g, "/");
    // Exclude test files
    if (normalized.includes(".spec.")) return false;
    // Exclude the dictionary file itself
    if (
      normalized.endsWith("lib/i18n.tsx") ||
      normalized.endsWith("lib/i18n.ts")
    )
      return false;
    // Exclude node_modules (just in case)
    if (normalized.includes("node_modules")) return false;
    return true;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("getPluralCategory", () => {
  describe("English (modern CLDR)", () => {
    it("returns 'one' for n === 1", () => {
      expect(getPluralCategory("en", 1)).toBe("one");
    });

    it("returns 'other' for n === 0 (the falsy-zero pitfall)", () => {
      // CRITICAL: count === 0 must NOT be treated as "no count provided".
      // English uses "0 events" (plural).
      expect(getPluralCategory("en", 0)).toBe("other");
    });

    it("returns 'other' for any n !== 1", () => {
      expect(getPluralCategory("en", 2)).toBe("other");
      expect(getPluralCategory("en", 5)).toBe("other");
      expect(getPluralCategory("en", 100)).toBe("other");
      expect(getPluralCategory("en", -1)).toBe("other");
    });
  });

  describe("Hebrew (modern CLDR with opt-in _two)", () => {
    it("returns 'one' for n === 1", () => {
      expect(getPluralCategory("he", 1)).toBe("one");
    });

    it("returns 'two' for n === 2 (rare grammatical form)", () => {
      expect(getPluralCategory("he", 2)).toBe("two");
    });

    it("returns 'other' for n === 0 and large counts", () => {
      expect(getPluralCategory("he", 0)).toBe("other");
      expect(getPluralCategory("he", 3)).toBe("other");
      expect(getPluralCategory("he", 10)).toBe("other");
      expect(getPluralCategory("he", 100)).toBe("other");
    });

    it("returns 'other' for fractional counts (modern CLDR behavior)", () => {
      expect(getPluralCategory("en", 1.5)).toBe("other");
      expect(getPluralCategory("he", 1.5)).toBe("other");
      expect(getPluralCategory("he", 2.7)).toBe("other");
    });

    it("treats 1.0 === 1 as singular (JS strict-equality on number primitives)", () => {
      expect(getPluralCategory("en", 1.0)).toBe("one");
      expect(getPluralCategory("he", 1.0)).toBe("one");
    });
  });

  it("falls back to English rules for unknown languages", () => {
    expect(getPluralCategory("zz", 1)).toBe("one");
    expect(getPluralCategory("zz", 2)).toBe("other");
  });
});

describe("resolvePluralKey", () => {
  describe("count === undefined (legacy path)", () => {
    it("returns the bare key value when present", () => {
      const dict = { legacy: "hello" };
      const result = resolvePluralKey("legacy", undefined, "en", dict);
      expect(result).toEqual({ pickedKey: "legacy", value: "hello" });
    });

    it("returns the bare key when missing (missing-key sentinel)", () => {
      const dict = {};
      const result = resolvePluralKey("missing", undefined, "en", dict);
      expect(result).toEqual({ pickedKey: "missing", value: "missing" });
    });
  });

  describe("English plural chain", () => {
    it("picks _one when count === 1", () => {
      const dict = {
        earnings_one: "1 event",
        earnings_other: "{{count}} events",
        earnings: "",
      };
      expect(resolvePluralKey("earnings", 1, "en", dict)).toEqual({
        pickedKey: "earnings_one",
        value: "1 event",
      });
    });

    it("picks _other when count > 1", () => {
      const dict = {
        earnings_one: "1 event",
        earnings_other: "{{count}} events",
      };
      expect(resolvePluralKey("earnings", 5, "en", dict).pickedKey).toBe(
        "earnings_other",
      );
    });

    it("picks _other when count === 0 (no falsey-zero bypass)", () => {
      const dict = {
        earnings_one: "1 event",
        earnings_other: "no events",
      };
      expect(resolvePluralKey("earnings", 0, "en", dict).pickedKey).toBe(
        "earnings_other",
      );
    });

    it("falls back to bare key when _one/_other are missing", () => {
      const dict = { earnings: "always the same" };
      const result = resolvePluralKey("earnings", 1, "en", dict);
      expect(result).toEqual({
        pickedKey: "earnings",
        value: "always the same",
      });
    });

    it("falls back to _other when only _other exists but count is 1", () => {
      const dict = { earnings_other: "events" };
      expect(resolvePluralKey("earnings", 1, "en", dict).pickedKey).toBe(
        "earnings_other",
      );
    });
  });

  describe("Hebrew plural chain", () => {
    it("picks _two when present and count === 2", () => {
      const dict = {
        items_one: "פריט",
        items_two: "שני פריטים",
        items_other: "{{count}} פריטים",
      };
      expect(resolvePluralKey("items", 2, "he", dict).pickedKey).toBe(
        "items_two",
      );
    });

    it("falls back to _other when _two is absent (he, count === 2)", () => {
      const dict = {
        items_one: "פריט",
        items_other: "{{count}} פריטים",
      };
      expect(resolvePluralKey("items", 2, "he", dict).pickedKey).toBe(
        "items_other",
      );
    });

    it("picks _one when count === 1 regardless of fallback", () => {
      const dict = {
        items_one: "פריט",
        items_other: "{{count}} פריטים",
      };
      expect(resolvePluralKey("items", 1, "he", dict).pickedKey).toBe(
        "items_one",
      );
    });
  });

  describe("missing-form fallthrough", () => {
    it("returns missing-sentinel when every candidate is missing", () => {
      const dict = {};
      const result = resolvePluralKey("ghost", 1, "en", dict);
      expect(result).toEqual({ pickedKey: "ghost", value: "ghost" });
    });

    it("returns missing-sentinel even when count is set", () => {
      const dict = { other_key: "..." };
      const result = resolvePluralKey("ghost", 5, "en", dict);
      expect(result).toEqual({ pickedKey: "ghost", value: "ghost" });
    });
  });
});

describe("t() pipeline integration — resolvePluralKey → solveTemplate", () => {
  function tProdStyle(
    key: string,
    vars: Record<string, string | number>,
    dict: Record<string, string>,
    lang: "en" | "he",
  ): string {
    const count = typeof vars.count === "number" ? vars.count : undefined;
    const looked = resolvePluralKey(key, count, lang, dict);
    return solveTemplate(looked.value, vars, (n) => getPluralCategory(lang, n));
  }

  it("resolves _other entry then runs ICU inline within the resolved value", () => {
    const dict = {
      items_other: "I have {{count, plural, one {# item} other {# items}}}",
    };
    expect(tProdStyle("items", { count: 3 }, dict, "en")).toBe(
      "I have 3 items",
    );
    expect(tProdStyle("items", { count: 1 }, dict, "en")).toBe("I have 1 item");
  });

  it("resolves _two for Hebrew and runs ICU inline within it", () => {
    const dict = {
      items_two: "יש לי {{count, plural, two {שני פריטים} other {# פריטים}}}",
      items_other: "יש לי {{count}} פריטים",
    };
    expect(tProdStyle("items", { count: 2 }, dict, "he")).toBe(
      "יש לי שני פריטים",
    );
  });

  it("simple {{var}} inline substitution composes with the plural pipeline", () => {
    const dict = {
      agents_other:
        "{{count, plural, one {# agent} other {# agents}}} handled {{tickets, plural, one {# ticket} other {# tickets}}}",
    };
    expect(tProdStyle("agents", { count: 3, tickets: 1 }, dict, "en")).toBe(
      "3 agents handled 1 ticket",
    );
    expect(tProdStyle("agents", { count: 1, tickets: 42 }, dict, "en")).toBe(
      "1 agent handled 42 tickets",
    );
  });

  it("legacy {{var}} suffix-only entries round-trip unchanged (backward compat)", () => {
    const dict = {
      metrics_other: "Metrics unavailable for {{ticker}}",
    };
    expect(
      tProdStyle("metrics", { count: 5, ticker: "AAPL" }, dict, "en"),
    ).toBe("Metrics unavailable for AAPL");
  });
});

describe("translateSector", () => {
  // Build a `t`-shaped adapter that reads from a literal dictionary.
  // Production `t()` also runs `solveTemplate` ICU + missing-key warnings;
  // for these tests we only need the lookup chain (no template interpolation
  // in sector.* entries).
  const enT = (key: string) => enDict[key] ?? key;
  const heT = (key: string) => heDict[key] ?? key;

  describe("English locale", () => {
    it("returns the canonical English label for known FMP sectors", () => {
      expect(translateSector(enT, "Technology")).toBe("Technology");
      expect(translateSector(enT, "Healthcare")).toBe("Healthcare");
      expect(translateSector(enT, "Financial Services")).toBe(
        "Financial Services",
      );
      expect(translateSector(enT, "Consumer Cyclical")).toBe(
        "Consumer Cyclical",
      );
      expect(translateSector(enT, "Communication Services")).toBe(
        "Communication Services",
      );
      expect(translateSector(enT, "Information Technology")).toBe(
        "Information Technology",
      );
      expect(translateSector(enT, "Financials")).toBe("Financials");
      expect(translateSector(enT, "Real Estate")).toBe("Real Estate");
      expect(translateSector(enT, "Basic Materials")).toBe("Basic Materials");
      expect(translateSector(enT, "Materials")).toBe("Materials");
    });

    it("EN label matches the enDict value (parity sanity)", () => {
      expect(translateSector(enT, "Technology")).toBe(
        enDict["sector.technology"],
      );
      expect(translateSector(enT, "Healthcare")).toBe(
        enDict["sector.healthcare"],
      );
    });
  });

  describe("Hebrew locale", () => {
    it("returns the localized label for known FMP sectors", () => {
      expect(translateSector(heT, "Technology")).toBe("טכנולוגיה");
      expect(translateSector(heT, "Information Technology")).toBe("טכנולוגיה");
      expect(translateSector(heT, "Healthcare")).toBe("בריאות");
      expect(translateSector(heT, "Financial Services")).toBe(
        "שירותים פיננסיים",
      );
      expect(translateSector(heT, "Financials")).toBe("פיננסים");
      expect(translateSector(heT, "Consumer Cyclical")).toBe("צרכנות מחזורית");
      expect(translateSector(heT, "Communication Services")).toBe("תקשורת");
      expect(translateSector(heT, "Real Estate")).toBe('נדל"ן');
      expect(translateSector(heT, "Utilities")).toBe("תשתיות");
      expect(translateSector(heT, "Materials")).toBe("חומרי גלם");
    });

    it("HE label matches the heDict value (no hardcoded Hebrew in helper)", () => {
      expect(translateSector(heT, "Technology")).toBe(
        heDict["sector.technology"],
      );
      expect(translateSector(heT, "Healthcare")).toBe(
        heDict["sector.healthcare"],
      );
      expect(translateSector(heT, "Real Estate")).toBe(
        heDict["sector.realEstate"],
      );
    });
  });

  describe("graceful fallback for unknown / empty input", () => {
    it("returns raw English when the sector is not in the lookup table", () => {
      // A new FMP sector arriving before translators cover it should
      // surface visibly — both in the heatmap row label and in tooltips —
      // rather than rendering as empty / "sector.unknown".
      expect(translateSector(enT, "Quantum Computing")).toBe(
        "Quantum Computing",
      );
      expect(translateSector(heT, "Quantum Computing")).toBe(
        "Quantum Computing",
      );
    });

    it("returns empty string for null", () => {
      expect(translateSector(enT, null)).toBe("");
      expect(translateSector(heT, null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(translateSector(enT, undefined)).toBe("");
      expect(translateSector(heT, undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(translateSector(enT, "")).toBe("");
      expect(translateSector(heT, "")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(translateSector(enT, "   \t\n")).toBe("");
      expect(translateSector(heT, "   \t\n")).toBe("");
    });

    it("trims around known sectors", () => {
      expect(translateSector(enT, "  Technology  ")).toBe("Technology");
      expect(translateSector(heT, "  Technology  ")).toBe("טכנולוגיה");
    });

    it("trims around unrecognized sectors before returning raw", () => {
      expect(translateSector(enT, "  Quantum Computing  ")).toBe(
        "Quantum Computing",
      );
    });
  });

  describe("dictionary parity — every sector key exists in BOTH enDict and heDict", () => {
    // Pins down the comment-side-of-the-contract: if a translator adds
    // a `sector.*` entry to one language but forgets the other, the
    // localized column will show "sector.<key>" as a missing-key
    // sentinel while the other renders correctly. Catch it here.
    const allDictKeys = Object.keys(enDict).filter((k) =>
      k.startsWith("sector."),
    );
    const enSet = new Set(allDictKeys);
    const heSet = new Set(
      Object.keys(heDict).filter((k) => k.startsWith("sector.")),
    );

    it("has at least one sector key in enDict", () => {
      expect(allDictKeys.length).toBeGreaterThan(0);
    });

    it("every sector.* key in enDict also exists in heDict", () => {
      const missing = allDictKeys.filter((k) => !heSet.has(k));
      expect(
        missing,
        `sector.* present in enDict but missing from heDict: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it("every sector.* key in heDict also exists in enDict", () => {
      const extra = Array.from(heSet).filter((k) => !enSet.has(k));
      expect(
        extra,
        `sector.* present in heDict but missing from enDict: ${extra.join(", ")}`,
      ).toEqual([]);
    });

    it("every sector.* value is non-empty in both dictionaries", () => {
      for (const k of allDictKeys) {
        expect(enDict[k].length).toBeGreaterThan(0);
        expect(heDict[k].length).toBeGreaterThan(0);
      }
    });
  });
});

describe("translateCountry", () => {
  const enT = (key: string) => enDict[key] ?? key;
  const heT = (key: string) => heDict[key] ?? key;

  describe("English locale", () => {
    it("returns canonical English label for known countries", () => {
      expect(translateCountry(enT, "United States")).toBe("United States");
      expect(translateCountry(enT, "USA")).toBe("United States");
      expect(translateCountry(enT, "Israel")).toBe("Israel");
      expect(translateCountry(enT, "China")).toBe("China");
    });
  });

  describe("Hebrew locale", () => {
    it("translates country names into Hebrew", () => {
      expect(translateCountry(heT, "United States")).toBe("ארצות הברית");
      expect(translateCountry(heT, "USA")).toBe("ארצות הברית");
      expect(translateCountry(heT, "Israel")).toBe("ישראל");
      expect(translateCountry(heT, "China")).toBe("סין");
      expect(translateCountry(heT, "Japan")).toBe("יפן");
      expect(translateCountry(heT, "Germany")).toBe("גרמניה");
      expect(translateCountry(heT, "United Kingdom")).toBe("בריטניה");
    });
  });

  describe("fallback & edge cases", () => {
    it("returns empty string for nullish or blank input", () => {
      expect(translateCountry(enT, null)).toBe("");
      expect(translateCountry(heT, undefined)).toBe("");
      expect(translateCountry(heT, "   ")).toBe("");
    });

    it("falls back to raw string for unrecognized countries", () => {
      expect(translateCountry(enT, "Atlantis")).toBe("Atlantis");
      expect(translateCountry(heT, "Atlantis")).toBe("Atlantis");
    });
  });

  describe("dictionary parity — every country key exists in BOTH enDict and heDict", () => {
    const allDictKeys = Object.keys(enDict).filter((k) =>
      k.startsWith("country."),
    );
    const enSet = new Set(allDictKeys);
    const heSet = new Set(
      Object.keys(heDict).filter((k) => k.startsWith("country.")),
    );

    it("every country.* key in enDict also exists in heDict", () => {
      const missing = allDictKeys.filter((k) => !heSet.has(k));
      expect(missing).toEqual([]);
    });

    it("every country.* key in heDict also exists in enDict", () => {
      const extra = Array.from(heSet).filter((k) => !enSet.has(k));
      expect(extra).toEqual([]);
    });
  });
});

// ── Comprehensive i18n key audit ────────────────────────────────────────

describe("i18n key audit — every t() call key exists in both EN and HE dictionaries", () => {
  // Gather all source files (excluding spec files and the dictionary itself)
  const sourceFiles = discoverSourceFiles();

  // Extract keys from all files
  const allKeys = new Map<string, string[]>();
  const filesChecked: string[] = [];

  for (const file of sourceFiles) {
    const keys = extractTCallKeys(file);
    if (keys.length > 0) {
      filesChecked.push(file);
      for (const k of keys) {
        // Filter: only accept keys using dot notation (namespace.key pattern).
        // All i18n keys in this project use dotted names like "nav.insights",
        // "common.search", "earningsCalendar.mon", etc. Single-word matches
        // like "-", ".", "date", "focus" are false positives from unrelated
        // t() function calls in string-manipulation or query-param code.
        if (!k.includes(".") || k.startsWith(".") || k.length < 3) continue;
        const existing = allKeys.get(k) ?? [];
        existing.push(file);
        allKeys.set(k, existing);
      }
    }
  }

  const uniqueKeys = Array.from(allKeys.keys()).sort();

  it("discovers source files with t() calls", () => {
    expect(filesChecked.length).toBeGreaterThan(0);
    console.log(`  Scanned ${sourceFiles.length} source files`);
    console.log(`  Found t() calls in ${filesChecked.length} files`);
    console.log(
      `  Extracted ${uniqueKeys.length} unique static keys (dotted notation)`,
    );
  });

  // ── EN dictionary audit ──────────────────────────────────────────────
  describe("English dictionary (enDict)", () => {
    const missing: { key: string; files: string[] }[] = [];

    for (const key of uniqueKeys) {
      if (!keyExists(key, enDict)) {
        missing.push({ key, files: allKeys.get(key) ?? [] });
      }
    }

    it("every t() call key has a corresponding entry", () => {
      if (missing.length > 0) {
        const detail = missing
          .slice(0, 20)
          .map(
            (m) =>
              `  MISSING: "${m.key}" — used in:\n${m.files
                .map((f) => `    - ${f}`)
                .join("\n")}`,
          )
          .join("\n");
        expect(
          missing.length,
          `\n${missing.length} key(s) missing from enDict:\n${detail}${missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ""}`,
        ).toBe(0);
      }
    });
  });

  // ── HE dictionary audit ──────────────────────────────────────────────
  describe("Hebrew dictionary (heDict)", () => {
    const missing: { key: string; files: string[] }[] = [];

    for (const key of uniqueKeys) {
      if (!keyExists(key, heDict)) {
        missing.push({ key, files: allKeys.get(key) ?? [] });
      }
    }

    it("every t() call key has a corresponding entry", () => {
      if (missing.length > 0) {
        const detail = missing
          .slice(0, 20)
          .map(
            (m) =>
              `  MISSING: "${m.key}" — used in:\n${m.files
                .map((f) => `    - ${f}`)
                .join("\n")}`,
          )
          .join("\n");
        expect(
          missing.length,
          `\n${missing.length} key(s) missing from heDict:\n${detail}${missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ""}`,
        ).toBe(0);
      }
    });
  });
});
