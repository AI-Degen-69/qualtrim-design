/**
 * Vantage API Router — plain JavaScript.
 *
 * Vercel's @vercel/node bundler cannot handle local TypeScript imports from
 * api/*.ts files (FUNCTION_INVOCATION_FAILED at runtime). This file is pure
 * JS so every import resolves through npm packages (which Vercel handles)
 * while being imported from a .ts catch-all.
 *
 * Prefix `_` tells Vercel this is NOT a serverless function endpoint.
 *
 * Yahoo Finance (yahoo-finance2) is free and requires NO API key. FMP-
 * dependent endpoints (financials, metrics, earnings calendar, sector
 * heatmap) return empty/fallback responses until the env vars are set.
 */

import yfDefault from "yahoo-finance2";
import NodeCache from "node-cache";
import apiUsageTracker from "../server/services/apiUsageTracker.js";
// Canonical curated Insights universes + labels — single source shared
// with the Express server (same .js-extension import mechanism as
// apiUsageTracker.js). Replaces the former hand-copied 3-tab
// INSIGHTS_UNIVERSES map that had drifted from the canonical module.
// Known limitation vs the Express side: the `trending` tab serves the
// curated editorial list here, not FMP live movers.
import {
  insightsTabLabels,
  insightsTabUniverses,
} from "../server/services/insightsUniverses.js";
import { normalizeYahooQuote } from "../server/services/yahooQuoteShape.js";
// Shared symbols-query validation — same parser, error bodies, and
// dedupe semantics as the Express stock-data routes (same
// .js-extension import mechanism as apiUsageTracker.js).
import { parseSymbolsQuery } from "../server/services/symbolsQuery.js";

const yfInner = new yfDefault({ suppressNotices: ["yahooSurvey"] });
// Proxy-wrap yf so every method invocation auto-records one Yahoo call
// in apiUsageTracker — mirrors the TS-side wrap in stockService.ts so
// the parity router also records provider calls for server diagnostics.
const yf = new Proxy(yfInner, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value === "function") {
      return (...args) => {
        apiUsageTracker.recordCall ? apiUsageTracker.recordCall("yahoo") : null;
        return value.apply(target, args);
      };
    }
    return value;
  },
});
const cache = new NodeCache({ stdTTL: 300 });
const QUOTE_TTL = 60;
const CHART_TTL = 600;

// ── KV-backed JSON cache (parity twin of server/helpers/kvJsonCache.ts) ────────
//
// Why a JS twin: Vercel's bundler hates sibling-TS imports from api/*.ts,
// so this file stays JS. The KV semantics are the same: read local first,
// fall back to KV (hydrate local on hit), write through to both. Errors
// are swallowed + throttled-warned so a flaky KV never breaks a request
// path. Used by `handleRevenueSegmentation` so the locked-premium state
// and the segment payload both persist across cold starts.
const kw = {
  warned: {},
  local: new NodeCache({ stdTTL: 3600, maxKeys: 10000 }),
};
const _kwWarn = (key, ...rest) => {
  const now = Date.now();
  if (kw.warned[key] && now - kw.warned[key] < 60000) return;
  kw.warned[key] = now;
  // eslint-disable-next-line no-console
  console.warn(...rest);
};
const _kwExec = async (cmd, ...args) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(process.env.KV_REST_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([cmd, ...args]),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`KV ${cmd} failed: ${r.status} ${r.statusText}`);
    // Upstash REST returns a single `{ result: ... }` object for a
    // one-command POST (or `{ error: "..." }` on failure) — NOT the
    // `[err, value]` tuple. Parse the real shape so GET hits actually
    // hydrate instead of always reading as a miss. Mirrors the TS twin
    // in server/helpers/kvJsonCache.ts.
    const json = await r.json();
    if (json && typeof json === "object" && "error" in json)
      return [json.error, null];
    return [null, json?.result ?? null];
  } finally {
    clearTimeout(timeoutId);
  }
};
const _kwEnabled = () =>
  !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
