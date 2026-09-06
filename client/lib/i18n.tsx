import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { solveTemplate } from "./icu";

// ── Translations ──────────────────────────────────────────────────────────────

// ── Translations ──────────────────────────────────────────────────────────────

// The en/he string dictionaries live in ./i18n/dictionaries.ts (extracted in
// loop iteration 2). Re-exported here so this module's public API — and every
// importer of enDict/heDict — stays byte-stable.
import { enDict, heDict } from "./i18n/dictionaries";

export { enDict, heDict };

// ── Types ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "vantage-language";
type Lang = "en" | "he";

interface I18nContextValue {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
  dir: "ltr" | "rtl";
  isRtl: boolean;
}

// ── Context ────────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  t: (key: string) => key,
  setLang: () => {},
  dir: "ltr",
  isRtl: false,
});

// ── Plural rules (CLDR) ─────────────────────────────────────────────────────
//
// When callers pass `{ count: n }` to t(), the provider picks the right
// form via these per-language CLDR plural rules. Look-up order:
//
//   `${key}_${category}`  (e.g. `key_one`, `key_two`)
//   ↓ fallback
//   `${key}_other`        (universal English/Hebrew fallback)
//   ↓ fallback
//   `${key}`              (legacy non-pluralized entries)
//
// English (modern CLDR): `one` only when n === 1, `other` otherwise.
//
// Hebrew (modern CLDR post-38): `one` only when n === 1, `other` otherwise.
// The grammar has traditional `one/two/few/other/other` plural forms used in
// Biblical / liturgical Hebrew (e.g. "1 day" ≠ "2 days" ≠ "10 days" ≠
// "1.5 days"), but in modern UI Hebrew those forms rarely surface. We
// surface `_two` as an opt-in for the rare case the dictionary author wants
// "exactly two" wording, and `_many` is reserved for future use. If the
// dictionary lacks the chosen category, the lookup falls through to
// `_other`, then to the bare key, so authors progressively pluralize
// without breaking older strings.
//
// CLDR plural rules reference:
//   https://cldr.unicode.org/index/cldr-spec/plural-rules
export type PluralCategory = "one" | "two" | "few" | "many" | "other";

const pluralRules: Record<string, (n: number) => PluralCategory> = {
  en: (n) => (n === 1 ? "one" : "other"),
  he: (n) => {
    if (n === 1) return "one";
    if (n === 2) return "two";
    return "other";
  },
};

/** Suffixes that mark a dictionary entry as a plural form of a base key. */
const PLURAL_SUFFIXES: PluralCategory[] = [
  "one",
  "two",
  "few",
  "many",
  "other",
];

/**
 * Resolves the active language's plural category for a numeric count.
 * Unknown languages fall back to the English rule.
 */
export function getPluralCategory(lang: string, count: number): PluralCategory {
  const rule = pluralRules[lang] ?? pluralRules.en;
  return rule(count);
}

/**
 * Returns the dictionary backing the active language. Exported for dev-only
 * tooling (e.g. the `/i18n` debug route) that needs to enumerate plural-form
 * keys. Production routes should never consume this directly — go through
 * `useI18n().t(...)` which runs the full interpolation + missing-key path.
 *
 * The returned record is `Object.freeze`-wrapped so a careless caller
 * mutating it (e.g. `dict["foo.bar"] = "..."` in a debug helper) cannot
 * corrupt the live dictionary the `I18nProvider` reads on every render.
 */
export function getDictionaryForLang(
  lang: string,
): Readonly<Record<string, string>> {
  return Object.freeze(lang === "he" ? heDict : enDict) as Readonly<
    Record<string, string>
  >;
}

/**
 * Returns the sorted set of base keys (without `_one`/`_two`/`_other`/etc.
 * suffix) that have at least one plural-form entry in `dict`. Useful for
 * building translator Q&A views that surface every plural variant.
 *
 * Heuristic caveat: any key coincidentally ending in `_one`/`_two`/`_few`/
 * `_many`/`_other` is treated as plural. Verify before treating a missing
 * `_other` row as a translation gap.
 */
export function discoverPluralBaseKeys(dict: Record<string, string>): string[] {
  const bases = new Set<string>();
  for (const fullKey of Object.keys(dict)) {
    for (const suffix of PLURAL_SUFFIXES) {
      const s = `_${suffix}`;
      if (fullKey.endsWith(s)) {
        bases.add(fullKey.slice(0, -s.length));
        break;
      }
    }
  }
  return Array.from(bases).sort();
}

/**
 * Picks the actual dictionary key for a logical key + count. Returns the
 * looked-up value, or — if no candidate exists — falls through to the bare
 * key. When every candidate is missing, returns `{ value: key }` so the
 * caller's missing-key warn fires via the `pickedKey === key` check.
 *
 * CRITICAL FALSY-ZERO NOTE: `count` is checked via `!== undefined`, not by
 * truthiness — `count: 0` is a valid plural case ("0 events") and must NOT
 * be treated as "no count provided".
 *
 * Exported so unit tests can exercise the lookup chain without spinning up
 * React.
 */
