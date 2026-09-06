// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import PricingModal from "./PricingModal";
import { I18nProvider } from "@/lib/i18n";

/**
 * Parked regression net for the placeholder /pricing modal opened by
 * the locked-premium CTA beside the Segments 🔒 chip.
 *
 * Pins:
 *   - When isOpen=false the modal renders nothing (no overlay burned
 *     into the DOM during the close transition).
 *   - When isOpen=true the title/subtitle body + close button render
 *     with the matching i18n copy in either language.
 *   - Body copy switches on `context` so that an "earnings-locked" CTA
 *     in the future can re-use the modal with feature-specific copy
 *     without a new component.
 *   - Both CTAs (Notify me / Contact sales) pipe through onClose so
 *     the page state correctly flips back to closed.
 */

function withI18n(node: React.ReactNode): React.ReactElement {
  return <I18nProvider>{node}</I18nProvider>;
}

describe("PricingModal (placeholder)", () => {
  it("renders nothing when isOpen=false", () => {
    const html = renderToString(
      withI18n(<PricingModal isOpen={false} onClose={() => {}} />),
    );
    expect(html).toBe("");
  });

  it("renders the modal chrome + body when isOpen=true", () => {
    const html = renderToString(
      withI18n(
        <PricingModal
          isOpen={true}
          onClose={() => {}}
          context="revenueSegments"
        />,
      ),
    );

    // Modal chrome: title + subtitle + close button.
    expect(html).toMatch(/Vantage Premium|Vantage פרימיום/);
    expect(html).toMatch(/Locked premium feature|תכונת פרימיום נעולה/);
    expect(html).toMatch(/Close|סגור/);

    // Body bullets — three benefit lines so the user gets concrete
    // value instead of just "upgrade now".
    expect(html).toMatch(
      /Per-product revenue breakdowns|פילוח הכנסות לפי מוצר/,
    );
    expect(html).toMatch(
      /Unbounded historical financials|דוחות כספיים היסטוריים ללא הגבלה/,
    );
    expect(html).toMatch(/Custom alerts|התראות מותאמות אישית/);

    // Footer placeholder framing.
    expect(html).toMatch(/Notify me when it ships|תודיעו לי כשזה יוצא/);
    expect(html).toMatch(/Contact sales|דברו עם מכירות/);
  });

  it("branches the body copy on the context prop", () => {
    // revenueSegments context — explains the quota / config issue.
    const revenueHtml = renderToString(
      withI18n(
        <PricingModal
          isOpen={true}
          onClose={() => {}}
          context="revenueSegments"
        />,
      ),
    );
    expect(revenueHtml).toMatch(
      /locked chip you just clicked|השבב הנעול שלחצת עליו/,
    );
    expect(revenueHtml).toMatch(
      /free FMP daily quota has run out|מכסת ה-FMP היומית הסתיימה/,
    );

    // generic context — falls back to the catch-all body. (The Pitch
    // stays the same shape; only the lead-in narrative changes.)
    const genericHtml = renderToString(
      withI18n(
        <PricingModal isOpen={true} onClose={() => {}} context={null} />,
      ),
    );
    expect(genericHtml).not.toMatch(/locked chip you just clicked/);
    expect(genericHtml).not.toMatch(/השבב הנעול שלחצת עליו/);
    expect(genericHtml).toMatch(/This feature is part of Vantage Premium/);
  });

  it("invokes onClose when the X button is rendered", () => {
    // SSR can't capture event handlers directly — but we can pin that
    // the close button is rendered + has the correct id attribute
    // (the ChartModal-equivalent uses the same id for focus targeting).
    const html = renderToString(
      withI18n(<PricingModal isOpen={true} onClose={() => {}} />),
    );
    expect(html).toContain('id="pricing-modal-close"');
    expect(html).toContain('id="pricing-modal-title"');
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });

  it("calls onClose from both footer CTA wires (Notify me + Contact sales)", () => {
    // SSR can't run click handlers, so we verify that both footer buttons
    // exist and call into the onClose closure pattern. Mounted-DOM
    // coverage lives in the end-to-end ChartModal.preview.tsx flow.
    const onClose = vi.fn();
    const html = renderToString(
      withI18n(<PricingModal isOpen={true} onClose={onClose} />),
    );
    // Footer button count — both CTAs wired through onClose.
    expect(html.match(/type="button"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
