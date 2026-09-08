# SEC financial data — reference

Complete technical description of the SEC EDGAR backfill pipeline and the
`/api/stock-financials-verify` verification endpoint. For the "why", see
`docs/sec-data-trust.md`; for a task walkthrough, see
`docs/howto-verify-sec-data.md`.

## Data pipeline (server)

```
GET /api/stock-financials?symbol=SYM&period=quarter|annual
  1. cache check        financials_SYM_period (KV, 1h TTL)
  2. FMP statements     3 endpoints, free tier → often 402
  3. Yahoo FTS fallback per-statement, ~5y window cap
  4. SEC EDGAR backfill extendFinancialHistory()
       ticker → CIK     www.sec.gov/files/company_tickers.json (memo 7d)
       companyfacts     data.sec.gov/api/xbrl/companyfacts/CIK*.json (memo 24h)
       XBRL → rows      us-gaap concepts → income/balance/cash rows
       merge            appendOlderSecRows(): SEC rows older-first,
                        tagged dataSource:"sec"; FMP/Yahoo rows stay newest
       cache            secExt_SYM_period (24h TTL, incl. negative)
  5. write-back          financials_SYM_period (1h)
```

Both server entrypoints expose the same behavior: `server/index.ts` (Express,
`pnpm dev`) and `api/_router.js` (Vercel deploys).

## Row provenance

| Field | Values | Set by |
| --- | --- | --- |
| `IncomeStatementRow.dataSource` | `"sec"` or absent | SEC backfill only |
| `BalanceSheetRow.dataSource` | `"sec"` or absent | SEC backfill only |
| `CashFlowRow.dataSource` | `"sec"` or absent | SEC backfill only |
| `FinancialStatements.sources` | `"fmp" \| "yahoo" \| null` per statement | payload-level merge |

SEC rows carry: `date` (fiscal period end, e.g. `2017-04-01` for AAPL's
52/53-week calendar), `symbol`, `reportedCurrency: "USD"`, `calendarYear`,
`period` (`FY` / `Q1`..`Q4`), and the standard metric fields.

## Constants

| Constant | Value | Defined in |
| --- | --- | --- |
| `SEC_TARGET_YEARS` | 10 | `server/services/secEdgar.ts` |
| `secTargetRows(period)` | quarter → 40, annual → 10 | `secEdgar.ts` |
| `SEC_EXT_TTL` | 86,400s (24h) | `secEdgar.ts` |
| CIK memo TTL | 7 days | `secEdgar.ts` |
| companyfacts memo TTL | 24h | `secEdgar.ts` |
| financials cache TTL | 3,600s (1h) | `stockService.ts` |
| verify relative tolerance | 0.5% (`REL_TOL`) | `secVerify.ts` |

## `GET /api/stock-financials-verify`

Query parameters:

| Param | Type | Default | Constraints |
| --- | --- | --- | --- |
| `symbol` | string | required | Uppercase ticker matching `TICKER_PATTERN`; else 400 |
| `period` | `quarter` \| `annual` | `annual` | unknown values fall back to `annual` |

Response (`SecVerifyResult`):

```jsonc
{
  "symbol": "AAPL",
  "period": "quarter",
  "verifiedAt": "2026-09-08T21:20:00.000Z",   // ISO timestamp of the run
  "secReachable": true,                        // SEC answered during this run
  "cik": "0000320193",                         // null = no SEC CIK (non-US/ETF)
  "counts":   { "income": 40, "balance": 40, "cash": 40 },
  "secTagged":{ "income": 35, "balance": 35, "cash": 35 },
  "checks": [
    { "id": "merge-order:income",  "status": "pass", "detail": "35 SEC rows all older than 2025-06-30" },
    { "id": "tag-integrity:income","status": "pass", "detail": "35 tagged rows all carry dated, non-zero values" },
    { "id": "depth:income",        "status": "pass", "detail": "40/40 rows meets the 10-year target" },
    { "id": "cross-source:revenue","status": "pass", "detail": "35/35 SEC rows match freshly-fetched EDGAR values (±0.5%)" },
    { "id": "sanity:non-negative", "status": "pass", "detail": "no negative revenue/assets among SEC rows" }
    // ... one merge-order + tag-integrity pair per statement family
  ],
  "verdict": "verified"  // verified | partial | unverified | failed
}
```

### Check IDs

| ID (per statement family) | Network? | Fail condition |
| --- | --- | --- |
| `merge-order:{income,balance,cash}` | no | any `sec` row dated ≥ the oldest untagged row |
| `tag-integrity:{income,balance,cash}` | no | tagged row missing a date or carrying no non-zero metric |
| `depth:{income,balance,cash}` | CIK lookup only | under 10y target **with** a CIK (silent-failure signature); `warn` without a CIK |
| `cross-source:revenue` | fresh `companyfacts` fetch | served SEC revenue drifts >0.5% from a freshly-derived value |
| `sanity:non-negative` | no | negative revenue or totalAssets among SEC rows |
| `sanity:gross-profit` | no | `grossProfit > revenue` on any SEC income row |
| `sanity:magnitude` | no | `warn` when median revenue > 5× median assets (units-bug signal) |

### Verdict rules

```
unverified  secReachable === false
failed      any non-depth check failed (merge-order, tag-integrity, cross-source, sanity)
partial     depth check failed, or zero SEC-tagged rows overall
verified    everything else (all pass + SEC reachable)
```

## Verification data flow

```
served payload ──┐
                 ├─► tag-integrity / merge-order / depth / sanity   (offline)
SEC (fresh HTTP)─┤
  companyfacts ──┴─► buildSecHistoryRows ─► compare revenue ±0.5%    (online)
```

The cross-source check deliberately re-fetches `companyfacts` over HTTP and
bypasses the 24h in-process memo, so a poisoned or stale cache cannot pass
its own audit.

## Related

- `docs/sec-data-trust.md` — trust model and loophole analysis (Explanation)
- `docs/howto-verify-sec-data.md` — task walkthrough (How-to)
- `server/services/secEdgar.ts` — backfill implementation
- `server/services/secVerify.ts` — verification implementation
- `scripts/sec-audit.ts` — offline CLI audit of the XBRL mapper (`pnpm sec:audit`)
