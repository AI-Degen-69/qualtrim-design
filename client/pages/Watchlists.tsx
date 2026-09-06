import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import DipFinder from "@/components/DipFinder";
import { AddWatchlistSheet } from "@/components/AddWatchlistSheet";
import EagerLogoWarmer from "@/components/EagerLogoWarmer";
import TickerLogo from "@/components/TickerLogo";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BatchQuoteFallbackHint from "@/components/BatchQuoteFallbackHint";
import {
  useBatchQuotes,
  useEarningsCalendar,
  useWatchlistNews,
  useYahooDown,
} from "@/hooks/useStockData";
import { useWatchlists, useInlineRename } from "@/hooks/useWatchlists";
import {
  applyDragReorder,
  type WatchlistSymbolEntry,
} from "@/lib/watchlistStore";
import { formatTimeAgo } from "@/lib/formatTimeAgo";

/**
 * Watchlists page with user-defined lists. The seeded `defaultWatchlist`
 * (from `lib/mockData`) is now wrapped in a system-flagged `Watchlist`
 * record inside the `useWatchlists()` store, alongside any user-created
 * lists persisted under `localStorage["vantage.watchlists"]`.
 *
 * Layout (left → right):
 *   1. List switcher strip with chips per list + "+ Add" trigger
 *   2. Active-list title (inline-editable for non-system lists)
 *   3. Symbol table with HTML5 drag-reorder + per-symbol delete button
 *   4. Sidebar: DipFinder, upcoming earnings, recent live news
 *
 * System list (`Market Leaders`) keeps its 11 seeded tickers and is
 * never deletable or renamable; symbols inside it CAN be reordered.
 */
