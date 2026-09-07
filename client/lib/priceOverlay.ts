/**
 * client/lib/priceOverlay.ts
 *
 * Pure alignment helpers for overlaying a share-price line on the financial
 * charts' fiscal-period bars. The statements give us period labels ("2024",
 * "FY 2024", "Q1 2025"); the chart/price route gives daily history points
 * dated YYYY-MM-DD. The overlay shows, for every visible bar, the latest
 * adjusted close whose calendar period is at or before that fiscal period —
 * i.e. a year-end close for an annual bar and a quarter-end close for a
 * quarterly/TTM bar.
 *
 * Calendar vs fiscal nuance: labels map to *calendar* windows (the price
 * history has no fiscal-year concept). A company whose fiscal year ends in
 * September therefore overlays its "2024" bar with the close at the end of
 * calendar 2024 — the standard year-end-price read, and the mismatch only
 * ever picks a close slightly *after* the fiscal period end, never a wrong
 * one from the future.
 *
 * Pure functions only — no React, no fetching. `buildCloseOverlay` receives
 * the already-windowed display labels and the full history and returns a
 * parallel array (null where no price exists for a period, e.g. locked
 * placeholder bars or a history that predates the label).
 */

import type { ChartPoint } from "@shared/api";

export interface FiscalWindow {
  year: number;
  /** 1–4, or null for a full-year (annual) label. */
  quarter: number | null;
}

/**
 * Parse a chart x-label into a fiscal window. Understands the label shapes
 * the statements actually produce:
 *   - "Q1 2025" / "Q1-2025" (quarterly + TTM bars)
 *   - "FY 2024" / "FY2024" (projected annual rows)
 *   - "2024" (the grid's annual data, bare calendar year)
 * Anything else (e.g. "Locked - 2" placeholder bars) → null.
 */
export function parseFiscalLabel(label: string): FiscalWindow | null {
  const s = String(label ?? "").trim();
  const quarter = /^Q([1-4])[\s-]*(\d{4})$/.exec(s);
  if (quarter) return { year: Number(quarter[2]), quarter: Number(quarter[1]) };
  const year = /^(?:FY[\s-]*)?(\d{4})$/.exec(s);
  if (year) return { year: Number(year[1]), quarter: null };
  return null;
}

/** Calendar (year, quarter) of a "YYYY-MM-DD" history date, or null. */
function calendarWindow(date: string): { year: number; quarter: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(String(date ?? ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    quarter: Math.floor((Number(match[2]) - 1) / 3) + 1,
  };
}

/**
 * Latest adjusted close whose calendar period is at or before `label`'s
 * window, or null when the history has no point that early. Annual labels
 * act as year-end windows (any quarter of that calendar year qualifies);
 * quarterly labels cap at their own calendar quarter.
 */
export function latestCloseForLabel(
  history: readonly ChartPoint[],
  label: string,
): number | null {
  const window = parseFiscalLabel(label);
  if (!window || !Array.isArray(history)) return null;
  const labelKey = window.year * 10 + (window.quarter ?? 4);
  let bestClose: number | null = null;
  let bestDate = "";
  for (const point of history) {
    const cal = calendarWindow(point.date);
    if (!cal) continue;
    if (cal.year * 10 + cal.quarter <= labelKey && point.date > bestDate) {
      bestClose = point.adjClose;
      bestDate = point.date;
    }
  }
  return Number.isFinite(bestClose as number) ? bestClose : null;
}

/** Whether at least one of the aligned values is a usable price. */
export function overlayHasPoints(
  aligned: ReadonlyArray<number | null>,
): boolean {
  return aligned.some((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Align a close-price series to a list of period labels. The result is the
 * same length as `labels`; entries whose label has no price (locked bars,
 * history that predates the period) are null.
 */
export function buildCloseOverlay(
  labels: readonly string[],
  history: readonly ChartPoint[],
): (number | null)[] {
  return labels.map((label) => latestCloseForLabel(history, label));
}
