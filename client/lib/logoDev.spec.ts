import { describe, it, expect } from "vitest";
import { resolveLogoDevKey } from "./logoDev";

/**
 * Pins down the env-first / literal-fallback / throw-on-missing chain so a
 * future "simplification" (e.g. dropping `.trim()` and letting
 * `"".trim() || fallback` miscount empty strings as truthy) can't
 * reintroduce a silent regression.
 */
describe("resolveLogoDevKey", () => {
  it("returns the env value when set and non-empty", () => {
    expect(resolveLogoDevKey("pk_env", "pk_lit")).toBe("pk_env");
  });

  it("trims whitespace from the env value", () => {
    expect(resolveLogoDevKey("  pk_env  \n", "pk_lit")).toBe("pk_env");
  });

  it("returns the literal when env is undefined", () => {
    expect(resolveLogoDevKey(undefined, "pk_lit")).toBe("pk_lit");
  });

  it("returns the literal when env is empty string", () => {
    // Empty string must NOT count as truthy; otherwise a misconfigured
    // Vercel env that resolves to "" would silently land on the literal
    // with the wrong reason logged.
    expect(resolveLogoDevKey("", "pk_lit")).toBe("pk_lit");
  });

  it("returns the literal when env is whitespace-only", () => {
    expect(resolveLogoDevKey("   \t\n", "pk_lit")).toBe("pk_lit");
  });

  it("trims whitespace from the fallback literal", () => {
    expect(resolveLogoDevKey(undefined, "  pk_lit  ")).toBe("pk_lit");
  });

  it("throws when both env and fallback are empty", () => {
    expect(() => resolveLogoDevKey("", "")).toThrow(
      /Logo\.dev publishable key/,
    );
  });

  it("throws when both env and fallback are whitespace-only", () => {
    expect(() => resolveLogoDevKey("   ", "  ")).toThrow(
      /Logo\.dev publishable key/,
    );
  });

  it("error message mentions VITE_LOGO_DEV_KEY so an operator can grep-fix it", () => {
    expect(() => resolveLogoDevKey("", "")).toThrow(/VITE_LOGO_DEV_KEY/);
  });

  it("error message mentions the literal-fallback recovery path", () => {
    expect(() => resolveLogoDevKey("", "")).toThrow(/literal fallback/);
  });
});
