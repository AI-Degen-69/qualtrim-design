import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  Sparkles,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCheck,
  Radio,
  ShoppingBag,
  ShoppingCart,
  Flame,
  Landmark,
  HeartPulse,
  Factory,
  Cpu,
  Boxes,
  Building,
  Zap,
  TrendingUp,
  Layers,
  LineChart,
  Coins,
  Briefcase,
  DollarSign,
  Building2,
  LayoutGrid,
  LayoutList,
  SlidersHorizontal,
} from "lucide-react";

import {
  useI18n,
  translateAssetType,
  translateCountry,
  translateMarketCap,
  translateSector,
} from "@/lib/i18n";
import { formatMoneyCompact } from "@/lib/format";
import { presentQuoteRow } from "@/lib/universeRows";
import {
  useScreenerFilter,
  useScreenerFacets,
  useBatchQuotes,
  useYahooDown,
} from "@/hooks/useStockData";
import type { StockQuote } from "@shared/api";
import PageHeader from "@/components/PageHeader";
import TickerLogo from "@/components/TickerLogo";
import BatchQuoteFallbackHint from "@/components/BatchQuoteFallbackHint";
import EagerLogoWarmer from "@/components/EagerLogoWarmer";
import ScreenerFundamentalPanel from "@/components/ScreenerFundamentalPanel";

