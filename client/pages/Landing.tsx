import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  ArrowRight,
  Search,
  TrendingUp,
  BarChart3,
  Calendar,
  ShieldCheck,
  Layers,
  Sparkles,
  Command,
  Sliders,
  Activity,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  List,
  Sun,
  Moon,
  Filter,
  Globe,
  Bell,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import TickerLogo from "@/components/TickerLogo";
import CommandMenu from "@/components/CommandMenu";

// ----------------------------------------------------------------------------
// Benchmark Ticker Data for Interactive Spotlight
// ----------------------------------------------------------------------------
interface SpotlightTicker {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  marketCap: string;
  revenue: string;
  fcf: string;
  grossMargin: string;
  pe: string;
  cagr3Y: string;
  lightCurve: { year: string; value: number }[];
}

const SPOTLIGHT_TICKERS: SpotlightTicker[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    price: 231.42,
    changePct: 1.48,
    marketCap: "$3.52T",
    revenue: "$385.6B",
    fcf: "$108.8B",
    grossMargin: "45.9%",
    pe: "34.2x",
    cagr3Y: "+7.8%",
    lightCurve: [
      { year: "2020", value: 274.5 },
      { year: "2021", value: 365.8 },
      { year: "2022", value: 394.3 },
      { year: "2023", value: 383.3 },
      { year: "2024", value: 391.0 },
    ],
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Semiconductors",
    price: 128.55,
    changePct: 3.82,
    marketCap: "$3.15T",
    revenue: "$96.3B",
    fcf: "$53.2B",
    grossMargin: "75.1%",
    pe: "48.6x",
    cagr3Y: "+54.2%",
    lightCurve: [
      { year: "2020", value: 10.9 },
      { year: "2021", value: 16.7 },
      { year: "2022", value: 26.9 },
      { year: "2023", value: 27.0 },
      { year: "2024", value: 60.9 },
    ],
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    sector: "Software",
    price: 418.9,
    changePct: 0.94,
    marketCap: "$3.11T",
    revenue: "$245.1B",
    fcf: "$74.1B",
    grossMargin: "69.8%",
    pe: "32.4x",
    cagr3Y: "+14.1%",
    lightCurve: [
      { year: "2020", value: 143.0 },
      { year: "2021", value: 168.1 },
      { year: "2022", value: 198.3 },
      { year: "2023", value: 211.9 },
      { year: "2024", value: 245.1 },
    ],
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    sector: "Consumer Discretionary",
    price: 197.85,
    changePct: -0.42,
    marketCap: "$2.06T",
    revenue: "$574.8B",
    fcf: "$53.0B",
    grossMargin: "48.2%",
    pe: "41.8x",
    cagr3Y: "+11.5%",
    lightCurve: [
      { year: "2020", value: 386.1 },
      { year: "2021", value: 469.8 },
      { year: "2022", value: 514.0 },
      { year: "2023", value: 574.8 },
      { year: "2024", value: 620.1 },
    ],
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Communication Services",
    price: 168.22,
    changePct: 1.15,
    marketCap: "$2.08T",
    revenue: "$307.4B",
    fcf: "$69.5B",
    grossMargin: "57.4%",
    pe: "23.8x",
    cagr3Y: "+13.8%",
    lightCurve: [
      { year: "2020", value: 182.5 },
      { year: "2021", value: 257.6 },
      { year: "2022", value: 282.8 },
      { year: "2023", value: 307.4 },
      { year: "2024", value: 335.2 },
    ],
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    sector: "Automotive",
    price: 212.18,
    changePct: -1.88,
    marketCap: "$676.4B",
    revenue: "$96.8B",
    fcf: "$3.6B",
    grossMargin: "18.2%",
    pe: "61.2x",
    cagr3Y: "+18.9%",
    lightCurve: [
      { year: "2020", value: 31.5 },
      { year: "2021", value: 53.8 },
      { year: "2022", value: 81.5 },
      { year: "2023", value: 96.8 },
      { year: "2024", value: 97.2 },
    ],
  },
];

// ----------------------------------------------------------------------------
// Showcase Earnings Events Data
// ----------------------------------------------------------------------------
interface ShowcaseEarningsEvent {
  ticker: string;
  name: string;
  date: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  dateFull: string;
  epsEst: number;
  epsActual?: number;
  revEst: number;
  revActual?: number;
  time: "Before Open" | "After Close";
  surprise?: "beat" | "miss";
  marketCap: string;
  isWatchlist: boolean;
}