// Exported for the parity tripwire spec (`_router.kv-cache-parity.spec.ts`)
// which pins this twin's behavior against server/helpers/kvJsonCache.ts.
export const kvJsonCache = {
  async getJSON(key) {
    const local = kw.local.get(key);
    if (local !== undefined) return local;
    if (!_kwEnabled()) return null;
    try {
      const [err, value] = await _kwExec("GET", key);
      if (err || value === null || value === undefined) return null;
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      // Bounded mirror TTL (1h) so a short-TTL payload like the 5-min
      // `rateLimited` lock can't serve stale for the process lifetime
      // after KV expires it. Mirrors the TS twin's hydration cap.
      kw.local.set(key, parsed, 3600);
      return parsed;
    } catch (e) {
      _kwWarn(
        `kvJsonCache.get:${key}`,
        "[kvJsonCache] KV GET failed (returning null):",
        e?.message,
      );
      return null;
    }
  },
  async setJSON(key, value, ttlSeconds) {
    kw.local.set(key, value, Math.max(1, ttlSeconds));
    if (!_kwEnabled()) return;
    try {
      await _kwExec(
        "SET",
        key,
        JSON.stringify(value),
        "EX",
        Math.max(1, ttlSeconds),
      );
    } catch (e) {
      _kwWarn(
        `kvJsonCache.set:${key}`,
        "[kvJsonCache] KV SET failed (local cache still updated):",
        e?.message,
      );
    }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
let _lastWarned = {};
let _lastWarnSweepAt = 0;
const WARN_THROTTLE_MS = 60000;
const WARN_MAP_SOFT_CAP = 512;
function throttledWarn(key, ...args) {
  const now = Date.now();
  // Keys embed dynamic ids (symbol, pair), so the map is bounded two
  // ways: an amortized sweep (at most once per window) drops expired
  // entries, and a hard cap evicts oldest-inserted keys — a sustained
  // sweep of unique non-expired keys can neither grow this map
  // unboundedly nor pay per-write full scans.
  if (now - _lastWarnSweepAt >= WARN_THROTTLE_MS) {
    _lastWarnSweepAt = now;
    for (const k of Object.keys(_lastWarned)) {
      if (now - _lastWarned[k] >= WARN_THROTTLE_MS) delete _lastWarned[k];
    }
  }
  // Throttle check BEFORE eviction: a repeated-but-throttled key must
  // not make room it doesn't need — otherwise sustained repeats drain
  // fresh guards from other keys (or its own).
  if (_lastWarned[key] && now - _lastWarned[key] < WARN_THROTTLE_MS) return;
  const keys = Object.keys(_lastWarned);
  while (keys.length >= WARN_MAP_SOFT_CAP) {
    const oldest = keys[0];
    delete _lastWarned[oldest];
    keys.shift();
  }
  _lastWarned[key] = now;
  console.warn(...args);
}

function toNum(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizePercentage(v) {
  const n = toNum(v);
  if (n === undefined) return undefined;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

/**
 * Yahoo-quote field mapping is shared with the Express server via
 * `server/services/yahooQuoteShape.ts` (imported below with the `.js`
 * extension, same mechanism as `apiUsageTracker.js`). The former local
 * copy drifted from the TS implementation — most visibly multiplying
 * `earningsTimestamp` by 1000 unconditionally, producing year-52k dates
 * whenever upstream sent milliseconds. Kept as a thin exported wrapper
 * so `api/_router.yahoo-quote-parity.spec.ts` can pin the lock-step.
 */
export function normalizeQuote(q, symbol) {
  return normalizeYahooQuote(q, symbol);
}

function normalizeChartPoint(r) {
  const close = Number(r.close ?? 0);
  const prev = Number(r.open ?? close);
  return {
    date:
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date ?? ""),
    open: toNum(r.open) ?? 0,
    high: toNum(r.high) ?? 0,
    low: toNum(r.low) ?? 0,
    close,
    adjClose: toNum(r.adjclose ?? r.close) ?? 0,
    volume: Number(r.volume ?? 0),
    change: close - prev,
    changePercent: prev > 0 ? ((close - prev) / prev) * 100 : 0,
  };
}

async function getYahooQuote(symbol) {
  const cacheKey = `quote_${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const q = await yf.quote(symbol);
    const result = normalizeQuote(q, symbol);
    cache.set(cacheKey, result, QUOTE_TTL);
    return result;
  } catch (e) {
    throttledWarn(
      `yahoo_quote_js:${symbol}`,
      `[router] yahoo quote failed for ${symbol}:`,
      e?.message,
    );
    return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Classifies an HTTP probe status into a provider status label.
 *
 * Intentionally DUPLICATES `classifyProviderResult` in
 * `shared/providerHealth.ts` — this file is plain JS that Vercel's bundler
 * refuses to link against TS imports (see the header comment). Keep the two
 * in lockstep; `api/_router.classify.spec.ts` asserts parity across the
 * status matrix, so a drift fails CI instead of shipping silently.
 *
 * `handleProviderHealth` MUST keep calling this module-scope function —
 * re-inlining the logic there would bypass the parity net while the spec
 * still passes.
 *
 * 402 = endpoint not on the current plan (known restriction, e.g. FMP
 * batch-quote on the free tier). 403 stays degraded — ambiguous between
 * plan gating and a revoked/broken key, so it keeps surfacing. 429 =
 * temporary rate limit (degraded).
 */
export function classify(status, errorMessage) {
  if (status === 200) return errorMessage ? "degraded" : "ok";
  if (status === 402) return "known_restriction";
  if (status === 403 || status === 429) return "degraded";
  return "down";
}

export async function handleDemo(req, res) {
  res.json({ message: "Hello from Vantage API" });
}

export async function handleStockQuote(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const result = await getYahooQuote(symbol);
  res.json(result);
}

export async function handleBatchQuotes(req, res) {
  // Shared symbols-query validation — same cap, invalid-ticker
  // rejection, dedupe, and error bodies as the Express twin. Before this
  // delegation the serverless copy forwarded raw client lists straight
  // to Yahoo (no 50 cap, no ticker check, duplicates included).
  // Identical parameter selection to the Express twin: an explicit
  // ?symbols= wins (even empty → 400), otherwise fall back to ?symbol=
  // (including its repeated-value array form).
  const parsed = parseSymbolsQuery(
    req.query?.symbols !== undefined ? req.query?.symbols : req.query?.symbol,
  );
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const quotes = await Promise.all(parsed.symbols.map(getYahooQuote));
  res.json({ quotes });
}

export async function handleIndexQuotes(req, res) {
  const cacheKey = "index_quotes";
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [sp500, nasdaq, dow] = await Promise.all([
    yf.quote("^GSPC").catch(() => null),
    yf.quote("^IXIC").catch(() => null),
    yf.quote("^DJI").catch(() => null),
  ]);

  const wrap = (q, name, sym) =>
    q
      ? {
          symbol: sym,
          name,
          price: toNum(q.regularMarketPrice) ?? 0,
          change: toNum(q.regularMarketChange) ?? 0,
          changesPercentage: toNum(q.regularMarketChangePercent) ?? 0,
        }
      : null;

  const result = {
    sp500: wrap(sp500, "S&P 500", "^GSPC"),
    nasdaq: wrap(nasdaq, "Nasdaq", "^IXIC"),
    dow: wrap(dow, "Dow Jones", "^DJI"),
  };
  cache.set(cacheKey, result, QUOTE_TTL);
  res.json(result);
}

export async function handleStockOverview(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  // KV-backed cross-instance cache (parity twin of
  // stockService.getProfileValidation). Company profiles are
  // slow-moving; 1h TTL keeps the description / sector stable across
  // lambda cold starts.
  const ck = `profile_${symbol}`;
  const cached = await kvJsonCache.getJSON(ck);
  if (cached) return res.json(cached);
  try {
    const q = await yf.quote(symbol);
    const result = q
      ? {
          symbol: q.symbol || symbol,
          companyName: q.longName || q.shortName || q.displayName || symbol,
          description: q.longBusinessSummary || "",
          sector: q.sector || "",
          industry: q.industry || "",
          ceo: "",
          fullTimeEmployees: null,
          beta: toNum(q.beta),
          peRatio: toNum(q.trailingPE),
          marketCap: toNum(q.marketCap),
          price: toNum(q.regularMarketPrice),
          exchange: q.exchange,
          currency: q.currency,
          image: "",
        }
      : {
          symbol,
          companyName: symbol,
          description: "",
          sector: "",
          industry: "",
          ceo: "",
          fullTimeEmployees: null,
          beta: null,
          peRatio: null,
        };
    // 1h for a real profile so cold-started peers see the same
    // company description; the empty-shape fallback uses a shorter TTL
    // so a transient Yahoo miss recovers quickly.
    await kvJsonCache.setJSON(ck, result, q ? 3600 : 30);
    return res.json(result);
  } catch (e) {
    throttledWarn(`overview:${symbol}`, `overview ${symbol}:`, e?.message);
    return res.json({
      symbol,
      companyName: symbol,
      description: "",
      sector: "",
      industry: "",
      ceo: "",
      fullTimeEmployees: null,
      beta: null,
      peRatio: null,
    });
  }
}

// Yahoo returns summary fields either as bare numbers (defaultKeyStatistics)
// or as `{ raw, fmt }` objects (financialData, summaryDetail). `pick()`
// normalises both shapes: bare → itself, object → .raw, anything missing → undefined.
function pick(v) {
  if (v == null) return undefined;
  if (typeof v === "object" && "raw" in v)
    return Number.isFinite(Number(v.raw)) ? Number(v.raw) : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Converts Yahoo's `endDate` field. The history modules return ISO strings
// already, but a few other sub-fields (splitDate, fiscalYearEnd) come back
// as Unix seconds. Single helper so both go through one normalisation path.
function isoDate(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^d{4}-d{2}-d{2}/.test(s)) return s.slice(0, 10);
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

// Calendar year derived from an end-date.
function calYearOf(isoD) {
  return isoD ? isoD.slice(0, 4) : "";
}

export async function handleStockMetrics(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  // KV-backed cross-instance cache (parity twin of
  // stockService.getMetrics). Metrics are slow-moving between earnings,
  // so we extend the TTL from 10 min to 1h — a freshly-deployed peer
  // reads the same payload from KV instead of re-quoting Yahoo.
  const ck = `metrics_${symbol}`;
  const cached = await kvJsonCache.getJSON(ck);
  if (cached) return res.json(cached);

  try {
    // Catch returns `{}` so the per-module `.defaultKeyStatistics || {}` paths
    // never blow up on a partial Yahoo response.
    const raw = await yf
      .quoteSummary(symbol, {
        modules: ["defaultKeyStatistics", "financialData", "summaryDetail"],
      })
      .catch((e) => {
        throttledWarn(
          `qs:metrics:${symbol}`,
          `quoteSummary metrics ${symbol}:`,
          e?.message,
        );
        return {};
      });
    const dks = raw?.defaultKeyStatistics || {};
    const fd = raw?.financialData || {};
    const sd = raw?.summaryDetail || {};

    // Backfill `symbol` so `peRatioTTM`, etc., match the shared StockMetrics type
    // — the interface allows the key but the request URL is the source of truth.
    const metrics = {
      revenuePerShareTTM: pick(fd.revenuePerShare),
      netIncomePerShareTTM: pick(dks.trailingEps),
      operatingCashFlowPerShareTTM: pick(
        fd.operatingCashflow != null && fd.sharesOutstanding
          ? fd.operatingCashflow / fd.sharesOutstanding
          : undefined,
      ),
      peRatioTTM: pick(sd.trailingPE) ?? pick(dks.forwardPE),
      // SummaryDetail yields are decimal fractions; normalize at the API boundary.
      dividendYieldTTM:
        pick(sd.dividendYield) != null
          ? pick(sd.dividendYield) * 100
          : pick(sd.trailingAnnualDividendYield) != null
            ? pick(sd.trailingAnnualDividendYield) * 100
            : undefined,
      priceToSalesRatioTTM:
        pick(sd.priceToSalesTrailing12Months) ?? pick(dks.enterpriseToRevenue),
      priceToBookRatioTTM: pick(dks.priceToBook),
      evToSalesTTM: pick(dks.enterpriseToRevenue),
      evToEBITDATTM: pick(dks.enterpriseToEbitda),
      evToOperatingCashFlowTTM: undefined, // Yahoo free tier doesn't expose EV / OCF cleanly
      // financialData percent fields are decimal fractions (0.2639 =
      // 26.39%); normalize to percent units so renderers display them
      // correctly — mirrors stockService's Yahoo-path normalization.
      returnOnEquityTTM: normalizePercentage(fd.returnOnEquity),
      returnOnAssetsTTM: normalizePercentage(fd.returnOnAssets),
      freeCashFlowYieldTTM: undefined, // would need price + diluted shares — not derivable cheaply
    };

    const ratios = {
      priceEarningsRatioTTM: pick(sd.trailingPE),
      priceToBookRatioTTM: pick(dks.priceToBook),
      priceToSalesRatioTTM:
        pick(sd.priceToSalesTrailing12Months) ?? pick(dks.enterpriseToRevenue),
      priceToEarningsGrowthRatioTTM: pick(dks.pegRatio),
      // Same fraction→percent normalization as the metrics block above.
      netProfitMargin:
        normalizePercentage(fd.profitMargins) ??
        normalizePercentage(dks.profitMargins),
      operatingProfitMarginTTM: normalizePercentage(fd.operatingMargins),
      grossProfitMarginTTM: normalizePercentage(fd.grossMargins),
      dividendPayoutRatioTTM: normalizePercentage(sd.payoutRatio),
      currentRatio: pick(fd.currentRatio),
      quickRatio: pick(fd.quickRatio),
      debtToEquityRatio: pick(fd.debtToEquity),
    };

    // Strip undefined keys so the payload is tight.
    const clean = (o) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

    // Parity note: this Vercel twin is deliberately Yahoo-only (no FMP
    // financial-scores fetch — keeps the serverless path keyless and within
    // the free FMP budget). Scores are therefore always null here; the
    // client scorecard badges this as unavailable instead of inventing data.
    // The TS server path (stockService.getMetrics) serves real FMP scores.
    const result = {
      metrics: clean(metrics),
      ratios: clean(ratios),
      scores: null,
      source: "yahoo",
    };
    // 1h KV TTL — ratios don't tick minute-to-minute, and the
    // cross-instance write means a second lambda cold-start reads
    // the same Yahoo snapshot instead of paying for another
    // quoteSummary round-trip.
    await kvJsonCache.setJSON(ck, result, 3600);
    res.json(result);
  } catch (e) {
    throttledWarn(`metrics:${symbol}`, `metrics ${symbol}:`, e?.message);
    res.json({ metrics: {}, ratios: {}, scores: null, source: null });
  }
}

/**
 * Revenue broken down by product segment (FMP `revenue-product-segmentation`).
 * Parity mirror of `handleRevenueSegmentation` in `server/routes/stock-data.ts`
 * so local dev and serverless return the same shape: `{ rows, rateLimited,
 * unavailable }`. `rateLimited` (429/403 or an FMP error body) lets the
 * client fall back to the plain total-revenue card while keeping the
 * segment filters visible as a locked premium feature. `period` (annual|
 * quarter) selects the reporting granularity served to the modal's toggle.
 *
 * Caching: cross-instance via `kvJsonCache` (Upstash REST when
 * `KV_REST_API_URL` + `KV_REST_API_TOKEN` are present, in-process
 * NodeCache otherwise) so the locked-premium state and the segment
 * payload both survive cold starts. Rate-limited payloads use a 5-min
 * TTL so cold-started lambdas don't re-attempt a quota FMP still
 * refuses; healthy payloads use a 1-hour TTL matching FMP's row caps.
 */
export async function handleRevenueSegmentation(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const period = req.query?.period === "quarter" ? "quarter" : "annual";
  const ck = `revSeg_${symbol}_${period}`;
  const cached = await kvJsonCache.getJSON(ck);
  if (cached) return res.json(cached);

  if (!process.env.FMP_KEY) {
    const noKey = { rows: [], rateLimited: false, unavailable: true };
    // Stable config — 1h TTL means a freshly-deployed peer instance
    // learns "no FMP key" from KV instead of probing every request.
    await kvJsonCache.setJSON(ck, noKey, 3600);
    return res.json(noKey);
  }

  apiUsageTracker.recordCall && apiUsageTracker.recordCall("fmp");
  const url = `https://financialmodelingprep.com/stable/revenue-product-segmentation?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${period === "quarter" ? 8 : 5}&apikey=${process.env.FMP_KEY}`;
  try {
    const r = await fetch(url);
    if (r.status === 429 || r.status === 403) {
      apiUsageTracker.recordRateLimit && apiUsageTracker.recordRateLimit("fmp");
      const limited = { rows: [], rateLimited: true, unavailable: false };
      await kvJsonCache.setJSON(ck, limited, 300);
      return res.json(limited);
    }
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    // FMP signals quota exhaustion with HTTP 200 + an error body.
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (typeof data["Error Message"] === "string" ||
        typeof data.error === "string" ||
        typeof data.message === "string")
    ) {
      apiUsageTracker.recordRateLimit && apiUsageTracker.recordRateLimit("fmp");
      const limited = { rows: [], rateLimited: true, unavailable: false };
      await kvJsonCache.setJSON(ck, limited, 300);
      return res.json(limited);
    }

    const rows = normalizeRevenueSegmentationRows(data, symbol);
    const payload = { rows, rateLimited: false, unavailable: false };
    await kvJsonCache.setJSON(ck, payload, 3600);
    return res.json(payload);
  } catch (e) {
    throttledWarn(
      `revSeg:${symbol}`,
      `revenue-product-segmentation ${symbol}:`,
      e?.message,
    );
    return res.json({ rows: [], rateLimited: false, unavailable: false });
  }
}

/**
 * Parses FMP `revenue-product-segmentation` payloads into the shared row
 * shape. Accepts both the nested (`products: [{name, revenue}]`) and flat
 * (`data: [{name, revenue}]`) shapes FMP has shipped, plus
 * `product`/`segment` and `value`/`revenueValue` aliases.
 */
function normalizeRevenueSegmentationRows(raw, symbol) {
  if (!Array.isArray(raw)) return [];
  const toFinite = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const rows = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const date = String(item.date ?? "");
    const fiscalYear = String(
      item.fiscalYear ?? item.calendarYear ?? (date ? date.slice(0, 4) : ""),
    );
    const period = String(item.period ?? "FY");
    const rawProducts = Array.isArray(item.products)
      ? item.products
      : Array.isArray(item.data)
        ? item.data
        : [];
    const products = [];
    for (const entry of rawProducts) {
      if (!entry || typeof entry !== "object") continue;
      const name = String(
        entry.name ?? entry.product ?? entry.segment ?? "",
      ).trim();
      const revenue = toFinite(
        entry.revenue ?? entry.value ?? entry.revenueValue,
      );
      if (!name || revenue === null) continue;
      products.push({ name, revenue });
    }
    rows.push({
      date,
      symbol: String(item.symbol ?? symbol),
      reportedCurrency: String(item.reportedCurrency ?? "USD"),
      fiscalYear,
      period,
      totalRevenue:
        products.length > 0
          ? products.reduce((acc, p) => acc + p.revenue, 0)
          : null,
      products,
    });
  }
  return rows;
}

/**
 * Income / balance / cash rows for the requested symbol.
 *
 * Primary path (default): yahoo-finance2 v4 `fundamentalsTimeSeries()` over
 * kebab-case modules `financials` / `balance-sheet` / `cash-flow` + a
 * `type` of `annual` or `quarterly`. Yahoo points users here since their
 * `quoteSummary` history modules have been returning sparse data since
 * Nov 2024 — see https://github.com/gadicc/yahoo-finance2/blob/master/src/modules/fundamentalsTimeSeries.d.ts.
 *
 * Each module call returns a flat array. We fan out the 3 calls in
 * parallel via `Promise.allSettled` so a sparse balance-sheet response
 * (NVDA returned only 7 fields in probe) doesn't block the income
 * rows. The eventual cache entry is one object per (symbol, period)
 * with arrays for all three statements; partial returns are intentional.
 *
 * Fallback path: `quoteSummary` history modules. Kept behind the
 * `YAHOO_FUNDAMENTALS_PRIMARY=quoteSummary` env var so we can flip back
 * if the new path rate-limits or breaks. Same field shapes either way —
 * `Index.tsx`'s 8-card grid reads `revenue, ebitda, grossProfit,
 * operatingIncome, eps, netIncome, cashAndCashEquivalents, totalAssets`
 * by exact name.
 *
 * `?period=quarter` switches both paths to quarterly sources: FTS uses
 * `type: 'quarterly'`, the legacy uses `*HistoryQuarterly` modules.
 *
 * `periodType` ('12M' = FY, '3M' = Q) drives the `period` label so
 * downstream `safeYoy()` year-over-year math still aligns.
 */
export async function handleStockFinancials(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const period =
    String(req.query?.period || "annual").toLowerCase() === "quarter"
      ? "quarter"
      : "annual";
  // KV-backed cross-instance cache (parity twin of
  // stockService.getFinancialStatements). Fundamentals are slow-moving
  // — a freshly-deployed peer reads the same Yahoo FTS snapshot from
  // KV instead of paying for three more finance/balance/cash
  // round-trips plus a possible Yahoo fallback.
  const ck = `fin_${symbol}_${period}`;
  const cached = await kvJsonCache.getJSON(ck);
  if (cached) return res.json(cached);

  // Strict: only the literal string `"quoteSummary"` flips us to the legacy
  // path. Default (unset / empty / random value) → FTS. Negative env values
  // like `=0` or `=false` don't accidentally toggle the flag.
  const isFts = process.env.YAHOO_FUNDAMENTALS_PRIMARY !== "quoteSummary";
  let income = [],
    balance = [],
    cash = [];

  try {
    if (isFts) {
      // ── Primary: fundamentalsTimeSeries ──────────────────────────────────────
      // period1 = 5y back covers annual rows; quarterly type returns ~5 quarters
      // over a 2y window so we use the same fetch range for both.
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 5);
      const t = period === "quarter" ? "quarterly" : "annual";

      const fanOut = (module, label) =>
        yf
          .fundamentalsTimeSeries(symbol, { module, period1, type: t })
          .catch((e) => {
            throttledWarn(
              `fts:${label}:${symbol}`,
              `fts ${label} ${symbol}:`,
              e?.message,
            );
            return null;
          });

      const [finRes, balRes, cshRes] = await Promise.all([
        fanOut("financials", "fin"),
        fanOut("balance-sheet", "bs"),
        fanOut("cash-flow", "cf"),
      ]);

      // First-non-undefined lookup across a list of candidate Yahoo field names.
      // The module returns a SINGLE flat array per call — not nested by module
      // name — so we just map over the array and read each row's per-section
      // keys directly. Empty rows (e.g. NVDA's slim balance-sheet response)
      // produce undefined fields but the row is preserved so the date axis
      // stays aligned across income/balance/cash.
      const ftsGet = (r, keys) => {
        if (!r) return undefined;
        for (const k of keys) {
          const v = r[k];
          if (v !== undefined && v !== null) {
            const n = Number(v);
            return Number.isFinite(n) ? n : undefined;
          }
        }
        return undefined;
      };

      const processFtsRow = (r, kind) => {
        const date = isoDate(r.date);
        // Use the URL param (intent) instead of `r.periodType` to derive the
        // label — Yahoo's `periodType` is `'12M' | '3M'`, but if anything
        // returns mixed during an upstream anomaly we still emit the
        // label that matches what the client requested.
        const periodLabel = period === "quarter" ? "Q" : "FY";
        const row = {
          date,
          symbol,
          reportedCurrency: "USD",
          calendarYear: calYearOf(date),
          period: periodLabel,
        };
        if (kind === "income") {
          row.revenue = ftsGet(r, ["totalRevenue", "operatingRevenue"]) ?? 0;
          row.costOfRevenue = ftsGet(r, ["costOfRevenue"]);
          row.grossProfit = ftsGet(r, ["grossProfit"]);
          row.operatingIncome = ftsGet(r, ["operatingIncome", "ebit"]);
          row.operatingExpense = ftsGet(r, ["operatingExpense"]);
          row.ebitda = ftsGet(r, ["normalizedEBITDA", "ebitda"]) ?? 0;
          row.netIncome =
            ftsGet(r, ["netIncome", "netIncomeCommonStockholders"]) ?? 0;
          row.eps = ftsGet(r, ["basicEPS", "dilutedEPS"]);
          row.epsDiluted = ftsGet(r, ["dilutedEPS"]);
        } else if (kind === "balance") {
          // Annual rows have `totalAssets`; quarterly rows sometimes come
          // back as `quarterlyTotalAssets`. Probe both.
          row.totalAssets =
            ftsGet(r, ["totalAssets", "quarterlyTotalAssets"]) ?? 0;
          row.totalLiabilities = ftsGet(r, [
            "totalLiabilitiesNetMinorityInterest",
          ]);
          row.totalEquity = ftsGet(r, [
            "stockholdersEquity",
            "totalEquityGrossMinorityInterest",
          ]);
          row.totalDebt = ftsGet(r, ["totalDebt", "longTermDebt"]);
          row.cashAndCashEquivalents =
            ftsGet(r, ["cashAndCashEquivalents", "cash"]) ?? 0;
          row.netDebt =
            ftsGet(r, ["netDebt"]) ??
            (row.totalDebt ?? 0) - row.cashAndCashEquivalents;
        } else if (kind === "cash") {
          const explicitOcf = ftsGet(r, [
            "operatingCashFlow",
            "cashFlowFromContinuingOperatingActivities",
          ]);
          row.operatingCashFlow = explicitOcf ?? 0;
          row.capitalExpenditure = ftsGet(r, ["capitalExpenditure"]);
          // Yahoo reports capex as a negative on the cash flow statement;
          // flip so client UI's `FCF = OCF - Capex` reads naturally.
          const capex =
            row.capitalExpenditure !== undefined
              ? -Math.abs(row.capitalExpenditure)
              : 0;
          // Don't derive `freeCashFlow` from a missing OCF (would yield a
          // misleading 0-0=0). Prefer an explicit Yahoo FCF; fall back to
          // math only when OCF is present; otherwise leave undefined so
          // `stripUndef` drops the key.
          const explicitFcf = ftsGet(r, ["freeCashFlow"]);
          row.freeCashFlow =
            explicitFcf !== undefined
              ? explicitFcf
              : explicitOcf !== undefined
                ? (row.operatingCashFlow || 0) - capex
                : undefined;
          row.stockBasedCompensation = ftsGet(r, ["stockBasedCompensation"]);
          row.dividendPayments = ftsGet(r, [
            "cashDividendsPaid",
            "dividendsPaid",
          ]);
        }
        return stripUndef(row);
      };

      if (Array.isArray(finRes))
        income = finRes.map((r) => processFtsRow(r, "income"));
      if (Array.isArray(balRes))
        balance = balRes.map((r) => processFtsRow(r, "balance"));
      if (Array.isArray(cshRes))
        cash = cshRes.map((r) => processFtsRow(r, "cash"));

      const result = { income, balance, cash };
      // 6h TTL — fundamentalsTimeSeries modules propagate asynchronously at
      // Yahoo's end (income may land before balance sheet on earnings day),
      // so 6h strikes the balance between fresh and not-thrashing rate limits.
      await kvJsonCache.setJSON(ck, result, 21600);
      res.json(result);
      return;
    }

    // ── Fallback: quoteSummary history modules (legacy) ────────────────────────
    const modules =
      period === "quarter"
        ? [
            "incomeStatementHistoryQuarterly",
            "balanceSheetHistoryQuarterly",
            "cashflowStatementHistoryQuarterly",
          ]
        : [
            "incomeStatementHistory",
            "balanceSheetHistory",
            "cashflowStatementHistory",
          ];
    const raw = await yf.quoteSummary(symbol, { modules }).catch((e) => {
      throttledWarn(
        `qs:fin:${symbol}`,
        `quoteSummary fin ${symbol}:`,
        e?.message,
      );
      return {};
    });

    const incRoot = raw?.[modules[0]] || {};
    const balRoot = raw?.[modules[1]] || {};
    const cshRoot = raw?.[modules[2]] || {};
    // Yahoo nests the rows under either `*Statements` (new layout) or the
    // module name itself (older libs). Try both — whichever resolves wins.
    const incRows =
      incRoot.incomeStatementHistory ||
      incRoot.incomeStatementHistoryQuarterly ||
      incRoot.incomeStatements ||
      incRoot.incomeStatementHistoryStatements ||
      [];
    const balRows =
      balRoot.balanceSheetHistory ||
      balRoot.balanceSheetHistoryQuarterly ||
      balRoot.balanceSheetStatements ||
      [];
    const cshRows =
      cshRoot.cashflowStatementHistory ||
      cshRoot.cashflowStatementHistoryQuarterly ||
      cshRoot.cashflowStatements ||
      [];

    const symbolRow = (r, kind, section) => {
      const date = isoDate(r.endDate);
      const calendarYear = calYearOf(date);
      const periodLabel = section || (period === "quarter" ? "Q" : "FY");
      const row = {
        date,
        symbol,
        reportedCurrency: "USD",
        calendarYear,
        period: periodLabel,
      };
      if (kind === "income") {
        row.revenue = pick(r.totalRevenue) ?? 0;
        row.costOfRevenue = pick(r.costOfRevenue);
        row.grossProfit = pick(r.grossProfit);
        row.operatingIncome = pick(r.operatingIncome);
        row.operatingExpense = pick(r.totalOperatingExpenses);
        row.ebitda = pick(r.ebitda) ?? 0;
        row.netIncome = pick(r.netIncome) ?? 0;
        row.eps = pick(r.dilutedEPS) ?? pick(r.basicEPS);
        row.epsDiluted = pick(r.dilutedEPS);
      } else if (kind === "balance") {
        row.totalAssets = pick(r.totalAssets) ?? 0;
        row.totalLiabilities = pick(r.totalLiab);
        row.totalEquity = pick(r.totalStockholderEquity);
        row.totalDebt = pick(r.totalDebt) ?? pick(r.longTermDebt);
        row.cashAndCashEquivalents = pick(r.cash) ?? 0;
        row.netDebt = (row.totalDebt ?? 0) - row.cashAndCashEquivalents;
      } else if (kind === "cash") {
        row.operatingCashFlow = pick(r.totalCashFromOperatingActivities) ?? 0;
        row.capitalExpenditure = pick(r.capitalExpenditures);
        // Yahoo reports capex as a negative on the cash flow statement;
        // flip so client UI's `FCF = OCF - Capex` reads naturally.
        const capex =
          row.capitalExpenditure !== undefined
            ? -Math.abs(row.capitalExpenditure)
            : 0;
        row.freeCashFlow = row.operatingCashFlow - capex;
        row.stockBasedCompensation = pick(r.stockBasedCompensation);
        row.dividendPayments = pick(r.dividendsPaid);
      }
      return row;
    };

    const incomeLegacy = incRows.map((r) =>
      stripUndef(symbolRow(r, "income", period === "quarter" ? "Q" : "FY")),
    );
    const balanceLegacy = balRows.map((r) =>
      stripUndef(symbolRow(r, "balance", period === "quarter" ? "Q" : "FY")),
    );
    const cashLegacy = cshRows.map((r) =>
      stripUndef(symbolRow(r, "cash", period === "quarter" ? "Q" : "FY")),
    );

    const result = {
      income: incomeLegacy,
      balance: balanceLegacy,
      cash: cashLegacy,
    };
    await kvJsonCache.setJSON(ck, result, 86400); // 24h — quarterly statements don't change daily
    res.json(result);
  } catch (e) {
    throttledWarn(`fin:${symbol}`, `financials ${symbol}:`, e?.message);
    res.json({ income: [], balance: [], cash: [] });
  }
}

