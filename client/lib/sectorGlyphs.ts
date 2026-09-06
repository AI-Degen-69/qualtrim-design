// Hebrew-letter sector glyphs for the third tier of `TickerLogo`'s
// fallback ladder. Renders a single Hebrew letter + sector-tinted background
// in place of a company logo when neither Logo.dev's ticker nor name tiers
// could resolve.
//
// The mapping is HE-locale ONLY. EN-locale users skip straight from the
// name tier to plain initials (per the ladder's first-second-fourth path),
// because English-speaking readers are not expected to recognize Hebrew
// letters as sector indicators — they're a cultural-locale affordance for
// RTL Hebrew speakers.
//
// Why single letters rather than short Hebrew words?
//   - Tile space is 32–64 CSS pixels; multi-character strings get clipped
//     or wrap unpredictably. One letter fits any size cleanly.
//   - Hebrew initial letters map to the brand Hebrew term for the sector
//     (ט for טכנולוגיה, פ for פיננסים, ב for בריאות, etc.), which is
//     recognizable to native readers without explanation.
//
// Sector strings come from FMP's `/stable/profile` (canonical English).
// If FMP adds new sectors, fall through to `null` and the ladder proceeds
// to the initials tier rather than throwing a render-time exception.

export type SectorGlyphEntry = {
  /** Single Hebrew letter to render. Keep these short so the tile stays calm. */
  readonly letter: string;
  /** Tailwind classes for the backdrop; matches the Vantage dark-Ui palette. */
  readonly color: string;
};

/**
 * Sector → Hebrew glyph map. Keys are matched case-insensitively against the
 * sector string returned by `useStockProfile`. If we don't recognize the
 * sector, the lookup returns `null` and the rendering falls back to initials.
 *
 * Color choices mirror each sector's common association in financial UI:
 * green for finance, red for health, blue for tech, amber for cyclical,
 * etc. — they don't need to be brand-accurate, just distinct enough that
 * "two energy stocks row" doesn't blend.
 */
export const HEBREW_SECTOR_GLYPHS: Record<string, SectorGlyphEntry> = {
  Technology: { letter: "ט", color: "bg-blue-600/30 text-blue-200" },
  "Financial Services": {
    letter: "פ",
    color: "bg-emerald-600/30 text-emerald-200",
  },
  Healthcare: { letter: "ב", color: "bg-rose-600/30 text-rose-200" },
  "Consumer Cyclical": { letter: "צ", color: "bg-amber-600/30 text-amber-200" },
  "Consumer Defensive": {
    letter: "צ",
    color: "bg-slate-600/30 text-slate-200",
  },
  "Communication Services": {
    letter: "ת",
    color: "bg-indigo-600/30 text-indigo-200",
  },
  Energy: { letter: "א", color: "bg-orange-600/30 text-orange-200" },
  Industrials: { letter: "ת", color: "bg-zinc-600/30 text-zinc-200" },
  "Real Estate": { letter: "נ", color: "bg-stone-600/30 text-stone-200" },
  Utilities: { letter: "ש", color: "bg-sky-600/30 text-sky-200" },
  "Basic Materials": { letter: "ח", color: "bg-yellow-600/30 text-yellow-200" },
};

/**
 * Look up the glyph for a given FMP sector string. Returns `null` when the
 * sector is missing or unrecognized — callers should fall through to the
 * initials tier.
 *
 * @param sector - The sector string from `useStockProfile(ticker)?.sector`.
 *   Undefined / empty / unrecognized values return `null`.
 * @returns The `{ letter, color }` pair, or `null` when no glyph maps.
 */
export function getSectorGlyph(
  sector: string | null | undefined,
): SectorGlyphEntry | null {
  if (!sector) return null;
  return HEBREW_SECTOR_GLYPHS[sector.trim()] ?? null;
}