export function Watchlists() {
  const { t } = useI18n();
  const wl = useWatchlists();
  const [addOpen, setAddOpen] = useState(false);

  // Active list's symbol array; safe even mid-mutation.
  const active = wl.active;
  const symbols = useMemo(
    () => (active?.symbols ?? []).map((s) => s.symbol),
    [active],
  );
  const symbolNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of active?.symbols ?? []) {
      if (s.name) map.set(s.symbol, s.name);
    }
    return map;
  }, [active]);

  // Earliest-today → +14 days covers the next two earnings windows for any
  // active list without spamming the calendar endpoint.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const horizon = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: batch } = useBatchQuotes(symbols);
  const { data: earnings, isLoading: earningsLoading } = useEarningsCalendar(
    today,
    horizon,
  );
  const {
    items: newsItems,
    isLoading: newsLoading,
    isAnyFailing,
  } = useWatchlistNews(symbols, 12);

  // Batch quotes degrade to per-symbol Yahoo and the news feed is Yahoo-only
  // — when Yahoo is down both show mock/stale content, so badge [MOCK] from
  // the health probe instead of waiting for the data to fail.
  const yahooDown = useYahooDown();

  // Track where the user is currently dragging within the table so the
  // hovered row gets a "drop here" highlight. Index-based because the
  // table is shorter than 100 rows; storing the datum is cheaper.
  const [pendingDragIndex, setPendingDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
      setPendingDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
      if (pendingDragIndex === null) return;
      e.preventDefault(); // allow drop
      e.dataTransfer.dropEffect = "move";
      if (hoverIndex !== index) setHoverIndex(index);
    },
    [pendingDragIndex, hoverIndex],
  );

  const handleDrop = useCallback(
    (dropIndex: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
      e.preventDefault();
      if (pendingDragIndex === null || !active) return;
      const next = applyDragReorder(
        active.symbols,
        pendingDragIndex,
        dropIndex,
      );
      wl.reorderSymbols(active.id, next);
      setPendingDragIndex(null);
      setHoverIndex(null);
    },
    [pendingDragIndex, active, wl],
  );

  const handleDragEnd = useCallback(() => {
    setPendingDragIndex(null);
    setHoverIndex(null);
  }, []);

  // Earnings sidebar — filter earnings to the active list's symbol set.
  const watchlistEarnings = useMemo(() => {
    if (!earnings) return [];
    const symbolSet = new Set(symbols);
    return earnings
      .filter((e) => symbolSet.has(e.symbol))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 5);
  }, [earnings, symbols]);

  // ── Rename UX ──
  const rename = useInlineRename(active?.name ?? "", (newName) => {
    if (!active) return { ok: false as const, reason: "not_found" };
    return wl.renameWatchlist(active.id, newName);
  });

  const handleDeleteActive = useCallback(() => {
    if (!active) return;
    if (active.isSystem) return; // guard; UI also hides the delete button
    // eslint-disable-next-line no-alert
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("watchlists.confirmDelete", { name: active.name }))
    ) {
      return;
    }
    const result = wl.deleteWatchlist(active.id);
    // Explicit narrowing — same TS quirk as the Add sheet's handleSubmit.
    if (result.ok === false && result.reason === "is_system") {
      if (import.meta.env.DEV)
        console.warn("[Watchlists] system list cannot be deleted");
    }
  }, [active, wl, t]);

  return (
    <div className="w-full bg-background dark min-h-screen p-8">
      {/* Pre-resolve Logo.dev tier assignments for every row's ticker so
          TickerLogo mounts on /insights, /stock/<ticker>, and slide-overs
          read the cache instead of doing the onError dance at first paint.
          Renders nothing — purely a side-effect host. */}
      <EagerLogoWarmer />
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          eyebrow={t("nav.watchlists")}
          title={t("nav.watchlists")}
          description={t("watchlists.description")}
          actions={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 me-1.5" />
              {t("watchlists.addButton")}
            </Button>
          }
        />

        {/* Watchlist switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {wl.lists.map((list) => {
            const isActive = list.id === wl.activeId;
            return (
              <button
                key={list.id}
                onClick={() => wl.setActiveId(list.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-secondary/40 border-border text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span>{list.name}</span>
                {list.isSystem && (
                  <span className="text-xs uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {t("watchlists.systemBadge")}
                  </span>
                )}
                <span
                  className="text-xs text-muted-foreground font-mono"
                  dir="ltr"
                >
                  {list.symbols.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active-list title row (with inline rename + delete) */}
        {active && (
          <div className="flex items-center gap-3">
            {rename.isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={rename.name}
                  onChange={(e) => rename.setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename.commitEdit();
                    else if (e.key === "Escape") rename.cancelEdit();
                  }}
                  className="text-xl h-9 w-64"
                  autoFocus
                />
                <Button size="sm" onClick={() => rename.commitEdit()}>
                  {t("watchlists.renameButton")}
                </Button>
                <Button size="sm" variant="ghost" onClick={rename.cancelEdit}>
                  {t("watchlists.cancelButton")}
                </Button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-foreground">
                  {active.name}
                </h2>
                {!active.isSystem && (
                  <button
                    onClick={rename.beginEdit}
                    title={t("watchlists.renameButton")}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label="rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {active.isSystem && (
                  <span
                    title={t("watchlists.cannotRenameSystem")}
                    className="text-xs uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-1 rounded"
                  >
                    {t("watchlists.systemBadge")}
                  </span>
                )}
                <div className="ms-auto flex items-center gap-2">
                  {!active.isSystem && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDeleteActive}
                      title={t("watchlists.deleteButton")}
                      className="text-chart-negative hover:text-chart-negative/80"
                    >
                      <Trash2 className="w-4 h-4 me-1.5" />
                      {t("watchlists.deleteButton")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Main symbol table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden relative">
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
            {(!batch?.quotes || batch.quotes.length === 0 || yahooDown) &&
              symbols.length > 0 && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  [MOCK]
                </span>
              )}
            <BatchQuoteFallbackHint />
          </div>
          {symbols.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-sm mb-4">
                {t("watchlists.empty")}
              </p>
              <Button
                onClick={() => setAddOpen(true)}
                size="sm"
                variant="outline"
              >
                <Plus className="w-4 h-4 me-1.5" />
                {t("watchlists.addButton")}
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm text-start">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="px-3 py-3 w-8" aria-label="grip" />
                  <th className="px-6 py-3 font-medium">
                    {t("common.symbol")}
                  </th>
                  <th className="px-6 py-3 font-medium">{t("common.name")}</th>
                  <th className="px-6 py-3 font-medium text-right">
                    {t("common.price")}
                  </th>
                  <th className="px-6 py-3 font-medium text-right">
                    {t("common.change")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(active?.symbols ?? []).map((entry, index) => {
                  const quote = batch?.quotes?.find(
                    (q) => q?.symbol === entry.symbol,
                  );
                  const price = quote?.price;
                  const change = quote?.changesPercentage;
                  const cls =
                    change === undefined
                      ? "text-muted-foreground"
                      : change >= 0
                        ? "text-chart-positive"
                        : "text-chart-negative";
                  const sign = change === undefined || change < 0 ? "" : "+";
                  const isDragged = pendingDragIndex === index;
                  const isHover =
                    hoverIndex === index &&
                    pendingDragIndex !== null &&
                    pendingDragIndex !== index;
                  return (
                    <tr
                      key={entry.symbol}
                      draggable
                      onDragStart={handleDragStart(index)}
                      onDragOver={handleDragOver(index)}
                      onDrop={handleDrop(index)}
                      onDragEnd={handleDragEnd}
                      className={`border-b border-border last:border-0 transition-colors ${
                        isDragged
                          ? "opacity-50"
                          : isHover
                            ? "bg-primary/10"
                            : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-3 py-3 cursor-grab text-muted-foreground hover:text-foreground select-none">
                        <GripVertical className="w-4 h-4" />
                      </td>
                      <td className="px-6 py-3 font-bold">
                        <Link
                          to={`/stock/${entry.symbol}`}
                          className="hover:text-primary transition-colors"
                        >
                          {entry.symbol}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {entry.name ?? symbolNames.get(entry.symbol) ?? "—"}
                      </td>
                      <td
                        className="px-6 py-3 text-right font-medium font-mono tabular-nums"
                        dir="ltr"
                      >
                        {price !== undefined && Number.isFinite(price)
                          ? `$${price.toFixed(2)}`
                          : "—"}
                      </td>
                      <td
                        className={`px-6 py-3 text-right font-medium font-mono tabular-nums ${cls}`}
                        dir="ltr"
                      >
                        {change === undefined || !Number.isFinite(change)
                          ? "—"
                          : `${sign}${change.toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-3 text-end">
                        <button
                          onClick={() =>
                            wl.removeSymbol(active!.id, entry.symbol)
                          }
                          className="text-muted-foreground hover:text-chart-negative transition-colors"
                          title="Remove"
                          aria-label="remove symbol"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center" dir="ltr">
          {t("watchlists.dropToReorder")}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          {/* Sidebar */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-8">
            <DipFinder />

            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
                <span>{t("dipFinder.upcomingEarnings")}</span>
              </h3>
              <div className="space-y-4">
                {earningsLoading ? (
                  <p className="text-xs text-muted-foreground">…</p>
                ) : watchlistEarnings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("watchlists.noUpcoming")}
                  </p>
                ) : (
                  watchlistEarnings.map((e) => {
                    const timeLabel =
                      e.time === "bmo"
                        ? "earningsCalendar.beforeOpen"
                        : "earningsCalendar.afterClose";
                    const name = symbolNames.get(e.symbol) ?? e.symbol;
                    return (
                      <div
                        key={`${e.symbol}-${e.date}`}
                        className="flex justify-between items-center border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <TickerLogo ticker={e.symbol} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate text-foreground">
                              {name}
                            </p>
                            <p
                              className="text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {e.date}, {t(timeLabel)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-foreground">
                  {t("dipFinder.news")}
                </h3>
                {(newsItems.length === 0 && !newsLoading) ||
                isAnyFailing ||
                yahooDown ? (
                  <span className="text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded text-amber-400 bg-amber-500/10">
                    [MOCK]
                  </span>
                ) : null}
              </div>
              <div className="space-y-4">
                {newsLoading && newsItems.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-3 bg-muted/60 rounded animate-pulse w-11/12" />
                        <div className="h-2.5 bg-muted/40 rounded animate-pulse w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : newsItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("insights.empty.desc")}
                  </p>
                ) : (
                  newsItems.slice(0, 5).map((n, i) => {
                    const ago = formatTimeAgo(n.providerPublishTime, t) ?? "—";
                    return (
                      <a
                        key={`${n.symbol}-${n.link}-${i}`}
                        href={n.link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group border-b border-border last:border-0 pb-4 last:pb-0"
                      >
                        <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2 mb-1 text-foreground">
                          {n.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold">{n.publisher}</span>
                          <span>•</span>
                          <span dir="ltr">{ago}</span>
                          {n.symbol && (
                            <>
                              <span>•</span>
                              <span className="text-muted-foreground">
                                {n.symbol}
                              </span>
                            </>
                          )}
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddWatchlistSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(name, symbols: WatchlistSymbolEntry[]) =>
          wl.createWatchlist(name, symbols)
        }
      />
    </div>
  );
}

export default Watchlists;
