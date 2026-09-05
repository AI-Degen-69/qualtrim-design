import type { ProviderHealthEntry, ProviderStatus } from "./api";

/**
 * Pure, dependency-free provider-health helpers shared between the server
 * (probe classification in `stockService`) and the client (severity
 * collapse in `ProviderHealthIndicator`). Kept separate from
 * `stockService` so the classification rules are unit-testable without
 * network, cache, or Yahoo instances.
 *
 * NOTE: the Vercel router (`api/_router.js`) intentionally does
 * NOT consume this module — it is plain JS and its bundler rejects TS
 * imports from `api/*.ts`, so it duplicates the classification inline.
 * Keep that copy in sync if the rules here change.
 */

/**
 * Severity ordering used to collapse multiple feature probes per provider
 * into one status — worst wins. `down` beats `degraded`, which beats
 * `not_configured`, which beats `known_restriction`, which beats `ok`.
 *
 * `known_restriction` deliberately ranks BELOW `not_configured`: a plan
 * gate is only actionable if the provider is actually configured — an
 * unconfigured provider must not surface "free-tier limitations" as if a
 * key were installed.
 */
export const PROVIDER_STATUS_RANK: Record<ProviderStatus, number> = {
  down: 4,
  degraded: 3,
  not_configured: 2,
  known_restriction: 1,
  ok: 0,
};

/**
 * Maps an HTTP probe result to a provider status.
 *
 * Mirrors the status classification from `scripts/fmp-audit.ts`. 402 is
 * Payment Required → `known_restriction` (plan gating, expected); 403 is
 * ambiguous (plan gating vs a revoked/broken key) so it stays `degraded`
 * and keeps surfacing in the UI banner; 429 is a temporary rate limit →
 * `degraded`; anything else non-200 → `down`.
 *
 * FMP and AlphaVantage ALSO return HTTP 200 with an error body (e.g.
 * `{"Error Message": "You have exceeded..."}` / AV `{"Note": ...}`) for
 * rate limits and bad keys — detect those and treat them as `degraded`
 * too.
 *
 * @param status - The HTTP status returned by the probe.
 * @param errorMessage - Upstream error-body text, or null when the body
 *   parsed cleanly / wasn't an error.
 */
export function classifyProviderResult(
  status: number,
  errorMessage: string | null,
): ProviderStatus {
  if (status === 200) return errorMessage ? "degraded" : "ok";
  // 402 Payment Required = endpoint not on the current plan (e.g. FMP
  // batch-quote on the free tier) — a KNOWN restriction, not a temporary
  // outage. 403 is ambiguous (plan gating vs a revoked key) so it stays
  // degraded — a dead key must keep surfacing, not masquerade as a plan
  // limitation. 429 is a rate limit → degraded.
  if (status === 402) return "known_restriction";
  if (status === 403 || status === 429) return "degraded";
  return "down";
}

/** The raw outcome of a bounded HTTP probe. */
export interface ProviderProbeOutcome {
  status: number;
  errorMessage: string | null;
}

/**
 * Collapses a probe outcome (or `null` = the probe never got an HTTP
 * response — timeout / network failure) into the status + detail a health
 * entry should carry.
 *
 * The `null` case is the `timeout` branch: `probeUrlStatus` aborts after
 * `PROVIDER_HEALTH_TIMEOUT_MS` and returns null, and every caller maps
 * that to `down` with `detail: "network error"`.
 */
export function providerStatusFromProbe(
  outcome: ProviderProbeOutcome | null,
): { status: ProviderStatus; detail?: string } {
  if (!outcome) return { status: "down", detail: "network error" };
  return {
    status: classifyProviderResult(outcome.status, outcome.errorMessage),
    detail:
      outcome.errorMessage ??
      (outcome.status === 200 ? undefined : `http_${outcome.status}`),
  };
}

/**
 * Collapses feature-level health entries to one status per provider (e.g.
 * FMP now reports `quote` + `batch-quote`, Yahoo `quote` + `chart`) —
 * worst status wins per `PROVIDER_STATUS_RANK`.
 *
 * The map contains one entry per provider whose collapsed status is worse
 * than `ok`; fully-healthy providers are absent and callers must treat a
 * missing provider as implicitly `ok` (the indicator's banner only ever
 * inspects `down` / `degraded` / `not_configured` values).
 */
export function perProviderStatus(
  entries: ProviderHealthEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    const prev = map.get(e.provider) ?? "ok";
    if (
      (PROVIDER_STATUS_RANK[e.status] ?? 0) >
      (PROVIDER_STATUS_RANK[prev as ProviderStatus] ?? 0)
    ) {
      map.set(e.provider, e.status);
    }
  }
  return map;
}
