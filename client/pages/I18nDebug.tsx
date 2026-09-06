import { useMemo, useState } from "react";
import {
  useI18n,
  getPluralCategory,
  getDictionaryForLang,
  discoverPluralBaseKeys,
} from "@/lib/i18n";

/**
 * The fixed count variants every translator needs to eyeball. CLDR rule
 * edges worth checking:
 *   - count=0  → "_other" in both languages (modern Hebrew doesn't pluralize zero)
 *   - count=1  → "_one"  (singular in both languages)
 *   - count=1.5 → "_other" (English + modern Hebrew: fractional goes to other)
 *   - count=2  → "_other" in English, "_two" in Hebrew (the Hebrew dual test)
 *   - count=5  → "_other" in both languages
 */
const COUNT_OPTIONS: number[] = [0, 1, 1.5, 2, 5];

/**
 * DEV-only debug route at /i18n. Renders a side-by-side comparison grid
 * so a translator can confirm, before shipping, that:
 *   - the active language's `_one` form actually fires on count=1
 *   - the Hebrew `_two` form actually says "שני" on count=2
 *   - missing plural forms fall through correctly (no raw `key._one` text)
 *
 * Registered as a top-level route in `client/App.tsx`, gated behind
 * `import.meta.env.DEV` so the file is excluded from production bundles.
 */
export default function I18nDebug() {
  const { lang, t } = useI18n();
  const dict = getDictionaryForLang(lang);
  const baseKeys = useMemo(() => discoverPluralBaseKeys(dict), [dict]);
  const [activeCount, setActiveCount] = useState<number>(1);

  return (
    <div className="w-full bg-background dark min-h-screen">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700 px-8 py-6">
        <h1 className="text-2xl font-bold text-foreground">
          i18n Plural QA{" "}
          <span className="text-slate-500 font-mono text-base">
            {lang === "he" ? "(עברית)" : "(English)"}
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          dev-only — verifies {"{{count}}"} plural pipeline; route is gated
          behind import.meta.env.DEV
        </p>
        <p className="text-xs text-slate-500 mt-2">
          {baseKeys.length} plural base key{baseKeys.length === 1 ? "" : "s"} ·{" "}
          {COUNT_OPTIONS.length} count variants ·{" "}
          {lang === "he"
            ? "Hebrew dual `_two` should produce text containing שני on count=2"
            : "no Hebrew dual in EN — confirm `_two` falls through to `_other`"}
        </p>
      </header>

      {/* Count selector chips */}
      <div className="px-8 py-6 border-b border-slate-700 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-slate-400 font-medium">
          Highlight count:
        </span>
        {COUNT_OPTIONS.map((c) => {
          const isActive = activeCount === c;
          return (
            <button
              key={c}
              onClick={() => setActiveCount(c)}
              className={
                "px-3 py-1.5 rounded font-mono text-sm transition-colors border " +
                (isActive
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-700/60")
              }
              aria-pressed={isActive}
            >
              {c}
            </button>
          );
        })}
        <span className="ml-2 text-xs text-slate-500 font-mono">
          (active count column highlighted below)
        </span>
      </div>

      {/* Comparison grid */}
      <div className="px-8 py-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm" dir="ltr">
          <thead>
            <tr>
              <th className="text-left text-xs uppercase tracking-wider text-slate-500 p-3 border-b border-slate-700 align-bottom">
                Base key
              </th>
              {COUNT_OPTIONS.map((c) => (
                <th
                  key={c}
                  className={
                    "p-3 border-b border-slate-700 align-bottom " +
                    (c === activeCount ? "bg-blue-900/20" : "")
                  }
                >
                  <div
                    className={
                      "text-xs uppercase tracking-wider font-mono " +
                      (c === activeCount ? "text-blue-300" : "text-slate-500")
                    }
                  >
                    count={c}
                  </div>
                  <div
                    className={
                      "text-xs uppercase tracking-wider font-mono mt-1 " +
                      (c === activeCount ? "text-blue-400" : "text-slate-600")
                    }
                  >
                    ({getPluralCategory(lang, c)})
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baseKeys.length === 0 ? (
              <tr>
                <td
                  colSpan={COUNT_OPTIONS.length + 1}
                  className="p-6 text-center text-slate-500 italic"
                >
                  No plural-form keys defined in the {lang} dictionary. Add{" "}
                  <code className="font-mono text-slate-300">some.key_one</code>{" "}
                  /{" "}
                  <code className="font-mono text-slate-300">some.key_two</code>{" "}
                  /{" "}
                  <code className="font-mono text-slate-300">
                    some.key_other
                  </code>{" "}
                  (and optionally{" "}
                  <code className="font-mono text-slate-300">_few</code> /{" "}
                  <code className="font-mono text-slate-300">_many</code>) to
                  populate this grid.
                </td>
              </tr>
            ) : (
              baseKeys.map((baseKey) => (
                <PluralRow
                  key={baseKey}
                  baseKey={baseKey}
                  lang={lang}
                  activeCount={activeCount}
                  t={t}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="px-8 py-6 border-t border-slate-700 text-xs text-slate-500 font-mono">
        <p>
          Tip: switch language via the top-right selector to flip en ↔ he. The
          key_*(category) column picks come straight from{" "}
          <code>getPluralCategory(lang, count)</code>; the resolved text comes
          straight from{" "}
          <code>
            t(baseKey, {"{"} count {"}"})
          </code>
          .
        </p>
      </footer>
    </div>
  );
}

interface PluralRowProps {
  baseKey: string;
  lang: string;
  activeCount: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function PluralRow({ baseKey, lang, activeCount, t }: PluralRowProps) {
  const dict = getDictionaryForLang(lang);
  return (
    <tr className="border-b border-slate-800/50">
      <td className="p-3 align-top">
        <code className="text-sm text-slate-300 font-mono break-words">
          {baseKey}
        </code>
      </td>
      {COUNT_OPTIONS.map((c) => {
        const category = getPluralCategory(lang, c);
        const resolved = t(baseKey, { count: c });
        // Direct form lookup: tells us whether t() resolved to the
        // canonical `${key}_${category}` or fell through to `_other`
        // or the bare key. Only an *empty* result flags as fallback
        // here — if `_two` exists, the cell renders it normally; if
        // it's missing, the resolver picks `_other`, but that IS the
        // intended runtime behavior. We flag a fallback only when
        // even the bare key is missing (i.e. missing-key warn will fire).
        const canonicalKey = `${baseKey}_${category}`;
        const direct = dict[canonicalKey];
        const bare = dict[baseKey];
        const fallback = direct === undefined && bare === undefined;
        const isActive = c === activeCount;
        return (
          <td
            key={c}
            className={
              "p-3 align-top max-w-xs align-text-top " +
              (isActive ? "bg-blue-900/20" : "")
            }
          >
            <div
              className="text-sm text-foreground break-words"
              dir={lang === "he" ? "rtl" : "ltr"}
            >
              {resolved}
            </div>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-400 font-mono">
                {category}
              </span>
              {fallback && (
                <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  missing
                </span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
