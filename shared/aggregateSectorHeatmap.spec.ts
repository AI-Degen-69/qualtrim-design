import { describe, it, expect } from "vitest";
import { aggregateSectorHeatmap } from "./aggregateSectorHeatmap";
import type { ChartSeries } from "./api";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a chart with N consecutive trading-day closes starting at `startDate`. */
function makeChart(
  symbol: string,
  closes: number[],
  startDate = "2025-03-10",
): ChartSeries {
  const historical = closes.map((close, i) => {
    const d = new Date(`${startDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      open: close,
      high: close,
      low: close,
      close,
      adjClose: close,
      volume: 1_000_000,
      change: 0,
      changePercent: 0,
    };
  });
  return { symbol, historical };
}

/** Build a chart where each close's date string is supplied verbatim. */
function makeChartWithDates(
  symbol: string,
  points: Array<{ date: string; close: number }>,
): ChartSeries {
  const historical = points.map((p) => ({
    date: p.date,
    open: p.close,
    high: p.close,
    low: p.close,
    close: p.close,
    adjClose: p.close,
    volume: 1_000_000,
    change: 0,
    changePercent: 0,
  }));
  return { symbol, historical };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("aggregateSectorHeatmap", () => {
  it("returns empty shape when rows list is empty", () => {
    const out = aggregateSectorHeatmap([], 5);
    expect(out.days).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.untagged).toEqual([]);
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns empty shape when no ticker has 2+ valid closes", () => {
    const out = aggregateSectorHeatmap(
      [
        {
          symbol: "AAPL",
          sector: "Technology",
          chart: makeChart("AAPL", [100]),
        },
        { symbol: "MSFT", sector: "Technology", chart: null },
      ],
      5,
    );
    expect(out.rows).toEqual([]);
    expect(out.days).toEqual([]);
  });

  it("computes a single-sector single-ticker 5-day heatmap", () => {
    // 6 closes → 5 deltas; each step is +1% so the per-day avg should be +1%.
    const closes = [100, 101, 102.01, 103.0301, 104.0604, 105.101];
    const aapl = makeChart("AAPL", closes, "2025-03-10");
    const out = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: aapl }],
      5,
    );
    expect(out.days).toHaveLength(5);
    expect(out.days[0]).toBe("2025-03-11"); // first delta ends on day 2
    expect(out.days[4]).toBe("2025-03-15"); // last delta ends on day 6
    expect(out.rows).toHaveLength(1);
    const row = out.rows[0];
    expect(row.sector).toBe("Technology");
    expect(row.cells).toHaveLength(5);
    for (const cell of row.cells) {
      expect(cell.movePct).toBeCloseTo(1.0, 5);
      expect(cell.withPrice).toBe(1);
      expect(row.universeCount).toBe(1);
    }
    // Without todayIso supplied, `isPartial` is always false (caller drives).
    expect(row.cells[4].isPartial).toBe(false);
  });

  it("marks the rightmost cell as partial only when todayIso + weekday match", () => {
    // Axis ends at 2025-03-15 (Friday). todayIso = 2025-03-15.
    const aapl = makeChart("AAPL", [100, 101, 102, 103], "2025-03-10");
    const out = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: aapl }],
      5,
      { todayIso: "2025-03-15" }, // Saturday landing
    );
    expect(out.days).toHaveLength(3);
    // 2025-03-15 is a Saturday → rightmost is NOT partial (Friday's settled
    // close shouldn't be mislabeled as today's intraday).
    expect(out.rows[0].cells.map((c) => c.isPartial)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("marks partial on a weekday landing that matches the axis end", () => {
    // Recreate the same closing dates but pass todayIso as a Friday that
    // matches the axis end. Now the rightmost cell SHOULD be partial.
    const aapl = makeChart("AAPL", [100, 101, 102, 103], "2025-03-10");
    const out = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: aapl }],
      5,
      { todayIso: "2025-03-13" }, // Friday, matches axis end
    );
    expect(out.rows[0].cells.map((c) => c.isPartial)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("averages daily moves across multiple tickers in the same sector", () => {
    const aapl = makeChart("AAPL", [100, 101], "2025-03-10");
    const msft = makeChart("MSFT", [200, 198], "2025-03-10");
    const out = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "MSFT", sector: "Technology", chart: msft },
      ],
      5,
    );
    expect(out.rows).toHaveLength(1);
    const cell = out.rows[0].cells[0];
    expect(cell.movePct).toBeCloseTo(0, 6);
    expect(cell.withPrice).toBe(2);
    expect(cell.total).toBe(2);
    expect(out.rows[0].universeCount).toBe(2);
    expect(out.rows[0].weekNet).toBeCloseTo(0, 6);
  });

  it("sorts rows by weekNet desc so the hottest sector is at the top", () => {
    const aapl = makeChart(
      "AAPL",
      [100, 102, 104.04, 106.1208, 108.2432, 110.4081],
      "2025-03-10",
    );
    const jnj = makeChart(
      "JNJ",
      [100, 99.5, 99.0, 98.5, 98.01, 97.51],
      "2025-03-10",
    );
    const out = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "JNJ", sector: "Healthcare", chart: jnj },
      ],
      5,
    );
    expect(out.rows.map((r) => r.sector)).toEqual(["Technology", "Healthcare"]);
  });

  it("aligns the date axis to the universe's most-recent distinct dates", () => {
    const aapl = makeChart(
      "AAPL",
      [100, 101, 102, 103, 104, 105],
      "2025-03-10",
    );
    const msft = makeChart("MSFT", [200, 202, 204], "2025-03-13");
    const out = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "MSFT", sector: "Technology", chart: msft },
      ],
      5,
    );
    expect(out.days).toEqual([
      "2025-03-11",
      "2025-03-12",
      "2025-03-13",
      "2025-03-14",
      "2025-03-15",
    ]);
    expect(out.rows[0].cells.map((c) => c.withPrice)).toEqual([1, 1, 1, 2, 2]);
  });

  it("isolates null-sector tickers in `untagged[]`", () => {
    const aapl = makeChart("AAPL", [100, 101, 102, 103], "2025-03-10");
    const orphan = makeChart("XYZ", [50, 51, 52, 53], "2025-03-10");
    const out = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "XYZ", sector: "  ", chart: orphan }, // whitespace-only tag
      ],
      5,
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].sector).toBe("Technology");
    expect(out.untagged).toHaveLength(1);
    expect(out.untagged[0].symbol).toBe("XYZ");
    expect(out.untagged[0].cells).toHaveLength(out.days.length);
    for (const cell of out.untagged[0].cells) {
      expect(cell.movePct).not.toBeNull();
      expect(cell.movePct).toBeGreaterThan(1.9);
      expect(cell.movePct).toBeLessThan(2.1);
    }
  });

  it("routes excluded-sector tickers into untagged[] when allowedSectors set", () => {
    // Without allowlist: Healthcare row appears. With allowlist=
    // ["Technology"]: JNJ must NOT be in rows[] (filtered out), and MUST
    // also appear in untagged[] (so the heatmap count stays honest).
    const aapl = makeChart(
      "AAPL",
      [100, 102, 104, 106, 108, 110],
      "2025-03-10",
    );
    const jnj = makeChart("JNJ", [100, 99, 98, 97, 96, 95], "2025-03-10");
    const outNoAllow = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "JNJ", sector: "Healthcare", chart: jnj },
      ],
      5,
    );
    expect(outNoAllow.rows.map((r) => r.sector)).toEqual([
      "Technology",
      "Healthcare",
    ]);
    expect(outNoAllow.untagged).toEqual([]);

    const outAllow = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "JNJ", sector: "Healthcare", chart: jnj },
      ],
      5,
      { allowedSectors: ["Technology"] },
    );
    expect(outAllow.rows.map((r) => r.sector)).toEqual(["Technology"]);
    // JNJ fell into untagged (its sector wasn't allowlisted).
    expect(outAllow.untagged.map((u) => u.symbol)).toEqual(["JNJ"]);
    // The untagged row still carries per-day moves so the footer can show
    // a per-ticker trajectory chip if desired.
    expect(outAllow.untagged[0].cells.length).toBe(outAllow.days.length);
    for (const cell of outAllow.untagged[0].cells) {
      // JNJ's daily moves are negative (97→96, 96→95 ≈ -1%).
      expect(cell.movePct).not.toBeNull();
      expect(cell.movePct).toBeLessThan(0);
    }
  });

  it("skips zero / negative closes without affecting the heatmap", () => {
    const weird = makeChartWithDates("WEIRD", [
      { date: "2025-03-10", close: 100 },
      { date: "2025-03-11", close: 0 },
      { date: "2025-03-12", close: 0 },
      { date: "2025-03-13", close: 102 },
      { date: "2025-03-14", close: 104 },
      { date: "2025-03-15", close: 106 },
    ]);
    const out = aggregateSectorHeatmap(
      [{ symbol: "WEIRD", sector: "Technology", chart: weird }],
      5,
    );
    expect(out.days).toHaveLength(3);
    expect(out.rows[0].weekNet).toBeCloseTo(6.0, 4);
  });

  it("clamps the days parameter to [1, 20]", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const aapl = makeChart("AAPL", closes, "2025-03-01");
    const outHigh = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: aapl }],
      999,
    );
    expect(outHigh.days.length).toBeLessThanOrEqual(20);
    const outLow = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: aapl }],
      0,
    );
    expect(outLow.days.length).toBeLessThanOrEqual(5);
  });

  it("returns each row's universeCount equal to total tickers in that sector", () => {
    const aapl = makeChart("AAPL", [100, 101, 102, 103, 104], "2025-03-10");
    const msft = makeChart("MSFT", [200, 201, 202, 203, 204], "2025-03-10");
    const out = aggregateSectorHeatmap(
      [
        { symbol: "AAPL", sector: "Technology", chart: aapl },
        { symbol: "MSFT", sector: "Technology", chart: msft },
        {
          symbol: "COST",
          sector: "Consumer Defensive",
          chart: makeChart("COST", [500, 502], "2025-03-13"),
        },
      ],
      5,
    );
    const tech = out.rows.find((r) => r.sector === "Technology")!;
    const cons = out.rows.find((r) => r.sector === "Consumer Defensive")!;
    expect(tech.universeCount).toBe(2);
    expect(cons.universeCount).toBe(1);
  });

  it("keeps charts out of order sorted asc by date for delta math", () => {
    const disordered: ChartSeries = {
      symbol: "AAPL",
      historical: [
        {
          date: "2025-03-13",
          open: 103,
          high: 103,
          low: 103,
          close: 103,
          adjClose: 103,
          volume: 0,
          change: 0,
          changePercent: 0,
        },
        {
          date: "2025-03-11",
          open: 101,
          high: 101,
          low: 101,
          close: 101,
          adjClose: 101,
          volume: 0,
          change: 0,
          changePercent: 0,
        },
        {
          date: "2025-03-12",
          open: 102,
          high: 102,
          low: 102,
          close: 102,
          adjClose: 102,
          volume: 0,
          change: 0,
          changePercent: 0,
        },
        {
          date: "2025-03-10",
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          adjClose: 100,
          volume: 0,
          change: 0,
          changePercent: 0,
        },
      ],
    };
    const out = aggregateSectorHeatmap(
      [{ symbol: "AAPL", sector: "Technology", chart: disordered }],
      5,
    );
    expect(out.days).toEqual(["2025-03-11", "2025-03-12", "2025-03-13"]);
    for (const c of out.rows[0].cells) {
      expect(c.movePct).toBeGreaterThan(0.9);
      expect(c.movePct).toBeLessThan(1.05);
    }
  });
});
