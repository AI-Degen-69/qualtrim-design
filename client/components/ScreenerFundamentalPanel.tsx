import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useI18n, translateMarketCap } from "@/lib/i18n";
import { useBatchQuotes, useScreenerFundamentalFilter } from "@/hooks/useStockData";

/**
 * Live fundamental screener panel — market-cap band chips + numeric metric
 * ranges, screened server-side via a Yahoo-primary fan-out (row-level KV
 * cache, ≤8 concurrency, never touches the FMP budget). The panel is
 * additive: the static metadata screener below keeps working untouched.
 */

/** Mirror of the server's filter ids + display units (source of truth for
 *  semantics is `server/services/screenerMetrics.ts`; this list only
 *  drives the input grid + table columns). */
const METRIC_UI: { id: string; unit: "x" | "percent" | "ratio" }[] = [
  { id: "pe", unit: "x" },
  { id: "pb", unit: "x" },
  { id: "peg", unit: "x" },
  { id: "evEbitda", unit: "x" },
  { id: "evSales", unit: "x" },
  { id: "dividendYield", unit: "percent" },
  { id: "grossMargin", unit: "percent" },
  { id: "netMargin", unit: "percent" },
  { id: "operatingMargin", unit: "percent" },
  { id: "roe", unit: "percent" },
  { id: "roa", unit: "percent" },
  { id: "currentRatio", unit: "ratio" },
  { id: "debtEquity", unit: "ratio" },
  { id: "fcfYield", unit: "percent" },
];

const CAP_BANDS = [
  "Mega Cap",
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Micro Cap",
  "Nano Cap",
] as const;

const DEFAULT_COLUMNS = ["pe", "dividendYield", "roe", "netMargin", "fcfYield"];

type RangeDraft = Record<string, { min: string; max: string }>;
type Submitted = {
  bands: string[];
  ranges: Record<string, { min?: number; max?: number }>;
};

function draftToRanges(draft: RangeDraft): Submitted["ranges"] {
  const out: Submitted["ranges"] = {};
  for (const [id, { min, max }] of Object.entries(draft)) {
    const minN = min.trim() === "" ? undefined : Number(min);
    const maxN = max.trim() === "" ? undefined : Number(max);
    if (
      (minN !== undefined && Number.isFinite(minN)) ||
      (maxN !== undefined && Number.isFinite(maxN))
    ) {
      out[id] = { min: minN, max: maxN };
    }
  }
  return out;
}

function hasActiveRange(ranges: Submitted["ranges"]): boolean {
  return Object.values(ranges).some(
    (r) => r.min !== undefined || r.max !== undefined,
  );
}

function fmtMetric(v: number | undefined, unit: string): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const suffix = unit === "percent" ? "%" : unit === "x" ? "×" : "";
  return `${v.toFixed(digits)}${suffix}`;
}

