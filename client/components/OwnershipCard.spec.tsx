// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import OwnershipCard from "./OwnershipCard";

/**
 * Contract net for the ownership card. The card pulls from the free Yahoo
 * `quoteSummary` modules via `/api/stock-ownership`; the data-shape logic
 * lives in the pure `ownershipNormalizer` spec. This pins the render
 * contract: the card mounts under the right section, shows its localized
 * title and the loading skeleton in the initial (server-rendered) state,
 * and never crashes with a stubbed network.
 */

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/stock-ownership")) {
      return new Response(
        JSON.stringify({
          institutionPercent: 62,
          insiderPercent: 0.2,
          institutionHolders: [{ name: "Vanguard Group", pctHeld: 3.5 }],
          fundHolders: [],
          insiderHolders: [],
          unavailable: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200 });
  }),
);

function renderCard(ticker = "AAPL") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLang="en">
        <OwnershipCard ticker={ticker} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("OwnershipCard", () => {
  it("renders the ownership section with a localized title", () => {
    const html = renderCard();
    expect(html).toContain("Ownership");
    expect(html).toContain('aria-label="Ownership"');
  });

  it("renders a loading skeleton in the initial state without crashing", () => {
    const html = renderCard("MSFT");
    // Three placeholder blocks in the loading grid.
    const pulses = (html.match(/animate-pulse/g) ?? []).length;
    expect(pulses).toBeGreaterThanOrEqual(3);
  });
});