// Strip undefined keys from a row so the JSON wire payload is tight.
// Lifted out of handleStockFinancials' body so both primary and fallback
// paths can reuse it without duplicating the filter.
function stripUndef(o) {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  );
}

export async function handleStockAnalyst(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const ck = `analyst_${symbol}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  try {
    const raw = await yf.quoteSummary(symbol, { modules: ["earningsTrend"] });
    const trend = raw?.earningsTrend?.trend ?? [];
    const result = trend.map((p) => ({
      period: String(p.period || ""),
      endDate: p.endDate,
      growth: p.growth?.raw,
      earningsEstimate: p.earningsEstimate
        ? {
            avg: p.earningsEstimate.avg?.raw ?? null,
            low: p.earningsEstimate.low?.raw ?? null,
            high: p.earningsEstimate.high?.raw ?? null,
          }
        : undefined,
      revenueEstimate: p.revenueEstimate
        ? {
            avg: p.revenueEstimate.avg?.raw ?? null,
            low: p.revenueEstimate.low?.raw ?? null,
            high: p.revenueEstimate.high?.raw ?? null,
          }
        : undefined,
      epsTrend: p.epsTrend
        ? {
            current: p.epsTrend.current?.raw ?? null,
            sevenDaysAgo: p.epsTrend["7daysAgo"]?.raw ?? null,
            thirtyDaysAgo: p.epsTrend["30daysAgo"]?.raw ?? null,
          }
        : undefined,
    }));
    cache.set(ck, result);
    res.json(result);
  } catch (e) {
    throttledWarn(`analyst:${symbol}`, `analyst ${symbol}:`, e?.message);
    res.json([]);
  }
}

/**
 * Pulls a numeric value out of one of several real-world Yahoo shapes:
 *   - plain number,
 *   - numeric string,
 *   - `{ raw: <number>, fmt: "<formatted>" }` object (legacy / some sessions).
 * Returns `null` for anything else (including the literal `null` and `""`)
 * so the caller decides on `—` instead of receiving a phantom 0.
 *
 * Mirrors `toNumberLoose` in `server/services/stockService.ts` \u2014 keep in
 * lockstep so the Vercel router and the local-server router return
 * the same shape for the same upstream record.
 */
function toNumberLoose(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    const raw = value.raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    const fmt = value.fmt;
    if (typeof fmt === "string") {
      const n = Number(fmt);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Pulls a UTC-ms timestamp out of one of several real-world Yahoo
 * `startDate` shapes: `Date` object, ISO string, `{raw, fmt}` object, or
 * plain number (treated as unix-seconds when < 1e12, ms otherwise).
 *
 * Returns `null` for anything pre-1990 so the UI renders "—" instead of
 * `1/1/1970` for genuinely missing / unparseable dates.
 *
 * Mirrors `toDateMs` in `server/services/stockService.ts`.
 */
function toDateMs(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms >= Date.UTC(1990, 0, 1) ? ms : null;
  }
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) && ms >= Date.UTC(1990, 0, 1) ? ms : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= Date.UTC(1990, 0, 1))
      return parsed;
    return null;
  }
  if (typeof value === "object") {
    const raw = value.raw;
    if (typeof raw === "number") {
      const ms = raw < 1e12 ? raw * 1000 : raw;
      if (Number.isFinite(ms) && ms >= Date.UTC(1990, 0, 1)) return ms;
    } else if (typeof raw === "string") {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed) && parsed >= Date.UTC(1990, 0, 1))
        return parsed;
    }
    const fmt = value.fmt;
    if (typeof fmt === "string") {
      const parsed = Date.parse(fmt);
      if (Number.isFinite(parsed) && parsed >= Date.UTC(1990, 0, 1))
        return parsed;
    }
  }
  return null;
}

export async function handleStockInsider(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const ck = `insider_${symbol}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  try {
    const raw = await yf.quoteSummary(symbol, {
      modules: ["insiderTransactions"],
    });
    const txs = raw?.insiderTransactions?.transactions ?? [];
    const result = txs.map((t) => {
      const shares = toNumberLoose(t.shares);
      const value = toNumberLoose(t.value);
      const startDate = toDateMs(t.startDate);
      const safeShares = shares ?? 0;
      const safeValue = value ?? 0;
      // `price` is meaningful only for cash transactions; UI labels the
      // row with the free-text `transactionText` but the per-code price/
      // value render relies on `transactionCode`.
      return {
        filerName: String(t.filerName || t.name || "Insider"),
        filerRelation:
          typeof t.filerRelation === "string"
            ? t.filerRelation
            : (t.filerRelation?.raw ?? undefined),
        transactionText: String(t.transactionText || t.type || "Transaction"),
        transactionCode:
          typeof t.transactionCode === "string"
            ? t.transactionCode.trim().toUpperCase() || null
            : null,
        startDate,
        shares: safeShares,
        value: safeValue,
        // Cap by non-negative so a fishy upstream `value < 0` can't crash
        // the renderer; UI uses price only for cash transactions so this
        // is harmless there.
        price: safeShares > 0 && safeValue > 0 ? safeValue / safeShares : 0,
      };
    });
    cache.set(ck, result);
    res.json(result);
  } catch (e) {
    throttledWarn(`insider:${symbol}`, `insider ${symbol}:`, e?.message);
    res.json([]);
  }
}

