import { serializeSectorMeta } from "../../shared/sectorMeta";

export interface SymbolRecord {
  symbol?: string | null;
}

export interface BatchResolutionOptions<T extends SymbolRecord> {
  symbols: string[];
  fetchBatch: (symbols: string[]) => Promise<T[] | null>;
  fetchSingle: (symbol: string) => Promise<T | null>;
  concurrency?: number;
}

/** Normalize, deduplicate, and sort symbols for provider/cache work. */
export function canonicalSymbols(symbols: string[]): string[] {
  return Array.from(
    new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ).sort();
}

/** Build the active FMP multi-symbol quote URL without exposing it to clients. */
export function buildFmpBatchUrl(
  base: string,
  apiKey: string,
  symbols: string[],
  stable: boolean,
): string {
  const canonical = canonicalSymbols(symbols);
  if (stable) {
    const query = new URLSearchParams({
      apikey: apiKey,
      symbols: canonical.join(","),
    });
    return `${base}/batch-quote?${query.toString()}`;
  }
  const query = new URLSearchParams({ apikey: apiKey });
  return `${base}/quote/${canonical.join(",")}?${query.toString()}`;
}

/** Return records in caller order, using null for missing or malformed rows. */
export function orderByRequestedSymbols<T extends SymbolRecord>(
  requestedSymbols: string[],
  records: Array<T | null>,
): Array<T | null> {
  const bySymbol = new Map<string, T>();
  for (const record of records) {
    const symbol = record?.symbol?.trim().toUpperCase();
    if (symbol) bySymbol.set(symbol, record as T);
  }
  return requestedSymbols.map(
    (symbol) => bySymbol.get(symbol.trim().toUpperCase()) ?? null,
  );
}

/**
 * Resolve a batch response while filling only missing symbols through a bounded
 * single-symbol fallback. The provider response may be null, partial, or
 * malformed; callers always receive the requested order and null placeholders.
 */
export async function resolveOrderedBatch<T extends SymbolRecord>({
  symbols,
  fetchBatch,
  fetchSingle,
  concurrency = 8,
}: BatchResolutionOptions<T>): Promise<Array<T | null>> {
  const requested = symbols.map((symbol) => symbol.trim().toUpperCase());
  const unique = canonicalSymbols(requested);
  if (unique.length === 0) return [];

  const batchRecords = await fetchBatch(unique);
  const bySymbol = new Map<string, T>();
  for (const record of batchRecords ?? []) {
    const symbol = record?.symbol?.trim().toUpperCase();
    if (symbol) bySymbol.set(symbol, record as T);
  }

  const missing = unique.filter((symbol) => !bySymbol.has(symbol));
  const limit = Math.max(1, Math.floor(concurrency));
  for (let start = 0; start < missing.length; start += limit) {
    const group = missing.slice(start, start + limit);
    const fallbackResults = await Promise.allSettled(
      group.map((symbol) => fetchSingle(symbol)),
    );
    fallbackResults.forEach((result) => {
      const record = result.status === "fulfilled" ? result.value : null;
      const symbol = record?.symbol?.trim().toUpperCase();
      if (symbol) bySymbol.set(symbol, record as T);
    });
  }

  return requested.map((symbol) => bySymbol.get(symbol) ?? null);
}

export interface HeatmapCacheKeyInput {
  days: number;
  allowKey: string;
  /** Raw curated symbol→sector map — canonicalized internally via `serializeSectorMeta`. */
  meta: Record<string, string>;
  symbols: string[];
}

/**
 * Deterministic heatmap cache key. The raw curated sector map is
 * canonicalized internally, so two requests with different sector mappings
 * (or the same mapping in a different insertion order) never share a cached
 * aggregation.
 */
export function buildSectorHeatmapCacheKey({
  days,
  allowKey,
  meta,
  symbols,
}: HeatmapCacheKeyInput): string {
  const metaKey = serializeSectorMeta(meta);
  return `sector_heatmap_${days}_${allowKey}_${metaKey || "*"}_${canonicalSymbols(symbols).join(",")}`;
}

export interface HeatmapRowBuildOptions {
  symbols: string[];
  /** Curated symbol→sector map (already normalized); symbols missing here consult `getProfile`. */
  curated: Record<string, string>;
  getChart: (symbol: string) => Promise<{ symbol: string } | null>;
  getProfile: (symbol: string) => Promise<{ sector?: string | null } | null>;
  concurrency?: number;
}

/**
 * Resolve the per-symbol heatmap input rows for a request, with curated
 * sector tags preferred and provider profiles consulted only for symbols
 * without a curated tag. `getProfile` is never called for a symbol that has
 * a curated tag — extracted so that guarantee is testable with injected
 * callbacks instead of live provider mocks.
 */
export async function buildHeatmapRows<
  T extends { symbol: string; sector: string | null },
>({
  symbols,
  curated,
  getChart,
  getProfile,
  concurrency = 8,
}: HeatmapRowBuildOptions): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const rows: T[] = [];
  for (let start = 0; start < symbols.length; start += limit) {
    const batch = symbols.slice(start, start + limit);
    const batchRows = await Promise.all(
      batch.map(async (sym): Promise<T> => {
        const curatedTag = curated[sym]?.trim() || null;
        const [chartResult, profileResult] = await Promise.allSettled([
          getChart(sym),
          curatedTag ? Promise.resolve(null) : getProfile(sym),
        ]);
        const chart =
          chartResult.status === "fulfilled" ? chartResult.value : null;
        const profile =
          profileResult.status === "fulfilled" ? profileResult.value : null;
        const providerSector = profile?.sector?.trim() || null;
        return {
          symbol: sym,
          sector: curatedTag || providerSector,
          chart,
        } as unknown as T;
      }),
    );
    rows.push(...batchRows);
  }
  return rows;
}

export interface InFlightRegistry {
  getOrCreate<T>(key: string, operation: () => Promise<T>): Promise<T>;
  clear(): void;
}

/** Coalesce concurrent work and always remove rejected/resolved promises. */
export function createInFlightRegistry(): InFlightRegistry {
  const entries = new Map<string, Promise<unknown>>();

  return {
    getOrCreate<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = entries.get(key);
      if (existing) return existing as Promise<T>;

      const promise: Promise<T> = Promise.resolve().then(operation);
      entries.set(key, promise);
      promise
        .finally(() => {
          if (entries.get(key) === promise) entries.delete(key);
        })
        .catch(() => undefined);
      return promise;
    },
    clear() {
      entries.clear();
    },
  };
}