export default function ScreenerFundamentalPanel({
  metadata,
}: {
  metadata: {
    q?: string;
    sector: string[];
    industry: string[];
    country: string[];
    asset_type: string[];
    exclude_dots: boolean;
  };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [bands, setBands] = useState<string[]>([]);
  const [draft, setDraft] = useState<RangeDraft>({});
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const ranges = useMemo(() => draftToRanges(draft), [draft]);
  const activeCount = Object.values(ranges).filter(
    (r) => r.min !== undefined || r.max !== undefined,
  ).length;

  const enabled = submitted !== null && hasActiveRange(submitted.ranges);

  const { data, isLoading, isFetching, isError } = useScreenerFundamentalFilter(
    {
      ...metadata,
      market_cap: submitted?.bands ?? [],
      metricRanges: submitted?.ranges ?? {},
      limit,
      offset: page * limit,
      enabled,
    },
  );

  const results = useMemo(() => data?.results ?? [], [data?.results]);
  const total = data?.total ?? 0;
  const maxPages = Math.max(1, Math.ceil(total / limit));

  const symbols = useMemo(() => results.map((r) => r.symbol), [results]);
  const { data: quoteData } = useBatchQuotes(symbols);
  const priceBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quoteData?.quotes ?? []) {
      if (q && q.symbol && Number.isFinite(q.price)) {
        m.set(q.symbol.toUpperCase(), q.price);
      }
    }
    return m;
  }, [quoteData]);

  const run = () => {
    setSubmitted({ bands, ranges });
    setPage(0);
  };

  const reset = () => {
    setBands([]);
    setDraft({});
    setSubmitted(null);
    setPage(0);
  };

  const setBound = (id: string, which: "min" | "max", value: string) => {
    setDraft((d) => ({ ...d, [id]: { min: "", max: "", ...d[id], [which]: value } }));
  };

  const shownColumns = useMemo(() => {
    const active = Object.keys(ranges).filter(
      (id) => ranges[id]?.min !== undefined || ranges[id]?.max !== undefined,
    );
    return [...new Set([...active, ...DEFAULT_COLUMNS])];
  }, [ranges]);

  const rateLimited = data?.rateLimited ?? false;

  return (
    <div className="bg-card/60 rounded-xl border border-border/80 shadow-sm backdrop-blur-sm overflow-hidden">
      {/* Header — collapsible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-start hover:bg-card/70 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {t("screenerFund.liveTitle")}
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
              {activeCount}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold">
            <Sparkles className="w-3 h-3" />
            {t("screenerFund.source")}
          </span>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform rtl:rotate-180 ${
            open ? "rotate-90 rtl:-rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground mt-3 mb-3">
            {t("screenerFund.liveSubtitle")}
          </p>

          {/* Market cap bands */}
          <div className="mb-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("screenerFund.marketCap")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CAP_BANDS.map((band) => {
                const active = bands.includes(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setBands((b) =>
                        active ? b.filter((x) => x !== band) : [...b, band],
                      )
                    }
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {translateMarketCap(t, band)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric ranges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {METRIC_UI.map((m) => {
              const d = draft[m.id] ?? { min: "", max: "" };
              const unitLabel =
                m.unit === "percent"
                  ? t("screenerFund.unit.percent")
                  : m.unit === "x"
                    ? t("screenerFund.unit.x")
                    : "";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2 py-1.5"
                >
                  <span className="text-xs font-medium text-foreground w-[86px] shrink-0 truncate" title={t(`screenerFund.metric.${m.id}`)}>
                    {t(`screenerFund.metric.${m.id}`)}
                  </span>
                  <input
                    type="number"
                    placeholder={t("screenerFund.min")}
                    value={d.min}
                    onChange={(e) => setBound(m.id, "min", e.target.value)}
                    className="w-full min-w-0 bg-transparent border border-transparent focus:border-primary/40 focus:bg-background rounded-md px-1.5 py-0.5 text-xs text-foreground placeholder-muted-foreground/50 outline-none transition-colors"
                    aria-label={`${t(`screenerFund.metric.${m.id}`)} min`}
                  />
                  <span className="text-muted-foreground/60 text-[10px] shrink-0">
                    {unitLabel}
                  </span>
                  <input
                    type="number"
                    placeholder={t("screenerFund.max")}
                    value={d.max}
                    onChange={(e) => setBound(m.id, "max", e.target.value)}
                    className="w-full min-w-0 bg-transparent border border-transparent focus:border-primary/40 focus:bg-background rounded-md px-1.5 py-0.5 text-xs text-foreground placeholder-muted-foreground/50 outline-none transition-colors"
                    aria-label={`${t(`screenerFund.metric.${m.id}`)} max`}
                  />
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground">
              {t("screenerFund.scanned", { scanned: data?.scanned ?? 0 })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("screenerFund.reset")}
              </button>
              <button
                type="button"
                onClick={run}
                disabled={activeCount === 0 || isLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                {isLoading ? t("screenerFund.running") : t("screenerFund.run")}
              </button>
            </div>
          </div>

          {/* Results */}
          {!enabled ? (
            <p className="mt-4 text-xs text-muted-foreground/70">
              {t("screenerFund.noRun")}
            </p>
          ) : rateLimited ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-300">
                  {t("screenerFund.unavailable")}
                </p>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  {t("screenerFund.rateLimited")}
                </p>
              </div>
            </div>
          ) : isError ? (
            <p className="mt-4 text-xs text-chart-negative">
              {t("screenerFund.rateLimited")}
            </p>
          ) : (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">
                {t("screenerFund.matches", {
                  count: total.toLocaleString(),
                  scanned: (data?.scanned ?? 0).toLocaleString(),
                })}
                {isFetching && (
                  <span className="text-primary animate-pulse ms-2">
                    {t("screenerFund.running")}
                  </span>
                )}
              </p>

              {results.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  {t("screenerFund.noMatches")}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground">
                          <th className="px-3 py-2 text-start font-bold whitespace-nowrap">
                            {t("screener.col.symbol")}
                          </th>
                          <th className="px-3 py-2 text-start font-bold whitespace-nowrap">
                            {t("screener.col.name")}
                          </th>
                          <th className="px-3 py-2 text-start font-bold whitespace-nowrap">
                            {t("screener.col.price")}
                          </th>
                          <th className="px-3 py-2 text-start font-bold whitespace-nowrap">
                            {t("metrics.marketCap")}
                          </th>
                          {shownColumns.map((id) => (
                            <th
                              key={id}
                              className="px-3 py-2 text-end font-bold whitespace-nowrap"
                            >
                              {t(`screenerFund.metric.${id}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((row) => (
                          <tr
                            key={row.symbol}
                            className="border-t border-border/40 hover:bg-muted/20 transition-colors"
                          >
                            <td className="px-3 py-2 whitespace-nowrap font-bold text-primary">
                              <Link to={`/stock/${row.symbol}`}>
                                {row.symbol}
                              </Link>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-foreground/90 max-w-[220px] truncate">
                              {row.name}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                              {priceBySymbol.has(row.symbol)
                                ? `$${priceBySymbol.get(row.symbol)!.toFixed(2)}`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {translateMarketCap(t, row.market_cap)}
                            </td>
                            {shownColumns.map((id) => (
                              <td
                                key={id}
                                className="px-3 py-2 text-end whitespace-nowrap tabular-nums text-foreground/90"
                              >
                                {fmtMetric(
                                  row.metrics?.[id],
                                  METRIC_UI.find((m) => m.id === id)?.unit ?? "",
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {t("screener.showingResults", {
                        start: total > 0 ? page * limit + 1 : 0,
                        end: Math.min((page + 1) * limit, total),
                        total: total.toLocaleString(),
                      })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                        aria-label="previous page"
                      >
                        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                      </button>
                      <button
                        type="button"
                        disabled={page >= maxPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                        aria-label="next page"
                      >
                        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}