export async function handleStockNews(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const ck = `news_${symbol}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  try {
    // newsCount: 12 — bumped from 5 so the in-app news card on
    // /stock/:ticker has enough rows for a real news-feed feel
    // (with thumbnails). 12 is comfortable under Yahoo's
    // ~20-25 free-tier ceiling. Keep in lockstep with
    // server/services/stockService.ts getNews.
    const raw = await yf.search(symbol, { newsCount: 12 });
    const items = raw?.news ?? [];
    const result = items.map((n) => {
      const c = n.content ?? n;
      return {
        title: String(c.title || c.headline || n.title || ""),
        publisher: String(
          c.providerName || c.publisher || n.publisher || "News",
        ),
        providerPublishTime:
          typeof c.providerPublishTime === "number"
            ? c.providerPublishTime
            : Math.floor(Date.now() / 1000),
        link: String(c.clickUrl || c.url || c.link || n.link || "#"),
        // Yahoo v4 returns thumbnails under `c.thumbnail.resolutions[]` for
        // most items; older sessions put it at the top level. Pick the
        // highest-resolution variant and let the renderer fall back to a
        // gradient placeholder if both are missing.
        thumbnail: c.thumbnail?.resolutions?.[0]?.url || c.thumbnail,
        type: c.type,
      };
    });
    cache.set(ck, result);
    res.json(result);
  } catch (e) {
    throttledWarn(`news:${symbol}`, `news ${symbol}:`, e?.message);
    res.json([]);
  }
}

export async function handleStockChart(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const ck = `chart_${symbol}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);
    const raw = await yf.historical(symbol, { period1, interval: "1d" });
    const rows = Array.isArray(raw) ? raw : (raw?.quotes ?? []);
    if (!rows.length) return res.json(null);
    const result = { symbol, historical: rows.map(normalizeChartPoint) };
    cache.set(ck, result, CHART_TTL);
    res.json(result);
  } catch (e) {
    throttledWarn(`chart:${symbol}`, `chart ${symbol}:`, e?.message);
    res.json(null);
  }
}