export function resolvePluralKey(
  key: string,
  count: number | undefined,
  lang: string,
  dict: Record<string, string>,
): { pickedKey: string; value: string } {
  const candidates: string[] = [];
  if (count !== undefined) {
    const category = getPluralCategory(lang, count);
    candidates.push(`${key}_${category}`);
    // Always offer `_other` as a fallback in case the chosen category is
    // missing in the dict. Skip the redundant push when category IS other.
    if (category !== "other") candidates.push(`${key}_other`);
  }
  candidates.push(key);

  for (const candidate of candidates) {
    const v = dict[candidate];
    if (v !== undefined) return { pickedKey: candidate, value: v };
  }
  return { pickedKey: key, value: dict[key] ?? key };
}

// ── Sector name translation ──────────────────────────────────────────────────
//
// FMP returns sector tags in canonical English (e.g. "Communication Services",
// "Consumer Cyclical"). Translated labels live in this file under
// `sector.<camelCase>` keys; `translateSector(t, sector)` resolves them so
// the heatmap row labels, cell tooltips, slide-over chips, and Insights card
// secondary line all render localized names without each call site rolling
// its own lookup table.
//
// Resolution:
//  - recognized sector → t("sector.<key>")     (works for EN and HE)
//  - unrecognized sector → raw English as-is   (graceful fallback so a new
//                          FMP sector surfaces visibly until translators
//                          cover it, rather than crashing or going blank)
//  - null / undefined / empty / whitespace → "" (so callers can drop
//                          the `<p>` entirely without second-guessing)

/**
 * Map from FMP canonical sector name → i18n key. Centralized so a new sector
 * only needs one entry here (plus its en/he dictionary rows) instead of
 * being missed in three different call sites.
 *
 * Keys MUST stay in lockstep with the `sector.*` entries in the en/he
 * dictionaries above.
 */
const SECTOR_I18N_KEYS: Readonly<Record<string, string>> = {
  Technology: "sector.technology",
  "Information Technology": "sector.informationTechnology",
  Healthcare: "sector.healthcare",
  "Health Care": "sector.healthCare",
  "Financial Services": "sector.financialServices",
  Financials: "sector.financials",
  "Consumer Cyclical": "sector.consumerCyclical",
  "Consumer Discretionary": "sector.consumerDiscretionary",
  "Consumer Defensive": "sector.consumerDefensive",
  "Consumer Staples": "sector.consumerStaples",
  "Communication Services": "sector.communicationServices",
  Telecommunications: "sector.communicationServices",
  "Telecommunication Services": "sector.communicationServices",
  Industrials: "sector.industrials",
  "Industrial Goods": "sector.industrials",
  Energy: "sector.energy",
  "Real Estate": "sector.realEstate",
  Utilities: "sector.utilities",
  "Basic Materials": "sector.basicMaterials",
  Materials: "sector.materials",
};

/**
 * Resolve a FMP sector tag to its localized label.
 *
 * @param t - The active language's `t()` function from `useI18n()`.
 * @param sector - The canonical English sector name from upstream APIs.
 * @returns Localized name for known sectors; raw English for unrecognized
 *   sectors (graceful fallback); "" for empty / nullish input so callers
 *   can simply not render the `<p>`.
 */
export function translateSector(
  t: (key: string) => string,
  sector: string | null | undefined,
): string {
  const trimmed = (sector ?? "").trim();
  if (!trimmed) return "";
  const i18nKey = SECTOR_I18N_KEYS[trimmed];
  if (!i18nKey) return trimmed;
  return t(i18nKey);
}

// ── Country name translation ─────────────────────────────────────────────────
const COUNTRY_I18N_KEYS: Readonly<Record<string, string>> = {
  "United States": "country.unitedStates",
  USA: "country.unitedStates",
  US: "country.unitedStates",
  Israel: "country.israel",
  China: "country.china",
  "United Kingdom": "country.unitedKingdom",
  UK: "country.unitedKingdom",
  "Great Britain": "country.unitedKingdom",
  Canada: "country.canada",
  Japan: "country.japan",
  Germany: "country.germany",
  India: "country.india",
  France: "country.france",
  Switzerland: "country.switzerland",
  Netherlands: "country.netherlands",
  Taiwan: "country.taiwan",
  "Taiwan, Province of China": "country.taiwan",
  "South Korea": "country.southKorea",
  "Korea, Republic of": "country.southKorea",
  Korea: "country.southKorea",
  Australia: "country.australia",
  Brazil: "country.brazil",
  Singapore: "country.singapore",
  Ireland: "country.ireland",
  Sweden: "country.sweden",
  "Hong Kong": "country.hongKong",
  Spain: "country.spain",
  Italy: "country.italy",
  Denmark: "country.denmark",
  Norway: "country.norway",
  Finland: "country.finland",
  Belgium: "country.belgium",
  Austria: "country.austria",
  Mexico: "country.mexico",
  "South Africa": "country.southAfrica",
  "New Zealand": "country.newZealand",
  "Cayman Islands": "country.caymanIslands",
  Bermuda: "country.bermuda",
  Luxembourg: "country.luxembourg",
  "Saudi Arabia": "country.saudiArabia",
  "United Arab Emirates": "country.unitedArabEmirates",
  UAE: "country.unitedArabEmirates",
  Argentina: "country.argentina",
  Chile: "country.chile",
  Colombia: "country.colombia",
  Greece: "country.greece",
  Turkey: "country.turkey",
  Poland: "country.poland",
  Portugal: "country.portugal",
  "Czech Republic": "country.czechRepublic",
  Hungary: "country.hungary",
  Indonesia: "country.indonesia",
  Malaysia: "country.malaysia",
  Philippines: "country.philippines",
  Thailand: "country.thailand",
  Vietnam: "country.vietnam",
  Egypt: "country.egypt",
  Cyprus: "country.cyprus",
};

