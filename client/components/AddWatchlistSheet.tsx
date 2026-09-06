import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { parseTickers } from "@/lib/parseCsv";
import { useValidateSymbols } from "@/hooks/useStockData";
import type {
  Result,
  Watchlist,
  WatchlistSymbolEntry,
} from "@/lib/watchlistStore";

const MAX_WATCHLIST_SYMBOLS = 50;

interface AddWatchlistSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    name: string,
    symbols: WatchlistSymbolEntry[],
  ) => Result<Watchlist>;
}

/**
 * Right-side sheet for creating a new user watchlist. The sheet is
 * intentionally narrow but tall — name input + symbols textarea at the
 * top so the user can immediately paste a CSV column, then validation
 * chips + submit at the bottom.
 *
 * Validation flow:
 *   1. User types/pastes in the textarea. `parseTickers` gives us the
 *      format-clean list and an honest invalid-set back.
 *   2. We feed the format-clean list to `useValidateSymbols`, which validates
 *      every candidate in bounded batches of eight. Results return as
 *      `valid` (with profile.companyName to seed display names), `invalid`,
 *      or `unavailable` when the API cannot be reached.
 *   3. The submit button only accepts upstream-validated symbols and remains
 *      disabled while validation is in flight or when any result is unavailable.
 *
 * Honest feedback: the user sees both the format-invalid chips (from
 * `parseTickers`) AND the upstream-invalid chips (from the validation
 * hook) so they understand exactly why a paste got truncated — nothing
 * is silently dropped.
 */