const FMP_USE_STABLE = process.env.FMP_USE_STABLE !== "0";
// `/stable/` uses `earnings-calendar` (plural, hyphen); legacy v3 still
// accepts `earning_calendar`. Mirrors EARNINGS_ENDPOINT in stockService.ts.
const EARNINGS_ENDPOINT = FMP_USE_STABLE
  ? "earnings-calendar"
  : "earning_calendar";
const MAX_EARNINGS_ENRICH_SYMBOLS = 100; // protect provider quotas on unusually large calendars

function normalizeEarningEvent(raw) {
  const toNum = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    symbol: String(raw.symbol ?? ""),
    date: String(raw.date ?? ""),
    marketCap: toNum(raw.marketCap ?? raw.mktCap),
    epsEstimated: toNum(raw.epsEstimated ?? raw.epsEstimate),
    eps: toNum(raw.eps),
    revenueEstimated: toNum(raw.revenueEstimated ?? raw.revenueEstimate),
    revenue: toNum(raw.revenue),
    time: String(raw.time ?? "bmo"),
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDateStr(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * FMP earnings calendar for a date window — parity twin of
 * `stockService.getEarningsCalendar` (Express). This used to be a stub
 * returning `[]` unconditionally, so Vercel deployments served an
 * always-empty calendar while local dev showed real data. Validation,
 * normalization, caching, and bounded market-cap enrichment (via Yahoo
 * quotes, deduped, capped at MAX_EARNINGS_ENRICH_SYMBOLS) mirror the
 * TS side; `api/_router.earnings-calendar.spec.ts` pins the contract.
 */
export async function handleEarningsCalendar(req, res) {
  const from = String(req.query?.from || "");
  const to = String(req.query?.to || "");
  if (!isIsoDateStr(from) || !isIsoDateStr(to)) {
    return res
      .status(400)
      .json({ error: "from and to must be valid YYYY-MM-DD dates" });
  }
  const rangeDays =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
    86_400_000;
  if (rangeDays < 0 || rangeDays > 31) {
    return res
      .status(400)
      .json({ error: "date range must be between 0 and 31 days" });
  }
  const ck = `earnings_cal_${from}_${to}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  const FMP_KEY = process.env.FMP_KEY;
  if (!FMP_KEY) return res.json([]);
  // 12s deadline mirroring fetchJSONStatus in stockService.ts — a hung
  // FMP request must not pin the serverless function.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const base = FMP_USE_STABLE ? "stable" : "api/v3";
    const r = await fetch(
      `https://financialmodelingprep.com/${base}/${EARNINGS_ENDPOINT}?from=${from}&to=${to}&apikey=${FMP_KEY}`,
      { signal: ctrl.signal },
    );
    if (!r.ok) throw new Error(`http_${r.status}`);
    const raw = await r.json();
    const result = Array.isArray(raw) ? raw.map(normalizeEarningEvent) : [];

    // FMP's calendar often omits market cap; enrich distinct symbols from
    // the quote path so the client's large/mid/small filters work.
    const symbols = Array.from(
      new Set(result.map((e) => e.symbol.trim().toUpperCase()).filter(Boolean)),
    ).slice(0, MAX_EARNINGS_ENRICH_SYMBOLS);
    if (symbols.length > 0) {
      const quotes = await Promise.all(symbols.map(getYahooQuote));
      const marketCaps = new Map();
      for (const quote of quotes) {
        if (!quote?.symbol || !quote.marketCap || quote.marketCap <= 0)
          continue;
        marketCaps.set(String(quote.symbol).toUpperCase(), quote.marketCap);
      }
      for (const event of result) {
        event.marketCap ??= marketCaps.get(event.symbol.toUpperCase()) ?? null;
      }
    }

    cache.set(ck, result);
    res.json(result);
  } catch (e) {
    throttledWarn(
      `earnings_cal:${from}..${to}`,
      `earnings calendar ${from}..${to}:`,
      e?.message,
    );
    res.json([]);
  } finally {
    clearTimeout(timer);
  }
}

