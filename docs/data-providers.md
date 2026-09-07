# Data Providers

How every data point in Vantage gets its data: primary source, fallback chain,
and free-tier availability for **FMP**, **Yahoo Finance**, **Finnhub**, and
**AlphaVantage**.

> Status verified against the current keys on **2026-08-02** (see
> [scripts/fmp-audit.ts](../scripts/fmp-audit.ts) — run `pnpm fmp:audit` to
> re-verify anytime).

---

## 1. Provider overview

| Provider                             | Env key                          | Free tier                                                    | Notes                                                                                                                                    |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Yahoo Finance** (`yahoo-finance2`) | none required                    | Unlimited, no key                                            | Unofficial API (scrapes Yahoo). Free and the default workhorse. Rate-limited only by politeness — heavy fan-out risks 429s.              |
| **FMP** (Financial Modeling Prep)    | `FMP_KEY`                        | 250 req/day, 500 MB/30 days, **US tickers only**, 5y history | Uses `/stable/` endpoints by default. Legacy `/api/v3/` is **403-dead** for current keys (pre-Aug-2025 subscribers only).                |
| **Finnhub**                          | `FINNHUB_KEY`                    | 60 req/min                                                   | **Configured but currently dead code** — only imported by the unwired `stockAggregator.ts` and an unregistered route (see §5).           |
| **AlphaVantage**                     | `AV_KEY`                         | 25 req/day                                                   | Last-resort single-quote fallback only.                                                                                                  |
| **Logo.dev**                         | `VITE_LOGO_DEV_KEY` (build-time) | Free tier                                                    | Client-side logo CDN (`client/lib/logoDev.ts`); ops-rotatable via Vercel env, with a literal `pk_` fallback in code if the env is unset. |

**Architecture rule of thumb:** Yahoo is the always-on base layer; FMP
augments with fundamentals; AlphaVantage is the emergency brake; Finnhub is
vestigial.

### 1a. Per-process counter → cross-instance (Vercel KV)

The `/api/provider-usage` footer pill fires `apiUsageTracker.recordCall(…)`
on every upstream call. By default the bucket lives in **in-process memory**
(LocalMemoryStore) — fine for `pnpm dev` and single-instance deploys, but
across multiple Vercel lambdas each cold start starts at 0 and the
aggregated count diverges from the provider's own dashboard.

To converge, provision a free-tier Vercel KV (Upstash Redis-compatible) and
let Vercel auto-inject `KV_REST_API_URL` + `KV_REST_API_TOKEN` env vars:

