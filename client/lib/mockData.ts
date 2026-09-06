export interface StockMetric {
  date: string;
  value: number;
}

export interface FinancialMetric {
  name: string;
  type: "bar" | "line" | "area";
  color: string;
  unit: string;
  data: StockMetric[];
  // YoY - year-over-year (absolute growth rate)
  yoy?: number;
  // CAGR - Compound Annual Growth Rate (annualized average)
  cagr3Y?: number;
  cagr5Y?: number;
}

export interface QuickStat {
  label: string;
  value: string;
  subtitle?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
}

export interface CompanyProfile {
  ceo: string;
  sector: string;
  industry: string;
  employees: number;
  beta: number;
  piotroskiScore: number;
  description: string;
}

export interface InsiderTrade {
  name: string;
  date: string;
  type: string;
  price: number;
  transacted: number;
  value: number;
}

export interface AnalystEstimate {
  metric: "EPS" | "Revenue";
  period: "Current Qtr" | "Current Year" | "Next Year";
  avg: number;
  low: number;
  high: number;
}

export interface NewsItem {
  headline: string;
  publisher: string;
  timestamp: string;
  url: string;
  // Mirrors `shared/api.NewsItem.thumbnail`/`type` so the mock-fallback
  // branch and the live-mapped branch share the same shape — the
  // /stock/:ticker news card's `news:thumb-?thumbnail` render reads
  // through either path without a runtime check.
  thumbnail?: string | null;
  type?: string | null;
}

export interface EarningsEvent {
  ticker: string;
  date: string;
  epsEst: number;
  epsActual?: number;
  revEst: number;
  revActual?: number;
  time: "Before Open" | "After Close";
  surprise?: "beat" | "miss" | "none";
}

export interface PortfolioHolding {
  ticker: string;
  weight: number;
  gainLoss: number;
}

/**
 * A signed cashflow point on a portfolio's timeline. Negative = invested,
 * positive = received (sale + dividends). Date is ISO YYYY-MM-DD.
 *
 * `cashflows` is the raw material for IRR — when a real portfolio is wired
 * in this becomes the user's transaction history; today it's synthesized
 * from the mockPortfolio/currentValue + mockPortfolio/annualIncome so we
 * can demo the math end-to-end before any real account data exists.
 */
export interface PortfolioCashflow {
  date: string;
  amount: number;
}

export interface Portfolio {
  id: string;
  name: string;
  currentValue: number;
  gainLoss: number;
  annualIncome: number;
  dividendYield: number;
  baseCurrency: "USD";
  holdings: PortfolioHolding[];
  /** Synthetic 12-month trailing series; used by IRR computation in Portfolio.tsx. */
  cashflows: PortfolioCashflow[];
}

// ---------------------------------------------------------------------------
// Demo cashflow synthesizer
// ---------------------------------------------------------------------------
/**
 * Generates a synthetic 12-month portfolio cashflow series for IRR calculations.
 *
 * @param asOf - The date used for the terminal cashflow and trailing-period dates.
 * @returns Cashflows containing monthly investments, quarterly dividends, and the current portfolio value, sorted by date.
 */
function synthesizeCashflows(
  currentValue: number,
  annualIncome: number,
  gainLoss: number,
  asOf: Date = new Date(),
): PortfolioCashflow[] {
  const flows: PortfolioCashflow[] = [];
  // Total invested = currentValue - gainLoss (backing out the gain to get original principal)
  const totalInvested = currentValue - gainLoss;
  const monthlyInvestment = -totalInvested / 12;
  const quarterlyDividend = annualIncome / 4;

  // 12 monthly buys, ordered oldest first
  for (let i = 11; i >= 0; i--) {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    flows.push({
      date: d.toISOString().slice(0, 10),
      amount: Number(monthlyInvestment.toFixed(2)),
    });
  }
  // 4 quarterly dividends spread across the same 12-month window
  for (let q = 0; q < 4; q++) {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - (9 - q * 3));
    d.setDate(15);
    flows.push({
      date: d.toISOString().slice(0, 10),
      amount: Number(quarterlyDividend.toFixed(2)),
    });
  }
  // Terminal: the closing inflow that reflects currentValue
  // Sum of flows will be: -totalInvested + (4 * quarterlyDividend) + currentValue
  // = -totalInvested + annualIncome + currentValue
  // = -(currentValue - gainLoss) + annualIncome + currentValue
  // = gainLoss + annualIncome
  // This reconciles with the declared gainLoss when annualIncome is accounted for separately.
  flows.push({
    date: asOf.toISOString().slice(0, 10),
    amount: Number(currentValue.toFixed(2)),
  });

  // Sort oldest → newest for IRR's NPV expansion to be well-defined.
  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return flows;
}

