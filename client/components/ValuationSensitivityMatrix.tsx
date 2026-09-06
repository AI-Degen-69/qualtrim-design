import React, { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Table2, Sparkles, Crosshair, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ValuationSensitivityMatrixProps {
  activeBase: number;
  currentPrice: number;
  growthRate: number;
  multiple: number;
  discountRate: number;
  sharesOutstanding: number;
  valuationMode?: "cashFlow" | "earnings";
  onSelectScenario?: (scenario: {
    discountRate?: number;
    growthRate?: number;
    multiple?: number;
  }) => void;
  className?: string;
}

export type MatrixDimension = "growth" | "multiple";

/**
 * Pure DCF Fair Value computation function per share.
 */
export function computeDcfFairValue(
  baseValue: number,
  growthPercent: number,
  discountPercent: number,
  exitMultiple: number,
  sharesCount: number,
): number {
  if (sharesCount <= 0 || baseValue <= 0) return 0;
  const g = growthPercent / 100;
  const d = Math.max(0.001, discountPercent / 100);

  let sumPv = 0;
  for (let yr = 1; yr <= 5; yr++) {
    const valYr = baseValue * Math.pow(1 + g, yr);
    const pv = valYr / Math.pow(1 + d, yr);
    sumPv += pv;
  }

  const y5Val = baseValue * Math.pow(1 + g, 5);
  const terminalVal = y5Val * exitMultiple;
  const pvTerminal = terminalVal / Math.pow(1 + d, 5);
  const totalEnterprisePv = sumPv + pvTerminal;

  return Math.max(0, totalEnterprisePv / sharesCount);
}

/**
 * Categorize the margin of safety for heatmap styling.
 */
export function getValuationCellTheme(
  fairVal: number,
  currPrice: number,
): {
  bgClass: string;
  textClass: string;
  badgeClass: string;
  verdict:
    | "deepDiscount"
    | "undervalued"
    | "fair"
    | "overvalued"
    | "deepOvervalued";
} {
  if (currPrice <= 0 || fairVal <= 0) {
    return {
      bgClass: "bg-secondary/40 hover:bg-secondary/60 border-border/50",
      textClass: "text-muted-foreground",
      badgeClass: "bg-secondary text-muted-foreground",
      verdict: "fair",
    };
  }

  const diffPercent = ((fairVal - currPrice) / currPrice) * 100;

  if (diffPercent >= 30) {
    return {
      bgClass:
        "bg-chart-positive/20 hover:bg-chart-positive/30 border-chart-positive/40 text-chart-positive",
      textClass: "text-chart-positive font-semibold",
      badgeClass:
        "bg-chart-positive/20 text-chart-positive border border-chart-positive/30",
      verdict: "deepDiscount",
    };
  }
  if (diffPercent >= 10) {
    return {
      bgClass:
        "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
      textClass: "text-emerald-400 font-medium",
      badgeClass:
        "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      verdict: "undervalued",
    };
  }
  if (diffPercent >= -10) {
    return {
      bgClass:
        "bg-secondary/30 hover:bg-secondary/50 border-border/60 text-foreground",
      textClass: "text-foreground font-medium",
      badgeClass: "bg-secondary text-muted-foreground border border-border",
      verdict: "fair",
    };
  }
  if (diffPercent >= -25) {
    return {
      bgClass:
        "bg-chart-amber/10 hover:bg-chart-amber/20 border-chart-amber/30 text-chart-amber",
      textClass: "text-chart-amber font-medium",
      badgeClass:
        "bg-chart-amber/10 text-chart-amber border border-chart-amber/20",
      verdict: "overvalued",
    };
  }
  return {
    bgClass:
      "bg-chart-negative/15 hover:bg-chart-negative/25 border-chart-negative/40 text-chart-negative",
    textClass: "text-chart-negative font-semibold",
    badgeClass:
      "bg-chart-negative/20 text-chart-negative border border-chart-negative/30",
    verdict: "deepOvervalued",
  };
}

export default function ValuationSensitivityMatrix({
  activeBase,
  currentPrice,
  growthRate,
  multiple,
  discountRate,
  sharesOutstanding,
  valuationMode = "cashFlow",
  onSelectScenario,
  className = "",
}: ValuationSensitivityMatrixProps) {
  const { t, isRtl } = useI18n();
  const [dimension, setDimension] = useState<MatrixDimension>("growth");

  const shares = sharesOutstanding > 0 ? sharesOutstanding : 15.2;

  // Generate 5 discrete WACC/Discount rows centered around the current discountRate
  const discountSteps = useMemo(() => {
    const rounded = Math.round(discountRate);
    const steps = [-2, -1, 0, 1, 2].map((offset) =>
      Math.max(4, rounded + offset),
    );
    return Array.from(new Set(steps)).slice(0, 5);
  }, [discountRate]);

  // Generate 5 discrete columns for the selected secondary dimension
  const colSteps = useMemo(() => {
    if (dimension === "growth") {
      const rounded = Math.round(growthRate);
      const steps = [-4, -2, 0, 2, 4].map((offset) =>
        Math.max(-20, rounded + offset),
      );
      return Array.from(new Set(steps)).slice(0, 5);
    } else {
      const rounded = Math.round(multiple);
      const steps = [-6, -3, 0, 3, 6].map((offset) =>
        Math.max(5, rounded + offset),
      );
      return Array.from(new Set(steps)).slice(0, 5);
    }
  }, [dimension, growthRate, multiple]);

  // Compute 5x5 matrix
  const matrix = useMemo(() => {
    return discountSteps.map((dRate) => {
      const rowCells = colSteps.map((colVal) => {
        const g = dimension === "growth" ? colVal : growthRate;
        const m = dimension === "multiple" ? colVal : multiple;
        const fv = computeDcfFairValue(activeBase, g, dRate, m, shares);
        const diff =
          currentPrice > 0 ? ((fv - currentPrice) / currentPrice) * 100 : 0;
        const isCurrent =
          dRate === Math.round(discountRate) &&
          colVal === Math.round(dimension === "growth" ? growthRate : multiple);

        return {
          dRate,
          colVal,
          fairValue: fv,
          diffPercent: diff,
          isCurrent,
        };
      });
      return { dRate, cells: rowCells };
    });
  }, [
    discountSteps,
    colSteps,
    dimension,
    growthRate,
    multiple,
    discountRate,
    activeBase,
    shares,
    currentPrice,
  ]);

  return (
    <div
      className={`rounded-xl border border-border bg-card/60 backdrop-blur p-5 sm:p-6 transition-all ${className}`}
      data-testid="valuation-sensitivity-matrix"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/70">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Table2 className="w-4 h-4" />
            </div>
            <h3
              id="sensitivity-matrix-title"
              className="text-base font-semibold text-foreground tracking-tight"
            >
              {t("dcf.sensitivityTitle") || "2D Valuation Sensitivity Matrix"}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                    aria-label="Information about Sensitivity Matrix"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {t("dcf.sensitivityTooltip") ||
                    "Evaluates intrinsic fair value across varying cost of capital (WACC) and terminal growth/exit assumptions. Click any cell to apply those parameters."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("dcf.sensitivitySubtitle") ||
              "Institutional stress-test matrix comparing 25 valuation scenarios against current market price."}
          </p>
        </div>

        {/* Dimension Switcher */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-secondary/50 p-1 rounded-lg border border-border text-xs">
          <button
            type="button"
            onClick={() => setDimension("growth")}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              dimension === "growth"
                ? "bg-background text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dcf.dimensionGrowth") || "WACC × Growth Rate"}
          </button>
          <button
            type="button"
            onClick={() => setDimension("multiple")}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              dimension === "multiple"
                ? "bg-background text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dcf.dimensionMultiple") || "WACC × Exit Multiple"}
          </button>
        </div>
      </div>

      {/* Legend & Current Price Marker */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-chart-positive/30 border border-chart-positive" />
            <span className="text-[11px]">&gt; +30% Undervalued</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/50" />
            <span className="text-[11px]">+10% to +30%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-secondary/50 border border-border" />
            <span className="text-[11px]">Fair Value (±10%)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-chart-negative/20 border border-chart-negative" />
            <span className="text-[11px]">&gt; 25% Overvalued</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] bg-background/80 px-2 py-0.5 rounded border border-border">
          <Crosshair className="w-3 h-3 text-primary motion-safe:animate-pulse" />
          <span>{t("dcf.marketPrice") || "Market Price"}:</span>
          <strong className="text-foreground">
            ${currentPrice.toFixed(2)}
          </strong>
        </div>
      </div>

      {/* Sensitivity Table Grid */}
      <div className="overflow-x-auto mt-2 pb-2">
        <table
          className="w-full border-collapse text-center text-xs min-w-[540px]"
          aria-labelledby="sensitivity-matrix-title"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <thead>
            {/* Top Super-Header for Columns */}
            <tr>
              <th className="p-2 text-left font-semibold text-muted-foreground border-b border-border/80 w-24">
                <span className="flex items-center gap-1">
                  <span>WACC</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    \
                  </span>
                  <span>{dimension === "growth" ? "Growth" : "Exit P/E"}</span>
                </span>
              </th>
              {colSteps.map((colVal) => {
                const isSelectedCol =
                  colVal ===
                  Math.round(dimension === "growth" ? growthRate : multiple);
                return (
                  <th
                    key={colVal}
                    className={`p-2 font-mono font-medium border-b border-border/80 transition-colors ${
                      isSelectedCol
                        ? "text-primary font-bold bg-primary/5 rounded-t-md"
                        : "text-muted-foreground"
                    }`}
                  >
                    {dimension === "growth" ? `${colVal}%` : `${colVal}x`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const isSelectedRow = row.dRate === Math.round(discountRate);
              return (
                <tr
                  key={row.dRate}
                  className="border-b border-border/40 last:border-0"
                >
                  {/* Row Header (WACC / Discount Rate) */}
                  <th
                    scope="row"
                    className={`p-2.5 text-left font-mono font-medium border-r border-border/60 transition-colors ${
                      isSelectedRow
                        ? "text-primary font-bold bg-primary/5 rounded-l-md"
                        : "text-muted-foreground"
                    }`}
                  >
                    {row.dRate}%
                  </th>

                  {/* Matrix Cells */}
                  {row.cells.map((cell) => {
                    const theme = getValuationCellTheme(
                      cell.fairValue,
                      currentPrice,
                    );
                    const formattedFairValue = `$${cell.fairValue.toFixed(2)}`;
                    const formattedDiff = `${Math.abs(cell.diffPercent).toFixed(1)}%`;

                    return (
                      <td key={cell.colVal} className="p-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectScenario) {
                              onSelectScenario({
                                discountRate: cell.dRate,
                                ...(dimension === "growth"
                                  ? { growthRate: cell.colVal }
                                  : { multiple: cell.colVal }),
                              });
                            }
                          }}
                          className={`w-full h-full py-2 px-1.5 rounded-lg border transition-all duration-150 flex flex-col items-center justify-center gap-0.5 relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${
                            theme.bgClass
                          } ${
                            cell.isCurrent
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20 scale-[1.03] z-10 font-bold"
                              : "hover:scale-[1.02]"
                          }`}
                          aria-label={`WACC ${cell.dRate}%, ${
                            dimension === "growth" ? "Growth" : "Exit Multiple"
                          } ${cell.colVal}, Fair Value ${formattedFairValue}`}
                        >
                          {cell.isCurrent && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                            </span>
                          )}

                          <span
                            className={`font-mono text-xs ${theme.textClass}`}
                          >
                            {formattedFairValue}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1 rounded ${
                              cell.diffPercent >= 0
                                ? "text-chart-positive"
                                : "text-chart-negative"
                            }`}
                          >
                            {cell.diffPercent > 0
                              ? `+${formattedDiff}`
                              : cell.diffPercent < 0
                                ? `-${formattedDiff}`
                                : "0.0%"}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Instructions */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/60">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>
            {t("dcf.sensitivityClickHint") ||
              "Click any cell to apply that valuation scenario to the sandbox."}
          </span>
        </span>
        <span className="font-mono text-[10px]">
          {valuationMode === "cashFlow" ? "FCF Base" : "Net Income Base"}: $
          {activeBase.toFixed(1)}B
        </span>
      </div>
    </div>
  );
}