/**
 * Resolve a country name to its localized label.
 */
export function translateCountry(
  t: (key: string) => string,
  country: string | null | undefined,
): string {
  const trimmed = (country ?? "").trim();
  if (!trimmed) return "";
  const i18nKey = COUNTRY_I18N_KEYS[trimmed];
  if (!i18nKey) return trimmed;
  return t(i18nKey);
}

// ── Asset Type translation ───────────────────────────────────────────────────
const ASSET_TYPE_I18N_KEYS: Readonly<Record<string, string>> = {
  Equity: "screener.assetType.stocks",
  Stock: "screener.assetType.stocks",
  Stocks: "screener.assetType.stocks",
  ETF: "screener.assetType.etf",
  Index: "screener.assetType.index",
  Crypto: "screener.assetType.crypto",
  Fund: "screener.assetType.fund",
  Funds: "screener.assetType.fund",
  Currency: "screener.assetType.currency",
  MoneyMarket: "screener.assetType.moneyMarket",
  "Money Market": "screener.assetType.moneyMarket",
};

export function translateAssetType(
  t: (key: string) => string,
  assetType: string | null | undefined,
): string {
  const trimmed = (assetType ?? "").trim();
  if (!trimmed) return "";
  const i18nKey = ASSET_TYPE_I18N_KEYS[trimmed];
  if (!i18nKey) return trimmed;
  return t(i18nKey);
}

// ── Market Cap tier translation ──────────────────────────────────────────────
const MARKET_CAP_I18N_KEYS: Readonly<Record<string, string>> = {
  "Mega Cap": "marketCap.megaCap",
  Mega: "marketCap.megaCap",
  "Large Cap": "marketCap.largeCap",
  Large: "marketCap.largeCap",
  "Mid Cap": "marketCap.midCap",
  Mid: "marketCap.midCap",
  "Small Cap": "marketCap.smallCap",
  Small: "marketCap.smallCap",
  "Micro Cap": "marketCap.microCap",
  Micro: "marketCap.microCap",
  "Nano Cap": "marketCap.nanoCap",
  Nano: "marketCap.nanoCap",
};

export function translateMarketCap(
  t: (key: string) => string,
  marketCap: string | number | null | undefined,
): string {
  if (marketCap === null || marketCap === undefined || marketCap === "")
    return "—";
  if (typeof marketCap === "number") {
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${marketCap.toLocaleString()}`;
  }
  const trimmed = String(marketCap).trim();
  const i18nKey = MARKET_CAP_I18N_KEYS[trimmed];
  if (i18nKey) return t(i18nKey);
  return trimmed;
}

export function I18nProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (initialLang) return initialLang;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "he") return stored;
      // Check browser language
      const browserLang = navigator.language?.slice(0, 2);
      if (browserLang === "he") return "he";
    }
    return "en";
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.dir = newLang === "he" ? "rtl" : "ltr";
      document.documentElement.lang = newLang;
    }
  }, []);

  // Apply dir/lang on mount
  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const dictionary = lang === "he" ? heDict : enDict;

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      // Plural lookup: when callers pass `{ count: n }`, resolve the plural
      // form per the active language's CLDR rule, then try category-suffixed
      // key, then `_other`, then bare key. Bare-key-fallback preserves
      // backward compatibility with legacy entries that haven't been
      // pluralized yet.
      const count = typeof vars?.count === "number" ? vars.count : undefined;
      const looked = resolvePluralKey(key, count, lang, dictionary);

      let value = looked.value;

      // Missing-key detection: the resolver returns `value === pickedKey === key`
      // only when even the bare key isn't in the dictionary. Interpolated
      // templates that happen to equal the key would also match, but that's
      // an acceptable edge case for a sentinel warning.
      if (looked.pickedKey === key && value === key) {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] missing key: "${key}" (lang=${lang})`);
        }
      }
      // Drive both simple `{{var}}` substitutions and inline `{{var, plural, ...}}`
      // ICU plural patterns through the tiny inline parser. `pluralRule` is
      // bound to the active language so selectors inside case-bodies use the
      // correct CLDR plural categories.
      return solveTemplate(value, vars ?? {}, (n) =>
        getPluralCategory(lang, n),
      );
    },
    [lang],
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      lang,
      t,
      setLang,
      dir: lang === "he" ? "rtl" : "ltr",
      isRtl: lang === "he",
    }),
    [lang, t, setLang],
  );

  return (
    <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
