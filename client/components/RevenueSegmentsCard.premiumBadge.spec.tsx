// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RevenueSegmentsCard from "./RevenueSegmentsCard";
import { I18nProvider } from "@/lib/i18n";
import type { FinancialMetric } from "@/lib/mockData";

/**
 * Parked regression net for the Premium pill beside the locked
 * "Segments 🔒" chip on the Revenue card.
 *
 * Background: the card already had a `Lock` icon + tooltip on the
 * locked chip, but a user had to hover to discover WHY it was locked
 * (rate-limited free-quota vs. missing data config). The Premium
 * pill ({{text: "Premium" / "פרימיום"}}) sits beside the chip with
 * Starlight Gold styling so the gate is obvious at a glance.
 *
 * This spec pins that contract so:
 *   - the badge always renders in the rate-limited branch
 *   - the badge always renders in the unavailable branch
 *   - the badge is absent when real segment data is loaded
 *     (segment mode — interactive chips are the right surface)
 *   - the badge is absent when the segmentation query hasn't
 *     returned yet (loading state — no chip strip is rendered)
 */

// Stub `useStockRevenueSegmentation` so we can mount the card with
// controlled segment state without hitting the network. We re-export
// the real module's other exports (so e.g. `useI18n` keeps working)
// and replace only the one we need to control.
vi.mock("@/hooks/useStockData", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useStockData")>(
    "@/hooks/useStockData",
  );

  return {
    ...actual,
    useStockRevenueSegmentation: vi.fn(),
  };
});

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
} as unknown as FinancialMetric;

function withProviders(node: React.ReactNode): React.ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>
  );
}

// Set the mocked `useStockRevenueSegmentation` return BEFORE rendering.
// Lookup is via `vi.mocked(...)` which types the cast through the
// exact mock instance Vitest registered — avoids the "the export was
// undefined" race the async-loader approach hit.
import { useStockRevenueSegmentation } from "@/hooks/useStockData";
function mountCardWithSegmentation(
  segReturn: unknown,
  onUpgradeClick?: () => void,
): string {
  vi.mocked(useStockRevenueSegmentation).mockReturnValue(
    segReturn as ReturnType<typeof useStockRevenueSegmentation>,
  );
  return renderToString(
    withProviders(
      <RevenueSegmentsCard
        metric={revenueMetric}
        ticker="AAPL"
        onUpgradeClick={onUpgradeClick}
      />,
    ),
  );
}

describe("RevenueSegmentsCard — Premium pill on the locked chip strip", () => {
  it("renders the Premium pill when FMP is rate-limited", () => {
    const html = mountCardWithSegmentation(
      {
        data: { rows: [], rateLimited: true, unavailable: false },
        isLoading: false,
      },
      // Pass a callback so the Upgrade CTA appears next to the badge.
      () => undefined,
    );

    // The badge is what's discoverable without hover — pin it.
    expect(html).toContain('data-testid="revenue-segments-premium-badge"');
    // Badge copy resolves in either language.
    expect(html).toMatch(/Premium|פרימיום/);
    // Starlight Gold accent (matches the project's `--primary` token).
    expect(html).toMatch(/border-primary\/40 bg-primary\/15 text-primary/);
    // Locked chip is still present (the badge is a pair, not a swap).
    expect(html).toMatch(/lucide-lock/);

    // ── Upgrade CTA — placeholder /pricing modal opener ─────────────
    // Pinned beside the locked chip on the card itself, so a user who
    // never expands the modal still has somewhere to land.
    expect(html).toContain('data-testid="revenue-segments-upgrade-cta"');
    expect(html).toMatch(/Upgrade|שדרג/);
  });

  it("hides the Upgrade CTA on the card when no callback is supplied", () => {
    const html = mountCardWithSegmentation({
      data: { rows: [], rateLimited: true, unavailable: false },
      isLoading: false,
    });

    // Pill remains (it's not gated by the CTA's presence).
    expect(html).toContain('data-testid="revenue-segments-premium-badge"');
    // CTA is hidden when the page didn't wire `<PricingModal>`.
    expect(html).not.toMatch(/revenue-segments-upgrade-cta/);
  });

  it("renders the Premium pill when no FMP key is configured", () => {
    const html = mountCardWithSegmentation({
      data: { rows: [], rateLimited: false, unavailable: true },
      isLoading: false,
    });

    expect(html).toContain('data-testid="revenue-segments-premium-badge"');
    expect(html).toMatch(/Premium|פרימיום/);
    // Locked tooltip is the unavailable-reason copy (not rate-limited).
    expect(html).toMatch(
      /no FMP data source is configured|לא הוגדר מקור נתונים של FMP/i,
    );
  });

  it("does NOT render the Premium pill in segment mode (real data — chips suffice)", () => {
    const html = mountCardWithSegmentation({
      data: {
        rows: [
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
            ],
          },
        ],
        rateLimited: false,
        unavailable: false,
      },
      isLoading: false,
    });

    // No premium badge — segment mode is the "data is fine" path.
    expect(html).not.toMatch(/revenue-segments-premium-badge/);
    // Title flips to "Revenue by Segment" (HE: "הכנסות לפי מגזר") to
    // surface that the per-segment mode is active.
    expect(html).toMatch(/Revenue by Segment|הכנסות לפי מגזר/);
    // Real segment chips render (iPhone + Services).
    expect(html).toContain("iPhone");
    expect(html).toContain("Services");
    // No lock icon — interactive chips are the right surface.
    expect(html).not.toMatch(/lucide-lock/);
  });

  it("does NOT render the Premium pill while the segmentation query is loading", () => {
    const html = mountCardWithSegmentation({
      data: undefined,
      isLoading: true,
    });

    // Loading state renders the regular title; no chip strip until the
    // query resolves with rows or with a locked-branch reason.
    expect(html).not.toMatch(/revenue-segments-premium-badge/);
    expect(html).not.toMatch(/lucide-lock/);
  });
});