// Curated Market Leaders & ETFs Watchlist
export const defaultWatchlist: WatchlistTicker[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    price: 1120.45,
    changePercent: 2.34,
    sma200Distance: 35.2,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    price: 425.1,
    changePercent: 1.15,
    sma200Distance: 12.4,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 215.3,
    changePercent: 0.85,
    sma200Distance: 5.6,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    price: 185.2,
    changePercent: -0.45,
    sma200Distance: 8.2,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    price: 175.8,
    changePercent: 1.2,
    sma200Distance: 9.5,
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    price: 495.6,
    changePercent: 3.1,
    sma200Distance: 22.1,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    price: 175.4,
    changePercent: -2.15,
    sma200Distance: -15.4,
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    price: 545.2,
    changePercent: 0.5,
    sma200Distance: 10.1,
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    price: 475.1,
    changePercent: 0.8,
    sma200Distance: 14.5,
  },
  {
    symbol: "XLV",
    name: "Health Care Select ETF",
    price: 145.3,
    changePercent: -0.1,
    sma200Distance: 4.2,
  },
  {
    symbol: "XLF",
    name: "Financial Select ETF",
    price: 41.5,
    changePercent: 0.25,
    sma200Distance: 6.8,
  },
];

export const mockPortfolio: Portfolio = {
  id: "my-first-portfolio",
  name: "My First Portfolio",
  currentValue: 1250450.0,
  gainLoss: 154230.5,
  annualIncome: 45200.0,
  dividendYield: 3.6,
  baseCurrency: "USD",
  holdings: [
    { ticker: "AAPL", weight: 25.4, gainLoss: 45.2 },
    { ticker: "MSFT", weight: 20.1, gainLoss: 32.8 },
    { ticker: "NVDA", weight: 15.5, gainLoss: 125.4 },
    { ticker: "SPY", weight: 39.0, gainLoss: 12.5 },
  ],
  cashflows: synthesizeCashflows(1250450.0, 45200.0, 154230.5),
};

export const techHeavyPortfolio: Portfolio = {
  id: "tech-heavy",
  name: "Tech Heavy",
  currentValue: 3450000.0,
  gainLoss: 890000.5,
  annualIncome: 12500.0,
  dividendYield: 0.36,
  baseCurrency: "USD",
  holdings: [
    { ticker: "MSFT", weight: 15.0, gainLoss: 85.2 },
    { ticker: "AAPL", weight: 14.5, gainLoss: 65.4 },
    { ticker: "NVDA", weight: 12.0, gainLoss: 215.8 },
    { ticker: "GOOGL", weight: 10.5, gainLoss: 45.2 },
    { ticker: "AMZN", weight: 10.0, gainLoss: 35.6 },
    { ticker: "META", weight: 8.5, gainLoss: 110.4 },
    { ticker: "TSLA", weight: 6.0, gainLoss: -15.2 },
    { ticker: "APP", weight: 5.5, gainLoss: 150.8 },
    { ticker: "PLTR", weight: 5.0, gainLoss: 95.4 },
    { ticker: "AVGO", weight: 4.5, gainLoss: 75.2 },
    { ticker: "ORCL", weight: 4.0, gainLoss: 25.6 },
    { ticker: "AMD", weight: 4.5, gainLoss: 40.5 },
  ],
  cashflows: synthesizeCashflows(3450000.0, 12500.0, 890000.5),
};

export const dividendKingsPortfolio: Portfolio = {
  id: "dividend-kings",
  name: "Dividend Kings",
  currentValue: 850200.0,
  gainLoss: 45000.0,
  annualIncome: 35600.0,
  dividendYield: 4.18,
  baseCurrency: "USD",
  holdings: [
    { ticker: "JNJ", weight: 12.5, gainLoss: 15.2 },
    { ticker: "GPC", weight: 10.0, gainLoss: 8.4 },
    { ticker: "PEP", weight: 9.5, gainLoss: 12.6 },
    { ticker: "KMB", weight: 9.0, gainLoss: 5.4 },
    { ticker: "TGT", weight: 8.5, gainLoss: -4.2 },
    { ticker: "SWK", weight: 8.0, gainLoss: 2.1 },
    { ticker: "ED", weight: 7.5, gainLoss: 18.5 },
    { ticker: "HRL", weight: 7.0, gainLoss: -2.5 },
    { ticker: "KO", weight: 8.5, gainLoss: 22.4 },
    { ticker: "PG", weight: 7.5, gainLoss: 14.8 },
    { ticker: "MMM", weight: 6.0, gainLoss: -8.5 },
    { ticker: "CL", weight: 6.0, gainLoss: 9.2 },
  ],
  cashflows: synthesizeCashflows(850200.0, 35600.0, 45000.0),
};

export const portfolios = [
  mockPortfolio,
  techHeavyPortfolio,
  dividendKingsPortfolio,
];

export interface WatchlistTicker {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sma200Distance: number; // Percentage distance from 200-day SMA
}

