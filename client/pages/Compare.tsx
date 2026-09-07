import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Search, X, Plus, Scale, TrendingUp, TrendingDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import TickerLogo from "@/components/TickerLogo";
import { useScreenerSearch } from "@/hooks/useStockData";
import {
  COMPARE_GROUPS,
  COMPARE_METRICS,
  compareGroupLabelKey,
  formatCompareChange,
  formatCompareValue,
  metricsByGroup,
  type CompareMetric,
} from "@/lib/compareMetrics";
import type {
  CompanyProfile,
  FinancialStatements,
  StockMetrics,
  StockQuote,
} from "@shared/api";
import { cn } from "@/lib/utils";

export const MAX_TICKERS = 5;
export const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA"] as const;

/**
 * Uppercase / trim / drop empties / de-dupe (order-preserving) / cap.
 * Every ticker path — URL parsing, add, remove — goes through this so the
 * rendered list is always distinct symbols within the 2–5 range.
 */
export function normalizeTickerList(
  raw: readonly string[],
  max: number = MAX_TICKERS,
): string[] {
  const out: string[] = [];
  for (const s of raw) {
    const sym = s.trim().toUpperCase();
    if (!sym || out.includes(sym)) continue;
    if (out.length >= max) break;
    out.push(sym);
  }
  return out;
}

/** Normalized list guaranteed to hold 2–5 symbols (defaults when fewer). */
function validTickers(raw: readonly string[]): string[] {
  const norm = normalizeTickerList(raw);
  return norm.length >= 2 ? norm : [...DEFAULT_TICKERS];
}

interface CompareBundle {
  statements: FinancialStatements;
  metrics: StockMetrics;
  quote: StockQuote | null;
  profile: CompanyProfile | null;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

/**
 * One composite query per ticker — the fan-out is per-ticker, so a compare
 * of N tickers costs O(N) upstream-cached requests, never N×M. Every
 * endpoint it hits (`stock-financials`, `stock-metrics`, `stock-quote`,
 * `stock-overview`) already carries its own server-side cache, so adding a
 * ticker that any other surface fetched recently costs ~0 fresh upstream
 * calls; a brand-new ticker costs exactly 1 statement + 1 metrics fetch.
 */
function useCompareBundles(tickers: string[]) {
  return useQueries({
    queries: tickers.map((sym) => ({
      queryKey: ["compareBundle", sym],
      queryFn: async (): Promise<CompareBundle> => {
        const [statements, metrics, quote, profile] = await Promise.all([
          fetchJSON<FinancialStatements>(
            `/api/stock-financials?symbol=${encodeURIComponent(sym)}&period=annual`,
          ),
          fetchJSON<StockMetrics>(
            `/api/stock-metrics?symbol=${encodeURIComponent(sym)}`,
          ),
          fetchJSON<StockQuote | null>(
            `/api/stock-quote?symbol=${encodeURIComponent(sym)}`,
          ),
          fetchJSON<CompanyProfile | null>(
            `/api/stock-overview?symbol=${encodeURIComponent(sym)}`,
          ),
        ]);
        return { statements, metrics, quote, profile };
      },
      // Snapshot comparison — 5-min staleness is fine. No refetchInterval:
      // a 60s poll would re-pull heavy statements/metrics for every ticker
      // even while the tab sits idle, burning the FMP budget for no benefit.
      staleTime: 5 * 60_000,
    })),
  });
}

/** Delta chip under a value: "+14.3%" / "-5.2%" / "+1.2pp". */
function DeltaChip({
  change,
  metric,
}: {
  change: number;
  metric: CompareMetric;
}) {
  const positive = change >= 0;
  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono tabular-nums",
        positive ? "text-chart-positive" : "text-chart-negative",
      )}
    >
      {positive ? (
        <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
      )}
      {formatCompareChange(change, metric)}
    </span>
  );
}

