import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Download,
  TrendingUp,
  TrendingDown,
  Lock,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import TickerLogo from "@/components/TickerLogo";
import { useI18n } from "@/lib/i18n";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { FinancialMetric } from "@/lib/mockData";
import type { RevenueSegmentRow } from "@shared/api";
import { cn } from "@/lib/utils";
import {
  cagrAtYearsBack,
  detectPeriodGranularity,
  metricStatementKey,
} from "@/lib/finance";
import {
  useStockFinancials,
  useStockRevenueSegmentation,
} from "@/hooks/useStockData";
import {
  calculateChartDomain,
  getChartAvailability,
} from "@/lib/chartStyles";
import {
  buildFrequencySeries,
  buildYoYPoints,
  compactPeriodLabel,
  frequencyLabelKey,
  metricChartColor,
  rangePeriodCount,
  sliceSeriesByRange,
  type ChartFrequency,
  type ChartRange,
} from "@/lib/financialSeries";
import {
  FrequencyTabs,
  RangeTabs,
  YoYToggle,
} from "@/components/ChartControls";

interface ChartModalProps {
  metric: FinancialMetric;
  isOpen: boolean;
  onClose: () => void;
  ticker?: string;
  /**
   * When non-empty, the modal renders a stacked per-year segment bar chart
   * (FMP revenue-product-segmentation rows) instead of the single metric
   * series — every segment stacked per fiscal year, with a legend, segment
   * breakdown tooltip, and a per-segment table/CSV. Supplied by
   * `RevenueSegmentsCard`; absent for every other metric.
   */
  segmentRows?: RevenueSegmentRow[];
  /**
   * Segment the revenue card had focused when the user clicked Expand.
   * The modal snapshots this on the open transition and pre-applies it to
   * the filter chips so the stacked chart mirrors the card's focus
   * (every other segment hidden). `null` / undefined opens with every
   * segment visible. Ignored in the single-series (non-segment) path.
   */
  selectedSegment?: string | null;
  /**
   * Why the segment payload is unavailable for premium reasons —
   * `"rateLimited"` when FMP returned 429/403 (free-tier quota), or
   * `"unavailable"` when no FMP key was configured. When set AND the
   * modal falls back to the single-series revenue chart (segment rows
   * empty), a small banner above the chart clarifies why per-segment
   * breakdown would normally be available and isn't now. Sets the
   * visual parity with the card's locked chip strip so a user who
   * expanded the modal sees the same premium-tier explanation in both
   * places.
   */
  segmentLockedReason?: "rateLimited" | "unavailable" | null;
  /**
   * Callback that opens the placeholder /pricing modal from any
   * Upgrade link rendered beside the locked banner. Required when the
   * page wires `<PricingModal>` at the page root; left undefined in
   * Storybook / standalone previews — the Upgrade link is hidden in
   * that mode so the modal doesn't crash on a missing callback.
   */
  onUpgradeClick?: () => void;
  /**
   * Stocknest-style metric navigation: when provided (Index.tsx hosts one
   * page-level modal), the header renders prev/next chevrons that cycle to
   * the adjacent metric's chart. Absent for self-hosted modals
   * (RevenueSegmentsCard) — no arrows there.
   */
  onNavigate?: (direction: -1 | 1) => void;
  /**
   * Frequency the modal opens on (and resets to on close), so the expanded
   * view starts where the calling card already is instead of jumping to the
   * default quarterly view. Defaults to quarterly.
   */
  initialFrequency?: ChartFrequency;
  /** Range window the modal opens on. Defaults to 10Y. */
  initialRange?: ChartRange;
}

type TimeframeType = "2Y" | "5Y" | "10Y" | "All";
type Granularity = ChartFrequency;

/**
 * Stocknest-style controls. Granularity reads as `Quarterly | Annual | TTM`:
 * quarterly re-fetches `/api/stock-financials?period=quarter` so each bar is
 * one FMP quarter; TTM rolls the trailing four quarters into each bar (flow
 * metrics) or uses the latest quarter's balance (stock metrics); annual
 * keeps the pre-built `metric.data`. The range tabs (2Y / 5Y / 10Y / All)
 * window the series off its end, and the YoY % toggle flips the bars from
 * absolute values to per-period year-over-year growth.
 */

