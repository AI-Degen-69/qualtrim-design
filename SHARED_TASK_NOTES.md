<!-- /autoplan restore point: /c/Users/Tiger/.gstack/projects/AI-Degen-69-vantage/improve-loop-iter-1-format-large-number-autoplan-restore-20260903-184338.md -->
# Shared Task Notes

Cross-agent improvement backlog. Highest-priority unaddressed candidate feeds the
next loop iteration. New candidates are appended at the bottom.

---

## Iteration 1 — Candidate Cards (generated 2026-09-03)

### Candidate 1 — Dedupe `formatLargeNumber`, fix negative-money rendering (Strong) — ✅ COMPLETED in iteration 1 (PR #54)

> Implemented as `shared/format.ts` + `shared/format.spec.ts`, wired into
> `stockAggregator.ts` (private copy deleted, `$` wrapping removed) and
> `StockSlideOver.tsx` (dead copy deleted). Kept the inherited no-promotion
> tier boundary for parity: 999,999 renders as `$1000.00K`, NOT `$1.00M`.

- **Area / Files**: `shared/format.ts` (new), `server/services/stockAggregator.ts`, `client/components/StockSlideOver.tsx`, `shared/format.spec.ts` (new)
- **Problem**: Two drifted copies of `formatLargeNumber` exist: `StockSlideOver.tsx:13` (client) and `stockAggregator.ts:24` (server). The client copy is dead code (zero call sites). The server copy is live at ~12 call sites, and every caller wraps the result in `` `$${...}` `` — so negative FCF renders as `$-4.80M` (sign after the currency symbol) instead of `-$4.80M`. This is the exact bug class the canonical `client/lib/format.ts` `formatMoney` already fixed client-side ("-$4.80B, not $-4.80B"), still live server-side.
- **Solution**: Extract a canonical `shared/format.ts` with `formatLargeNumber(num, opts?)` — handles negatives with sign-before-`$`, null → "—", 0 → "$0", K/M/B/T tiers with 2 decimals, optional `omit$`for raw volume counts.`stockAggregator.ts`imports it via`@shared/format`(alias already used by server and client) and drops its private copy and hand-rolled`$`wrapping;`StockSlideOver.tsx` deletes its dead copy.
- **Benefits**: Kills a drift vector (this repo has fixed formatMoney drift 3× before: PRs #40, #28, #41), fixes a user-visible rendering bug (negative values inside financial profile blocks), moves a pure formatter to the shared layer where both runtimes can test it.
- **Strength Badge**: `Strong`
- **Scope**: ~3 files, well under 120 changed lines. Machine-decidable: unit specs on tier boundaries (incl. the inherited no-promotion boundary 999,999 → $1000.00K, negatives, null, 0) + full suite green + prettier clean.

### Candidate 2 — Split `client/lib/i18n.tsx` god module (2,566 lines) (Worth exploring) — 🔶 IN PROGRESS: dictionary slice completed in iteration 2 (PR #55)

> Iteration 2 extracted the en/he string tables verbatim into
> `client/lib/i18n/dictionaries.ts` with `i18n.tsx` re-exporting them
> (public API stable, all 39 importers untouched; parity pinned by a new
> dictionaries.spec.ts, including the 10 legitimate Hebrew-dual `_two`
> keys). Remaining slice: plural/ICU/provider logic split — deferred to a
> future iteration.

- **Area / Files**: `client/lib/i18n.tsx` → locale data modules (`locales/` dir already exists but appears unused by the provider)
- **Problem**: Provider, hook, ICU engine glue, and (likely) large inline translation tables live in one 2,566-line file. Any key edit touches the same file as the React context machinery, causing noisy diffs and slow tooling.
- **Solution**: Move per-language string tables to `client/locales/<lang>.ts`, keep provider/hook in `i18n.tsx`. Type the tables against the en dictionary.
- **Benefits**: Smaller diffs, faster HMR on copy edits, typed locale parity.
- **Strength Badge**: `Worth exploring`
- **Scope risk**: Mechanical but wide — likely touches imports across most pages. Needs its own iteration with care.

### Candidate 3 — Decompose `server/services/stockService.ts` (2,757 lines) (Worth exploring)

- **Area / Files**: `server/services/stockService.ts`
- **Problem**: Single module aggregates FMP/Yahoo/Finnhub logic for stocks, quotes, metrics, insider trades, revenue segmentation, provider health, trending movers. Seven colocated spec files suggest the seams already exist but the implementation stayed monolithic.
- **Solution**: Extract cohesive sub-services along the existing spec-file seams (availability, fmpMetrics, providerHealth, revenueSegmentation, trendingMovers, yahooMetricsMapping).
- **Benefits**: Testability, merge-conflict reduction, clearer ownership per provider concern.
- **Strength Badge**: `Worth exploring`
- **Scope risk**: Refactor-only, but this is the hottest server file; needs strong parity tests before moving code.

### Candidate 4 — Cover `ChartModal.tsx` interaction paths (Speculative)

- **Area / Files**: `client/components/ChartModal.tsx` (1,700 lines; one locked-banner spec only)
- **Problem**: Largest client component has minimal spec coverage relative to its surface (range switching, metric selection, modal close/focus behaviors).
- **Solution**: Add interaction specs for range/metric switches and modal lifecycle using existing happy-dom + testing-library patterns.
- **Benefits**: Regression safety on the most-used feature surface.
- **Strength Badge**: `Speculative`
- **Scope risk**: UI interaction specs can be brittle; needs careful selectors.

### Candidate 5 — `useStockData.ts` (891 lines) hook decomposition (Speculative)

- **Area / Files**: `client/hooks/useStockData.ts`
- **Problem**: One hook aggregates quote/fundamentals/insider/news fetch orchestration; unclear which consumers depend on which slice.
- **Solution**: Split into composable hooks per data slice with a thin facade for compatibility.
- **Benefits**: Narrower re-render surface, targeted tests.
- **Strength Badge**: `Speculative`
- **Scope risk**: Every consumer uses the facade; behavior parity must be verified.

### Candidate 6 — Decide zero-valued metric semantics in stockAggregator (Worth exploring) — ✅ COMPLETED 2026-09-03 (branch `fix/c6-zero-value-semantics`)

> Decision (user): a literal 0 is REAL data (breakeven FCF, debt-free
> balance sheet) and renders as `$0` / `0.00%` / `0.00x`. Implemented with
> a `hasValue()` guard (finite incl. 0; null/undefined/NaN → "—") across
> all 32 quickStats render sites plus the two upstream derivations
> (fcfYield, debtToEquity) that swallowed 0 first. G1 integration spec
> `server/services/stockAggregator.spec.ts` (new) mocks the three provider
> modules and pins 0 → `$0` through `aggregateStockData`, with regression
> guards that null still renders "—" and NaN never leaks via toFixed.

- **Area / Files**: `server/services/stockAggregator.ts` (quickStats guards), possibly backend consumers
- **Problem**: Truthiness guards (`marketCap ? ... : "—"`) render a literal `0` as "—" even though `formatLargeNumber` can render `$0`. Flagged by CodeRabbit on PR #54; deliberately deferred because the behavior is pre-existing and changing it alters API response semantics, which exceeds a refactor PR's parity contract.
- **Solution**: Decide whether 0 is meaningful data (e.g., breakeven FCF) or indistinguishable from missing data in these provider feeds. If meaningful, switch guards to `value != null` and add a spec pinning `0 → "$0"` through `aggregateStockData`'s shaping.
- **Benefits**: Correct rendering for edge-case companies; removes a silent truthiness trap for future call sites.
- **Strength Badge**: `Worth exploring`
- **Scope risk**: Semantic change to API output; needs a product call on whether `0` and "no data" are distinguishable in the FMP/Yahoo feeds.

---

## Iteration log

### Iteration 1 (2026-09-03) — completed

- **Candidate implemented**: 1 (canonical `formatLargeNumber`) → PR #54 (`improve/loop-iter-1-format-large-number`, tag `loop-iter-1-20260903-181400`).
- **Verification**: 597/597 tests (58 files, +8 new), `tsc` clean, `pnpm build:server` clean, prettier clean on touched files.
- **CodeRabbit**: 2 Minor findings — backlog card staleness (fixed in this PR), zero-guard semantics (deferred → Candidate 6).
- **Next**: highest-priority unaddressed candidate is 2 (i18n god-module split), needs a bounded slice to fit the ≤3-file loop scope.

### Loop status: terminated after 2 of 3 iterations (controlled shutdown, 2026-09-03)

Two verified PRs are open awaiting human merge: #54 (Candidate 1) and #55
(Candidate 2, dictionary slice). The third iteration was deliberately not
started: PR #54 carries a deferred semantic decision (Candidate 6), and the
next-best candidates either exceed the ≤3-file loop rail (the 4-site
timestamp-heuristic dedupe, done properly, touches 6 paths) or need a
product call. Resume with the next candidate after the open PRs land.

### Iteration 2 (2026-09-03) — completed

- **Candidate implemented**: 2, dictionary slice → PR #55 (`refactor/loop-iter-2-i18n-dict-extraction`, tag `loop-iter-2-20260903-184000`). `client/lib/i18n.tsx` 2,566 → 467 lines; dictionaries verbatim into `client/lib/i18n/dictionaries.ts` with stable re-exports.
- **Verification**: 593/593 tests (59 files, +4 new, 0 deleted), `tsc` clean, `pnpm build:client` clean; pre-existing 619-line i18n.spec.ts passes unchanged.
- **CodeRabbit**: APPROVED, zero inline findings.
- **Discovery for next iteration**: the seconds-vs-ms timestamp heuristic (`value < 1e12 ? value * 1000 : value`) is duplicated at 4 sites — `client/lib/finance.ts:198`, `client/lib/formatTimeAgo.ts:49`, `server/services/stockService.ts:729` and `:741`. Same cross-runtime dedupe shape as Candidate 1.
- **Next**: timestamp dedupe (small, bounded) or stockService decomposition (Candidate 3, larger).
## Autoplan Phase 1 — CEO Review (SELECTIVE EXPANSION, 2026-09-03)

Reviewing this backlog (4 open candidates + loop resume criteria). Dual voices: codex binary not found ([codex-unavailable]); no subagent tool in this host → **SINGLE-REVIEWER MODE**. Consensus tables record N/A; no dimension is CONFIRMED without a second voice.

### Step 0A — Premise Challenge
- **P1 "duplication causes real bugs here"** — ACCEPT. Empirical: 3 prior drift incidents (PRs #40/#28/#41) plus iter-1's live `$-4.80M` negative-money rendering. Not hypothetical.
- **P2 "a structured loop is the right vehicle"** — ACCEPT. 2 iterations → 2 CodeRabbit-approved PRs, 0 regressions, suites green (597 / 593).
- **P3 "refactor-first focus"** — CHALLENGED. The backlog is 100% internal quality; nothing ships user value directly. The one user-facing correctness item (Candidate 6: literal `0` renders as "—" in financial profiles) is parked behind a product decision only the user can make. Correction: pull C6's DECISION forward to this review's gate.
- **P4 "the ≤3-file loop rail is the right constraint"** — QUESTIONED, KEPT. It kept PRs reviewable but blocked the 4-site timestamp dedupe (6 paths). Resolution: slice across 2 iterations instead of bending the rail.

### Step 0B — What already exists (leverage map)
| Sub-problem | Existing code | Reuse? |
|---|---|---|
| Money tiers, sign placement | `client/lib/format.ts` (`formatMoney`, `formatMoneyCompact`), `shared/format.ts` (new in #54) | YES — canonical homes already exist |
| seconds-vs-ms timestamps | `client/lib/finance.ts:198` (origin); `stockService.ts:727` comment admits mirroring | YES — extract from finance.ts, mirror sites import it |
| i18n logic split | `icu.ts` solver, provider/plural logic in i18n.tsx, 619-line key-audit spec | YES — the spec is the parity net |
| stockService seams | 7 colocated spec files (availability, fmpMetrics, providerHealth, revenueSegmentation, trendingMovers, yahooMetricsMapping) | YES — decompose along the specs |
| Component interaction tests | happy-dom + testing-library patterns across 15 component specs | YES |

### Step 0C — Dream state
```
CURRENT (main + open PRs)            THIS PLAN (open cards)              12-MONTH IDEAL
3 formatter copies (1 canonical)  →  C6 zero-vs-missing decision     →  one shared format lib,
2,100-line i18n payload extracted    C2b i18n logic split               per-runtime tested,
  (#55) but logic still co-located   C3 stockService → sub-services     i18n data/logic split,
2,757-line stockService god      →  C4 ChartModal interaction specs    provider seams = spec files,
4x timestamp heuristic dup       →  (card from iter-2 log)             hot components covered
```
Delta after this plan: maintainability debt on the two hottest files roughly halved; correctness semantics explicit; loop cadence proven. Remaining gap vs ideal: stockService still monolithic until C3 lands; provider-failure observability stays per-route logs.

### Step 0C-bis — Implementation alternatives (next unit of work)
| | A) Continue loop as-is | B) Correctness-first | C) Coordinated architecture pass |
|---|---|---|---|
| Summary | Next candidate in strength order | C6 decision + correctness fixes before more refactors | C2b + C3 batched with parity nets |
| Effort | S per iteration | S-M | L (human ~1 wk / CC ~2 hr) |
| Risk | Low — proven cadence | Low-Med — API semantics change | Med-High — big-bang refactor |
| Completeness | 7/10 | 9/10 | 10/10 |
RECOMMENDATION (P1+P6): A, with C6's DECISION surfaced at the gate — keep shipping, and decide now the one thing only the user can decide.