export const handleStockProfile = handleStockOverview;

function parseSectorMetaParam(value) {
  if (value === undefined || value === null || String(value).trim() === "")
    return {};
  const entries = String(value).split(",");
  if (entries.length > 50) return null;
  const out = {};
  for (const entry of entries) {
    const sep = entry.indexOf(":");
    if (sep <= 0 || sep === entry.length - 1) return null;
    const symbol = entry.slice(0, sep).trim().toUpperCase();
    const sector = entry.slice(sep + 1).trim();
    if (
      !/^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(symbol) ||
      !sector ||
      sector.length > 64 ||
      !/^[A-Za-z0-9 &-]+$/.test(sector)
    )
      return null;
    out[symbol] = sector;
  }
  return out;
}

function sectorNameForSymbol(symbol) {
  const sectors = {
    AAPL: "Technology",
    MSFT: "Technology",
    NVDA: "Technology",
    AVGO: "Technology",
    AMD: "Technology",
    INTC: "Technology",
    CSCO: "Technology",
    ORCL: "Technology",
    AMAT: "Technology",
    GOOGL: "Communication Services",
    GOOG: "Communication Services",
    META: "Communication Services",
    NFLX: "Communication Services",
    AMZN: "Consumer Cyclical",
    TSLA: "Consumer Cyclical",
    HD: "Consumer Cyclical",
    LLY: "Healthcare",
    JNJ: "Healthcare",
    UNH: "Healthcare",
    ABBV: "Healthcare",
    JPM: "Financial Services",
    BRKA: "Financial Services",
    V: "Financial Services",
    MA: "Financial Services",
    BAC: "Financial Services",
    XOM: "Energy",
    CVX: "Energy",
    WMT: "Consumer Defensive",
    PG: "Consumer Defensive",
    KO: "Consumer Defensive",
    COST: "Consumer Defensive",
    CAT: "Industrials",
    GE: "Industrials",
    PLD: "Real Estate",
    NEE: "Utilities",
    LIN: "Basic Materials",
  };
  return sectors[symbol] || null;
}

