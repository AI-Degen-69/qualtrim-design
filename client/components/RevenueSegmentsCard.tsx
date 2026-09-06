import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import InsightsCard from "./InsightsCard";
import { useStockRevenueSegmentation } from "@/hooks/useStockData";
import { useI18n } from "@/lib/i18n";
import type { FinancialMetric, StockMetric } from "@/lib/mockData";
import type { RevenueSegmentRow } from "@shared/api";

interface RevenueSegmentsCardProps {
  /** The total-revenue metric (annual series, B units) from Index.tsx. */
  metric: FinancialMetric;
  ticker: string;
  /**
   * Opens the placeholder /pricing modal hosted at the page root.
   * Wired into the chip strip's small Upgrade link (rendered next to
   * the locked `Segments 🔒 Premium` pill) AND forwarded down through
   * `InsightsCard` so the modal's banner CTA also opens the same
   * modal. Undefined = no CTA rendered (standalone previews).
   */
  onUpgradeClick?: () => void;
}

/**
 * Revenue card with a product-segment breakdown (FMP `revenue-product-segmentation`).
 *
 * Three render states:
 *   1. Segment data available → title becomes "Revenue by Segment", chips filter
 *      the sparkline between "All" (total revenue) and each product segment.
 *   2. FMP free-tier quota exhausted (`rateLimited`) or no FMP key
 *      (`unavailable`) → the card renders the plain total-revenue series exactly
 *      as before, but the filter strip keeps an "All" chip plus a locked
 *      "Segments" chip (lock icon, premium tooltip) that cannot be selected —
 *      the segment filters stay visible as a premium feature.
 *   3. No segment data for the symbol → identical to the original revenue card
 *      (no chips).
 */