const SHOWCASE_EARNINGS: ShowcaseEarningsEvent[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    date: "Mon",
    dateFull: "Feb 24, 2025",
    epsEst: 5.59,
    epsActual: 5.82,
    revEst: 24.6,
    revActual: 26.04,
    time: "After Close",
    surprise: "beat",
    marketCap: "$3.12T",
    isWatchlist: true,
  },
  {
    ticker: "SNOW",
    name: "Snowflake Inc.",
    date: "Tue",
    dateFull: "Feb 25, 2025",
    epsEst: 0.14,
    epsActual: 0.18,
    revEst: 0.749,
    revActual: 0.775,
    time: "Before Open",
    surprise: "beat",
    marketCap: "$52.4B",
    isWatchlist: false,
  },
  {
    ticker: "CRM",
    name: "Salesforce, Inc.",
    date: "Wed",
    dateFull: "Feb 26, 2025",
    epsEst: 2.44,
    epsActual: 2.51,
    revEst: 9.35,
    revActual: 9.42,
    time: "After Close",
    surprise: "beat",
    marketCap: "$298.6B",
    isWatchlist: true,
  },
  {
    ticker: "PANW",
    name: "Palo Alto Networks",
    date: "Thu",
    dateFull: "Feb 27, 2025",
    epsEst: 1.48,
    revEst: 2.12,
    time: "Before Open",
    marketCap: "$114.2B",
    isWatchlist: false,
  },
  {
    ticker: "DELL",
    name: "Dell Technologies",
    date: "Thu",
    dateFull: "Feb 27, 2025",
    epsEst: 2.05,
    revEst: 24.5,
    time: "After Close",
    marketCap: "$78.4B",
    isWatchlist: true,
  },
  {
    ticker: "BABA",
    name: "Alibaba Group",
    date: "Fri",
    dateFull: "Feb 28, 2025",
    epsEst: 2.68,
    revEst: 38.1,
    time: "Before Open",
    marketCap: "$240.5B",
    isWatchlist: false,
  },
];

// ----------------------------------------------------------------------------
// Sector Momentum Radar Data
// ----------------------------------------------------------------------------
interface SectorData {
  id: string;
  name: string;
  change1D: number;
  leadingTicker: string;
  keyMetric: string;
}

const SECTOR_DATA: SectorData[] = [
  {
    id: "tech",
    name: "Technology",
    change1D: 2.14,
    leadingTicker: "NVDA",
    keyMetric: "78% Above 200 SMA",
  },
  {
    id: "health",
    name: "Healthcare",
    change1D: -0.45,
    leadingTicker: "LLY",
    keyMetric: "P/E 24.1x TTM",
  },
  {
    id: "financials",
    name: "Financials",
    change1D: 1.08,
    leadingTicker: "JPM",
    keyMetric: "ROE 14.8%",
  },
  {
    id: "consumer",
    name: "Consumer Disc.",
    change1D: 0.62,
    leadingTicker: "AMZN",
    keyMetric: "CAGR +12.4%",
  },
  {
    id: "comm",
    name: "Communication",
    change1D: 1.76,
    leadingTicker: "GOOGL",
    keyMetric: "FCF Yield 4.1%",
  },
  {
    id: "energy",
    name: "Energy",
    change1D: -1.22,
    leadingTicker: "XOM",
    keyMetric: "Div Yield 3.4%",
  },
];

// ----------------------------------------------------------------------------
// Animation Variants
// ----------------------------------------------------------------------------
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

/**
 * Main Landing & Showcase Home Page for Vantage Observatory.
 */
