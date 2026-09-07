// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ScreenerFundamentalPanel from "./ScreenerFundamentalPanel";
import { I18nProvider } from "@/lib/i18n";

/**
 * Static render contract for the live fundamental screener panel.
 *
 * The panel is additive to the metadata screener: it renders a collapsed
 * header by default (no network — its queries stay disabled until the
 * user presses Screen), then reveals the cap-band chips + numeric range
 * grid once expanded. This spec pins that the component mounts and the
 * header + default metadata wiring are present without a live backend.
 * The filter semantics themselves are unit-tested server-side in
 * `server/services/screenerMetrics.spec.ts` (the source of truth), and
 * every `screenerFund.*` key is statically validated in both EN and HE
 * by the i18n audit spec.
 */

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("[]", { status: 200 })),
);

function withProviders(node: React.ReactNode): React.ReactElement {
  return (
    <I18nProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>
  );
}

describe("ScreenerFundamentalPanel", () => {
  it("renders the collapsed header with the live-filters title", () => {
    const html = renderToString(
      withProviders(
        <ScreenerFundamentalPanel
          metadata={{
            q: "",
            sector: [],
            industry: [],
            country: ["United States"],
            asset_type: ["Equity"],
            exclude_dots: true,
          }}
        />,
      ),
    );
    expect(html).toMatch(/Live Fundamental Filters|מסננים פיננסיים חיים/);
    // Collapsed by default — the range grid body is not rendered yet.
    expect(html).not.toMatch(/P\/E|EV\/EBITDA/);
  });

  it("passes the page's metadata through without crashing (Hebrew metadata)", () => {
    const html = renderToString(
      withProviders(
        <ScreenerFundamentalPanel
          metadata={{
            q: "apple",
            sector: ["Technology"],
            industry: [],
            country: ["United States"],
            asset_type: ["Equity", "ETF"],
            exclude_dots: true,
          }}
        />,
      ),
    );
    expect(html).toMatch(/Live Fundamental Filters|מסננים פיננסיים חיים/);
  });
});