function currentQuarterLabel(): string {
  const now = new Date();
  return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`;
}

function previousQuarterLabel(label: string): string {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(label);
  if (!match) return label;
  let quarter = Number(match[1]) - 1;
  let year = Number(match[2]);
  if (quarter < 1) {
    quarter = 4;
    year -= 1;
  }
  return `Q${quarter} ${year}`;
}

function formatMetricValue(
  value: number,
  unit: string,
  maxDecimals: number = 2,
) {
  let prefix = "";
  let suffix = "";
  if (unit === "B" || unit === "M") {
    prefix = "$";
    suffix = unit;
  } else if (unit === "%" || unit === "$") {
    if (unit === "$") prefix = "$";
    if (unit === "%") suffix = "%";
  } else {
    suffix = unit || "";
  }

  const formattedNum = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);

  return `${prefix}${formattedNum}${suffix}`;
}

/**
 * Distinct hue ladder for the stacked segment bars. Rotates across segments;
 * the same index → color mapping is used by the legend, tooltip, and table so
 * a segment never changes color between surfaces.
 */
const SEGMENT_PALETTE = [
  "hsl(200 60% 60%)", // Nebula Blue
  "hsl(155 55% 50%)", // Aurora Green
  "hsl(32 85% 58%)", // Ember Orange
  "hsl(265 45% 62%)", // Deep Space Violet
  "hsl(190 65% 58%)", // Glacier Cyan
  "hsl(340 55% 62%)", // Rose Pink
  "hsl(42 65% 70%)", // Starlight Gold
  "hsl(6 70% 58%)", // Ember Red
];

export default function ChartModal({
  metric,
  isOpen,
  onClose,
  ticker = "AAPL",
  segmentRows = [],
  selectedSegment = null,
  segmentLockedReason = null,
  onUpgradeClick,
  onNavigate,
  initialFrequency = "quarterly",
  initialRange = "10Y",
}: ChartModalProps) {
  const { t } = useI18n();
  const [timeframe, setTimeframe] = useState<TimeframeType>(initialRange);
  const [granularity, setGranularity] = useState<Granularity>(initialFrequency);
  const [showYoy, setShowYoy] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [hiddenSegments, setHiddenSegments] = useState<string[]>([]);

  // The revenue card supplies annual segment rows; when non-empty the modal
  // is in segment mode regardless of the granularity toggle (quarterly rows
  // arrive from a separate fetch below). Gates both quarterly fetches so the
  // single-series path and the segment path never request data they don't
  // render.
  const hasSegmentData = segmentRows.some((r) => r.products.length > 0);

  // Quarterly fetch only kicks in when needed; the hook is still safe to
  // call unconditionally because it disables on `!ticker`, but skipping
  // the request on the default annual render keeps the FMP budget lower
  // (the free tier is already at 5-statement-rows max). In segment mode the
  // statement fetch is skipped entirely — segment quarters come from
  // `revenue-product-segmentation` instead.
  const {
    data: quarterlyStatements,
    dataUpdatedAt: quarterlyUpdatedAt,
    isLoading: quarterlyLoading,
    isError: quarterlyError,
  } = useStockFinancials(ticker, {
    period: "quarter",
    enabled: isOpen && granularity !== "annual" && !hasSegmentData,
  });
  const quarterlySource =
    quarterlyStatements?.sources?.income ??
    quarterlyStatements?.sources?.balance ??
    quarterlyStatements?.sources?.cash ??
    null;

  // Quarterly segment rows (FMP `revenue-product-segmentation?period=quarter`),
  // fetched only when the modal is open, segment mode is active, and the
  // user switched the granularity toggle to quarterly. Each row is one 10-Q
  // filing's product breakdown.
  const { data: quarterlySegmentation, isLoading: quarterlySegLoading } =
    useStockRevenueSegmentation(ticker, {
      period: "quarter",
      enabled: isOpen && granularity === "quarterly" && hasSegmentData,
    });
  const quarterlySegmentRows = quarterlySegmentation?.rows ?? [];
  const segmentQuarterlyUnavailable =
    hasSegmentData &&
    granularity === "quarterly" &&
    !quarterlySegLoading &&
    quarterlySegmentation != null &&
    quarterlySegmentRows.length === 0 &&
    !quarterlySegmentation.rateLimited;

  // Series used by the chart. Annual = pre-built points from Index.tsx;
  // quarterly and TTM are projected from the Q-fetch (TTM rolls the trailing
  // four quarters for flow metrics, latest balance for stock variables).
  // Recomputed only when the frequency switches or the quarterly payload
  // lands — keeps the "switching tabs doesn't refetch the same bars"
  // guarantee. `effectiveFrequency` reflects annual fallbacks so the badge
  // never labels annual bars as TTM/quarterly.
  const { points: fullSeries, effectiveFrequency } = useMemo(
    () =>
      buildFrequencySeries({
        metricName: metric.name,
        annualData: metric.data,
        quarterlyStatements,
        frequency: granularity,
      }),
    [granularity, metric, quarterlyStatements, quarterlyUpdatedAt],
  );

  const filteredData = useMemo(() => {
    const sliced = sliceSeriesByRange(fullSeries, timeframe, granularity);
    const expectedCount = rangePeriodCount(timeframe, granularity);

    if (
      Number.isFinite(expectedCount) &&
      sliced.length < expectedCount &&
      sliced.length > 0 &&
      // Pad with locked placeholders only when the requested frequency
      // actually resolved — if the data fell back to annual, a wall of
      // fake quarter labels would misrepresent real annual points, and
      // the unavailable-quarterly warning already explains the gap.
      effectiveFrequency === granularity
    ) {
      // Free-tier payloads stop early — pad the window's leading edge with
      // locked placeholder periods (quarter labels for quarterly mode, FY
      // labels for annual) so the availability mask covers exactly the
      // missing span.
      const missingCount = expectedCount - sliced.length;
      const lockedPeriods = [];
      let lastDateStr = sliced[0]?.date ?? currentQuarterLabel();

      for (let i = 0; i < missingCount; i++) {
        let prevDate = `Locked - ${missingCount - i}`;
        if (granularity !== "annual") {
          // Quarterly and TTM bars both carry Qn YYYY labels — walk back
          // one quarter per missing period. Annual falls through to the
          // FY-label walk.
          prevDate = previousQuarterLabel(lastDateStr);
          lastDateStr = prevDate;
        } else {
          const m = lastDateStr.match(/FY\s+(\d{4})/);
          if (m) {
            const y = parseInt(m[1], 10) - 1;
            prevDate = `FY ${y}`;
            lastDateStr = prevDate;
          }
        }
        lockedPeriods.unshift({ date: prevDate, value: null, isLocked: true });
      }
      return [...lockedPeriods, ...sliced];
    }
    return sliced;
  }, [fullSeries, granularity, timeframe, effectiveFrequency]);

  // YoY % mode: bars flip from absolute values to per-period YoY growth,
  // computed off the FULL frequency series (it needs lookback rows before
  // the window) and then windowed identically to the absolute path.
  const displayData = useMemo(() => {
    if (!showYoy) return filteredData;
    const yoy = buildYoYPoints(fullSeries, granularity);
    const count = rangePeriodCount(timeframe, granularity);
    return Number.isFinite(count) ? yoy.slice(-count) : yoy;
  }, [showYoy, filteredData, fullSeries, granularity, timeframe]);

  // Drive live CAGR/YoY numbers off the projected series so they flip
  // when the user toggles Q ↔ Y. `detectPeriodGranularity` peeks at the
  // most-recent row's `period` label so a Q* string picks the quarterly
  // stride automatically.
  const liveGrowth = useMemo(() => {
    const statements =
      granularity !== "annual"
        ? (quarterlyStatements ?? { income: [], balance: [], cash: [] })
        : null;
    const seriesInfo = statements
      ? { granularity: detectPeriodGranularity(statements.income), statements }
      : null;
    if (!seriesInfo) {
      // Annual path — read the precomputed CAGR off the metric object
      // (Index.tsx computed it from the same ascending annual series).
      return {
        yoy: metric.yoy,
        cagr3Y: metric.cagr3Y,
        methodology: "annual",
      } as const;
    }
    // Quarter path — recompute from the quarterly rows. `cagrAtYearsBack`
    // accepts either the ascending `income` slice or the period-auto
    // granularity; both routes converge here. The `unknown`-double-cast
    // isolates a single seam that bridges `IncomeStatementRow[]
    // (which lacks an index signature) into the permissive shapes the
    // helpers need — keeps the rest of the file narrow and the cast
    // auditable in exactly one place.
    const meta = metricStatementKey(metric.name);
    if (!meta) {
      return {
        yoy: null,
        cagr3Y: null,
        methodology: "quarter",
      } as const;
    }
    const rows = [
      ...(statements[meta.statement] as unknown as ReadonlyArray<
        Record<string, unknown>
      >),
    ].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
    const period = detectPeriodGranularity(rows);
    return {
      yoy: computeYoYFromRows(rows, meta.key),
      cagr3Y: cagrAtYearsBack(rows, meta.key, 3, period),
      methodology: period,
    } as const;
  }, [granularity, quarterlyStatements, metric, quarterlyUpdatedAt]);

  // Generate table data from the filtered chart data to keep them in sync,
  // but reversed (newest first) and with a YoY column computed from the full
  // frequency series. Quarterly strides 4 rows for the same quarter last
  // year; TTM strides 4 windows (rolling year vs the rolling year one year
  // earlier); annual strides 1.
  const tableData = useMemo(() => {
    const lookback = granularity === "annual" ? 1 : 4;

    return [...filteredData].reverse().map((row) => {
      const idx = fullSeries.findIndex((r) => r.date === row.date);
      let yoy: number | null = null;

      if (idx >= lookback && !row.isLocked) {
        const currentVal = fullSeries[idx]?.value;
        const priorVal = fullSeries[idx - lookback]?.value;
        if (
          typeof currentVal === "number" &&
          typeof priorVal === "number" &&
          priorVal !== 0
        ) {
          yoy = ((currentVal - priorVal) / Math.abs(priorVal)) * 100;
        }
      }

      return { ...row, yoy };
    });
  }, [filteredData, fullSeries, granularity]);

  // ── Segment stacked-bar mode (FMP revenue-product-segmentation) ─────────
  // When the revenue card supplies segment rows, the modal swaps its single-
  // series chart for a per-period stacked bar chart. All derived data lives
  // in one memo so the chart, legend, tooltip, table, and CSV share a single
  // source of truth. Segment display order is the card's convention: the
  // most recent period's products first, then earlier periods' products.
  //
  // Granularity picks the row source: annual rows come from the card prop
  // (no extra fetch), quarterly rows from the modal's own `period=quarter`
  // fetch. While quarterly rows are still loading — or when a symbol has no
  // quarterly segment data — the source falls back to the annual rows so the
  // chart never goes blank mid-toggle.
  const segmentSource =
    granularity === "quarterly" && quarterlySegmentRows.length > 0
      ? quarterlySegmentRows
      : segmentRows;

  /** Fiscal-period label for a segment row's x-axis / table / CSV slot. */
  const segmentPeriodLabel = (
    row: RevenueSegmentRow,
    granularity: Granularity,
  ): string => {
    if (granularity === "quarterly") {
      const m = /^(\d{4})-(\d{2})/.exec(row.date);
      if (m) {
        return `Q${Math.floor((Number(m[2]) - 1) / 3) + 1} ${m[1]}`;
      }
      const q = /^Q([1-4])/i.exec(row.period);
      if (q) return `Q${q[1]} ${row.fiscalYear}`.trim();
    }
    return row.fiscalYear || row.date.slice(0, 4) || row.period;
  };

  const segmentModel = useMemo(() => {
    const rowsWithProducts = segmentSource.filter((r) => r.products.length > 0);
    const asc = [...rowsWithProducts].sort((a, b) =>
      granularity === "quarterly"
        ? a.date < b.date
          ? -1
          : 1
        : a.fiscalYear < b.fiscalYear
          ? -1
          : 1,
    );
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of [...asc].reverse()) {
      for (const p of row.products) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          names.push(p.name);
        }
      }
    }
    const rows = asc.map((row) => {
      const point: Record<string, number | string | null> = {
        date: segmentPeriodLabel(row, granularity),
      };
      let total = 0;
      for (const name of names) {
        const product = row.products.find((p) => p.name === name);
        const value = product ? product.revenue / 1e9 : null;
        point[name] = value;
        if (value !== null) total += value;
      }
      point.total = total;
      return point;
    });
    return { names, rows };
  }, [segmentSource, granularity]);

  const isSegmentMode =
    segmentModel.rows.length > 0 && segmentModel.names.length > 0;
  const segmentColor = (name: string) =>
    SEGMENT_PALETTE[
      Math.max(0, segmentModel.names.indexOf(name)) % SEGMENT_PALETTE.length
    ];

  // Filtered view: segments not in `hiddenSegments`. Every surface (bars,
  // legend, tooltip, table, CSV) renders only the visible subset, so the
  // modal's chip row produces one coherent "compare these segments" view.
  const visibleNames = segmentModel.names.filter(
    (n) => !hiddenSegments.includes(n),
  );
  const toggleSegment = (name: string) =>
    setHiddenSegments((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  // Sum of the visible segments for a given point — the "Total" the tooltip
  // and axis domain read, so hiding a layer rescales the remaining stack.
  const visibleTotal = (d: Record<string, number | string | null>) =>
    visibleNames.reduce((acc, name) => {
      const v = d[name];
      return typeof v === "number" && Number.isFinite(v) ? acc + v : acc;
    }, 0);

  // Timeframe slices the stacked bars the same way the single-series path
  // slices `metric.data` (1Y = latest period, 3Y = latest three). Annual
  // counts years, quarterly counts quarters (4 / 12). FMP caps the payloads
  // at 5 annual / 8 quarterly rows, so no locked-period padding is needed
  // here — a 3Y quarterly window simply shows every fetched quarter.
  const segmentWindow = useMemo(
    () =>
      segmentModel.rows.slice(
        -rangePeriodCount(
          timeframe,
          granularity === "quarterly" ? "quarterly" : "annual",
        ),
      ),
    [segmentModel.rows, timeframe, granularity],
  );

  // YoY / 3Y CAGR off the summed period totals, so the growth badges stay
  // meaningful while the bars show the mix. Annual compares consecutive
  // years; quarterly compares the same quarter one / three years back, so
  // seasonality never masquerades as growth. Null when the window is too
  // short → "-" like the other paths.
  const segmentGrowth = useMemo(() => {
    const totals = segmentModel.rows
      .map((r) => r.total)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const last = totals[totals.length - 1];
    const lookback = granularity === "quarterly" ? 4 : 1;
    const prev = totals[totals.length - 1 - lookback];
    const yoy =
      last != null && prev != null && prev !== 0
        ? ((last - prev) / Math.abs(prev)) * 100
        : null;
    const yearsBack = granularity === "quarterly" ? 12 : 3;
    const windowBack = totals[totals.length - 1 - yearsBack];
    const cagr3Y =
      last != null &&
      windowBack != null &&
      windowBack !== 0 &&
      totals.length > yearsBack
        ? (Math.pow(Math.abs(last) / Math.abs(windowBack), 1 / 3) - 1) * 100
        : null;
    return { yoy, cagr3Y };
  }, [segmentModel.rows, granularity]);

  // Segment table rows: newest period first, each segment column + a summed
  // Total, plus a YoY on the total — against the prior year in annual mode,
  // against the same quarter last year in quarterly mode.
  const segmentTableRows = useMemo(() => {
    const asc = segmentModel.rows;
    const lookback = granularity === "quarterly" ? 4 : 1;
    return (
      [...asc]
        .reverse()
        // Explicit return type: spreading a `Record<string, …>` into a fresh
        // object literal makes TS drop the index signature, so `row.date` /
        // `row.total` would otherwise fail below. Pin the type at the map.
        .map<Record<string, number | string | null> & { yoy: number | null }>(
          (point, i) => {
            const ascIdx = asc.length - 1 - i;
            const cur = point.total;
            const prev =
              ascIdx >= lookback ? asc[ascIdx - lookback].total : null;
            let yoy: number | null = null;
            if (
              typeof cur === "number" &&
              typeof prev === "number" &&
              prev !== 0
            ) {
              yoy = ((cur - prev) / Math.abs(prev)) * 100;
            }
            return { ...point, yoy };
          },
        )
    );
  }, [segmentModel.rows, granularity]);

  // Always compute reliable growth metrics regardless of timeframe selection
  const cagrValue = useMemo(() => {
    if (isSegmentMode) return segmentGrowth.cagr3Y;
    if (liveGrowth.cagr3Y !== null && liveGrowth.cagr3Y !== undefined)
      return liveGrowth.cagr3Y;
    const finite = (metric.data || [])
      .map((d) => d.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (finite.length >= 2) {
      const first = finite[0];
      const last = finite[finite.length - 1];
      const span = finite.length - 1;
      if (first > 0 && last > 0 && span > 0) {
        return (Math.pow(last / first, 1 / span) - 1) * 100;
      }
    }
    return null;
  }, [isSegmentMode, segmentGrowth.cagr3Y, liveGrowth.cagr3Y, metric.data]);

  const yoyValue = useMemo(() => {
    if (isSegmentMode) return segmentGrowth.yoy;
    if (liveGrowth.yoy !== null && liveGrowth.yoy !== undefined)
      return liveGrowth.yoy;
    const finite = (metric.data || [])
      .map((d) => d.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (finite.length >= 2) {
      const last = finite[finite.length - 1];
      const prev = finite[finite.length - 2];
      if (prev !== 0) {
        return ((last - prev) / Math.abs(prev)) * 100;
      }
    }
    return null;
  }, [isSegmentMode, segmentGrowth.yoy, liveGrowth.yoy, metric.data]);

  // Reset toggle + timeframe + segment filters when the modal closes /
  // reopens so the next open starts at the default annual 1Y with every
  // segment visible. The 5Y control remains available for the chart window,
  // but no 5Y CAGR card is shown without six annual or twenty-one quarterly
  // endpoints.
  // Tracks the previous `isOpen` value so we can detect the closed → open
  // transition and snapshot the card's segment selection exactly once per
  // open (subsequent in-modal chip toggles, granularity switches, and
  // card chip changes while open must NOT clobber the user's filter).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    if (justOpened) {
      setHiddenSegments(
        selectedSegment && segmentModel.names.length > 0
          ? segmentModel.names.filter((n) => n !== selectedSegment)
          : [],
      );
    } else if (!isOpen) {
      // Reset to the calling card's chart window, not hardcoded defaults.
      setGranularity(initialFrequency);
      setTimeframe(initialRange);
      setShowYoy(false);
      setHiddenSegments([]);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, selectedSegment, segmentModel.names, initialFrequency, initialRange]);

  if (!isOpen) return null;

  const handleDownload = () => {
    // Segment mode exports one column per segment plus the summed total;
    // values are in B units (matching the chart axis) so the CSV reads
    // the same as the bars.
    const csv = isSegmentMode
      ? [
          [
            granularity === "annual" ? "Year" : "Period",
            ...visibleNames,
            "Total",
          ].join(","),
          ...segmentWindow.map((d) =>
            [
              d.date,
              ...visibleNames.map((name) => d[name] ?? ""),
              visibleTotal(d) || "",
            ].join(","),
          ),
        ].join("\n")
      : ["Date,Value", ...filteredData.map((d) => `${d.date},${d.value}`)].join(
          "\n",
        );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isSegmentMode
      ? "revenue_by_segment_annual.csv"
      : `${metric.name}${          granularity === "quarterly"
            ? "_quarterly"
            : granularity === "ttm"
              ? "_ttm"
              : "_annual"
        }.csv`;
    a.click();
  };

  const chartColor = metricChartColor(metric.name, metric.color);
  const gridColor = "hsl(250 20% 18%)"; // Subtle horizontal grid
  const axisColor = "hsl(220 20% 85%)"; // High contrast readable tick labels
  const axisLineColor = "hsl(250 20% 28%)"; // Visible axis baseline
  const chartDomain = calculateChartDomain(
    displayData.map((entry) => entry.value),
  );
  const requestedPeriodCount =
    granularity === "annual" ? 0 : rangePeriodCount(timeframe, granularity);
  const quarterlyAvailability = getChartAvailability(
    filteredData.map((entry) => entry.value),
    requestedPeriodCount,
  );
  const showQuarterlyMask =
    granularity !== "annual" &&
    (quarterlyError || quarterlyAvailability.hasUnavailable);
  const quarterlyMaskWidth =
    quarterlyAvailability.availableCount === 0
      ? "100%"
      : `${Math.round(quarterlyAvailability.fractionUnavailable * 100)}%`;

  const quarterlyMask =
    granularity !== "annual" && (quarterlyLoading || showQuarterlyMask) ? (
      <div
        className="pointer-events-none absolute z-10 flex flex-col items-center justify-center gap-2 overflow-hidden border border-dashed border-border/80 bg-gradient-to-r from-card/95 via-card/85 to-card/25 px-6 text-center backdrop-blur-[2px] rounded-lg"
        style={{
          top: "20px",
          bottom: "55px",
          left: "75px",
          width:
            quarterlyLoading || quarterlyAvailability.availableCount === 0
              ? "calc(100% - 100px)"
              : `calc((100% - 100px) * ${quarterlyAvailability.fractionUnavailable})`,
        }}
        role="status"
        aria-live="polite"
        aria-label={
          quarterlyLoading
            ? "Loading quarterly data"
            : quarterlyAvailability.availableCount === 0
              ? "Quarterly data unavailable"
              : "Some quarterly history is unavailable"
        }
      >
        <div className="rounded-full border border-border/80 bg-card/90 p-2.5 shadow-md shadow-black/40">
          {quarterlyLoading ? (
            <span
              className="block h-4 w-4 animate-pulse rounded-full bg-muted-foreground/50"
              aria-hidden="true"
            />
          ) : (
            <Lock
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/80">
          {quarterlyLoading
            ? "Loading"
            : quarterlyAvailability.availableCount === 0
              ? "Unavailable"
              : "Pro history"}
        </span>
        <span className="max-w-[13rem] text-xs leading-relaxed text-muted-foreground/80">
          {quarterlyLoading
            ? "Fetching quarterly statements..."
            : quarterlyAvailability.availableCount === 0
              ? "No quarterly statements were returned for this symbol."
              : "Earlier quarterly periods are not available."}
        </span>
      </div>
    ) : null;

  const renderChart = () => {
    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        if (data.isLocked) {
          return (
            <div className="bg-card/95 backdrop-blur-md border border-border/80 p-3 rounded-panel text-xs text-foreground shadow-xl text-center rtl:text-right">
              <p
                className="text-muted-foreground mb-1.5 font-mono text-[11px]"
                dir="ltr"
              >
                {label}
              </p>
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground font-semibold text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Pro</span>
              </div>
            </div>
          );
        }
        if (data.value === null || data.value === undefined) return null;

        return (
          <div className="bg-card/95 backdrop-blur-md border border-border/80 p-3 rounded-panel text-xs text-foreground shadow-xl text-left rtl:text-right min-w-[130px]">
            <p
              className="text-muted-foreground mb-1.5 font-mono text-[11px] pb-1 border-b border-border/40"
              dir="ltr"
            >
              {label}
            </p>
            <p className="font-bold text-base flex items-baseline gap-1.5 font-mono tabular-nums text-foreground">
              <span className="font-sans text-xs font-normal text-muted-foreground">
                {showYoy ? t("chart.yoyToggle") : `${t(metric.name)}:`}
              </span>
              <span
                dir="ltr"
                className={
                  data.value >= 0
                    ? "text-chart-positive"
                    : "text-chart-negative"
                }
              >
                {showYoy
                  ? `${data.value >= 0 ? "+" : ""}${data.value.toFixed(1)}%`
                  : formatMetricValue(data.value, metric.unit, 2)}
              </span>
            </p>
          </div>
        );
      }
      return null;
    };

    if (isSegmentMode) {
      const maxTotal = Math.max(
        1,
        ...segmentWindow.map((d) => visibleTotal(d)),
      );
      const SegmentTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || payload.length === 0) return null;
        const point = payload[0].payload;
        const total = visibleTotal(point);
        return (
          <div className="bg-card/95 backdrop-blur-md border border-border/80 p-3.5 rounded-panel text-xs text-foreground shadow-xl text-left rtl:text-right min-w-[12rem]">
            <p
              className="text-muted-foreground mb-2 font-mono text-[11px] pb-1 border-b border-border/40"
              dir="ltr"
            >
              {label}
            </p>
            <div className="space-y-1">
              {visibleNames.map((name) => {
                const value = point[name];
                if (typeof value !== "number" || !Number.isFinite(value)) {
                  return null;
                }
                return (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-4 py-0.5"
                  >
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                        style={{ background: segmentColor(name) }}
                      />
                      <span className="truncate max-w-[100px]">{name}</span>
                    </span>
                    <span
                      className="font-mono tabular-nums font-semibold text-foreground"
                      dir="ltr"
                    >
                      {formatMetricValue(value, "B", 2)}
                    </span>
                  </div>
                );
              })}
            </div>
            {total > 0 && (
              <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-border/50">
                <span className="font-semibold text-foreground/80">
                  {t("chart.total")}
                </span>
                <span
                  className="font-mono tabular-nums font-bold text-foreground"
                  dir="ltr"
                >
                  {formatMetricValue(total, "B", 2)}
                </span>
              </div>
            )}
          </div>
        );
      };

      if (visibleNames.length === 0) {
        return (
          <div className="h-[340px] sm:h-[380px] w-full flex items-center justify-center text-sm text-muted-foreground">
            {t("chart.segmentNoSelection")}
          </div>
        );
      }

      const renderSegmentLabel = (segmentName: string) => {
        const SegmentShareLabel = (props: {
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          value?: number;
          index?: number;
        }) => {
          const { x, y, width, height, index } = props;
          if (
            typeof index !== "number" ||
            typeof width !== "number" ||
            typeof height !== "number" ||
            typeof x !== "number" ||
            typeof y !== "number"
          ) {
            return null;
          }
          const point = segmentWindow[index] as
            | Record<string, number | string | null>
            | undefined;
          if (!point) return null;
          const total = visibleTotal(point);
          if (total <= 0) return null;
          const slice = point[segmentName];
          if (typeof slice !== "number" || !Number.isFinite(slice)) {
            return null;
          }
          const share = (slice / total) * 100;
          if (share < 4 || height < 14 || width < 28) return null;
          const fontSize = width < 50 ? 9 : 11;
          return (
            <text
              x={x + width / 2}
              y={y + height / 2}
              fill="white"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={600}
              style={{
                pointerEvents: "none",
                paintOrder: "stroke",
                stroke: "rgba(20, 18, 32, 0.55)",
                strokeWidth: 2,
                strokeLinejoin: "round",
              }}
            >
              {`${Math.round(share)}%`}
            </text>
          );
        };
        return <SegmentShareLabel />;
      };

      return (
        <div className="relative h-[340px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={segmentWindow}
              margin={{ top: 20, right: 25, left: 10, bottom: 25 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
                strokeOpacity={0.7}
              />
              <XAxis
                height={30}
                dataKey="date"
                stroke={axisLineColor}
                tickLine={{ stroke: axisLineColor, strokeWidth: 1 }}
                tick={{
                  fontSize: 12,
                  fill: axisColor,
                  fontWeight: 600,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                tickMargin={10}
              />
              <YAxis
                width={65}
                stroke={axisLineColor}
                tickLine={{ stroke: axisLineColor, strokeWidth: 1 }}
                tick={{
                  fontSize: 12,
                  fill: axisColor,
                  fontWeight: 600,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                tickMargin={10}
                domain={[0, maxTotal * 1.15]}
                tickCount={5}
                tickFormatter={(val) => formatMetricValue(val, "B", 0)}
              />
              <Tooltip
                content={<SegmentTooltip />}
                cursor={{ fill: "hsl(250 20% 16% / 0.35)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visibleNames.map((name) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="seg"
                  fill={segmentColor(name)}
                  stroke="hsl(250 20% 14%)"
                  strokeWidth={1}
                  isAnimationActive={false}
                  maxBarSize={48}
                  radius={[2, 2, 0, 0]}
                >
                  <LabelList content={renderSegmentLabel(name)} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Stocknest-style single-series bar view: slim solid bars in the
    // metric's color, compact axes, no per-bar value labels (the tooltip
    // carries the numbers). YoY mode colors gains/losses semantically.
    if (displayData.length === 0) {
      return (
        <div className="flex h-[340px] w-full items-center justify-center text-sm text-muted-foreground sm:h-[380px]">
          —
        </div>
      );
    }

    return (
      <div className="relative h-[340px] w-full sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            margin={{ top: 16, right: 16, left: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke={gridColor}
              vertical={false}
              strokeOpacity={0.6}
            />
            <XAxis
              height={30}
              dataKey="date"
              tickFormatter={compactPeriodLabel}
              axisLine={{ stroke: axisLineColor, strokeWidth: 1 }}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: axisColor,
                fontFamily: "JetBrains Mono, monospace",
              }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              width={56}
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: axisColor,
                fontFamily: "JetBrains Mono, monospace",
              }}
              tickMargin={8}
              domain={chartDomain}
              allowDataOverflow={false}
              tickCount={5}
              tickFormatter={(val) =>
                showYoy
                  ? `${Math.round(val)}%`
                  : formatMetricValue(val, metric.unit, 0)
              }
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(250 20% 16% / 0.35)" }}
            />
            <Bar
              dataKey="value"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            >
              {displayData.map((entry, index) => (
                <Cell
                  key={`bar-cell-${index}`}
                  fill={
                    typeof entry.value === "number" && entry.value < 0
                      ? "hsl(var(--chart-negative))"
                      : chartColor
                  }
                  fillOpacity={entry.value == null ? 0 : 1}
                />
              ))}
            </Bar>
            <ReferenceLine
              y={0}
              yAxisId="0"
              stroke="hsl(250 20% 30%)"
              strokeWidth={1}
            />
          </BarChart>
        </ResponsiveContainer>
        {quarterlyMask}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] w-[96vw] max-w-5xl max-h-[90vh] flex flex-row overflow-hidden relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Left Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative">
          {/* Header — title + frequency badge left, metric nav + close right */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 sticky top-0 bg-card/95 backdrop-blur-sm z-20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <TickerLogo ticker={ticker} size="md" />
              <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted/60 border border-border/60 text-foreground shrink-0">
                  {ticker}
                </span>
                <span className="text-muted-foreground/40 font-light">/</span>
                <span className="tracking-tight truncate">
                  {isSegmentMode
                    ? t("metrics.revenueBySegment")
                    : t(metric.name)}
                </span>
                {!isSegmentMode && (
                  <span
                    className="shrink-0 text-[11px] font-bold text-chart-amber"
                    dir="ltr"
                  >
                    {t(frequencyLabelKey(effectiveFrequency))}
                  </span>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onNavigate && !isSegmentMode && (
                <>
                  <button
                    onClick={() => onNavigate(-1)}
                    className="h-8 w-8 rounded-md bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all border border-border/30 hover:border-border"
                    aria-label={t("chart.prevMetric")}
                    title={t("chart.prevMetric")}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onNavigate(1)}
                    className="h-8 w-8 rounded-md bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all border border-border/30 hover:border-border"
                    aria-label={t("chart.nextMetric")}
                    title={t("chart.nextMetric")}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-md bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all border border-border/30 hover:border-border"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stocknest control bar: ranges left · YoY toggle · frequency + tools right */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/15 gap-3 flex-wrap shrink-0 sm:px-6">
            <RangeTabs value={timeframe} onChange={setTimeframe} />
            {!isSegmentMode && (
              <YoYToggle checked={showYoy} onToggle={setShowYoy} />
            )}
            <div className="flex items-center gap-2 flex-wrap ms-auto">
              <FrequencyTabs value={granularity} onChange={setGranularity} />
              <div className="ms-1 flex items-center gap-1.5">
                <button
                  onClick={() => setShowTable(!showTable)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border transition-all",
                    showTable
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  title="Table View"
                  aria-label="Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDownload}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                  title={t("chart.download")}
                  aria-label={t("chart.download")}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="p-4 sm:p-6 shrink-0">
            {granularity !== "annual" &&
              quarterlySource === null &&
              quarterlyStatements && (
                <div className="mb-3 rounded-lg border border-chart-amber/30 bg-chart-amber/5 px-3 py-2 text-xs text-chart-amber">
                  Quarterly statements are unavailable from both providers for
                  this symbol.
                </div>
              )}
            {segmentQuarterlyUnavailable && (
              <div className="mb-3 rounded-lg border border-chart-amber/30 bg-chart-amber/5 px-3 py-2 text-xs text-chart-amber">
                {t("chart.segmentQuarterlyUnavailable")}
              </div>
            )}
            {/* Locked-premium fallback */}
            {segmentLockedReason && !isSegmentMode && (
              <>
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-chart-amber/30 bg-chart-amber/5 p-3.5 text-xs text-muted-foreground shadow-sm">
                  <div className="p-1 rounded-md bg-chart-amber/15 text-chart-amber shrink-0 mt-0.5">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-left rtl:text-right flex-1">
                    <p className="font-bold text-foreground tracking-tight mb-0.5">
                      {t("revenueSegments.modalBannerTitle")}
                    </p>
                    <p className="text-muted-foreground/90 leading-relaxed">
                      {segmentLockedReason === "rateLimited"
                        ? t("revenueSegments.modalBannerRateLimited")
                        : t("revenueSegments.modalBannerUnavailable")}
                    </p>
                  </div>
                  {/* Inline CTA */}
                  {onUpgradeClick && (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      data-testid="revenue-segments-upgrade-cta"
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_0_12px_-2px_hsl(var(--primary)/0.4)]"
                    >
                      {t("revenueSegments.upgradeCta")}
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
                <div
                  className="flex flex-wrap items-center gap-1.5 mb-4"
                  aria-label={t("revenueSegments.locked")}
                >
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-chart-blue/15 text-chart-blue border-chart-blue/30"
                  >
                    {t("revenueSegments.all")}
                  </button>
                  <span className="inline-flex items-center gap-1.5">
                    {/* Locked chip */}
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-muted/30 text-muted-foreground border-border/50 cursor-not-allowed select-none"
                      title={
                        segmentLockedReason === "rateLimited"
                          ? t("revenueSegments.rateLimitedTooltip")
                          : t("revenueSegments.unavailableTooltip")
                      }
                    >
                      <Lock className="h-3 w-3" />
                      {t("revenueSegments.locked")}
                    </span>
                    {/* Premium pill */}
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border border-primary/40 bg-primary/15 text-primary shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]"
                      aria-label={t("revenueSegments.premiumBadge")}
                      title={
                        segmentLockedReason === "rateLimited"
                          ? t("revenueSegments.rateLimitedTooltip")
                          : t("revenueSegments.unavailableTooltip")
                      }
                      data-testid="revenue-segments-premium-badge"
                    >
                      {t("revenueSegments.premiumBadge")}
                    </span>
                  </span>
                </div>
              </>
            )}
            {/* Segment filter chips */}
            {isSegmentMode && (
              <div
                className="flex flex-wrap items-center gap-1.5 mb-4"
                aria-label={t("metrics.revenueBySegment")}
              >
                <button
                  type="button"
                  onClick={() => setHiddenSegments([])}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all",
                    hiddenSegments.length === 0
                      ? "bg-chart-blue/15 text-chart-blue border-chart-blue/40 shadow-[0_0_8px_-2px_hsl(var(--chart-blue)/0.3)]"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  {t("revenueSegments.all")}
                </button>
                {segmentModel.names.map((name) => {
                  const hidden = hiddenSegments.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSegment(name)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all",
                        hidden
                          ? "bg-muted/30 text-muted-foreground/40 border-border/30 line-through decoration-muted-foreground/40"
                          : "bg-muted/30 text-foreground border-border/40 hover:text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                        style={{ background: segmentColor(name) }}
                      />
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            {renderChart()}
          </div>

          {/* Growth Metrics — Always visible with clean spacing */}
          <div className="border-t border-border/70 bg-muted/15 shrink-0 p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-4xl mx-auto">
              {[
                {
                  label: t("chart.cagr3Y"),
                  value: cagrValue,
                  description:
                    granularity !== "annual"
                      ? t("chart.descCagr3YQuarter")
                      : t("chart.descCagr3Y"),
                },
                {
                  label: t("chart.yoy1Y"),
                  value: yoyValue,
                  description:
                    granularity !== "annual"
                      ? t("chart.descYoYQuarter")
                      : t("chart.descYoY"),
                },
              ].map((item, idx) => {
                const hasValue =
                  item.value !== null &&
                  item.value !== undefined &&
                  Number.isFinite(Number(item.value));
                const num = hasValue ? Number(item.value) : 0;
                const isPositive = hasValue && num >= 0;
                const isNegative = hasValue && num < 0;
                const valueColor = !hasValue
                  ? "text-muted-foreground/60"
                  : isPositive
                    ? "text-chart-positive"
                    : "text-chart-negative";
                return (
                  <div
                    key={idx}
                    className="bg-card/85 border border-border/70 rounded-xl p-3.5 sm:px-5 flex items-center justify-between shadow-sm hover:border-primary/40 transition-all group relative cursor-help"
                  >
                    <div className="flex flex-col text-left rtl:text-right">
                      <p className="text-[11px] text-muted-foreground/80 font-bold uppercase tracking-[0.14em]">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5 max-w-[220px] truncate">
                        {item.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      {hasValue &&
                        (isPositive ? (
                          <TrendingUp className="w-4 h-4 text-chart-positive shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-chart-negative shrink-0" />
                        ))}
                      <span
                        className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight ${valueColor}`}
                        dir="ltr"
                      >
                        {hasValue ? `${num.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <div className="invisible group-hover:visible text-xs text-muted-foreground bg-card/95 backdrop-blur-sm p-2 rounded border border-border/80 shadow-lg absolute left-1/2 -translate-x-1/2 -top-10 z-20 w-max pointer-events-none">
                      {item.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side Data Table Panel */}
        {showTable && (
          <div className="w-80 md:w-96 border-l border-border/80 bg-card/95 backdrop-blur-md flex flex-col z-10 shrink-0 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-border/80 flex justify-between items-center sticky top-0 bg-card z-10 shrink-0">
              <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-tight">
                <TableIcon className="w-4 h-4" />
                Table View
              </div>
              <button
                onClick={() => setShowTable(false)}
                className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {isSegmentMode ? (
                <div className="rounded-lg border border-border/60 overflow-x-auto bg-card/50 shadow-sm">
                  <table className="w-full text-xs text-left rtl:text-right border-collapse">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10 border-b border-border/60">
                      <tr>
                        <th className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider whitespace-nowrap">
                          {t("chart.period") || "Period"}
                        </th>
                        {visibleNames.map((name) => (
                          <th
                            key={name}
                            className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider text-right whitespace-nowrap"
                          >
                            {name}
                          </th>
                        ))}
                        <th className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider text-right whitespace-nowrap">
                          {t("chart.total")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono">
                      {segmentTableRows.map((row) => (
                        <tr
                          key={String(row.date)}
                          className="hover:bg-muted/40 transition-colors"
                        >
                          <td
                            className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap"
                            dir="ltr"
                          >
                            {String(row.date)}
                          </td>
                          {visibleNames.map((name) => {
                            const value = row[name];
                            const hasValue =
                              typeof value === "number" &&
                              Number.isFinite(value);
                            return (
                              <td
                                key={name}
                                className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-foreground/90"
                                dir="ltr"
                              >
                                {hasValue
                                  ? formatMetricValue(value as number, "B", 2)
                                  : "—"}
                              </td>
                            );
                          })}
                          <td
                            className="py-2.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap text-foreground"
                            dir="ltr"
                          >
                            {formatMetricValue(visibleTotal(row) || 0, "B", 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 overflow-hidden bg-card/50 shadow-sm">
                  <table className="w-full text-xs text-left rtl:text-right border-collapse">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10 border-b border-border/60">
                      <tr>
                        <th className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider w-1/3">
                          {t("chart.period") || "Period"}
                        </th>
                        <th className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider text-right w-1/3">
                          {t("chart.value") || "Value"}
                        </th>
                        <th className="py-2.5 px-3 text-muted-foreground font-semibold uppercase tracking-wider text-right w-1/3">
                          {t("chart.yoy") || "YoY Growth"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono">
                      {tableData.map((row, i) => {
                        if (row.isLocked) {
                          return (
                            <tr
                              key={`locked-${i}`}
                              className="hover:bg-muted/30 transition-colors group"
                            >
                              <td
                                className="py-2.5 px-3 font-mono text-muted-foreground/60"
                                dir="ltr"
                              >
                                {row.date}
                              </td>
                              <td
                                className="py-2.5 px-3 text-right"
                                colSpan={2}
                              >
                                <div className="flex items-center justify-end gap-1.5 text-muted-foreground/50">
                                  <Lock className="w-3 h-3" />
                                  <span className="text-[10px] font-semibold tracking-wide uppercase">
                                    Pro
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const hasValue = typeof row.value === "number";
                        const hasYoY = typeof row.yoy === "number";
                        const isPositive = hasYoY && row.yoy! > 0;
                        const isNegative = hasYoY && row.yoy! < 0;

                        return (
                          <tr
                            key={row.date}
                            className="hover:bg-muted/40 transition-colors"
                          >
                            <td
                              className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap"
                              dir="ltr"
                            >
                              {row.date}
                            </td>
                            <td
                              className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground whitespace-nowrap"
                              dir="ltr"
                            >
                              {hasValue
                                ? formatMetricValue(row.value, metric.unit, 2)
                                : "—"}
                            </td>
                            <td
                              className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                              dir="ltr"
                            >
                              {hasYoY ? (
                                <div
                                  className={`flex items-center justify-end gap-1 font-semibold ${isPositive ? "text-chart-positive" : isNegative ? "text-chart-negative" : "text-muted-foreground"}`}
                                >
                                  {isPositive ? (
                                    <TrendingUp className="w-3 h-3" />
                                  ) : isNegative ? (
                                    <TrendingDown className="w-3 h-3" />
                                  ) : null}
                                  <span>{Math.abs(row.yoy!).toFixed(2)}%</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Quarter-over-prior-quarter YoY helper. We expose it locally (not in
 * finance.ts) because it's only consumed here; adding it to finance.ts
 * would tempt future readers to use it for annual series and miss the
 * "same-quarter-prior-year" vs "consecutive-period" distinction.
 *
 * Strategy: walk the ascending series back 4 rows so the trailing-edge
 * comparison aligns the bar to the same calendar quarter (Q2 2025 vs
 * Q2 2024) — that mirrors how research desks talk about quarterly
 *
 * Q-o-Q growth, not "Q1→Q2 sequential". Returns `null` if the series is
 * too short or either endpoint is non-positive/non-finite so the modal
 * badge renders "-" instead of an integer "-" / undefined mismatch.
 */
function computeYoYFromRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  key: string,
): number | null {
  if (!Array.isArray(rows) || rows.length < 5) return null;
  const last = Number(rows[rows.length - 1][key]);
  const priorYearSameQuarter = Number(rows[rows.length - 5][key]);
  if (!Number.isFinite(last) || !Number.isFinite(priorYearSameQuarter))
    return null;
  if (Math.abs(priorYearSameQuarter) === 0) return null;
  return ((last - priorYearSameQuarter) / Math.abs(priorYearSameQuarter)) * 100;
}

/**
 * Type-safe adapter around `cagrAtYearsBack` that accepts the typed
 * `IncomeStatementRow[]` from `useStockFinancials` directly. The
 * underlying helper needs to look up arbitrary `key` values off each
 * row, but the shared API's row interfaces intentionally omit an index
 * signature so TS refuses to widen them through `unknown`. The
 * `unknown`-double-cast here is the seam; it lives in exactly one place
 * so a future contributor who wants a stronger contract can tighten it
 * without hunting through caller code.
 */
function quarterCagr(
  rows: ReadonlyArray<Record<string, unknown>> | undefined,
  key: string,
  years: number,
): number | null {
  return cagrAtYearsBack(
    rows as unknown as ReadonlyArray<Record<string, unknown>>,
    key,
    years,
    "quarter",
  );
}