async function aggregateFallbackHeatmap(symbols, days, curated) {
  const cacheKey = `sector_heatmap_${days}_${symbols.slice().sort().join(",")}_${JSON.stringify(curated)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const period1 = new Date();
  period1.setDate(period1.getDate() - Math.max(14, days + 2));
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const history = await yf.historical(symbol, { period1, interval: "1d" });
      const rows = (Array.isArray(history) ? history : history?.quotes || [])
        .map((point) => ({
          date:
            point.date instanceof Date
              ? point.date.toISOString().slice(0, 10)
              : String(point.date || "").slice(0, 10),
          close: Number(point.close),
        }))
        .filter(
          (point) =>
            /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
            Number.isFinite(point.close) &&
            point.close > 0,
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        symbol,
        sector: curated[symbol] || sectorNameForSymbol(symbol),
        history: rows,
      };
    }),
  );
  const input = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const dates = [
    ...new Set(
      input.flatMap((row) => row.history.slice(1).map((point) => point.date)),
    ),
  ]
    .sort()
    .slice(-days);
  const grouped = new Map();
  const untagged = [];
  for (const item of input) {
    if (!item.sector) {
      untagged.push({ symbol: item.symbol, cells: [] });
      continue;
    }
    const sector = item.sector;
    let group = grouped.get(sector);
    if (!group) {
      group = { sector, universeCount: 0, series: [], cellsByDate: new Map() };
      grouped.set(sector, group);
    }
    group.universeCount += 1;
    group.series.push(item.history);
  }
  const rows = [...grouped.values()]
    .map((group) => {
      const daily = dates.map((date) => {
        const moves = [];
        for (const history of group.series) {
          const index = history.findIndex((point) => point.date === date);
          if (index > 0 && history[index - 1].close > 0)
            moves.push(
              ((history[index].close - history[index - 1].close) /
                history[index - 1].close) *
                100,
            );
        }
        return {
          date,
          movePct: moves.length
            ? moves.reduce((sum, value) => sum + value, 0) / moves.length
            : null,
          withPrice: moves.length,
          total: group.universeCount,
          isPartial: false,
        };
      });
      const nets = group.series
        .map((history) =>
          history.length > 1
            ? ((history[history.length - 1].close -
                history[Math.max(0, history.length - days - 1)].close) /
                history[Math.max(0, history.length - days - 1)].close) *
              100
            : null,
        )
        .filter((value) => value !== null && Number.isFinite(value));
      return {
        sector: group.sector,
        cells: daily,
        weekNet: nets.length
          ? nets.reduce((sum, value) => sum + value, 0) / nets.length
          : null,
        universeCount: group.universeCount,
      };
    })
    .sort((a, b) => (b.weekNet ?? -Infinity) - (a.weekNet ?? -Infinity));
  const result = {
    days: dates,
    rows,
    untagged,
    generatedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, result, 900);
  return result;
}

export async function handleSectorHeatmap(req, res) {
  // Identical symbols-query validation to the Express twin (same cap,
  // ticker contract, dedupe, and error bodies).
  const parsed = parseSymbolsQuery(req.query?.symbols);
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const { symbols } = parsed;
  const days = Math.max(
    3,
    Math.min(10, Math.floor(Number(req.query?.days ?? 5)) || 5),
  );
  const curated = parseSectorMetaParam(req.query?.sectorMeta);
  if (curated === null)
    return res.status(400).json({ error: "invalid sector metadata parameter" });
  const result = await aggregateFallbackHeatmap(symbols, days, curated);
  res.json(result);
}

export async function handleInsightsTab(req, res) {
  const tab = String(req.query?.tab || "sp500");
  const validKey = Object.prototype.hasOwnProperty.call(
    insightsTabUniverses,
    tab,
  )
    ? tab
    : "sp500";
  res.json({
    tab: validKey,
    label: insightsTabLabels[validKey],
    entries: insightsTabUniverses[validKey] ?? insightsTabUniverses.sp500,
  });
}

export async function handleInsightsTabsAll(_req, res) {
  res.json(insightsTabUniverses);
}

export async function handleSmaDistances(req, res) {
  // Shared symbols-query validation — same parser, error bodies, and
  // dedupe/case-folding semantics as the Express twin
  // (server/routes/stock-data.ts). Before this delegation the serverless
  // copy forwarded invalid tickers to Yahoo per-symbol, emitted a
  // different over-limit message, kept duplicates, and produced a NaN
  // windowSize for non-numeric ?window= values.
  const parsed = parseSymbolsQuery(req.query?.symbols ?? req.query?.symbol);
  if (parsed.ok === false) return res.status(parsed.status).json(parsed.body);
  const symbols = parsed.symbols;
  const windowRaw = Number(req.query?.window ?? 200);
  const windowSize = Math.max(
    5,
    Math.min(200, Number.isFinite(windowRaw) ? Math.floor(windowRaw) : 200),
  );
  const rows = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 1);
        const r = await yf.historical(sym, { period1, interval: "1d" });
        const chart = Array.isArray(r) ? r : (r?.quotes ?? []);
        const closes = chart
          .map((p) => Number(p.close))
          .filter((n) => Number.isFinite(n) && n > 0);
        const tail = closes.slice(-windowSize);
        if (!tail.length)
          return {
            symbol: sym,
            sma200: null,
            distancePct: null,
            sampleSize: 0,
            price: null,
          };
        const sum = tail.reduce((s, n) => s + n, 0);
        const mean = sum / tail.length;
        const price = tail[tail.length - 1];
        return {
          symbol: sym,
          sma200: mean,
          distancePct: mean > 0 ? ((price - mean) / mean) * 100 : null,
          sampleSize: tail.length,
          price,
        };
      } catch (e) {
        throttledWarn(
          `sma:${sym}`,
          `[router] sma history failed for ${sym}:`,
          e?.message,
        );
        return {
          symbol: sym,
          sma200: null,
          distancePct: null,
          sampleSize: 0,
          price: null,
        };
      }
    }),
  );
  res.json({ rows });
}

export async function handleProviderHealth(req, res) {
  const TIMEOUT_MS = 8000;
  // FMP/AV return HTTP 200 with an error body for rate limits / bad keys —
  // detect those and treat as degraded (mirrors stockService.getProviderHealth).
  const detectError = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") return null;
      const msg =
        parsed["Error Message"] ??
        parsed.Note ??
        parsed.Information ??
        parsed.error ??
        parsed.message ??
        null;
      return typeof msg === "string" && msg.length > 0 ? msg : null;
    } catch {
      return null;
    }
  };
  const probeUrl = async (url) => {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      const text = await r.text();
      const errorMessage = detectError(text);
      const httpStatus = r.status;
      const classifiedStatus = classify(httpStatus, errorMessage);
      return {
        httpStatus,
        status: classifiedStatus,
        latencyMs: Date.now() - t0,
        detail: errorMessage || (r.ok ? undefined : `http_${httpStatus}`),
      };
    } catch {
      return {
        status: "down",
        latencyMs: Date.now() - t0,
        detail: "network error",
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const withTimeout = (promise, ms) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });

  const FMP_KEY = process.env.FMP_KEY || process.env.VITE_FMP_KEY || "";
  const [yahoo, yahooChart, fmpEntries, av] = await Promise.all([
    (async () => {
      const t0 = Date.now();
      try {
        const q = await withTimeout(yf.quote("AAPL"), TIMEOUT_MS);
        const price = Number(q?.regularMarketPrice ?? 0);
        return {
          provider: "yahoo",
          feature: "quote",
          status: price > 0 ? "ok" : "down",
          latencyMs: Date.now() - t0,
          detail: price > 0 ? undefined : "empty quote",
        };
      } catch (e) {
        return {
          provider: "yahoo",
          feature: "quote",
          status: "down",
          latencyMs: Date.now() - t0,
          detail: e?.message ?? "error",
        };
      }
    })(),
    // Yahoo — chart round-trip distinguishes chart-only outages (Charts
    // page, heatmaps, SMA) from quote outages. Mirrors handleStockChart's
    // yf.historical call; any positive close counts as data.
    (async () => {
      const t0 = Date.now();
      try {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 1);
        const r = await withTimeout(
          yf.historical("AAPL", { period1, interval: "1d" }),
          TIMEOUT_MS,
        );
        const rows = Array.isArray(r) ? r : (r?.quotes ?? []);
        const hasClose = rows.some((p) => Number(p?.close ?? 0) > 0);
        return {
          provider: "yahoo",
          feature: "chart",
          status: hasClose ? "ok" : "down",
          latencyMs: Date.now() - t0,
          detail: hasClose ? undefined : "empty chart",
        };
      } catch (e) {
        return {
          provider: "yahoo",
          feature: "chart",
          status: "down",
          latencyMs: Date.now() - t0,
          detail: e?.message ?? "error",
        };
      }
    })(),
    // FMP — quote + batch-quote probes (batch-quote is 402 paid-gated on
    // the free tier → known_restriction, not a temporary outage). Each
    // upstream call is recorded through apiUsageTracker for diagnostics.
    // reflects the additional probe budget cost regardless of which
    // router served the request.
    FMP_KEY
      ? Promise.all([
          probeUrl(
            `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${FMP_KEY}`,
          ).then((r) => {
            if (r.httpStatus === 429 || r.httpStatus === 403)
              apiUsageTracker.recordRateLimit &&
                apiUsageTracker.recordRateLimit("fmp");
            apiUsageTracker.recordCall && apiUsageTracker.recordCall("fmp");
            const { httpStatus, ...entry } = r;
            return { provider: "fmp", feature: "quote", ...entry };
          }),
          probeUrl(
            `https://financialmodelingprep.com/stable/batch-quote?symbols=AAPL,MSFT,NVDA&apikey=${FMP_KEY}`,
          ).then((r) => {
            if (r.httpStatus === 429 || r.httpStatus === 403)
              apiUsageTracker.recordRateLimit &&
                apiUsageTracker.recordRateLimit("fmp");
            apiUsageTracker.recordCall && apiUsageTracker.recordCall("fmp");
            const { httpStatus, ...entry } = r;
            return { provider: "fmp", feature: "batch-quote", ...entry };
          }),
        ])
      : Promise.resolve([
          {
            provider: "fmp",
            feature: "quote",
            status: "not_configured",
            latencyMs: null,
          },
          {
            provider: "fmp",
            feature: "batch-quote",
            status: "not_configured",
            latencyMs: null,
          },
        ]),
    process.env.AV_KEY
      ? probeUrl(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${process.env.AV_KEY}`,
        ).then((r) => {
          if (apiUsageTracker.recordCall)
            apiUsageTracker.recordCall("alphavantage");
          if (r.httpStatus === 429 || r.httpStatus === 403)
            apiUsageTracker.recordRateLimit &&
              apiUsageTracker.recordRateLimit("alphavantage");
          const { httpStatus, ...entry } = r;
          return { provider: "alphavantage", feature: "quote", ...entry };
        })
      : Promise.resolve({
          provider: "alphavantage",
          feature: "quote",
          status: "not_configured",
          latencyMs: null,
        }),
  ]);

  const providers = [
    yahoo,
    yahooChart,
    ...(Array.isArray(fmpEntries) ? fmpEntries : [fmpEntries]),
    av,
  ];
  res.json({
    checkedAt: new Date().toISOString(),
    providers,
    // known_restriction is an expected plan limitation, not an outage.
    healthy: providers.every(
      (p) => p.status === "ok" || p.status === "known_restriction",
    ),
  });
}

/**
 * Yahoo-driven fallback for the Index financial-metrics grid when FMP is
 * rate-limited (HTTP 429 from `/stable/`). Mirrors the parity method
 * `getYahooFallbackFinancials` in server/services/stockService.ts so the
 * Vercel deployment (which uses this plain-JS router) returns
 * the same response shape as the local TypeScript path. Always returns a
 * strict-shape object (never throws): missing upstream values normalise
 * to `null` so the client renders em-dashes instead of a misleading
 * zero.
 */
export async function handleStockYahooFallbackFinancials(req, res) {
  const symbol = String(req.query?.symbol || "").toUpperCase();
  if (!symbol)
    return res.status(400).json({ error: "symbol parameter required" });
  const ck = `yahoo_fallback_financials_${symbol}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  // Null-safe numeric extractor — coerce both `{ raw, fmt }` objects and
  // bare numbers; missing anything → `null`. Mirrors the TS-side helper
  // in stockService.getYahooFallbackFinancials.
  const extractNum = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof v === "object" && v !== null) {
      const raw = v.raw;
      const fmt = v.fmt;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string") {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
      if (typeof fmt === "string") {
        const n = Number(fmt);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  // `margin: 0.18` (a fraction) is what Yahoo ships; downstream UI
  // treats margin fields as percent so multiply by 100 here.
  const extractMarginPct = (v) => {
    const n = extractNum(v);
    return n == null ? null : n * 100;
  };
  try {
    // Modules mirror the TS path exactly: defaultKeyStatistics (EV, eps,
    // debt), financialData (revenue, EBITDA, margins), earningsTrend
    // (next-quarter consensus EPS / revenue).
    const raw = await yf.quoteSummary(symbol, {
      modules: ["defaultKeyStatistics", "financialData", "earningsTrend"],
    });
    const dks = raw?.defaultKeyStatistics || {};
    const fd = raw?.financialData || {};
    const trends = raw?.earningsTrend?.trend || [];
    const nextQtr = trends.find((t) => t?.period === "+1q");
    const result = {
      revenue: extractNum(fd.totalRevenue),
      ebitda: extractNum(fd.ebitda),
      grossProfit: extractNum(fd.grossProfits),
      operatingMargin: extractMarginPct(fd.operatingMargins),
      profitMargin: extractMarginPct(fd.profitMargins),
      grossMargin: extractMarginPct(fd.grossMargins),
      revenueGrowth: extractMarginPct(fd.revenueGrowth),
      earningsGrowth: extractMarginPct(fd.earningsGrowth),
      totalCash: extractNum(fd.totalCash),
      totalDebt: extractNum(fd.totalDebt),
      enterpriseValue: extractNum(dks.enterpriseValue),
      trailingEps: extractNum(dks.trailingEps),
      forwardEps: extractNum(dks.forwardEps),
      epsEstimateNextQtr: extractNum(nextQtr?.earningsEstimate?.avg),
      revenueEstimateNextQtr: extractNum(nextQtr?.revenueEstimate?.avg),
    };
    cache.set(ck, result, 300);
    res.json(result);
  } catch (e) {
    throttledWarn(
      `yahoo-fallback:${symbol}`,
      `yahoo fallback ${symbol}:`,
      e?.message,
    );
    res.json({
      revenue: null,
      ebitda: null,
      grossProfit: null,
      operatingMargin: null,
      profitMargin: null,
      grossMargin: null,
      revenueGrowth: null,
      earningsGrowth: null,
      totalCash: null,
      totalDebt: null,
      enterpriseValue: null,
      trailingEps: null,
      forwardEps: null,
      epsEstimateNextQtr: null,
      revenueEstimateNextQtr: null,
    });
  }
}

export async function handleFxRates(req, res) {
  const raw = String(req.query?.currencies || "USD,ILS,EUR");
  const valid = new Set(["USD", "ILS", "EUR", "GBP"]);
  const currencies = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => valid.has(s));
  if (!currencies.length)
    return res.status(400).json({ error: "currencies parameter required" });
  const ck = `fx_${currencies.slice().sort().join(",")}`;
  const cached = cache.get(ck);
  if (cached) return res.json(cached);
  const pairs = [];
  for (const base of currencies)
    for (const quote of currencies)
      if (base !== quote) pairs.push(`${base}${quote}=X`);
  const settled = await Promise.all(
    pairs.map(async (sym) => {
      try {
        const r = await yf.quote(sym);
        const px = Number(r?.regularMarketPrice ?? NaN);
        return Number.isFinite(px) && px > 0
          ? [sym.replace("=X", ""), px]
          : null;
      } catch (e) {
        throttledWarn(
          `fx_pair:${sym}`,
          `[router] fx pair failed for ${sym}:`,
          e?.message,
        );
        return null;
      }
    }),
  );
  const rates = { USDUSD: 1 };
  for (const s of settled) if (s) rates[s[0]] = s[1];
  const result = {
    rates,
    fetchedAt: new Date().toISOString(),
    source: "yahoo",
  };
  cache.set(ck, result, 3600);
  res.json(result);
}