### Step 0D — SELECTIVE EXPANSION analysis
Complexity check: every remaining card slices ≤8 files. Minimum set: nothing blocks anything else; C2b/C3 deferrable. Expansion scan (6 principles):
- **E1** timestamp-heuristic dedupe: 4 dup sites → shared helper + specs = 6 paths → exceeds the <5-file rule → TASTE DECISION (gate).
- **E2** shared/ barrel index: adds surface, zero dedup → REJECT (P4).
- **E3** type-pin he dict to en keys (allowing plural-family gap): 1-2 files, in blast radius of #55, <1d → APPROVE (P2) → Candidate 7.
- **E4** `client/locales/*/translation.json` possibly unused: usage unverified → DEFER with verify-first TODO (P3).
- **E5** consolidate `ChartModal.tsx:132` / `Portfolio.tsx:50` raw Intl.NumberFormat into shared tiers: different formatting contracts (chart axis vs money) → REJECT (P4; blind dedup would change rendered output).

### Step 0E — Temporal interrogation (compressed)
- H1: C3 needs golden parity tests BEFORE moving code; the colocated specs are the net.
- H2-3: C2b boundary order — pure helpers (plurals, translate*) first, provider last.
- H4-5: verify bundle size after i18n re-export reshuffle (`pnpm build:client` diff).
- H6+: the 120-source-file key-audit spec must stay green through every i18n touch.

