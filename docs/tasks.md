# Vantage — Task Tracker

## Research alternative approaches

1. **Trending Browse** — **Status:** live FMP market-movers are wired in (`server/services/stockService.ts` → `getTrendingUniverse()` + `fetchTrendingMovers()`), with the 12-ticker curated list (`insightsUniverses.ts`) as the fallback; the Trending filter now ranks by |% move| in `client/pages/Insights.tsx`. **Endpoint:** FMP `/stable/biggest-gainers` + `/stable/biggest-losers` + `/stable/most-actives`. **Calls:** 3 parallel FMP requests per 60s server-side cache window (one per endpoint), coalesced through an in-flight registry — i.e. worst case 3 calls/minute when the page is actively refreshed. All three are on the **free (Basic)** plan; right now they return HTTP 429 "Limit Reach" because the 250 calls/day quota is exhausted, not a premium gate (verified: free endpoints `quote`/`profile` return the same 429).

---

## Next up — chosen Alpha Scope features (tracker)

Shipped to date (from `docs/alpha-scope-missing-metrics.md`): company website, net debt, trending browse, **revenue by segment**, **P/CF · P/FCF · ROIC** — 7 of 12 gaps closed.

Still open (5 gaps): dividend payout frequency, P/E·P/S history, peers table, catalysts, risks.

Ranked by effort — payout frequency adds **zero new FMP requests** (important while the 250/day quota is rate-limiting); the rest need a new route or provider:

### 0. Revenue by segment — ✅ done (PR #21)

FMP `revenue-product-segmentation` (annual `limit=5` / quarter `limit=8`) → `RevenueSegmentsCard` on the company-page charts grid + stacked-bar chart modal with an annual/quarter granularity toggle. Backed by `/api/stock-revenue-segmentation` (TS path in `server/services/stockService.ts` + parity mirror in `api/_router.js`), cached through Vercel KV (`server/helpers/kvJsonCache.ts`) so the locked-premium state propagates across lambda cold starts. When the free FMP quota is exhausted (or no `FMP_KEY` is set) the card falls back to the plain total-revenue chart with a locked "Segments 🔒" chip and a placeholder `PricingModal` (`client/components/PricingModal.tsx`).

### 1. Surface already-fetched fields: company website + Net Debt — ✅ done

Pure client work — both fields are already normalized and reachable from existing hooks, they are just never rendered.

- **Company website** — `client/components/CompanyProfile.tsx`: in the id-chips row, render a clickable "Website" chip from `overviewData?.website` (`CompanyProfile.website`, already mapped in `stockService.normalizeProfile`). Wrap as `<a href target="_blank" rel="noopener noreferrer">` and only render when present.
- **Net Debt** — `client/components/StockFundamentalsStrip.tsx`: add a `MetricRow` in the "Balance" group with `value={formatMoney(balance?.netDebt)}` and `source` from `balanceSource`. `BalanceSheetRow.netDebt` already exists and `normalizeBalanceRow` already maps it. Keep it provider-reported only (the component's stated contract) — no `totalDebt − cash` fallback for now.

### 2. Add P/CF, P/FCF, ROIC (TTM) ratios — ✅ done

FMP already fetches `key-metrics-ttm` + `ratios-ttm` in `stockService.getMetrics()` and casts the raw records straight into the shared types — so adding fields to the types made them flow through with **no server logic change**.

- `shared/api.ts`: added `priceToOperatingCashFlowRatioTTM?` (FMP's real `/stable/ratios-ttm` name) + legacy alias `priceToCashFlowRatioTTM?` and `priceToFreeCashFlowRatioTTM?` to `RatiosTTM`; added `roicTTM?` to `KeyMetricsTTM`.
- `server/services/stockService.ts`: no change — the `(r0 || {}) as RatiosTTM` / `(m0 || {}) as KeyMetricsTTM` casts carry the new fields. Yahoo's metrics modules don't expose these, so they show "Unavailable" unless the FMP source is live.
- `client/components/StockFundamentalsStrip.tsx`: added "P/CF" and "P/FCF" rows to the "Cash Flow" group (`formatNumber`) and "ROIC" to "Margins & Growth" (`formatPercent`). The FMP metrics path normalizes all percent fields (netProfitMargin, FCF Yield, Dividend Yield, Payout Ratio, ROIC, margins, ROE/ROA) to percent units at the API boundary via `fmpToPercent` (both TS + JS twins) — the strip contract is percent units.
- Verify: `pnpm exec tsc --noEmit` + `StockFundamentalsStrip.ratioRows.spec.tsx` (3 tests) — 451 tests green.

**Deferred:** payout frequency needs a small server derivation (dividend payment dates are not exposed to the client yet), so it is not bundled into #1.

**Next:** payout frequency (small server derivation from dividend payment dates), then P/E·P/S history (new `/api/stock-ratios` historical route + chart cards), peers table (new `/api/stock-peers` route), then Catalysts/Risks (new OpenAI provider + key).