// ── Router ────────────────────────────────────────────────────────────────────
// Logos load client-side directly from Logo.dev's CDN (see `client/lib/logoDev.ts`).
// There is no longer a server-side proxy route.
const routes = {
  "/api/demo": handleDemo,
  "/api/stock-quote": handleStockQuote,
  "/api/stock-batch-quotes": handleBatchQuotes,
  "/api/stock-profile": handleStockProfile,
  "/api/stock-overview": handleStockOverview,
  "/api/stock-financials": handleStockFinancials,
  "/api/stock-metrics": handleStockMetrics,
  "/api/stock-revenue-segmentation": handleRevenueSegmentation,
  "/api/stock-analyst": handleStockAnalyst,
  "/api/stock-insider": handleStockInsider,
  "/api/stock-news": handleStockNews,
  "/api/earnings-calendar": handleEarningsCalendar,
  "/api/stock-chart": handleStockChart,
  "/api/index-quotes": handleIndexQuotes,
  "/api/sector-heatmap": handleSectorHeatmap,
  "/api/insights-tab": handleInsightsTab,
  "/api/insights-tabs-all": handleInsightsTabsAll,
  "/api/sma-distances": handleSmaDistances,
  "/api/fx-rates": handleFxRates,
  "/api/provider-health": handleProviderHealth,
  "/api/stock-yahoo-fallback-financials": handleStockYahooFallbackFinancials,
};

export async function router(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const fn = routes[path];
  if (!fn) {
    res.status(404).json({ error: `Not found: ${path}` });
    return;
  }
  try {
    await fn(req, res);
  } catch (e) {
    console.error(`[router] ${path} error:`, e);
    res
      .status(500)
      .json({ error: "Internal server error", detail: e?.message });
  }
}
