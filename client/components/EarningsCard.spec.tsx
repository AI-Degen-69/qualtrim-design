import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { EarningsCard, type EarningsEventData } from "./EarningsCard";

describe("EarningsCard", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const renderWithContext = (ui: React.ReactElement) =>
    renderToString(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

  it("renders ticker symbol, company name, and estimates correctly", () => {
    const event: EarningsEventData = {
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      date: "Mon",
      dateFull: "Feb 24, 2025",
      epsEst: 5.59,
      epsActual: 5.82,
      revEst: 24.6,
      time: "After Close",
      surprise: "beat",
      isWatchlist: true,
    };

    const html = renderWithContext(<EarningsCard event={event} />);

    expect(html).toContain("NVDA");
    expect(html).toContain("NVIDIA Corporation");
    expect(html).toContain("Watchlist");
    expect(html).toContain("BEAT");
    expect(html).toContain("5.59");
    expect(html).toContain("5.82");
    expect(html).toContain("$24.60B");
    expect(html).toContain('title="After Close"');
  });

  it("renders Before Open timing badge and miss surprise pill", () => {
    const event: EarningsEventData = {
      ticker: "SNOW",
      name: "Snowflake Inc.",
      date: "Tue",
      dateFull: "Feb 25, 2025",
      epsEst: 0.2,
      epsActual: 0.15,
      revEst: 0.75,
      time: "Before Open",
      surprise: "miss",
      isWatchlist: false,
    };

    const html = renderWithContext(<EarningsCard event={event} />);

    expect(html).toContain("SNOW");
    expect(html).toContain("Snowflake Inc.");
    expect(html).toContain("MISS");
    expect(html).toContain("0.20");
    expect(html).toContain("0.15");
    expect(html).toContain("$750M");
    expect(html).toContain('title="Before Open"');
  });

  it("renders unknown timing gracefully with clock icon and neutral badge", () => {
    const event: EarningsEventData = {
      ticker: "PLTR",
      name: "Palantir Technologies",
      date: "Wed",
      dateFull: "Feb 26, 2025",
      epsEst: 0.09,
      revEst: 0.701,
      time: "unknown",
      isWatchlist: false,
    };

    const html = renderWithContext(<EarningsCard event={event} />);

    expect(html).toContain("PLTR");
    expect(html).toContain("Unspecified Time");
  });
});
