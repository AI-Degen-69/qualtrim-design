import { RequestHandler } from "express";
import {
  fetchYahooBatchQuotes,
  fetchYahooBatchSectors,
} from "../services/yahooFinance";

// Stock universes for the insights tabs
const UNIVERSES: Record<string, string[]> = {
  sp500: [
    "NVDA",
    "AAPL",
    "MSFT",
    "AMZN",
    "GOOGL",
    "GOOG",
    "META",
    "TSLA",
    "AVGO",
    "BRK-B",
    "LLY",
    "JPM",
    "V",
    "XOM",
    "UNH",
    "WMT",
    "MA",
    "PG",
    "JNJ",
    "HD",
    "ORCL",
    "COST",
    "ABBV",
    "CVX",
    "AMD",
    "NFLX",
    "CRM",
    "ADBE",
    "KO",
    "PEP",
  ],
  trending: [
    "NVDA",
    "TSLA",
    "AMD",
    "AAPL",
    "META",
    "MSFT",
    "AMZN",
    "GOOGL",
    "NFLX",
    "PLTR",
    "SMCI",
    "AVGO",
    "ARM",
    "MU",
    "SNOW",
    "CRWD",
    "DDOG",
    "NET",
    "ENPH",
    "SOFI",
  ],
  growth: [
    "NVDA",
    "TSLA",
    "AMD",
    "META",
    "AMZN",
    "GOOGL",
    "MSFT",
    "AAPL",
    "NFLX",
    "CRM",
    "ADBE",
    "AVGO",
    "SNOW",
    "CRWD",
    "DDOG",
    "NET",
    "SHOP",
    "SQ",
    "MDB",
    "ZM",
  ],
  dividend: [
    "JNJ",
    "PG",
    "KO",
    "PEP",
    "XOM",
    "CVX",
    "ABBV",
    "VZ",
    "T",
    "IBM",
    "CSCO",
    "VZ",
    "MMM",
    "WMT",
    "HD",
    "MCD",
    "CL",
    "KMB",
    "EMR",
    "GIS",
  ],
  buyback: [
    "AAPL",
    "MSFT",
    "GOOGL",
    "META",
    "NVDA",
    "AMZN",
    "NFLX",
    "ORCL",
    "AVGO",
    "ADBE",
    "CRM",
    "AMD",
    "INTC",
    "CSCO",
    "TXN",
    "QCOM",
    "LOW",
    "BLK",
    "AXP",
    "GS",
  ],
  ai: [
    "NVDA",
    "MSFT",
    "GOOGL",
    "META",
    "AMZN",
    "AAPL",
    "AVGO",
    "AMD",
    "PLTR",
    "CRM",
    "ADBE",
    "ORCL",
    "SNOW",
    "NET",
    "CRWD",
    "DDOG",
    "ARM",
    "SMCI",
    "MU",
    "DELL",
  ],
  cloud: [
    "AMZN",
    "MSFT",
    "GOOGL",
    "META",
    "ORCL",
    "CRM",
    "ADBE",
    "NET",
    "SNOW",
    "DDOG",
    "MDB",
    "SHOP",
    "NOW",
    "TEAM",
    "ZM",
    "WDAY",
    "SAP",
    "INTU",
    "ADSK",
    "FSLR",
  ],
  ev: [
    "TSLA",
    "RIVN",
    "LCID",
    "NIO",
    "XPEV",
    "LI",
    "F",
    "GM",
    "CHPT",
    "BLNK",
    "EVGO",
    "ENPH",
    "SEDG",
    "PLUG",
    "BLDP",
    "FCEL",
    "CHPT",
    "QS",
    "ARVL",
    "PSNY",
  ],
  leisure: [
    "DIS",
    "NFLX",
    "SPOT",
    "ABNB",
    "BKNG",
    "EXPE",
    "CCL",
    "RCL",
    "NCLH",
    "MGM",
    "WYNN",
    "LVS",
    "HLT",
    "MAR",
    "DPZ",
    "CMG",
    "DASH",
    "UBER",
    "LYFT",
    "JD",
  ],
};

/**
 * GET /api/insights/stocks?tab=sp500
 * Returns batch real-time quotes for a given universe tab.
 * Yahoo Finance is free and unlimited, so we can fetch all at once.
 */
export const handleInsightsStocks: RequestHandler = async (req, res) => {
  try {
    const tab = (req.query.tab as string) || "sp500";
    const tickers = UNIVERSES[tab] || UNIVERSES.sp500;

    const [stocks, sectorMap] = await Promise.all([
      fetchYahooBatchQuotes(tickers),
      fetchYahooBatchSectors(tickers),
    ]);

    res.json({
      tab,
      stocks: stocks.map((s) => {
        const sectorInfo: { sector: string | null; industry: string | null } =
          sectorMap[s.ticker] || { sector: null, industry: null };
        return {
          symbol: s.ticker,
          name: s.name || s.ticker,
          price: s.price,
          change: s.change,
          changePercent: s.changePercent,
          marketCap: s.marketCap,
          exchange: s.exchange,
          sector: sectorInfo.sector ?? s.sector,
          industry: sectorInfo.industry ?? s.industry,
        };
      }),
      source: "Yahoo Finance (free)",
    });
  } catch (error) {
    console.error("Error fetching insights stocks:", error);
    res.status(500).json({ error: "Failed to fetch insights stocks" });
  }
};

/**
 * GET /api/insights/universes
 * Returns the list of available universe tabs.
 */
export const handleInsightsUniverses: RequestHandler = (_req, res) => {
  res.json({
    tabs: Object.keys(UNIVERSES).map((id) => ({
      id,
      label: id
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .replace(/\bAi\b/i, "AI")
        .replace(/\bEv\b/i, "EV")
        .trim(),
    })),
  });
};