interface FilterChip {
  value: string;
  label: string;
  flagCode?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const countryFlagMap: Record<string, string> = {
  "United States": "us",
  Canada: "ca",
  Japan: "jp",
  Germany: "de",
  "United Kingdom": "gb",
  China: "cn",
  India: "in",
  Israel: "il",
  France: "fr",
  Sweden: "se",
  Australia: "au",
  Italy: "it",
  "South Korea": "kr",
  Thailand: "th",
  Taiwan: "tw",
  "Hong Kong": "hk",
  Switzerland: "ch",
  Netherlands: "nl",
  Brazil: "br",
  Mexico: "mx",
  Singapore: "sg",
};

/* ------------------------------------------------------------------ */
/*  Category Filter Row with Direct Chips & Dropdown                  */
/* ------------------------------------------------------------------ */
function FilterCategoryRow({
  title,
  chips,
  allOptions,
  selected,
  onChange,
  moreLabel = "More",
}: {
  title: string;
  chips: FilterChip[];
  allOptions?: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  moreLabel?: string;
}) {
  const { t } = useI18n();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Strictly first 6 chips visible in the row
  const visibleChips = chips.slice(0, 6);
  const overflowChips = chips.slice(6);
  const visibleValues = new Set(visibleChips.map((c) => c.value));

  // Build unified extra options list (overflow chips + unlisted allOptions)
  const overflowChipValues = new Set(overflowChips.map((c) => c.value));
  const additionalOptions = (allOptions || []).filter(
    (opt) => !visibleValues.has(opt) && !overflowChipValues.has(opt),
  );

  const allExtraCount = overflowChips.length + additionalOptions.length;
  const extraSelectedCount = selected.filter(
    (v) => !visibleValues.has(v),
  ).length;
  const isAllSelected =
    visibleChips.length > 0 &&
    visibleChips.every((c) => selected.includes(c.value));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      onChange(selected.filter((v) => !visibleValues.has(v)));
    } else {
      const newVals = new Set([
        ...selected,
        ...visibleChips.map((c) => c.value),
      ]);
      onChange(Array.from(newVals));
    }
  };

  const toggleVal = (val: string) => {
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val],
    );
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
      {/* Category Title & Quick Action */}
      <div className="flex items-center justify-between lg:w-44 shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <button
          type="button"
          onClick={toggleSelectAll}
          className={`inline-flex items-center justify-center gap-1.5 w-24 h-6 rounded text-[11px] font-mono font-medium transition-colors border ${
            isAllSelected
              ? "bg-primary/20 text-primary border-primary/40 hover:bg-primary/30"
              : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70 hover:text-foreground"
          }`}
          title={isAllSelected ? t("screener.clear") : t("screener.selectAll")}
        >
          <CheckCheck
            className={`w-3 h-3 ${isAllSelected ? "text-primary" : "opacity-60"}`}
          />
          <span className="truncate">
            {isAllSelected ? t("screener.clear") : t("screener.selectAll")}
          </span>
        </button>
      </div>

      {/* Chip Pills (wraps cleanly inside container) */}
      <div
        className="flex flex-wrap items-center gap-1.5 flex-1 relative"
        ref={popoverRef}
      >
        {visibleChips.map((chip) => {
          const isSelected = selected.includes(chip.value);
          const ChipIcon = chip.icon;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => toggleVal(chip.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border select-none shrink-0 whitespace-nowrap ${
                isSelected
                  ? "bg-primary/20 text-primary border-primary/40 font-semibold shadow-[0_0_12px_hsl(var(--primary)/0.12)]"
                  : "bg-card/60 text-muted-foreground border-border/70 hover:bg-muted/60 hover:text-foreground hover:border-border"
              }`}
            >
              {chip.flagCode && (
                <img
                  src={`https://flagcdn.com/w20/${chip.flagCode}.png`}
                  alt=""
                  className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                  loading="lazy"
                />
              )}
              {ChipIcon && (
                <ChipIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}

        {/* Extra options dropdown (+ More...) */}
        {allExtraCount > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPopoverOpen(!popoverOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors select-none shrink-0 whitespace-nowrap ${
                extraSelectedCount > 0
                  ? "bg-primary/20 text-primary border-primary/40 font-semibold shadow-[0_0_12px_hsl(var(--primary)/0.12)]"
                  : popoverOpen
                    ? "bg-muted text-foreground border-foreground/30"
                    : "bg-muted/40 text-muted-foreground border-dashed border-border hover:bg-muted hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {extraSelectedCount > 0
                  ? `+${extraSelectedCount} ${moreLabel}`
                  : `+ ${moreLabel}...`}
              </span>
            </button>

            {popoverOpen && (
              <div className="absolute top-full start-0 mt-2 z-50 w-64 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-2xl animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-border text-xs font-semibold text-muted-foreground">
                  <span>
                    {title} ({allExtraCount})
                  </span>
                  {extraSelectedCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange(selected.filter((v) => visibleValues.has(v)))
                      }
                      className="text-chart-negative hover:underline text-[11px]"
                    >
                      {t("screener.clear")}
                    </button>
                  )}
                </div>

                {/* Overflow chips first */}
                {overflowChips.map((chip) => {
                  const isSelected = selected.includes(chip.value);
                  const ChipIcon = chip.icon;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => toggleVal(chip.value)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-start ${
                        isSelected
                          ? "bg-primary/15 text-primary font-semibold"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {chip.flagCode && (
                          <img
                            src={`https://flagcdn.com/w20/${chip.flagCode}.png`}
                            alt=""
                            className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                            loading="lazy"
                          />
                        )}
                        {ChipIcon && (
                          <ChipIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        )}
                        <span className="truncate">{chip.label}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}

                {/* Any additional options from database facet */}
                {additionalOptions.map((opt) => {
                  const isSelected = selected.includes(opt);
                  const flagCode = countryFlagMap[opt];
                  const label =
                    opt === "United States"
                      ? t("screener.country.us")
                      : translateCountry(t, opt) || opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleVal(opt)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-start ${
                        isSelected
                          ? "bg-primary/15 text-primary font-semibold"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {flagCode && (
                          <img
                            src={`https://flagcdn.com/w20/${flagCode}.png`}
                            alt=""
                            className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">{label}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screener Component                                            */
/* ------------------------------------------------------------------ */
export default function Screener() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const limit = 50;

  // View mode: table or card grid
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Search input with debounce
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sorting state
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Default filters: Stocks & ETFs selected, US selected, Primary symbols only
  const [filters, setFilters] = useState({
    sector: [] as string[],
    industry: [] as string[],
    country: ["United States"] as string[],
    asset_type: ["Equity", "ETF"] as string[],
    exclude_dots: true,
  });

  const { data, isLoading, isFetching } = useScreenerFilter(
    {
      q: debouncedQuery,
      ...filters,
      sort_by: sortBy,
      sort_dir: sortDir,
    },
    limit,
    page * limit,
  );

  const { data: facets } = useScreenerFacets();
  const total = data?.total ?? 0;
  const results = useMemo(() => data?.results ?? [], [data?.results]);
  const maxPages = Math.ceil(total / limit);

  // Google search style pagination window (up to 10 spread out page buttons)
  const paginationPages = useMemo(() => {
    if (maxPages <= 1) return [0];
    const totalSlots = 10;
    let start = Math.max(0, page - 4);
    let end = Math.min(maxPages - 1, start + totalSlots - 1);

    if (end - start < totalSlots - 1) {
      start = Math.max(0, end - totalSlots + 1);
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [page, maxPages]);

  // Fetch real-time batch quotes for visible symbols on current page
  const symbols = useMemo(
    () => results.map((asset) => asset.symbol),
    [results],
  );
  const {
    data: quoteData,
    isLoading: quotesLoading,
    isError: quotesError,
  } = useBatchQuotes(symbols);
  const yahooDown = useYahooDown();

  // Merge live quote data with asset row
  const mergedResults = useMemo(() => {
    const bySymbol = new Map<string, StockQuote>();
    for (const q of quoteData?.quotes ?? []) {
      if (q && q.symbol) bySymbol.set(q.symbol.toUpperCase(), q);
    }

    return results.map((asset) => {
      const sym = asset.symbol.toUpperCase();
      const live = bySymbol.get(sym) ?? null;
      return {
        ...asset,
        price: live?.price,
        change: live?.change,
        changePercent: live?.changesPercentage,
        marketCap: live?.marketCap ?? asset.market_cap,
      };
    });
  }, [results, quoteData]);

  const liveCount = mergedResults.filter((r) =>
    Number.isFinite(r.price),
  ).length;
  const totalCount = mergedResults.length;
  const isLive = liveCount === totalCount && totalCount > 0 && !yahooDown;
  const isAnyLive = liveCount > 0 && !yahooDown;
  const quoteStatusLabel = quotesError
    ? "Live quote service unavailable"
    : isLive
      ? "All prices live"
      : isAnyLive
        ? `${liveCount}/${totalCount} prices live`
        : "Waiting for live quotes";

  const setFilter = <K extends keyof typeof filters>(
    key: K,
    val: (typeof filters)[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setPage(0);
  };

  const handleSort = (colKey: string) => {
    if (sortBy === colKey) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortBy(undefined);
        setSortDir("asc");
      }
    } else {
      setSortBy(colKey);
      setSortDir("asc");
    }
    setPage(0);
  };

  const allAssetTypeChips: FilterChip[] = [
    {
      value: "Equity",
      label: t("screener.assetType.stocks"),
      icon: TrendingUp,
    },
    { value: "ETF", label: t("screener.assetType.etf"), icon: Layers },
    { value: "Index", label: t("screener.assetType.index"), icon: LineChart },
    { value: "Crypto", label: t("screener.assetType.crypto"), icon: Coins },
    { value: "Fund", label: t("screener.assetType.fund"), icon: Briefcase },
    {
      value: "Currency",
      label: t("screener.assetType.currency"),
      icon: DollarSign,
    },
    {
      value: "MoneyMarket",
      label: t("screener.assetType.moneyMarket"),
      icon: Building2,
    },
  ];

  const sortedSectorChips: FilterChip[] = [
    {
      value: "Information Technology",
      label: t("sector.informationTechnology"),
      icon: Cpu,
    },
    { value: "Financials", label: t("sector.financials"), icon: Landmark },
    {
      value: "Communication Services",
      label: t("sector.communicationServices"),
      icon: Radio,
    },
    {
      value: "Consumer Discretionary",
      label: t("sector.consumerDiscretionary"),
      icon: ShoppingBag,
    },
    { value: "Health Care", label: t("sector.healthCare"), icon: HeartPulse },
    { value: "Industrials", label: t("sector.industrials"), icon: Factory },
    {
      value: "Consumer Staples",
      label: t("sector.consumerStaples"),
      icon: ShoppingCart,
    },
    { value: "Energy", label: t("sector.energy"), icon: Flame },
    { value: "Utilities", label: t("sector.utilities"), icon: Zap },
    { value: "Real Estate", label: t("sector.realEstate"), icon: Building },
    { value: "Materials", label: t("sector.materials"), icon: Boxes },
  ];

  const popularCountryChips: FilterChip[] = [
    { value: "United States", label: t("screener.country.us"), flagCode: "us" },
    {
      value: "China",
      label: translateCountry(t, "China") || "China",
      flagCode: "cn",
    },
    {
      value: "Japan",
      label: translateCountry(t, "Japan") || "Japan",
      flagCode: "jp",
    },
    {
      value: "Hong Kong",
      label: translateCountry(t, "Hong Kong") || "Hong Kong",
      flagCode: "hk",
    },
    {
      value: "India",
      label: translateCountry(t, "India") || "India",
      flagCode: "in",
    },
    {
      value: "Taiwan",
      label: translateCountry(t, "Taiwan") || "Taiwan",
      flagCode: "tw",
    },
    {
      value: "United Kingdom",
      label: translateCountry(t, "United Kingdom") || "United Kingdom",
      flagCode: "gb",
    },
    {
      value: "Germany",
      label: translateCountry(t, "Germany") || "Germany",
      flagCode: "de",
    },
    {
      value: "Canada",
      label: translateCountry(t, "Canada") || "Canada",
      flagCode: "ca",
    },
    {
      value: "France",
      label: translateCountry(t, "France") || "France",
      flagCode: "fr",
    },
    {
      value: "Israel",
      label: translateCountry(t, "Israel") || "Israel",
      flagCode: "il",
    },
    {
      value: "Switzerland",
      label: translateCountry(t, "Switzerland") || "Switzerland",
      flagCode: "ch",
    },
    {
      value: "Australia",
      label: translateCountry(t, "Australia") || "Australia",
      flagCode: "au",
    },
    {
      value: "South Korea",
      label: translateCountry(t, "South Korea") || "South Korea",
      flagCode: "kr",
    },
    {
      value: "Netherlands",
      label: translateCountry(t, "Netherlands") || "Netherlands",
      flagCode: "nl",
    },
    {
      value: "Sweden",
      label: translateCountry(t, "Sweden") || "Sweden",
      flagCode: "se",
    },
    {
      value: "Brazil",
      label: translateCountry(t, "Brazil") || "Brazil",
      flagCode: "br",
    },
    {
      value: "Singapore",
      label: translateCountry(t, "Singapore") || "Singapore",
      flagCode: "sg",
    },
    {
      value: "Italy",
      label: translateCountry(t, "Italy") || "Italy",
      flagCode: "it",
    },
    {
      value: "Mexico",
      label: translateCountry(t, "Mexico") || "Mexico",
      flagCode: "mx",
    },
    {
      value: "Thailand",
      label: translateCountry(t, "Thailand") || "Thailand",
      flagCode: "th",
    },
  ];

  const hasActiveFilters =
    filters.sector.length > 0 ||
    filters.industry.length > 0 ||
    filters.country.length > 0 ||
    filters.asset_type.length > 0 ||
    !filters.exclude_dots ||
    debouncedQuery.length > 0 ||
    sortBy !== undefined;

  const resetAllFilters = () => {
    setFilters({
      sector: [],
      industry: [],
      country: ["United States"],
      asset_type: ["Equity", "ETF"],
      exclude_dots: true,
    });
    setSearchInput("");
    setDebouncedQuery("");
    setSortBy(undefined);
    setSortDir("asc");
    setPage(0);
  };

  return (
    <div className="relative w-full bg-background dark min-h-screen text-foreground selection:bg-primary/20 selection:text-primary">
      <EagerLogoWarmer />

      {/* Background Graticule & Observatory Starfield Grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-35"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.25)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.25)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      </div>

      {/* Header Section (Matching Insights Page Style) */}
      <div className="bg-card/50 border-b border-border px-4 sm:px-8 py-6 sm:py-8">
        <div className="w-full max-w-7xl">
          <PageHeader
            eyebrow="Global Screener"
            title={t("screener.title")}
            description={t("screener.subtitle", {
              total: total > 0 ? total.toLocaleString() : "18,400+",
            })}
            status={isAnyLive ? "live" : undefined}
            source={isAnyLive ? "Yahoo Finance" : undefined}
            className="mb-6"
          />

          {/* Unified Search Input */}
          <div className="relative flex items-center bg-background border border-border rounded-lg overflow-hidden shadow-sm focus-within:border-primary/60 transition-colors">
            <Search className="w-4 h-4 ms-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={t("commandMenu.placeholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 bg-transparent outline-none border-0 px-4 py-3 text-foreground placeholder-muted-foreground/70 text-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors me-1"
                aria-label="clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Categories Panel */}
          <div className="mt-5 space-y-1 bg-card/60 rounded-xl p-4 border border-border/80 shadow-sm backdrop-blur-sm">
            {/* Asset Type */}
            <FilterCategoryRow
              title={t("screener.assetType")}
              chips={allAssetTypeChips}
              allOptions={facets?.asset_types}
              selected={filters.asset_type}
              onChange={(vals) => setFilter("asset_type", vals)}
              moreLabel="More"
            />

            {/* Sector */}
            <FilterCategoryRow
              title={t("screener.sector")}
              chips={sortedSectorChips}
              allOptions={facets?.sectors}
              selected={filters.sector}
              onChange={(vals) => setFilter("sector", vals)}
              moreLabel="More Sectors"
            />

            {/* Country */}
            <FilterCategoryRow
              title={t("screener.country")}
              chips={popularCountryChips}
              allOptions={facets?.countries}
              selected={filters.country}
              onChange={(vals) => setFilter("country", vals)}
              moreLabel="More Countries"
            />

            {/* Scope & Reset Controls */}
            <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/40">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("screener.scope")}
                </span>
                <div className="flex items-center gap-2 bg-muted/40 px-3 py-1 rounded-full border border-border">
                  <span className="text-xs font-medium text-foreground select-none">
                    {t("screener.primaryListingsOnly")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={filters.exclude_dots}
                    onClick={() =>
                      setFilter("exclude_dots", !filters.exclude_dots)
                    }
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      filters.exclude_dots
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                    title={t("screener.primaryListingsTooltip")}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        filters.exclude_dots ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[10px] font-bold tracking-wider select-none ${
                      filters.exclude_dots
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {filters.exclude_dots
                      ? t("screener.on")
                      : t("screener.off")}
                  </span>
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-chart-negative hover:bg-chart-negative/10 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("screener.resetFilters")}
                </button>
              )}
            </div>
          </div>

          {/* Live Fundamental Filters — additive live screen (Yahoo-primary
              fan-out, server-side; see /api/screener/fundamental-filter) */}
          <div className="mt-5">
            <ScreenerFundamentalPanel
              metadata={{
                q: debouncedQuery,
                sector: filters.sector,
                industry: filters.industry,
                country: filters.country,
                asset_type: filters.asset_type,
                exclude_dots: filters.exclude_dots,
              }}
            />
          </div>
        </div>
      </div>

      {/* Toolbar / Live Status Strip */}
      <div className="bg-card/30 border-b border-border px-4 sm:px-8 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Summary */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t("screener.showingResults", {
                start: results.length > 0 ? page * limit + 1 : 0,
                end: Math.min((page + 1) * limit, total),
                total: total.toLocaleString(),
              })}
            </span>
            {isFetching && !isLoading && (
              <span className="text-xs text-primary animate-pulse">
                {t("common.search")}…
              </span>
            )}
          </div>

          {/* Right: View Switcher, Fallback Hint, Live Badge */}
          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-background border border-border rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Table view"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            <BatchQuoteFallbackHint />

            {/* Live Indicator */}
            <span
              className={`text-xs font-medium uppercase tracking-wide px-2 py-1 rounded ${
                isLive
                  ? "text-chart-positive bg-chart-positive/10"
                  : isAnyLive
                    ? "text-primary bg-primary/10"
                    : "text-yellow-400 bg-yellow-500/10"
              }`}
              title={quoteStatusLabel}
            >
              {isLive
                ? t("insights.tabBadgeLive")
                : isAnyLive
                  ? `${liveCount}/${totalCount} LIVE`
                  : quotesError
                    ? "LIVE UNAVAILABLE"
                    : "LOADING LIVE QUOTES"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 sm:px-8 py-6">
        {isLoading && results.length === 0 ? (
          /* Skeleton Loader */
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-card rounded-panel p-4 border border-border h-[150px] animate-pulse"
                  aria-label="loading"
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="space-y-3 p-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-10 bg-muted/40 rounded animate-pulse w-full"
                  />
                ))}
              </div>
            </div>
          )
        ) : mergedResults.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 bg-card/40 rounded-xl border border-border/80">
            <SlidersHorizontal className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {t("screener.noResults")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              {debouncedQuery
                ? `No instruments matched "${debouncedQuery}" with the current filters.`
                : "Try widening your search or resetting active filters."}
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t("screener.resetFilters")}
            </button>
          </div>
        ) : viewMode === "grid" ? (
          /* Card Grid View Mode (Insights Aesthetic) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mergedResults.map((asset) => {
              const { liveText, pctText, cls } = presentQuoteRow({
                price: asset.price,
                changePercent: asset.changePercent,
              });
              const flagCode = asset.country
                ? countryFlagMap[asset.country]
                : undefined;

              return (
                <div
                  key={asset.symbol}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/stock/${asset.symbol}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/stock/${asset.symbol}`);
                    }
                  }}
                  className="bg-card rounded-panel p-4 border border-border hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Logo + Symbol + Price + Change */}
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <TickerLogo ticker={asset.symbol} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {asset.symbol}
                          </p>
                          {asset.sector && (
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate max-w-[130px]">
                              {translateSector(t, asset.sector)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right rtl:text-left shrink-0">
                        <p
                          className="text-sm font-bold text-foreground font-mono tabular-nums"
                          dir="ltr"
                        >
                          {liveText}
                        </p>
                        <p
                          className={`text-xs font-semibold font-mono tabular-nums ${cls}`}
                          dir="ltr"
                        >
                          {pctText}
                        </p>
                      </div>
                    </div>

                    {/* Company Name */}
                    <p
                      className="text-xs text-muted-foreground mb-3 truncate"
                      title={asset.name}
                    >
                      {asset.name}
                    </p>
                  </div>

                  {/* Bottom Row: Country + Asset Type + Market Cap */}
                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                      {flagCode && (
                        <img
                          src={`https://flagcdn.com/w20/${flagCode}.png`}
                          alt=""
                          className="w-3.5 h-2.5 rounded-[1px] object-cover shrink-0"
                          loading="lazy"
                        />
                      )}
                      <span className="truncate">
                        {asset.country
                          ? translateCountry(t, asset.country)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] uppercase font-semibold">
                        {asset.asset_type
                          ? translateAssetType(t, asset.asset_type)
                          : "—"}
                      </span>
                      <span
                        className="font-mono text-foreground font-medium"
                        dir="ltr"
                      >
                        {formatMoneyCompact(asset.marketCap) ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table / Ledger View Mode */
          <div className="bg-card rounded-xl border border-border flex flex-col overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border sticky top-0 z-10 backdrop-blur">
                  <tr>
                    {[
                      {
                        key: "symbol",
                        label: t("screener.col.symbol"),
                        align: "left",
                      },
                      {
                        key: "name",
                        label: t("screener.col.name"),
                        align: "left",
                      },
                      {
                        key: "asset_type",
                        label: t("screener.assetType"),
                        align: "left",
                      },
                      {
                        key: "sector",
                        label: t("screener.col.sector"),
                        align: "left",
                      },
                      {
                        key: "country",
                        label: t("screener.col.country"),
                        align: "left",
                      },
                      {
                        key: "price",
                        label: t("common.price"),
                        align: "right",
                      },
                      {
                        key: "change",
                        label: t("common.change"),
                        align: "right",
                      },
                      {
                        key: "market_cap",
                        label: t("metrics.marketCap"),
                        align: "right",
                      },
                    ].map((col) => {
                      const isSorted = sortBy === col.key;
                      return (
                        <th
                          key={col.key}
                          aria-sort={
                            isSorted
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                          className={`px-5 py-3.5 font-semibold select-none hover:text-foreground transition-colors ${
                            col.align === "right" ? "text-right" : ""
                          } ${isSorted ? "text-primary font-bold" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(col.key)}
                            className={`inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded cursor-pointer ${
                              col.align === "right" ? "flex-row-reverse" : ""
                            }`}
                          >
                            <span>{col.label}</span>
                            {isSorted ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="w-3.5 h-3.5 text-primary stroke-[3]" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-primary stroke-[3]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {mergedResults.map((asset) => {
                    const flagCode = asset.country
                      ? countryFlagMap[asset.country]
                      : undefined;
                    const { liveText, pctText, cls } = presentQuoteRow({
                      price: asset.price,
                      changePercent: asset.changePercent,
                    });

                    return (
                      <tr
                        key={asset.symbol}
                        onClick={() => navigate(`/stock/${asset.symbol}`)}
                        className="hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        {/* Symbol with TickerLogo */}
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <TickerLogo ticker={asset.symbol} size="sm" />
                            <Link
                              to={`/stock/${asset.symbol}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-bold text-foreground group-hover:text-primary transition-colors"
                            >
                              {asset.symbol}
                            </Link>
                          </div>
                        </td>

                        {/* Name */}
                        <td
                          className="px-5 py-3 font-medium text-foreground max-w-[260px] truncate"
                          title={asset.name}
                        >
                          {asset.name}
                        </td>

                        {/* Asset Type */}
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/40">
                            {asset.asset_type
                              ? translateAssetType(t, asset.asset_type)
                              : "—"}
                          </span>
                        </td>

                        {/* Sector */}
                        <td
                          className="px-5 py-3 text-muted-foreground max-w-[160px] truncate text-xs"
                          title={asset.sector}
                        >
                          {asset.sector
                            ? translateSector(t, asset.sector)
                            : "—"}
                        </td>

                        {/* Country */}
                        <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5">
                            {flagCode && (
                              <img
                                src={`https://flagcdn.com/w20/${flagCode}.png`}
                                alt=""
                                className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                                loading="lazy"
                              />
                            )}
                            <span>
                              {asset.country
                                ? translateCountry(t, asset.country) || "—"
                                : "—"}
                            </span>
                          </div>
                        </td>

                        {/* Live Price */}
                        <td
                          className="px-5 py-3 font-mono font-semibold text-right tabular-nums text-foreground"
                          dir="ltr"
                        >
                          {liveText}
                        </td>

                        {/* Live Change % */}
                        <td
                          className={`px-5 py-3 font-mono font-semibold text-right tabular-nums text-xs ${cls}`}
                          dir="ltr"
                        >
                          {pctText}
                        </td>

                        {/* Market Cap */}
                        <td
                          className="px-5 py-3 font-mono text-right tabular-nums text-muted-foreground"
                          dir="ltr"
                        >
                          {formatMoneyCompact(asset.marketCap) ??
                            translateMarketCap(t, asset.market_cap)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Google-Style Pagination Footer */}
        {total > 0 && (
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mt-6 px-2 text-sm text-muted-foreground">
            <span>
              {t("screener.showingResults", {
                start: results.length > 0 ? page * limit + 1 : 0,
                end: Math.min((page + 1) * limit, total),
                total: total.toLocaleString(),
              })}
            </span>

            {/* Pagination Controls Spread: << < 1 2 3 4 [5] 6 7 8 9 10 > >> */}
            <div
              className="flex flex-wrap items-center justify-center gap-1.5"
              dir="ltr"
            >
              {/* << Jump -10 pages */}
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 10))}
                disabled={page === 0 || isLoading}
                className="inline-flex items-center justify-center h-8 px-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:hover:bg-card transition-colors text-xs font-semibold text-foreground"
                title="Previous 10 pages (-10)"
                aria-label="Previous 10 pages"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              {/* < Jump -1 page */}
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isLoading}
                className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:hover:bg-card transition-colors text-xs font-semibold text-foreground"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Spread Out Numbered Page Buttons */}
              {paginationPages.map((pIndex) => {
                const isCurrent = pIndex === page;
                return (
                  <button
                    key={pIndex}
                    type="button"
                    onClick={() => setPage(pIndex)}
                    disabled={isLoading}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`min-w-[32px] h-8 px-2 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-colors ${
                      isCurrent
                        ? "bg-primary/20 text-primary border-primary/50 shadow-sm font-bold"
                        : "bg-card hover:bg-muted text-foreground border-border"
                    }`}
                  >
                    {pIndex + 1}
                  </button>
                );
              })}

              {/* > Jump +1 page */}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(maxPages - 1, p + 1))}
                disabled={page >= maxPages - 1 || isLoading}
                className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:hover:bg-card transition-colors text-xs font-semibold text-foreground"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* >> Jump +10 pages */}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(maxPages - 1, p + 10))}
                disabled={page >= maxPages - 1 || isLoading}
                className="inline-flex items-center justify-center h-8 px-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-30 disabled:hover:bg-card transition-colors text-xs font-semibold text-foreground"
                title="Next 10 pages (+10)"
                aria-label="Next 10 pages"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