export default function Compare() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the single source of truth for the comparison: tickers are
  // derived from `?tickers=` on every render, so back/forward navigation and
  // pasted share-links always drive the displayed columns (state never
  // drifts from the address bar). Invalid/duplicate/single-ticker values are
  // normalized through `validTickers` — fewer than two distinct symbols
  // falls back to the page defaults.
  const tickers = useMemo(
    () =>
      validTickers((searchParams.get("tickers") ?? "").split(",")),
    [searchParams],
  );

  // Chip edits push real history entries (not replace), so Back restores the
  // prior comparison.
  const commitTickers = (raw: readonly string[], replace = false) => {
    const next = validTickers(raw);
    setSearchParams(next.length > 0 ? { tickers: next.join(",") } : {}, {
      replace,
    });
  };

  // Ticker autocomplete (same pattern as the Charts page).
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const {
    data: searchData,
    isLoading: searchLoading,
    isError: searchError,
  } = useScreenerSearch(debouncedQuery, 8);
  const searchResults = searchData?.results ?? [];

  const addTicker = (raw: string) => {
    const sym = raw.trim().toUpperCase();
    if (!sym || tickers.includes(sym) || tickers.length >= MAX_TICKERS) return;
    commitTickers([...tickers, sym]);
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const removeTicker = (sym: string) =>
    commitTickers(tickers.filter((s) => s !== sym));

  const bundles = useCompareBundles(tickers);

  // Table model: one row per metric, one cell per ticker.
  const rows = useMemo(() => {
    return COMPARE_METRICS.map((metric) => ({
      metric,
      cells: tickers.map((sym, i) => {
        const bundle = bundles[i]?.data;
        const inputs = bundle
          ? {
              statements: bundle.statements,
              metrics: bundle.metrics,
              quote: bundle.quote,
            }
          : {};
        const value = metric.value(inputs);
        const change = metric.change(inputs);
        return { sym, value, change };
      }),
    }));
  }, [bundles, tickers]);

  const anyLoading = bundles.some((q) => q.isLoading);
  const failedBundles = bundles
    .map((q, i) => (q.isError ? tickers[i] : null))
    .filter((s): s is string => Boolean(s));
  const anyError = failedBundles.length > 0;

  return (
    <div className="w-full bg-background dark min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          eyebrow={t("nav.compare")}
          title={t("compare.title")}
          titleLeadingAdornment={
            <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
          }
          description={t("compare.description", {
            count: COMPARE_METRICS.length,
          })}
          status={anyLoading || anyError ? undefined : "live"}
          source={
            anyLoading || anyError ? undefined : "FMP · Yahoo"
          }
        />

        {/* Ticker picker */}
        <div className="flex flex-col gap-3 p-3 rounded-xl bg-card border border-border">
          <div ref={searchRef} className="relative max-w-md">
            <div className="relative flex items-center">
              <Search
                className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    const trimmed = searchQuery.trim();
                    if (
                      debouncedQuery !== trimmed ||
                      searchLoading ||
                      searchError
                    ) {
                      return;
                    }
                    addTicker(searchResults[0]?.symbol ?? trimmed);
                  }
                }}
                placeholder={t("compare.addPlaceholder")}
                aria-label={t("compare.addPlaceholder")}
                className="w-full pl-9 pr-20 py-2 text-sm bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button
                type="button"
                onClick={() => addTicker(searchQuery)}
                disabled={!searchQuery.trim() || tickers.length >= MAX_TICKERS}
                className="absolute right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t("compare.add")}
              </button>
            </div>

            {isSearchOpen && debouncedQuery.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                {searchLoading ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    {t("charts.searchingStocks")}
                  </div>
                ) : searchError ? (
                  <div className="p-3 text-xs text-chart-negative text-center">
                    {t("charts.searchError")}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    {t("charts.noMatchingStocks", {
                      query: debouncedQuery.toUpperCase(),
                    })}
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.symbol}
                      onClick={() => addTicker(item.symbol)}
                      disabled={tickers.includes(item.symbol)}
                      className="w-full px-3 py-2 text-left hover:bg-muted/60 flex items-center justify-between border-b border-border/40 last:border-0 transition-colors disabled:opacity-40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-foreground">
                          {item.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {item.name}
                        </span>
                      </div>
                      {item.exchange && (
                        <span className="text-[10px] font-mono text-muted-foreground px-1 rounded bg-muted">
                          {item.exchange}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Active ticker chips */}
          <div className="flex flex-wrap items-center gap-2">
            {tickers.map((sym, i) => {
              const bundle = bundles[i];
              const name = bundle?.data?.profile?.companyName;
              return (
                <span
                  key={sym}
                  className="inline-flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-lg border border-border/70 bg-muted/30"
                >
                  <TickerLogo ticker={sym} size="sm" />
                  <span className="font-mono text-xs font-bold text-foreground">
                    {sym}
                  </span>
                  {name && (
                    <span className="hidden sm:inline text-[11px] text-muted-foreground max-w-[140px] truncate">
                      {name}
                    </span>
                  )}
                  <button
                    onClick={() => removeTicker(sym)}
                    aria-label={t("compare.remove", { ticker: sym })}
                    className="ml-1 h-5 w-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              );
            })}
            <span className="text-[11px] text-muted-foreground ms-1">
              {t("compare.maxTickers", { count: MAX_TICKERS })}
            </span>
          </div>
        </div>

        {/* Bundle failure honesty — a failed fetch is an error, not
            "unavailable data": surface it instead of live em dashes. */}
        {anyError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-chart-negative/30 bg-chart-negative/5 px-4 py-3">
            <p className="text-xs text-chart-negative">
              {t("compare.bundleError", {
                symbols: failedBundles.join(", "),
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                for (const q of bundles) {
                  if (q.isError) void q.refetch();
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-muted/40 transition-colors"
            >
              {t("compare.retry")}
            </button>
          </div>
        )}

        {/* Comparison table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-border/80 bg-muted/20">
                  <th className="sticky left-0 bg-card text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground w-[220px] z-10">
                    {t("compare.metricColumn")}
                  </th>
                  {tickers.map((sym, i) => {
                    const profile = bundles[i]?.data?.profile;
                    return (
                      <th
                        key={sym}
                        className="px-3 py-3 text-left align-top min-w-[140px]"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <TickerLogo ticker={sym} size="sm" />
                            <span
                              className="font-mono text-xs font-bold text-foreground"
                              dir="ltr"
                            >
                              {sym}
                            </span>
                          </div>
                          {profile?.companyName && (
                            <span className="text-[11px] text-muted-foreground line-clamp-1">
                              {profile.companyName}
                            </span>
                          )}
                          <span className="inline-flex w-fit items-center px-1 py-px rounded bg-muted/60 border border-border/50 text-[9px] font-mono text-muted-foreground">
                            {(() => {
                              // Statement values use each company's reporting
                              // currency — read the latest income row's
                              // reportedCurrency (by date, not array order),
                              // falling back to the profile currency.
                              const stmts = bundles[i]?.data?.statements;
                              const latestIncome = stmts?.income
                                ?.slice()
                                .sort((a, b) =>
                                  b.date.localeCompare(a.date),
                                )[0];
                              return (
                                latestIncome?.reportedCurrency ??
                                profile?.currency ??
                                "—"
                              );
                            })()}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {COMPARE_GROUPS.map((group) => (
                  <GroupRows
                    key={group}
                    group={group}
                    metrics={metricsByGroup(group)}
                    rows={rows.filter((r) => r.metric.group === group)}
                    loading={anyLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground px-1">
          {t("compare.currencyNote")}
        </p>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  metrics,
  rows,
  loading,
}: {
  group: (typeof COMPARE_GROUPS)[number];
  metrics: CompareMetric[];
  rows: {
    metric: CompareMetric;
    cells: { sym: string; value: number | null; change: number | null }[];
  }[];
  loading: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/10">
        <td
          colSpan={rows[0]?.cells.length ?? 1}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80"
        >
          {t(compareGroupLabelKey(group))}
        </td>
      </tr>
      {metrics.map((metric) => {
        const row = rows.find((r) => r.metric.id === metric.id);
        return (
          <tr
            key={metric.id}
            className="border-b border-border/40 last:border-0 hover:bg-muted/10 transition-colors"
          >
            <td className="sticky left-0 bg-card px-4 py-2.5 text-xs font-medium text-foreground/90 z-10">
              {t(metric.labelKey)}
            </td>
            {row?.cells.map((cell, i) => (
              <td key={`${cell.sym}-${i}`} className="px-3 py-2.5 align-top">
                {loading ? (
                  <span
                    className="block h-4 w-16 animate-pulse rounded bg-muted-foreground/20"
                    aria-hidden="true"
                  />
                ) : cell.value === null ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="font-mono tabular-nums text-xs font-semibold text-foreground"
                      dir="ltr"
                    >
                      {formatCompareValue(cell.value, metric)}
                    </span>
                    {cell.change !== null && (
                      <DeltaChip change={cell.change} metric={metric} />
                    )}
                  </div>
                )}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}