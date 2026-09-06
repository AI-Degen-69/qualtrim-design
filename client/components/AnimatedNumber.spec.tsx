// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import AnimatedNumber from "./AnimatedNumber";

/**
 * The project's vitest is node-only, so effects never run in specs — which
 * is exactly what makes server rendering the right probe for this component:
 * `renderToString` pins the first-paint contract (placeholder until the
 * first animated frame), while the count-up math itself is covered by
 * `client/hooks/useAnimatedNumber.spec.ts`.
 */
describe("AnimatedNumber", () => {
  it("renders the placeholder while no finite value has been animated yet", () => {
    expect(renderToString(<AnimatedNumber value={null} />)).toContain("—");
    expect(renderToString(<AnimatedNumber value={undefined} />)).toContain("—");
  });

  it("renders a custom placeholder when provided", () => {
    const html = renderToString(
      <AnimatedNumber value={null} placeholder="· · ·" />,
    );
    expect(html).toContain("· · ·");
    expect(html).not.toContain("—");
  });

  it("renders the placeholder on first paint even with a finite value (SSR)", () => {
    // Effects never run during server render, so even a finite target shows
    // the placeholder — the same contract the client uses until its first
    // requestAnimationFrame tick lands.
    const html = renderToString(
      <AnimatedNumber value={12.34} format={(v) => `$${v.toFixed(2)}`} />,
    );
    expect(html).toContain("—");
    expect(html).not.toContain("$12.34");
  });

  it("does not invoke the children render-prop before the first frame", () => {
    // Same first-paint contract as `format`: layout derived from the
    // animated value must not run until a value actually exists.
    const html = renderToString(
      <AnimatedNumber value={12.34}>
        {() => <strong>never</strong>}
      </AnimatedNumber>,
    );
    expect(html).toContain("—");
    expect(html).not.toContain("never");
  });
});
