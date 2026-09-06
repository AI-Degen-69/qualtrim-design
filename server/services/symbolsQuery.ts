/**
 * Shared symbols-query validation — the single source of truth for
 * parsing `?symbols=…` / repeated `?symbol=` parameters across runtimes.
 *
 * Consumed by BOTH:
 *   • `server/routes/stock-data.ts` (local dev / Express), and
 *   • `api/_router.js` (Vercel serverless) via the `.js`-extension
 *     import trick also used for `apiUsageTracker.js` /
 *     `yahooQuoteShape.js` / `insightsUniverses.js`.
 *
 * Self-contained by design: zero imports at all, so Vercel's serverless
 * bundler ships this module whole. Before this module existed the
 * serverless copy of the SMA route silently diverged from Express — it
 * forwarded invalid tickers upstream instead of 400-ing, emitted a
 * different over-limit message, kept duplicates, and produced a NaN
 * window for non-numeric `?window=` values.
 * `api/_router.sma-validation.spec.ts` pins the contract on the JS side;
 * `server/routes/stock-data.spec.ts` pins it on the TS side.
 */

export const MAX_SYMBOLS = 50;
export const TICKER_PATTERN = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;

export type ParsedSymbols =
  | { ok: true; symbols: string[] }
  | { ok: false; status: number; body: { error: string; symbols?: string[] } };

function parseSymbolList(value: unknown): {
  symbols: string[];
  invalid: string[];
} {
  const raw =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value) && value.every((item) => typeof item === "string")
        ? value.flatMap((item) => item.split(","))
        : [];
  const symbols: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const candidate = item.trim().toUpperCase();
    if (!candidate) continue;
    if (!TICKER_PATTERN.test(candidate)) {
      invalid.push(candidate);
    } else if (!seen.has(candidate)) {
      seen.add(candidate);
      symbols.push(candidate);
    }
  }
  return { symbols, invalid };
}

/**
 * Validate a symbols query parameter end-to-end: split/clean/dedupe via
 * `parseSymbolList`, then enforce the shared route policy (no invalid
 * tickers, non-empty, at most MAX_SYMBOLS). Returns either the cleaned
 * list or the exact 400 response body every symbols-consuming handler
 * must emit, so the policy lives here instead of at each call site.
 */
export function parseSymbolsQuery(value: unknown): ParsedSymbols {
  const { symbols, invalid } = parseSymbolList(value);
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid symbol parameter", symbols: invalid },
    };
  }
  if (symbols.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "symbols parameter required" },
    };
  }
  if (symbols.length > MAX_SYMBOLS) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Too many symbols requested. Maximum is ${MAX_SYMBOLS}, received ${symbols.length}`,
      },
    };
  }
  return { ok: true, symbols };
}
