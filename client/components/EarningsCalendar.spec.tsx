import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { EarningsCalendar } from "./EarningsCalendar";

describe("EarningsCalendar", () => {
  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  const renderWithContext = (
    ui: React.ReactElement,
    client = createQueryClient(),
  ) =>
    renderToString(
      <QueryClientProvider client={client}>
        <I18nProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

  it("renders header, data provenance banner, and grid events in fallback mode", () => {
    const html = renderWithContext(
      <EarningsCalendar from="2025-02-24" to="2025-02-28" />,
    );

    expect(html).toContain(
      "Upcoming Earnings Calendar &amp; Wall St. Consensus",
    );
    expect(html).toContain(
      "Financial Modeling Prep (FMP) &amp; Yahoo Finance Consensus",
    );
    expect(html).toContain("NVDA");
    expect(html).toContain("SNOW");
  });

  it("renders weekly column view with Pre-Market and After-Hours separation", () => {
    const html = renderWithContext(
      <EarningsCalendar
        from="2025-02-24"
        to="2025-02-28"
        initialViewMode="calendar"
      />,
    );

    expect(html).toContain("Pre-Market");
    expect(html).toContain("After-Hours");
    expect(html).toContain("Market Close");
  });

  it("renders live API seeded data and respects market cap filtering", () => {
    const queryClient = createQueryClient();
    const mockApiData = [
      {
        symbol: "AMZN",
        name: "Amazon.com Inc",
        date: "2025-02-24",
        marketCap: 2_100_000_000_000,
        epsEstimated: 1.15,
        eps: 1.25,
        revenueEstimated: 170_000_000_000,
        revenue: 172_000_000_000,
        time: "amc",
      },
      {
        symbol: "SMALLCO",
        name: "Small Cap Inc",
        date: "2025-02-25",
        marketCap: 850_000_000,
        epsEstimated: 0.05,
        revenueEstimated: 250_000_000,
        time: "bmo",
      },
    ];

    queryClient.setQueryData(
      ["earningsCalendar", "2025-02-24", "2025-02-28"],
      mockApiData,
    );

    // Large Cap filter should render AMZN and exclude SMALLCO
    const htmlLarge = renderWithContext(
      <EarningsCalendar from="2025-02-24" to="2025-02-28" marketCap="large" />,
      queryClient,
    );

    expect(htmlLarge).toContain("AMZN");
    expect(htmlLarge).not.toContain("SMALLCO");

    // Small Cap filter should render SMALLCO and exclude AMZN
    const htmlSmall = renderWithContext(
      <EarningsCalendar from="2025-02-24" to="2025-02-28" marketCap="small" />,
      queryClient,
    );

    expect(htmlSmall).toContain("SMALLCO");
    expect(htmlSmall).not.toContain("AMZN");
  });

  it("renders empty state with adjustment hint when no events match day filter", () => {
    const queryClient = createQueryClient();
    const mondayOnly = [
      {
        symbol: "AMZN",
        name: "Amazon.com Inc",
        date: "2025-02-24",
        marketCap: 2_100_000_000_000,
        epsEstimated: 1.15,
        time: "amc",
      },
    ];
    queryClient.setQueryData(
      ["earningsCalendar", "2025-02-24", "2025-02-28"],
      mondayOnly,
    );

    // Selecting Friday should result in empty list for Friday
    const htmlEmpty = renderWithContext(
      <EarningsCalendar from="2025-02-24" to="2025-02-28" initialDay="Fri" />,
      queryClient,
    );

    expect(htmlEmpty).toContain("No earnings events this week");
    expect(htmlEmpty).toContain("Adjust your watchlist or market cap filters");
  });

  it("renders upcoming fallback mock events with estimates only and without premature BEAT badges", () => {
    const html = renderWithContext(
      <EarningsCalendar from="2026-08-24" to="2026-08-28" />,
    );

    // NVDA should be rendered with EPS and Rev estimates
    expect(html).toContain("NVDA");
    expect(html).toContain("NVIDIA Corporation");
    expect(html).toContain("$0.65");
    expect(html).toContain("$28.70B");
    // Should NOT contain a premature BEAT / MISS badge or actual EPS row
    expect(html).not.toContain("BEAT");
    expect(html).not.toContain("MISS");
    expect(html).not.toContain("Actual EPS");
  });
});
