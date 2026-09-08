/**
 * SEC EDGAR verification layer — independent cross-check of served data.
 *
 * Trust model problem this solves: `extendFinancialHistory` degrades
 * silently (correct for UX — a backfill must never break a response), but
 * that means a broken SEC path looks identical to "no extension available".
 * The 2026-09-08 User-Agent 403 incident proved the point: charts rendered
 * fine for months with 0 SEC rows and nobody knew.
 *
 * This module verifies a payload along four axes, each checkable against
 * SEC's own published numbers or against the pipeline's documented
 * invariants (docs/data-providers.md §3.5, tmp/issues/01-sec-history.md):
 *
 *   1. tag-integrity  — every `dataSource:"sec"` row carries a real XBRL
 *                       value; every SEC row is OLDER than every untagged
 *                       row (older-first merge invariant); SEC rows exist
 *                       when the family is under the depth target.
 *   2. depth          — families under `secTargetRows(period)` that have a
 *                       CIK but no SEC rows mean the backfill silently
 *                       failed (the incident signature).
 *   3. cross-source   — SEC rows' revenue re-derived independently from
 *                       raw `companyfacts` (no shared cache, no shared
 *                       mapper helpers beyond `buildSecHistoryRows` on the
 *                       fresh facts) and compared to the served rows.
 *   4. sanity         — plausible magnitudes (non-negative revenue/assets,
 *                       revenue vs assets order-of-magnitude, gross profit
 *                       ≤ revenue) so a mapping bug can't pass silently.
 *
 * Every check reports pass/warn/fail with an actionable `detail`, so an
 * outside user (or CI) can distinguish "verified against SEC" from
 * "plausible but unverified" from "broken".
 */

import type {
  FinancialStatements,
  IncomeStatementRow,
  BalanceSheetRow,
  CashFlowRow,
} from "../../shared/api";
import {
  lookupCik,
  fetchCompanyFacts,
  buildSecHistoryRows,
  secTargetRows,
} from "./secEdgar";

export interface VerifyCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SecVerifyResult {
  symbol: string;
  period: "annual" | "quarter";
  /** ISO timestamp of the verification run. */
  verifiedAt: string;
  /** True when SEC data was reachable during this run. */
  secReachable: boolean;
  /** CIK resolved for the symbol (null = non-US/ETF — out of SEC scope). */
  cik: string | null;
  /** Row counts of the payload under test. */
  counts: { income: number; balance: number; cash: number };
  /** Per-statement split of provenance tags in the payload. */
  secTagged: { income: number; balance: number; cash: number };
  checks: VerifyCheck[];
  /** Overall: all critical checks pass and SEC was reachable. */
  verdict: "verified" | "partial" | "unverified" | "failed";
}

const REL_TOL = 0.005; // 0.5% — same number must round-trip the mapper

