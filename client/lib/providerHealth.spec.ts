import { describe, expect, it } from "vitest";
import { isProviderStatus } from "./providerHealth";
import type { ProviderHealthEntry } from "../../shared/api";

/**
 * Pins the shared provider/feature/status predicate used by the
 * useYahooDown / useYahooChartDown / useFmpBatchQuoteRestricted hooks.
 * Before this module the same some() scan was copy-pasted per hook;
 * the quote-vs-chart scoping rule lives here now.
 */

const entry = (
  provider: ProviderHealthEntry["provider"],
  feature: ProviderHealthEntry["feature"],
  status: ProviderHealthEntry["status"],
): ProviderHealthEntry => ({ provider, feature, status, latencyMs: null });

const probes: ProviderHealthEntry[] = [
  entry("yahoo", "quote", "down"),
  entry("yahoo", "chart", "ok"),
  entry("fmp", "batch-quote", "known_restriction"),
];

describe("isProviderStatus", () => {
  it("matches an exact provider × feature × status triple", () => {
    expect(isProviderStatus(probes, "yahoo", "quote", "down")).toBe(true);
    expect(isProviderStatus(probes, "yahoo", "chart", "ok")).toBe(true);
    expect(
      isProviderStatus(probes, "fmp", "batch-quote", "known_restriction"),
    ).toBe(true);
  });

  it("keeps features scoped: a chart outage is not a quote outage", () => {
    expect(isProviderStatus(probes, "yahoo", "chart", "down")).toBe(false);
    expect(isProviderStatus(probes, "fmp", "batch-quote", "down")).toBe(false);
  });

  it("requires all three fields to match", () => {
    expect(isProviderStatus(probes, "yahoo", "quote", "ok")).toBe(false);
    expect(isProviderStatus(probes, "fmp", "quote", "known_restriction")).toBe(
      false,
    );
  });

  it("returns false for missing or empty probe lists", () => {
    expect(isProviderStatus(undefined, "yahoo", "quote", "down")).toBe(false);
    expect(isProviderStatus([], "yahoo", "quote", "down")).toBe(false);
  });
});
