import type { ChartSeries, SectorHeatmapResponse } from "./api";

/**
 * One row of the input the heatmap aggregator consumes — keeps the
 * `sector` optional so rows that lack a sector tag end up in `untagged`
 * instead of being silently merged under a placeholder name.
 */
export interface SectorHeatmapInputRow {
  symbol: string;
  sector: string | null;
  chart: ChartSeries | null;
}

/**
 * Pure helper: `ChartSeries[]` → `SectorHeatmapResponse`. No I/O. Lives in
 * `shared/` so it's reachable from server and client under the existing
 * `@shared/*` alias convention — keeps cross-tree imports out of the way.
 *
 * Algorithm:
 *  1. For each input row, sort closes ASC, filter `close>0 && finite`,
 *     take the last `(days+1)` to produce `(days)` daily deltas.
 *  2. Build the **universe-wide date axis** by unioning every row's delta
 *     dates, then taking the `days` most-recent distinct dates. This
 *     guarantees column headers are stable across tickers that have
 *     different start dates (e.g. a recently-IPO'd name).
 *  3. For each sector, average the delta pct for every date on the axis —
 *     missing cell contributions are skipped, not zero-filled.
 *  4. `weekNet` = `mean((latestClose - oldestClose) / oldestClose * 100)`
 *     across that sector's tickers with valid bookends. Sort rows by
 *     weekNet desc so the hot sectors land at the top.
 *  5. The rightmost axis date is marked `isPartial=true` when it matches
 *     `todayIso` (caller's "today" — usually passed as the server's local
 *     date). On weekends, callers pass `todayIso` = the most-recent
 *     trading-day close date, which keeps cells from being mislabeled as
 *     "today's intraday" on Saturday/Sunday landings.
 *  6. Sector allowlist: when `allowedSectors` is supplied, sectors NOT in
 *     the list are dropped from `rows[]` AND those tickers fall into
 *     `untagged[]` (count transparency — the same principle that drove
 *     the prior Sector Spotlight's untagged disclosure).
 *
 * Defensive moves:
 *  - `close <= 0` and non-finite closes are skipped wholesale.
 *  - When a ticker only has 1 valid close, its daily-deltas list is empty
 *    but it CANNOT contribute to `weekNet` (no bookend pair).
 *  - When the resulting `rows` is empty, the caller (server) MUST still
 *    return the response — a stable empty shape matters more than a 404.
 */
