import { useI18n } from "@/lib/i18n";
import { defaultWatchlist } from "@/lib/mockData";
import { useEarningsCalendar } from "@/hooks/useStockData";
import { useEffect, useMemo, useRef, useState } from "react";
import EarningsCard, {
  type EarningsEventData,
} from "@/components/EarningsCard";
import DataStatusBadge from "@/components/DataStatusBadge";
import {
  LayoutGrid,
  CalendarDays,
  Sun,
  Moon,
  Clock,
  Database,
  Sparkles,
} from "lucide-react";

export type MarketCapFilter = "all" | "large" | "mid" | "small";
export type DayTabFilter = "all" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type ViewMode = "grid" | "calendar";

interface EarningsCalendarProps {
  from: string;
  to: string;
  marketCap?: MarketCapFilter;
  watchlistOnly?: boolean;
  focusSymbol?: string;
  focusDate?: string;
  initialDay?: DayTabFilter;
  initialViewMode?: ViewMode;
  onStatusChange?: (status: "live" | "mock") => void;
}

export const mockEarningsEvents: EarningsEventData[] = [
  {
    ticker: "PANW",
    name: "Palo Alto Networks",
    date: "2025-02-24",
    dateFull: "2025-02-24",
    weekday: 1,
    epsEst: 1.48,
    revEst: 2.12,
    time: "After Close",
    surprise: "none",
    marketCap: 114_200_000_000,
    isWatchlist: false,
  },
  {
    ticker: "SNOW",
    name: "Snowflake Inc.",
    date: "2025-02-25",
    dateFull: "2025-02-25",
    weekday: 2,
    epsEst: 0.14,
    revEst: 0.749,
    time: "Before Open",
    surprise: "none",
    marketCap: 52_400_000_000,
    isWatchlist: false,
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    date: "2025-02-26",
    dateFull: "2025-02-26",
    weekday: 3,
    epsEst: 0.65,
    revEst: 28.7,
    time: "After Close",
    surprise: "none",
    marketCap: 3_120_000_000_000,
    isWatchlist: true,
  },
  {
    ticker: "CRM",
    name: "Salesforce, Inc.",
    date: "2025-02-26",
    dateFull: "2025-02-26",
    weekday: 3,
    epsEst: 2.44,
    revEst: 9.35,
    time: "After Close",
    surprise: "none",
    marketCap: 298_600_000_000,
    isWatchlist: true,
  },
  {
    ticker: "DELL",
    name: "Dell Technologies",
    date: "2025-02-27",
    dateFull: "2025-02-27",
    weekday: 4,
    epsEst: 2.05,
    revEst: 24.5,
    time: "After Close",
    surprise: "none",
    marketCap: 98_500_000_000,
    isWatchlist: true,
  },
  {
    ticker: "BABA",
    name: "Alibaba Group",
    date: "2025-02-28",
    dateFull: "2025-02-28",
    weekday: 5,
    epsEst: 2.68,
    revEst: 38.1,
    time: "Before Open",
    surprise: "none",
    marketCap: 215_000_000_000,
    isWatchlist: false,
  },
];

/**
 * Determines whether a market capitalization matches the selected filter.
 */
function inMarketCapBucket(
  mc: number | null | undefined,
  filter: MarketCapFilter,
): boolean {
  if (filter === "all") return true;
  if (mc === null || mc === undefined || !Number.isFinite(mc)) return false;
  if (filter === "large") return mc >= 10_000_000_000;
  if (filter === "mid") return mc >= 2_000_000_000 && mc < 10_000_000_000;
  if (filter === "small") return mc < 2_000_000_000;
  return true;
}

/**
 * Returns the weekday index for a YYYY-MM-DD ISO string (0=Sun, 1=Mon, ..., 6=Sat).
 */
function weekdayOf(isoDate: string): number {
  if (!isoDate) return 1;
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return 1;
  }
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt.getDay() : 1;
}

/**
 * Formats ISO date to human-readable date e.g. "Feb 24, 2025".
 */
