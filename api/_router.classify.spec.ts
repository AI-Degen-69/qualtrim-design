import { describe, expect, it } from "vitest";
import { classifyProviderResult } from "../shared/providerHealth";
import { classify } from "./_router";

/**
 * Parity tripwire — `api/_router.js` is plain JS that Vercel's bundler
 * refuses to link against TS imports, so it carries its own copy of the
 * provider-status classifier (`classify`) instead of importing
 * `classifyProviderResult` from `shared/providerHealth.ts`. If the two ever
 * disagree, the Vercel deployment would label provider health
 * differently from the Express server. This spec fails CI on any drift;
 * when the classification rules change, update BOTH copies (and the matrix
 * below) together.
 */
describe("api/_router.js classify ↔ shared classifyProviderResult parity", () => {
  const statuses = [200, 402, 403, 429, 404, 500, 502, 503, 0];
  const errorBodies = [
    null, // clean body
    "", // empty body (falsy — must behave like null)
    "You have exceeded the daily limit", // FMP/AV error body shape
  ];

  it("agrees with classifyProviderResult across the full status × error-body matrix", () => {
    for (const status of statuses) {
      for (const errorMessage of errorBodies) {
        expect(
          classify(status, errorMessage),
          `status=${status} body=${JSON.stringify(errorMessage)}`,
        ).toBe(classifyProviderResult(status, errorMessage));
      }
    }
  });

  it("only ever emits one of the five ProviderStatus values", () => {
    const valid = new Set([
      "ok",
      "known_restriction",
      "degraded",
      "down",
      "not_configured",
    ]);
    for (const status of statuses) {
      for (const errorMessage of errorBodies) {
        expect(
          valid.has(classify(status, errorMessage)),
          `status=${status}`,
        ).toBe(true);
      }
    }
  });
});
