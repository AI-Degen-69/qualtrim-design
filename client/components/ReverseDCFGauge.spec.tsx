// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import ReverseDCFGauge, {
  solveImpliedGrowthRate,
  getExpectationRegime,
} from "./ReverseDCFGauge";
import { computeDcfFairValue } from "./ValuationSensitivityMatrix";
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

describe("solveImpliedGrowthRate", () => {
  it("solves for implied growth rate such that DCF fair value equals current market price", () => {
    const base = 100;
    const discountRate = 9;
    const multiple = 25;
    const shares = 15;
    const targetPrice = 200;

    const solvedG = solveImpliedGrowthRate(
      base,
      targetPrice,
      discountRate,
      multiple,
      shares,
    );
    expect(solvedG).not.toBeNull();

    if (solvedG !== null) {
      const calculatedFV = computeDcfFairValue(
        base,
        solvedG,
        discountRate,
        multiple,
        shares,
      );
      expect(Math.abs(calculatedFV - targetPrice)).toBeLessThan(0.1);
    }
  });

  it("handles edge cases safely returning null or bounded results", () => {
    expect(solveImpliedGrowthRate(0, 100, 9, 25, 15)).toBeNull();
    expect(solveImpliedGrowthRate(100, 0, 9, 25, 15)).toBeNull();
    expect(solveImpliedGrowthRate(100, 100, 9, 25, 0)).toBeNull();
    expect(solveImpliedGrowthRate(-50, 100, 9, 25, 15)).toBeNull();
  });
});

describe("getExpectationRegime", () => {
  it("correctly identifies all 5 expectation regimes", () => {
    expect(getExpectationRegime(30).key).toBe("dcf.regimeHyper");
    expect(getExpectationRegime(20).key).toBe("dcf.regimeHigh");
    expect(getExpectationRegime(10).key).toBe("dcf.regimeModerate");
    expect(getExpectationRegime(3).key).toBe("dcf.regimeLow");
    expect(getExpectationRegime(-5).key).toBe("dcf.regimeContraction");
  });
});

describe("ReverseDCFGauge component", () => {
  it("renders gauge title, speedometer SVG, implied CAGR, and stat cards", () => {
    const html = renderToString(
      withContext(
        <ReverseDCFGauge
          activeBase={108.8}
          currentPrice={231.42}
          discountRate={9.0}
          multiple={25.0}
          sharesOutstanding={15.2}
          userGrowthRate={12.0}
          valuationMode="cashFlow"
        />,
      ),
    );

    expect(html).toContain("Reverse DCF Expectation Solver");
    expect(html).toContain("Market-Implied 5Y CAGR");
    expect(html).toContain("Your Assumption");
    expect(html).toContain("Expectation Spread");
    expect(html).toContain("Implied Year 5 Base");
    expect(html).toContain('role="img"');
  });

  it("renders in Hebrew RTL mode properly", () => {
    const html = renderToString(
      <I18nProvider initialLang="he">
        <TooltipProvider>
          <MemoryRouter>
            <ReverseDCFGauge
              activeBase={108.8}
              currentPrice={231.42}
              discountRate={9.0}
              multiple={25.0}
              sharesOutstanding={15.2}
              userGrowthRate={12.0}
              valuationMode="cashFlow"
            />
          </MemoryRouter>
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(html).toContain("Reverse DCF");
    expect(html).toContain("קצב צמיחה שנתי מגולם בשוק");
    expect(html).toContain("הנחת העבודה שלך");
    expect(html).toContain("מרווח ציפיות");
  });

  it("renders Reverse DCF tab in DCFWidget", () => {
    const html = renderToString(
      withContext(<DCFWidget ticker="AAPL" currentPrice={231.42} />),
    );

    expect(html).toContain("Reverse DCF");
  });
});
