import { useState } from "react";
import { Maximize2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import ChartModal from "./ChartModal";
import { FinancialMetric } from "@/lib/mockData";
import type { RevenueSegmentRow } from "@shared/api";
import { useI18n } from "@/lib/i18n";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer } from "recharts";
import { splitSparklineValues } from "@/lib/chartStyles";

interface InsightsCardProps {
  title: string;
  value: string;
  badgeText?: string;
  badgeType?: "positive" | "negative" | "neutral";
  metricId: string; // Refers to the financialMetric name to pull historical data
  metricData: FinancialMetric; // The actual metric data with historical series
  ticker?: string;
  /**
   * Optional node rendered between the metric header and the sparkline
   * (e.g. RevenueSegmentsCard's segment-filter chips). Keeps the card
   * chrome identical for every metric while letting one card inject
   * its own interactive strip.
   */
  filterBar?: React.ReactNode;
  /**
   * Revenue-segment rows forwarded to the chart modal so it can render the
   * stacked per-year segment chart instead of the single metric series.
   */
  segmentRows?: RevenueSegmentRow[];
  /** Segment the card had focused when the modal was opened (snapshots into the modal's filter chips). */
  selectedSegment?: string | null;
  /**
   * Why the segment payload is unavailable — surfaced as a locked
   * banner inside the modal so the user sees the same premium-tier
   * explanation in both the card AND the expanded view. Set by
   * `RevenueSegmentsCard` when `useStockRevenueSegmentation` returned
   * `{ rateLimited: true }` or `{ unavailable: true }`.
   */
  segmentLockedReason?: "rateLimited" | "unavailable" | null;
  /**
   * Opens the placeholder /pricing modal from the locked banner's
   * Upgrade CTA. Undefined = no CTA rendered (standalone previews).
   */
  onUpgradeClick?: () => void;
}

export default function InsightsCard({
  title,
  value,
  badgeText,
  badgeType = "neutral",
  metricId,
  metricData,
  ticker,
  filterBar,
  segmentRows,
  selectedSegment,
  segmentLockedReason,
  onUpgradeClick,
}: InsightsCardProps) {
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getBadgeStyles = () => {
    switch (badgeType) {
      case "positive":
        return "bg-chart-positive/15 text-chart-positive border-chart-positive/30 shadow-[0_0_12px_-2px_hsl(var(--chart-positive)/0.3)]";
      case "negative":
        return "bg-chart-negative/15 text-chart-negative border-chart-negative/30 shadow-[0_0_12px_-2px_hsl(var(--chart-negative)/0.3)]";
      default:
        return "bg-muted/40 text-muted-foreground border-border/50";
    }
  };

  const TrendIcon =
    badgeType === "positive"
      ? TrendingUp
      : badgeType === "negative"
        ? TrendingDown
        : Minus;

  const lineColor =
    badgeType === "positive"
      ? "hsl(155 65% 52%)"
      : badgeType === "negative"
        ? "hsl(6 75% 58%)"
        : "hsl(42 65% 70%)";

  const handleOpenModal = () => setIsModalOpen(true);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenModal();
    }
  };

  // Extract a small sparkline dataset (last 20 items)
  const sparklineData = splitSparklineValues(metricData.data.slice(-20));

  const firstDate = metricData.data[0]?.date;
  const lastDate = metricData.data[metricData.data.length - 1]?.date;
  const dataSpanLabel =
    firstDate && lastDate
      ? t("insights.card.dataSpan", { first: firstDate, last: lastDate })
      : null;
  const pointsLabel = t("insights.card.points", {
    count: metricData.data.length,
  });

  return (
    <>
      <div
        className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-card/95 via-card/75 to-card/45 backdrop-blur-xl p-5 flex flex-col justify-between shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-primary/60 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.7),0_0_20px_-4px_hsl(var(--primary)/0.25)] hover:-translate-y-0.5 group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        onClick={handleOpenModal}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        {/* Subtle Ambient Radial Highlight on Hover */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-all duration-500" />

        {/* Top Header Row */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.14em] group-hover:text-foreground/90 transition-colors">
              {title}
            </span>
            <button
              className="h-7 w-7 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-primary transition-all flex items-center justify-center opacity-70 group-hover:opacity-100 focus:opacity-100 shadow-sm"
              aria-label="Expand chart"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal();
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Value Readout & Trend Badge */}
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-[1.65rem] font-bold text-foreground font-mono tabular-nums tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
              {value}
            </span>
            {badgeText && (
              <span
                className={`text-xs font-bold font-mono tabular-nums px-2.5 py-0.5 rounded-full border whitespace-nowrap inline-flex items-center gap-1 ${getBadgeStyles()}`}
                dir="ltr"
              >
                <TrendIcon className="w-3 h-3" />
                {badgeText}
              </span>
            )}
          </div>

          {filterBar}
        </div>

        {/* Luminous Light-Curve Sparkline */}
        <div
          className="h-[74px] w-full -mx-1 mt-3 pt-1 relative"
          style={{ filter: `drop-shadow(0 0 5px ${lineColor}70)` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sparklineData}
              margin={{ top: 6, right: 2, left: 2, bottom: 2 }}
            >
              <defs>
                <linearGradient
                  id={`gradient-positive-${metricId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="hsl(155 75% 55%)"
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(155 55% 35%)"
                    stopOpacity={0.0}
                  />
                </linearGradient>
                <linearGradient
                  id={`gradient-negative-${metricId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="hsl(6 55% 35%)"
                    stopOpacity={0.0}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(6 80% 60%)"
                    stopOpacity={0.45}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="positiveValue"
                stroke={lineColor}
                fillOpacity={1}
                fill={`url(#gradient-positive-${metricId})`}
                strokeWidth={0}
                isAnimationActive={true}
                animationDuration={800}
                connectNulls={false}
                baseValue={0}
              />
              <Area
                type="monotone"
                dataKey="negativeValue"
                stroke={lineColor}
                fillOpacity={1}
                fill={`url(#gradient-negative-${metricId})`}
                strokeWidth={0}
                isAnimationActive={true}
                animationDuration={800}
                connectNulls={false}
                baseValue={0}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                fill="none"
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={800}
                connectNulls={false}
              />
              <ReferenceLine
                y={0}
                yAxisId="0"
                stroke="hsl(250 20% 24%)"
                strokeOpacity={0.8}
                strokeWidth={1}
                strokeDasharray="2 2"
                ifOverflow="extendDomain"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Meta Row */}
        <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground/80 font-mono">
          <span className="truncate text-muted-foreground/75" dir="ltr">
            {dataSpanLabel ?? pointsLabel}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-muted/40 border border-border/30 text-[10px] text-muted-foreground/80 font-sans font-medium uppercase tracking-wider">
            {pointsLabel}
          </span>
        </div>
      </div>

      <ChartModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        metric={metricData}
        ticker={ticker}
        segmentRows={segmentRows}
        selectedSegment={selectedSegment ?? null}
        segmentLockedReason={segmentLockedReason ?? null}
        onUpgradeClick={onUpgradeClick}
      />
    </>
  );
}