1. **Dashboard:** [vercel.com/dashboard](https://vercel.com/dashboard) →
   Storage → KV → Create Database → name it `vantage-usage` → pick the
   closest region. Vercel connects to your project and writes the env vars
   automatically.
2. **CLI (in an interactive terminal):** `vercel integration add
upstash/upstash-kv`. The Upstash legal-terms acceptance REQUIRES a human
   in the loop; do it in your own shell.
3. **Verify:** `curl
'https://vantage.vercel.app/api/provider-usage?mode=status'` — expect
   `{ "store": "VercelKvStore", "kvConfigured": true, "ready": true }`.

Once Vercel KV is live, every lambda instance's `mirrors` hydrate from
KV on cold start (`≤50ms`), and any subsequent recordCall's fire-and-forget
write replicates across instances. Reads stay fast (in-process mirror).

Free-tier cost: 30K writes + 300K reads/month = ample headroom for ~250
FMP calls/day.

> **No `vercel kv create` command:** the v56 CLI delegates KV provisioning
> to the marketplace integration flow (`upstash/upstash-kv`). Programmatic
> database creation from a non-interactive shell is intentionally not
> supported — only the integration-terms acceptance is interactive; once
> it's installed, all CRUD is via the dashboard or API.

### 1b. Per-route cache → cross-instance (Vercel KV)

`/api/stock-revenue-segmentation` is the first non-counter route to
promote its cache from the in-process `NodeCache` to **Vercel KV**
(`server/helpers/kvJsonCache.ts`, mirrored as a JS twin in
`api/_router.js`). Rationale:

- **Locked-premium state survives cold starts.** When the FMP
  free-tier daily quota is exhausted, the first lambda to discover
  that writes `rateLimited: true` to KV. Subsequent cold-started
  lambdas read the same payload from KV instead of issuing another
  429 to FMP — the revenue card's `Segments` lock chip stays stable
  instead of flickering as users hop between lambda instances.
- **No-config hydration.** A deployment without `KV_REST_API_URL`
  set still works perfectly per-instance via the in-process NodeCache
  mirror; no setup required.
- **KV errors are swallowed + throttled-logged.** A flaky KV never
  breaks the request path — the local mirror is always written first,
  KV writes are fire-and-forget with a 5s timeout, and reads return
  `null` from KV on error (the local mirror is then consulted).

TTL policy:

| Response                                             | TTL   | Reason                                                                                   |
| ---------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| Healthy row payload                                  | 1 h   | FMP caps the endpoint at ~10 rows; re-fetching sooner is wasted quota.                   |
| `rateLimited: true` (HTTP 429/403 or FMP error body) | 5 min | Hard backoff so a quota FMP still refuses is not re-banged.                              |
| `unavailable: true` (no `FMP_KEY`)                   | 1 h   | Stable config — fresh peers learn "no FMP key" from KV instead of probing every request. |

Adding KV to other routes: import `kvJsonCache` from
`server/helpers/kvJsonCache.ts` (or the JS twin in `api/_router.js`)
and call `get<T>(key)` / `set<T>(key, value, ttlSeconds)` instead of
the raw NodeCache. Both `api/_router.js` and `server/services/…` paths
must keep their implementations in lock-step — the JS twin exists
because Vercel's `@vercel/node` bundler does not allow sibling-TS
imports in `api/*.ts`.

Currently migrated (slow-changing financial routes only — quote /
chart / news / FX stay on the in-process NodeCache because they
are hot-path and ephemeral):

| Route                                                              | Method                                                                          | TTL                                             | Why                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/stock-revenue-segmentation` (`getRevenueSegmentation`)       | FMP `revenue-product-segmentation`                                              | 1h healthy / 5min rate-limited / 1h unavailable | First non-counter migration; locked-premium state is the headline use case.                                     |
| `/api/stock-overview` (`getProfileValidation` + parity mirror)     | FMP `profile` (TS) / Yahoo `quote()` (parity)                                   | 1h for real profile / 30s for empty fallback    | Profiles are slow-moving; company description + sector stay stable across instances.                            |
| `/api/stock-metrics` (`getMetrics` + parity mirror)                | FMP `key-metrics-ttm` + ratios + scores (TS) / Yahoo `quoteSummary` x3 (parity) | 1h                                              | Ratios don't tick minute-to-minute; the cross-instance mirror saves a `quoteSummary` round-trip per cold start. |
| `/api/stock-financials` (`getFinancialStatements` + parity mirror) | FMP income/balance/cash (TS) / Yahoo FTS (parity)                               | 1h (TS) / 6h FTS / 24h quoteSummary fallback    | Three statement families per call; skipping three FMP fan-outs on cold start is the headline savings.           |

Routes deliberately NOT migrated: quote (60s TTL, fan-out is per-symbol
and rate-limit-sensitive), chart (10min but re-fetched on mount per
session), news (5min, content churn), FX (1h but the upstream Yahoo
rate is already bursty and a stale rate would UX-confuse a converter),
provider-health (probe-driven, intentionally fresh), earnings calendar
(24h + slow-changing; rationale below).

---

## 2. Data point → source map

Live API routes are wired in `server/index.ts`; every endpoint below is a
live route backed by `stockService`.

| Data point                        | Route                             | Primary                                                                                                         | Fallback chain                                                                           | Free-tier availability                                                                                                                                                      |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single quote**                  | `/api/stock-quote`                | Yahoo `quote()`                                                                                                 | FMP `/stable/quote` → AlphaVantage                                                       | ✅ Yahoo free; FMP free; AV only on its 25/day budget                                                                                                                       |
| **Batch quotes**                  | `/api/stock-batch-quotes`         | FMP `/stable/batch-quote`                                                                                       | per-symbol Yahoo via `resolveOrderedBatch` (bounded concurrency)                         | ⚠️ FMP batch-quote is **402 paid-gated** — every batch falls back to one Yahoo call per symbol (still free, live data)                                                      |
| **Index quotes** (DOW/SPX/NASDAQ) | `/api/index-quotes`               | Yahoo `^GSPC ^IXIC ^DJI`                                                                                        | FMP multi-symbol quote (also 402)                                                        | ✅ Yahoo first; FMP fallback is paid-gated noise                                                                                                                            |
| **Stock chart** (OHLC)            | `/api/stock-chart`                | FMP `/stable/historical-price-eod/full`                                                                         | Yahoo `chart()`                                                                          | ✅ both free; FMP returns full OHLC (~1,250 bars)                                                                                                                           |
| **Chart history** (periods)       | `/api/chart-history`              | Yahoo `chart()` (5m→1wk intervals)                                                                              | daily retry                                                                              | ✅ free                                                                                                                                                                     |
| **Company profile**               | `/api/stock-overview`             | FMP `/stable/profile`                                                                                           | — (returns 503 if unavailable)                                                           | ✅ FMP free                                                                                                                                                                 |
| **Financial statements**          | `/api/stock-financials`           | FMP income/balance/cash                                                                                         | —                                                                                        | ✅ FMP free (route requests `limit=5`, which returns 5 years of statements)                                                                                                 |
| **Revenue by segment**            | `/api/stock-revenue-segmentation` | FMP `revenue-product-segmentation` (annual `limit=5`, quarter `limit=8`)                                        | — (locked premium card on rate-limit miss)                                               | ✅ FMP free; KV-backed cache (§1b) so the `rateLimited` lock state propagates across lambdas                                                                                |
| **Company profile**               | `/api/stock-overview`             | Yahoo `quote()` (parity mirror) / FMP `profile` (TS path via `getProfileValidation`)                            | —                                                                                        | ✅ both free; KV-backed cache (§1b, 1h for real profile / 30s for empty fallback) so a freshly-deployed peer reads company description + sector from KV                     |
| **Key metrics / ratios / scores** | `/api/stock-metrics`              | FMP `key-metrics-ttm`, `ratios-ttm`, `financial-scores` (TS) / Yahoo `quoteSummary` x3 (parity mirror)          | —                                                                                        | ✅ FMP free (200s verified) / Yahoo free; KV-backed cache (§1b, 1h TTL) so a cold-started lambda reads the same ratios from KV                                              |
| **Financial statements**          | `/api/stock-financials`           | FMP income/balance/cash (TS, 5y default / 7q quarter) / Yahoo `fundamentalsTimeSeries` (parity mirror, 6h TTL)  | Yahoo FTS (TS path when FMP missing) → `quoteSummary` history (parity fallback, 24h TTL) | ✅ FMP free / Yahoo free; KV-backed cache (§1b) so a freshly-deployed peer reads all three statement families from KV instead of re-fetching                                |
| **Key metrics / ratios / scores** | `/api/stock-metrics`              | FMP `key-metrics-ttm`, `ratios-ttm`, `financial-scores`                                                         | —                                                                                        | ✅ FMP free (200s verified)                                                                                                                                                 |
| **Analyst estimates**             | `/api/stock-analyst`              | Yahoo `earningsTrend`                                                                                           | —                                                                                        | ✅ free                                                                                                                                                                     |
| **Insider trading**               | `/api/stock-insider`              | Yahoo `insiderTransactions`                                                                                     | —                                                                                        | ✅ free (FMP `insider-trades` is 404 — not on plan)                                                                                                                         |
| **Stock news**                    | `/api/stock-news`                 | Yahoo `search(news)`                                                                                            | —                                                                                        | ✅ free (cap fan-out at 8 symbols — Yahoo 429s past that)                                                                                                                   |
| **Earnings calendar**             | `/api/earnings-calendar`          | FMP `/stable/earnings-calendar`                                                                                 | Yahoo batch-quote enrichment for market caps                                             | ✅ FMP free (verified 200); enrichment rides the Yahoo batch fallback                                                                                                       |
| **Earnings history** (per symbol) | aggregator only                   | FMP `/stable/earnings`                                                                                          | —                                                                                        | ✅ FMP free (165 rows verified)                                                                                                                                             |
| **FX rates**                      | `/api/fx-rates`                   | Yahoo `USDILS=X`-style pairs                                                                                    | —                                                                                        | ✅ free                                                                                                                                                                     |
| **SMA-200 distance**              | `/api/sma-distances`              | Yahoo chart closes (via `getChart`)                                                                             | —                                                                                        | ✅ free (chart cache shared)                                                                                                                                                |
| **Sector heatmap**                | `/api/sector-heatmap`             | curated `sectorMeta` + Yahoo `getChart` per symbol                                                              | FMP profile sector for untagged symbols                                                  | ✅ free (whole aggregation cached 15 min)                                                                                                                                   |
| **Provider health**               | `/api/provider-health`            | per-feature probes: Yahoo quote **+** chart, FMP `/stable/quote` **+** `/stable/batch-quote`, AV `GLOBAL_QUOTE` | —                                                                                        | ✅ free (2 FMP calls / probe run, cached 5 min; UI shows outage banner, a cyan "free-tier limitation" strip with a docs link, and [MOCK] badges on Yahoo-dependent widgets) |
| **Insights tabs**                 | `/api/insights-tab`               | **curated static universes** (`insightsUniverses.ts`)                                                           | —                                                                                        | ✅ no provider needed                                                                                                                                                       |
| **Price change (YTD/1Y/3Y)**      | aggregator only                   | FMP `/stable/stock-price-change`                                                                                | —                                                                                        | ✅ FMP free                                                                                                                                                                 |
| **Dividends**                     | aggregator only                   | FMP `/stable/dividends`                                                                                         | —                                                                                        | ✅ FMP free (92 rows verified)                                                                                                                                              |
| **Company logos**                 | client-side                       | Logo.dev CDN `img.logo.dev/ticker/X`                                                                            | `TickerLogo` fallback initials                                                           | ✅ free tier                                                                                                                                                                |

---

## 3. Free-tier details per provider

### 3.1 Yahoo Finance — free, unlimited, no key

The reliability backbone. Powers quotes, charts, profiles (sector/industry
via `summaryProfile`), analyst estimates, insider transactions, news, FX, and
index quotes. **Caveats:**

- Unofficial API — no SLA; Yahoo may change response shapes (the team keeps
  normalizers tolerant of both `flat` and `content-wrapped` shapes).
- v4 deprecated `historical()` → `chart()`; always call `chart()` with an
  explicit `period2` (the v4 shim passes `period2: undefined` and fails
  validation — fixed in `stockService.yahooChart`).
- Per-symbol `quoteSummary` fan-out is rate-sensitive: keep ≤ ~8 concurrent
  (see `useWatchlistNews` cap and `resolveOrderedBatch` concurrency).

### 3.2 FMP — 250 req/day free

`/stable/` is the canonical API family (default). **Verified with the current
key (see `scripts/fmp-audit.ts`):**

| Endpoint                                                                                                                                                                                          | Status                                    | Notes                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote`, `profile`, `historical-price-eod/full`, `key-metrics`, `key-metrics-ttm`, `ratios`, `ratios-ttm`, `financial-scores`, `earnings`, `earnings-calendar`, `stock-price-change`, `dividends` | ✅ 200                                    | All free-tier available                                                                                                                        |
| `income-statement`, `balance-sheet-statement`, `cash-flow-statement`                                                                                                                              | ⚠️ 402 at `limit=10`; ✅ 200 at `limit=5` | **Free tier = 5 statements max.** `stockService.getFinancialStatements` now requests `limit=5`.                                                |
| `batch-quote`, multi-symbol `quote`                                                                                                                                                               | ⛔ 402                                    | Paid-gated ("Restricted Endpoint") — the health probe reports it as `known_restriction`, so the UI labels it a plan limitation, not an outage. |
| `earning-calendar` (singular)                                                                                                                                                                     | ❌ 404                                    | `fmp.ts` typo — the correct endpoint is `earnings-calendar` (plural).                                                                          |
| `insider-trades`                                                                                                                                                                                  | ❌ 404                                    | Not available on this plan (also 404s as `insider-trading`).                                                                                   |
| `sector-pe-snapshot`                                                                                                                                                                              | ⚠️ 200 but **0 rows on weekends**         | Date-sensitive; empty on non-trading days.                                                                                                     |
| Legacy `/api/v3/*`                                                                                                                                                                                | ❌ 403                                    | Deprecated — dead for current keys. `FMP_USE_STABLE=0` opts back in (grandfathered keys only).                                                 |

**Budget:** every audit run burns ~28 of the 250/day. Batch quote requests
each burn 1 doomed FMP call (402) before falling back to Yahoo — harmless
(logs a throttled warning) but worth knowing if you watch the counter.

### 3.3 Finnhub — 60 req/min free

Provides company news and an earnings calendar. **Currently dead code** (see
§5) — `FINNHUB_KEY` is set but nothing live calls it.

### 3.4 AlphaVantage — 25 req/day free

Only used as the last-resort quote fallback in `stockService.getQuote`.
Budget is tiny — effectively never reached because Yahoo is first.

### 3.5 SEC EDGAR XBRL — free, no key (history backfill)

`https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` — one file
per US issuer with every tagged us-gaap fact since XBRL adoption (~2009 for
large filers). This is the upstream source FMP/Yahoo fundamentals derive
from, so it closes the free-tier depth gap (FMP 5y / ~7 quarters) with the
same numbers — see `server/services/secEdgar.ts`.

| Endpoint | Status | Notes |
| --- | --- | --- |
| `company_tickers.json` (ticker → CIK) | ✅ Free | ~4 MB, cached 7 days per process |
| `companyfacts/CIK##########.json` | ✅ Free | ~1–5 MB per issuer; memoized 24h per process |

Guidelines SEC asks callers to follow: identify in the `User-Agent`
(default: project URL; override `SEC_EDGAR_USER_AGENT`), cache aggressively,
and stay under ~10 req/s. Backfill fetches only fire when a statement is
still under the 10-year target AND the per-symbol extension cache misses, so
real traffic is ~1 SEC call per issuer per 24h per region at most.

Mapping notes: annual rows read 10-K FY totals; quarterly rows prefer the
filer's own single-quarter tag and otherwise derive by subtracting YTD
cumulative figures inside one fiscal year on one concept (XBRL tags migrate
across taxonomy releases — see the alias tables in `secEdgar.ts`). Rows the
backfill appends carry `dataSource: "sec"` so the charts UI can badge them
(free-tier honesty convention). Non-US / ETF tickers resolve to no CIK and
are negative-cached for a day. Verify a ticker by hand with
`pnpm sec:audit -- AAPL quarterly`.

---

## 4. Caching model (server)

All in `stockService` via `node-cache`; understanding it matters for free-tier
budgeting:

| Cache                                           | TTL     | Purpose                                      |
| ----------------------------------------------- | ------- | -------------------------------------------- |
| Quotes (single/batch)                           | 60 s    | Quotes are the only thing refetched live     |
| Chart series                                    | 1 h     | Heavy OHLC payloads; shared by heatmap + SMA |
| Financials / metrics / analyst / insider / news | 1 h     | Slow-moving                                  |
| Sector heatmap aggregation                      | 15 min  | Recomputation is expensive (30+ charts)      |
| Negative TTLs                                   | 15–30 s | Suppress retry storms after provider misses  |
| In-flight registries                            | —       | Coalesce concurrent duplicate requests       |

**Practical consequence:** a 30-ticker Insights universe costs ~30 Yahoo calls
on first warm, then 0 inside the TTL window. FMP fundamentals are hit once per
symbol per hour. A typical session stays far under the 250/day cap; paging
through many tickers rapidly is the only way to exhaust it.

---

## 5. Wiring map — live vs dead code

**Live server entry:** `server/index.ts` registers all routes below via
`stockService` (FMP+Yahoo+AV) — see §2 table.

**Deployment entries:**

- `api/[[...slug]].ts` → `api/_router.js` (Vercel). **This is a separate,
  plain-JS router** that serves the same endpoints with different provider
  preferences: financials use Yahoo `fundamentalsTimeSeries` instead of FMP,
  and `earnings-calendar` calls FMP only when `FMP_KEY` is set, returning `[]`
  otherwise. `sector-heatmap` runs the same validation and aggregation as the
  Express twin. Keep both routers in sync when changing endpoints.

**Dead / unwired modules (not referenced by any live route):**

| Module                               | What it would power                                  | Status                                                                                                          |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `server/routes/earnings.ts`          | Finnhub earnings calendar (`/api/earnings/calendar`) | ❌ Not registered in `index.ts`; client uses FMP `/api/earnings-calendar` instead                               |
| `server/routes/insights.ts`          | Yahoo batch quotes + sectors for Insights tabs       | ❌ Not registered; superseded by curated `/api/insights-tab` + batch-quote route                                |
| `server/services/stockAggregator.ts` | Rich aggregated ticker view                          | ❌ Exported but never imported — its FMP helpers (`fmp.ts`) still exist but only this dead module consumes them |
| `server/services/finnhub.ts`         | Company + market news                                | ❌ Only imported by the dead aggregator — **Finnhub is configured but unused**                                  |
| `server/services/fmp.ts`             | FMP fundamentals (limit=5)                           | ⚠️ Only consumed by the dead aggregator; its `earning-calendar` singular form 404s                              |

**Env vars in use:** `FMP_KEY`, `AV_KEY`, `FINNHUB_KEY`, `VITE_LOGO_DEV_KEY` (build-time client-side override),
plus optional `FMP_USE_STABLE` (defaults to `/stable/`).

---

## 6. Operational guidance

- **Quotes and charts always work** — Yahoo is free and keyless; FMP
  `quote`/chart are free when Yahoo is down.- **Fundamentals depend on FMP**: metrics/ratios/scores are free-tier OK; statements request `limit=5` (the max the free tier serves — `limit=10` is 402).
- **Batch quotes silently ride Yahoo** — the FMP 402 is expected; don't be
  alarmed by the throttled `http_402` log line.
- **Don't add more per-symbol Yahoo fan-out** beyond current caps (8
  concurrent for news/validation) without adding caching.