export function AddWatchlistSheet({
  open,
  onOpenChange,
  onCreate,
}: AddWatchlistSheetProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [rawSymbols, setRawSymbols] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state when the sheet closes so re-opening starts clean.
  useEffect(() => {
    if (!open) {
      setName("");
      setRawSymbols("");
      setError(null);
    }
  }, [open]);

  // Format-clean list (uppercased, deduped, regex-gated).
  const parsed = useMemo(() => parseTickers(rawSymbols), [rawSymbols]);
  const tooManySymbols = parsed.valid.length > MAX_WATCHLIST_SYMBOLS;
  const candidatesForValidation = useMemo(
    () => (tooManySymbols ? [] : parsed.valid.slice(0, MAX_WATCHLIST_SYMBOLS)),
    [parsed.valid, tooManySymbols],
  );
  const [debouncedCandidates, setDebouncedCandidates] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedCandidates(candidatesForValidation),
      250,
    );
    return () => clearTimeout(timer);
  }, [candidatesForValidation]);
  const validated = useValidateSymbols(debouncedCandidates);
  const validationIsCurrent =
    debouncedCandidates.length === candidatesForValidation.length &&
    debouncedCandidates.every(
      (symbol, index) => symbol === candidatesForValidation[index],
    );
  // Ignore the previous query's result during the debounce window. Otherwise a
  // fast edit could briefly enable submission for symbols that are no longer
  // the current textarea value.
  const currentValid = validationIsCurrent ? validated.valid : [];
  const currentInvalid = validationIsCurrent ? validated.invalid : [];
  const currentUnavailable = validationIsCurrent ? validated.unavailable : [];

  // Display names come from the validated profiles when we have them;
  // otherwise we fall back to whatever the system knows about the symbol.
  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const { symbol, profile } of currentValid) {
      if (profile.companyName) map.set(symbol, profile.companyName);
    }
    return map;
  }, [currentValid]);

  // Preview only covers candidates currently eligible for upstream validation;
  // an over-limit paste is rejected without leaving 51+ symbols in a pending state.
  const formatInvalidPreview = parsed.invalid;
  const invalidSymbols = useMemo(
    () => Array.from(new Set([...formatInvalidPreview, ...currentInvalid])),
    [formatInvalidPreview, currentInvalid],
  );
  const preview: Array<{
    symbol: string;
    displayName: string | null;
    state: "valid" | "invalid" | "pending" | "unavailable";
  }> = useMemo(() => {
    const validSet = new Set(currentValid.map((v) => v.symbol));
    const invalidSet = new Set(currentInvalid);
    const unavailableSet = new Set(currentUnavailable);
    return candidatesForValidation.map((sym) => {
      if (validSet.has(sym)) {
        return {
          symbol: sym,
          displayName: displayNames.get(sym) ?? null,
          state: "valid" as const,
        };
      }
      if (invalidSet.has(sym)) {
        return { symbol: sym, displayName: null, state: "invalid" as const };
      }
      if (unavailableSet.has(sym)) {
        return {
          symbol: sym,
          displayName: null,
          state: "unavailable" as const,
        };
      }
      return { symbol: sym, displayName: null, state: "pending" as const };
    });
  }, [
    candidatesForValidation,
    currentValid,
    currentInvalid,
    currentUnavailable,
    displayNames,
  ]);

  const truncatedPreview = preview.slice(0, 48); // keep chip row scannable
  const visibleValidCount = currentValid.length;
  const visibleInvalidCount = invalidSymbols.length;
  const unavailableCount = currentUnavailable.length;

  const canSubmit =
    name.trim().length > 0 &&
    currentValid.length > 0 &&
    validationIsCurrent &&
    unavailableCount === 0 &&
    !tooManySymbols &&
    !validated.isValidating;

  const handleSubmit = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("watchlists.emptyNameError"));
      return;
    }
    if (tooManySymbols) {
      setError(t("watchlists.tooManySymbols", { max: MAX_WATCHLIST_SYMBOLS }));
      return;
    }
    if (unavailableCount > 0) {
      setError(t("watchlists.validationUnavailable"));
      return;
    }
    if (!validationIsCurrent || validated.isValidating) {
      setError(t("watchlists.validatingLabel"));
      return;
    }
    if (currentValid.length === 0) {
      setError(t("watchlists.csvHint"));
      return;
    }
    // Persist only symbols whose upstream profile resolved successfully.
    // Format-clean-but-unknown symbols remain visible as invalid/pending and
    // are never treated as valid merely because they match the ticker regex.
    const accept: WatchlistSymbolEntry[] = currentValid.map(
      ({ symbol, profile }) => ({
        symbol,
        name: profile.companyName || undefined,
      }),
    );

    const result = onCreate(trimmedName, accept);
    // Explicit `result.ok === false` narrowing — TS sometimes loses the
    // union-narrow on callback return types; hard-split the failure path.
    if (result.ok === false) {
      if (result.reason === "empty_name")
        setError(t("watchlists.emptyNameError"));
      else if (result.reason === "duplicate_name")
        setError(t("watchlists.duplicateNameError", { name: trimmedName }));
      return;
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-4"
      >
        <SheetHeader>
          <SheetTitle>{t("watchlists.addTitle")}</SheetTitle>
          <SheetDescription>{t("watchlists.csvHint")}</SheetDescription>
        </SheetHeader>

        {/* Name + symbols form */}
        <div className="space-y-4 px-1">
          <div>
            <label
              htmlFor="watchlist-name"
              className="text-sm font-medium block mb-1.5"
            >
              {t("watchlists.nameLabel")}
            </label>
            <Input
              id="watchlist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("watchlists.namePlaceholder")}
              className="w-full"
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor="watchlist-symbols"
              className="text-sm font-medium block mb-1.5"
            >
              {t("watchlists.symbolsLabel")}
            </label>
            <textarea
              id="watchlist-symbols"
              value={rawSymbols}
              onChange={(e) => setRawSymbols(e.target.value)}
              placeholder={t("watchlists.symbolsPlaceholder")}
              className="w-full h-40 bg-slate-900/40 border border-slate-700 rounded-md p-3 text-sm font-mono text-foreground placeholder-slate-500 outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {/* Validation chips — show what we have after parsing. Live
              upstream-validation chips flip from pending to valid/invalid
              as /api/stock-overview resolves per symbol (cap 8). */}
          {(truncatedPreview.length > 0 ||
            invalidSymbols.length > 0 ||
            tooManySymbols) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">
                  {t("watchlists.validCount", { count: visibleValidCount })}
                </span>
                {validated.isValidating && (
                  <span className="text-xs text-amber-300" dir="ltr">
                    ● {t("watchlists.validatingLabel")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {truncatedPreview.map((p) => (
                  <span
                    key={p.symbol}
                    className={`text-xs font-bold px-2 py-0.5 rounded border ${
                      p.state === "valid"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : p.state === "invalid"
                          ? "bg-red-500/15 text-red-300 border-red-500/30"
                          : p.state === "unavailable"
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                    }`}
                    title={p.displayName ?? p.symbol}
                  >
                    {p.symbol}
                  </span>
                ))}
                {preview.length > truncatedPreview.length && (
                  <span className="text-xs text-slate-500 px-2 py-0.5">
                    +{preview.length - truncatedPreview.length}
                  </span>
                )}
              </div>
              {tooManySymbols && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  {t("watchlists.tooManySymbols", {
                    max: MAX_WATCHLIST_SYMBOLS,
                  })}
                </div>
              )}
              {unavailableCount > 0 && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  {t("watchlists.validationUnavailable")}
                </div>
              )}
              {invalidSymbols.length > 0 && (
                <>
                  <div className="text-xs text-slate-400 font-medium" dir="ltr">
                    {t("watchlists.invalidCount", {
                      count: visibleInvalidCount,
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {invalidSymbols.slice(0, 24).map((s) => (
                      <span
                        key={s}
                        className="text-xs font-bold px-2 py-0.5 rounded border bg-red-500/15 text-red-300 border-red-500/30"
                        title={t("watchlists.invalidChip")}
                      >
                        {s} <X className="w-3 h-3 inline-block -mt-0.5" />
                      </span>
                    ))}
                    {invalidSymbols.length > 24 && (
                      <span
                        className="text-xs text-slate-500 px-2 py-0.5"
                        dir="ltr"
                      >
                        +{invalidSymbols.length - 24}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <SheetFooter className="mt-auto gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("watchlists.cancelButton")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            <Plus className="w-4 h-4 me-1.5" />
            {t("watchlists.createButton")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
