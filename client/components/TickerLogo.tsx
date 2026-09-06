import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  getLogoDevUrl,
  getLogoDevNameUrl,
  getCachedTier,
  setCachedTier,
  type CachedTier,
} from "@/lib/logoDev";
import { getSectorGlyph } from "@/lib/sectorGlyphs";
import { useI18n } from "@/lib/i18n";
import { useStockProfile } from "@/hooks/useStockData";

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LogoVariant = "default" | "subtle" | "bare";

interface TickerLogoProps {
  ticker: string;
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  ariaLabel?: string;
}

const sizeMap: Record<
  LogoSize,
  { box: string; text: string; rounded: string }
> = {
  xs: { box: "w-6 h-6", text: "text-[8px]", rounded: "rounded" },
  sm: { box: "w-8 h-8", text: "text-xs", rounded: "rounded" },
  md: { box: "w-12 h-12", text: "text-sm", rounded: "rounded-md" },
  lg: { box: "w-16 h-16", text: "text-base", rounded: "rounded-lg" },
  xl: { box: "w-24 h-24", text: "text-2xl", rounded: "rounded-2xl" },
};

/**
 * Internal ladder-tier. Lives only for the lifetime of one `<TickerLogo>`
 * mount; sessionStorage caches the resolved one between mounts.
 *
 * Tier transitions:
 *   1. ticker        — initial. CDN request for `/ticker/<TICKER>`.
 *   2. name_pending  — ticker 404'd AND profile is still loading; we
 *                      show initials and wait for `useStockProfile` to
 *                      resolve so we can build the `/name/<company>` URL.
 *   3. name          — CDN request for `/name/<companyName>` (from profile).
 *   4. sector        — HE-locale only; renders the Hebrew-letter glyph
 *                      tinted to the sector's color (no CDN call).
 *   5. initials      — terminal fallback; 2-letter ticker initials.
 */
type Tier = "ticker" | "name_pending" | "name" | "sector" | "initials";

/**
 * Renders a Logo.dev-powered company logo inside a slate tile. Falls back to
 * the first two characters of the ticker when none of the CDN tiers resolve.
 *
 * Ladder (per Logo.dev's docs):
 *   1. `/ticker/<TICKER>`         — initial probe; works for most US tickers.
 *   2. `/name/<companyName>`      — when tier 1 404s, uses the company name
 *                                    from `useStockProfile(ticker)` to ask
 *                                    Logo.dev for the brand-shaped variant.
 *                                    Common wins: international listings,
 *                                    recent IPOs, tickers Logo.dev missed.
 *   3. Hebrew sector glyph (HE)   — when both CDN tiers miss AND locale is
 *                                    Hebrew; renders a single letter
 *                                    (ט for Tech, פ for Finance, ב for Health,
 *                                    …) on a sector-tinted background.
 *   4. Two-letter initials        — terminal fallback.
 *
 * The resolved tier is cached in `sessionStorage` keyed by symbol so we
 * skip already-resolved probes on re-mount within the same tab. Brand
 * identity is reasonably stable; staleness is bounded by tab lifetime.
 *
 * @param ticker - The ticker symbol used to derive initials and request tier 1.
 * @param size - The logo tile size (sm / md / lg).
 * @param variant - The visual style variant.
 * @param className - Additional CSS classes for the logo tile.
 * @param ariaLabel - Accessible label for the logo tile.
 */
