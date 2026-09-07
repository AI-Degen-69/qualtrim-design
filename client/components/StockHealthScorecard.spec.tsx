// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { I18nProvider } from "@/lib/i18n";
import StockHealthScorecard from "./StockHealthScorecard";
import type { StockMetrics } from "@shared/api";

/**
 * Contract net for the stock-health scorecard. The component takes payloads
 * as props (no hooks/network), so this spec pins both render branches:
 *
 *   1. FMP scores present → Altman Z + Piotroski render their values with
 *      the FMP source chip and the as-of year; profitability/growth render
 *      their derived composites with the Derived chip.
 *   2. No scores / no metrics → all four cards fall back to "—" with the
 *      locked Unavailable chip (no invented numbers).
 *
 * Band labels + composite math are covered by the pure `scorecard` spec.
 */

const fmpMetrics: StockMetrics = {
  metrics: {
    returnOnEquityTTM: 160,
    returnOnAssetsTTM: 28,
    roicTTM: 55,
  },
  ratios: { netProfitMargin: 25 },
  scores: {
    symbol: "AAPL",
    altmanZScore: 4.87,
    piotroskiScore: 8,
    year: "2024",
  },
  source: "fmp",
};

function render(metrics?: StockMetrics | null, income?: unknown[], loading = false) {
  return renderToString(
    <I18nProvider initialLang="en">
      <StockHealthScorecard
        metrics={metrics ?? undefined}
        income={income as never}
        loading={loading}
      />
    </I18nProvider>,
  );
}

describe("StockHealthScorecard", () => {
  it("renders all four scores with FMP scores present", () => {
    const html = render(fmpMetrics);
    expect(html).toContain("Altman Z");
    expect(html).toContain("4.87");
    expect(html).toContain("8 / 9");
    expect(html).toContain("Profitability");
    expect(html).toContain("Growth");
    // Source chips
    expect(html).toContain("FMP");
    expect(html).toContain("Derived");
    // As-of year context
    expect(html).toContain("as of FY 2024");
    // Band labels
    expect(html).toContain("Safe zone");
    expect(html).toContain("Strong");
  });

  it("renders the unavailable treatment when scores are missing", () => {
    const html = render(null);
    expect(html).toContain("Unavailable");
    // Value dashes
    expect(html).toContain(">—<");
    // The scorecard shell + explanations still render
    expect(html).toContain("Health Scorecard");
    expect(html).toContain("Bankruptcy-risk model");
  });

  it("derives profitability/growth composites from payload data", () => {
    const html = render(fmpMetrics, [
      {
        date: "2024-09-28",
        symbol: "AAPL",
        reportedCurrency: "USD",
        calendarYear: "2024",
        period: "FY",
        revenue: 120e9,
        grossProfit: 0,
        ebitda: 0,
        operatingIncome: 0,
        netIncome: 0,
        eps: 2.4,
      },
      {
        date: "2023-09-30",
        symbol: "AAPL",
        reportedCurrency: "USD",
        calendarYear: "2023",
        period: "FY",
        revenue: 100e9,
        grossProfit: 0,
        ebitda: 0,
        operatingIncome: 0,
        netIncome: 0,
        eps: 2,
      },
    ]);
    // ROE 160%→clamped 100, ROA 28%→100, margin 25%→100 → 100; growth 20%/20% → 100
    expect(html).toContain(">100<");
  });
});