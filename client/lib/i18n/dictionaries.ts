/**
 * client/lib/i18n/dictionaries.ts
 *
 * The raw en/he translation string tables, extracted verbatim from
 * client/lib/i18n.tsx (loop iteration 2) so the 2,100-line data payload
 * no longer shares a file with the provider machinery. Copy edits to
 * translations should land here; changes to provider/plural/translation
 * logic stay in i18n.tsx.
 *
 * client/lib/i18n.tsx re-exports enDict/heDict unchanged, so the module's
 * public API is stable. Parity with the pre-extraction objects is pinned
 * by client/lib/i18n/dictionaries.spec.ts and the existing i18n.spec.ts.
 */

const en = {
  // Common
  "app.name": "Vantage",
  loading: "Loading...",
  "error.generic": "Something went wrong",
  "source.yahoo": "Yahoo Finance",
  "source.fmp": "FMP",
  "source.alphavantage": "AlphaVantage",
  "source.finnhub": "Finnhub",

  // Route-level lazy-chunk fallback
  "route.loading": "Loading page…",

  // Top-level navigation (sidebar + breadcrumb + page headings)
  "nav.insights": "Insights",
  "nav.screener": "Screener",
  "nav.watchlists": "Watchlists",
  "nav.charts": "Charts",
  "nav.earnings": "Earnings",
  "nav.portfolios": "Portfolios",

  // TopBar
  "topBar.indicesDow": "Dow",
  "topBar.indicesSp500": "S&P 500",
  "topBar.indicesNasdaq": "Nasdaq",

  // Common UI labels (legacy)
  "common.change": "Change",
  "common.date": "Date",
  "common.name": "Name",
  "common.price": "Price",
  "common.pricePerShare": "Price/share",
  "common.marketClose": "Market close",
  "common.shares": "Shares",
  "common.sharesUnit": "shares",
  "common.search": "Search",
  "common.symbol": "Symbol",
  "common.transacted": "Transacted",
  "common.type": "Type",
  "common.value": "Value",
  "insider.administrative": "Administrative",
  "insider.reportedPrice": "Reported transaction price",
  "insider.priceUnavailable": "Price not reported by provider",
  "insider.derivedValue": "Value derived from reported price × shares",
  "insider.marketCloseContext":
    "Market closing price on the transaction date; not the execution price",
  "common.usd": "US Dollar",
  "common.ils": "Israeli Shekel",
  "common.eur": "Euro",
  "common.gbp": "British Pound",

  // Index page
  "index.change": "Change:",
  "index.earnings": "Earnings:",
  "index.financialMetricsTitle": "Financial Metrics",
  "index.metricsUnavailable": "Metrics unavailable for {{ticker}}",
  "index.metricsRetry": "Retry",
  // Appears under "Metrics unavailable …" when the provider-health probe
  // shows FMP is degraded/down. The free tier's 250-call daily cap means
  // a 429 here is almost always the budget, not the request. {{hours}} is
  // an estimate (FMP's window appears to be a rolling 24h) — we report a
  // bounded range ("1–24") so a long-quiet probe can't read as 0.
  "index.metricsRateLimited":
    "Free-tier FMP daily quota reached — metrics refresh will resume in ~{{hours}}h. Retry is honest about a likely no-op until then.",
  // Variant shown when the probe hasn't ticked yet (e.g. first paint).
  // We still want to acknowledge FMP may be the cause, but without
  // inventing a reset window.
  "index.metricsRateLimitedUnknownReset":
    "Free-tier FMP daily quota may be reached — retry later. Live quotes and charts are unaffected.",
  // ── Yahoo fallback path (FMP rate-limited) ───────────────────────────────────
  // Compact 4-card snapshot swap with a per-card chip so users can tell at a
  // glance that the values are single-point estimates (not a YoY/CAGR series).
  // `metricsYahooFallbackChip` is the visible label on every card; the title
  // attribute (`metricsYahooFallbackTitle`) explains the source on hover so
  // a power-user can tell why values look different from the FMP grid.
  "index.metricsYahooFallbackChip": "Yahoo estimate",
  "index.metricsYahooFallbackTitle":
    "Live Yahoo estimate — FMP free-tier daily quota exhausted, single-point TTM/estimate values shown in place of the 8-card YoY/CAGR grid.",
  "index.qualityInBrief": "Quality in Brief",
  "index.analystOutlookRange": "Analyst Outlook & Range",
  "index.targetEps": "Target EPS",
  "index.52wLow": "52W Low",
  "index.52wHigh": "52W High",
  "index.avg50Day": "50-Day Avg",
  "index.avg200Day": "200-Day Avg",
  "index.epsEstCurrQtr": "EPS Est. (Curr Qtr)",
  "index.revenueEstAvg": "Revenue Est. (Avg)",
  "index.unavailableApi":
    "Market data is currently unavailable. Please try again in a moment.",
  "index.viewMore": "View More",
  "index.news1":
    "Quarterly revenue beat consensus expectations, driven by <strong>Services</strong> growth.",
  "index.news2":
    "Management raised <strong>full-year guidance</strong> on the back of stronger-than-expected demand.",

  // ChartModal
  "chart.download": "Download CSV",
  "chart.yoy1Y": "1Y YoY",
  "chart.cagr3Y": "3Y CAGR",
  "chart.cagr5Y": "5Y CAGR",
  "chart.descYoY": "Trailing 12 months vs prior year.",
  "chart.descCagr3Y": "Compound annual growth rate, last 3 years.",
  "chart.descCagr5Y": "Compound annual growth rate, last 5 years.",
  // Quarterly vs Yearly granularity toggle on the metric chart modal.
  // "Q1 FY 2025" bars replace "FY 2025"; CAGR windows walk back 4/12/20 rows.
  "chart.yearly": "Yearly",
  "chart.quarterly": "Quarterly",
  "chart.granularity": "Granularity",
  "chart.timeframe": "Timeframe",
  "chart.annualHint": "Show one bar per fiscal year (default).",
  "chart.quarterlyHint":
    "Show one bar per quarter (Q1–Q4); CAGR windows widen to 4 / 12 / 20 quarters.",
  "chart.descYoYQuarter": "Latest quarter vs the same quarter last year.",
  "chart.descCagr3YQuarter":
    "Quarterly CAGR over the last 12 quarters (annualized).",
  "chart.descCagr5YQuarter":
    "Quarterly CAGR over the last 20 quarters (annualized).",
  "chart.period": "Period",
  "chart.value": "Value",
  "chart.yoy": "YoY Growth",
  // Stocknest-style chart grid: frequency tabs + YoY toggle + nav labels.
  "chart.annual": "Annual",
  "chart.ttm": "TTM",
  "chart.yoyToggle": "YoY %",
  "chart.expand": "Expand chart",
  "chart.prevMetric": "Previous metric",
  "chart.nextMetric": "Next metric",
  // Segment stacked-chart tooltip / table footer total (Revenue by Segment).
  "chart.total": "Total",
  "chart.segmentQuarterlyUnavailable":
    "Quarterly segment data is unavailable for this symbol — showing annual.",
  "chart.segmentNoSelection": "Select at least one segment to display.",

  // PricingModal (placeholder). Triggered by the Upgrade CTA beside
  // the locked "Segments 🔒" chip and inside the chart modal banner.
  // Body copy branches on `context` so a future earnings-locked CTA
  // (or any other gated feature) can re-use the same modal with
  // feature-specific copy without another component.
  "pricing.title": "Vantage Premium",
  "pricing.subtitle": "Locked premium feature — placeholder sign-up",
  "pricing.revenueSegmentsBody":
    "The locked chip you just clicked lives behind the Vantage Premium tier. Today, the free FMP daily quota has run out (or no FMP key is configured) — segment-level revenue data, quarterly granularity, and full historical coverage are all unlimited on Premium.",
  "pricing.genericBody":
    "This feature is part of Vantage Premium. Free-tier coverage is fine for headline metrics, but unbounded history, per-product breakdowns, custom alerts, and DCF tooling are all Premium-only.",
  "pricing.bulletSegments":
    "Per-product revenue breakdowns with quarterly granularity",
  "pricing.bulletHistory":
    "Unbounded historical financials across every reporting period",
  "pricing.bulletAlerts":
    "Custom alerts when a metric crosses a threshold you set",
  "pricing.placeholderNote":
    "Pricing isn't live yet — these buttons are wireframes. We'll wire the real checkout when billing ships.",
  "pricing.close": "Close",
  "pricing.notifyMe": "Notify me when it ships",
  "pricing.contactSales": "Contact sales",

  // DCFWidget
  "dcf.eyebrow": "INTERACTIVE VALUATION ENGINE",
  "dcf.sandboxTitle": "Instant Discounted Cash Flow Sandbox",
  "dcf.sandboxSubtitle":
    "Stress-test growth assumptions, multiples, and target discount rates with real-time intrinsic value computation.",
  "dcf.openFullTool": "Open Full DCF Tool in Workspace →",
  "dcf.title": "DCF Valuation",
  "dcf.sandboxTab": "Interactive Sandbox",
  "dcf.trajectoryTab": "5Y Growth Trajectory",
  "dcf.earningsMode": "Earnings Mode",
  "dcf.cashFlowMode": "Cash Flow Mode",
  "dcf.mode": "Mode:",
  "dcf.targetPct": "Target %:",
  "dcf.valueTrajectoryTitle": "5-Year Value & Metric Expansion Path",
  "dcf.terminalExitPrice": "Terminal Exit Price: ${{price}}",
  "dcf.targetStockPrice": "Target Stock Price",
  "dcf.fcfBillions": "FCF ($B)",
  "dcf.earningsBillions": "Net Income ($B)",
  "dcf.currentPriceLegend": "Current Price",
  "dcf.baseFcf": "Base FCF ($B)",
  "dcf.baseEarnings": "Base Net Income ($B)",
  "dcf.growthRate5Y": "Expected 5Y Growth Rate (%)",
  "dcf.exitMultiple": "Terminal Exit Multiple (P/FCF)",
  "dcf.exitMultiplePcf": "Terminal Exit Multiple (P/FCF)",
  "dcf.exitMultiplePe": "Terminal Exit Multiple (P/E)",
  "dcf.discountRate": "Target Discount Rate (%)",
  "dcf.estimatedFairValue": "ESTIMATED FAIR VALUE",
  "dcf.fairlyValued": "Fairly Valued",
  "dcf.undervalued": "Undervalued",
  "dcf.overvalued": "Overvalued",
  "dcf.marketPrice": "Market Price",
  "dcf.marginOfSafety": "Projected Margin of Safety",
  "dcf.modelFullFinancials": "Model Full Financials in Workspace →",
  "dcf.currentEarnings": "Current Earnings",
  "dcf.growthRate": "Growth Rate",
  "dcf.multiple": "Multiple",
  "dcf.forward": "Forward return over 5 years",
  "dcf.basedOnCurrentPrice": "Based on current price of ",
  "dcf.reverse": "Target Buy Price for {{target}}% return",
  "dcf.targetingReturn":
    "Targeting a {{target}}% annualized return (Req. Exit: {{multiple}}x).",
  "dcf.projectedPrice": "Projected Price",

  // DCF Tooltips
  "dcf.tooltip.cashFlowMode":
    "Valuation based on Free Cash Flow (cash from operations minus CapEx). Ideal for capital-intensive or cash-compounding businesses.",
  "dcf.tooltip.earningsMode":
    "Valuation based on Net Income (GAAP earnings). Ideal for mature, profitable companies or financial firms where FCF is less representative.",
  "dcf.tooltip.baseFcf":
    "Starting annual Free Cash Flow in billions ($B). Sourced from the latest audited cash flow statement.",
  "dcf.tooltip.baseEarnings":
    "Starting annual Net Income in billions ($B). Sourced from the latest audited income statement.",
  "dcf.tooltip.growthRate":
    "Projected annual compound growth rate for cash flows or earnings over the next 5 years.",
  "dcf.tooltip.exitMultiplePcf":
    "The Price-to-FCF (P/FCF) valuation multiple applied to Year 5 cash flows to determine terminal exit value.",
  "dcf.tooltip.exitMultiplePe":
    "The Price-to-Earnings (P/E) valuation multiple applied to Year 5 earnings to determine terminal exit value.",
  "dcf.tooltip.discountRate":
    "Annual hurdle rate / required return used to discount future cash flows back to present day value.",
  "dcf.tooltip.fairValue":
    "Intrinsic value per share: (Sum of discounted 5-year flows + discounted terminal exit value) ÷ diluted shares outstanding.",
  "dcf.tooltip.marginOfSafety":
    "Difference between fair value and market price. Positive indicates an undervalued discount; negative indicates a premium.",
  "dcf.tooltip.forwardReturn":
    "Annualized compound rate of return (IRR) from current market price to projected Year 5 target price.",
  "dcf.tooltip.targetBuyPrice":
    "The maximum price you should pay today to lock in your desired target annual return at the projected Year 5 valuation.",
  "dcf.tooltip.trajectoryChart":
    "Year-by-year projected expansion path showing operational cash flow / earnings growth and implied milestone stock prices.",
  "dcf.tooltip.terminalExitPrice":
    "Implied stock price in Year 5 calculated by multiplying Year 5 projected metric by your terminal exit multiple.",

  // Sensitivity Matrix
  "dcf.sensitivityTitle": "2D Valuation Sensitivity Matrix",
  "dcf.sensitivitySubtitle":
    "Institutional stress-test matrix comparing 25 valuation scenarios against current market price.",
  "dcf.sensitivityTooltip":
    "Evaluates intrinsic fair value across varying cost of capital (WACC) and terminal growth/exit assumptions. Click any cell to apply those parameters.",
  "dcf.dimensionGrowth": "WACC × Growth Rate",
  "dcf.dimensionMultiple": "WACC × Exit Multiple",
  "dcf.sensitivityClickHint":
    "Click any cell to apply that valuation scenario to the sandbox.",
  "dcf.viewSensitivityMatrix": "Sensitivity Matrix",

  // Reverse DCF Engine
  "dcf.reverseDcfTitle": "Reverse DCF Expectation Solver",
  "dcf.reverseDcfSubtitle":
    "Calculates the exact 5-year growth rate the current stock price is pricing in.",
  "dcf.reverseDcfTooltip":
    "Inverts the DCF formula to solve for the market-implied growth rate. Compare this against your expectations to assess whether the stock is priced for perfection or under-appreciated.",
  "dcf.marketImpliedGrowth": "Market-Implied 5Y CAGR",
  "dcf.userAssumedGrowth": "Your Assumption",
  "dcf.expectationDelta": "Expectation Spread",
  "dcf.impliedTerminalMetric": "Implied Year 5 Base",
  "dcf.applyImpliedToSandbox": "Apply Implied Growth to DCF",
  "dcf.viewReverseDcf": "Reverse DCF",
  "dcf.regimeHyper": "Aggressive / Priced for Perfection",
  "dcf.regimeHigh": "High Growth Expected",
  "dcf.regimeModerate": "Moderate Growth Expected",
  "dcf.regimeLow": "Low Growth Expected",
  "dcf.regimeContraction": "Contraction Priced In",
  "dcf.headroomDescription":
    "You expect {{spread}}% higher growth than the market is pricing in (undervaluation cushion).",
  "dcf.deficitDescription":
    "The market price requires {{spread}}% higher growth than your current assumption.",
  "dcf.basedOnPriceAndWacc": "Based on ${{price}} price & {{wacc}}% WACC",
  "dcf.currentSandboxSetting": "Current sandbox setting",
  "dcf.growthHeadroom": "Growth headroom",
  "dcf.growthDeficit": "Growth deficit",
  "dcf.netIncomeBase": "Net Income",
  "dcf.fcfBase": "FCF",

  // Charts page
  "charts.dayRange": "Day Range",
  "charts.weekRange": "52-Week Range",
  "charts.aboveMidpoint": "Above midpoint · +${{amount}}",
  "charts.belowMidpoint": "Below midpoint · −${{amount}}",
  "charts.searchPlaceholder": "Search any stock ticker or company...",
  "charts.searchingStocks": "Searching stocks...",
  "charts.searchError": "Search temporarily unavailable",
  "charts.noMatchingStocks":
    'No matching stocks. Press Enter to load "{{query}}".',
  "charts.quickLabel": "Quick:",
  "charts.vol": "Vol: {{amount}}M",
  "charts.inRange": "{{percent}}% in range",
  "charts.clearSearch": "Clear search",
  "charts.midpointTitle": "Midpoint (50%)",
  "charts.low": "Low",
  "charts.mid": "Mid: ${{amount}}",
  "charts.high": "High",
  "charts.dcfGuidance":
    "Adjust the income / growth / multiple inputs to model scenarios. Forward return assumes reinvestment and the multiple stays constant — a real DCF discounts future cash-flows at WACC, not multiples, so treat this widget as a back-of-the-envelope.",

  // DipFinder
  "dipFinder.title": "Dip Finder (SMA Distance)",
  "dipFinder.liveBadge": "LIVE",
  "dipFinder.partialBadge": "PARTIAL",
  "dipFinder.mockBadge": "MOCK",
  "dipFinder.loading": "Loading live SMA distances...",
  "dipFinder.upcomingEarnings": "Upcoming Earnings",
  "dipFinder.news": "Recent News",
  "dipFinder.20day": "20-day SMA",
  "dipFinder.50day": "50-day SMA",
  "dipFinder.100day": "100-day SMA",
  "dipFinder.150day": "150-day SMA",
  "dipFinder.200day": "200-day SMA",

  // Earnings calendar
  "earningsCalendar.eyebrow": "PROACTIVE EVENT INTELLIGENCE",
  "earningsCalendar.title": "Upcoming Earnings Calendar & Wall St. Consensus",
  "earningsCalendar.subtitle":
    "Track earnings reporting dates, consensus EPS/revenue estimates, and surprises filtered to your holdings.",
  "earningsCalendar.openFull": "Open Full Earnings Calendar →",
  "earningsCalendar.viewGrid": "Cards Grid",
  "earningsCalendar.viewCalendar": "Weekly Columns",
  "earningsCalendar.dataSource":
    "Source: Financial Modeling Prep (FMP) & Yahoo Finance Consensus",
  "earningsCalendar.sourceLive": "FMP & Yahoo Consensus",
  "earningsCalendar.sourceMock": "Sample Data",
  "earningsCalendar.allReporting": "All Reporting",
  "earningsCalendar.watchlistsOnly": "Watchlists Only",
  "earningsCalendar.watchlist": "Watchlist",
  "earningsCalendar.watchlistLockedByFocus":
    "Filter locked while viewing focused alert",
  "earningsCalendar.adjustFiltersHint":
    "Adjust your watchlist or market cap filters to expand event coverage.",
  "earningsCalendar.marketClose": "Market Close",
  "earningsCalendar.unknownTiming": "Unspecified Time",
  "earningsCalendar.beat": "BEAT",
  "earningsCalendar.miss": "MISS",
  "earningsCalendar.viewStock": "View →",
  "earningsCalendar.preMarket": "Pre-Market (BMO)",
  "earningsCalendar.afterHours": "After-Hours (AMC)",
  "earningsCalendar.actual": "Actual:",
  "earningsCalendar.actualEps": "Actual EPS",
  "earningsCalendar.afterClose": "After Close",
  "earningsCalendar.beforeOpen": "Before Open",
  "earningsCalendar.epsEst": "EPS Est:",
  "earningsCalendar.filterByWatchlist": "Filter by watchlist",
  "earningsCalendar.marketCap": "Market Cap",
  "earningsCalendar.marketCapAll": "All Caps",
  "earningsCalendar.marketCapLarge": "Large ($10B+)",
  "earningsCalendar.marketCapMid": "Mid ($2B+)",
  "earningsCalendar.marketCapSmall": "Small (<$2B)",
  "earningsCalendar.mon": "Mon",
  "earningsCalendar.tue": "Tue",
  "earningsCalendar.wed": "Wed",
  "earningsCalendar.thu": "Thu",
  "earningsCalendar.fri": "Fri",
  "earningsCalendar.nextWeek": "Next week",
  "earningsCalendar.noEventsThisWeek": "No earnings events this week.",
  "earningsCalendar.prevWeek": "Previous week",
  "earningsCalendar.revEst": "Revenue Est:",
  "earningsCalendar.showing_one": "{{count}} earnings event this week",
  "earningsCalendar.showing_two": "A pair of earnings events this week",
  "earningsCalendar.showing_other": "{{count}} earnings events this week",
  "earningsCalendar.today": "Today",
  "earningsCalendar.weekOf": "Week of {{range}}",

  // Insights page
  "insights.title": "Insights",
  "insights.search_placeholder": "Search by symbol or company name...",
  "insights.filter.all_sectors": "All Sectors",
  "insights.filter.all_caps": "All Caps",
  "insights.filter.mega": "Mega $200B+",
  "insights.filter.large": "Large $10B+",
  "insights.filter.mid": "Mid $2B+",
  "insights.filter.small": "Small <$2B",
  "insights.filter.all_moves": "All Moves",
  "insights.filter.gainers": "Gainers >+1%",
  "insights.filter.losers": "Losers <-1%",
  "insights.filter.big_movers": "Big Movers >±5%",
  "insights.filter.flat": "Flat ±0.5%",
  "insights.filter.clear": "Clear",
  "insights.filter.stocks_of": "{{filtered}} of {{total}} stocks",
  "insights.spotlight.title": "SECTOR SPOTLIGHT",
  "insights.loading": "Loading real-time quotes from Yahoo Finance...",
  "insights.error.title": "Failed to load stock data",
  "insights.error.desc":
    "The Yahoo Finance API may be rate-limited. Try again in a moment.",
  "insights.empty.title": "No stocks match your filters",
  "insights.empty.desc": "Try adjusting your search or filter criteria",
  "insights.empty.clear": "Clear all filters",
  "insights.market_cap": "Market Cap:",
  "insights.marketCap": "Market Cap",

  // Insights tabs
  "insights.tabs.sp500": "S&P 500",
  "insights.tabs.trending": "Most Trending",
  "insights.tabs.growth": "Growth",
  "insights.tabs.dividend": "Dividend Growth",
  "insights.tabs.buyback": "Buyback Machines",
  "insights.tabs.ai": "Artificial Intelligence",
  "insights.tabs.cloud": "Cloud",
  "insights.tabs.ev": "Electric Vehicles",
  "insights.tabs.leisure": "Leisure and Entertainment",

  // Insight metric names (real-data path from Index.tsx)
  "insights.stockPrice": "Stock Price",
  "insights.revenue": "Revenue",
  "insights.ebitda": "EBITDA",
  "insights.grossProfit": "Gross Profit",
  "insights.grossProfitMargin": "Gross Profit Margin",
  "insights.operatingIncome": "Operating Income",
  "insights.operatingCashFlow": "Cash from Operations",
  "insights.netIncome": "Net Income",
  "insights.eps": "EPS",
  "insights.cashAndEquivalents": "Cash & Equivalents",
  "insights.totalAssets": "Total Assets",

  // Metric names (mock-data path from mockData.ts)
  "metrics.revenue": "Revenue",
  "metrics.revenueBySegment": "Revenue by Segment",
  "metrics.ebitda": "EBITDA",
  "metrics.grossProfit": "Gross Profit",
  "metrics.operatingIncome": "Operating Income",
  "metrics.netIncome": "Net Income",
  "metrics.cashEquivalents": "Cash & Equivalents",
  "metrics.freeCashFlow": "Free Cash Flow",
  "metrics.shareholdersEquity": "Shareholders Equity",
  "metrics.totalAssets": "Total Assets",
  "metrics.marketCap": "Market Cap",
  "metrics.eps": "EPS",

  // Stock fundamentals strip (Index.tsx real-data grid). Translating the
  // group titles + metric labels so the financial block reads in the active
  // language; numeric values stay LTR (dir="ltr" on the value span).
  "fundamentals.group.valuation": "Valuation",
  "fundamentals.group.cashFlow": "Cash Flow",
  "fundamentals.group.marginsGrowth": "Margins & Growth",
  "fundamentals.group.balance": "Balance",
  "fundamentals.group.dividend": "Dividend",
  "fundamentals.marketCap": "Market Cap",
  "fundamentals.pe": "P/E (TTM)",
  "fundamentals.priceToSales": "Price to Sales",
  "fundamentals.evToEbitda": "EV to EBITDA",
  "fundamentals.priceToBook": "Price to Book",
  "fundamentals.pcf": "P/CF",
  "fundamentals.pfcf": "P/FCF",
  "fundamentals.fcfYield": "FCF Yield",
  "fundamentals.profitMargin": "Profit Margin",
  "fundamentals.operatingMargin": "Operating Margin",
  "fundamentals.roic": "ROIC",
  "fundamentals.cash": "Cash",
  "fundamentals.debt": "Debt",
  "fundamentals.netDebt": "Net Debt",
  "fundamentals.dividendYield": "Dividend Yield",
  "fundamentals.payoutRatio": "Payout Ratio",
  "fundamentals.payoutDate": "Payout Date",
  "fundamentals.pcfFull": "Price to Operating Cash Flow (TTM)",
  "fundamentals.pfcfFull": "Price to Free Cash Flow (TTM)",
  "fundamentals.fcfFull": "Free Cash Flow",
  "fundamentals.unavailable": "Unavailable",
  "fundamentals.premiumBadge": "Premium",
  "fundamentals.unavailableTitle":
    "{{label}} is unavailable on the free plan — provided by FMP premium endpoints (ratios-ttm / key-metrics-ttm).",
  "fundamentals.premiumTitle":
    "{{label}} is a Vantage Premium metric (FMP premium endpoint).",

  // Availability badges — distinguish WHY a metric is missing/empty.
  "availability.pro": "Pro",
  "availability.proTitle":
    "{{label}} is paid-only at the provider — not reachable on any free tier.",
  "availability.rateLimited": "Limited",
  "availability.rateLimitedTitle":
    "{{label}} is free but the provider quota is exhausted (rate-limited). Retry shortly.",
  "availability.calcBroken": "Calc",
  "availability.calcBrokenTitle":
    "{{label}} is derived from other inputs and one of them is missing, so the calculation cannot complete.",
  "availability.stale": "Stale",
  "availability.staleTitle":
    "{{label}} is served from cache and may be out of date.",
  "availability.notFound": "Error",
  "availability.notFoundTitle":
    "{{label}} could not be fetched — no endpoint, 404, or upstream error.",
  "availability.nullByDesign": "N/A",
  "availability.nullByDesignTitle":
    "{{label}} is not reported for this instrument.",
  "availability.unknown": "—",
  "availability.unknownTitle": "{{label}} is not available.",

  // Revenue by segment card (FMP revenue-product-segmentation). `locked` is
  // the visible chip label when the free-tier quota is exhausted; the tooltip
  // explains why the segment filters are visible but unselectable.
  "revenueSegments.all": "All",
  "revenueSegments.locked": "Segments",
  "revenueSegments.rateLimitedTooltip":
    "Segment breakdown is a premium feature — the free-tier FMP quota is exhausted, so revenue is shown as a total.",
  "revenueSegments.unavailableTooltip":
    "Segment breakdown is a premium feature — no FMP data source is configured, so revenue is shown as a total.",
  // Banner shown inside the expanded chart modal when the segment
  // payload is unavailable for premium-tier reasons. The card already
  // surfaces the locked chip with a tooltip; the modal mirrors that
  // state with a one-line banner so the user understands why the chart
  // is the total-revenue shape instead of the per-segment stacked bars.
  "revenueSegments.modalBannerTitle": "Per-segment breakdown locked",
  "revenueSegments.modalBannerRateLimited":
    "The free-tier FMP quota is exhausted, so revenue is shown as a single total. Segment filters would be available on a paid plan.",
  "revenueSegments.modalBannerUnavailable":
    "No FMP data source is configured, so revenue is shown as a single total. Segment filters would be available on a paid plan.",
  // Short label on the small Starlight Gold `Premium` badge that sits
  // beside the locked "Segments 🔒" chip — both on the card and inside
  // the expanded modal. Avoids relying on hover-tooltip discoverability
  // for which feature is gated.
  "revenueSegments.premiumBadge": "Premium",
  // Small inline CTA rendered beside the locked premium banner body
  // and beside the card's locked chip strip — opens the placeholder
  // /pricing modal hosted at the page level. Compact label so it
  // doesn't compete visually with the longer banner body.
  "revenueSegments.upgradeCta": "Upgrade",

  // Insights — Company Profile / Detail page
  "insights.search": "Search",
  "insights.tabBadgeLive": "● LIVE",
  "insights.tabBadgeMock": "○ MOCK",
  "insights.noMatch": 'No stocks match "{{query}}"',
  "insights.piotroskiScore": "Piotroski Score",
  "insights.activeStatus": "Active Status",
  "insights.analystEstimates": "Analyst Estimates",
  "insights.avg": "Avg",
  "insights.beta": "Beta",
  "insights.ceo": "CEO",
  "insights.country": "Country",
  "insights.cik": "CIK",
  "insights.companyProfile": "Company Profile",
  "insights.showMore": "Show more",
  "insights.showLess": "Show less",
  "insights.currentQtr": "Current Qtr",
  "insights.currentYear": "Current Year",
  "insights.cusip": "CUSIP",
  "insights.employeeCount": "Employee Count",
  "insights.employees": "Employees",
  "insights.unavailable": "\u2014",
  "insights.website": "Website",
  "insights.chartLiveSingleYear":
    "Only the latest year is live; historical years unavailable from the free-tier provider.",
  "insights.exchangeDescription": "Exchange",
  "insights.high": "High",
  "insights.idChips": "Identifiers",
  "insights.industry": "Industry",
  "insights.insiderTrading": "Insider Trading",
  "insider.type.P": "Purchase",
  "insider.type.S": "Sale",
  "insider.type.A": "Stock Award",
  "insider.type.G": "Stock Gift",
  "insider.type.M": "Option Exercise",
  "insider.type.F": "Tax Withholding",
  "insider.type.D": "Disposal",
  "insider.type.X": "Option Grant",
  "insider.type.C": "Conversion",
  "insider.type.other": "Transaction",
  "insights.ipoDate": "IPO Date",
  "insights.isAdr": "ADR",
  "insights.isEtf": "ETF",
  "insights.isFund": "Fund",
  "insights.isin": "ISIN",
  "insights.lastDividend": "Last Dividend",
  "insights.low": "Low",
  "insights.news": "News",
  // Footer for the news card on /stock/:ticker — reflects the upstream
  // Yahoo `newsCount: 12` and the in-card cap of 8. The footer keeps the
  // "this is a live Yahoo feed" cue prominent when Yahoo is healthy.
  "news.footer": "Live from Yahoo Finance · showing {count} latest",
  "insights.nextYear": "Next Year",
  "insights.no": "No",
  "insights.period": "Period",
  "insights.sector": "Sector",
  "insights.yes": "Yes",

  // Earnings page (new namespace)
  "earnings.title": "Earnings Calendar",
  "earnings.subtitle":
    "Track earnings reporting dates, consensus EPS/revenue estimates, and surprises.",
  "earnings.loading": "Loading earnings calendar from Finnhub...",
  "earnings.error.title": "Failed to load earnings calendar",
  "earnings.error.desc":
    "Finnhub API may be rate-limited. Try again in a moment.",
  "earnings.empty.title": "No earnings reports this week",
  "earnings.empty.desc":
    "Try a different week or check back closer to the date",
  "earnings.today": "Today",
  "earnings.week": "Week",
  "earnings.total_reports": "Total Reports",
  "earnings.before_open": "Before Open",
  "earnings.after_close": "After Close",
  "earnings.view_week": "Week View",
  "earnings.view_list": "List View",

  "earnings.bmo": "BMO",
  "earnings.amc": "AMC",
  "earnings.other": "Other",
  "earnings.eps_est": "EPS Est:",
  "earnings.eps_act": "EPS Act:",
  "earnings.surprise": "Surprise:",
  "earnings.rev_est": "Rev Est:",
  "earnings.rev_act": "Rev Act:",
  "earnings.est": "Est:",
  "earnings.midday": "Midday",

  // Watchlists
  "watchlists.description":
    "Organize high-conviction ideas, monitor live scorecards, and track sector exposure across customizable lists.",
  "watchlists.noUpcoming": "No upcoming earnings in the next 14 days.",

  // Watchlists v2 — user-defined lists, persistence, drag-reorder
  "watchlists.addButton": "+ Add",
  "watchlists.addTitle": "Create a new watchlist",
  "watchlists.nameLabel": "Name",
  "watchlists.namePlaceholder": "My Watchlist",
  "watchlists.symbolsLabel": "Symbols",
  "watchlists.symbolsPlaceholder":
    "Paste tickers — one per line, comma-separated, or as CSV",
  "watchlists.csvHint":
    "We validate each ticker against /api/stock-overview before adding.",
  "watchlists.validatingLabel": "Validating…",
  "watchlists.validCount_one": "1 valid",
  "watchlists.validCount_other": "{{count}} valid",
  "watchlists.invalidCount_one": "1 invalid",
  "watchlists.invalidCount_other": "{{count}} invalid",
  "watchlists.invalidChip": "Invalid",
  "watchlists.tooManySymbols":
    "Please use no more than {{max}} symbols per watchlist.",
  "watchlists.validationUnavailable":
    "Symbol validation is temporarily unavailable. Please try again.",
  "watchlists.createButton": "Create",
  "watchlists.cancelButton": "Cancel",
  "watchlists.deleteButton": "Delete",
  "watchlists.renameButton": "Rename",
  "watchlists.systemBadge": "Default",
  "watchlists.cannotDeleteSystem": "The default list can't be deleted.",
  "watchlists.cannotRenameSystem": "The default list can't be renamed.",
  "watchlists.emptyNameError": "Please enter a name.",
  "watchlists.duplicateNameError": 'A list named "{{name}}" already exists.',
  "watchlists.empty": "Add symbols to get started.",
  "watchlists.dropToReorder": "Drag rows to reorder.",
  "watchlists.confirmDelete": 'Delete "{{name}}"?',

  // NotFound
  "notfound.title": "404 — Page Not Found",
  "notfound.description":
    "The page you're looking for doesn't exist or has moved.",
  "notfound.returnHome": "Return to home",

  // Portfolio
  "portfolio.title": "Portfolios",
  "portfolio.description":
    "Track asset allocation, risk-adjusted returns, and dividend income across portfolios.",
  "portfolio.analyticsTitle": "Analytics",
  "portfolio.annualIncome": "Annual Income",
  "portfolio.cagr": "CAGR",
  "portfolio.currentValue": "Current Value",
  "portfolio.derived": "Derived",
  "portfolio.divOverlay": "Dividend overlay",
  "portfolio.dividendYield": "Dividend Yield",
  "portfolio.downsideOnly": "Downside only",
  "portfolio.fxBannerBody":
    "Showing USD values because live FX rates are unavailable.",
  "portfolio.fxStale": "FX STALE",
  "portfolio.gainLoss": "Gain / Loss",
  "portfolio.gainLossPct": "Gain / Loss %",
  "portfolio.holdings": "Holdings",
  "portfolio.irr": "IRR",
  "portfolio.irrExplainBody":
    "Annualized return on invested cashflows assuming reinvestment over the trailing 12 months. Calculated: {{rate}}.",
  "portfolio.irrExplainTitle": "How IRR is calculated",
  "portfolio.nextEvent": "Next Event",
  "portfolio.noPrice": "no price",
  "portfolio.oneYearBasis": "1-year basis",
  "portfolio.partial": "PARTIAL",
  "portfolio.reviewReminder":
    "Re-run flows weekly; market moves shift risk classifications.",
  "portfolio.sharpe": "Sharpe",
  "portfolio.sortBy": "Sort by",
  "portfolio.sortino": "Sortino",
  "portfolio.synthCashflows": "Synthesized cashflows",
  "portfolio.updatePortfolio": "Update Portfolio",
  "portfolio.volatility": "Volatility",
  "portfolio.weight": "Weight",
  "portfolio.weightedAvg": "Weighted Avg",

  // Time-ago strings (used by formatTimeAgo for news / event rows)
  "timeAgo.justNow": "just now",
  "timeAgo.minutesAgo_one": "{{count}} minute ago",
  "timeAgo.minutesAgo_other": "{{count}} minutes ago",
  "timeAgo.hoursAgo_one": "{{count}} hour ago",
  "timeAgo.hoursAgo_other": "{{count}} hours ago",
  "timeAgo.daysAgo_one": "{{count}} day ago",
  "timeAgo.daysAgo_other": "{{count}} days ago",
  "timeAgo.weeksAgo_one": "{{count}} week ago",
  "timeAgo.weeksAgo_other": "{{count}} weeks ago",
  "timeAgo.monthsAgo_one": "{{count}} month ago",
  "timeAgo.monthsAgo_other": "{{count}} months ago",
  "timeAgo.yearsAgo_one": "{{count}} year ago",
  "timeAgo.yearsAgo_other": "{{count}} years ago",

  // InsightsCard footer / sparkline meta
  "insights.card.points_one": "{{count}} period",
  "insights.card.points_other": "{{count}} periods",
  "insights.card.dataSpan": "{{first}} → {{last}}",

  // Sector Spotlight (Bloomberg heatmap-style breakdown)
  // Glossary for translators: keep `·` middle-dot; "{{priced}} priced ·
  // {{total}} total" mirrors Hebrew "… עם מחיר · … סהכ" — compact for the
  // 10px footer caption beside a sector row. Spell out "סך הכל" only if
  // wrapping tolerance on the narrow sector row is no longer a concern.
  "insights.spotlight.rowMeta": "{{priced}} priced · {{total}} total",
  "insights.spotlight.empty": "No sector data available for this view.",

  // Sector Heatmap (5-day Bloomberg-style columnar heatmap)
  "insights.heatsheet.title": "SECTOR HEATMAP",
  "insights.heatsheet.foot": "{{rows}} sectors · {{days}} days · cached 15 min",
  "insights.heatsheet.partialHit": "today (partial)",
  "insights.heatsheet.partialTitle":
    "Last column is today's intraday move — settles at close.",
  "insights.heatsheet.cellMeta_one": "1 of {{total}} priced · avg {{pct}}",
  "insights.heatsheet.cellMeta_other":
    "{{priced}} of {{total}} priced · avg {{pct}}",
  "insights.heatsheet.cellEmpty": "—",
  "insights.heatsheet.weekNetLabel": "5-day Σ",
  "insights.heatsheet.weekNetNoData": "no bookend",
  "insights.heatsheet.loading":
    "Computing sector heatmap from {{days}}-day closes…",
  "insights.heatsheet.untaggedSymbols_one": "untagged symbol",
  "insights.heatsheet.untaggedSymbols_other": "untagged symbols",
  "insights.heatsheet.unavailableTitle": "Sector data temporarily unavailable",
  "insights.heatsheet.unavailableBody":
    "The US market heatmap uses recent Yahoo chart history for the curated S&P 500 universe. No sector rows were returned, so no values are being estimated or filled with mock data.",
  "insights.heatsheet.symbolCount_one": "1 symbol",
  "insights.heatsheet.symbolCount_other": "{{count}} symbols",

  // Sectors — canonical FMP English names, translated for HE locale.
  // HE strings mirror Globes / TheMarker conventions for Hebrew financial press.
  // Looked up via `translateSector(t, sector)` so the raw English falls back
  // when a new FMP sector arrives before translators can cover it.
  "sector.technology": "Technology",
  "sector.informationTechnology": "Information Technology",
  "sector.healthcare": "Healthcare",
  "sector.healthCare": "Health Care",
  "sector.financialServices": "Financial Services",
  "sector.financials": "Financials",
  "sector.consumerCyclical": "Consumer Cyclical",
  "sector.consumerDiscretionary": "Consumer Discretionary",
  "sector.consumerDefensive": "Consumer Defensive",
  "sector.consumerStaples": "Consumer Staples",
  "sector.communicationServices": "Communication Services",
  "sector.industrials": "Industrials",
  "sector.energy": "Energy",
  "sector.realEstate": "Real Estate",
  "sector.utilities": "Utilities",
  "sector.basicMaterials": "Basic Materials",
  "sector.materials": "Materials",

  // Market Cap Tiers
  "marketCap.megaCap": "Mega Cap",
  "marketCap.largeCap": "Large Cap",
  "marketCap.midCap": "Mid Cap",
  "marketCap.smallCap": "Small Cap",
  "marketCap.microCap": "Micro Cap",
  "marketCap.nanoCap": "Nano Cap",

  // Countries
  "country.unitedStates": "United States",
  "country.israel": "Israel",
  "country.china": "China",
  "country.unitedKingdom": "United Kingdom",
  "country.canada": "Canada",
  "country.japan": "Japan",
  "country.germany": "Germany",
  "country.india": "India",
  "country.france": "France",
  "country.switzerland": "Switzerland",
  "country.netherlands": "Netherlands",
  "country.taiwan": "Taiwan",
  "country.southKorea": "South Korea",
  "country.australia": "Australia",
  "country.brazil": "Brazil",
  "country.singapore": "Singapore",
  "country.ireland": "Ireland",
  "country.sweden": "Sweden",
  "country.hongKong": "Hong Kong",
  "country.spain": "Spain",
  "country.italy": "Italy",
  "country.denmark": "Denmark",
  "country.norway": "Norway",
  "country.finland": "Finland",
  "country.belgium": "Belgium",
  "country.austria": "Austria",
  "country.mexico": "Mexico",
  "country.southAfrica": "South Africa",
  "country.newZealand": "New Zealand",
  "country.caymanIslands": "Cayman Islands",
  "country.bermuda": "Bermuda",
  "country.luxembourg": "Luxembourg",
  "country.saudiArabia": "Saudi Arabia",
  "country.unitedArabEmirates": "United Arab Emirates",
  "country.argentina": "Argentina",
  "country.chile": "Chile",
  "country.colombia": "Colombia",
  "country.greece": "Greece",
  "country.turkey": "Turkey",
  "country.poland": "Poland",
  "country.portugal": "Portugal",
  "country.czechRepublic": "Czech Republic",
  "country.hungary": "Hungary",
  "country.indonesia": "Indonesia",
  "country.malaysia": "Malaysia",
  "country.philippines": "Philippines",
  "country.thailand": "Thailand",
  "country.vietnam": "Vietnam",
  "country.egypt": "Egypt",
  "country.cyprus": "Cyprus",

  // Sidebar
  "sidebar.subtitle": "Research workspace",

  // Splash / login
  "splash.email": "Email address",
  "splash.password": "Password",
  "splash.login": "Log In / 7-Day Trial",
  "splash.subtitle":
    "Your personalized Bloomberg terminal for long-term investors.",

  // Landing Page
  "landing.hero.eyebrow": "OBSERVATORY FOR COMPANY FUNDAMENTALS",
  "landing.hero.badge": "v2.4 Research Workspace",
  "landing.hero.titleLine1": "Read the Signal in",
  "landing.hero.titleHighlight": "Company Fundamentals",
  "landing.hero.subtitle":
    "A quiet, luminous financial research workspace. Deep 5-year financial statements, light-curve historical charts, live DCF valuation modeling, and real-time earnings intelligence — without market noise.",
  "landing.hero.launchWorkspace": "Launch Workspace",
  "landing.hero.exploreScreener": "Open Screener",
  "landing.hero.commandSearch": "Search Tickers (⌘K)",
  "landing.hero.liveDataFeed": "Multi-provider live & fallback data feed",

  "landing.spotlight.title": "Interactive Ticker Spotlight",
  "landing.spotlight.subtitle":
    "Select a benchmark asset to preview historical light-curves and valuation metrics",
  "landing.spotlight.openStock": "Open Full Observatory →",
  "landing.spotlight.marketCap": "Market Cap",
  "landing.spotlight.revenue": "Revenue (TTM)",
  "landing.spotlight.fcf": "Free Cash Flow",
  "landing.spotlight.grossMargin": "Gross Margin",
  "landing.spotlight.pe": "P/E Ratio",
  "landing.spotlight.cagr3Y": "3Y Rev CAGR",
  "landing.spotlight.lightCurveLabel": "5-Year Revenue Light-Curve",

  "landing.earningsShowcase.badge": "Proactive Event Intelligence",
  "landing.earningsShowcase.title":
    "Upcoming Earnings Calendar & Wall St. Consensus",
  "landing.earningsShowcase.subtitle":
    "Track earnings reporting dates, consensus EPS/revenue estimates, and surprises filtered to your holdings.",
  "landing.earningsShowcase.openFull": "Open Full Earnings Calendar →",
  "landing.earningsShowcase.beforeOpen": "Before Open",
  "landing.earningsShowcase.afterClose": "After Close",
  "landing.earningsShowcase.beat": "BEAT",
  "landing.earningsShowcase.miss": "MISS",
  "landing.earningsShowcase.filterAll": "All Reporting",
  "landing.earningsShowcase.filterLarge": "Large Cap ($200B+)",
  "landing.earningsShowcase.filterWatchlist": "Watchlists Only",
  "landing.earningsShowcase.epsEst": "EPS Est",
  "landing.earningsShowcase.epsActual": "Actual EPS",
  "landing.earningsShowcase.revEst": "Revenue Est",
  "landing.earningsShowcase.revActual": "Actual Rev",

  "landing.dcfSandbox.badge": "Interactive Valuation Engine",
  "landing.dcfSandbox.title": "Instant Discounted Cash Flow Sandbox",
  "landing.dcfSandbox.subtitle":
    "Stress-test growth assumptions, multiples, and target discount rates with real-time intrinsic value computation.",
  "landing.dcfSandbox.fcfInput": "Base FCF ($B)",
  "landing.dcfSandbox.growthInput": "Expected 5Y Growth Rate (%)",
  "landing.dcfSandbox.multipleInput": "Terminal Exit Multiple (P/FCF)",
  "landing.dcfSandbox.discountInput": "Target Discount Rate (%)",
  "landing.dcfSandbox.sharesInput": "Shares Outstanding (B)",
  "landing.dcfSandbox.computedFairValue": "Estimated Fair Value",
  "landing.dcfSandbox.perShare": "(Per Share)",
  "landing.dcfSandbox.totalEnterpriseValue": "Total Enterprise Value:",
  "landing.dcfSandbox.marketPrice": "Market Price",
  "landing.dcfSandbox.upside": "Projected Margin of Safety",
  "landing.dcfSandbox.undervalued": "Undervalued",
  "landing.dcfSandbox.fairValue": "Fairly Valued",
  "landing.dcfSandbox.overvalued": "Overvalued",
  "landing.dcfSandbox.openDcfTool": "Open Full DCF Tool in Workspace →",
  "landing.dcfSandbox.openInCharts": "Open DCF Valuation in Charts →",

  "landing.features.badge": "The Instrument Suite",
  "landing.features.title": "Built for Deep Fundamental Research",
  "landing.features.subtitle":
    "Every metric treated like a variable star — charted over time, read for trajectory rather than instant price theater.",
  "landing.features.card1Title": "5-Year Statement Light-Curves",
  "landing.features.card1Desc":
    "Interactive income statements, balance sheets, and cash flows with instant quarterly vs annual switching and CAGR calculations.",
  "landing.features.card2Title": "Global Screener & Deep Filters",
  "landing.features.card2Desc":
    "Filter over 18,400+ assets across 10+ countries by asset type, sector, exchange, and primary listing status.",
  "landing.features.card3Title": "Curated Watchlists & Custom Universes",
  "landing.features.card3Desc":
    "Organize high-conviction ideas, monitor live scorecards, and track sector exposure across customizable lists.",
  "landing.features.card4Title": "Thematic Insights & Sector Heatmaps",
  "landing.features.card4Desc":
    "Explore pre-built thematic universes like S&P 500, Dividend Growth, Buyback Machines, and AI with live metrics.",
  "landing.features.card5Title": "Institutional Risk Analytics",
  "landing.features.card5Desc":
    "Sharpe ratio, Sortino ratio, IRR return models, and downside volatility metrics computed from synthetic cash flows.",
  "landing.features.card6Title": "Multi-Provider Resilience",
  "landing.features.card6Desc":
    "Zero-cost architecture with transparent provider fallbacks across Yahoo Finance, FMP, and AlphaVantage.",

  "landing.sectors.badge": "Sector Radar",
  "landing.sectors.title": "Market Macro & Sector Momentum",
  "landing.sectors.subtitle":
    "Quickly gauge capital flows across major market sectors",
  "landing.sectors.viewAllScreener": "View All 500+ Tickers in Screener →",

  "landing.shortcuts.badge": "Power User Workflow",
  "landing.shortcuts.title": "Observatory Keyboard Protocol",
  "landing.shortcuts.subtitle":
    "Designed for swift terminal-like keyboard efficiency",
  "landing.shortcuts.cmdK": "Open universal search and ticker command menu",
  "landing.shortcuts.key15":
    "Jump between Valuation, Profitability, and Balance metrics",
  "landing.shortcuts.keyQA":
    "Toggle between Quarterly and Annual statement history",
  "landing.shortcuts.keyLang":
    "Instant Hebrew / English language and RTL layout switch",

  "landing.cta.badge": "Start Researching Today",
  "landing.cta.title": "Elevate Your Fundamental Investment Workflow",
  "landing.cta.subtitle":
    "No paywalls, no login friction. Step into the observatory and read the fundamentals.",
  "landing.cta.launchNow": "Launch Vantage Workspace",
  "landing.cta.exploreWatchlists": "Explore Watchlists",

  // Slide-over
  "slideover.loading": "Loading data...",
  "slideover.error.title": "Failed to load data",
  "slideover.error.desc": "The API may be rate-limited",
  "slideover.key_ratios": "Key Ratios",
  "slideover.quick_stats": "Quick Stats",
  "slideover.about": "About",
  "slideover.view_full": "View full stock page",
  "slideover.after_hrs": "After hrs:",
  "slideover.peTtm": "P/E (TTM)",
  "slideover.peFwd": "P/E (Fwd)",
  "slideover.priceToBook": "P/B",
  "slideover.priceToSales": "P/S",
  "slideover.evToEbitda": "EV/EBITDA",
  "slideover.divYield": "Div Yield",
  "slideover.peg": "PEG",
  "slideover.beta": "Beta",

  // Command Menu (Search)
  "commandMenu.placeholder": "Search for a company or symbol (e.g. AAPL)...",
  "commandMenu.searching": "Searching database...",
  "commandMenu.noResults": 'No results found for "{{query}}".',
  "commandMenu.heading": "Stocks & Assets",

  // Screener
  "screener.title": "Market Screener",
  "screener.subtitle":
    "Discover and filter over {{total}} assets across global markets.",
  "screener.assetType": "Asset Type",
  "screener.sector": "Sector",
  "screener.country": "Country",
  "screener.moreCountries": "More Countries",
  "screener.scope": "Scope:",
  "screener.primaryListingsOnly": "Primary Listings Only",
  "screener.primaryListingsTooltip":
    "Toggle ON to exclude secondary exchange duplicates (e.g. AAPL.BA, TSLA.MI)",
  "screener.on": "ON",
  "screener.off": "OFF",
  "screener.resetFilters": "Reset Filters",
  "screener.assetType.stocks": "Stocks",
  "screener.assetType.etf": "ETF",
  "screener.assetType.index": "Index",
  "screener.assetType.crypto": "Crypto",
  "screener.assetType.fund": "Fund",
  "screener.assetType.currency": "Currency",
  "screener.assetType.moneyMarket": "Money Market",
  "screener.country.us": "US",
  "screener.country.canada": "Canada",
  "screener.country.japan": "Japan",
  "screener.country.germany": "Germany",
  "screener.country.uk": "UK",
  "screener.country.china": "China",
  "screener.country.india": "India",
  "screener.country.israel": "Israel",
  "screener.col.symbol": "Symbol",
  "screener.col.name": "Company Name",
  "screener.col.sector": "Sector",
  "screener.col.industry": "Industry",
  "screener.col.country": "Country",
  "screener.col.exchange": "Exchange",
  "screener.col.price": "Price",
  "screener.col.change": "Change",
  "screener.noResults": "No assets match the selected filters",
  "screener.loading": "Loading assets...",
  "screener.showingResults": "Showing {{start}} to {{end}} of {{total}} assets",
  "screener.prev": "Previous",
  "screener.next": "Next",
  "screener.pageOf": "Page {{page}} of {{totalPages}}",
  "screener.filterSearchPlaceholder": "Filter...",
  "screener.selectAll": "Select All",
  "screener.clear": "Clear",
  "screener.selectedCount": "{{count}} selected",

  // Live fundamental screener panel (additive to the metadata screener)
  "screenerFund.liveTitle": "Live Fundamental Filters",
  "screenerFund.liveSubtitle":
    "Screen on live Yahoo-sourced metrics — pick market-cap bands and set numeric ranges. Each ticker is cached row-by-row; the fan-out never touches the FMP budget.",
  "screenerFund.run": "Screen",
  "screenerFund.running": "Screening…",
  "screenerFund.reset": "Reset",
  "screenerFund.marketCap": "Market Cap",
  "screenerFund.min": "Min",
  "screenerFund.max": "Max",
  "screenerFund.matches": "{{count}} matches from {{scanned}} candidates",
  "screenerFund.noRun": "Set at least one metric range (or pick cap bands) and press Screen.",
  "screenerFund.noMatches": "No assets pass the live filters.",
  "screenerFund.rateLimited":
    "Yahoo didn't respond for most candidates. Live filters are temporarily unavailable — try again in a few minutes.",
  "screenerFund.unavailable": "Live filters unavailable",
  "screenerFund.source": "Yahoo",
  "screenerFund.scanned": "{{scanned}} candidates scanned",
  "screenerFund.metric.pe": "P/E",
  "screenerFund.metric.pb": "P/B",
  "screenerFund.metric.peg": "PEG",
  "screenerFund.metric.evEbitda": "EV/EBITDA",
  "screenerFund.metric.evSales": "EV/Sales",
  "screenerFund.metric.dividendYield": "Div. Yield",
  "screenerFund.metric.grossMargin": "Gross Margin",
  "screenerFund.metric.netMargin": "Net Margin",
  "screenerFund.metric.operatingMargin": "Op. Margin",
  "screenerFund.metric.roe": "ROE",
  "screenerFund.metric.roa": "ROA",
  "screenerFund.metric.currentRatio": "Current Ratio",
  "screenerFund.metric.debtEquity": "Debt/Equity",
  "screenerFund.metric.fcfYield": "FCF Yield",
  "screenerFund.unit.x": "×",
  "screenerFund.unit.percent": "%",

  // Earnings alerts (topBar slide-down — global, not page-scoped)
  "earningsAlerts.open": "Open",
  "earningsAlerts.snooze": "Snooze",
  "earningsAlerts.dismiss": "Dismiss",
  "earningsAlerts.historyTitle": "Today's earnings",
  "earningsAlerts.historyEmpty": "No alerts today.",
  "earningsAlerts.historyCount_one": "1 alert",
  "earningsAlerts.historyCount_other": "{{count}} alerts",
  "earningsAlerts.historyAction.opened": "Opened",
  "earningsAlerts.historyAction.snoozed": "Snoozed",
  "earningsAlerts.historyAction.dismissed": "Dismissed",
  "earningsAlerts.timeUntilNow": "now",
  "earningsAlerts.timeUntilMinutes_one": "in {{count}} min",
  "earningsAlerts.timeUntilMinutes_other": "in {{count}} min",
  "earningsAlerts.timeUntilHours_one": "in {{count}}h",
  "earningsAlerts.timeUntilHours_other": "in {{count}}h",
  "earningsAlerts.timeUntilDays_one": "in {{count}}d",
  "earningsAlerts.timeUntilDays_other": "in {{count}}d",

  // Language
  "language.en": "English",
  "language.he": "עברית",

  // Provider health indicator
  "providerHealth.title": "Data provider status",
  "providerHealth.outage": "Market data outage",
  "providerHealth.degraded": "Degraded",
  "providerHealth.notConfigured": "Not configured",
  "providerHealth.affected": "Affected: {{providers}}",
  "providerHealth.knownRestriction": "Free-tier limitations",
  "providerHealth.docsLink": "Provider docs",
  "providerHealth.feature.quote": "Quote",
  "providerHealth.feature.batchQuote": "Batch quotes",
  "providerHealth.feature.chart": "Chart",
  "providerHealth.chartDownHint":
    "Yahoo chart history is down — this data may be stale",
  "providerHealth.batchFallback": "Yahoo fallback",
  "providerHealth.batchFallbackTooltip":
    "Batch quotes are paid-gated on this plan — each price is fetched per-symbol via Yahoo",
  "providerHealth.barTitle": "Data Feeds",
  "providerHealth.allHealthy": "All Data Feeds Operational",
  "providerHealth.fallbackActive": "Live Fallback Active (Zero Downtime)",
  "providerHealth.viewDetails": "View Diagnostics",
  "providerHealth.hideDetails": "Hide",
  "providerHealth.modalTitle": "Data Provider Diagnostics & Fallback Routing",
  "providerHealth.modalSubtitle":
    "Real-time health telemetry across all market data feeds, daily quota limits, and automated failover pipelines.",
  "providerHealth.status.ok": "Operational",
  "providerHealth.status.degraded": "Degraded · Fallback Active",
  "providerHealth.status.down": "Outage",
  "providerHealth.status.knownRestriction": "Free Tier Limit",
  "providerHealth.status.notConfigured": "Not Configured",
  "providerHealth.yahooDesc":
    "Primary keyless real-time quote feed, intraday/historical charts, and fundamental ratios fallback.",
  "providerHealth.fmpDesc":
    "5-year audited financial statements, balance sheets, DCF inputs, and insider transactions.",
  "providerHealth.alphavantageDesc":
    "Secondary macro time-series and supplementary quote redundancy.",
  "providerHealth.fallbackEngagedNote":
    "FMP free-tier quota (250 req/day) is rate-limited — Vantage is transparently routing quotes & financial metrics through Yahoo Finance with zero interruption.",
  "providerHealth.recheck": "Re-probe Feeds",
  "providerHealth.latency": "Latency",
  "providerHealth.lastChecked": "Checked: {{time}}",

  // Footer usage pills (live API-call counts vs free-tier limits)
  "usage.footerLabel": "API usage",
  "usage.title": "API limits",
  "usage.usedOfLimit": "{{used}} / {{limit}}",
  "usage.usedOfLimitDay": "{{used}} / {{limit}} today",
  "usage.remainingOfLimit": "{{remaining}} / {{limit}} left",
  "usage.remainingOfLimitDay": "{{remaining}} / {{limit}} left (today)",
  "usage.modeToggle.label": "Display mode",
  "usage.modeToggle.used": "Used",
  "usage.modeToggle.remaining": "Remaining",
  "usage.unknownReset": "no reset timer",
  "usage.resetNow": "resets now",
  "usage.resetInMinutes": "resets in {{minutes}}m",
  "usage.resetInHours": "resets in {{hours}}h",
  "usage.resetOver24h": "resets >24h",
  "usage.rateLimited": "rate-limited right now",
  "usage.heuristic": "approx.",
  "usage.heuristicTooltip":
    "Yahoo's documented rate limit doesn't exist on the keyless path — this is an approximate budget (≈200/hr).",
  "usage.singleInstanceNote":
    "Per-process counter — may differ from the provider's dashboard across restarts.",
  "usage.crossInstanceNote":
    "Counter tracks this Vantage process only; long-running deployments may diverge.",

  // Third-party attribution links (free-tier requirement)
  "attribution.logoDev": "Logos by Logo.dev",
  "attribution.logoDevAria":
    "Company logos provided by Logo.dev (opens in new tab)",
};

