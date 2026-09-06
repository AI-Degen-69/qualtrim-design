import { useState, useMemo, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Sliders,
  LineChart as ChartIcon,
  Table2,
  Gauge,
  Info,
  RotateCcw,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import ValuationSensitivityMatrix from "./ValuationSensitivityMatrix";
import ReverseDCFGauge from "./ReverseDCFGauge";

export interface DCFWidgetProps {
  ticker?: string;
  currentPrice?: number;
  companyName?: string;
  initialFcf?: number;
  initialEarnings?: number;
  initialGrowth?: number;
  initialMultiple?: number;
  initialDiscount?: number;
  sharesOutstanding?: number;
  initialTargetReturn?: number;
  initialValuationMode?: "cashFlow" | "earnings";
}

/**
 * Clamps target return values to a safe mathematical bound to avoid Infinity/NaN.
 */
function clampTargetReturn(val: number): number {
  return Number.isFinite(val) ? Math.max(-90, Math.min(500, val)) : 15.0;
}

/**
 * Renders the modern Instant Discounted Cash Flow Sandbox and 5-Year Growth Trajectory Engine.
 *
 * @param currentPrice - The current price used to calculate forward return and margin of safety.
 * @param ticker - Optional ticker symbol being modeled.
 * @param companyName - Optional friendly company name.
 * @param initialFcf - Base annual free cash flow in billions ($B)
 * @param initialEarnings - Base annual net income in billions ($B)
 * @param initialGrowth - Projected 5-year growth rate percentage
 * @param initialMultiple - Terminal exit multiple (P/FCF or P/E)
 * @param initialDiscount - Target discount / hurdle rate percentage
 * @param sharesOutstanding - Diluted shares outstanding in billions
 * @param initialTargetReturn - Initial target annual return percentage
 * @param initialValuationMode - Initial mode: "cashFlow" | "earnings"
 * @returns The rendered DCF Sandbox component.
 */
export function DCFWidget({
  ticker = "AAPL",
  currentPrice = 231.42,
  companyName,
  initialFcf = 108.8,
  initialEarnings = 100.9,
  initialGrowth = 10.0,
  initialMultiple = 25.0,
  initialDiscount = 9.0,
  sharesOutstanding = 15.2,
  initialTargetReturn = 15.0,
  initialValuationMode = "cashFlow",
}: DCFWidgetProps) {
  const { t } = useI18n();

  // Active view tab: Interactive Sandbox, 5Y Trajectory Chart, Sensitivity Matrix, or Reverse DCF Solver
  const [activeTab, setActiveTab] = useState<
    "sandbox" | "trajectory" | "sensitivity" | "reverseDcf"
  >("sandbox");
  const [valuationMode, setValuationMode] = useState<"cashFlow" | "earnings">(
    initialValuationMode,
  );

  // Inputs
  const [baseFcf, setBaseFcf] = useState<number>(initialFcf);
  const [baseEarnings, setBaseEarnings] = useState<number>(initialEarnings);
  const [growthRate, setGrowthRate] = useState<number>(initialGrowth);
  const [multiple, setMultiple] = useState<number>(initialMultiple);
  const [discountRate, setDiscountRate] = useState<number>(initialDiscount);
  const [targetReturn, setTargetReturn] = useState<number>(() =>
    clampTargetReturn(initialTargetReturn),
  );

  // Sync inputs when ticker or initial props change
  useEffect(() => {
    setValuationMode(initialValuationMode);
    setBaseFcf(initialFcf);
    setBaseEarnings(initialEarnings);
    setGrowthRate(initialGrowth);
    setMultiple(initialMultiple);
    setDiscountRate(initialDiscount);
    setTargetReturn(clampTargetReturn(initialTargetReturn));
  }, [
    ticker,
    initialFcf,
    initialEarnings,
    initialGrowth,
    initialMultiple,
    initialDiscount,
    initialTargetReturn,
    initialValuationMode,
  ]);

  const handleResetDefaults = () => {
    setValuationMode(initialValuationMode);
    setBaseFcf(initialFcf);
    setBaseEarnings(initialEarnings);
    setGrowthRate(initialGrowth);
    setMultiple(initialMultiple);
    setDiscountRate(initialDiscount);
    setTargetReturn(clampTargetReturn(initialTargetReturn));
  };

  // Active base financial metric according to mode
  const isCashFlowMode = valuationMode === "cashFlow";
  const activeBase = isCashFlowMode ? baseFcf : baseEarnings;
  const setActiveBase = isCashFlowMode ? setBaseFcf : setBaseEarnings;

  // --------------------------------------------------------------------------
  // DCF Calculations
  // --------------------------------------------------------------------------
  // 5-year discounted cash flow + terminal value computation:
  // Fair Value = (Sum of discounted future flows + Discounted Terminal Value) / Shares Outstanding
  const {
    fairValue,
    year5Value,
    year5Price,
    forwardReturn,
    targetBuyPrice,
    requiredMultiple,
    marginOfSafety,
  } = useMemo(() => {
    const g = growthRate / 100;
    const d = discountRate / 100;
    let sumPv = 0;

    for (let yr = 1; yr <= 5; yr++) {
      const valYr = activeBase * Math.pow(1 + g, yr);
      const pv = valYr / Math.pow(1 + d, yr);
      sumPv += pv;
    }

    const y5Val = activeBase * Math.pow(1 + g, 5);
    const terminalVal = y5Val * multiple;
    const pvTerminal = terminalVal / Math.pow(1 + d, 5);
    const totalEnterprisePv = sumPv + pvTerminal;

    // Intrinsic fair value per share (activeBase in $B, shares in billions)
    const shares = sharesOutstanding > 0 ? sharesOutstanding : 15.2;
    const computedFairValue = totalEnterprisePv / shares;

    // Year 5 implied target price per share
    const y5Price = (y5Val / shares) * multiple;

    // Forward annualized return from current price to Year 5 implied price
    const fwd =
      currentPrice > 0 && y5Price > 0
        ? (Math.pow(y5Price / currentPrice, 1 / 5) - 1) * 100
        : 0;

    // Target Buy Price to achieve targetReturn% annualized return
    const buyPrice =
      targetReturn > -99.9 && y5Price > 0
        ? y5Price / Math.pow(1 + targetReturn / 100, 5)
        : 0;

    // Required multiple in Year 5 to achieve targetReturn% return from current market price
    const reqMultiple =
      y5Val > 0 && currentPrice > 0 && targetReturn > -99.9
        ? (currentPrice * Math.pow(1 + targetReturn / 100, 5)) /
          (y5Val / shares)
        : 0;

    const mos =
      currentPrice > 0
        ? ((computedFairValue - currentPrice) / currentPrice) * 100
        : 0;

    return {
      fairValue: Math.max(0, computedFairValue),
      year5Value: y5Val,
      year5Price: Math.max(0, y5Price),
      forwardReturn: fwd,
      targetBuyPrice: Math.max(0, buyPrice),
      requiredMultiple: Math.max(0, reqMultiple),
      marginOfSafety: mos,
    };
  }, [
    activeBase,
    growthRate,
    multiple,
    discountRate,
    sharesOutstanding,
    currentPrice,
    targetReturn,
  ]);

  // Status classification
  const valuationStatus = useMemo(() => {
    if (marginOfSafety > 5) return "undervalued";
    if (marginOfSafety < -5) return "overvalued";
    return "fairlyValued";
  }, [marginOfSafety]);

  // 5-Year Trajectory Recharts Data
  const chartData = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const shares = sharesOutstanding > 0 ? sharesOutstanding : 15.2;
    const data = [];
    for (let i = 0; i <= 5; i++) {
      const val = activeBase * Math.pow(1 + growthRate / 100, i);
      const impliedPrice = (val / shares) * multiple;
      data.push({
        year: (currentYr + i).toString(),
        metric: Number(val.toFixed(1)),
        price: Number(impliedPrice.toFixed(2)),
      });
    }
    return data;
  }, [activeBase, growthRate, multiple, sharesOutstanding]);

  // Dynamic slider upper bound for base financial input
  const baseSliderMax = useMemo(() => {
    return Math.max(200, Math.ceil(activeBase * 2.5));
  }, [activeBase]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col space-y-0">
      {/* Top Header */}
      <div className="p-6 sm:p-8 border-b border-border/80 bg-secondary/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-1">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{t("dcf.eyebrow")}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {t("dcf.sandboxTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            {t("dcf.sandboxSubtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab selector between Sandbox, Trajectory, Sensitivity Matrix, and Reverse DCF */}
          <div className="flex items-center bg-muted/60 rounded-lg p-1 border border-border flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={activeTab === "sandbox"}
              onClick={() => setActiveTab("sandbox")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                activeTab === "sandbox"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{t("dcf.sandboxTab")}</span>
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "trajectory"}
              onClick={() => setActiveTab("trajectory")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                activeTab === "trajectory"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ChartIcon className="w-3.5 h-3.5" />
              <span>{t("dcf.trajectoryTab")}</span>
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "sensitivity"}
              onClick={() => setActiveTab("sensitivity")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                activeTab === "sensitivity"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>{t("dcf.viewSensitivityMatrix")}</span>
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "reverseDcf"}
              onClick={() => setActiveTab("reverseDcf")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                activeTab === "reverseDcf"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>{t("dcf.viewReverseDcf") || "Reverse DCF"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: Main Interactive Valuation Sandbox */}
      {activeTab === "sandbox" && (
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Controls Column (4 Sliders) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Mode selection pills */}
              <div className="flex items-center gap-2 pb-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {t("dcf.mode")}
                </span>
                <div className="inline-flex bg-muted/50 rounded-lg p-0.5 border border-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setValuationMode("cashFlow")}
                        className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                          valuationMode === "cashFlow"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("dcf.cashFlowMode")}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-xs text-xs font-sans"
                    >
                      {t("dcf.tooltip.cashFlowMode")}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setValuationMode("earnings")}
                        className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                          valuationMode === "earnings"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t("dcf.earningsMode")}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-xs text-xs font-sans"
                    >
                      {t("dcf.tooltip.earningsMode")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Slider 1: Base Metric (FCF or Net Income) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="dcf-base-metric-slider"
                      className="text-muted-foreground font-medium"
                    >
                      {isCashFlowMode
                        ? t("dcf.baseFcf")
                        : t("dcf.baseEarnings")}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                          aria-label="Base metric information"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs text-xs font-sans"
                      >
                        {isCashFlowMode
                          ? t("dcf.tooltip.baseFcf")
                          : t("dcf.tooltip.baseEarnings")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span
                    className="font-semibold text-foreground bg-secondary/60 px-2.5 py-0.5 rounded border border-border tabular-nums text-sm sm:text-xs"
                    dir="ltr"
                  >
                    ${activeBase.toFixed(1)}B
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-base-metric-slider"
                    type="range"
                    min="0.5"
                    max={baseSliderMax}
                    step="0.5"
                    value={activeBase}
                    onChange={(e) =>
                      setActiveBase(parseFloat(e.target.value) || 1)
                    }
                    aria-label={
                      isCashFlowMode ? t("dcf.baseFcf") : t("dcf.baseEarnings")
                    }
                    className="w-full h-2.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((activeBase - 0.5) / (baseSliderMax - 0.5)) * 100}%, hsl(250 20% 18%) ${((activeBase - 0.5) / (baseSliderMax - 0.5)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 2: Growth Rate */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="dcf-growth-slider"
                      className="text-muted-foreground font-medium"
                    >
                      {t("dcf.growthRate5Y")}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                          aria-label="Growth rate information"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs text-xs font-sans"
                      >
                        {t("dcf.tooltip.growthRate")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span
                    className="font-semibold text-chart-positive bg-secondary/60 px-2.5 py-0.5 rounded border border-border tabular-nums text-sm sm:text-xs"
                    dir="ltr"
                  >
                    +{growthRate.toFixed(0)}% / yr
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-growth-slider"
                    type="range"
                    min="-10"
                    max="40"
                    step="1"
                    value={growthRate}
                    onChange={(e) =>
                      setGrowthRate(parseFloat(e.target.value) || 0)
                    }
                    aria-label={t("dcf.growthRate5Y") || "Growth Rate"}
                    className="w-full h-2.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((growthRate - -10) / (40 - -10)) * 100}%, hsl(250 20% 18%) ${((growthRate - -10) / (40 - -10)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 3: Terminal Exit Multiple (P/FCF or P/E) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="dcf-multiple-slider"
                      className="text-muted-foreground font-medium"
                    >
                      {isCashFlowMode
                        ? t("dcf.exitMultiplePcf")
                        : t("dcf.exitMultiplePe")}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                          aria-label="Exit multiple information"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs text-xs font-sans"
                      >
                        {isCashFlowMode
                          ? t("dcf.tooltip.exitMultiplePcf")
                          : t("dcf.tooltip.exitMultiplePe")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span
                    className="font-semibold text-foreground bg-secondary/60 px-2.5 py-0.5 rounded border border-border tabular-nums text-sm sm:text-xs"
                    dir="ltr"
                  >
                    {multiple.toFixed(0)}x
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-multiple-slider"
                    type="range"
                    min="5"
                    max="70"
                    step="1"
                    value={multiple}
                    onChange={(e) =>
                      setMultiple(parseFloat(e.target.value) || 5)
                    }
                    aria-label={
                      isCashFlowMode
                        ? t("dcf.exitMultiplePcf")
                        : t("dcf.exitMultiplePe")
                    }
                    className="w-full h-2.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((multiple - 5) / (70 - 5)) * 100}%, hsl(250 20% 18%) ${((multiple - 5) / (70 - 5)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 4: Target Discount Rate */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="dcf-discount-slider"
                      className="text-muted-foreground font-medium"
                    >
                      {t("dcf.discountRate")}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                          aria-label="Discount rate information"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs text-xs font-sans"
                      >
                        {t("dcf.tooltip.discountRate")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span
                    className="font-semibold text-foreground bg-secondary/60 px-2.5 py-0.5 rounded border border-border tabular-nums text-sm sm:text-xs"
                    dir="ltr"
                  >
                    {discountRate.toFixed(0)}%
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-discount-slider"
                    type="range"
                    min="4"
                    max="18"
                    step="0.5"
                    value={discountRate}
                    onChange={(e) =>
                      setDiscountRate(parseFloat(e.target.value) || 4)
                    }
                    aria-label={t("dcf.discountRate") || "Discount Rate"}
                    className="w-full h-2.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((discountRate - 4) / (18 - 4)) * 100}%, hsl(250 20% 18%) ${((discountRate - 4) / (18 - 4)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right Hero Valuation Card */}
            <div className="lg:col-span-5 bg-secondary/40 border border-border/80 rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-6 shadow-inner ring-1 ring-white/5">
              <div>
                {/* Card Header with Status Badge */}
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-border/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs uppercase font-mono tracking-widest text-muted-foreground font-semibold">
                      {t("dcf.estimatedFairValue")}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                          aria-label="Fair value methodology"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs text-xs font-sans"
                      >
                        {t("dcf.tooltip.fairValue")}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
                      valuationStatus === "undervalued"
                        ? "bg-chart-positive/15 text-chart-positive border-chart-positive/30"
                        : valuationStatus === "overvalued"
                          ? "bg-chart-negative/15 text-chart-negative border-chart-negative/30"
                          : "bg-amber-400/10 text-amber-300 border-amber-400/30"
                    }`}
                  >
                    {valuationStatus === "undervalued"
                      ? t("dcf.undervalued")
                      : valuationStatus === "overvalued"
                        ? t("dcf.overvalued")
                        : t("dcf.fairlyValued")}
                  </span>
                </div>

                {/* Huge Fair Value Price Readout */}
                <div className="py-6">
                  <div
                    className="text-4xl sm:text-5xl font-extrabold font-mono text-foreground tracking-tight"
                    dir="ltr"
                  >
                    ${fairValue.toFixed(2)}
                  </div>
                </div>

                {/* Substats: Market Price & Projected Margin of Safety */}
                <div className="space-y-2 text-xs font-mono pt-4 border-t border-border/60">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>{t("dcf.marketPrice")}</span>
                    <span
                      className="font-semibold text-foreground tabular-nums text-sm sm:text-xs"
                      dir="ltr"
                    >
                      ${currentPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">
                        {t("dcf.marginOfSafety")}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                            aria-label="Margin of safety explanation"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-xs text-xs font-sans"
                        >
                          {t("dcf.tooltip.marginOfSafety")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span
                      className={`font-bold tabular-nums text-sm sm:text-xs ${
                        marginOfSafety >= 0
                          ? "text-chart-positive"
                          : "text-chart-negative"
                      }`}
                      dir="ltr"
                    >
                      {marginOfSafety >= 0 ? "+" : ""}
                      {marginOfSafety.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Reset Action Button */}
              <button
                type="button"
                onClick={handleResetDefaults}
                className="w-full bg-secondary/80 hover:bg-secondary border border-border text-foreground font-mono text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Reset to Defaults</span>
              </button>
            </div>
          </div>

          {/* Quick Shortcuts to Sensitivity Matrix & Reverse DCF */}
          <div className="pt-2 flex items-center justify-end gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("reverseDcf")}
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1.5 transition-colors"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>
                {t("dcf.reverseDcfTitle") || "Reverse DCF Expectation Solver"} →
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sensitivity")}
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1.5 transition-colors"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>
                {t("dcf.sensitivityTitle") || "2D Valuation Sensitivity Matrix"}{" "}
                →
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: 5-Year Trajectory & Recharts Breakdown Mode */}
      {activeTab === "trajectory" && (
        <div className="p-6 sm:p-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-secondary/30 rounded-xl p-6 border border-border space-y-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs uppercase font-mono text-muted-foreground tracking-wider">
                  {t("dcf.forward")}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                      aria-label="Forward return explanation"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs text-xs font-sans"
                  >
                    {t("dcf.tooltip.forwardReturn")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p
                className={`text-3xl font-bold font-mono tabular-nums ${
                  forwardReturn >= 0
                    ? "text-chart-positive"
                    : "text-chart-negative"
                }`}
                dir="ltr"
              >
                {forwardReturn >= 0 ? "+" : ""}
                {forwardReturn.toFixed(2)}% / yr
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {t("dcf.basedOnCurrentPrice")}${currentPrice.toFixed(2)}
              </p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-6 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs uppercase font-mono text-muted-foreground tracking-wider">
                    {t("dcf.reverse", { target: targetReturn })}
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                        aria-label="Target buy price explanation"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-xs text-xs font-sans"
                    >
                      {t("dcf.tooltip.targetBuyPrice")}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="dcf-target-return-input"
                    className="text-xs text-muted-foreground"
                  >
                    {t("dcf.targetPct")}
                  </label>
                  <input
                    id="dcf-target-return-input"
                    type="number"
                    min="-90"
                    max="500"
                    step="0.5"
                    value={targetReturn}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTargetReturn(clampTargetReturn(val));
                    }}
                    aria-label="Target return percentage"
                    className="w-16 bg-background border border-border rounded text-center text-xs py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
              <p
                className="text-3xl font-bold font-mono tabular-nums text-primary"
                dir="ltr"
              >
                {targetBuyPrice > 0 ? `$${targetBuyPrice.toFixed(2)}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {t("dcf.targetingReturn", {
                  target: targetReturn,
                  multiple: requiredMultiple.toFixed(1),
                })}
              </p>
            </div>
          </div>

          {/* 5-Year Trajectory LineChart */}
          <div className="bg-secondary/20 border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">
                  {t("dcf.valueTrajectoryTitle")}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                      aria-label="Growth trajectory chart explanation"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs text-xs font-sans"
                  >
                    {t("dcf.tooltip.trajectoryChart")}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-primary font-semibold">
                  {t("dcf.terminalExitPrice", { price: year5Price.toFixed(2) })}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none"
                      aria-label="Terminal exit price explanation"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs text-xs font-sans"
                  >
                    {t("dcf.tooltip.terminalExitPrice")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.6}
                  />
                  <XAxis
                    dataKey="year"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                    tickFormatter={(v) => `$${v}B`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "0.5rem",
                      color: "hsl(var(--popover-foreground))",
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine
                    y={currentPrice}
                    yAxisId="left"
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    label={{
                      value: t("dcf.currentPriceLegend") || "Current Price",
                      fill: "hsl(var(--primary))",
                      fontSize: 10,
                      position: "insideBottomLeft",
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="price"
                    name={t("dcf.targetStockPrice") || "Target Stock Price"}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="metric"
                    name={
                      isCashFlowMode
                        ? t("dcf.fcfBillions")
                        : t("dcf.earningsBillions")
                    }
                    stroke="hsl(var(--chart-positive))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-positive))", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 2D Valuation Sensitivity Matrix */}
      {activeTab === "sensitivity" && (
        <div className="p-6 sm:p-8">
          <ValuationSensitivityMatrix
            activeBase={activeBase}
            currentPrice={currentPrice}
            growthRate={growthRate}
            multiple={multiple}
            discountRate={discountRate}
            sharesOutstanding={sharesOutstanding}
            valuationMode={valuationMode}
            onSelectScenario={(scenario) => {
              if (scenario.discountRate !== undefined)
                setDiscountRate(scenario.discountRate);
              if (scenario.growthRate !== undefined)
                setGrowthRate(scenario.growthRate);
              if (scenario.multiple !== undefined)
                setMultiple(scenario.multiple);
            }}
          />
        </div>
      )}

      {/* Tab 4: Reverse DCF Expectation Solver */}
      {activeTab === "reverseDcf" && (
        <div className="p-6 sm:p-8">
          <ReverseDCFGauge
            activeBase={activeBase}
            currentPrice={currentPrice}
            discountRate={discountRate}
            multiple={multiple}
            sharesOutstanding={sharesOutstanding}
            userGrowthRate={growthRate}
            valuationMode={valuationMode}
            onApplyImpliedGrowth={(impliedG) => {
              const clampedG = Math.max(
                -10,
                Math.min(40, Number(impliedG.toFixed(1))),
              );
              setGrowthRate(clampedG);
              setActiveTab("sandbox");
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DCFWidget;
