/**
 * server/services/ownershipNormalizer.ts
 *
 * Pure normalizer for Yahoo `quoteSummary` ownership modules —
 * `defaultKeyStatistics` (aggregate %), `institutionOwnership`,
 * `fundOwnership`, and `insiderHolders` — into the shared `StockOwnership`
 * shape. Tolerant of Yahoo's mixed conventions: values arrive either flat
 * (`number`) or content-wrapped (`{ raw, fmt }`), percentages as decimals
 * (0.035 = 3.5%), and dates as ms epochs.
 *
 * Used by both runtimes: `stockService.getOwnership` (TS) and the
 * `api/_router.js` parity twin (JS — duplicate the small helpers there,
 * matching the existing insider-transactions twin pattern).
 */

import type { StockOwnership } from "../../shared/api";

/** Extract a finite number from a flat value or a `{raw, fmt}` wrapper. */
export function unwrapNumber(
  value: unknown,
): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "object") {
    const raw = (value as { raw?: unknown }).raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Yahoo reports percentages as decimals (0.035 = 3.5%); normalize to %-points. */
export function toPercent(value: unknown): number | undefined {
  const n = unwrapNumber(value);
  if (n === undefined) return undefined;
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  // Round away float noise (0.035 * 100 = 3.5000000000000004).
  return Math.round(pct * 1e4) / 1e4;
}

function toIsoDate(value: unknown): string | undefined {
  const n = unwrapNumber(value);
  if (n === undefined) return undefined;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

const TOP_N = 10;

/** Normalize one `ownershipList` entry (institution/fund holders). */
function toOwnershipHolder(raw: unknown): {
  name: string;
  pctHeld?: number;
  position?: number;
  value?: number;
  reportDate?: string;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.organization ?? r.name ?? "").trim();
  const out: {
    name: string;
    pctHeld?: number;
    position?: number;
    value?: number;
    reportDate?: string;
  } = { name };
  const pct = toPercent(r.pctHeld);
  if (pct !== undefined) out.pctHeld = pct;
  const position = unwrapNumber(r.position);
  if (position !== undefined) out.position = position;
  const value = unwrapNumber(r.value);
  if (value !== undefined) out.value = value;
  const reportDate = toIsoDate(r.reportDate);
  if (reportDate !== undefined) out.reportDate = reportDate;
  return out;
}

/** Normalize one `holders` entry (top insider holders). */
function toInsiderHolder(raw: unknown): {
  name: string;
  title?: string;
  relation?: string;
  latestTransDate?: string;
  shares?: number;
  value?: number;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  const out: {
    name: string;
    title?: string;
    relation?: string;
    latestTransDate?: string;
    shares?: number;
    value?: number;
  } = { name };
  if (typeof r.title === "string" && r.title.trim()) out.title = r.title.trim();
  if (typeof r.relation === "string" && r.relation.trim())
    out.relation = r.relation.trim();
  const transDate = toIsoDate(r.latestTransDate);
  if (transDate !== undefined) out.latestTransDate = transDate;
  const shares = unwrapNumber(r.shares);
  if (shares !== undefined) out.shares = shares;
  const value = unwrapNumber(r.value);
  if (value !== undefined) out.value = value;
  return out;
}

/**
 * Normalize the raw `quoteSummary` payload into `StockOwnership`.
 * `unavailable` is true only when Yahoo returned nothing usable — no
 * aggregates and no holder lists (callers must NOT fall back to premium
 * FMP ownership endpoints).
 */
export function normalizeOwnership(raw: unknown): StockOwnership {
  const r = (raw ?? {}) as Record<string, unknown>;

  const dks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const institutionPercent = toPercent(dks.heldPercentInstitutions);
  const insiderPercent = toPercent(dks.heldPercentInsiders);

  const institutionList = Array.isArray(
    (r.institutionOwnership as Record<string, unknown> | undefined)
      ?.ownershipList,
  )
    ? (r.institutionOwnership as { ownershipList: unknown[] }).ownershipList
    : [];
  const fundList = Array.isArray(
    (r.fundOwnership as Record<string, unknown> | undefined)?.ownershipList,
  )
    ? (r.fundOwnership as { ownershipList: unknown[] }).ownershipList
    : [];
  const insiderList = Array.isArray(
    (r.insiderHolders as Record<string, unknown> | undefined)?.holders,
  )
    ? (r.insiderHolders as { holders: unknown[] }).holders
    : [];

  const institutionHolders = institutionList
    .slice(0, TOP_N)
    .map(toOwnershipHolder);
  const fundHolders = fundList.slice(0, TOP_N).map(toOwnershipHolder);
  const insiderHolders = insiderList.slice(0, TOP_N).map(toInsiderHolder);

  const unavailable =
    institutionPercent === undefined &&
    insiderPercent === undefined &&
    institutionHolders.length === 0 &&
    fundHolders.length === 0 &&
    insiderHolders.length === 0;

  return {
    ...(institutionPercent !== undefined ? { institutionPercent } : {}),
    ...(insiderPercent !== undefined ? { insiderPercent } : {}),
    institutionHolders,
    fundHolders,
    insiderHolders,
    unavailable,
  };
}