export const mockCompanyProfile: CompanyProfile = {
  ceo: "Tim Cook",
  sector: "Technology",
  industry: "Consumer Electronics",
  employees: 161000,
  beta: 1.25,
  piotroskiScore: 8,
  description:
    "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The company offers iPhone, a line of smartphones; Mac, a line of personal computers; iPad, a line of multi-purpose tablets; and wearables, home, and accessories comprising AirPods, Apple TV, Apple Watch, Beats products, and HomePod.",
};

export const mockAnalystEstimates: AnalystEstimate[] = [
  { metric: "EPS", period: "Current Qtr", avg: 1.54, low: 1.45, high: 1.62 },
  { metric: "EPS", period: "Current Year", avg: 6.55, low: 6.3, high: 6.75 },
  { metric: "EPS", period: "Next Year", avg: 7.2, low: 6.85, high: 7.5 },
  {
    metric: "Revenue",
    period: "Current Qtr",
    avg: 90.2,
    low: 88.5,
    high: 92.1,
  },
  {
    metric: "Revenue",
    period: "Current Year",
    avg: 385.5,
    low: 375.0,
    high: 395.0,
  },
  {
    metric: "Revenue",
    period: "Next Year",
    avg: 410.2,
    low: 395.5,
    high: 425.0,
  },
];

export const mockInsiderTrades: InsiderTrade[] = [
  {
    name: "Tim Cook",
    date: "2024-05-15",
    type: "Sell",
    price: 185.5,
    transacted: -150000,
    value: -27825000,
  },
  {
    name: "Luca Maestri",
    date: "2024-04-20",
    type: "Sell",
    price: 175.2,
    transacted: -25000,
    value: -4380000,
  },
  {
    name: "Deirdre O'Brien",
    date: "2024-03-10",
    type: "Option Exercise",
    price: 45.5,
    transacted: 50000,
    value: 2275000,
  },
  {
    name: "Craig Federighi",
    date: "2024-02-15",
    type: "Sell",
    price: 182.3,
    transacted: -40000,
    value: -7292000,
  },
];

export const mockNews: NewsItem[] = [
  {
    headline: "Neutral Google appeals iPhone search ruling",
    publisher: "Financial Times",
    timestamp: "May 22, 2024",
    url: "#",
  },
  {
    headline: "Apple faces labor concerns in Asia",
    publisher: "WSJ",
    timestamp: "May 21, 2024",
    url: "#",
  },
  {
    headline: "New iPad Pro features OLED display",
    publisher: "Bloomberg",
    timestamp: "May 20, 2024",
    url: "#",
  },
  {
    headline: "Apple announces WWDC dates",
    publisher: "TechCrunch",
    timestamp: "May 18, 2024",
    url: "#",
  },
];

export const mockEmployeeCount = [
  { year: "2019", count: 137000 },
  { year: "2020", count: 147000 },
  { year: "2021", count: 154000 },
  { year: "2022", count: 164000 },
  { year: "2023", count: 161000 },
];

export const appleStockData = {
  symbol: "AAPL",
  name: "Apple Inc.",
  currentPrice: 224.72,
  priceChange: 12.54,
  percentChange: 5.91,
  badgeType: "positive" as const,
};

export const quickStats: QuickStat[] = [
  {
    label: "metrics.valuation",
    value: "$3.42T",
    details: [
      { label: "metrics.marketCap", value: "$3,421.2B" },
      { label: "metrics.pe", value: "27.23 | 30.81 | 30.12" },
      { label: "metrics.priceToSales", value: "8.42" },
      { label: "metrics.evToEbitda", value: "26.39" },
      { label: "metrics.priceToBook", value: "42.66" },
    ],
  },
  {
    label: "metrics.cashFlow",
    value: "$110.5B",
    details: [
      { label: "metrics.ocf", value: "$110.5B" },
      { label: "metrics.fcf", value: "$97.2B" },
      { label: "metrics.fcfPayout", value: "0.24" },
      { label: "metrics.dividendPrice", value: "$30,820" },
      { label: "metrics.cashAmount", value: "$29.2B" },
    ],
  },
  {
    label: "metrics.marginsGrowth",
    value: "46.2%",
    details: [
      { label: "metrics.grossMargin", value: "46.21%" },
      { label: "metrics.operatingMargin", value: "33.64%" },
      { label: "metrics.netMargin", value: "19.34%" },
      { label: "metrics.quarterlyEarnings", value: "14.60%" },
    ],
  },
  {
    label: "metrics.balance",
    value: "$1,245.6B",
    details: [
      { label: "metrics.totalAssets", value: "$352.6B" },
      { label: "metrics.totalDebt", value: "$106.8B" },
      { label: "metrics.debtToEquity", value: "1.69x" },
      { label: "metrics.currentRatio", value: "1.51x" },
      { label: "metrics.quickRatio", value: "1.39x" },
    ],
  },
  {
    label: "metrics.dividend",
    value: "$0.24/q",
    details: [
      { label: "metrics.quarterlyDividend", value: "$0.24" },
      { label: "metrics.annualDividend", value: "$0.96" },
      { label: "metrics.dividendYield", value: "0.43%" },
      { label: "metrics.payoutRatio", value: "12.69%" },
      { label: "metrics.nextExDate", value: "May 11, 2024" },
    ],
  },
  {
    label: "metrics.valuation",
    value: "metrics.premium",
    details: [
      { label: "metrics.high52", value: "$309.25" },
      { label: "metrics.low52", value: "$164.08" },
      { label: "metrics.averageVolume", value: "52.8M" },
      { label: "metrics.marketPosition", value: "metrics.techLeader" },
    ],
  },
];