function familyCount<T extends { dataSource?: string }>(rows: T[]): number {
  return rows.filter((r) => r.dataSource === "sec").length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Check 1 — tag integrity + merge invariants on the payload itself
 * (no network): SEC rows must be strictly older than untagged rows and
 * SEC rows must all carry the required fields.
 */
export function verifyTagIntegrity(payload: FinancialStatements): VerifyCheck[] {
  const checks: VerifyCheck[] = [];

  const families = [
    { name: "income", rows: payload.income },
    { name: "balance", rows: payload.balance },
    { name: "cash", rows: payload.cash },
  ];

  for (const fam of families) {
    const secRows = fam.rows.filter((r) => r.dataSource === "sec");
    const untagged = fam.rows.filter((r) => r.dataSource !== "sec");
    if (secRows.length === 0) continue; // depth check covers absence

    const secNewest = secRows.reduce((m, r) => (r.date > m ? r.date : m), "");
    const baseOldest = untagged.reduce(
      (m, r) => (m === "" || r.date < m ? r.date : m),
      "",
    );
    if (untagged.length > 0 && secNewest >= baseOldest) {
      checks.push({
        id: `merge-order:${fam.name}`,
        status: "fail",
        detail: `SEC row dated ${secNewest} is not older than untagged row ${baseOldest} — older-first merge invariant violated`,
      });
    } else {
      checks.push({
        id: `merge-order:${fam.name}`,
        status: "pass",
        detail: `${secRows.length} SEC rows all older than ${baseOldest || "—"}`,
      });
    }

    // Tagged rows must be real rows: date + at least one non-zero metric.
    const empty = secRows.filter((r) => {
      const v = (r as unknown as Record<string, unknown>).revenue ?? (r as unknown as Record<string, unknown>).totalAssets ?? (r as unknown as Record<string, unknown>).operatingCashFlow;
      return !r.date || typeof v !== "number" || v === 0;
    });
    checks.push({
      id: `tag-integrity:${fam.name}`,
      status: empty.length === 0 ? "pass" : "fail",
      detail:
        empty.length === 0
          ? `${secRows.length} tagged rows all carry dated, non-zero values`
          : `${empty.length} tagged rows are empty or undated (first: ${empty[0]?.date ?? "no date"})`,
    });
  }

  return checks;
}

/**
 * Check 2 — depth: under-target families with a resolved CIK but zero SEC
 * rows are the silent-failure signature (the UA-403 incident).
 */
export function verifyDepth(
  payload: FinancialStatements,
  cik: string | null,
  period: "annual" | "quarter",
): VerifyCheck[] {
  const target = secTargetRows(period);
  const checks: VerifyCheck[] = [];
  const families = [
    { name: "income", count: payload.income.length },
    { name: "balance", count: payload.balance.length },
    { name: "cash", count: payload.cash.length },
  ];
  for (const fam of families) {
    if (fam.count >= target) {
      checks.push({
        id: `depth:${fam.name}`,
        status: "pass",
        detail: `${fam.count}/${target} rows meets the 10-year target`,
      });
      continue;
    }
    if (!cik) {
      checks.push({
        id: `depth:${fam.name}`,
        status: "warn",
        detail: `${fam.count}/${target} rows; no SEC CIK — expected for non-US/ETF tickers`,
      });
      continue;
    }
    checks.push({
      id: `depth:${fam.name}`,
      status: "fail",
      detail:
        fam.count === 0
          ? `0 rows with CIK ${cik} — statement fetch failed outright`
          : `${fam.count}/${target} rows under target WITH a CIK — backfill did not fire (silent-failure signature)`,
    });
  }
  return checks;
}

/**
 * Check 3 — cross-source: re-derive revenue straight from freshly-fetched
 * raw companyfacts (bypassing every cache) and compare against the served
 * SEC-tagged rows. A drift here means cache poisoning, mapper regression,
 * or a stale/poisoned KV entry.
 */
export async function verifyCrossSource(
  symbol: string,
  payload: FinancialStatements,
  cik: string | null,
): Promise<{ checks: VerifyCheck[]; reachable: boolean }> {
  const checks: VerifyCheck[] = [];
  if (!cik) {
    return {
      checks: [
        {
          id: "cross-source:revenue",
          status: "warn",
          detail: "no CIK — cross-source check not applicable",
        },
      ],
      reachable: false,
    };
  }

  // Independent fetch: fresh HTTP call, no KV, no memoized facts (the
  // 24h factsMemo would defeat the point of an independent check).
  const facts = await fetchCompanyFactsFresh(cik);
  if (!facts) {
    return {
      checks: [
        {
          id: "cross-source:revenue",
          status: "warn",
          detail: "SEC unreachable during verification — cross-source not performed",
        },
      ],
      reachable: false,
    };
  }

  const sec = buildSecHistoryRows(facts, symbol, "quarter");
  const secByDate = new Map(sec.income.map((r) => [r.date, r]));

  const tagged = payload.income.filter((r) => r.dataSource === "sec");
  const comparable = tagged.filter((r) => secByDate.has(r.date));
  if (comparable.length === 0) {
    return {
      checks: [
        {
          id: "cross-source:revenue",
          status: "warn",
          detail: "no overlapping SEC-tagged rows to compare — nothing verified numerically",
        },
      ],
      reachable: true,
    };
  }

  let mismatches = 0;
  let worst = 0;
  let worstDate = "";
  for (const row of comparable) {
    const fresh = secByDate.get(row.date)!.revenue;
    if (!Number.isFinite(fresh) || fresh === 0) continue;
    const drift = Math.abs(row.revenue - fresh) / Math.abs(fresh);
    if (drift > REL_TOL) {
      mismatches += 1;
      if (drift > worst) {
        worst = drift;
        worstDate = row.date;
      }
    }
  }

  checks.push({
    id: "cross-source:revenue",
    status: mismatches === 0 ? "pass" : "fail",
    detail:
      mismatches === 0
        ? `${comparable.length}/${tagged.length} SEC rows match freshly-fetched EDGAR values (±${REL_TOL * 100}%)`
        : `${mismatches}/${comparable.length} rows drift beyond ${REL_TOL * 100}% (worst: ${worstDate} at ${(worst * 100).toFixed(1)}%)`,
  });

  return { checks, reachable: true };
}

/**
 * Check 4 — sanity: cheap plausibility bounds that catch mapping bugs
 * (units confusion, sign flips) even when cross-source can't run.
 */
export function verifySanity(payload: FinancialStatements): VerifyCheck[] {
  const checks: VerifyCheck[] = [];
  const inc = payload.income.filter((r) => r.dataSource === "sec");
  const bal = payload.balance.filter((r) => r.dataSource === "sec");

  const negatives = [
    ...inc.filter((r) => r.revenue < 0),
    ...bal.filter((r) => r.totalAssets < 0),
  ];
  checks.push({
    id: "sanity:non-negative",
    status: negatives.length === 0 ? "pass" : "fail",
    detail:
      negatives.length === 0
        ? "no negative revenue/assets among SEC rows"
        : `${negatives.length} SEC rows with negative revenue/assets`,
  });

  // Gross profit must not exceed revenue in the same row.
  const gpViolations = inc.filter(
    (r) => r.grossProfit > 0 && r.revenue > 0 && r.grossProfit > r.revenue * 1.01,
  );
  checks.push({
    id: "sanity:gross-profit",
    status: gpViolations.length === 0 ? "pass" : "fail",
    detail:
      gpViolations.length === 0
        ? "gross profit ≤ revenue on all SEC income rows"
        : `${gpViolations.length} rows where grossProfit > revenue (${gpViolations[0].date})`,
  });

  // Magnitude: median revenue should be far below median total assets for
  // a going concern (revenue > 5× assets would signal a units bug).
  if (inc.length > 0 && bal.length > 0) {
    const medRev = median(inc.map((r) => r.revenue));
    const medAssets = median(bal.map((r) => r.totalAssets));
    const implausible = medRev > medAssets * 5;
    checks.push({
      id: "sanity:magnitude",
      status: implausible ? "warn" : "pass",
      detail: `median revenue ${(medRev / 1e9).toFixed(1)}B vs median assets ${(medAssets / 1e9).toFixed(1)}B`,
    });
  }

  return checks;
}

/** Fetch companyfacts bypassing the in-process memo (independent check). */
async function fetchCompanyFactsFresh(cik: string): Promise<SecCompanyFactsLike | null> {
  // secEdgar memoizes per process; the verification contract requires an
  // independent read. Direct HTTP with the same UA policy and timeout.
  const res = await fetchWithTimeout(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    20_000,
  );
  return res;
}

interface SecCompanyFactsLike {
  facts?: { "us-gaap"?: Record<string, unknown> };
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.SEC_EDGAR_USER_AGENT || "Vantage research (roberttiger9@gmail.com)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as SecCompanyFactsLike;
  } catch {
    return null;
  }
}

