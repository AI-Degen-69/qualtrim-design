# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the builder themself, tracking personal watchlists/portfolio and researching tickers day-to-day. Built to double as a portfolio-quality product — solid enough that other retail investors could use it if opened up, and bilingual (Hebrew-native and English-international) users are both first-class audiences, not an afterthought.

## Product Purpose

Vantage is a stock research and portfolio dashboard. It pulls quotes, charts, fundamentals, earnings, and insights from multiple free-tier market-data providers (Yahoo Finance, FMP, AlphaVantage) and presents them as one coherent surface. Success means dense financial data reads as clear and comfortable rather than as a raw data dump, on both desktop and the underlying free-tier data constraints.

## Positioning

The differentiator is presentation and depth on free-tier data, not another quote aggregator:

- Up to 5 years of financial statements/metrics in expandable/collapsible charts, toggleable between quarterly and annual — hard-to-read financial data made elegant and legible.
- Customizable watchlists and a discounted cash flow (DCF) feature.
- An earnings calendar that can be filtered down to just the user's own portfolio holdings.
- Full Hebrew localization with accurate translation and correct RTL layout, alongside an English international version — not a machine-translated afterthought.

A neighboring quote-tracker site could not truthfully copy this without also solving the RTL/i18n problem and the free-tier honesty problem (see Operating Context).

## Operating Context

- Multi-provider data layer with an explicit fallback chain per data point (Yahoo primary for quotes/charts/news/FX, FMP for fundamentals/DCF/earnings-calendar, AlphaVantage as last-resort quote fallback); see `docs/data-providers.md`.
- Two parallel server entrypoints must stay in sync: `server/index.ts` (full Express app, used by `pnpm dev`) and `api/_router.js` (a separate Yahoo-only router for Vercel deploys with stubbed-out fundamentals/earnings-calendar/sector-heatmap).
- Provider-health probing and `[MOCK]` badging surface data staleness/outages directly in the UI rather than hiding them.
- Bilingual runtime: `client/locales/en` and `client/locales/he`, with RTL layout support for Hebrew.

## Capabilities and Constraints

- Free-tier only across all providers — no paid API budget. This is a permanent constraint that shapes caching (see `docs/data-providers.md` §4), fan-out limits (e.g. ≤8 concurrent Yahoo calls), and the health-badge/`[MOCK]` UX, not a temporary MVP shortcut.
- FMP batch-quote and multi-symbol quote are paid-gated (402) on the free tier; batch quotes fall back to per-symbol Yahoo calls by design.
- Financial statement requests are capped at `limit=5` (5 years) — the free-tier ceiling.
- Finnhub is configured (`FINNHUB_KEY`) but currently dead code — not wired into any live route.
- Vercel KV (Upstash) is optional infrastructure for cross-instance API-usage-counter convergence; falls back to in-process memory when unconfigured.

## Evidence on Hand

- `docs/data-providers.md` — verified provider status, endpoint-by-endpoint, re-checked via `pnpm fmp:audit`.
- Live pages: Watchlists, Portfolios, Charts, Earnings, Insights (`client/pages/`).
- No customer testimonials, case studies, or press exist; do not fabricate any.

## Product Principles

1. Free-tier data limitations are surfaced honestly (health badges, `[MOCK]` tags, "free-tier limitation" strips) rather than papered over.
2. Dense financial data is made comfortable to read, not just displayed — legibility and hierarchy over raw density.
3. Hebrew (RTL) and English are both first-class languages, not a primary language plus a bolted-on translation.
4. Personalization (custom watchlists, portfolio-filtered earnings calendar) over generic market-wide views.
5. Keep the two server entrypoints (`server/index.ts`, `api/_router.js`) behaviorally in sync when routes change.

## Accessibility & Inclusion

No specific accessibility standard has been established for this product beyond the bilingual/RTL requirement above.