### Step 0F — Mode
SELECTIVE EXPANSION (autoplan override). E3 accepted into scope (Candidate 7); E2/E5 rejected; E1 (taste) and C6 (premise) go to the final gate; E4 deferred to TODOS.md.
### CEO Sections 1–11

**S1 Architecture** — System: Express server (`dist/server/node-build.mjs`) + Vercel twin (`api/_router.js`, deliberately pure-JS) + React SPA, with `shared/` as the cross-runtime seam. This plan adds zero new runtime components:
```
client SPA ──┐                                  ┌── Express (node-build)
             ├── shared/format.ts (#54) ◀───────┤
client/lib/ ─┘   (formatLargeNumber)            └── api/_router.js (no import — JS-only rule)

client/lib/i18n.tsx (467 lines, machinery)
   └── re-exports ── client/lib/i18n/dictionaries.ts (#55)
                         (en/he tables; C7 will type-pin he against en)
server/services/stockService.ts (2,757 lines, 11 exports)
   ├── imported by: server/routes/stock-data.ts, api/_router.js (+2 specs)
   └── C3 plan: decompose along its 7 colocated spec seams, keep module as facade
```
WARNING (pre-existing, mitigated): any behavior change in `shared/` or `stockService` lands in BOTH server runtimes; the parity specs (`_router.*-parity.spec.ts`) are the existing control. Accepted expansion C7 touches one file with no new coupling. No new findings.

