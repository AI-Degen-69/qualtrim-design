import { RequestHandler } from "express";
import { fetchChartHistory, fetchYahooQuote } from "../services/yahooFinance";

/**
 * GET /api/chart-history?symbol=AAPL&period=1y
 * Returns OHLCV price history for a given period.
 * Periods: 1d, 5d, 1mo, 3mo, 1y, 5y
 */
export const handleChartHistory: RequestHandler = async (req, res) => {
  try {
    const { symbol, period } = req.query;
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol parameter required" });
    }

    const validPeriods = ["1d", "5d", "1mo", "3mo", "1y", "5y"] as const;
    const p =
      typeof period === "string" && validPeriods.includes(period as any)
        ? (period as "1d" | "5d" | "1mo" | "3mo" | "1y" | "5y")
        : "1y";

    const history = await fetchChartHistory(symbol.toUpperCase(), p);

    // Also fetch a quote for current price info
    const quote = await fetchYahooQuote(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      period: p,
      dataPoints: history.length,
      quote: quote
        ? {
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
          }
        : null,
      history,
    });
  } catch (error) {
    console.error("Error fetching chart history:", error);
    res.status(500).json({ error: "Failed to fetch chart history" });
  }
};
