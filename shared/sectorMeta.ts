/**
 * Curated sector metadata helpers shared by client and server.
 *
 * The Insights universe ships editorial sector tags per ticker. The heatmap
 * request may attach them so the server never loses sector assignment when
 * provider profiles are unavailable or slow. This module owns the
 * normalization, wire serialization, and precedence rules so both sides
 * agree on the canonical form.
 *
 * Wire format (query param `sectorMeta`): `SYM:SECTOR,SYM2:SECTOR2` with
 * symbols uppercased and sectors trimmed. GICS-style sector names contain
 * spaces but never commas or colons, so comma/colon delimiters are safe.
 */

/** Uppercase symbols, trim sector names, drop blank entries. */
export function normalizeSectorMeta(
  meta: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [symbol, sector] of Object.entries(meta)) {
    const sym = symbol.trim().toUpperCase();
    const sec = sector.trim();
    if (sym && sec) out[sym] = sec;
  }
  return out;
}

/**
 * Canonical `SYM:SECTOR,SYM2:SECTOR2` wire string, sorted by symbol.
 * Two maps with the same contents produce the same string regardless of
 * insertion order — the cache key and query key both rely on this.
 */
export function serializeSectorMeta(meta: Record<string, string>): string {
  return Object.entries(normalizeSectorMeta(meta))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([symbol, sector]) => `${symbol}:${sector}`)
    .join(",");
}

/**
 * Precedence rule for a heatmap input row's sector tag:
 *   - the curated tag (from the Insights universe) wins;
 *   - the provider profile sector fills only when no curated tag exists;
 *   - blank/missing on both sides → `null` (the row lands in `untagged`).
 *
 * Exported as a pure helper so precedence is covered by deterministic tests
 * without network mocks.
 */
export function resolveSectorTag(
  curated: string | null | undefined,
  provider: string | null | undefined,
): string | null {
  const curatedTag = curated?.trim();
  if (curatedTag) return curatedTag;
  const providerTag = provider?.trim();
  return providerTag || null;
}
