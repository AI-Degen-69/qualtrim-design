import { describe, expect, it } from "vitest";
import {
  classifyProviderResult,
  perProviderStatus,
  PROVIDER_STATUS_RANK,
  providerStatusFromProbe,
} from "./providerHealth";
import type { ProviderHealthEntry } from "./api";

describe("classifyProviderResult", () => {
  it("classifies 200 without an error body as ok", () => {
    expect(classifyProviderResult(200, null)).toBe("ok");
  });

  it("treats 200 with an upstream error body as degraded (FMP/AV rate-limit or bad key)", () => {
    expect(
      classifyProviderResult(200, "You have exceeded the daily limit"),
    ).toBe("degraded");
    expect(
      classifyProviderResult(200, "Thank you for using Alpha Vantage!"),
    ).toBe("degraded");
  });

  it("classifies 402 as known_restriction (plan gating, e.g. FMP batch-quote)", () => {
    expect(classifyProviderResult(402, null)).toBe("known_restriction");
    expect(classifyProviderResult(402, "Restricted Endpoint")).toBe(
      "known_restriction",
    );
  });

  it("classifies 403 as degraded — ambiguous between plan gating and a broken key", () => {
    expect(classifyProviderResult(403, null)).toBe("degraded");
    expect(classifyProviderResult(403, "Forbidden")).toBe("degraded");
  });

  it("classifies 429 as degraded (temporary rate limit)", () => {
    expect(classifyProviderResult(429, null)).toBe("degraded");
  });

  it("classifies every other non-200 status as down", () => {
    for (const status of [0, 404, 500, 502, 503]) {
      expect(classifyProviderResult(status, null)).toBe("down");
    }
  });
});

describe("providerStatusFromProbe (incl. the timeout branch)", () => {
  it("maps a null probe — timeout / network failure — to down with a network-error detail", () => {
    expect(providerStatusFromProbe(null)).toEqual({
      status: "down",
      detail: "network error",
    });
  });

  it("derives detail from the upstream error body when present (200 + error body)", () => {
    expect(
      providerStatusFromProbe({
        status: 200,
        errorMessage: "You have exceeded the daily limit",
      }),
    ).toEqual({
      status: "degraded",
      detail: "You have exceeded the daily limit",
    });
  });

  it("omits detail for a clean 200", () => {
    expect(
      providerStatusFromProbe({ status: 200, errorMessage: null }),
    ).toEqual({ status: "ok" });
  });

  it("formats an http_<status> detail for non-200 statuses without an error body", () => {
    expect(
      providerStatusFromProbe({ status: 402, errorMessage: null }),
    ).toEqual({
      status: "known_restriction",
      detail: "http_402",
    });
    expect(
      providerStatusFromProbe({ status: 500, errorMessage: null }),
    ).toEqual({
      status: "down",
      detail: "http_500",
    });
  });
});

describe("PROVIDER_STATUS_RANK", () => {
  it("orders severity so worst status wins in the collapse", () => {
    expect(PROVIDER_STATUS_RANK.down).toBeGreaterThan(
      PROVIDER_STATUS_RANK.degraded,
    );
    expect(PROVIDER_STATUS_RANK.degraded).toBeGreaterThan(
      PROVIDER_STATUS_RANK.not_configured,
    );
    expect(PROVIDER_STATUS_RANK.not_configured).toBeGreaterThan(
      PROVIDER_STATUS_RANK.known_restriction,
    );
    expect(PROVIDER_STATUS_RANK.known_restriction).toBeGreaterThan(
      PROVIDER_STATUS_RANK.ok,
    );
  });
});

describe("perProviderStatus (multi-feature aggregation)", () => {
  const entry = (
    provider: string,
    feature: string,
    status: string,
  ): ProviderHealthEntry =>
    ({ provider, feature, status, latencyMs: 10 }) as ProviderHealthEntry;

  it("returns an empty map when there are no entries", () => {
    expect([...perProviderStatus([]).entries()]).toEqual([]);
  });

  it("omits a fully-healthy provider — a missing key is implicitly ok", () => {
    const map = perProviderStatus([entry("yahoo", "quote", "ok")]);
    expect(map.get("yahoo")).toBeUndefined();
    expect([...map.entries()]).toEqual([]);
  });

  it("collapses FMP quote + batch-quote to the worst status (known_restriction beats ok)", () => {
    const map = perProviderStatus([
      entry("fmp", "quote", "ok"),
      entry("fmp", "batch-quote", "known_restriction"),
    ]);
    expect(map.get("fmp")).toBe("known_restriction");
  });

  it("lets a chart-only outage surface without masking the provider (down beats ok)", () => {
    const map = perProviderStatus([
      entry("yahoo", "quote", "ok"),
      entry("yahoo", "chart", "down"),
    ]);
    expect(map.get("yahoo")).toBe("down");
  });

  it("picks the worst across every status pair in the rank", () => {
    const cases: Array<[string[], string]> = [
      [["ok", "known_restriction"], "known_restriction"],
      [["ok", "not_configured"], "not_configured"],
      [["ok", "degraded"], "degraded"],
      [["ok", "down"], "down"],
      [["degraded", "down"], "down"],
      [["known_restriction", "not_configured"], "not_configured"],
      // All-ok collapses to no entry (absent = implicitly ok).
      [["ok", "ok"], undefined],
    ];
    for (const [statuses, expected] of cases) {
      const map = perProviderStatus(
        statuses.map((s, i) => entry("fmp", `feature-${i}`, s)),
      );
      expect(map.get("fmp")).toBe(expected as string | undefined);
    }
  });

  it("handles multiple providers independently", () => {
    const map = perProviderStatus([
      entry("yahoo", "quote", "ok"),
      entry("yahoo", "chart", "ok"),
      entry("fmp", "quote", "ok"),
      entry("fmp", "batch-quote", "known_restriction"),
      entry("alphavantage", "quote", "down"),
    ]);
    // Yahoo is fully healthy → absent (implicitly ok); only worse-than-ok
    // providers appear in the map.
    expect(map.get("yahoo")).toBeUndefined();
    expect(map.get("fmp")).toBe("known_restriction");
    expect(map.get("alphavantage")).toBe("down");
  });
});
