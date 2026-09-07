/**
 * client/lib/scorecard.ts
 *
 * Pure scorecard math for the stock-health scorecard on the ticker page.
 * No React, no fetching — components feed the payloads in and render.
 *
 * Sources of honesty:
 *  - Altman Z + Piotroski are FMP `financial-scores` values passed through
 *    `/api/stock-metrics` untouched (only zoned/banded here for display).
 *  - Profitability and growth scores are VANTAGE composites — FMP's
 *    `financial-scores` payload carries no such fields (stocknest computes
 *    its own server-side). They are derived transparently from TTM metrics
 *    and statement YoY that the ticker page already fetches, and are always
 *    labeled "derived" in the UI so they can't read as an FMP number.
 */

import type {
  IncomeStatementRow,
  KeyMetricsTTM,
  RatiosTTM,
} from "@shared/api";

export type ScoreTone = "positive" | "neutral" | "negative";

export interface ScoreBand {
  /** i18n key for the band label (e.g. "scorecard.zone.safe"). */
  key: string;
  tone: ScoreTone;
}

/* ------------------------------------------------------------------ *
 * Altman Z-Score zone (standard bankruptcy-risk bands)                *
 * ------------------------------------------------------------------ */

export const ALTMAN_Z_SAFE = 3.0;
export const ALTMAN_Z_GREY = 1.8;

export function altmanZone(z: number | null): ScoreBand | null {
  if (z === null || !Number.isFinite(z)) return null;
  if (z >= ALTMAN_Z_SAFE)
    return { key: "scorecard.zone.safe", tone: "positive" };
  if (z >= ALTMAN_Z_GREY) return { key: "scorecard.zone.grey", tone: "neutral" };
  return { key: "scorecard.zone.distress", tone: "negative" };
}

/* ------------------------------------------------------------------ *
 * Piotroski F-Score band (0–9)                                        *
 * ------------------------------------------------------------------ */

export function piotroskiBand(p: number | null): ScoreBand | null {
  if (p === null || !Number.isFinite(p)) return null;
  if (p >= 7) return { key: "scorecard.band.strong", tone: "positive" };
  if (p >= 4) return { key: "scorecard.band.moderate", tone: "neutral" };
  return { key: "scorecard.band.weak", tone: "negative" };
}

/* ------------------------------------------------------------------ *
 * Composite helpers                                                   *
 * ------------------------------------------------------------------ */

/** Clamp a percentage to [0, 100]. */
function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Map a percent metric against a 100-point-at-`limit` scale. */
function scalePct(pct: number | null | undefined, limit: number): number | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  return clampPct((pct / limit) * 100);
}

const PROFITABILITY_WEIGHTS = {
  roe: 0.4,
  roa: 0.3,
  margin: 0.3,
} as const;

/**
 * Profitability composite (0–100, integer): weighted blend of ROE (100 pts
 * at 20%), ROA (100 pts at 10%) and net profit margin (100 pts at 25%).
 * Missing inputs are skipped with the remaining weights renormalized; null
 * when no input is available.
 */
export function profitabilityScore(
  metrics: KeyMetricsTTM | undefined,
  ratios: RatiosTTM | undefined,
): number | null {
  const parts: Array<{ weight: number; score: number }> = [];
  const push = (
    weight: number,
    score: number | null,
  ) => {
    if (score !== null) parts.push({ weight, score });
  };
  push(PROFITABILITY_WEIGHTS.roe, scalePct(metrics?.returnOnEquityTTM, 20));
  push(PROFITABILITY_WEIGHTS.roa, scalePct(metrics?.returnOnAssetsTTM, 10));
  push(
    PROFITABILITY_WEIGHTS.margin,
    scalePct(ratios?.netProfitMargin, 25),
  );
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const weighted = parts.reduce((s, p) => s + p.weight * p.score, 0);
  return Math.round(weighted / totalWeight);
}

const GROWTH_WEIGHTS = {
  revenue: 0.5,
  eps: 0.5,
} as const;

/** YoY % between two values (raw units), or null when not derivable. */
function yoyPct(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (
    cur === null || cur === undefined || !Number.isFinite(cur) ||
    prev === null || prev === undefined || !Number.isFinite(prev) ||
    prev === 0
  ) {
    return null;
  }
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/**
 * Growth composite (0–100, integer): blend of revenue YoY and EPS YoY from
 * the two most recent fiscal years of the income statement. Each maps
 * -10% → 0, 0% → ~33, +20% → 100 (linear). Missing rows skip their weight;
 * null when no consecutive FY pair exists.
 */
export function growthScore(
  income: readonly IncomeStatementRow[] | undefined,
): number | null {
  if (!income || income.length < 2) return null;
  const sorted = [...income].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const cur = sorted[0];
  const prev = sorted[1];
  const growthToScore = (yoy: number | null): number | null => {
    if (yoy === null) return null;
    // Linear map: -10% → 0, 0% → 33.3, 20%+ → 100.
    return clampPct(((yoy + 10) / 30) * 100);
  };
  const parts: Array<{ weight: number; score: number }> = [];
  const push = (weight: number, score: number | null) => {
    if (score !== null) parts.push({ weight, score });
  };
  push(
    GROWTH_WEIGHTS.revenue,
    growthToScore(yoyPct(cur.revenue, prev.revenue)),
  );
  push(GROWTH_WEIGHTS.eps, growthToScore(yoyPct(cur.eps, prev.eps)));
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const weighted = parts.reduce((s, p) => s + p.weight * p.score, 0);
  return Math.round(weighted / totalWeight);
}

/** 0–100 composite band (shared by profitability and growth). */
export function compositeBand(score: number | null): ScoreBand | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 70) return { key: "scorecard.band.strong", tone: "positive" };
  if (score >= 40) return { key: "scorecard.band.moderate", tone: "neutral" };
  return { key: "scorecard.band.weak", tone: "negative" };
}