export default function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [selectedTicker, setSelectedTicker] = useState<string>("AAPL");
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  // Mini interactive toggle for feature card 1 preview
  const [previewPeriod, setPreviewPeriod] = useState<"annual" | "quarterly">(
    "annual",
  );

  // Earnings Calendar Showcase interactive filters
  const [earningsDayFilter, setEarningsDayFilter] = useState<
    "all" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri"
  >("all");
  const [earningsCapFilter, setEarningsCapFilter] = useState<
    "all" | "large" | "watchlist"
  >("all");

  // DCF Sandbox interactive parameters
  const [dcfFcf, setDcfFcf] = useState<number>(108.8);
  const [dcfGrowth, setDcfGrowth] = useState<number>(10);
  const [dcfMultiple, setDcfMultiple] = useState<number>(25);
  const [dcfDiscount, setDcfDiscount] = useState<number>(9);
  const [dcfShares, setDcfShares] = useState<number>(15.2);

  // Filtered earnings events
  const filteredEarnings = useMemo(() => {
    return SHOWCASE_EARNINGS.filter((ev) => {
      if (earningsDayFilter !== "all" && ev.date !== earningsDayFilter)
        return false;
      if (earningsCapFilter === "watchlist" && !ev.isWatchlist) return false;
      if (
        earningsCapFilter === "large" &&
        !ev.marketCap.includes("T") &&
        parseFloat(ev.marketCap.replace(/[^0-9.]/g, "")) < 200
      )
        return false;
      return true;
    });
  }, [earningsDayFilter, earningsCapFilter]);

  // Compute fair value in real-time
  const computedDcf = useMemo(() => {
    let totalPv = 0;
    let currentFcf = dcfFcf;
    const discountRate = dcfDiscount / 100;
    const growthRate = dcfGrowth / 100;

    for (let yr = 1; yr <= 5; yr++) {
      currentFcf = currentFcf * (1 + growthRate);
      const discountFactor = Math.pow(1 + discountRate, yr);
      totalPv += currentFcf / discountFactor;
    }

    const terminalValue =
      (currentFcf * dcfMultiple) / Math.pow(1 + discountRate, 5);
    const enterpriseValue = totalPv + terminalValue;
    const fairValuePerShare = dcfShares > 0 ? enterpriseValue / dcfShares : 0;
    const currentPriceRef = 231.42; // AAPL baseline reference
    const marginOfSafety =
      ((fairValuePerShare - currentPriceRef) / currentPriceRef) * 100;

    return {
      enterpriseValue,
      fairValue: Math.max(0, fairValuePerShare),
      marginOfSafety,
      isUndervalued: marginOfSafety > 5,
      isOvervalued: marginOfSafety < -5,
    };
  }, [dcfFcf, dcfGrowth, dcfMultiple, dcfDiscount, dcfShares]);

  const activeSpotlight = useMemo(
    () =>
      SPOTLIGHT_TICKERS.find((item) => item.symbol === selectedTicker) ||
      SPOTLIGHT_TICKERS[0],
    [selectedTicker],
  );

  // Calculate SVG light curve path coordinates
  const svgPathData = useMemo(() => {
    const data = activeSpotlight.lightCurve;
    const minVal = Math.min(...data.map((d) => d.value)) * 0.85;
    const maxVal = Math.max(...data.map((d) => d.value)) * 1.05;
    const width = 480;
    const height = 140;
    const padding = 20;

    const points = data.map((d, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((d.value - minVal) / (maxVal - minVal)) * (height - padding * 2);
      return { x, y, year: d.year, val: d.value };
    });

    const pathString = points.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x},${pt.y}`,
      "",
    );
    const areaString = `${pathString} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

    return { points, pathString, areaString, width, height };
  }, [activeSpotlight]);

  return (
    <div className="relative min-h-full bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Background Graticule & Observatory Starfield Grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      </div>

      {/* Global Command Search Overlay */}
      <CommandMenu open={searchOpen} setOpen={setSearchOpen} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-16 lg:space-y-24">
        {/* ==================================================================== */}
        {/* 1. HERO OBSERVATORY SECTION */}
        {/* ==================================================================== */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="relative pt-6 sm:pt-12 text-center space-y-6 max-w-4xl mx-auto"
        >
          {/* Live Status Observatory Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-mono tracking-wide text-primary">
            <span className="relative flex h-2 w-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span>{t("landing.hero.eyebrow")}</span>
            <span className="text-border">·</span>
            <span className="text-muted-foreground">
              {t("landing.hero.badge")}
            </span>
          </div>

          {/* Starlight Typography Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            <span>{t("landing.hero.titleLine1")} </span>
            <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_hsl(var(--primary)/0.3)]">
              {t("landing.hero.titleHighlight")}
            </span>
          </h1>

          {/* Subtitle Description */}
          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto font-normal leading-relaxed">
            {t("landing.hero.subtitle")}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            <button
              onClick={() => navigate("/insights")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[6px] bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:shadow-glow transition-all active:scale-[0.98]"
            >
              <span>{t("landing.hero.launchWorkspace")}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <button
              onClick={() => navigate("/screener")}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-[6px] border border-border bg-card hover:bg-muted text-foreground text-sm font-medium transition-colors"
            >
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span>{t("landing.hero.exploreScreener")}</span>
            </button>

            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-[6px] border border-border/80 bg-background hover:border-primary/50 text-muted-foreground hover:text-foreground text-xs font-mono transition-colors"
              title="Search Stocks (⌘K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t("landing.hero.commandSearch")}</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground/80 pt-2">
            <ShieldCheck className="w-3.5 h-3.5 text-chart-positive" />
            <span>{t("landing.hero.liveDataFeed")}</span>
          </div>
        </motion.section>

        {/* ==================================================================== */}
        {/* 2. INTERACTIVE BENCHMARK TICKER SPOTLIGHT */}
        {/* ==================================================================== */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="rounded-panel border border-border bg-card p-6 lg:p-8 space-y-6"
        >
          {/* Spotlight Header & Ticker Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span>{t("landing.spotlight.title")}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("landing.spotlight.subtitle")}
              </p>
            </div>

            {/* Switchable Benchmark Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-[6px] bg-background border border-border">
              {SPOTLIGHT_TICKERS.map((ticker) => {
                const isSelected = ticker.symbol === selectedTicker;
                return (
                  <button
                    key={ticker.symbol}
                    onClick={() => setSelectedTicker(ticker.symbol)}
                    className={`px-3 py-1.5 rounded-[4px] text-xs font-mono font-semibold transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {ticker.symbol}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Asset Showcase Grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSpotlight.symbol}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
            >
              {/* Left Column: Asset Identity & Key Fundamentals */}
              <div className="lg:col-span-5 space-y-6">
                <div className="flex items-center gap-4">
                  <TickerLogo
                    ticker={activeSpotlight.symbol}
                    size="lg"
                    className="rounded-lg shadow-sm"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold font-mono text-foreground">
                        {activeSpotlight.symbol}
                      </span>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded font-semibold ${
                          activeSpotlight.changePct >= 0
                            ? "bg-chart-positive/10 text-chart-positive"
                            : "bg-chart-negative/10 text-chart-negative"
                        }`}
                        dir="ltr"
                      >
                        {activeSpotlight.changePct >= 0 ? "+" : ""}
                        {activeSpotlight.changePct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {activeSpotlight.name} ·{" "}
                      <span className="text-foreground/80">
                        {activeSpotlight.sector}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="text-3xl sm:text-4xl font-extrabold font-mono text-foreground"
                  dir="ltr"
                >
                  ${activeSpotlight.price.toFixed(2)}
                </div>

                {/* 6 Key Fundamental Readouts */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.marketCap")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-foreground"
                      dir="ltr"
                    >
                      {activeSpotlight.marketCap}
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.pe")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-foreground"
                      dir="ltr"
                    >
                      {activeSpotlight.pe}
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.cagr3Y")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-chart-positive"
                      dir="ltr"
                    >
                      {activeSpotlight.cagr3Y}
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.revenue")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-foreground"
                      dir="ltr"
                    >
                      {activeSpotlight.revenue}
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.fcf")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-foreground"
                      dir="ltr"
                    >
                      {activeSpotlight.fcf}
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-background/60 border border-border space-y-1">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {t("landing.spotlight.grossMargin")}
                    </div>
                    <div
                      className="text-sm font-bold font-mono text-foreground"
                      dir="ltr"
                    >
                      {activeSpotlight.grossMargin}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Link
                    to={`/stock/${activeSpotlight.symbol}`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline"
                  >
                    <span>{t("landing.spotlight.openStock")}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Right Column: 5-Year Light-Curve Trajectory Chart */}
              <div className="lg:col-span-7 p-4 sm:p-6 rounded-[6px] bg-background/80 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                      {t("landing.spotlight.lightCurveLabel")}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-primary font-semibold">
                    5-Year Trajectory ($B)
                  </span>
                </div>

                {/* SVG Light Curve Graphic */}
                <div className="relative py-4">
                  <svg
                    viewBox={`0 0 ${svgPathData.width} ${svgPathData.height}`}
                    className="w-full h-44 overflow-visible"
                  >
                    <defs>
                      <linearGradient
                        id="curveGradient"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity="0.25"
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity="0.0"
                        />
                      </linearGradient>
                    </defs>

                    {/* Graticule Ruled Gridlines */}
                    <line
                      x1="20"
                      y1="30"
                      x2="460"
                      y2="30"
                      stroke="hsl(var(--border))"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <line
                      x1="20"
                      y1="70"
                      x2="460"
                      y2="70"
                      stroke="hsl(var(--border))"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <line
                      x1="20"
                      y1="110"
                      x2="460"
                      y2="110"
                      stroke="hsl(var(--border))"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />

                    {/* Area fill */}
                    <path
                      d={svgPathData.areaString}
                      fill="url(#curveGradient)"
                    />

                    {/* Luminous Light Curve Path */}
                    <path
                      d={svgPathData.pathString}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                    />

                    {/* Plot Points with Tooltips */}
                    {svgPathData.points.map((pt, index) => (
                      <g key={pt.year}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={
                            index === svgPathData.points.length - 1
                              ? "5"
                              : "3.5"
                          }
                          className="fill-background stroke-primary"
                          strokeWidth="2"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 10}
                          textAnchor="middle"
                          className="fill-foreground font-mono text-[10px] font-semibold"
                        >
                          ${pt.val.toFixed(1)}B
                        </text>
                        <text
                          x={pt.x}
                          y={svgPathData.height - 2}
                          textAnchor="middle"
                          className="fill-muted-foreground font-mono text-[10px]"
                        >
                          {pt.year}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/40">
                  <span>Instrument: Revenue (Historical Light-Curve)</span>
                  <span className="text-chart-positive font-semibold">
                    Verified Annual Reporting
                  </span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.section>

        {/* ==================================================================== */}
        {/* 3. DEDICATED UPCOMING EARNINGS CALENDAR & ALERTS SHOWCASE */}
        {/* ==================================================================== */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="rounded-panel border border-border bg-card p-6 lg:p-8 space-y-6"
        >
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                <Calendar className="w-3.5 h-3.5" />
                <span>{t("landing.earningsShowcase.badge")}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-1">
                {t("landing.earningsShowcase.title")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("landing.earningsShowcase.subtitle")}
              </p>
            </div>
            <Link
              to="/earnings"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline shrink-0"
            >
              <span>{t("landing.earningsShowcase.openFull")}</span>
            </Link>
          </div>

          {/* Interactive Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[6px] bg-background/80 border border-border">
            {/* Day selector */}
            <div className="flex items-center gap-1">
              {(["all", "Mon", "Tue", "Wed", "Thu", "Fri"] as const).map(
                (day) => (
                  <button
                    key={day}
                    onClick={() => setEarningsDayFilter(day)}
                    className={`px-3 py-1 rounded-[4px] text-xs font-mono font-medium transition-colors ${
                      earningsDayFilter === day
                        ? "bg-primary text-primary-foreground font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {day === "all"
                      ? t("landing.earningsShowcase.filterAll")
                      : day}
                  </button>
                ),
              )}
            </div>

            {/* Watchlist & Cap filter */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setEarningsCapFilter((prev) =>
                    prev === "watchlist" ? "all" : "watchlist",
                  )
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-mono transition-colors ${
                  earningsCapFilter === "watchlist"
                    ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold"
                    : "text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                <Bell className="w-3 h-3" />
                <span>{t("landing.earningsShowcase.filterWatchlist")}</span>
              </button>

              <button
                onClick={() =>
                  setEarningsCapFilter((prev) =>
                    prev === "large" ? "all" : "large",
                  )
                }
                className={`px-3 py-1 rounded-[4px] text-xs font-mono transition-colors ${
                  earningsCapFilter === "large"
                    ? "bg-primary/20 text-primary border border-primary/40 font-semibold"
                    : "text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                <span>{t("landing.earningsShowcase.filterLarge")}</span>
              </button>
            </div>
          </div>

          {/* Events Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEarnings.map((ev) => (
              <div
                key={ev.ticker}
                onClick={() => navigate(`/stock/${ev.ticker}`)}
                className="p-4 rounded-[6px] bg-background/60 border border-border hover:border-primary/40 transition-all cursor-pointer space-y-3 group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <TickerLogo
                      ticker={ev.ticker}
                      size="sm"
                      className="rounded"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-base text-foreground group-hover:text-primary transition-colors">
                          {ev.ticker}
                        </span>
                        {ev.isWatchlist && (
                          <span className="px-1.5 py-0.2 text-[9px] font-mono bg-amber-400/10 text-amber-300 border border-amber-400/20 rounded">
                            Watchlist
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                        {ev.name}
                      </div>
                    </div>
                  </div>

                  {/* Timing & Surprise Badge */}
                  <div className="flex items-center gap-1.5">
                    {ev.surprise && (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          ev.surprise === "beat"
                            ? "bg-chart-positive/20 text-chart-positive border border-chart-positive/30"
                            : "bg-chart-negative/20 text-chart-negative border border-chart-negative/30"
                        }`}
                      >
                        {ev.surprise === "beat"
                          ? t("landing.earningsShowcase.beat")
                          : t("landing.earningsShowcase.miss")}
                      </span>
                    )}

                    <div
                      className={`p-1 rounded-[4px] ${
                        ev.time === "Before Open"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-purple-500/20 text-purple-400"
                      }`}
                      title={ev.time}
                    >
                      {ev.time === "Before Open" ? (
                        <Sun className="w-3.5 h-3.5" />
                      ) : (
                        <Moon className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Numbers Table */}
                <div className="space-y-1.5 text-xs font-mono pt-2 border-t border-border/50">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("landing.earningsShowcase.epsEst")}</span>
                    <span className="text-foreground font-semibold" dir="ltr">
                      ${ev.epsEst.toFixed(2)}
                    </span>
                  </div>

                  {ev.epsActual !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("landing.earningsShowcase.epsActual")}
                      </span>
                      <span
                        className={`font-bold ${
                          ev.surprise === "beat"
                            ? "text-chart-positive"
                            : ev.surprise === "miss"
                              ? "text-chart-negative"
                              : "text-foreground"
                        }`}
                        dir="ltr"
                      >
                        ${ev.epsActual.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("landing.earningsShowcase.revEst")}</span>
                    <span className="text-foreground font-semibold" dir="ltr">
                      ${ev.revEst.toFixed(2)}B
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1">
                  <span>
                    {ev.dateFull} · {ev.time}
                  </span>
                  <span className="text-primary group-hover:underline">
                    View →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ==================================================================== */}
        {/* 4. INTERACTIVE DCF VALUATION SANDBOX */}
        {/* ==================================================================== */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="rounded-panel border border-border bg-card p-6 lg:p-8 space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                <Sliders className="w-3.5 h-3.5" />
                <span>{t("landing.dcfSandbox.badge")}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-1">
                {t("landing.dcfSandbox.title")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("landing.dcfSandbox.subtitle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Sliders Grid (Left) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Slider 1: Base FCF */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <label
                    htmlFor="dcf-fcf-slider"
                    className="text-muted-foreground font-medium"
                  >
                    {t("landing.dcfSandbox.fcfInput")}
                  </label>
                  <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                    ${dcfFcf.toFixed(1)}B
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-fcf-slider"
                    type="range"
                    min="10"
                    max="150"
                    step="1"
                    value={dcfFcf}
                    onChange={(e) => setDcfFcf(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-400 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-amber-400/50 shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((dcfFcf - 10) / (150 - 10)) * 100}%, hsl(250 20% 18%) ${((dcfFcf - 10) / (150 - 10)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 2: Growth Rate */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <label
                    htmlFor="dcf-growth-slider"
                    className="text-muted-foreground font-medium"
                  >
                    {t("landing.dcfSandbox.growthInput")}
                  </label>
                  <span className="font-semibold text-chart-positive bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                    +{dcfGrowth}% / yr
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-growth-slider"
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    value={dcfGrowth}
                    onChange={(e) => setDcfGrowth(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-400 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-amber-400/50 shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${(dcfGrowth / 35) * 100}%, hsl(250 20% 18%) ${(dcfGrowth / 35) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 3: Exit Multiple */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <label
                    htmlFor="dcf-multiple-slider"
                    className="text-muted-foreground font-medium"
                  >
                    {t("landing.dcfSandbox.multipleInput")}
                  </label>
                  <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                    {dcfMultiple}x
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-multiple-slider"
                    type="range"
                    min="10"
                    max="45"
                    step="1"
                    value={dcfMultiple}
                    onChange={(e) => setDcfMultiple(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-400 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-amber-400/50 shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((dcfMultiple - 10) / (45 - 10)) * 100}%, hsl(250 20% 18%) ${((dcfMultiple - 10) / (45 - 10)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Slider 4: Discount Rate */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <label
                    htmlFor="dcf-discount-slider"
                    className="text-muted-foreground font-medium"
                  >
                    {t("landing.dcfSandbox.discountInput")}
                  </label>
                  <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                    {dcfDiscount}%
                  </span>
                </div>
                <div className="relative py-1 flex items-center">
                  <input
                    id="dcf-discount-slider"
                    type="range"
                    min="6"
                    max="16"
                    step="0.5"
                    value={dcfDiscount}
                    onChange={(e) => setDcfDiscount(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-400 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-amber-400/50 shadow-inner"
                    style={{
                      background: `linear-gradient(to right, hsl(42 65% 70% / 0.8) 0%, hsl(42 65% 70% / 0.8) ${((dcfDiscount - 6) / (16 - 6)) * 100}%, hsl(250 20% 18%) ${((dcfDiscount - 6) / (16 - 6)) * 100}%, hsl(250 20% 18%) 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Calculated Intrinsic Value Card (Right) */}
            <div className="lg:col-span-5 p-6 rounded-[6px] bg-background/90 border border-border space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {t("landing.dcfSandbox.computedFairValue")}{" "}
                  {t("landing.dcfSandbox.perShare")}
                </span>

                <span
                  className={`text-xs font-mono px-2.5 py-1 rounded font-bold ${
                    computedDcf.isUndervalued
                      ? "bg-chart-positive/20 text-chart-positive border border-chart-positive/40"
                      : computedDcf.isOvervalued
                        ? "bg-chart-negative/20 text-chart-negative border border-chart-negative/40"
                        : "bg-primary/20 text-primary border border-primary/40"
                  }`}
                >
                  {computedDcf.isUndervalued
                    ? t("landing.dcfSandbox.undervalued")
                    : computedDcf.isOvervalued
                      ? t("landing.dcfSandbox.overvalued")
                      : t("landing.dcfSandbox.fairValue")}
                </span>
              </div>

              <div
                className="text-4xl sm:text-5xl font-extrabold font-mono text-foreground"
                dir="ltr"
              >
                ${computedDcf.fairValue.toFixed(2)}
              </div>

              <div className="space-y-2 pt-3 border-t border-border/60 text-xs font-mono">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("landing.dcfSandbox.marketPrice")}</span>
                  <span className="text-foreground font-semibold" dir="ltr">
                    $231.42
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t("landing.dcfSandbox.upside")}
                  </span>
                  <span
                    className={`font-bold ${
                      computedDcf.marginOfSafety >= 0
                        ? "text-chart-positive"
                        : "text-chart-negative"
                    }`}
                    dir="ltr"
                  >
                    {computedDcf.marginOfSafety >= 0 ? "+" : ""}
                    {computedDcf.marginOfSafety.toFixed(1)}%
                  </span>
                </div>

                <div className="flex justify-between text-muted-foreground/80 pt-1 border-t border-border/40 text-[11px]">
                  <span>{t("landing.dcfSandbox.totalEnterpriseValue")}</span>
                  <span className="font-semibold text-foreground" dir="ltr">
                    ${(computedDcf.enterpriseValue / 1e3).toFixed(2)}T ($
                    {computedDcf.enterpriseValue.toFixed(0)}B)
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate("/charts?ticker=AAPL")}
                className="w-full py-2.5 px-4 rounded-[4px] bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span>{t("landing.dcfSandbox.openInCharts")}</span>
              </button>
            </div>
          </div>
        </motion.section>

        {/* ==================================================================== */}
        {/* 5. THE INSTRUMENT SUITE (6 FEATURE CARDS) */}
        {/* ==================================================================== */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-primary">
              {t("landing.features.badge")}
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              {t("landing.features.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("landing.features.subtitle")}
            </p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {/* Card 1: 5-Year Statement Light-Curves */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card1Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card1Desc")}
                </p>
              </div>

              {/* Interactive micro-preview */}
              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Period Toggle</span>
                  <div className="flex rounded bg-muted/60 p-0.5 text-[10px]">
                    <button
                      onClick={() => setPreviewPeriod("annual")}
                      className={`px-1.5 py-0.5 rounded ${previewPeriod === "annual" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"}`}
                    >
                      Annual
                    </button>
                    <button
                      onClick={() => setPreviewPeriod("quarterly")}
                      className={`px-1.5 py-0.5 rounded ${previewPeriod === "quarterly" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"}`}
                    >
                      Quarterly
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-chart-positive font-semibold">
                  <span>3Y CAGR: +14.2%</span>
                  <span>5Y CAGR: +18.5%</span>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Advanced Global Market Screener */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Filter className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card2Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card2Desc")}
                </p>
              </div>

              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                    ✓ Stocks
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                    ✓ ETF
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                    Crypto
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground pt-1 text-[10px]">
                  <span>Scope: Primary Listings</span>
                  <span className="text-chart-positive font-bold">
                    18,406 Assets
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Custom Watchlists */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <List className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card3Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card3Desc")}
                </p>
              </div>

              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono flex items-center justify-between">
                <span className="text-muted-foreground">Active Lists: 3</span>
                <span className="text-chart-positive font-semibold">
                  18 Tracked Symbols
                </span>
              </div>
            </motion.div>

            {/* Card 4: Thematic Insights & Sector Heatmaps */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card4Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card4Desc")}
                </p>
              </div>

              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono space-y-1.5">
                <div className="flex justify-between text-muted-foreground text-[10px]">
                  <span>AI & Cloud Universe</span>
                  <span className="text-chart-positive font-bold">+2.4%</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-[10px]">
                  <span>Dividend Aristocrats</span>
                  <span className="text-chart-positive font-bold">+0.8%</span>
                </div>
              </div>
            </motion.div>

            {/* Card 5: Institutional Risk Analytics */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card5Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card5Desc")}
                </p>
              </div>

              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-muted-foreground text-[10px]">
                    Sharpe
                  </div>
                  <div className="text-foreground font-bold">1.84</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">
                    Sortino
                  </div>
                  <div className="text-foreground font-bold">2.31</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">IRR</div>
                  <div className="text-chart-positive font-bold">24.6%</div>
                </div>
              </div>
            </motion.div>

            {/* Card 6: Multi-Provider Resilience */}
            <motion.div
              variants={fadeInUp}
              className="p-6 rounded-panel border border-border bg-card hover:border-primary/40 transition-colors flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {t("landing.features.card6Title")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("landing.features.card6Desc")}
                </p>
              </div>

              <div className="mt-5 p-3 rounded-[6px] bg-background/70 border border-border/80 text-[11px] font-mono flex items-center justify-between">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-chart-positive" />
                  Yahoo + FMP + AlphaV
                </span>
                <span className="text-chart-positive font-bold">
                  100% HEALTHY
                </span>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ==================================================================== */}
        {/* 6. SECTOR MACRO RADAR */}
        {/* ==================================================================== */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <span>{t("landing.sectors.badge")}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground mt-0.5">
                {t("landing.sectors.title")}
              </h2>
            </div>
            <Link
              to="/screener"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline"
            >
              <span>{t("landing.sectors.viewAllScreener")}</span>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SECTOR_DATA.map((sector) => (
              <div
                key={sector.id}
                onClick={() => navigate(`/stock/${sector.leadingTicker}`)}
                className="p-3.5 rounded-[6px] border border-border bg-card hover:border-primary/40 transition-colors cursor-pointer space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {sector.name}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span
                    className={`text-xs font-mono font-bold tabular-nums ${
                      sector.change1D >= 0
                        ? "text-chart-positive"
                        : "text-chart-negative"
                    }`}
                    dir="ltr"
                  >
                    {sector.change1D >= 0 ? "+" : ""}
                    {sector.change1D.toFixed(2)}%
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {sector.leadingTicker}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground pt-1 border-t border-border/40 truncate">
                  {sector.keyMetric}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ==================================================================== */}
        {/* 7. KEYBOARD PROTOCOL CHEAT-SHEET */}
        {/* ==================================================================== */}
        <section className="p-6 rounded-panel border border-border bg-card/60 space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <Command className="w-3.5 h-3.5 text-primary" />
            <span>{t("landing.shortcuts.badge")}</span>
            <span className="text-border">·</span>
            <span>{t("landing.shortcuts.title")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div className="flex items-center gap-3 p-3.5 rounded-[6px] bg-background/50 border border-border/80 hover:border-primary/40 transition-colors">
              <kbd className="inline-flex items-center justify-center min-w-[56px] px-3 py-1.5 rounded-[4px] bg-muted/90 border border-primary/40 text-primary font-mono font-bold text-xs shadow-sm whitespace-nowrap">
                ⌘K
              </kbd>
              <span className="text-muted-foreground leading-snug">
                {t("landing.shortcuts.cmdK")}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-[6px] bg-background/50 border border-border/80 hover:border-primary/40 transition-colors">
              <kbd className="inline-flex items-center justify-center min-w-[68px] px-3 py-1.5 rounded-[4px] bg-muted/90 border border-border text-foreground font-mono font-bold text-xs shadow-sm whitespace-nowrap">
                1 – 5
              </kbd>
              <span className="text-muted-foreground leading-snug">
                {t("landing.shortcuts.key15")}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-[6px] bg-background/50 border border-border/80 hover:border-primary/40 transition-colors">
              <kbd className="inline-flex items-center justify-center min-w-[76px] px-3 py-1.5 rounded-[4px] bg-muted/90 border border-border text-foreground font-mono font-bold text-xs shadow-sm whitespace-nowrap">
                Q / A
              </kbd>
              <span className="text-muted-foreground leading-snug">
                {t("landing.shortcuts.keyQA")}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-[6px] bg-background/50 border border-border/80 hover:border-primary/40 transition-colors">
              <kbd className="inline-flex items-center justify-center min-w-[84px] px-3 py-1.5 rounded-[4px] bg-muted/90 border border-border text-foreground font-mono font-bold text-xs shadow-sm whitespace-nowrap">
                EN / עב
              </kbd>
              <span className="text-muted-foreground leading-snug">
                {t("landing.shortcuts.keyLang")}
              </span>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* 8. BOTTOM LAUNCH CTA */}
        {/* ==================================================================== */}
        <section className="text-center py-12 px-6 rounded-panel border border-border bg-gradient-to-b from-card to-background relative overflow-hidden space-y-6">
          <div className="max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-mono uppercase tracking-widest text-primary">
              {t("landing.cta.badge")}
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-foreground">
              {t("landing.cta.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t("landing.cta.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate("/insights")}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[6px] bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 hover:shadow-glow transition-all active:scale-[0.98]"
            >
              <span>{t("landing.cta.launchNow")}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <button
              onClick={() => navigate("/watchlists")}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-[6px] border border-border bg-card hover:bg-muted text-foreground text-sm font-medium transition-colors"
            >
              <List className="w-4 h-4 text-muted-foreground" />
              <span>{t("landing.cta.exploreWatchlists")}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