// Generate quarterly data for the past 40 years (160 quarters)
const generateQuarterlyData = (
  baseValue: number,
  variance: number,
): StockMetric[] => {
  const data: StockMetric[] = [];
  const now = new Date();
  let value = baseValue;

  for (let i = 159; i >= 0; i--) {
    const quarter = Math.floor(i / 4);
    const q = (i % 4) + 1;
    const year = now.getFullYear() - quarter;
    value += (Math.random() - 0.5) * variance;
    data.push({
      date: `Q${q} ${year}`,
      value: Math.max(value, baseValue * 0.1),
    });
  }
  return data;
};

export const financialMetrics: FinancialMetric[] = [
  {
    name: "metrics.revenue",
    type: "bar",
    color: "chart-green",
    unit: "B",
    data: generateQuarterlyData(83.0, 8),
    yoy: 16.6,
    cagr3Y: 8.65,
    cagr5Y: 4.41,
  },
  {
    name: "metrics.revenueBySegment",
    type: "bar",
    color: "chart-orange",
    unit: "B",
    data: generateQuarterlyData(79.5, 6),
    yoy: 14.35,
    cagr3Y: 6.32,
    cagr5Y: 3.28,
  },
  {
    name: "metrics.ebitda",
    type: "bar",
    color: "chart-orange",
    unit: "B",
    data: generateQuarterlyData(28.5, 3),
    yoy: 18.94,
    cagr3Y: 10.52,
    cagr5Y: 5.87,
  },
  {
    name: "metrics.grossProfit",
    type: "line",
    color: "chart-blue",
    unit: "B",
    data: generateQuarterlyData(28.0, 2.5),
    yoy: 15.73,
    cagr3Y: 7.84,
    cagr5Y: 4.12,
  },
  {
    name: "metrics.operatingIncome",
    type: "bar",
    color: "chart-orange",
    unit: "B",
    data: generateQuarterlyData(24.5, 2),
    yoy: 20.45,
    cagr3Y: 11.68,
    cagr5Y: 6.42,
  },
  {
    name: "metrics.netIncome",
    type: "bar",
    color: "chart-orange",
    unit: "B",
    data: generateQuarterlyData(19.8, 1.8),
    yoy: 17.28,
    cagr3Y: 9.45,
    cagr5Y: 5.64,
  },
  {
    name: "metrics.cashEquivalents",
    type: "bar",
    color: "chart-orange",
    unit: "B",
    data: generateQuarterlyData(29.2, 3),
    yoy: 22.67,
    cagr3Y: 13.25,
    cagr5Y: 7.89,
  },
  {
    name: "metrics.freeCashFlow",
    type: "line",
    color: "chart-cyan",
    unit: "B",
    data: generateQuarterlyData(24.5, 2),
    yoy: 14.56,
    cagr3Y: 7.92,
    cagr5Y: 4.38,
  },
  {
    name: "metrics.shareholdersEquity",
    type: "line",
    color: "chart-purple",
    unit: "B",
    data: generateQuarterlyData(63.1, 3.5),
    yoy: 12.34,
    cagr3Y: 6.78,
    cagr5Y: 3.94,
  },
  {
    name: "metrics.totalAssets",
    type: "line",
    color: "chart-blue",
    unit: "B",
    data: generateQuarterlyData(352.6, 10),
    yoy: 11.45,
    cagr3Y: 5.84,
    cagr5Y: 3.21,
  },
  {
    name: "metrics.marketCap",
    type: "area",
    color: "chart-green",
    unit: "B",
    data: generateQuarterlyData(2800, 150),
    yoy: 19.34,
    cagr3Y: 10.78,
    cagr5Y: 6.25,
  },
  {
    name: "metrics.eps",
    type: "line",
    color: "chart-pink",
    unit: "$",
    data: generateQuarterlyData(6.05, 0.5),
    yoy: 21.45,
    cagr3Y: 12.56,
    cagr5Y: 7.34,
  },
];