export default function TickerLogo({
  ticker,
  size = "md",
  variant = "default",
  className,
  ariaLabel,
}: TickerLogoProps) {
  const { lang } = useI18n();
  const profile = useStockProfile(ticker);
  const { box, text, rounded } = sizeMap[size];
  const upper = ticker.toUpperCase();
  const initials = upper.slice(0, 2);

  // ── Determine starting tier from sessionStorage ──────────────────────
  // Defer the resolution until after first render so hooks ordering stays
  // unconditional (hooks must run in the same order every render — a
  // conditional `useState` initializer reads better if we move the
  // branching to a ref + effect, but useState's initializer form keeps
  // things declarative and avoids a one-render flash of "ticker").
  const [tier, setTier] = useState<Tier>("ticker");
  const cachedNameRef = useRef<string | null>(null);

  useEffect(() => {
    const cached = getCachedTier(upper);
    if (!cached) {
      setTier("ticker");
      return;
    }
    switch (cached.tier) {
      case "ticker":
        setTier("ticker");
        break;
      case "name":
        // Stash the cached name and re-resolve as 'name' on mount.
        cachedNameRef.current = cached.companyName;
        setTier("name");
        break;
      case "sector":
        // HE-only path; EN users skip directly to initials.
        setTier(lang === "he" ? "sector" : "initials");
        break;
      case "initials":
        setTier("initials");
        break;
    }
  }, [upper, lang]);

  // ── Render-side src resolution ───────────────────────────────────────
  const tickerUrl = useMemo(() => getLogoDevUrl(upper, size), [upper, size]);

  const nameUrl = useMemo(() => {
    if (tier !== "name") return null;
    // Prefer live profile.data; fall back to the cached name from sessionStorage
    // so we still render if the cache hit happens before profile has loaded.
    const companyName =
      profile.data?.companyName ?? cachedNameRef.current ?? null;
    return companyName ? getLogoDevNameUrl(companyName, size) : null;
  }, [tier, profile.data?.companyName, size]);

  const sectorEntry = useMemo(() => {
    if (tier !== "sector") return null;
    return getSectorGlyph(profile.data?.sector);
  }, [tier, profile.data?.sector]);

  // ── Cross-tier race: ticker 404 fires before profile.data resolves ───
  // Wait one profile resolution cycle before promoting from name_pending
  // to 'name'. The 'name' tier's src will pick up companyName automatically
  // via the useMemo above.
  useEffect(() => {
    if (tier !== "name_pending") return;
    // Profile has settled (not loading).
    if (profile.isLoading) return;
    const companyName = profile.data?.companyName?.trim();
    if (companyName) {
      setTier("name");
      return;
    }
    // No company name available → advance to next tier (HE glyph or initials).
    const next: Tier = lang === "he" ? "sector" : "initials";
    setTier(next);
    setCachedTier(upper, toCachedTier(next, profile.data?.companyName));
  }, [
    tier,
    profile.isLoading,
    profile.data?.companyName,
    profile.data,
    lang,
    upper,
  ]);

  // ── onError handlers ────────────────────────────────────────────────
  // Tier-1 onError: ticker CDN returned 404 (or network failure).
  const onTickerError = () => {
    if (tier !== "ticker") return;
    const companyName = profile.data?.companyName?.trim();
    if (companyName) {
      setTier("name");
      return;
    }
    if (profile.isLoading) {
      // Brand-name not yet available; pause on name_pending until profile
      // resolves. Initials stay visible under the (eventually) loading img.
      setTier("name_pending");
      return;
    }
    // Profile settled but no company name → skip to glyph (HE) or initials.
    const next: Tier = lang === "he" ? "sector" : "initials";
    setTier(next);
    setCachedTier(upper, toCachedTier(next, profile.data?.companyName));
  };

  // Tier-2 onError: name CDN returned 404. No further CDN probe; cache the
  // fail and settle on glyph (HE) or initials.
  const onNameError = () => {
    if (tier !== "name") return;
    const next: Tier = lang === "he" ? "sector" : "initials";
    setTier(next);
    setCachedTier(upper, toCachedTier(next, profile.data?.companyName));
  };

  // ── onLoad success: cache the win so the next mount skips reprobes ───
  const onTickerLoad = () => {
    setImageLoaded(true);
    if (tier === "ticker") setCachedTier(upper, { tier: "ticker" });
  };
  const onNameLoad = () => {
    setImageLoaded(true);
    if (tier === "name") {
      const companyName =
        profile.data?.companyName ?? cachedNameRef.current ?? null;
      if (companyName) setCachedTier(upper, { tier: "name", companyName });
    }
  };

  // ── Render-side image state ──────────────────────────────────────────
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset the imageLoaded flag on tier transitions so a freshly-promoted
  // tier can fade in cleanly.
  //
  // CRITICAL: `profile.data?.companyName` is intentionally NOT in the
  // dependency array. The profile query arrives asynchronously after
  // first render; if we reset on its arrival, the existing <img> gets
  // a new `key` (forcing unmount + remount with the same src). When
  // Logo.dev's response is in browser memory cache — which it WILL be
  // after `EagerLogoWarmer` pre-warmed it — the new <img> completes
  // synchronously. The native `load` event fires BEFORE React attaches
  // the synthetic `onLoad` handler, so `onTickerLoad` never runs and the
  // image stays pinned at opacity-0 forever (the user just sees the
  // initials underneath, which they could easily misread as "no logos
  // rendering"). The tier state itself covers the cases where we'd
  // legitimately want a re-mount (ticker 404 → name, etc).
  const [seedKey, setSeedKey] = useState(0);
  useEffect(() => {
    setImageLoaded(false);
    setSeedKey((k) => k + 1);
  }, [tier, ticker, size]);

  const surface =
    variant === "bare"
      ? "bg-transparent text-slate-200"
      : variant === "subtle"
        ? "bg-slate-800 text-slate-300 group-hover:bg-blue-600 group-hover:text-white"
        : "bg-slate-800 text-slate-200 group-hover:bg-blue-600 group-hover:text-white";

  // Sector glyph uses the sector's tinted background; fall back to slate if
  // the profile sector didn't match our map (shouldn't happen given the
  // ladder's terminal 'initials' branch, but defensive).
  const sectorSurface = sectorEntry?.color ?? surface;

  // Decide what to render per tier:
  //   - ticker / name_pending / name → render the matching Logo.dev URL.
  //   - sector → render the Hebrew letter + color.
  //   - initials → render the ticker letters.
  const showTickerImg = tier === "ticker" && !!tickerUrl;
  const showNameImg = (tier === "name" || tier === "name_pending") && !!nameUrl;
  const showSectorGlyph = tier === "sector" && !!sectorEntry;
  const showInitials =
    tier === "initials" ||
    (showTickerImg === false &&
      showNameImg === false &&
      showSectorGlyph === false);

  // The initials layer stays mounted permanently and just swaps opacity, so
  // tier-1 onError doesn't flash an empty tile while we wait for the next image.
  const initialsHidden = imageLoaded || showSectorGlyph;

  return (
    <div
      className={cn(
        "relative shrink-0 inline-flex items-center justify-center font-bold uppercase transition-colors",
        box,
        text,
        rounded,
        variant === "bare"
          ? "bg-transparent"
          : showSectorGlyph
            ? sectorSurface
            : surface,
        className,
      )}
      role="img"
      aria-label={ariaLabel ?? `${upper} logo`}
    >
      {/* Initials layer — visible by default, fades under a loaded image.
          `aria-hidden` only affects screen readers; we ALSO swap the
          visual opacity so the initials can't bleed through a
          transparent-background logo. Without this, the rendered glyph
          shows faintly under logos that don't fully cover the tile. */}
      <span
        aria-hidden={initialsHidden ? "true" : undefined}
        className={cn(
          "transition-opacity duration-150",
          initialsHidden ? "opacity-0" : "opacity-100",
        )}
      >
        {initials}
      </span>

      {/* Tier 1 + 2: Logo.dev CDN image. We render whichever URL the active
          tier requires; both share the same <img> lifecycle (one src, one
          onLoad / onError handler each). */}
      {showTickerImg && tier === "ticker" && tickerUrl && (
        <img
          key={`ticker-${seedKey}`}
          src={tickerUrl}
          alt=""
          className={cn(
            "absolute inset-0 object-contain p-1",
            rounded,
            imageLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={onTickerLoad}
          onError={onTickerError}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          aria-hidden="true"
        />
      )}
      {showNameImg && nameUrl && (
        <img
          key={`name-${seedKey}`}
          src={nameUrl}
          alt=""
          className={cn(
            "absolute inset-0 object-contain p-1",
            rounded,
            imageLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={onNameLoad}
          onError={onNameError}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          aria-hidden="true"
        />
      )}

      {/* Tier 3: Hebrew sector glyph (HE locale only). Rendered INSTEAD of
          the ticker initials when the sector lookup succeeds. The sectorEntry
          is memoized so a profile data refresh re-computes the letter only
          when sector actually changes. */}
      {showSectorGlyph && sectorEntry && (
        <span
          aria-hidden="true"
          dir="rtl"
          className="absolute inset-0 flex items-center justify-center font-bold"
          // Slightly larger than the initials to read at smaller sizes; we
          // keep the same `text-` class chain so a sm tile stays sm.
        >
          {sectorEntry.letter}
        </span>
      )}
    </div>
  );
}

/**
 * Convert an internal ladder tier into the persistable cache shape.
 * Note: a name tier never gets cached here — name caching happens on
 * onLoad to avoid caching false-negatives from transient network errors.
 */
function toCachedTier(tier: Tier, companyName?: string): CachedTier {
  switch (tier) {
    case "sector":
      return { tier: "sector" };
    case "initials":
      return { tier: "initials" };
    case "ticker":
      return { tier: "ticker" };
    case "name":
      return companyName ? { tier: "name", companyName } : { tier: "initials" };
    case "name_pending":
      return { tier: "initials" };
  }
}
