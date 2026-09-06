// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChartModal from "./ChartModal";
import { I18nProvider } from "@/lib/i18n";
import type { FinancialMetric } from "@/lib/mockData";

/**
 * Parked regression net for the locked-premium banner inside the
 * expanded chart modal.
 *
 * Background: when the FMP free-tier quota is exhausted (or no FMP key
 * is configured), `RevenueSegmentsCard` renders a locked chip strip on
 * the card. Clicking Expand chart used to silently open the regular
 * total-revenue chart with NO indication that segment breakdown is
 * gated — the modal gave users no feedback about why per-segment data
 * didn't show up. The fix threads `segmentLockedReason` through
 * `RevenueSegmentsCard` → `InsightsCard` → `ChartModal`, and the modal
 * renders a banner + locked chip strip above the chart in that state.
 *
 * This spec pins that contract so a future refactor can't silently
 * drop the call site. We mount the modal server-side (`renderToString`
 * works fine in happy-dom) and assert:
 *
 *   1. The banner container is present.
 *   2. The locked `🔒 Segments` chip + tooltip are present.
 *   3. The copy switches between the rate-limited and unavailable
 *      branches when the prop changes.
 *   4. The banner is hidden when `segmentLockedReason` is null AND
 *      the modal is in non-segment mode (the regular chart path
 *      stays unchanged for every other metric).
 *   5. The banner is hidden when the modal IS in segment mode
 *      (data is fine; the chip-filter row below the chart suffices).
 *
 * I18n copy is asserted via regex that matches either EN or HE so the
 * test stays valid regardless of which dictionary `I18nProvider`
 * resolves to in the test environment.
 */

// Stub the network so react-query hooks resolve immediately. Every
// downstream `useStock*` query reads this and gets an empty array,
// which is a benign shape for the cards, charts, and the TickerLogo
// silently embedded in the modal header.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("[]", { status: 200 })),
);

/** Single-period revenue metric — the only one for which the modal
 *  ever switches into segment / locked-segment modes. */
const revenueMetric = {
  name: "insights.revenue",
  type: "area",
  color: "#10b981",
  unit: "$",
  data: [
    { date: "2021-09-30", value: 365.8 },
    { date: "2022-09-30", value: 394.3 },
    { date: "2023-09-30", value: 383.3 },
    { date: "2024-09-30", value: 391.0 },
    { date: "2025-09-30", value: 416.2 },
  ],
  yoy: 0.064,
  cagr3Y: 0.044,
} as unknown as FinancialMetric;

function withProviders(node: React.ReactNode): React.ReactElement {
  // retry:false + gcTime=0 so a flapping request doesn't trip retries
  // and pollute the rendered HTML with isLoading spinners.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>
  );
}

