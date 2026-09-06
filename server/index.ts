import "dotenv/config";
import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { handleDemo } from "./routes/demo";
import {
  handleStockQuote,
  handleBatchQuotes,
  handleStockFinancials,
  handleStockMetrics,
  handleRevenueSegmentation,
  handleStockAnalyst,
  handleStockInsider,
  handleStockNews,
  handleEarningsCalendar,
  handleStockChart,
  handleStockOverview,
  handleIndexQuotes,
  handleInsightsTab,
  handleInsightsTabsAll,
  handleSmaDistances,
  handleFxRates,
  handleProviderHealth,
  handleStockYahooFallbackFinancials,
  handleSectorHeatmap,
} from "./routes/stock-data";
import {
  handleScreenerSearch,
  handleScreenerFilter,
  handleScreenerAsset,
  handleScreenerFacets,
} from "./routes/screener";
import { initFinanceDatabase } from "./services/financeDatabaseSync";

/**
 * Creates and configures the Express application with middleware and API routes.
 *
 * @returns The configured Express application
 */
const API_RATE_WINDOW_MS = 60_000;
const API_RATE_LIMIT = 120;
const API_RATE_STATE_MAX = 10_000;
const apiRateState = new Map<string, { count: number; resetAt: number }>();

function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/screener")) {
    return next();
  }
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = apiRateState.get(key);

  // Clean expired keys before adding a new identity. If the process is already
  // at capacity, fail closed rather than allowing unbounded memory growth.
  if (!current) {
    for (const [candidate, value] of apiRateState) {
      if (value.resetAt <= now) apiRateState.delete(candidate);
    }
    if (apiRateState.size >= API_RATE_STATE_MAX) {
      res.setHeader("Retry-After", "1");
      res.status(429).json({ error: "Too many clients; please retry shortly" });
      return;
    }
  }

  const state =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + API_RATE_WINDOW_MS }
      : current;

  state.count += 1;
  apiRateState.set(key, state);

  if (state.count > API_RATE_LIMIT) {
    res.setHeader("Retry-After", Math.ceil((state.resetAt - now) / 1000));
    res
      .status(429)
      .json({ error: "Too many API requests; please retry shortly" });
    return;
  }

  next();
}

export function createServer() {
  const app = express();

  // Initialize background database sync (fire and forget)
  initFinanceDatabase().catch((err) => {
    console.error("[FinanceDatabase] Failed to initialize:", err);
  });

  // Trust the hosting proxy only when deployment explicitly opts in. This
  // prevents a directly reachable instance from accepting a spoofed
  // X-Forwarded-For header as the rate-limit identity.
  const proxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10);
  app.set(
    "trust proxy",
    Number.isFinite(proxyHops) && proxyHops > 0 ? proxyHops : false,
  );

  // The API is consumed by the same-origin SPA. Cross-origin access is opt-in
  // for local integrations/deployments rather than being open by default.
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use("/api", apiRateLimit);

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Stock data routes
  app.get("/api/stock-quote", handleStockQuote);
  app.get("/api/stock-batch-quotes", handleBatchQuotes);
  app.get("/api/stock-overview", handleStockOverview);
  app.get("/api/stock-financials", handleStockFinancials);
  app.get("/api/stock-metrics", handleStockMetrics);
  app.get("/api/stock-revenue-segmentation", handleRevenueSegmentation);
  app.get("/api/stock-analyst", handleStockAnalyst);
  app.get("/api/stock-insider", handleStockInsider);
  app.get("/api/stock-news", handleStockNews);
  app.get("/api/earnings-calendar", handleEarningsCalendar);
  app.get("/api/stock-chart", handleStockChart);
  app.get("/api/index-quotes", handleIndexQuotes);
  app.get("/api/insights-tab", handleInsightsTab);
  app.get("/api/insights-tabs-all", handleInsightsTabsAll);
  app.get("/api/sma-distances", handleSmaDistances);
  app.get("/api/fx-rates", handleFxRates);
  app.get("/api/provider-health", handleProviderHealth);
  app.get("/api/sector-heatmap", handleSectorHeatmap);
  app.get(
    "/api/stock-yahoo-fallback-financials",
    handleStockYahooFallbackFinancials,
  );

  // Screener routes
  app.get("/api/screener/search", handleScreenerSearch);
  app.get("/api/screener/filter", handleScreenerFilter);
  app.get("/api/screener/asset/:symbol", handleScreenerAsset);
  app.get("/api/screener/facets", handleScreenerFacets);

  return app;
}
