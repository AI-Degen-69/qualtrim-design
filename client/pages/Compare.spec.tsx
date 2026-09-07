// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import Compare from "./Compare";

/**
 * Contract net for the Compare page: with every network query stubbed, the
 * server-rendered shell must expose the page chrome — title, ticker chips
 * (defaults AAPL/MSFT/NVDA), the five group headings, and the metric row
 * labels — so a regression can't silently drop the table scaffolding.
 *
 * Value/delta math is covered by the pure `compareMetrics` spec; this spec
 * pins the wiring (route-independent page, i18n keys present in the active
 * dictionary, per-ticker fan-out mounted) without depending on async query
 * resolution (renderToString sees the loading state).
 */

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.includes("/api/stock-financials")) {
      return json({
        income: [
          {
            date: "2024-09-28",
            symbol: "AAPL",
            reportedCurrency: "USD",
            calendarYear: "2024",
            period: "FY",
            revenue: 400e9,
            grossProfit: 170e9,
            ebitda: 130e9,
            operatingIncome: 120e9,
            netIncome: 100e9,
            eps: 6.5,
          },
        ],
        balance: [],
        cash: [],
      });
    }
    if (url.includes("/api/stock-metrics")) {
      return json({ metrics: {}, ratios: {}, scores: null });
    }
    if (url.includes("/api/stock-quote")) {
      return json({
        symbol: "AAPL",
        price: 233.1,
        change: 2.7,
        changesPercentage: 1.17,
        marketCap: 3.4e12,
      });
    }
    if (url.includes("/api/stock-overview")) {
      return json({
        symbol: "AAPL",
        companyName: "Apple Inc.",
        currency: "USD",
        sector: "Technology",
      });
    }
    if (url.includes("/api/screener/search")) {
      return json({ results: [] });
    }
    return json([]);
  }),
);

function renderCompare() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang="en">
          <MemoryRouter initialEntries={["/compare"]}>
            <Compare />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

describe("Compare page", () => {
  it("renders the page header and metric table scaffolding", () => {
    const html = renderCompare();
    expect(html).toContain("Compare Stocks");
    expect(html).toContain("Metric");
    // All five group headings
    expect(html).toContain("Revenue &amp; Profitability");
    expect(html).toContain("Balance Sheet");
    expect(html).toContain("Cash Flow");
    expect(html).toContain("Valuation (TTM)");
    expect(html).toContain("Market");
    // Default ticker chips
    expect(html).toContain("AAPL");
    expect(html).toContain("MSFT");
    expect(html).toContain("NVDA");
  });

  it("renders representative metric row labels from the shared vocabulary", () => {
    const html = renderCompare();
    for (const label of [
      "Revenue",
      "EBITDA",
      "Gross Margin",
      "Total Debt",
      "Free Cash Flow",
      "P/E (TTM)",
      "ROE (TTM)",
      "Current Ratio",
      "1D Change",
    ]) {
      expect(html).toContain(label);
    }
  });
});