describe("ChartModal — segmentLockedReason banner (locked-premium UX)", () => {
  it("renders the rate-limited banner + locked chip strip above the revenue chart", () => {
    const html = renderToString(
      withProviders(
        <ChartModal
          metric={revenueMetric}
          isOpen={true}
          onClose={() => {}}
          ticker="AAPL"
          segmentRows={[]}
          selectedSegment={null}
          segmentLockedReason="rateLimited"
          // Forwarded by Index.tsx — opens the placeholder /pricing modal.
          onUpgradeClick={() => undefined}
        />,
      ),
    );

    // ── Banner copy ─────────────────────────────────────────────────
    // Title — matches EN or HE dictionary.
    expect(html).toMatch(/Per-segment breakdown locked|פילוח לפי מגזר נעול/);
    // Body — rate-limited specific copy (free-tier quota exhausted).
    expect(html).toMatch(
      /free-tier FMP quota is exhausted|מכסת ה-FMP היומית.*בתוכנית החינמית הסתיימה/,
    );

    // ── Locked chip strip ──────────────────────────────────────────
    // "All" chip (visually selected / locked-in state).
    expect(html).toContain(">All<"); // chip's text-content = "All"
    // "Segments" chip (HE: מגזרים). Either language should resolve.
    expect(html).toMatch(/Segments|מגזרים/);
    // Lock icon — lucide-react SVG with the canonical class name.
    expect(html).toMatch(/lucide-lock/);
    // Locked-tooltip language matches the prop reason.
    expect(html).toMatch(
      /Segment breakdown is a premium feature|פילוח לפי מגזר הוא תכונת פרימיום/,
    );

    // ── Premium pill ─────────────────────────────────────────────────
    // Discoverable indicator that the lock is a paid-feature gate
    // (not a missing-data bug). Carries the Starlight Gold accent so
    // it stands out next to the muted gray lock chip.
    expect(html).toContain('data-testid="revenue-segments-premium-badge"');
    expect(html).toMatch(/Premium|פרימיום/); // badge copy, language-aware
    expect(html).toMatch(/border-primary\/40 bg-primary\/15 text-primary/); // gold styling

    // ── Upgrade CTA — placeholder /pricing modal opener ─────────────
    // Pin both presence (when onUpgradeClick supplied) here, and
    // absence (when not) below. The CTA is the actual destination of
    // the user-visible "Upgrade →" affordance.
    expect(html).toContain('data-testid="revenue-segments-upgrade-cta"');
    expect(html).toMatch(/Upgrade|שדרג/); // CTA copy, language-aware
    expect(html).toMatch(/bg-primary text-primary-foreground/); // CTA styling

    // Sanity: the modal chrome + chart container still render below the
    // banner — the user has the same total-revenue shape, just with the
    // lock state surfaced. (Recharts' SVG itself only renders in a real
    // DOM measurement phase, so we can't probe chart-axis labels during
    // SSR — that's the AnimatedNumber-spec caveat too.)
    expect(html).toContain("Revenue"); // modal title (metric.name)
    expect(html).toContain("recharts-responsive-container"); // chart mount node
  });

  it("renders the unavailable-copy body when no FMP key is configured", () => {
    const html = renderToString(
      withProviders(
        <ChartModal
          metric={revenueMetric}
          isOpen={true}
          onClose={() => {}}
          ticker="AAPL"
          segmentRows={[]}
          selectedSegment={null}
          segmentLockedReason="unavailable"
        />,
      ),
    );

    // Title — should still appear (it's shared across reasons).
    expect(html).toMatch(/Per-segment breakdown locked|פילוח לפי מגזר נעול/);
    // Body — UNavailable-specific copy (matches the "no FMP data source
    // configured" branch).
    expect(html).toMatch(
      /No FMP data source is configured|לא הוגדר מקור נתונים של FMP/,
    );
    // Rate-limited copy should NOT show up in this branch — pins the
    // branch dispatch so a future refactor can't accidentally merge
    // the two messages.
    expect(html).not.toMatch(/free-tier FMP quota is exhausted/);
    expect(html).not.toMatch(/מכסת ה-FMP היומית/);
  });

  it("omits the banner in segment mode (real data, interactive chips render instead)", () => {
    // Real segment rows — the modal in segment mode uses the regular
    // chip-filter row below the chart for surface-level lock state,
    // so the dedicated lock banner stays hidden to avoid noise.
    const segmentRows = [
      {
        date: "2025-09-30",
        symbol: "AAPL",
        reportedCurrency: "USD",
        fiscalYear: "2025",
        period: "FY",
        totalRevenue: 416.16e9,
        products: [
          { name: "iPhone", revenue: 200.16e9 },
          { name: "Services", revenue: 100.0e9 },
          { name: "Mac", revenue: 60.0e9 },
        ],
      },
    ] as any;

    const html = renderToString(
      withProviders(
        <ChartModal
          metric={revenueMetric}
          isOpen={true}
          onClose={() => {}}
          ticker="AAPL"
          segmentRows={segmentRows}
          selectedSegment={null}
          segmentLockedReason="rateLimited"
        />,
      ),
    );

    // Banner title should NOT appear in segment mode.
    expect(html).not.toMatch(
      /Per-segment breakdown locked|פילוח לפי מגזר נעול/,
    );
    // Locked "Segments" chip from the banner should NOT appear.
    // (The chip-filter row uses the *real* segment names instead.)
    expect(html).not.toMatch(/lucide-lock/);
    // Premium pill shouldn't appear either — the gate is gone in this
    // mode (data is real, real chips are interactive).
    expect(html).not.toMatch(/revenue-segments-premium-badge/);
  });

  it("omits the banner when segmentLockedReason is null (default for non-locked metrics)", () => {
    const html = renderToString(
      withProviders(
        <ChartModal
          metric={revenueMetric}
          isOpen={true}
          onClose={() => {}}
          ticker="AAPL"
          segmentRows={[]}
          selectedSegment={null}
          // segmentLockedReason omitted → defaults to null
        />,
      ),
    );

    expect(html).not.toMatch(
      /Per-segment breakdown locked|פילוח לפי מגזר נעול/,
    );
    // No lock icon in the banner — chart-specific icons may still
    // render elsewhere; we just pin the banner's own absence here.
    // (Note: lucide-react's `Lock` import is module-scoped only when
    //  the banner condition fires, but other Lock consumers in the
    //  chart stack might still emit one. The pinned assertion above
    //  is the contract.)
    // Premium pill should be absent too — same gating logic.
    expect(html).not.toMatch(/revenue-segments-premium-badge/);
  });

  it("hides the Upgrade CTA when no onUpgradeClick callback is supplied (standalone preview)", () => {
    // Default prop value is undefined (Storybook / showcase path where
    // a host page isn't wired with `<PricingModal>`). The locked
    // banner + chip strip still render — only the CTA is suppressed
    // so no click throws an undefined-call error.
    const html = renderToString(
      withProviders(
        <ChartModal
          metric={revenueMetric}
          isOpen={true}
          onClose={() => {}}
          ticker="AAPL"
          segmentRows={[]}
          selectedSegment={null}
          segmentLockedReason="rateLimited"
          // onUpgradeClick omitted → CTA must hide
        />,
      ),
    );

    // Banner copy + chip strip still render — only the CTA is gone.
    expect(html).toMatch(/Per-segment breakdown locked|פילוח לפי מגזר נעול/);
    expect(html).toMatch(/lucide-lock/);
    expect(html).toContain('data-testid="revenue-segments-premium-badge"');

    // CTA itself is suppressed.
    expect(html).not.toMatch(/revenue-segments-upgrade-cta/);
  });
});