**S2 Error & Rescue Map** — Examined every planned touch: pure formatters (return strings, cannot throw; non-finite inputs return "—" by contract), module re-exports (build-time resolution, no runtime failure path), and the C6 guard change (no exceptions — it alters rendered strings). The plan introduces **no new fallible codepath**, so the registry is N/A by construction. Catch-all-handler smell check on touched files: none added; prior loops already bounded the throttledWarn map (PR #38) and added per-item upstream warning (PR #36). No issues found.

**S3 Security & Threat Model** — All planned changes are display transformations of already-fetched numeric/string data rendered through React text nodes: no new endpoints, params, file paths, secrets, or dependencies; no PII classification change; no injection surface (formatters emit `-$4.80M`-style literals; i18n values are static strings already audited by the 120-file key audit). C6 changes which pre-existing number renders — not what an attacker controls. No issues found.

**S4 Data Flow & Interaction Edge Cases** — Formatter shadow paths all pinned by `shared/format.spec.ts`: nil ("—"), empty-string→null-coalesced ("—"), NaN/±Infinity ("—"), 0 ("$0"), negatives ("-$4.80M"), 999,999 boundary ("$1000.00K", no promotion). Data flow:
```
PROVIDER VALUE ──▶ truthy guard ──▶ formatLargeNumber ──▶ quickStats[] ──▶ client render
     │                  │                  │
  null/undef ──────▶ "—" (short-circuit)  │
  0 ───────────────▶ "—"  ◀── C6: the ONE unhandled edge (at gate)
  NaN/Inf ─────────▶ "—" (formatter contract)
  negative ────────▶ "-$X.XXM" (fixed by #54)
```
No UI interaction edges (no new screens/flows). Finding: C6 — already surfaced, at gate.

**S5 Code Quality** — Verified the two format modules have **zero export overlap** (`client/lib/format.ts`: money tier formatter; `shared/format.ts`: large-number tiers with `omit$`) — merging them would be blind dedup that changes rendered contracts (consistent with the E5 reject). Naming and file headers follow the repo's canonical-helper pattern from PR #40. Over-engineering check: `shared/format.ts` is 49 lines with 2 options — no premature abstraction. The largest open quality debt is the C4 inversion: the biggest client component (1,700 lines) has one narrow spec. No new issues.

**S6 Test Review** — Full diagram lives in the test-plan artifact (`user-improve-loop-iter-1-format-large-number-test-plan-20260903-190705.md` in `~/.gstack/projects/AI-Degen-69-vantage/`). Two gaps, auto-decided (P1, completeness): **G1** — the C6 guard change needs an integration shaping spec pinning `0 → "$0"` (or chosen semantics) through `aggregateStockData`'s quickStats BEFORE merge; **G2** — C3 decomposition requires golden parity captures of current stockService outputs BEFORE any code moves. Neither is a silent-failure critical gap: they gate future changes, not shipped ones. LLM/prompt suites: n/a (no prompts touched).

**S7 Performance** — Formatters are O(1) per call over bounded financial magnitudes; the i18n re-export moves 2,100 lines across a module boundary that existed in one file before — bundler output should be equivalent (verify with a `build:client` size diff at H4, already in temporal notes). C3 is code motion, not hot-path change. No N+1, cache, or pool concerns introduced. No issues found.

**S8 Observability** — No new codepaths → no new logs/metrics/alerts in scope; the hottest server paths already gained bounded warn maps and per-item upstream failure logging in prior PRs (#38, #36). C6 is rendering-only (no observability surface). Debuggability unchanged: single-source formatters with specs improve it. No issues found.

**S9 Deployment & Rollout** — PRs deploy through Vercel previews automatically (verified: preview comment on #54); rollback is `git revert` — no migrations, no feature flags, no partial-state risk for pure refactors. C6 changes API response strings: ship it with a release note, not a flag (no flag infra exists; blast radius is display strings). Old/new code mix risk: none (client and server deploy atomically from the same commit on Vercel). No critical risks.

**S10 Long-Term Trajectory** — Reversibility: all refactor cards 5/5 (verbatim moves behind stable re-exports); C6 4/5 (semantic but revertible). Debt trajectory strongly positive: every card reduces the drift surface that caused 3 prior incidents. The 1-year question: a new engineer opening `shared/format.ts` or `client/lib/i18n/dictionaries.ts` sees single-source formatters/tables with pinned specs — self-explanatory. Platform potential: `shared/format.ts` is the seed of a per-runtime-tested shared display library. No issues found.

**S11 Design & UX** — No new screens, states, or flows; interaction-state coverage map is N/A. The two user-visible strings this plan touches: `-$4.80M` sign placement (fixed in #54, trivially correct) and C6's `"—"` vs `"$0"` for zero values (pending gate). DESIGN.md alignment: not implicated — no visual-system changes. Process finding (S effort): when C6 lands, include a before/after screenshot of the Quick Stats block in the PR so the semantic change is reviewable. No blocking issues.

### Outside Voice — Independent Plan Challenge
Codex preflight: binary not installed (`CODEX_MODE: not_installed`); this host has no subagent tool. **Outside voice unavailable — continuing with single-reviewer outputs.** Install codex for cross-model coverage (see TODOS.md).

CEO DUAL VOICES — CONSENSUS TABLE (single-reviewer degradation):
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                    PASS     N/A      N/A
  2. Right problem to solve?            PASS     N/A      N/A
  3. Scope calibration correct?         PASS     N/A      N/A
  4. Alternatives sufficiently explored?PASS     N/A      N/A
  5. Competitive/market risks covered?  N/A*     N/A      N/A
  6. 6-month trajectory sound?          PASS     N/A      N/A
═══════════════════════════════════════════════════════════════
* internal-refactor backlog; no market dimension. Missing voice = N/A (not CONFIRMED).
```
No cross-model tension points (no second voice ran). No cross-phase themes yet (this is Phase 1).

### Required outputs
- **NOT in scope**: E2 (shared/ barrel — zero dedup value, P4 reject), E5 (Intl.NumberFormat consolidation — different rendering contracts, P4 reject), stockService C3 and i18n C2b *execution* (this is a plan review; both remain backlog cards), /office-hours prerequisite (D1 defaulted to skip).
- **What already exists**: see Step 0B leverage map above (5 sub-problems mapped to canonical code).
- **Dream state delta**: see Step 0C.
- **Error & Rescue Registry**: N/A — plan adds no fallible codepath (S2 evidence above).
- **Failure Modes Registry**:
```
  CODEPATH                    | FAILURE MODE              | RESCUED? | TEST? | USER SEES? | LOGGED?
  ----------------------------|---------------------------|----------|-------|------------|--------
  shared/format (shipped #54) | non-finite/null input     | Y        | Y(8)  | "—"        | n/a (pure)
  i18n re-export (shipped #55)| key missing in dict       | Y        | Y(49) | en fallback| n/a
  C6 guard change (future)    | 0 rendered as "—" vs "$0" | n/a      | N ← G1| semantic   | n/a   ← WARNING
  C3 decomposition (future)   | behavior drift in move    | n/a      | N ← G2| latent     | n/a   ← WARNING
```
Zero CRITICAL silent-failure gaps (G1/G2 gate future work; no shipped path is unrescued+untested+silent).

### CEO Completion Summary
```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY (Phase 1)         |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION (autoplan override)     |
  | System Audit         | hot files = plan targets; no TODO debt;     |
  |                      | 2 unrelated stashes; codex missing          |
  | Step 0               | 4 premises confirmed (D2=A); E3 accepted;   |
  |                      | E2/E5 rejected; E4 deferred; E1 at gate     |
  | S1  (Arch)           | 0 new findings, 1 mitigated WARNING         |
  | S2  (Errors)         | 0 error paths, 0 GAPS (N/A: pure refactors) |
  | S3  (Security)       | 0 issues, 0 High                            |
  | S4  (Data/UX)        | 6 edges mapped, 1 pending (C6, at gate)     |
  | S5  (Quality)        | 0 new issues (C4 inversion noted)           |
  | S6  (Tests)          | diagram written, 2 gaps (G1, G2) auto-      |
  |                      | decided into candidate scope                |
  | S7  (Perf)           | 0 issues                                    |
  | S8  (Observ)         | 0 gaps                                      |
  | S9  (Deploy)         | 0 critical risks (revert = rollback)        |
  | S10 (Future)         | reversibility 5/5 refactors, 4/5 C6         |
  | S11 (Design)         | 1 process note (C6 screenshot), 0 blocking  |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written (5 mappings)                        |
  | Dream state delta    | written                                     |
  | Error/rescue registry| N/A (no new fallible codepath)              |
  | Failure modes        | 4 rows, 0 CRITICAL (2 WARNING-gating)       |
  | TODOS.md updates     | 3 items written                             |
  | Scope proposals      | 5 proposed, 1 accepted, 2 rejected,         |
  |                      | 1 deferred, 1 at gate                       |
  | CEO plan             | n/a (SELECTIVE EXPANSION via autoplan:      |
  |                      | decisions persisted in this plan file)      |
  | Outside voice        | unavailable (codex not installed)           |
  | Lake Score           | 4/5 recommendations chose complete option   |
  | Diagrams produced    | 2 (architecture, data-flow shadow paths)    |
  | Stale diagrams found | 0 (none existed in plan-touched files)      |
  | Unresolved decisions | 2 (E1 taste, C6 semantics — at final gate)  |
  +====================================================================+
```

**Unresolved decisions:** D1 (prerequisite offer) timed out with no answer — treated as its recommended default (skip /office-hours); noted, not silently defaulted mid-review. E1 and C6 carry to the Phase 4 gate.

**PHASE 1 COMPLETE.** Codex: unavailable. Claude (primary): 0 new critical findings, 2 test gaps auto-decided into scope, 2 items (E1, C6) to the gate. Consensus: 0/6 CONFIRMED (single-reviewer mode — N/A, not agreement). Premise gate passed. Passing to Phase 2 (Design).
## Autoplan Phase 2 — Design Review (scoped, 2026-09-03)

Scope gate: Phase 0 keyword-matched candidate-card prose, but the plan's full user-visible surface is two rendered strings (C6's `"—"` vs `"$0"`, and #54's `-$4.80M`). No screens, layouts, or flows exist to mock up — mockup generation skipped per the design skill's own zero-UI rule. Design binary available (`DESIGN_READY`) if a future candidate needs it. DESIGN.md exists (Vantage: night-sky/starlight token system) — no visual tokens are touched by any candidate.

**Step 0 rating: 6/10 design completeness** — for a refactor backlog this is high, because the one genuine design-semantics decision (C6) is explicitly surfaced with reasoning rather than buried. A 10/10 for this plan would mean: C6 decided with the convention documented next to the code.

### Seven dimensions
1. **Information hierarchy — N/A (no new surfaces).** Nothing changes what users see first/second/third. C6 only changes how one value class renders inside the existing Quick Stats hierarchy.
2. **Interaction state coverage — 8/10, one finding.** The repo already has a mature data-availability system (6-state tags, DataStatusBadge, `"—"` = missing). Auto-fix adopted (P5): C6's card must pin the convention explicitly — `"—"` means *no data* (null/undefined), and whatever C6 decides for `0` applies uniformly across all 12 quickStats sites. Partial data (some metrics present, some missing) already renders per-field; unchanged.
3. **User journey / emotional arc — 9/10.** Unchanged by refactors; `-$4.80M` sign correctness is a design-for-trust win (financial sign errors erode trust disproportionately). C6-done-right would extend that: a breakeven-FCF company showing `$0` reads as precise; showing `"—"` reads as broken.
4. **Specificity — 8/10.** Cards name files, line numbers, exact output strings, and test boundaries. Not generic patterns.
5. **DESIGN.md alignment — trivially aligned.** No color, type, or spacing changes; em-dash and money strings are content, not tokens. No changes needed to DESIGN.md.
6. **Responsive strategy — N/A.** No viewport-affecting changes; strings render in existing responsive containers.
7. **Accessibility — one genuine finding, reinforces C6.** Screen readers announce `"—"` as "dash" (ambiguous); `"$0"` announces as "zero dollars" (clear). Likewise `-$4.80M` reads more naturally than the old `$-4.80M`. C6 = if adopted, a small a11y improvement on top of the correctness fix. Noted as gate context, not a new decision.

DESIGN OUTSIDE VOICES — LITMUS SCORECARD (single-reviewer degradation; outside voice skipped as in Phase 1):
```
═══════════════════════════════════════════════════════════════
  Check                                    Claude  Codex  Consensus
  ─────────────────────────────────────── ─────── ─────── ─────────
  1. Brand unmistakable in first screen?    N/A*    N/A      N/A
  2. One strong visual anchor?              N/A*    N/A      N/A
  3. Scannable by headlines only?           N/A*    N/A      N/A
  4. Each section has one job?               PASS   N/A      N/A
  5. Cards actually necessary?               PASS   N/A      N/A
  6. Motion improves hierarchy?              N/A*    N/A      N/A
  7. Premium without decorative shadows?     N/A*    N/A      N/A
  ─────────────────────────────────────── ─────── ─────── ─────────
  Hard rejections triggered: none (no marketing/landing surface)
═══════════════════════════════════════════════════════════════
* not applicable — the plan renders two strings, not screens.
```

**PHASE 2 COMPLETE.** Codex: unavailable. Claude (primary): 1 state-coverage auto-fix (pin C6 convention), 1 a11y observation folded into the C6 gate item. Consensus: 2 applicable checks PASS, rest N/A. Passing to Phase 3 (Eng).

<!-- SEC-DECISION-SENTINEL -->
