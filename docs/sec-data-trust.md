# Why you can (and can't yet fully) trust the SEC numbers — the trust model

**Status:** explanation (Diataxis "why" quadrant). Companions:
`docs/sec-verify-reference.md` (what the checks are),
`docs/howto-verify-sec-data.md` (how to run them).

## The problem

Vantage serves 10 years of quarterly financials by combining three sources:
FMP (paid, capped), Yahoo (free, ~5y), and SEC EDGAR XBRL (free, complete).
The first two are opaque third parties; the third is the primary source
itself — the same filings companies are legally required to make.

The design constraint that creates the trust question: **the SEC backfill
fails silently on purpose.** If SEC is down, blocked, rate-limited, or a
ticker isn't a US issuer, `extendFinancialHistory` returns the base payload
untouched rather than erroring. That's the right call for users — a backfill
must never break a working response — but it has a sharp edge:

> **A broken SEC path is indistinguishable from "no extension available."**

We lived this. For months the default User-Agent was rejected by SEC's bot
shield (403), so `lookupCik` failed, the backfill returned zero rows, and
the charts looked perfectly healthy with 5 quarters instead of 40. Nothing
crashed. Nothing logged. The acceptance gate from issue #62 stayed
"theoretically green, actually dead."

An outside user asking *"how do I know this data is true?"* was, until
2026-09-08, asking a question the product couldn't answer.

## Loopholes a skeptical user should ask about

Each loophole below is real; each maps to the check that closes it.

| # | Loophole | How it would bite | Closed by |
|---|----------|-------------------|-----------|
| 1 | **Silent backfill failure** — SEC unreachable/blocked | Charts quietly show only ~5y; depth promised is depth delivered | `depth:*` checks; fail on "under target WITH a CIK" |
| 2 | **Cache poisoning / staleness** — `secExt_*` or `financials_*` holds wrong rows (deploy bug, KV corruption, mapper regression after data was cached) | Wrong numbers served for up to 24h from a payload nobody re-derived | `cross-source:revenue` vs a **fresh** EDGAR HTTP fetch (memo-bypassing) |
| 3 | **Merge-order regression** — a refactor makes SEC rows overwrite fresh FMP/Yahoo rows | Stale filing data presented as "latest quarter" | `merge-order:*` — every SEC row must be older than every untagged row |
| 4 | **Empty-but-tagged rows** — mapper or cache emits tagged rows with zero/undefined values | Charts show blank/garbled bars with "SEC" branding — worse than no badge | `tag-integrity:*` — tagged rows must be dated with a non-zero metric |
| 5 | **Unit/sign bugs** — XBRL concepts in different units, sign flips, thousands-vs-dollars | Revenue in millions plotted as billions | `sanity:*` bounds (non-negative, gross profit ≤ revenue, magnitude vs assets) |
| 6 | **Fiscal vs calendar mismatch** — AAPL's Q2 ends `2027-04-01`-style dates; Yahoo reports calendar quarters | Users see "duplicate" or "missing" quarters at the seam | Documented; the seam overlap (fiscal-end vs calendar-end) is expected, not an error |
| 7 | **Out-of-scope tickers** — non-US listings, ETFs, funds | Verifier would "fail" companies SEC doesn't cover | CIK absent → checks degrade to `warn`, verdict `partial`, never `failed` |
| 8 | **SEC itself being wrong/restated** — filings are amended | Old values linger where a restatement exists | Mitigated, not eliminated: `pointValueAt` keeps the latest `filed` date per concept/period; deeper restatement tracking is out of scope |

## What "verified" actually certifies

When the endpoint returns `verdict: "verified"`, the claim chain is:

1. **Provenance is structural.** SEC rows carry `dataSource: "sec"`; they
   are appended only *older* than the live-provider rows; each one was
   derived from XBRL facts of a resolved CIK.
2. **Values are re-derived, not just re-read.** The verifier makes a
   *fresh* HTTPS call to `data.sec.gov` (bypassing every cache), rebuilds
   revenue rows with the same mapper, and compares against what was served.
   Agreement within ±0.5% on all overlapping rows.
3. **Depth matches the promise.** 40 quarterly rows (10 fiscal years) where
   SEC data exists.
4. **Nothing implausible.** Revenue/assets are non-negative, gross profit
   doesn't exceed revenue, magnitudes are sane.

What it does **not** claim: that SEC's own filing data is flawless
(restatements happen, see loophole 8), or that the *recent* FMP/Yahoo rows
(untagged, `sources.* = "fmp"|"yahoo"`) are correct — those come from
commercial providers and carry their own accuracy guarantees. The verifier
scopes its claims to the rows it can actually check against the primary
source.

## How an outside user can trust it

The verification is **not an internal claim — it's an auditable artifact**:

- **Anyone can run it.** `curl /api/stock-financials-verify?symbol=ANY&period=quarter`
  — no auth, no internals. The response is a machine-readable check list.
- **Anyone can reproduce it independently.** SEC's data is public:
  `https://data.sec.gov/api/xbrl/companyfacts/CIK<id>.json`. A user can
  fetch the same file and compare any row themselves (the CIK is in the
  verify response).
- **The provenance travels with the data.** Every row that came from SEC is
  tagged `dataSource: "sec"` in the regular financials payload — trust
  doesn't depend on the API's word, it's embedded in the data.
- **CI-able.** The endpoint's verdicts are designed to be asserted in CI
  (`expect(report.verdict).toBe("verified")`) so a regression that breaks
  the backfill fails a build instead of shipping silently.

## Trade-offs made

- **Fresh fetch on every verify** (vs reusing the 24h companyfacts memo):
  costs one ~1–4 MB HTTPS call per verification, buys independence from
  cache poisoning. Verification is expected to be rare (humans and CI),
  so the cost is acceptable.
- **±0.5% tolerance** (vs exact equality): XBRL values are exact integers
  in USD; the tolerance exists for float serialization noise in JSON
  round-trips, not for real drift. Any drift beyond 0.5% is a genuine
  mismatch.
- **Revenue-only cross-source** (vs all fields): revenue is the most
  reliably tagged concept across issuers and taxonomies; per-family
  balance/cash spot-checks run under `sanity:*` instead. Widening
  cross-source to more fields is cheap if a regression ever justifies it.
- **Depth failures are `fail`, not `warn`:** the UA-403 incident was
  precisely "under target with a CIK." If that's not a failure, the
  verifier would have blessed the broken state it was built to catch.

## Alternatives considered

- **Continuous background self-verification** (cron re-verifying hot
  tickers): more assurance, more SEC traffic, more cost; SEC asks callers
  to stay under ~10 req/s and cache aggressively. The on-demand endpoint +
  CI assertion covers the need without a background poller.
- **Cryptographic attestation** (signing payloads with the verify result):
  would let third parties verify without hitting SEC. Rejected for now —
  the verify endpoint is already public and SEC data is public, so a
  signature adds key-management cost for little trust gain at Vantage's
  scale.
- **Trusting FMP/Yahoo row accuracy too:** out of scope by design; those
  providers are not the primary source and their rows are explicitly not
  tagged `sec`.