export default function RevenueSegmentsCard({
  metric,
  ticker,
  onUpgradeClick,
}: RevenueSegmentsCardProps) {
  const { t } = useI18n();
  const { data: segmentation, isLoading } = useStockRevenueSegmentation(ticker);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const rows: RevenueSegmentRow[] = segmentation?.rows ?? [];
  const rateLimited = segmentation?.rateLimited === true;
  const unavailable = segmentation?.unavailable === true;

  // Surface the premium-tier reason so the modal can mirror the card's
  // locked state instead of silently falling back to the regular
  // total-revenue chart with no explanation.
  const segmentLockedReason: "rateLimited" | "unavailable" | null = rateLimited
    ? "rateLimited"
    : unavailable
      ? "unavailable"
      : null;

  // Segment names in display order: the most recent period's products first,
  // then any earlier periods' products (a segment may be dropped mid-series).
  const segments = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const byYear = [...rows]
      .filter((r) => r.products.length > 0)
      .sort((a, b) => (a.fiscalYear < b.fiscalYear ? 1 : -1));
    for (const row of byYear) {
      for (const p of row.products) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          ordered.push(p.name);
        }
      }
    }
    return ordered;
  }, [rows]);

  // Annual series for the selected segment (raw USD → B, aligned to the
  // total-revenue metric's fiscal-year dates). FMP returns periods newest-
  // first, but the total metric is chronological — sort ascending so the
  // card's "latest" value and YoY badge read the most recent year, and the
  // sparkline draws left-to-right in time. Missing periods become null so
  // the sparkline skips them instead of dropping the year.
  const segmentSeries: StockMetric[] | null = useMemo(() => {
    if (!selectedSegment) return null;
    return [...rows]
      .sort((a, b) => (a.fiscalYear < b.fiscalYear ? -1 : 1))
      .map((row) => {
        const product = row.products.find((p) => p.name === selectedSegment);
        return {
          date: row.fiscalYear,
          value: product ? product.revenue / 1e9 : null,
        };
      });
  }, [rows, selectedSegment]);

  const activeMetric: FinancialMetric = useMemo(() => {
    if (!selectedSegment || !segmentSeries) return metric;
    return { ...metric, data: segmentSeries };
  }, [metric, selectedSegment, segmentSeries]);

  const yoyFromSeries = (data: { value: number | null }[]): number | null => {
    const last = data[data.length - 1]?.value;
    if (last == null) return null;
    let prev: number | null = null;
    for (let i = data.length - 2; i >= 0; i--) {
      const v = data[i]?.value;
      if (v != null) {
        prev = v;
        break;
      }
    }
    if (prev == null || prev === 0) return null;
    return ((last - prev) / prev) * 100;
  };

  const latestVal = activeMetric.data[activeMetric.data.length - 1]?.value;
  const yoyChange =
    !selectedSegment && metric.yoy != null
      ? metric.yoy
      : yoyFromSeries(activeMetric.data);

  const locked =
    !isLoading &&
    segmentation != null &&
    (rateLimited || unavailable) &&
    segments.length === 0;
  const hasSegments = !locked && segments.length > 0;

  const lockedTooltip = rateLimited
    ? t("revenueSegments.rateLimitedTooltip")
    : t("revenueSegments.unavailableTooltip");

  const filterBar = (hasSegments || locked) && (
    <div
      className="flex flex-wrap items-center gap-1.5 mt-2.5"
      aria-label={t("metrics.revenueBySegment")}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedSegment(null);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
          selectedSegment === null
            ? "bg-chart-blue/15 text-chart-blue border-chart-blue/40 shadow-[0_0_8px_-2px_hsl(var(--chart-blue)/0.3)]"
            : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/60 hover:border-border/80"
        }`}
      >
        {t("revenueSegments.all")}
      </button>
      {hasSegments
        ? segments.map((name) => (
            <button
              key={name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSegment(selectedSegment === name ? null : name);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all max-w-32 truncate ${
                selectedSegment === name
                  ? "bg-chart-blue/15 text-chart-blue border-chart-blue/40 shadow-[0_0_8px_-2px_hsl(var(--chart-blue)/0.3)]"
                  : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/60 hover:border-border/80"
              }`}
            >
              {name}
            </button>
          ))
        : locked && (
            // Pair of lock + premium pill so the user sees the gate
            // without hovering: the lock icon + tooltip explain WHY
            // it's gated, and the Starlight Gold `Premium` text makes
            // it discoverable at a glance that this is the upgrade
            // path, not a missing data bug. The inline Upgrade link
            // gives the gate an actual destination — clicking it opens
            // the placeholder /pricing modal hosted at the page root.
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border/50 bg-muted/30 text-muted-foreground/70 cursor-not-allowed select-none"
                title={lockedTooltip}
                aria-disabled="true"
              >
                <Lock className="w-3 h-3" />
                {t("revenueSegments.locked")}
              </span>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border border-primary/40 bg-primary/15 text-primary shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]"
                aria-label={t("revenueSegments.premiumBadge")}
                title={lockedTooltip}
                data-testid="revenue-segments-premium-badge"
              >
                {t("revenueSegments.premiumBadge")}
              </span>
              {onUpgradeClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpgradeClick();
                  }}
                  data-testid="revenue-segments-upgrade-cta"
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_0_8px_-2px_hsl(var(--primary)/0.4)]"
                >
                  {t("revenueSegments.upgradeCta")}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </span>
          )}
    </div>
  );

  return (
    <InsightsCard
      title={
        hasSegments ? t("metrics.revenueBySegment") : t("insights.revenue")
      }
      value={
        latestVal == null
          ? "—"
          : `${latestVal.toFixed(2)}${metric.unit === "$" ? "" : metric.unit}`
      }
      badgeText={
        yoyChange == null
          ? "—"
          : `${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(2)}%`
      }
      badgeType={
        yoyChange == null ? "neutral" : yoyChange >= 0 ? "positive" : "negative"
      }
      metricId={metric.name}
      metricData={activeMetric}
      ticker={ticker}
      filterBar={filterBar || undefined}
      segmentRows={rows}
      /* Carry the card's segment selection into the modal so the stacked
         chart opens with every other segment hidden — matching what the
         card sparkline was already focusing on. */
      selectedSegment={selectedSegment}
      /* Forward the premium-tier reason so the modal can show the same
         locked banner + chip row that the card already shows, instead
         of silently rendering the regular total-revenue chart. */
      segmentLockedReason={segmentLockedReason}
      /* Forward the modal's CTA so the banner's Upgrade button inside
         the expanded chart modal opens the same /pricing modal as the
         chip-strip CTA on the card. */
      onUpgradeClick={onUpgradeClick}
    />
  );
}
