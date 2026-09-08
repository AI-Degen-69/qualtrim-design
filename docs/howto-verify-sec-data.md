# How to verify financial data against SEC EDGAR

Run an independent, auditable cross-check of any ticker's financial payload against SEC's own published numbers, in one call. End result: a `verified` / `partial` / `unverified` / `failed` verdict you can show to anyone who asks "how do you know this data is real?"

## Prerequisites

- The dev server running (`pnpm dev`, port 8080) — or any deployed environment.
- `SEC_EDGAR_USER_AGENT` set in `.env` in SEC's accepted format: `Project Name (contact@email)`. (SEC 403s UAs with URLs or version tokens — see `docs/data-providers.md` §3.5.)
- For a *fully* verified verdict: outbound HTTPS to `data.sec.gov` and `www.sec.gov`.

## Steps

1. Call the verify endpoint for the ticker and period you care about.

   ```bash
   curl "http://localhost:8080/api/stock-financials-verify?symbol=AAPL&period=quarter"
   ```

2. Read the `verdict` field first:

   | Verdict | Meaning | What you should do |
   | --- | --- | --- |
   | `verified` | All checks pass, SEC was reachable, values match EDGAR | Trust the payload |
   | `partial` | Checks pass but depth is short, or no SEC rows exist | Data is consistent but incomplete — see `depth:*` checks |
   | `unverified` | SEC was unreachable during the run | Retry later; nothing was proven numerically |
   | `failed` | At least one critical check failed | Do not trust — see the failing `fail` checks |

3. Inspect the `checks` array. Each check is `[PASS|WARN|FAIL] id :: detail`. The four families:
   - `merge-order:*` — SEC rows are older than non-SEC rows (merge invariant)
   - `tag-integrity:*` — every `dataSource:"sec"` row is dated and non-zero
   - `depth:*` — row counts vs the 10-year target (40 quarters / 10 years)
   - `cross-source:revenue` — served SEC values vs a **fresh** EDGAR fetch (±0.5%)
   - `sanity:*` — plausibility bounds (no negative revenue/assets, gross profit ≤ revenue)

## Verification

A healthy run looks like:

```
verdict: verified
cik: 0000320193
counts: inc=40 bal=40 cash=40
secTagged: inc=35 bal=35 cash=35
  [PASS] cross-source:revenue :: 35/35 SEC rows match freshly-fetched EDGAR values (±0.5%)
  [PASS] depth:income :: 40/40 rows meets the 10-year target
  ...
```

`secTagged > 0` plus `cross-source:revenue = pass` is the pair that proves the numbers are SEC's, not just plausible-looking.

## Troubleshooting

- **`cross-source:revenue` says "SEC unreachable"** — check the UA env var (`SEC_EDGAR_USER_AGENT` in `.env`) and outbound connectivity. The verdict will be `unverified`, never a false `verified`.
- **`depth:*` fails with "backfill did not fire"** — this is the silent-failure signature (the 2026-09 UA-403 incident). Check the server log for `[stockService] … failed` lines and the UA format first.
- **Verdict `partial` on a non-US ticker (e.g. `NESN.SW`)** — expected: SEC XBRL covers US issuers only. The `depth:*` checks degrade to `warn` when no CIK exists.
- **Values drift beyond 0.5%** — rare; would indicate a stale/poisoned cache or mapper regression. Clear `secExt_<SYMBOL>_<period>` and re-run.

## Related

- `docs/sec-data-trust.md` — the full trust model, loophole analysis, and why each check exists (Explanation)
- `docs/sec-verify-reference.md` — complete response schema (Reference)
- `server/services/secVerify.ts` — implementation
