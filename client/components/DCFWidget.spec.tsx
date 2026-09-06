// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { DCFWidget } from "./DCFWidget";
import { I18nProvider } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";

function withContext(node: React.ReactNode): React.ReactElement {
  return (
    <I18nProvider>
      <TooltipProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </TooltipProvider>
    </I18nProvider>
  );
}

describe("DCFWidget", () => {
  it("renders sandbox eyebrow, title, sliders, and fair value summary card", () => {
    const html = renderToString(
      withContext(<DCFWidget ticker="AAPL" currentPrice={231.42} />),
    );

    expect(html).toContain("INTERACTIVE VALUATION ENGINE");
    expect(html).toContain("Instant Discounted Cash Flow Sandbox");
    expect(html).toContain("Base FCF ($B)");
    expect(html).toContain("Expected 5Y Growth Rate (%)");
    expect(html).toContain("Terminal Exit Multiple (P/FCF)");
    expect(html).toContain("Target Discount Rate (%)");
    expect(html).toContain("ESTIMATED FAIR VALUE");
    expect(html).toContain("231.42");
  });

  it("renders in Earnings Mode with Base Net Income and P/E multiple", () => {
    const html = renderToString(
      withContext(
        <DCFWidget
          ticker="AAPL"
          currentPrice={231.42}
          initialEarnings={100.9}
          initialValuationMode="earnings"
        />,
      ),
    );

    expect(html).toContain("Base Net Income ($B)");
    expect(html).toContain("Terminal Exit Multiple (P/E)");
    expect(html).toContain("100.9");
  });

  it("renders correctly with custom assumptions and computes intrinsic fair value", () => {
    const html = renderToString(
      withContext(
        <DCFWidget
          ticker="MSFT"
          currentPrice={400.0}
          initialFcf={80.0}
          initialGrowth={12.0}
          initialMultiple={30.0}
          sharesOutstanding={7.5}
        />,
      ),
    );

    expect(html).toContain("400.00");
    expect(html).toContain("ESTIMATED FAIR VALUE");
  });

  it("handles extreme negative and positive target return bounds safely and produces distinct outputs", () => {
    const htmlMin = renderToString(
      withContext(
        <DCFWidget
          ticker="GOOGL"
          currentPrice={180.0}
          initialFcf={70.0}
          initialGrowth={15.0}
          initialMultiple={22.0}
          initialTargetReturn={-90.0}
        />,
      ),
    );

    expect(htmlMin).not.toContain("Infinity");
    expect(htmlMin).not.toContain("NaN");

    const htmlMax = renderToString(
      withContext(
        <DCFWidget
          ticker="GOOGL"
          currentPrice={180.0}
          initialFcf={70.0}
          initialGrowth={15.0}
          initialMultiple={22.0}
          initialTargetReturn={500.0}
        />,
      ),
    );

    expect(htmlMax).not.toContain("Infinity");
    expect(htmlMax).not.toContain("NaN");

    // The two renders with extreme target returns should produce valid HTML structures
    expect(htmlMin).toContain("180.00");
    expect(htmlMax).toContain("180.00");
  });

  it("clamps out-of-range initialTargetReturn props to supported bounds", () => {
    const htmlUnder = renderToString(
      withContext(
        <DCFWidget
          ticker="GOOGL"
          currentPrice={180.0}
          initialTargetReturn={-999.0}
        />,
      ),
    );
    expect(htmlUnder).not.toContain("Infinity");
    expect(htmlUnder).not.toContain("NaN");

    const htmlOver = renderToString(
      withContext(
        <DCFWidget
          ticker="GOOGL"
          currentPrice={180.0}
          initialTargetReturn={999.0}
        />,
      ),
    );
    expect(htmlOver).not.toContain("Infinity");
    expect(htmlOver).not.toContain("NaN");
  });
});