- **Yahoo outages badge the widgets, not just the banner** — `useYahooDown()`
  (client, derived from `/api/provider-health`) ORs into the existing [MOCK]
  badge conditions of the Yahoo-dependent widgets: CompanyProfile news /
  analyst / insider sections, the batch-quote surfaces (Watchlists table +
  news panel, Portfolio, Insights tab badge). This catches the case where a
  stale payload lingers in the React Query cache and would otherwise look
  live. Chart-history consumers (Charts page header, sector heatmap, and the
  SMA/DipFinder widget) badge via `useYahooChartDown()` on the Yahoo chart
  probe. Note charts are FMP-primary with a Yahoo fallback, so the badge can
  fire while FMP still serves fresh bars — conservative by design; earnings
  calendar, profiles, and financials remain unbadged (they don't consume
  charts).
- **Health probes are feature-aware** — `/api/provider-health` probes FMP
  quote **and** batch-quote (402 paid-gated → `known_restriction`, surfaced
  as a cyan "free-tier limitation" strip with a link to this doc, not as an
  outage) and Yahoo quote **and** chart, so a chart-only outage (Charts
  page, sector heatmaps, SMA-200) surfaces as its own entry instead of
  hiding under a healthy quote probe. Each probe run costs 2 FMP calls; the
  5-min server cache keeps that ≤ ~24/hour while the app is open (the
  client polls every 60 s against the cache).
- **Re-verify provider access** with `pnpm fmp:audit` after plan changes or
  FMP migrations.
