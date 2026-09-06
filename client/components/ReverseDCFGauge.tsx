import React, { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Target,
  Info,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { computeDcfFairValue } from "./ValuationSensitivityMatrix";

export interface ReverseDCFGaugeProps {
  activeBase: number;
  currentPrice: number;
  discountRate: number;
  multiple: number;
  sharesOutstanding: number;
  userGrowthRate: number;
  valuationMode?: "cashFlow" | "earnings";
  onApplyImpliedGrowth?: (impliedGrowth: number) => void;
}

/**
 * Numerical bisection solver for Reverse DCF.
 * Finds g in [-90, 300]% such that computeDcfFairValue(base, g, discountRate, multiple, shares) = currentPrice.
 */
export function solveImpliedGrowthRate(
  base: number,
  currentPrice: number,
  discountRate: number,
  multiple: number,
  sharesOutstanding: number,
  maxIterations = 40,
  epsilon = 0.01,
): number | null {
  if (
    base <= 0 ||
    currentPrice <= 0 ||
    sharesOutstanding <= 0 ||
    multiple <= 0 ||
    discountRate <= 0
  ) {
    return null;
  }

  let low = -90.0;
  let high = 300.0;

  // Boundary check
  const fvLow = computeDcfFairValue(
    base,
    low,
    discountRate,
    multiple,
    sharesOutstanding,
  );
  const fvHigh = computeDcfFairValue(
    base,
    high,
    discountRate,
    multiple,
    sharesOutstanding,
  );

  if (currentPrice <= fvLow) return low;
  if (currentPrice >= fvHigh) return high;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const fvMid = computeDcfFairValue(
      base,
      mid,
      discountRate,
      multiple,
      sharesOutstanding,
    );
    const diff = fvMid - currentPrice;

    if (Math.abs(diff) < epsilon || high - low < 0.01) {
      return Number(mid.toFixed(2));
    }

    if (diff < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Number(((low + high) / 2).toFixed(2));
}

/**
 * Categorizes the implied growth into actionable market expectation regimes.
 */
export function getExpectationRegime(impliedGrowth: number): {
  key: string;
  badgeClass: string;
  textClass: string;
  colorHex: string;
} {
  if (impliedGrowth > 25) {
    return {
      key: "dcf.regimeHyper",
      badgeClass:
        "bg-chart-negative/15 text-chart-negative border-chart-negative/30",
      textClass: "text-chart-negative",
      colorHex: "#ef4444",
    };
  }
  if (impliedGrowth > 15) {
    return {
      key: "dcf.regimeHigh",
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      textClass: "text-amber-400",
      colorHex: "#f59e0b",
    };
  }
  if (impliedGrowth > 5) {
    return {
      key: "dcf.regimeModerate",
      badgeClass: "bg-primary/15 text-primary border-primary/30",
      textClass: "text-primary",
      colorHex: "#38bdf8",
    };
  }
  if (impliedGrowth >= 0) {
    return {
      key: "dcf.regimeLow",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      textClass: "text-emerald-400",
      colorHex: "#10b981",
    };
  }
  return {
    key: "dcf.regimeContraction",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    textClass: "text-blue-400",
    colorHex: "#60a5fa",
  };
}

export const ReverseDCFGauge: React.FC<ReverseDCFGaugeProps> = ({
  activeBase,
  currentPrice,
  discountRate,
  multiple,
  sharesOutstanding,
  userGrowthRate,
  valuationMode = "cashFlow",
  onApplyImpliedGrowth,
}) => {
  const { t, isRtl } = useI18n();

  // Calculate market-implied growth rate
  const impliedGrowth = useMemo(() => {
    return solveImpliedGrowthRate(
      activeBase,
      currentPrice,
      discountRate,
      multiple,
      sharesOutstanding,
    );
  }, [activeBase, currentPrice, discountRate, multiple, sharesOutstanding]);

  // Implied Year 5 metric ($B)
  const impliedYear5Metric = useMemo(() => {
    if (impliedGrowth === null) return 0;
    return activeBase * Math.pow(1 + impliedGrowth / 100, 5);
  }, [activeBase, impliedGrowth]);

  // Expectation Spread (user assumed - market implied)
  const spread = useMemo(() => {
    if (impliedGrowth === null) return 0;
    return userGrowthRate - impliedGrowth;
  }, [userGrowthRate, impliedGrowth]);

  const hasHeadroom = spread >= 0;
  const absSpread = Math.abs(spread);

  // Speedometer needle angle calculation (-20% to +40% mapped to -90 deg to +90 deg)
  const minG = -20;
  const maxG = 40;
  const clampedImplied =
    impliedGrowth !== null ? Math.max(minG, Math.min(maxG, impliedGrowth)) : 0;
  const clampedUser = Math.max(minG, Math.min(maxG, userGrowthRate));

  const impliedAngle = ((clampedImplied - minG) / (maxG - minG)) * 180 - 90;
  const userAngle = ((clampedUser - minG) / (maxG - minG)) * 180 - 90;

  const regime = getExpectationRegime(impliedGrowth ?? 0);

  return (
    <div
      className="bg-card/60 backdrop-blur border border-border/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Gauge className="w-4 h-4" />
            </div>
            <h3
              id="reverse-dcf-title"
              className="text-base font-semibold text-foreground tracking-tight"
            >
              {t("dcf.reverseDcfTitle") || "Reverse DCF Expectation Solver"}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none"
                    aria-label="Reverse DCF explanation"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {t("dcf.reverseDcfTooltip") ||
                    "Inverts the DCF formula to solve for the market-implied growth rate. Compare this against your expectations to assess whether the stock is priced for perfection or under-appreciated."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("dcf.reverseDcfSubtitle") ||
              "Calculates the exact 5-year growth rate the current stock price is pricing in."}
          </p>
        </div>

        {/* Expectation Regime Badge */}
        {impliedGrowth !== null && (
          <div
            className={`px-3 py-1.5 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 self-start sm:self-auto ${regime.badgeClass}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t(regime.key as any)}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Visual Speedometer Gauge & Stat Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Speedometer Gauge Visual (Left / Center) */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center p-4 bg-secondary/20 rounded-xl border border-border/60 relative">
          <svg
            viewBox="0 0 240 140"
            className="w-full max-w-[280px] overflow-visible"
            aria-label={`Reverse DCF Speedometer Gauge: Market Implied Growth ${
              impliedGrowth !== null ? `${impliedGrowth.toFixed(1)}%` : "N/A"
            }`}
            role="img"
          >
            <defs>
              <linearGradient
                id="gaugeGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="35%" stopColor="#10b981" />
                <stop offset="65%" stopColor="#38bdf8" />
                <stop offset="85%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            {/* Background Arc */}
            <path
              d="M 20 120 A 100 100 0 0 1 220 120"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="16"
              strokeLinecap="round"
              opacity="0.3"
            />

            {/* Colored Gradient Spectrum Arc */}
            <path
              d="M 20 120 A 100 100 0 0 1 220 120"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Scale Tick Labels */}
            <text
              x="14"
              y="136"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              -20%
            </text>
            <text
              x="75"
              y="42"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              0%
            </text>
            <text
              x="114"
              y="24"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              10%
            </text>
            <text
              x="156"
              y="42"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              25%
            </text>
            <text
              x="210"
              y="136"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              +40%
            </text>

            {/* User Assumption Marker Line */}
            <g transform={`translate(120, 120) rotate(${userAngle})`}>
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="-94"
                stroke="hsl(var(--foreground))"
                strokeWidth="2"
                strokeDasharray="3 3"
                opacity="0.75"
              />
              <circle cx="0" cy="-96" r="3" fill="hsl(var(--foreground))" />
            </g>

            {/* Market Implied Needle Pointer */}
            <g
              transform={`translate(120, 120) rotate(${impliedAngle})`}
              className="transition-transform duration-500 ease-out"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="-88"
                stroke={regime.colorHex}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx="0" cy="0" r="7" fill={regime.colorHex} />
              <circle cx="0" cy="0" r="3" fill="hsl(var(--background))" />
            </g>
          </svg>

          {/* Central Implied Growth Readout */}
          <div className="text-center mt-2 space-y-0.5">
            <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground">
              {t("dcf.marketImpliedGrowth") || "Market-Implied 5Y CAGR"}
            </div>
            <div
              className={`text-3xl font-bold font-mono tabular-nums ${regime.textClass}`}
            >
              {impliedGrowth !== null
                ? `${impliedGrowth >= 0 ? "+" : ""}${impliedGrowth.toFixed(1)}%`
                : "—"}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              {t("dcf.basedOnPriceAndWacc", {
                price: currentPrice.toFixed(2),
                wacc: discountRate,
              })}
            </div>
          </div>
        </div>

        {/* Breakdown Metric Cards & Actions (Right Column) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Comparison Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* User Assumption Card */}
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("dcf.userAssumedGrowth") || "Your Assumption"}</span>
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-xl font-bold font-mono text-foreground tabular-nums">
                {userGrowthRate >= 0 ? "+" : ""}
                {userGrowthRate.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {t("dcf.currentSandboxSetting") || "Current sandbox setting"}
              </p>
            </div>

            {/* Expectation Spread Card */}
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/80 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("dcf.expectationDelta") || "Expectation Spread"}</span>
                {hasHeadroom ? (
                  <TrendingUp className="w-3.5 h-3.5 text-chart-positive" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-chart-negative" />
                )}
              </div>
              <p
                className={`text-xl font-bold font-mono tabular-nums ${
                  hasHeadroom ? "text-chart-positive" : "text-chart-negative"
                }`}
              >
                {hasHeadroom ? "+" : "-"}
                {absSpread.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {hasHeadroom
                  ? t("dcf.growthHeadroom") || "Growth headroom"
                  : t("dcf.growthDeficit") || "Growth deficit"}
              </p>
            </div>
          </div>

          {/* Context Banner */}
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/60 space-y-2">
            <div className="flex items-start gap-2.5">
              {hasHeadroom ? (
                <CheckCircle2 className="w-4 h-4 text-chart-positive shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs text-foreground/90 space-y-1">
                <p className="font-medium">
                  {hasHeadroom
                    ? t("dcf.headroomDescription", {
                        spread: absSpread.toFixed(1),
                      }) ||
                      `You expect ${absSpread.toFixed(1)}% higher growth than the market is pricing in (undervaluation cushion).`
                    : t("dcf.deficitDescription", {
                        spread: absSpread.toFixed(1),
                      }) ||
                      `The market price requires ${absSpread.toFixed(1)}% higher growth than your current assumption.`}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {t("dcf.impliedTerminalMetric") || "Implied Year 5 Base"}: $
                  {impliedYear5Metric.toFixed(1)}B (
                  {valuationMode === "cashFlow"
                    ? t("dcf.fcfBase") || "FCF"
                    : t("dcf.netIncomeBase") || "Net Income"}
                  )
                </p>
              </div>
            </div>
          </div>

          {/* Quick Apply Button */}
          {onApplyImpliedGrowth && impliedGrowth !== null && (
            <button
              type="button"
              onClick={() => onApplyImpliedGrowth(impliedGrowth)}
              className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-mono text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {t("dcf.applyImpliedToSandbox") ||
                  "Apply Implied Growth to DCF"}{" "}
                ({impliedGrowth.toFixed(1)}%)
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReverseDCFGauge;
