import { RequestHandler } from "express";
import NodeCache from "node-cache";

const FINNHUB_KEY = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY;

// Cache earnings calendar for 30 minutes
const earningsCache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });

export interface EarningsEvent {
  date: string;
  symbol: string;
  name: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  hour: "bmo" | "amc" | "dmh" | "";
  quarter: number;
  year: number;
  marketCap: number | null;
  exchange: string | null;
}

/**
 * GET /api/earnings/calendar
 * Fetches the upcoming earnings calendar from Finnhub.
 * Query params:
 *   from (optional) — start date YYYY-MM-DD, defaults to today
 *   to (optional)   — end date YYYY-MM-DD, defaults to 7 days from today
 *   international (optional) — include international markets, defaults to false
 */
export const handleEarningsCalendar: RequestHandler = async (req, res) => {
  try {
    if (!FINNHUB_KEY) {
      res.status(500).json({ error: "FINNHUB_KEY not configured" });
      return;
    }

    const today = new Date();
    const from =
      (req.query.from as string) || today.toISOString().split("T")[0];
    const to =
      (req.query.to as string) ||
      new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    const international = req.query.international === "true";

    const cacheKey = `earnings:${from}:${to}:${international}`;
    const cached = earningsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${FINNHUB_KEY}${international ? "&international=true" : ""}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Earnings] Finnhub error ${response.status}`);
      res.status(502).json({ error: "Failed to fetch earnings calendar" });
      return;
    }

    const data: any = await response.json();

    if (!data?.earningsCalendar || !Array.isArray(data.earningsCalendar)) {
      res.json({ from, to, earnings: [] });
      return;
    }

    const earnings: EarningsEvent[] = data.earningsCalendar
      .filter((item: any) => item?.symbol && item?.date)
      .slice(0, 100)
      .map((item: any) => ({
        date: item.date,
        symbol: item.symbol,
        name: null, // will be enriched
        epsActual: item.epsActual ?? null,
        epsEstimate: item.epsEstimate ?? null,
        revenueActual: item.revenueActual ?? null,
        revenueEstimate: item.revenueEstimate ?? null,
        hour: item.hour ?? "",
        quarter: item.quarter ?? 0,
        year: item.year ?? 0,
        marketCap: null,
        exchange: null,
      }));

    // Enrich with company names from Yahoo Finance (batch quotes)
    try {
      const { fetchYahooBatchQuotes } = await import(
        "../services/yahooFinance"
      );
      const tickers = earnings.map((e) => e.symbol);
      const quotes = await fetchYahooBatchQuotes(tickers);
      const quoteMap = new Map(quotes.map((q: any) => [q.ticker, q]));
      for (const e of earnings) {
        const q = quoteMap.get(e.symbol);
        if (q) {
          e.name = q.name;
          e.marketCap = q.marketCap;
          e.exchange = q.exchange;
        }
      }
    } catch {
      // Non-critical — names are a nice-to-have
    }

    const result = { from, to, earnings };
    earningsCache.set(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error("[Earnings] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