/**
 * Full verification of a served payload. `payload` is what the API
 * actually returned (from cache or live) — the verifier never mutates it.
 */
export async function verifyFinancialPayload(
  symbol: string,
  period: "annual" | "quarter",
  payload: FinancialStatements,
): Promise<SecVerifyResult> {
  const checks: VerifyCheck[] = [];

  const tagChecks = verifyTagIntegrity(payload);
  checks.push(...tagChecks);

  const cik = await lookupCik(symbol).catch(() => null);
  const depthChecks = verifyDepth(payload, cik, period);
  checks.push(...depthChecks);

  const { checks: crossChecks, reachable } = await verifyCrossSource(
    symbol,
    payload,
    cik,
  );
  checks.push(...crossChecks);

  checks.push(...verifySanity(payload));

  const secTagged = {
    income: familyCount(payload.income),
    balance: familyCount(payload.balance),
    cash: familyCount(payload.cash),
  };

  const criticalFails = checks.filter(
    (c) => c.status === "fail" && !c.id.startsWith("depth:"),
  ).length;
  const depthFails = checks.filter(
    (c) => c.status === "fail" && c.id.startsWith("depth:"),
  ).length;

  let verdict: SecVerifyResult["verdict"];
  if (!reachable) verdict = "unverified";
  else if (criticalFails > 0) verdict = "failed";
  else if (depthFails > 0) verdict = "partial";
  else if (secTagged.income + secTagged.balance + secTagged.cash === 0)
    verdict = "partial";
  else verdict = "verified";

  return {
    symbol,
    period,
    verifiedAt: new Date().toISOString(),
    secReachable: reachable,
    cik,
    counts: {
      income: payload.income.length,
      balance: payload.balance.length,
      cash: payload.cash.length,
    },
    secTagged,
    checks,
    verdict,
  };
}

/* ── Unused-type guards (kept for API symmetry with shared/api.ts) ───── */
export type { IncomeStatementRow, BalanceSheetRow, CashFlowRow };