export function aggregateSectorHeatmap(
  rows: SectorHeatmapInputRow[],
  days: number,
  options?: { allowedSectors?: string[] | null; todayIso?: string | null },
): SectorHeatmapResponse {
  const targetDays = Math.max(1, Math.min(20, Math.floor(days) || 5));
  const empty = (): SectorHeatmapResponse => ({
    days: [],
    rows: [],
    untagged: [],
    generatedAt: new Date().toISOString(),
  });
  if (rows.length === 0) return empty();

  // Per-ticker pipeline: closes → delta% map (date → pct).
  interface TickerPipeline {
    symbol: string;
    sectorRaw: string | null;
    /** ISO date → pct, ordered asc by date. Length ≤ targetDays. */
    dailyMoves: Array<{ date: string; pct: number }>;
    /** Bookends for weekNet. */
    firstClose: number | null;
    lastClose: number | null;
    firstDate: string | null;
    lastDate: string | null;
  }
  const pipelines: TickerPipeline[] = rows.map((row) => {
    const ordered = (row.chart?.historical ?? [])
      .filter((p) => Number.isFinite(p.close) && p.close > 0)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const tail = ordered.slice(-(targetDays + 1));
    const dailyMoves: TickerPipeline["dailyMoves"] = [];
    for (let i = 1; i < tail.length; i++) {
      const prev = tail[i - 1];
      const cur = tail[i];
      if (prev.close <= 0) continue;
      dailyMoves.push({
        date: cur.date,
        pct: ((cur.close - prev.close) / prev.close) * 100,
      });
    }
    return {
      symbol: row.symbol,
      sectorRaw: row.sector?.trim() || null,
      dailyMoves,
      firstClose: tail.length > 0 ? tail[0].close : null,
      lastClose: tail.length > 0 ? tail[tail.length - 1].close : null,
      firstDate: tail.length > 0 ? tail[0].date : null,
      lastDate: tail.length > 0 ? tail[tail.length - 1].date : null,
    };
  });

  // Build the universe-wide date axis: union of every daily-move date,
  // asc-sorted, take the most-recent `targetDays` distinct entries.
  const dateSet = new Set<string>();
  for (const p of pipelines) {
    for (const m of p.dailyMoves) dateSet.add(m.date);
  }
  if (dateSet.size === 0) return empty();
  const allDates = Array.from(dateSet).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const axis = allDates.slice(-targetDays); // oldest → newest
  const axisSet = new Set(axis);
  const axisLast = axis[axis.length - 1];
  // Rightmost cell is partial ONLY when the axis ends today AND today is a
  // weekday. On weekends, last close settles on Friday, so calling that
  // cell "today (partial)" misleads readers — suppress the badge.
  const todayIso = (options?.todayIso ?? "").trim() || null;
  const todayIsWeekend =
    todayIso === null
      ? false
      : (() => {
          try {
            const d = new Date(`${todayIso}T00:00:00.000Z`);
            const dow = d.getUTCDay();
            return dow === 0 || dow === 6;
          } catch {
            return false;
          }
        })();
  const isPartialFor = (date: string): boolean =>
    todayIso !== null &&
    date === axisLast &&
    date === todayIso &&
    !todayIsWeekend;

  // Sector aggregation. We average per-ticker daily moves so a sector with
  // 4 of 5 tickers contributing today isn't diluted by a halted name.
  interface SectorAccumulator {
    sector: string;
    universeCount: number;
    /** Per-axis-date: { sum, count } so we can compute mean on demand. */
    cells: Map<string, { sum: number; count: number }>;
    /** Bookend-based weekNet contributor. */
    weekNetSum: number;
    weekNetCount: number;
  }

  // Sector allowlist. When supplied, sectors NOT in the list have their
  // tickers routed into `untagged[]` instead of disappearing silently.
  // The untagged disclosure is what gives callers confidence the heatmap
  // count matches the cards above it.
  const allowSet =
    options?.allowedSectors && options.allowedSectors.length > 0
      ? new Set(options.allowedSectors.map((s) => s.trim()).filter(Boolean))
      : null;

  const acc = new Map<string, SectorAccumulator>();
  const untagged: SectorHeatmapResponse["untagged"] = [];

  for (const p of pipelines) {
    const effectiveSector =
      p.sectorRaw !== null && (allowSet === null || allowSet.has(p.sectorRaw))
        ? p.sectorRaw
        : null;

    if (effectiveSector === null) {
      // Track so the footer can quote the count + show a sparkline of moves
      // for tickers the editor forgot to tag OR tickers whose sector the
      // allowlist dropped.
      untagged.push({
        symbol: p.symbol,
        cells: axis.map((date) => {
          const m = p.dailyMoves.find((x) => x.date === date);
          return {
            date,
            movePct: m ? m.pct : null,
            isPartial: isPartialFor(date),
          };
        }),
      });
      continue;
    }
    let entry = acc.get(effectiveSector);
    if (!entry) {
      entry = {
        sector: effectiveSector,
        universeCount: 0,
        cells: new Map(),
        weekNetSum: 0,
        weekNetCount: 0,
      };
      acc.set(effectiveSector, entry);
    }
    entry.universeCount += 1;

    for (const date of axis) {
      if (!axisSet.has(date)) continue;
      const m = p.dailyMoves.find((x) => x.date === date);
      if (!m || !Number.isFinite(m.pct)) continue;
      const cur = entry.cells.get(date) ?? { sum: 0, count: 0 };
      cur.sum += m.pct;
      cur.count += 1;
      entry.cells.set(date, cur);
    }

    if (
      p.firstClose !== null &&
      p.lastClose !== null &&
      p.firstDate !== null &&
      p.lastDate !== null &&
      p.firstClose > 0 &&
      p.firstDate !== p.lastDate
    ) {
      entry.weekNetSum += ((p.lastClose - p.firstClose) / p.firstClose) * 100;
      entry.weekNetCount += 1;
    }
  }

  const aggregated = Array.from(acc.values())
    .map<SectorHeatmapResponse["rows"][number]>((entry) => ({
      sector: entry.sector,
      cells: axis.map((date) => {
        const c = entry.cells.get(date);
        return {
          date,
          movePct: c && c.count > 0 ? c.sum / c.count : null,
          withPrice: c?.count ?? 0,
          total: entry.universeCount,
          isPartial: isPartialFor(date),
        };
      }),
      weekNet:
        entry.weekNetCount > 0 ? entry.weekNetSum / entry.weekNetCount : null,
      universeCount: entry.universeCount,
    }))
    // Hottest sector at top; sectors where EVERY day is null sink to the
    // bottom so the heatmap doesn't interleave "no data" rows with active ones.
    .sort((a, b) => {
      const aN = a.weekNet ?? -Infinity;
      const bN = b.weekNet ?? -Infinity;
      return bN - aN;
    });

  return {
    days: axis.slice(),
    rows: aggregated,
    untagged,
    generatedAt: new Date().toISOString(),
  };
}