function formatHumanDate(isoDate: string, lang: string = "en"): string {
  if (!isoDate) return "";
  try {
    const parts = isoDate.split("-").map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      if (Number.isFinite(dt.getTime())) {
        const locale = lang === "he" ? "he-IL" : "en-US";
        return dt.toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
  } catch {
    // fallback
  }
  return isoDate;
}

const weekdayToTabMap: Record<number, DayTabFilter> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

/**
 * Displays a filtered earnings calendar with responsive cards grid, 5-day column views,
 * pre/after release separation, and clear data provenance informing users of the source.
 *
 * @param from - Start date of the earnings data range (ISO YYYY-MM-DD)
 * @param to - End date of the earnings data range (ISO YYYY-MM-DD)
 * @param marketCap - Market-cap bucket filter
 * @param watchlistOnly - Filter to show only watchlist events
 * @param focusSymbol - Ticker to highlight from notification / alert
 * @param focusDate - Date to highlight alongside focusSymbol
 * @param onStatusChange - Optional callback reporting live/mock status
 * @returns The rendered earnings calendar component
 */
export function EarningsCalendar({
  from,
  to,
  marketCap = "all",
  watchlistOnly = false,
  focusSymbol,
  focusDate,
  initialDay = "all",
  initialViewMode = "grid",
  onStatusChange,
}: EarningsCalendarProps) {
  const { t, lang } = useI18n();
  const [activeDayTab, setActiveDayTab] = useState<DayTabFilter>(initialDay);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  const watchlistSymbols = useMemo(() => {
    const list = defaultWatchlist.map((w) => w.symbol.toUpperCase());
    if (focusSymbol && !list.includes(focusSymbol.toUpperCase())) {
      list.push(focusSymbol.toUpperCase());
    }
    return list;
  }, [focusSymbol]);

  const { data, isLoading } = useEarningsCalendar(from, to);

  const isMock = !data || data.length === 0;

  useEffect(() => {
    if (!isLoading && onStatusChange) {
      onStatusChange(isMock ? "mock" : "live");
    }
  }, [isMock, isLoading, onStatusChange]);

  const eventsList = useMemo<EarningsEventData[]>(() => {
    if (data && data.length > 0) {
      // Apply explicit marketCap filter first
      let filtered = data.filter((e: any) =>
        inMarketCapBucket(e.marketCap, marketCap),
      );

      if (watchlistOnly) {
        filtered = filtered.filter((e: any) => {
          const sym = (e.symbol ?? "").toUpperCase();
          return (
            watchlistSymbols.includes(sym) ||
            (focusSymbol && sym === focusSymbol.toUpperCase())
          );
        });
      } else if (marketCap === "all") {
        // When viewing all caps, prioritize significant stocks and watchlist members
        filtered = filtered.filter(
          (e: any) =>
            watchlistSymbols.includes((e.symbol ?? "").toUpperCase()) ||
            (e.revenueEstimated && e.revenueEstimated > 3_000_000_000) ||
            (e.marketCap && e.marketCap > 10_000_000_000),
        );
      }

      return filtered.slice(0, 40).map((e: any) => {
        const wd = weekdayOf(e.date);
        const ticker = (e.symbol ?? "").toUpperCase();
        const timeNorm = (e.time ?? "").toLowerCase();
        const normalizedTime =
          timeNorm === "amc" || timeNorm.includes("close")
            ? "After Close"
            : timeNorm === "bmo" || timeNorm.includes("open")
              ? "Before Open"
              : "unknown";

        return {
          ticker,
          name: e.name || e.companyName || ticker,
          date: e.date,
          dateFull: formatHumanDate(e.date, lang),
          weekday: wd,
          epsEst: e.epsEstimated ?? e.epsEstimate ?? null,
          epsActual: e.eps ?? e.epsActual ?? null,
          revEst:
            e.revenueEstimated != null
              ? e.revenueEstimated / 1e9
              : e.revenueEstimate != null
                ? e.revenueEstimate / 1e9
                : null,
          revActual:
            e.revenue != null
              ? e.revenue / 1e9
              : e.revenueActual != null
                ? e.revenueActual / 1e9
                : null,
          time: normalizedTime,
          marketCap: e.marketCap,
          surprise:
            (e.eps ?? e.epsActual) != null &&
            (e.epsEstimated ?? e.epsEstimate) != null
              ? (e.eps ?? e.epsActual) > (e.epsEstimated ?? e.epsEstimate)
                ? "beat"
                : (e.eps ?? e.epsActual) < (e.epsEstimated ?? e.epsEstimate)
                  ? "miss"
                  : "none"
              : "none",
          isWatchlist: watchlistSymbols.includes(ticker),
        };
      });
    }

    // Mock fallback matching showcase events
    let mockFiltered = mockEarningsEvents.map((e) => {
      let eventDate = e.date;
      if (from) {
        const parts = from.split("-").map(Number);
        if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
          const fromDate = new Date(parts[0], parts[1] - 1, parts[2]);
          const targetDate = new Date(fromDate);
          targetDate.setDate(fromDate.getDate() + ((e.weekday ?? 1) - 1));
          const y = targetDate.getFullYear();
          const m = String(targetDate.getMonth() + 1).padStart(2, "0");
          const d = String(targetDate.getDate()).padStart(2, "0");
          eventDate = `${y}-${m}-${d}`;
        }
      }
      return {
        ...e,
        date: eventDate,
        dateFull: formatHumanDate(eventDate, lang),
        isWatchlist:
          watchlistSymbols.includes(e.ticker.toUpperCase()) ||
          e.isWatchlist ||
          (focusSymbol
            ? e.ticker.toUpperCase() === focusSymbol.toUpperCase()
            : false),
      };
    });

    if (from && to) {
      mockFiltered = mockFiltered.filter((e) => e.date >= from && e.date <= to);
    }

    if (watchlistOnly) {
      mockFiltered = mockFiltered.filter(
        (e) =>
          e.isWatchlist ||
          (focusSymbol && e.ticker.toUpperCase() === focusSymbol.toUpperCase()),
      );
    }
    mockFiltered = mockFiltered.filter((e) =>
      typeof e.marketCap === "number"
        ? inMarketCapBucket(e.marketCap, marketCap)
        : true,
    );

    const mockNameToWd: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return mockFiltered.map((e) => ({
      ...e,
      weekday:
        typeof e.weekday === "number" ? e.weekday : (mockNameToWd[e.date] ?? 1),
    }));
  }, [
    data,
    marketCap,
    watchlistOnly,
    watchlistSymbols,
    lang,
    from,
    to,
    focusSymbol,
  ]);

  // Filter by active day tab if in Grid Mode
  const displayedGridEvents = useMemo(() => {
    if (activeDayTab === "all") return eventsList;
    return eventsList.filter((e) => {
      const tabName =
        e.weekday !== undefined ? weekdayToTabMap[e.weekday] : e.date;
      return tabName === activeDayTab;
    });
  }, [eventsList, activeDayTab]);

  // Active rendered count depending on current view mode
  const displayedCount =
    viewMode === "grid" ? displayedGridEvents.length : eventsList.length;

  // Scroll matching card into view on focus
  const didScrollRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusSymbol || !focusDate) {
      didScrollRef.current = null;
      return;
    }
    const stamp = `${focusSymbol}|${focusDate}|${eventsList.length}`;
    if (didScrollRef.current === stamp) return;
    const target = `${focusSymbol}-${focusDate}`;
    const escaped =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(target)
        : JSON.stringify(target).slice(1, -1);
    const el = document.querySelector<HTMLElement>(
      `[data-focus-event="${escaped}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      didScrollRef.current = stamp;
    }
  }, [focusSymbol, focusDate, eventsList.length, isLoading]);

  const days = [
    { wd: 1, tab: "Mon" as const, i18nKey: "earningsCalendar.mon" },
    { wd: 2, tab: "Tue" as const, i18nKey: "earningsCalendar.tue" },
    { wd: 3, tab: "Wed" as const, i18nKey: "earningsCalendar.wed" },
    { wd: 4, tab: "Thu" as const, i18nKey: "earningsCalendar.thu" },
    { wd: 5, tab: "Fri" as const, i18nKey: "earningsCalendar.fri" },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl flex flex-col space-y-0">
      {/* Top Header & Data Provenance Bar */}
      <div className="p-6 border-b border-border/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-secondary/20">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t("earningsCalendar.eyebrow")}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {t("earningsCalendar.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            {t("earningsCalendar.subtitle")}
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-muted/60 rounded-lg p-1 border border-border">
            <button
              type="button"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t("earningsCalendar.viewGrid")}</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "calendar"}
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>{t("earningsCalendar.viewCalendar")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Data Source & Provenance Attribution Banner */}
      <div className="px-6 py-2.5 bg-background/50 border-b border-border text-xs font-mono flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database className="w-3.5 h-3.5 text-primary" />
          <span>{t("earningsCalendar.dataSource")}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <span className="text-muted-foreground bg-secondary/60 border border-border px-2 py-0.5 rounded text-[11px]">
              {t("earningsCalendar.showing", { count: displayedCount })}
            </span>
          )}
          {!isLoading && (
            <DataStatusBadge
              status={isMock ? "mock" : "live"}
              source={
                isMock
                  ? t("earningsCalendar.sourceMock")
                  : t("earningsCalendar.sourceLive")
              }
            />
          )}
        </div>
      </div>

      {/* Interactive Day Filter Pills (for Grid View) */}
      {viewMode === "grid" && (
        <div className="p-4 sm:px-6 bg-background/70 border-b border-border/70 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            aria-pressed={activeDayTab === "all"}
            onClick={() => setActiveDayTab("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 ${
              activeDayTab === "all"
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t("earningsCalendar.allReporting")}
          </button>
          {days.map((d) => (
            <button
              key={d.tab}
              type="button"
              aria-pressed={activeDayTab === d.tab}
              onClick={() => setActiveDayTab(d.tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 ${
                activeDayTab === d.tab
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t(d.i18nKey)}
            </button>
          ))}
        </div>
      )}

      {/* Body Content: Grid View or Weekly Columns Calendar */}
      <div className="p-6">
        {displayedCount === 0 && !isLoading ? (
          <div className="p-12 text-center text-muted-foreground font-mono text-sm space-y-2">
            <p className="text-base text-foreground font-semibold">
              {t("earningsCalendar.noEventsThisWeek")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("earningsCalendar.adjustFiltersHint")}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Consolidated Cards Grid (3 columns on desktop, 2 on tablet, 1 on mobile) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {displayedGridEvents.map((ev) => (
              <EarningsCard
                key={`${ev.ticker}-${ev.date}`}
                event={ev}
                isFocus={focusSymbol === ev.ticker && focusDate === ev.date}
              />
            ))}
          </div>
        ) : (
          /* Weekly 5-Column Calendar with Explicit Before Open (BMO) and After Close (AMC) Separation */
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-border rtl:lg:divide-x-reverse rounded-xl border border-border overflow-hidden bg-background/40">
            {days.map((dayObj) => {
              const dayEvents = eventsList.filter(
                (e) => e.weekday === dayObj.wd,
              );
              const bmoEvents = dayEvents.filter(
                (e) =>
                  e.time === "Before Open" ||
                  e.time === "bmo" ||
                  e.time.toLowerCase().includes("open"),
              );
              const amcEvents = dayEvents.filter(
                (e) =>
                  e.time === "After Close" ||
                  e.time === "amc" ||
                  e.time.toLowerCase().includes("close"),
              );
              const otherEvents = dayEvents.filter(
                (e) => !bmoEvents.includes(e) && !amcEvents.includes(e),
              );

              return (
                <div
                  key={dayObj.wd}
                  className="flex flex-col min-h-[460px] bg-card/40"
                >
                  {/* Day Column Header */}
                  <div className="bg-secondary/40 p-3.5 border-b border-border text-center font-mono font-bold text-foreground text-sm flex items-center justify-center gap-2">
                    <span>{t(dayObj.i18nKey)}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      ({dayEvents.length})
                    </span>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col space-y-4">
                    {/* BMO Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-400">
                        <Sun className="w-3.5 h-3.5" />
                        <span>{t("earningsCalendar.preMarket")}</span>
                      </div>
                      {bmoEvents.length === 0 ? (
                        <div className="text-[11px] font-mono text-muted-foreground/60 p-2 text-center bg-background/20 rounded border border-border/30">
                          —
                        </div>
                      ) : (
                        bmoEvents.map((ev) => (
                          <EarningsCard
                            key={`bmo-${ev.ticker}-${ev.date}`}
                            event={ev}
                            isFocus={
                              focusSymbol === ev.ticker && focusDate === ev.date
                            }
                          />
                        ))
                      )}
                    </div>

                    {/* Pre / After Release Dashed Separation */}
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-dashed border-border" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-card px-2 text-[10px] font-mono text-muted-foreground uppercase">
                          {t("earningsCalendar.marketClose")}
                        </span>
                      </div>
                    </div>

                    {/* AMC Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
                        <Moon className="w-3.5 h-3.5" />
                        <span>{t("earningsCalendar.afterHours")}</span>
                      </div>
                      {amcEvents.length === 0 ? (
                        <div className="text-[11px] font-mono text-muted-foreground/60 p-2 text-center bg-background/20 rounded border border-border/30">
                          —
                        </div>
                      ) : (
                        amcEvents.map((ev) => (
                          <EarningsCard
                            key={`amc-${ev.ticker}-${ev.date}`}
                            event={ev}
                            isFocus={
                              focusSymbol === ev.ticker && focusDate === ev.date
                            }
                          />
                        ))
                      )}
                    </div>

                    {/* Unspecified Timing Section (if any) */}
                    {otherEvents.length > 0 && (
                      <div className="space-y-2.5 pt-2 border-t border-border/40">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{t("earningsCalendar.unknownTiming")}</span>
                        </div>
                        {otherEvents.map((ev) => (
                          <EarningsCard
                            key={`other-${ev.ticker}-${ev.date}`}
                            event={ev}
                            isFocus={
                              focusSymbol === ev.ticker && focusDate === ev.date
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default EarningsCalendar;
