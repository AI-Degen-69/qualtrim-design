import { useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import ChartModal from "./ChartModal";
import { FinancialMetric } from "@/lib/mockData";
import type { RevenueSegmentRow } from "@shared/api";
import { useI18n } from "@/lib/i18n";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildFrequencySeries,
  compactPeriodLabel,
  formatAxisValue,
  frequencyLabelKey,
  metricChartColor,
  sliceSeriesByRange,
  type ChartFrequency,
  type ChartRange,
} from "@/lib/financialSeries";
import { calculateChartDomain } from "@/lib/chartStyles";

/** Minimal shape of the quarterly statements payload the card chart needs. */
type QuarterlyStatements = {
  income?: ReadonlyArray<unknown>;
  balance?: ReadonlyArray<unknown>;
  cash?: ReadonlyArray<unknown>;
} | null
  | undefined;

interface InsightsCardProps {
  title: string;
  /**
   * Legacy value/trend props. The Stocknest-style card renders only the
   * title + frequency badge + bar chart, so these are accepted for API
   * compatibility (RevenueSegmentsCard still passes them) but no longer
   * rendered — the latest value reads from the bars/tooltip and the modal.
   */
  value?: string;
  badgeText?: string;
  badgeType?: "positive" | "negative" | "neutral";
  metricId: string; // Refers to the financialMetric name to pull historical data
  metricData: FinancialMetric; // The actual metric data with historical series
  ticker?: string;
  /**
   * Optional node rendered between the metric header and the bar chart
   * (e.g. RevenueSegmentsCard's segment-filter chips).
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
  /**
   * Chart frequency for the card's bars — annual (default), quarterly, or
   * TTM. Driven by the shared page-level frequency tabs.
   */
  frequency?: ChartFrequency;
  /** Range window sliced off the end of the series (default 10Y). */
  range?: ChartRange;
  /**
   * Quarterly statements payload (from `useStockFinancials(ticker, { period:
   * "quarter" })`). Required for the quarterly/TTM frequencies to project
   * anything beyond the annual fallback.
   */
  quarterlyStatements?: QuarterlyStatements;
  /**
   * Controlled-open mode: when provided, clicking the card calls this
   * instead of mounting its own ChartModal. Index.tsx uses it to host ONE
   * page-level modal with prev/next navigation across all metric cards.
   * Left undefined (RevenueSegmentsCard), the card keeps its self-managed
   * modal below.
   */
  onExpand?: () => void;
}

export default function InsightsCard({
  title,
  metricId,
  metricData,
  ticker,
  filterBar,
  segmentRows,
  selectedSegment,
  segmentLockedReason,
  onUpgradeClick,
  frequency = "annual",
  range = "10Y",
  quarterlyStatements,
  onExpand,
}: InsightsCardProps) {
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isControlled = onExpand !== undefined;

  const barColor = metricChartColor(metricId, metricData.color);

  // Display series for the current frequency + range window. When the
  // quarterly source has no usable rows the annual series stands in — the
  // badge and the range slice then follow the EFFECTIVE frequency, so a TTM
  // selection can never show annual bars under a TTM badge.
  const { points: frequencyPoints, effectiveFrequency } = useMemo(
    () =>
      buildFrequencySeries({
        metricName: metricId,
        annualData: metricData.data,
        quarterlyStatements,
        frequency,
      }),
    [metricId, metricData.data, quarterlyStatements, frequency],
  );
  const series = useMemo(
    () => sliceSeriesByRange(frequencyPoints, range, effectiveFrequency),
    [frequencyPoints, range, effectiveFrequency],
  );

  const chartDomain = useMemo(
    () => calculateChartDomain(series.map((point) => point.value)),
    [series],
  );

  const openModal = () => {
    if (isControlled) onExpand();
    else setIsModalOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal();
    }
  };

  const MiniTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const value = payload[0]?.payload?.value;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return (
      <div
        className="bg-card/95 backdrop-blur-md border border-border/80 px-3 py-2 rounded-lg text-xs text-foreground shadow-xl min-w-[110px]"
        dir="ltr"
      >
        <p className="text-muted-foreground font-mono text-[11px] mb-0.5">
          {label}
        </p>
        <p className="font-bold font-mono tabular-nums text-sm text-foreground">
          {formatMetricValue(value, metricData.unit)}
        </p>
      </div>
    );
  };

  return (
    <>
      <div
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-4 transition-all duration-200 hover:border-primary/50 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        onClick={openModal}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${title} — ${t("chart.expand")}`}
      >
        {/* Header: metric title + Stocknest-style amber frequency badge */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight text-foreground">
              {title}
            </h3>
            <span className="shrink-0 text-[11px] font-bold text-chart-amber" dir="ltr">
              {t(frequencyLabelKey(effectiveFrequency))}
            </span>
          </div>
          <Maximize2
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden="true"
          />
        </div>

        {filterBar}

        {/* Stocknest-style bar chart */}
        <div className="mt-2 h-[168px] w-full" dir="ltr">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground/60">
              —
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series}
                margin={{ top: 6, right: 2, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="hsl(250 20% 18%)"
                  vertical={false}
                  strokeOpacity={0.6}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={compactPeriodLabel}
                  tick={{
                    fontSize: 10,
                    fill: "hsl(220 10% 60%)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  width={42}
                  tick={{
                    fontSize: 10,
                    fill: "hsl(220 10% 60%)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickCount={4}
                  domain={chartDomain}
                  tickFormatter={(val: number) =>
                    formatAxisValue(val, metricData.unit)
                  }
                />
                <Tooltip
                  content={<MiniTooltip />}
                  cursor={{ fill: "hsl(250 20% 16% / 0.35)" }}
                />
                <Bar
                  dataKey="value"
                  fill={barColor}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                >
                  {series.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        typeof entry.value === "number" && entry.value < 0
                          ? "hsl(var(--chart-negative))"
                          : barColor
                      }
                      fillOpacity={entry.value == null ? 0 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Self-managed modal — only in uncontrolled mode (RevenueSegmentsCard).
          Opens on the card's effective chart window so the expanded view
          starts where the card already is. */}
      {!isControlled && (
        <ChartModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          metric={metricData}
          ticker={ticker}
          initialFrequency={effectiveFrequency}
          initialRange={range}
          segmentRows={segmentRows}
          selectedSegment={selectedSegment ?? null}
          segmentLockedReason={segmentLockedReason ?? null}
          onUpgradeClick={onUpgradeClick}
        />
      )}
    </>
  );
}

/** Compact value formatter for the card tooltip (values are pre-scaled). */
function formatMetricValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "$") return `$${value.toFixed(2)}`;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 1 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${unit || ""}`;
}
