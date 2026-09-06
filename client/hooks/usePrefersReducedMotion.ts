import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Pure: resolves whether the OS/browser prefers reduced motion, safely
 * handling environments without `matchMedia` (SSR, node tests) — those
 * report `false` (full motion), matching the client's first paint.
 * Exported for direct unit testing in the node-only vitest setup.
 */
export function prefersReducedMotionFrom(
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
): boolean {
  return (
    typeof matchMedia === "function" && matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * Tracks the OS `prefers-reduced-motion` setting reactively — it flips live
 * if the user toggles the preference while the app is open. `useAnimatedNumber`
 * consumes it to skip count-up animations; any other motion code can reuse it.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    prefersReducedMotionFrom(
      // `?.` guards browsers where `matchMedia` is missing — the resolver
      // already treats a non-function as "no reduced-motion preference".
      typeof window === "undefined"
        ? undefined
        : window.matchMedia?.bind(window),
    ),
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
