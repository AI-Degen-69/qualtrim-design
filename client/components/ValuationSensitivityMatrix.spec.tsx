// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import ValuationSensitivityMatrix, {
  computeDcfFairValue,
  getValuationCellTheme,
} from "./ValuationSensitivityMatrix";
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

describe("computeDcfFairValue", () => {
  it("computes reasonable fair value per share for standard inputs", () => {
    // base: $100B, growth: 10%, discount: 9%, multiple: 25x, shares: 15B
    const fv = computeDcfFairValue(100, 10, 9, 25, 15);
    expect(fv).toBeGreaterThan(150);
    expect(fv).toBeLessThan(350);
  });

  it("handles edge cases safely without NaN or Infinity", () => {
    expect(computeDcfFairValue(0, 10, 9, 25, 15)).toBe(0);
    expect(computeDcfFairValue(100, 10, 9, 25, 0)).toBe(0);
    expect(computeDcfFairValue(-50, 10, 9, 25, 15)).toBe(0);
  });
});

describe("getValuationCellTheme", () => {
  it("returns deepDiscount when fair value is >30% above market price", () => {
    const theme = getValuationCellTheme(200, 100);
    expect(theme.verdict).toBe("deepDiscount");
    expect(theme.textClass).toContain("text-chart-positive");
  });

  it("returns undervalued when fair value is 10% to 30% above market price", () => {
    const theme = getValuationCellTheme(120, 100);
    expect(theme.verdict).toBe("undervalued");
    expect(theme.textClass).toContain("text-emerald-400");
  });

  it("returns fair when fair value is within +-10% of market price", () => {
    const theme = getValuationCellTheme(102, 100);
    expect(theme.verdict).toBe("fair");
  });

  it("returns overvalued when fair value is 10% to 25% below market price", () => {
    const theme = getValuationCellTheme(80, 100);
    expect(theme.verdict).toBe("overvalued");
  });

  it("returns deepOvervalued when fair value is >25% below market price", () => {
    const theme = getValuationCellTheme(50, 100);
    expect(theme.verdict).toBe("deepOvervalued");
    expect(theme.textClass).toContain("text-chart-negative");
  });
});

describe("ValuationSensitivityMatrix component", () => {
  it("renders 5x5 matrix grid, dimension selector, and current price banner", () => {
    const html = renderToString(
      withContext(
        <ValuationSensitivityMatrix
          activeBase={108.8}
          currentPrice={231.42}
          growthRate={10.0}
          multiple={25.0}
          discountRate={9.0}
          sharesOutstanding={15.2}
          valuationMode="cashFlow"
        />,
      ),
    );

    expect(html).toContain("2D Valuation Sensitivity Matrix");
    expect(html).toContain("WACC × Growth Rate");
    expect(html).toContain("WACC × Exit Multiple");
    expect(html).toContain("Market Price");
    expect(html).toContain("231.42");
    expect(html).toContain("FCF Base");
    expect(html).toContain("WACC");
  });

  it("renders tab button for Sensitivity Matrix in DCFWidget", () => {
    const html = renderToString(
      withContext(<DCFWidget ticker="AAPL" currentPrice={231.42} />),
    );

    expect(html).toContain("Sensitivity Matrix");
    expect(html).toContain("2D Valuation Sensitivity Matrix");
  });
});
