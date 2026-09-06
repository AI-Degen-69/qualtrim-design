import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Per-row deferred renderer for the Insights grid. Below the fold we render a
 * static skeleton matched to the project's loading-row style (`h-[150px]`,
 * `bg-card rounded-lg p-4 border border-slate-700`). Once the row enters
 * the viewport — including a 200px preheat margin so tightly-grouped
 * scroll-spurts don't reveal a flash of skeleton — we swap in the real
 * children. The IntersectionObserver for each row disconnects after the
 * first intersection, so the post-mount runtime is bounded regardless of
 * total row count.
 *
 * Why per-row IO instead of a shared observer?
 *   - One observer per row keeps the lifetime scope tight: each row's
 *     effect owns its own `disconnect()` and never re-subscribes after
 *     first-paint. The cost is N observer objects, which is fine for
 *     the N=70 universe. Centralizing to a single observer would save a
 *     few cycles but couple subscribers and complicate scrolling-with-
 *     newly-mounted-rows (e.g. tab switches that append new symbols).
 *
 * Why an IO wrapper instead of react-window / react-virtual?
 *   - IO gives us "defer until in view, then render once and forget"
 *     without a virtualization library, accessibility debt, or row-height
 *     bookkeeping. The cards remain in the document at full DOM weight
 *     (just skeleton content), so search-input filtering and screen-
 *     reader semantics keep working as-is. Trade-off: we still keep
 *     ~70 residue DOM nodes after first scroll past the bottom; that's
 *     small in practice (a few ms of layout) and not worth a dep for.
 *
 * SSR / pre-2020 browser fallback:
 *   If `IntersectionObserver` isn't available, we mount the children
 *   immediately. The alternative — permanent skeletons on ancient browsers
 *   — is a worse UX.
 */

interface DeferredInsightsCardProps {
  /**
   * Symbol this row represents. Surfaced via `data-symbol` so Playwright /
   * devtools queries can find a row even while it's still rendering the
   * skeleton.
   */
  symbol: string;
  children: ReactNode;
  /** Tailwind height class passed to the skeleton. Defaults to 160 px so
   *  a single 2-line name + sector + price block fits without grow. The
   *  intrinsic-size reservation on the wrapper matches this number so
   *  offscreen paint-skip reserves the exact footprint. */
  skeletonHeight?: string;
}

/**
 * Pre-render margin so a row that's just below the fold but within
 * 200px triggers immediate IO observation. Tighter than "100%" so
 * we don't preheat the entire 70-row universe into a render queue.
 */
const ROOT_MARGIN = "200px";

/**
 * Footprint reserved in the scroll geometry when the row is offscreen
 * AND visible-flipped back to offscreen (tab switch, etc). Matches
 * the skeleton's default `h-[160px]` AND the real card's `min-h-[160px]`
 * — when the IO swap renders the real card, its footprint fits the
 * reservation exactly so the page doesn't reflow mid-scroll.
 */
const RESERVED_PX = 160;

export function DeferredInsightsCard({
  symbol,
  children,
  skeletonHeight = "h-[160px]",
}: DeferredInsightsCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      {
        rootMargin: ROOT_MARGIN,
        // `threshold: 0` is the default — entering the bounding rect at
        // any pixel qualifies. Combined with `rootMargin: 200px`, the
        // row mounts as soon as it's within ~1 row of the visible edge.
        threshold: 0,
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-symbol={symbol}
      data-visibility={visible ? "visible" : "deferred"}
      // `content-visibility: auto` makes Chrome skip paint/layout for
      // offscreen rows. `contain-intrinsic-size` provides a hint so the
      // scrollbar reserves the right space when content is skipped —
      // without it, the reserved height collapses to 0 and the user's
      // scroll position jumps when a row swaps in.
      className="content-visibility-auto contain-intrinsic-size-[160px]"
    >
      {visible ? (
        children
      ) : (
        // Skeleton reserves the same 160 px footprint so the page
        // doesn't reflow when IO swaps in the real card. `motion-safe:`
        // gates the pulse animation strictly to users who haven't set
        // `prefers-reduced-motion: reduce` — reduce-motion users see a
        // static card-shaped block which still reads as "loading"
        // because the real content is missing.
        //
        // We DON'T set `role="presentation"` so screen readers can pick
        // up the `aria-label="loading"` while the row is below the fold;
        // the conditional render hides the skeleton entirely on swap,
        // so the announcement lifecycle is clean.
        <div
          className={`bg-card rounded-lg p-4 border border-slate-700 ${skeletonHeight} motion-safe:animate-pulse`}
          aria-label="loading"
        />
      )}
    </div>
  );
}