// Re-exported so tests can verify the dictionary snapshots without a second import.
export const enDict = en;

const he: Record<string, string> = {
  // Common
  "app.name": "Vantage",
  loading: "טוען...",
  "error.generic": "משהו השתבש",
  "source.yahoo": "Yahoo Finance",
  "source.fmp": "FMP",
  "source.alphavantage": "AlphaVantage",
  "source.finnhub": "Finnhub",

  // Route-level lazy-chunk fallback
  "route.loading": "טוען עמוד…",

  "nav.insights": "תובנות",
  "nav.screener": "סורק",
  "nav.watchlists": "רשימות מעקב",
  "nav.charts": "גרפים",
  "nav.earnings": "דוחות",
  "nav.portfolios": "תיקים",

  "topBar.indicesDow": "Dow",
  "topBar.indicesSp500": "S&P 500",
  "topBar.indicesNasdaq": "נאסדק",

  "common.change": "שינוי",
  "common.date": "תאריך",
  "common.name": "שם",
  "common.price": "מחיר",
  "common.pricePerShare": "מחיר למניה",
  "common.marketClose": "נעילה",
  "common.shares": "מניות",
  "common.sharesUnit": "מניות",
  "common.search": "חיפוש",
  "common.symbol": "סימבול",
  "common.transacted": "בוצע",
  "common.type": "סוג",
  "common.value": "ערך",
  "insider.administrative": "מנהלי",
  "insider.reportedPrice": "מחיר העסקה המדווח",
  "insider.priceUnavailable": "המחיר לא דווח על ידי הספק",
  "insider.derivedValue": "הערך חושב לפי מחיר מדווח × מספר מניות",
  "insider.marketCloseContext": "מחיר הנעילה ביום העסקה; אינו מחיר הביצוע",
  "common.usd": "דולר אמריקאי",
  "common.ils": "שקל חדש",
  "common.eur": "אירו",
  "common.gbp": "לירה שטרלינג",

  "index.change": "שינוי:",
  "index.earnings": "רווחים:",
  "index.financialMetricsTitle": "מדדים פיננסיים",
  "index.metricsUnavailable": "המדדים לא זמינים עבור {{ticker}}",
  "index.metricsRetry": "נסה שוב",
  // Appears under "Metrics unavailable …" when the provider-health probe
  // shows FMP is degraded/down. The free tier's 250-call daily cap means
  // a 429 here is almost always the budget, not the request. {{hours}} is
  // an estimate (FMP's window appears to be a rolling 24h) — we report a
  // bounded range ("1–24") so a long-quiet probe can't read as 0. Hebrew
  // sits inside LTR-safe braces for the number so dir="ltr" alignment
  // survives the RTL page.
  "index.metricsRateLimited":
    'מכסת ה-FMP היומית בתוכנית החינמית הסתיימה — רענון המדדים יחודש בעוד כ-{{hours}} שעות. לחיצה על "נסה שוב" כנראה לא תעזור עד אז.',
  // Variant shown when the probe hasn't ticked yet (e.g. first paint).
  "index.metricsRateLimitedUnknownReset":
    "מכסת ה-FMP היומית בתוכנית החינמית אולי הסתיימה — נסה שוב מאוחר יותר. שערים וגרפים חיים אינם מושפעים.",
  // ── Yahoo fallback path (FMP rate-limited) ───────────────────────────────
  // Compact 4-card snapshot swap with a per-card chip so users can tell at a
  // glance that the values are single-point estimates (not a YoY/CAGR series).
  // The chip stays identical in EN + HE because the value identity is what
  // matters; the longer tooltip explanation flips naturally into Hebrew.
  "index.metricsYahooFallbackChip": "הערכת Yahoo",
  "index.metricsYahooFallbackTitle":
    "הערכת Yahoo חיה — מכסת ה-FMP היומית בתוכנית החינמית הסתיימה, מוצגים ערכי TTM/הערכה נקודתיים במקום רשת 8 הכרטיסים YoY/CAGR.",
  "index.qualityInBrief": "איכות בקצרה",
  "index.analystOutlookRange": "תחזית אנליסטים וטווח",
  "index.targetEps": "יעד רווח למניה",
  "index.52wLow": "52 שבועות נמוך",
  "index.52wHigh": "52 שבועות גבוה",
  "index.avg50Day": "ממוצע 50 ימים",
  "index.avg200Day": "ממוצע 200 ימים",
  "index.epsEstCurrQtr": "הערכת רווח (רבעון נוכחי)",
  "index.revenueEstAvg": "הערכת הכנסות (ממוצע)",
  "index.unavailableApi": "נתוני השוק אינם זמינים כרגע. נסה שוב בעוד רגע.",
  "index.viewMore": "הצג עוד",
  "index.news1":
    "הכנסות הרבעון עלו על ציפיות האנליסטים, בהובלת צמיחה ב-<strong>שירותים</strong>.",
  "index.news2":
    "ההנהלה העלתה את <strong>התחזית לשנה המלאה</strong> בעקבות ביקוש חזק מהצפוי.",

  "chart.download": "הורד CSV",
  "chart.yoy1Y": "שנה אחרונה YoY",
  "chart.cagr3Y": "CAGR 3 שנים",
  "chart.cagr5Y": "CAGR 5 שנים",
  "chart.descYoY": "12 החודשים האחרונים מול השנה הקודמת.",
  "chart.descCagr3Y": "שיעור צמיחה שנתי מורכב, 3 שנים אחרונות.",
  "chart.descCagr5Y": "שיעור צמיחה שנתי מורכב, 5 שנים אחרונות.",
  // בורר שנתי/רבעוני על מודל גרף המדדים. עמודות Q1 FY 2025 במקום FY 2025;
  // חלונות CAGR צועדים אחורה 4/12/20 שורות.
  "chart.yearly": "שנתי",
  "chart.quarterly": "רבעוני",
  "chart.granularity": "רמת פירוט",
  "chart.timeframe": "חלון זמן",
  "chart.annualHint": "עמודה אחת לשנת כספים (ברירת מחדל).",
  "chart.quarterlyHint":
    "עמודה אחת לרבעון (Q1–Q4); חלונות CAGR מתרחבים ל-4/12/20 רבעונים.",
  "chart.descYoYQuarter": "הרבעון האחרון לעומת אותו רבעון בשנה הקודמת.",
  "chart.descCagr3YQuarter":
    "CAGR רבעוני על פני 12 הרבעונים האחרונים (מתועל לשנה).",
  "chart.descCagr5YQuarter":
    "CAGR רבעוני על פני 20 הרבעונים האחרונים (מתועל לשנה).",
  "chart.period": "תקופה",
  "chart.value": "ערך",
  "chart.yoy": "צמיחה שנתית",
  // רשת הגרפים בסטייל Stocknest: לשוניות תדירות + מתג YoY + ניווט.
  "chart.annual": "שנתי",
  "chart.ttm": "TTM",
  "chart.yoyToggle": "YoY %",
  "chart.expand": "הגדלת גרף",
  "chart.prevMetric": "מדד קודם",
  "chart.nextMetric": "מדד הבא",
  "chart.segmentQuarterlyUnavailable":
    "נתוני מגזרים רבעוניים אינם זמינים עבור סמל זה — מציג שנתי.",
  "chart.segmentNoSelection": "בחר לפחות מגזר אחד להצגה.",
  // סה"כ בגרף המגזרים הערוך (הכנסות לפי מגזר).
  "chart.total": 'סה"כ',

  // Stock fundamentals strip (Index.tsx real-data grid) — עברות כותרות
  // הקבוצות ושמות המדדים; הערכים המספריים נשארים LTR (dir="ltr" על אלמנט הערך).
  "fundamentals.group.valuation": "הערכת שווי",
  "fundamentals.group.cashFlow": "תזרים מזומנים",
  "fundamentals.group.marginsGrowth": "שולי רווח וצמיחה",
  "fundamentals.group.balance": "מאזן",
  "fundamentals.group.dividend": "דיבידנד",
  "fundamentals.marketCap": "שווי שוק",
  "fundamentals.pe": "מכפיל רווח (TTM)",
  "fundamentals.priceToSales": "יחס מחיר למכירות",
  "fundamentals.evToEbitda": "EV ל-EBITDA",
  "fundamentals.priceToBook": "יחס מחיר לערך בספרים",
  "fundamentals.pcf": 'מחיר/ת"מ',
  "fundamentals.pfcf": 'מחיר/תמ"ש',
  "fundamentals.fcfYield": "תשואת FCF",
  "fundamentals.profitMargin": "שולי רווח נקי",
  "fundamentals.operatingMargin": "שולי רווח תפעילי",
  "fundamentals.roic": "תשואה על ההון המושקע",
  "fundamentals.cash": "מזומנים",
  "fundamentals.debt": "חוב",
  "fundamentals.netDebt": "חוב נטו",
  "fundamentals.dividendYield": "תשואת דיבידנד",
  "fundamentals.payoutRatio": "יחס חלוקה",
  "fundamentals.payoutDate": "תאריך חלוקה",
  "fundamentals.pcfFull": 'מחיר לתזרים מזומנים (ת"מ)',
  "fundamentals.pfcfFull": 'מחיר לתזרים מזומנים חופשי (ת"מ)',
  "fundamentals.fcfFull": "תזרים מזומנים חופשי",
  "fundamentals.unavailable": "לא זמין",
  "fundamentals.premiumBadge": "פרימיום",
  "fundamentals.unavailableTitle":
    "{{label}} אינו זמין בתוכנית החינמית — מסופק על ידי נקודות קצה פרימיום של FMP (ratios-ttm / key-metrics-ttm).",
  "fundamentals.premiumTitle":
    "{{label}} הוא מדד Vantage פרימיום (נקודת קצה פרימיום של FMP).",

  // Availability badges (Hebrew) — same labels as English, lock before "Pro".
  "availability.pro": "Pro",
  "availability.proTitle":
    "{{label}} זמין למנויים בתשלום בלבד אצל הספק — לא נגיש בשום מסלול חינמי.",
  "availability.rateLimited": "מוגבל",
  "availability.rateLimitedTitle":
    "{{label}} זמין בחינם אך מכסת הבקשות החינמית נוצלה (מוגבל קצב). נסה שוב בקרוב.",
  "availability.calcBroken": "חישוב",
  "availability.calcBrokenTitle":
    "{{label}} מחושב ממספר נתונים וחסר אחד מהם, כך שהחישוב לא יכול להשלים.",
  "availability.stale": "מיושן",
  "availability.staleTitle":
    "{{label}} מגיע ממטמון מטמון ועשוי להיות לא עדכני.",
  "availability.notFound": "שגיאה",
  "availability.notFoundTitle":
    "{{label}} לא התקבל — אין נקודת קצה, 404, או שגיאת ספק.",
  "availability.nullByDesign": "ללא",
  "availability.nullByDesignTitle": "{{label}} לא מדווח עבור הכלי הזה.",
  "availability.unknown": "—",
  "availability.unknownTitle": "{{label}} אינו זמין.",

  // PricingModal (placeholder). Triggers from the Upgrade CTA beside
  // the locked chip / banner.
  "pricing.title": "Vantage פרימיום",
  "pricing.subtitle": "תכונת פרימיום נעולה — טופס הרשמה זמני",
  "pricing.revenueSegmentsBody":
    "השבב הנעול שלחצת עליו נמצא מאחורי מסלול Vantage פרימיום. כרגע מכסת ה-FMP היומית הסתיימה (או שלא הוגדר מפתח FMP) — פילוח הכנסות לפי מגזר, רבעוניות מלאה וכיסוי היסטורי ללא הגבלה זמינים בפרימיום.",
  "pricing.genericBody":
    "תכונה זו היא חלק מ-Vantage פרימיום. הכיסוי בתוכנית החינמית מספיק למדדי הכותרת, אבל היסטוריה ללא הגבלה, פילוח לפי מוצר, התראות מותאמות אישית וכלי DCF זמינים רק בפרימיום.",
  "pricing.bulletSegments": "פילוח הכנסות לפי מוצר עם רבעוניות מלאה",
  "pricing.bulletHistory": "דוחות כספיים היסטוריים ללא הגבלה לכל תקופת דיווח",
  "pricing.bulletAlerts": "התראות מותאמות אישית כשמדד חוצה סף שהגדרת",
  "pricing.placeholderNote":
    "התמחור עדיין לא פעיל — כפתורים אלה הם מסגרות. נחבר תשלום אמיתי כשהחיוב ייצא לדרך.",
  "pricing.close": "סגור",
  "pricing.notifyMe": "תודיעו לי כשזה יוצא",
  "pricing.contactSales": "דברו עם מכירות",

  "dcf.eyebrow": "מנוע הערכת שווי אינטראקטיבי",
  "dcf.sandboxTitle": "סימולטור DCF מהיר לתזרים מזומנים מהוון",
  "dcf.sandboxSubtitle":
    "בדוק הנחות צמיחה, מכפילים ויעדי תשואה בחישוב ערך מהותי בזמן אמת.",
  "dcf.openFullTool": "פתח כלי DCF מלא במרחב המחקר ←",
  "dcf.title": "הערכת שווי DCF",
  "dcf.sandboxTab": "סימולטור אינטראקטיבי",
  "dcf.trajectoryTab": "מסלול צמיחה ל-5 שנים",
  "dcf.earningsMode": "מצב רווחים",
  "dcf.cashFlowMode": "מצב תזרים",
  "dcf.mode": "מצב:",
  "dcf.targetPct": "יעד %:",
  "dcf.valueTrajectoryTitle": "מסלול צמיחת ערך ומדדים ל-5 שנים",
  "dcf.terminalExitPrice": "מחיר יציאה סופי: ${{price}}",
  "dcf.targetStockPrice": "מחיר מניה משוער",
  "dcf.fcfBillions": "תזרים חופשי (מיליארד $)",
  "dcf.earningsBillions": "רווח נקי (מיליארד $)",
  "dcf.currentPriceLegend": "מחיר נוכחי",
  "dcf.baseFcf": "תזרים חופשי בסיסי (מיליארד $)",
  "dcf.baseEarnings": "רווח נקי בסיסי (מיליארד $)",
  "dcf.growthRate5Y": "שיעור צמיחה חזוי ל-5 שנים (%)",
  "dcf.exitMultiple": "מכפיל יציאה (P/FCF)",
  "dcf.exitMultiplePcf": "מכפיל יציאה (P/FCF)",
  "dcf.exitMultiplePe": "מכפיל יציאה (P/E)",
  "dcf.discountRate": "תשואת יעד / שיעור היוון (%)",
  "dcf.estimatedFairValue": "שווי הוגן מחושב",
  "dcf.fairlyValued": "שווי הוגן",
  "dcf.undervalued": "מתחת לשווי (הזדמנות)",
  "dcf.overvalued": "מעל השווי",
  "dcf.marketPrice": "מחיר שוק נוכחי",
  "dcf.marginOfSafety": "מרווח ביטחון צפוי",
  "dcf.modelFullFinancials": "בנה מודל דוחות מלא במרחב המחקר ←",
  "dcf.currentEarnings": "רווח נוכחי",
  "dcf.growthRate": "קצב צמיחה",
  "dcf.multiple": "מכפיל",
  "dcf.forward": "תשואה צפויה ב-5 שנים",
  "dcf.basedOnCurrentPrice": "מבוסס על מחיר נוכחי של ",
  "dcf.reverse": "מחיר קנייה ליעד תשואה של {{target}}%",
  "dcf.targetingReturn":
    "מכוון לתשואה שנתית של {{target}}% (מכפיל יציאה נדרש: {{multiple}}x).",
  "dcf.projectedPrice": "מחיר צפוי",

  // DCF Tooltips
  "dcf.tooltip.cashFlowMode":
    "הערכת שווי מבוססת תזרים מזומנים חופשי (תזרים מפעילות פחות השקעות הון). מומלץ לחברות רווחיות ומייצרות מזומנים.",
  "dcf.tooltip.earningsMode":
    "הערכת שווי מבוססת רווח נקי חשבונאי (GAAP). מתאים לחברות בוגרות או פיננסים שבהם תזרים חופשי פחות מייצג.",
  "dcf.tooltip.baseFcf":
    "תזרים מזומנים חופשי שנתי התחלתי במיליארדי דולרים, מתוך הדוח הכספי המבוקר האחרון.",
  "dcf.tooltip.baseEarnings":
    "רווח נקי שנתי התחלתי במיליארדי דולרים, מתוך דוח רווח והפסד האחרון.",
  "dcf.tooltip.growthRate":
    "שיעור צמיחה שנתי חזוי לתזרים או לרווחים ב-5 השנים הקרובות.",
  "dcf.tooltip.exitMultiplePcf":
    "מכפיל מחיר לתזרים (P/FCF) שישמש לחישוב שווי המניה בסוף השנה החמישית.",
  "dcf.tooltip.exitMultiplePe":
    "מכפיל מחיר לרווח (P/E) שישמש לחישוב שווי המניה בסוף השנה החמישית.",
  "dcf.tooltip.discountRate":
    "שיעור ההיוון / תשואת המינימום הנדרשת להיוון תזרימי העתיד לערכם הנוכחי.",
  "dcf.tooltip.fairValue":
    "שווי הוגן פנימי למניה: (סכום התזרימים המהוונים ל-5 שנים + ערך סופי מהוון) ÷ מספר מניות מדוללות.",
  "dcf.tooltip.marginOfSafety":
    "הפער בין השווי ההוגן למחיר השוק. פער חיובי מצביע על מניה הנסחרת בהנחה (מתחת לשוויה).",
  "dcf.tooltip.forwardReturn":
    "תשואה שנתית מורכבת (IRR) צפויה ממחיר השוק הנוכחי למחיר היעד בשנה 5.",
  "dcf.tooltip.targetBuyPrice":
    "מחיר הקנייה המרבי המומלץ היום כדי להגיע ליעד התשואה השנתי שהגדרת.",
  "dcf.tooltip.trajectoryChart":
    "מסלול צמיחה שנתי המציג את הגידול בתזרים/רווח ואת מחירי המניה המשוערים לכל שנה.",
  "dcf.tooltip.terminalExitPrice":
    "מחיר מניה משוער בשנה 5 לפי מכפיל היציאה והתזרים החזוי.",

  // Sensitivity Matrix
  "dcf.sensitivityTitle": "מטריצת רגישות שווי דו-ממדית",
  "dcf.sensitivitySubtitle":
    "מטריצת מבחן לחץ מוסדית המשווה 25 תרחישי תמחור מול מחיר השוק הנוכחי.",
  "dcf.sensitivityTooltip":
    "מעריכה שווי הוגן פנימי מול שילובי עלות הון (WACC) והנחות צמיחה/מכפיל יציאה. לחיצה על תא מעדכנת את הסליידרים מיד.",
  "dcf.dimensionGrowth": "WACC × שיעור צמיחה",
  "dcf.dimensionMultiple": "WACC × מכפיל יציאה",
  "dcf.sensitivityClickHint":
    "לחץ על כל תא כדי להחיל את תרחיש התמחור על מחשבון ה-DCF.",
  "dcf.viewSensitivityMatrix": "מטריצת רגישות",

  // Reverse DCF Engine
  "dcf.reverseDcfTitle": "מפענח ציפיות שוק (Reverse DCF)",
  "dcf.reverseDcfSubtitle":
    "מחשב את קצב הצמיחה ל-5 שנים המגולם במחיר השוק הנוכחי.",
  "dcf.reverseDcfTooltip":
    "הופך את נוסחת ה-DCF כדי לגלות מה קצב הצמיחה הנדרש להצדקת מחיר השוק. השוואה זו מראה האם השוק דורש שלמות או מתמחר בחסר.",
  "dcf.marketImpliedGrowth": "קצב צמיחה שנתי מגולם בשוק",
  "dcf.userAssumedGrowth": "הנחת העבודה שלך",
  "dcf.expectationDelta": "מרווח ציפיות",
  "dcf.impliedTerminalMetric": "תזרים/רווח נדרש בשנה 5",
  "dcf.applyImpliedToSandbox": "החל צמיחה מגולמת על ה-DCF",
  "dcf.viewReverseDcf": "Reverse DCF",
  "dcf.regimeHyper": "תמחור אגרסיבי / דורש שלמות",
  "dcf.regimeHigh": "צפי לצמיחה מהירה",
  "dcf.regimeModerate": "צפי לצמיחה מתונה",
  "dcf.regimeLow": "צפי לצמיחה נמוכה",
  "dcf.regimeContraction": "השוק מגלם נסיגה/התכווצות",
  "dcf.headroomDescription":
    "אתה צופה צמיחה גבוהה ב-{{spread}}% מציפיות השוק (כרית ביטחון).",
  "dcf.deficitDescription":
    "מחיר השוק דורש צמיחה גבוהה ב-{{spread}}% מהנחת העבודה שלך.",
  "dcf.basedOnPriceAndWacc": "מבוסס על מחיר ${{price}} ו-WACC של {{wacc}}%",
  "dcf.currentSandboxSetting": "הגדרה נוכחית בסנדבוקס",
  "dcf.growthHeadroom": "כרית צמיחה (עודף)",
  "dcf.growthDeficit": "גירעון צמיחה (חסר)",
  "dcf.netIncomeBase": "רווח נקי",
  "dcf.fcfBase": "תזרים חופשי",

  // Charts page
  "charts.dayRange": "טווח יומי",
  "charts.weekRange": "טווח 52 שבועות",
  "charts.aboveMidpoint": "מעל נקודת האמצע · +${{amount}}",
  "charts.belowMidpoint": "מתחת לנקודת האמצע · −${{amount}}",
  "charts.searchPlaceholder": "חפש סימול מניה או חברה...",
  "charts.searchingStocks": "מחפש מניות...",
  "charts.searchError": "החיפוש אינו זמין כעת",
  "charts.noMatchingStocks":
    'לא נמצאו מניות תואמות. הקש Enter לטעינת "{{query}}".',
  "charts.quickLabel": "מהיר:",
  "charts.vol": "מחזור: {{amount}}M",
  "charts.inRange": "{{percent}}% בטווח",
  "charts.clearSearch": "נקה חיפוש",
  "charts.midpointTitle": "נקודת אמצע (50%)",
  "charts.low": "נמוך",
  "charts.mid": "אמצע: ${{amount}}",
  "charts.high": "גבוה",
  "charts.dcfGuidance":
    "התאם את תשומות ההכנסה / צמיחה / מכפיל כדי לדמות תרחישים. תשואה צפויה מניחה השקעה חוזרת והמכפיל נשאר קבוע — DCF אמיתי מנכה תזרימי מזומנים עתידיים ב-WACC, לא במכפילים, אז התייחס לווידג'ט הזה כחישוב גס.",

  "dipFinder.title": "מחפש הנחות (מרחק מ-SMA)",
  "dipFinder.liveBadge": "חי",
  "dipFinder.partialBadge": "חלקי",
  "dipFinder.mockBadge": "לדוגמה",
  "dipFinder.loading": "טוען מרחקי SMA חיים...",
  "dipFinder.upcomingEarnings": "דוחות קרובים",
  "dipFinder.news": "חדשות אחרונות",
  "dipFinder.20day": "SMA 20 ימים",
  "dipFinder.50day": "SMA 50 ימים",
  "dipFinder.100day": "SMA 100 ימים",
  "dipFinder.150day": "SMA 150 ימים",
  "dipFinder.200day": "SMA 200 ימים",

  // Earnings calendar
  "earningsCalendar.eyebrow": "מודיעין אירועים יזום",
  "earningsCalendar.title": "יומן דוחות קרובים וקונצנזוס וול סטריט",
  "earningsCalendar.subtitle":
    "עקוב אחר תאריכי דיווח, תחזיות רווח והכנסות של האנליסטים והפתעות ביצועים מסוננות לאחזקות שלך.",
  "earningsCalendar.openFull": "פתח יומן דוחות מלא ←",
  "earningsCalendar.viewGrid": "תצוגת כרטיסים",
  "earningsCalendar.viewCalendar": "עמודות שבועיות",
  "earningsCalendar.dataSource":
    "מקור: Financial Modeling Prep (FMP) וקונצנזוס Yahoo Finance",
  "earningsCalendar.sourceLive": "קונצנזוס FMP ו-Yahoo",
  "earningsCalendar.sourceMock": "נתוני הדגמה",
  "earningsCalendar.allReporting": "כל המדווחות",
  "earningsCalendar.watchlistsOnly": "רשימות מעקב בלבד",
  "earningsCalendar.watchlist": "רשימת מעקב",
  "earningsCalendar.watchlistLockedByFocus":
    "הסינון נעול בעת צפייה בהתראה ממוקדת",
  "earningsCalendar.adjustFiltersHint":
    "התאם את מסנני רשימת המעקב או שווי השוק כדי להרחיב את טווח האירועים.",
  "earningsCalendar.marketClose": "סגירת המסחר",
  "earningsCalendar.unknownTiming": "שעה לא צוינה",
  "earningsCalendar.beat": "הכה",
  "earningsCalendar.miss": "פספס",
  "earningsCalendar.viewStock": "צפה ←",
  "earningsCalendar.preMarket": "לפני המסחר (BMO)",
  "earningsCalendar.afterHours": "לאחר הסגירה (AMC)",
  "earningsCalendar.actual": "בפועל:",
  "earningsCalendar.actualEps": "EPS בפועל",
  "earningsCalendar.afterClose": "אחרי הסגירה",
  "earningsCalendar.beforeOpen": "לפני הפתיחה",
  "earningsCalendar.epsEst": "EPS צפוי:",
  "earningsCalendar.filterByWatchlist": "סנן לפי רשימת מעקב",
  "earningsCalendar.marketCap": "שווי שוק",
  "earningsCalendar.marketCapAll": "כל הגדלים",
  "earningsCalendar.marketCapLarge": "גדול ($10B+)",
  "earningsCalendar.marketCapMid": "בינוני ($2B+)",
  "earningsCalendar.marketCapSmall": "קטן (<$2B)",
  "earningsCalendar.mon": "ב'",
  "earningsCalendar.tue": "ג'",
  "earningsCalendar.wed": "ד'",
  "earningsCalendar.thu": "ה'",
  "earningsCalendar.fri": "ו'",
  "earningsCalendar.nextWeek": "שבוע הבא",
  "earningsCalendar.noEventsThisWeek": "אין אירועי דוחות השבוע.",
  "earningsCalendar.prevWeek": "שבוע קודם",
  "earningsCalendar.revEst": "הכנסה צפויה:",
  "earningsCalendar.showing_one": "{{count}} אירוע דוחות השבוע",
  // _two uses the spelled-out "שני" prefix; modern Hebrew dispenses with the
  // grammatical dual but written-form "שני" reads naturally for "exactly 2".
  "earningsCalendar.showing_two": "שני אירועי דוחות השבוע",
  "earningsCalendar.showing_other": "{{count}} אירועי דוחות השבוע",
  "earningsCalendar.today": "היום",
  "earningsCalendar.weekOf": "שבוע של {{range}}",

  "insights.title": "תובנות",
  "insights.search_placeholder": "חיפוש לפי סימבול או שם חברה...",
  "insights.filter.all_sectors": "כל הענפים",
  "insights.filter.all_caps": "כל הגדלים",
  "insights.filter.mega": "ענק $200B+",
  "insights.filter.large": "גדול $10B+",
  "insights.filter.mid": "בינוני $2B+",
  "insights.filter.small": "קטן <$2B",
  "insights.filter.all_moves": "כל התנועות",
  "insights.filter.gainers": "עליות >+1%",
  "insights.filter.losers": "ירידות <-1%",
  "insights.filter.big_movers": "תנודות >±5%",
  "insights.filter.flat": "יציב ±0.5%",
  "insights.filter.clear": "נקה",
  "insights.filter.stocks_of": "{{filtered}} מתוך {{total}} מניות",
  "insights.spotlight.title": "תמונה ענפית",
  "insights.loading": "טוען נתונים חיים מ-Yahoo Finance...",
  "insights.error.title": "טעינת נתוני המניות נכשלה",
  "insights.error.desc":
    "ייתכן ש-API של Yahoo Finance הוגבל. נסה שוב בעוד רגע.",
  "insights.empty.title": "אין מניות שתואמות לסינון",
  "insights.empty.desc": "נסה לשנות את מונחי החיפוש או הסינון",
  "insights.empty.clear": "נקה את כל הסינונים",
  "insights.market_cap": "שווי שוק:",
  "insights.marketCap": "שווי שוק",

  "insights.tabs.sp500": "S&P 500",
  "insights.tabs.trending": "הכי חם",
  "insights.tabs.growth": "צמיחה",
  "insights.tabs.dividend": "דיבידנד",
  "insights.tabs.buyback": "רכישה חוזרת",
  "insights.tabs.ai": "בינה מלאכותית",
  "insights.tabs.cloud": "ענן",
  "insights.tabs.ev": "רכב חשמלי",
  "insights.tabs.leisure": "בידור ופנאי",

  // Insight metric names (real-data path from Index.tsx)
  "insights.stockPrice": "מחיר מניה",
  "insights.revenue": "הכנסות",
  "insights.ebitda": "EBITDA",
  "insights.grossProfit": "רווח גולמי",
  "insights.grossProfitMargin": "שולי רווח גולמי",
  "insights.operatingIncome": "רווח תפעולי",
  "insights.operatingCashFlow": "תזרים מפעילות שוטפת",
  "insights.netIncome": "רווח נקי",
  "insights.eps": "EPS",
  "insights.cashAndEquivalents": "מזומנים ושווי מזומנים",
  "insights.totalAssets": "סך נכסים",

  // Metric names (mock-data path from mockData.ts)
  "metrics.revenue": "הכנסות",
  "metrics.revenueBySegment": "הכנסות לפי מגזר",
  "metrics.ebitda": "EBITDA",
  "metrics.grossProfit": "רווח גולמי",
  "metrics.operatingIncome": "רווח תפעולי",
  "metrics.netIncome": "רווח נקי",
  "metrics.cashEquivalents": "מזומנים ושווי מזומנים",
  "metrics.freeCashFlow": "תזרים חופשי",
  "metrics.shareholdersEquity": "הון עצמי",
  "metrics.totalAssets": "סך נכסים",
  "metrics.marketCap": "שווי שוק",
  "metrics.eps": "EPS",

  // פילוח הכנסות לפי מגזר (FMP revenue-product-segmentation). `locked` הוא
  // תווית השבב המוצגת כשמכסת התוכנית החינמית הסתיימה; הטקסט המוקפץ מסביר
  // מדוע מסנני המגזרים נראים אך לא ניתנים לבחירה.
  "revenueSegments.all": "הכל",
  "revenueSegments.locked": "מגזרים",
  "revenueSegments.rateLimitedTooltip":
    "פילוח לפי מגזר הוא תכונת פרימיום — מכסת ה-FMP היומית בתוכנית החינמית הסתיימה, לכן ההכנסות מוצגות כסכום כולל.",
  "revenueSegments.unavailableTooltip":
    "פילוח לפי מגזר הוא תכונת פרימיום — לא הוגדר מקור נתונים של FMP, לכן ההכנסות מוצגות כסכום כולל.",
  // באנר בתוך המודל המורחב כשמטען המגזרים לא זמין מסיבות פרימיום.
  // הכרטיס כבר מציג שבב נעול עם הסבר; המודל משקף זאת בשורה אחת כדי
  // שהמשתמש יבין מדוע הגרף הוא סכום כולל במקום עמודות מוערמות לפי מגזר.
  "revenueSegments.modalBannerTitle": "פילוח לפי מגזר נעול",
  "revenueSegments.modalBannerRateLimited":
    "מכסת ה-FMP היומית בתוכנית החינמית הסתיימה, לכן ההכנסות מוצגות כסכום כולל. מסנני מגזרים יהיו זמינים בתוכנית בתשלום.",
  "revenueSegments.modalBannerUnavailable":
    "לא הוגדר מקור נתונים של FMP, לכן ההכנסות מוצגות כסכום כולל. מסנני מגזרים יהיו זמינים בתוכנית בתשלום.",
  // תווית קצרה על תג ה-Starlight Gold `Premium` שיושב ליד שבב ה-
  // "Segments 🔒" הנעול — גם בכרטיס וגם בתוך המודל המורחב. מבטל
  // את הצורך ב-hover כדי לגלות איזו תכונה נעולה.
  "revenueSegments.premiumBadge": "פרימיום",
  // קריאת CTA קצרה שמוצגת ליד גוף הבאנר הנעול וליד שבב הנעילה
  // בכרטיס — פותחת את מודל התמחור הזמני שמתארח ברמת הדף. תווית
  // קצרה כדי שלא תתחרה ויזואלית בגוף הבאנר הארוך.
  "revenueSegments.upgradeCta": "שדרג",

  "insights.search": "חיפוש",
  "insights.tabBadgeLive": "● חי",
  "insights.tabBadgeMock": "○ לדוגמה",
  "insights.noMatch": 'אין מניות שתואמות ל-"{{query}}"',
  "insights.piotroskiScore": "ניקוד Piotroski",
  "insights.activeStatus": "סטטוס פעילות",
  "insights.analystEstimates": "הערכות אנליסטים",
  "insights.avg": "ממוצע",
  "insights.beta": "בטא",
  "insights.ceo": 'מנכ"ל',
  "insights.country": "מדינה",
  "insights.cik": "CIK",
  "insights.companyProfile": "פרופיל חברה",
  "insights.showMore": "הצג עוד",
  "insights.showLess": "הצג פחות",
  "insights.currentQtr": "רבעון נוכחי",
  "insights.currentYear": "שנה נוכחית",
  "insights.cusip": "CUSIP",
  "insights.employeeCount": "מספר עובדים",
  "insights.employees": "עובדים",
  "insights.unavailable": "\u2014",
  "insights.website": "אתר",
  "insights.chartLiveSingleYear":
    "רק השנה האחרונה זמינה; שנים היסטוריות לא זמינות מהספק בתוכנית החינמית.",
  "insights.exchangeDescription": "בורסה",
  "insights.high": "גבוה",
  "insights.idChips": "מזהים",
  "insights.industry": "תעשייה",
  "insights.insiderTrading": "מסחר פנים",
  "insider.type.P": "רכישה",
  "insider.type.S": "מכירה",
  "insider.type.A": "הענקת מניות",
  "insider.type.G": "מתנת מניות",
  "insider.type.M": "מימוש אופציות",
  "insider.type.F": "ניכוי במס",
  "insider.type.D": "גריעה",
  "insider.type.X": "הענקת אופציות",
  "insider.type.C": "המרה",
  "insider.type.other": "עסקה",
  "insights.ipoDate": "תאריך הנפקה",
  "insights.isAdr": "ADR",
  "insights.isEtf": "ETF",
  "insights.isFund": "קרן",
  "insights.isin": "ISIN",
  "insights.lastDividend": "דיבידנד אחרון",
  "insights.low": "נמוך",
  "insights.news": "חדשות",
  // HE footer mirroring inscriptions.news.footer — counts the visible
  // rows after the 8-item cap so users see "חי מ-Yahoo · 8 אחרונים" rather
  // than a misleading "12 אחרונים" when the upstream hit the limit.
  "news.footer": "חי מ-Yahoo Finance · מציג {count} אחרונים",
  "insights.nextYear": "שנה הבאה",
  "insights.no": "לא",
  "insights.period": "תקופה",
  "insights.sector": "ענף",
  "insights.yes": "כן",

  "earnings.title": "לוח דוחות",
  "earnings.subtitle":
    "עקוב אחר תאריכי דיווח, תחזיות רווח והכנסות של האנליסטים והפתעות ביצועים.",
  "earnings.loading": "טוען דוחות מ-Finnhub...",
  "earnings.error.title": "טעינת לוח הדוחות נכשלה",
  "earnings.error.desc": "ייתכן ש-API של Finnhub הוגבל. נסה שוב בעוד רגע.",
  "earnings.empty.title": "אין דוחות השבוע",
  "earnings.empty.desc": "נסה שבוע אחר או בדוק שוב קרוב לתאריך",
  "earnings.today": "היום",
  "earnings.week": "שבוע",
  "earnings.total_reports": "סהכ דוחות",
  "earnings.before_open": "לפני הפתיחה",
  "earnings.after_close": "אחרי הסגירה",
  "earnings.view_week": "תצוגה שבועית",
  "earnings.view_list": "תצוגת רשימה",

  "earnings.bmo": "לפני פתיחה",
  "earnings.amc": "אחרי סגירה",
  "earnings.other": "אחר",
  "earnings.eps_est": "EPS צפוי:",
  "earnings.eps_act": "EPS בפועל:",
  "earnings.surprise": "הפתעה:",
  "earnings.rev_est": "הכנסה צפויה:",
  "earnings.rev_act": "הכנסה בפועל:",
  "earnings.est": "צפי:",
  "earnings.midday": "צהריים",

  "watchlists.noUpcoming": "אין אירועים ב-14 ימים הקרובים.",

  // Watchlists v2
  "watchlists.description":
    "ארגן רעיונות השקעה בעלי סבירות גבוהה, עקוב אחר לוחות תוצאות חיים וחשיפה סקטוריאלית ברשימות מותאמות אישית.",
  "watchlists.addButton": "+ הוסף",
  "watchlists.addTitle": "צור רשימת מעקב חדשה",
  "watchlists.nameLabel": "שם",
  "watchlists.namePlaceholder": "רשימת המעקב שלי",
  "watchlists.symbolsLabel": "סמלים",
  "watchlists.symbolsPlaceholder":
    "הדבק סמלים — אחד בשורה, מופרדים בפסיק, או CSV",
  "watchlists.csvHint": "כל סמל מאומת מול /api/stock-overview לפני ההוספה.",
  "watchlists.validatingLabel": "מאמת…",
  "watchlists.validCount_one": "1 תקין",
  "watchlists.validCount_other": "{{count}} תקינים",
  "watchlists.invalidCount_one": "1 לא תקין",
  "watchlists.invalidCount_other": "{{count}} לא תקינים",
  "watchlists.invalidChip": "לא תקין",
  "watchlists.tooManySymbols": "נא להשתמש בעד {{max}} סמלים ברשימת מעקב.",
  "watchlists.validationUnavailable": "אימות הסמלים אינו זמין זמנית. נסה שוב.",
  "watchlists.createButton": "צור",
  "watchlists.cancelButton": "בטל",
  "watchlists.deleteButton": "מחק",
  "watchlists.renameButton": "שנה שם",
  "watchlists.systemBadge": "ברירת מחדל",
  "watchlists.cannotDeleteSystem": "רשימת ברירת המחדל אינה ניתנת למחיקה.",
  "watchlists.cannotRenameSystem": "רשימת ברירת המחדל אינה ניתנת לשינוי שם.",
  "watchlists.emptyNameError": "נא להזין שם.",
  "watchlists.duplicateNameError": 'כבר קיימת רשימה בשם "{{name}}".',
  "watchlists.empty": "הוסף סמלים כדי להתחיל.",
  "watchlists.dropToReorder": "גרור שורות כדי לסדר מחדש.",
  "watchlists.confirmDelete": 'למחוק את "{{name}}"?',

  "notfound.title": "404 — דף לא נמצא",
  "notfound.description": "הדף שחיפשת לא קיים או שהועבר.",
  "notfound.returnHome": "חזור לדף הבית",

  "portfolio.title": "תיקים",
  "portfolio.description":
    "מעקב אחר הקצאת נכסים, תשואות מותאמות סיכון והכנסות מדיבידנדים.",
  "portfolio.analyticsTitle": "ניתוחים",
  "portfolio.annualIncome": "הכנסה שנתית",
  "portfolio.cagr": "CAGR",
  "portfolio.currentValue": "ערך נוכחי",
  "portfolio.derived": "מחושב",
  "portfolio.divOverlay": "שכבת דיבידנד",
  "portfolio.dividendYield": "תשואת דיבידנד",
  "portfolio.downsideOnly": "רק ירידות",
  "portfolio.fxBannerBody": "מציג ערכים ב-USD כי שערי ה-FX החיים לא זמינים.",
  "portfolio.fxStale": "FX לא עדכני",
  "portfolio.gainLoss": "רווח / הפסד",
  "portfolio.gainLossPct": "רווח / הפסד %",
  "portfolio.holdings": "אחזקות",
  "portfolio.irr": "IRR",
  "portfolio.irrExplainBody":
    "תשואה שנתית על תזרים מזומנים שהושקע, בהנחת השקעה חוזרת, ב-12 החודשים האחרונים. חישוב: {{rate}}.",
  "portfolio.irrExplainTitle": "כיצד מחושב IRR",
  "portfolio.nextEvent": "אירוע הבא",
  "portfolio.noPrice": "אין מחיר",
  "portfolio.oneYearBasis": "בסיס שנתי",
  "portfolio.partial": "חלקי",
  "portfolio.reviewReminder":
    "הרץ מחדש מדי שבוע; תנועות שוק משנות את סיווגי הסיכון.",
  "portfolio.sharpe": "שארפ",
  "portfolio.sortBy": "מיין לפי",
  "portfolio.sortino": "סורטינו",
  "portfolio.synthCashflows": "תזרים מסונתז",
  "portfolio.updatePortfolio": "עדכן תיק",
  "portfolio.volatility": "תנודתיות",
  "portfolio.weight": "משקל",
  "portfolio.weightedAvg": "ממוצע משוקלל",

  // Time-ago strings — Hebrew uses the same dual-rule set (one = exactly 1)
  // you can still see the `_two` form for "exactly two minutes" if a translator
  // wants to write it out (e.g. "שתי דקות").
  "timeAgo.justNow": "עכשיו",
  "timeAgo.minutesAgo_one": "לפני דקה",
  "timeAgo.minutesAgo_two": "לפני שתי דקות",
  "timeAgo.minutesAgo_other": "{{count}} דקות",
  "timeAgo.hoursAgo_one": "לפני שעה",
  "timeAgo.hoursAgo_two": "לפני שעתיים",
  "timeAgo.hoursAgo_other": "{{count}} שעות",
  "timeAgo.daysAgo_one": "אתמול",
  "timeAgo.daysAgo_two": "לפני יומיים",
  "timeAgo.daysAgo_other": "{{count}} ימים",
  "timeAgo.weeksAgo_one": "לפני שבוע",
  "timeAgo.weeksAgo_two": "לפני שבועיים",
  "timeAgo.weeksAgo_other": "{{count}} שבועות",
  "timeAgo.monthsAgo_one": "לפני חודש",
  "timeAgo.monthsAgo_two": "לפני חודשיים",
  "timeAgo.monthsAgo_other": "{{count}} חודשים",
  "timeAgo.yearsAgo_one": "לפני שנה",
  "timeAgo.yearsAgo_two": "לפני שנתיים",
  "timeAgo.yearsAgo_other": "{{count}} שנים",

  // InsightsCard footer / sparkline meta
  "insights.card.points_one": "תקופה {{count}}",
  "insights.card.points_two": "שתי תקופות",
  "insights.card.points_other": "{{count}} תקופות",
  "insights.card.dataSpan": "{{first}} → {{last}}",

  // Sector Spotlight
  "insights.spotlight.empty": "אין נתוני ענפים עבור תצוגה זו.",

  // Sector Heatmap (Bloomberg-style 5-day columnar heatmap)
  "insights.heatsheet.title": "מפת חום ענפית",
  "insights.heatsheet.foot": "{{rows}} ענפים · {{days}} ימים · במטמון 15 דקות",
  "insights.heatsheet.partialHit": "היום (חלקי)",
  "insights.heatsheet.partialTitle":
    "העמודה האחרונה היא תנועת היום בתוך-יומית — נסגרת עם סגירת השוק.",
  "insights.heatsheet.cellMeta_one": "1 מתוך {{total}} עם מחיר · ממוצע {{pct}}",
  "insights.heatsheet.cellMeta_two":
    "{{priced}} מתוך {{total}} עם מחיר · ממוצע {{pct}}",
  "insights.heatsheet.cellMeta_other":
    "{{priced}} מתוך {{total}} עם מחיר · ממוצע {{pct}}",
  "insights.heatsheet.cellEmpty": "—",
  "insights.heatsheet.weekNetLabel": "סיכום 5 ימים",
  "insights.heatsheet.weekNetNoData": "אין קצוות",
  "insights.heatsheet.loading": "מחשב מפת חום מסגירות {{days}}-יום…",
  "insights.heatsheet.untaggedSymbols_one": "סמל ללא ענף",
  "insights.heatsheet.untaggedSymbols_two": "שני סמלים ללא ענף",
  "insights.heatsheet.untaggedSymbols_other": "סמלים ללא ענף",
  "insights.heatsheet.unavailableTitle": "נתוני הסקטורים אינם זמינים זמנית",
  "insights.heatsheet.unavailableBody":
    "מפת החום של השוק האמריקאי משתמשת בהיסטוריית מחירים עדכנית מ-Yahoo עבור יקום S&P 500. לא התקבלו שורות סקטור, ולכן לא מוצגים נתונים משוערים או מדומים.",
  "insights.heatsheet.symbolCount_one": "סמל אחד",
  "insights.heatsheet.symbolCount_two": "שני סמלים",
  "insights.heatsheet.symbolCount_other": "{{count}} סמלים",
  // Hebrew word order mirrors English ("N priced · M total") so the
  // bilingual copy stays symmetric. Both halves are placeholders, so
  // translators can re-order without code changes.
  "insights.spotlight.rowMeta": "{{priced}} עם מחיר · {{total}} סהכ",

  // Sectors — canonical FMP English names, translated for HE locale.
  // HE strings mirror Globes / TheMarker conventions for Hebrew financial
  // press. Looked up via `translateSector(t, sector)` so the raw English
  // falls back when a new FMP sector arrives before translators cover it.
  "sector.technology": "טכנולוגיה",
  "sector.informationTechnology": "טכנולוגיה",
  "sector.healthcare": "בריאות",
  "sector.healthCare": "בריאות",
  "sector.financialServices": "שירותים פיננסיים",
  "sector.financials": "פיננסים",
  "sector.consumerCyclical": "צרכנות מחזורית",
  "sector.consumerDiscretionary": "צריכה מחזורית",
  "sector.consumerDefensive": "צריכה בסיסית",
  "sector.consumerStaples": "צריכה בסיסית",
  "sector.communicationServices": "תקשורת",
  "sector.industrials": "תעשייה",
  "sector.energy": "אנרגיה",
  "sector.realEstate": 'נדל"ן',
  "sector.utilities": "תשתיות",
  "sector.basicMaterials": "חומרי גלם",
  "sector.materials": "חומרי גלם",

  // Market Cap Tiers
  "marketCap.megaCap": "שווי ענק",
  "marketCap.largeCap": "שווי גדול",
  "marketCap.midCap": "שווי בינוני",
  "marketCap.smallCap": "שווי קטן",
  "marketCap.microCap": "שווי זעיר",
  "marketCap.nanoCap": "שווי ננו",

  // Countries
  "country.unitedStates": "ארצות הברית",
  "country.israel": "ישראל",
  "country.china": "סין",
  "country.unitedKingdom": "בריטניה",
  "country.canada": "קנדה",
  "country.japan": "יפן",
  "country.germany": "גרמניה",
  "country.india": "הודו",
  "country.france": "צרפת",
  "country.switzerland": "שווייץ",
  "country.netherlands": "הולנד",
  "country.taiwan": "טייוואן",
  "country.southKorea": "דרום קוריאה",
  "country.australia": "אוסטרליה",
  "country.brazil": "ברזיל",
  "country.singapore": "סינגפור",
  "country.ireland": "אירלנד",
  "country.sweden": "שוודיה",
  "country.hongKong": "הונג קונג",
  "country.spain": "ספרד",
  "country.italy": "איטליה",
  "country.denmark": "דנמרק",
  "country.norway": "נורווגיה",
  "country.finland": "פינלנד",
  "country.belgium": "בלגיה",
  "country.austria": "אוסטריה",
  "country.mexico": "מקסיקו",
  "country.southAfrica": "דרום אפריקה",
  "country.newZealand": "ניו זילנד",
  "country.caymanIslands": "איי קיימן",
  "country.bermuda": "ברמודה",
  "country.luxembourg": "לוקסמבורג",
  "country.saudiArabia": "ערב הסעודית",
  "country.unitedArabEmirates": "איחוד האמירויות",
  "country.argentina": "ארגנטינה",
  "country.chile": "צ'ילה",
  "country.colombia": "קולומביה",
  "country.greece": "יוון",
  "country.turkey": "טורקיה",
  "country.poland": "פולין",
  "country.portugal": "פורטוגל",
  "country.czechRepublic": "צ'כיה",
  "country.hungary": "הונגריה",
  "country.indonesia": "אינדונזיה",
  "country.malaysia": "מלזיה",
  "country.philippines": "פיליפינים",
  "country.thailand": "תאילנד",
  "country.vietnam": "וייטנאם",
  "country.egypt": "מצרים",
  "country.cyprus": "קפריסין",

  // Sidebar
  "sidebar.subtitle": "סביבת מחקר",

  // Splash / login
  "splash.email": "כתובת אימייל",
  "splash.password": "סיסמה",
  "splash.login": "התחברות / ניסיון ל-7 ימים",
  "splash.subtitle": "טרמינל ההשקעות האישי שלך למשקיעים לטווח ארוך.",

  // Landing Page
  "landing.hero.eyebrow": "מצפה כוכבים לנתוני יסוד של חברות",
  "landing.hero.badge": "סביבת מחקר פיננסית v2.4",
  "landing.hero.titleLine1": "קרא את האותות בתוך",
  "landing.hero.titleHighlight": "נתוני היסוד של החברות",
  "landing.hero.subtitle":
    "מרחב מחקר פיננסי שקט ומאיר עיניים. דוחות כספיים מעמיקים ל-5 שנים, תרשימי עקומת-אור היסטוריים, מודל הערכת שווי DCF ומודיעין דוחות בזמן אמת — ללא רעשי שוק.",
  "landing.hero.launchWorkspace": "כניסה למרחב המחקר",
  "landing.hero.exploreScreener": "פתח סורק מניות",
  "landing.hero.commandSearch": "חיפוש סימול (⌘K)",
  "landing.hero.liveDataFeed": "הזנת נתונים חיה ורב-ספקית עם גיבוי אוטומטי",

  "landing.spotlight.title": "זרקור מניות אינטראקטיבי",
  "landing.spotlight.subtitle":
    "בחר נכס מוביל לתצוגה מקדימה של עקומות אור היסטוריות ומדדי הערכת שווי",
  "landing.spotlight.openStock": "פתח מצפה מלא ←",
  "landing.spotlight.marketCap": "שווי שוק",
  "landing.spotlight.revenue": "הכנסות (TTM)",
  "landing.spotlight.fcf": "תזרים מזומנים חופשי",
  "landing.spotlight.grossMargin": "שולי רווח גולמי",
  "landing.spotlight.pe": "מכפיל רווח (P/E)",
  "landing.spotlight.cagr3Y": "צמיחת הכנסות שנתית (3Y)",
  "landing.spotlight.lightCurveLabel": "עקומת אור הכנסות ל-5 שנים",

  "landing.earningsShowcase.badge": "מודיעין אירועים יזום",
  "landing.earningsShowcase.title": "יומן דוחות קרובים וקונצנזוס וול סטריט",
  "landing.earningsShowcase.subtitle":
    "עקוב אחר תאריכי דיווח, תחזיות רווח והכנסות של האנליסטים והפתעות ביצועים מסוננות לאחזקות שלך.",
  "landing.earningsShowcase.openFull": "פתח יומן דוחות מלא ←",
  "landing.earningsShowcase.beforeOpen": "לפני הפתיחה",
  "landing.earningsShowcase.afterClose": "אחרי הסגירה",
  "landing.earningsShowcase.beat": "הכה",
  "landing.earningsShowcase.miss": "פספס",
  "landing.earningsShowcase.filterAll": "כל המדווחות",
  "landing.earningsShowcase.filterLarge": "חברות ענק (מעל $200B)",
  "landing.earningsShowcase.filterWatchlist": "רשימות מעקב בלבד",
  "landing.earningsShowcase.epsEst": "צפי EPS",
  "landing.earningsShowcase.epsActual": "EPS בפועל",
  "landing.earningsShowcase.revEst": "צפי הכנסות",
  "landing.earningsShowcase.revActual": "הכנסות בפועל",

  "landing.dcfSandbox.badge": "מנוע הערכת שווי אינטראקטיבי",
  "landing.dcfSandbox.title": "סימולטור DCF מהיר לתזרים מזומנים מהוון",
  "landing.dcfSandbox.subtitle":
    "בדוק הנחות צמיחה, מכפילים ויעדי תשואה בחישוב ערך מהותי בזמן אמת.",
  "landing.dcfSandbox.fcfInput": "תזרים חופשי בסיסי (מיליארד $)",
  "landing.dcfSandbox.growthInput": "שיעור צמיחה חזוי ל-5 שנים (%)",
  "landing.dcfSandbox.multipleInput": "מכפיל יציאה (P/FCF)",
  "landing.dcfSandbox.discountInput": "תשואת יעד / שיעור היוון (%)",
  "landing.dcfSandbox.sharesInput": "מניות מונפקות (מיליארד)",
  "landing.dcfSandbox.computedFairValue": "שווי הוגן מחושב",
  "landing.dcfSandbox.perShare": "(למניה)",
  "landing.dcfSandbox.totalEnterpriseValue": "שווי פעילות כולל:",
  "landing.dcfSandbox.marketPrice": "מחיר שוק נוכחי",
  "landing.dcfSandbox.upside": "מרווח ביטחון צפוי",
  "landing.dcfSandbox.undervalued": "מתחת לשווי (הזדמנות)",
  "landing.dcfSandbox.fairValue": "שווי הוגן",
  "landing.dcfSandbox.overvalued": "מעל השווי",
  "landing.dcfSandbox.openDcfTool": "פתח כלי DCF מלא במרחב המחקר ←",
  "landing.dcfSandbox.openInCharts": "פתח הערכת DCF בגרפים ←",

  "landing.features.badge": "ערכת המכשירים",
  "landing.features.title": "נבנה למחקר יסוד מעמיק",
  "landing.features.subtitle":
    "כל מדד נחקר כמו כוכב משתנה — מתועד על פני זמן, נקרא לפי מגמה ולא כהצגת מחיר רגעית.",
  "landing.features.card1Title": "עקומות אור של דוחות ל-5 שנים",
  "landing.features.card1Desc":
    "דוחות רווח והפסד, מאזנים ותזרימי מזומנים אינטראקטיביים עם מעבר מיידי בין תצוגה רבעונית לשנתית וחישובי CAGR.",
  "landing.features.card2Title": "סורק שוק גלובלי וסינון מתקדם",
  "landing.features.card2Desc":
    "סנן מעל 18,400+ נכסים בלמעלה מ-10 מדינות לפי סוג נכס, ענף, בורסה ורישום ראשי.",
  "landing.features.card3Title": "רשימות מעקב מותאמות אישית",
  "landing.features.card3Desc":
    "ארגן רעיונות השקעה בעלי שכנוע גבוה, עקוב אחר כרטיסי ניקוד חיים ובחן חשיפה סקטוריאלית.",
  "landing.features.card4Title": "תמות נבחרות ומפת חום סקטוריאלית",
  "landing.features.card4Desc":
    "חקור תמות מובנות כמו S&P 500, צמיחת דיבידנד, רכישות עצמיות, AI וענן עם מדדים חיים.",
  "landing.features.card5Title": "ניתוחי סיכון ברמה מוסדית",
  "landing.features.card5Desc":
    "מדדי שארפ, סורטינו, מודל IRR ותנודתיות ירידה המחושבים מתזרימי מזומנים.",
  "landing.features.card6Title": "חוסן רב-ספקי ושקיפות מלאה",
  "landing.features.card6Desc":
    "ארכיטקטורה ללא עלות עם שרשרת גיבוי שקופה בין Yahoo Finance, FMP ו-AlphaVantage.",

  "landing.sectors.badge": 'מכ"ם סקטוריאלי',
  "landing.sectors.title": "מאקרו שוק ומומנטום לפי מגזר",
  "landing.sectors.subtitle": "זהה במהירות זרימת הון בין ענפי השוק המרכזיים",
  "landing.sectors.viewAllScreener": "צפה בכל 500+ המניות בסורק ←",

  "landing.shortcuts.badge": "זרימת עבודה למשתמשים מתקדמים",
  "landing.shortcuts.title": "פרוטוקול מקלדת של המצפה",
  "landing.shortcuts.subtitle": "תוכנן ליעילות מקלדת מהירה וחלקה",
  "landing.shortcuts.cmdK": "פתיחת תפריט פקודות וחיפוש סימולים אוניברסלי",
  "landing.shortcuts.key15": "מעבר מהיר בין מדדי הערכת שווי, רווחיות ומאזן",
  "landing.shortcuts.keyQA": "מעבר בין היסטוריית דוחות רבעונית לשנתית",
  "landing.shortcuts.keyLang":
    "החלפה מיידית של שפה בין עברית לאנגלית והיפוך כיווניות RTL",

  "landing.cta.badge": "התחל לחקור עוד היום",
  "landing.cta.title": "שדרג את תהליך מחקר ההשקעות היסודי שלך",
  "landing.cta.subtitle":
    "ללא חומות תשלום, ללא חיכוך כניסה. היכנס למצפה וקרא את נתוני היסוד.",
  "landing.cta.launchNow": "כניסה ל-Vantage",
  "landing.cta.exploreWatchlists": "חקור רשימות מעקב",

  // Slide-over
  "slideover.loading": "טוען נתונים...",
  "slideover.error.title": "טעינת הנתונים נכשלה",
  "slideover.error.desc": "ייתכן שמגבלת ה-API הגיעה למיצוי",
  "slideover.key_ratios": "מכפילים ויחסים מרכזיים",
  "slideover.quick_stats": "נתונים מהירים",
  "slideover.about": "אודות",
  "slideover.view_full": "צפה בעמוד המלא של המניה",
  "slideover.after_hrs": "מסחר מאוחר:",
  "slideover.peTtm": "מכפיל רווח (TTM)",
  "slideover.peFwd": "מכפיל רווח עתידי",
  "slideover.priceToBook": "מכפיל הון (P/B)",
  "slideover.priceToSales": "מכפיל מכירות (P/S)",
  "slideover.evToEbitda": "EV/EBITDA",
  "slideover.divYield": "תשואת דיבידנד",
  "slideover.peg": "מכפיל צמיחה (PEG)",
  "slideover.beta": "בטא",

  // Command Menu (Search)
  "commandMenu.placeholder": "חיפוש חברה או סימול (לדוגמה AAPL)...",
  "commandMenu.searching": "מחפש במסד הנתונים...",
  "commandMenu.noResults": 'לא נמצאו תוצאות עבור "{{query}}".',
  "commandMenu.heading": "מניות ונכסים",

  // Screener
  "screener.title": "סורק שוק",
  "screener.subtitle": "גלה וסנן מעל {{total}} נכסים בשווקים הגלובליים.",
  "screener.assetType": "סוג נכס",
  "screener.sector": "ענף",
  "screener.country": "מדינה",
  "screener.moreCountries": "מדינות נוספות",
  "screener.scope": "היקף:",
  "screener.primaryListingsOnly": "רישום ראשי בלבד",
  "screener.primaryListingsTooltip":
    "הפעל כדי להחריג כפילויות מבורסות משניות (למשל AAPL.BA, TSLA.MI)",
  "screener.on": "פעיל",
  "screener.off": "כבוי",
  "screener.resetFilters": "איפוס מסננים",
  "screener.assetType.stocks": "מניות",
  "screener.assetType.etf": "תעודות סל",
  "screener.assetType.index": "מדדים",
  "screener.assetType.crypto": "קריפטו",
  "screener.assetType.fund": "קרנות נאמנות",
  "screener.assetType.currency": 'מט"ח',
  "screener.assetType.moneyMarket": "קרנות כספיות",
  "screener.country.us": "ארה״ב",
  "screener.country.canada": "קנדה",
  "screener.country.japan": "יפן",
  "screener.country.germany": "גרמניה",
  "screener.country.uk": "בריטניה",
  "screener.country.china": "סין",
  "screener.country.india": "הודו",
  "screener.country.israel": "ישראל",
  "screener.col.symbol": "סימול",
  "screener.col.name": "שם החברה",
  "screener.col.sector": "ענף",
  "screener.col.industry": "תעשייה",
  "screener.col.country": "מדינה",
  "screener.col.exchange": "בורסה",
  "screener.col.price": "מחיר",
  "screener.col.change": "שינוי",
  "screener.noResults": "לא נמצאו נכסים התואמים למסננים שנבחרו",
  "screener.loading": "טוען נכסים...",
  "screener.showingResults": "מציג {{start}} עד {{end}} מתוך {{total}} נכסים",
  "screener.prev": "הקודם",
  "screener.next": "הבא",
  "screener.pageOf": "עמוד {{page}} מתוך {{totalPages}}",
  "screener.filterSearchPlaceholder": "סינון...",
  "screener.selectAll": "בחר הכל",
  "screener.clear": "נקה",
  "screener.selectedCount": "{{count}} נבחרו",

  // פאנל מסננים פיננסיים חיים (נוסף למסנני המטא-דאטה)
  "screenerFund.liveTitle": "מסננים פיננסיים חיים",
  "screenerFund.liveSubtitle":
    "סינון לפי מדדים חיים ממקור Yahoo — בחר טווחי שווי שוק והגדר טווחי ערכים. כל מניה נשמרת במטמון בנפרד; הסריקה אינה נוגעת במכסת ה-FMP.",
  "screenerFund.run": "סנן",
  "screenerFund.running": "מסנן…",
  "screenerFund.reset": "איפוס",
  "screenerFund.marketCap": "שווי שוק",
  "screenerFund.min": "מינימום",
  "screenerFund.max": "מקסימום",
  "screenerFund.matches": "{{count}} תוצאות מתוך {{scanned}} מועמדים",
  "screenerFund.noRun": "הגדר לפחות טווח מדד אחד (או בחר טווחי שווי) ולחץ על סנן.",
  "screenerFund.noMatches": "אף נכס לא עבר את המסננים החיים.",
  "screenerFund.rateLimited":
    "Yahoo לא הגיבה עבור רוב המועמדים. המסננים החיים אינם זמינים זמנית — נסה שוב בעוד כמה דקות.",
  "screenerFund.unavailable": "מסננים חיים אינם זמינים",
  "screenerFund.source": "Yahoo",
  "screenerFund.scanned": "נסרקו {{scanned}} מועמדים",
  "screenerFund.metric.pe": "P/E",
  "screenerFund.metric.pb": "P/B",
  "screenerFund.metric.peg": "PEG",
  "screenerFund.metric.evEbitda": "EV/EBITDA",
  "screenerFund.metric.evSales": "EV/Sales",
  "screenerFund.metric.dividendYield": "תשואת דיבידנד",
  "screenerFund.metric.grossMargin": "רווח גולמי",
  "screenerFund.metric.netMargin": "רווח נקי",
  "screenerFund.metric.operatingMargin": "רווח תפעולי",
  "screenerFund.metric.roe": "ROE",
  "screenerFund.metric.roa": "ROA",
  "screenerFund.metric.currentRatio": "יחס שוטף",
  "screenerFund.metric.debtEquity": "חוב להון",
  "screenerFund.metric.fcfYield": "תשואת תזרים חופשי",
  "screenerFund.unit.x": "×",
  "screenerFund.unit.percent": "%",

  // Earnings alerts (topBar slide-down — global, not page-scoped)
  "earningsAlerts.open": "פתח",
  "earningsAlerts.snooze": "השתק",
  "earningsAlerts.dismiss": "סגור",
  "earningsAlerts.historyTitle": "דוחות היום",
  "earningsAlerts.historyEmpty": "אין התראות היום.",
  "earningsAlerts.historyCount_one": "התראה אחת",
  "earningsAlerts.historyCount_other": "{{count}} התראות",
  "earningsAlerts.historyAction.opened": "נפתח",
  "earningsAlerts.historyAction.snoozed": "הושתק",
  "earningsAlerts.historyAction.dismissed": "נסגר",
  "earningsAlerts.timeUntilNow": "עכשיו",
  "earningsAlerts.timeUntilMinutes_one": "בעוד דקה",
  "earningsAlerts.timeUntilMinutes_other": "בעוד {{count}} דקות",
  "earningsAlerts.timeUntilHours_one": "בעוד שעה",
  "earningsAlerts.timeUntilHours_other": "בעוד {{count}} שעות",
  "earningsAlerts.timeUntilDays_one": "בעוד יום",
  "earningsAlerts.timeUntilDays_other": "בעוד {{count}} ימים",

  "language.en": "English",
  "language.he": "עברית",

  // Provider health indicator
  "providerHealth.title": "סטטוס ספקי נתונים",
  "providerHealth.outage": "הפרעה בנתוני שוק",
  "providerHealth.degraded": "מוגבל",
  "providerHealth.notConfigured": "לא מוגדר",
  "providerHealth.affected": "מושפעים: {{providers}}",
  "providerHealth.knownRestriction": "הגבלות תוכנית חינמית",
  "providerHealth.docsLink": "תיעוד ספקים",
  "providerHealth.feature.quote": "שער",
  "providerHealth.feature.batchQuote": "שערים מרובים",
  "providerHealth.feature.chart": "גרף",
  "providerHealth.chartDownHint":
    "היסטוריית הגרפים של Yahoo מושבתת — הנתונים עלולים להיות לא מעודכנים",
  "providerHealth.batchFallback": "גיבוי Yahoo",
  "providerHealth.batchFallbackTooltip":
    "שערים מרובים אינם זמינים בתוכנית הנוכחית — כל שער נטען בנפרד דרך Yahoo",
  "providerHealth.barTitle": "ספקי נתונים",
  "providerHealth.allHealthy": "כל ספקי הנתונים פועלים כשורה",
  "providerHealth.fallbackActive": "מנגנון גיבוי אוטומטי פעיל (ללא הפרעה)",
  "providerHealth.viewDetails": "הצג אבחון ספקים",
  "providerHealth.hideDetails": "הסתר",
  "providerHealth.modalTitle": "אבחון ספקי נתונים וניתוב גיבוי אוטומטי",
  "providerHealth.modalSubtitle":
    "טלמטריה חיה בזמן אמת של ספקי נתוני השוק, מכסות שימוש יומיות ונתיבי גיבוי.",
  "providerHealth.status.ok": "פעיל ותקין",
  "providerHealth.status.degraded": "מוגבל · גיבוי פעיל",
  "providerHealth.status.down": "השבתה",
  "providerHealth.status.knownRestriction": "מגבלת תוכנית חינמית",
  "providerHealth.status.notConfigured": "לא מוגדר",
  "providerHealth.yahooDesc":
    "ספק ראשי לשערי זמן אמת, גרפים תוך-יומיים והיסטוריים, וגיבוי מדדי שווי.",
  "providerHealth.fmpDesc":
    "דוחות כספיים מבוקרים ל-5 שנים, מאזנים, נתוני DCF ועסקאות בעלי עניין.",
  "providerHealth.alphavantageDesc":
    "סדרות נתונים היסטוריות משניות וגיבוי שערים רציף.",
  "providerHealth.fallbackEngagedNote":
    "מכסת FMP החינמית היומית (250 בקשות) מוצתה — Vantage מנתבת שערים ומדדים אוטומטית דרך Yahoo ללא כל הפרעה.",
  "providerHealth.recheck": "בדוק ספקים מחדש",
  "providerHealth.latency": "זמן תגובה",
  "providerHealth.lastChecked": "נבדק: {{time}}",

  // Footer usage pills (live API-call counts vs free-tier limits). Numbers
  // stay inside `dir="ltr"` on the page side, so the Hebrew string can sit
  // inside LTR-safe braces landing here from the typewriter.
  "usage.footerLabel": "שימוש בממשקי API",
  "usage.title": "מגבלות API",
  "usage.usedOfLimit": "{{used}} / {{limit}}",
  "usage.usedOfLimitDay": "{{used}} / {{limit}} היום",
  "usage.remainingOfLimit": "{{remaining}} / {{limit}} נותרו",
  "usage.remainingOfLimitDay": "{{remaining}} / {{limit}} נותרו (היום)",
  "usage.modeToggle.label": "מצב תצוגה",
  "usage.modeToggle.used": "שומש",
  "usage.modeToggle.remaining": "נותר",
  "usage.unknownReset": "אין טיימר איפוס",
  "usage.resetNow": "מתאפס כעת",
  "usage.resetInMinutes": "מתאפס בעוד {{minutes}} דקות",
  "usage.resetInHours": "מתאפס בעוד {{hours}} שעות",
  "usage.resetOver24h": "מתאפס בעוד יותר מ-24 שעות",
  "usage.rateLimited": "מוגבל כרגע",
  "usage.heuristic": "משוער",
  "usage.heuristicTooltip":
    "ל-Yahoo אין תיעוד רשמי למגבלת קצב במסלול החינמי — זה תקציב מוערך (≈200 לשעה).",
  "usage.singleInstanceNote":
    "מונה לכל תהליך — עשוי להיות שונה מלוח המחוונים של הספק לאחר הפעלה מחדש.",
  "usage.crossInstanceNote":
    "המונה מתעד את תהליך Vantage בלבד; פריסות ארוכות-טווח עלולות לסטות.",

  // Third-party attribution links (free-tier requirement)
  "attribution.logoDev": "לוגואים מ־Logo.dev",
  "attribution.logoDevAria": "לוגואי חברות מ־Logo.dev (נפתח בכרטיסייה חדשה)",
};

export const heDict = he;
