import { describe, expect, it } from "vitest";
import {
  normalizeSectorMeta,
  resolveSectorTag,
  serializeSectorMeta,
} from "./sectorMeta";

describe("sectorMeta helpers", () => {
  describe("normalizeSectorMeta", () => {
    it("uppercases symbols and trims sector names", () => {
      expect(
        normalizeSectorMeta({
          aapl: "  Technology ",
          MSFT: "Consumer Defensive",
        }),
      ).toEqual({
        AAPL: "Technology",
        MSFT: "Consumer Defensive",
      });
    });

    it("drops blank symbols and blank sectors", () => {
      expect(
        normalizeSectorMeta({ "": "Technology", AAPL: "", MSFT: "  " }),
      ).toEqual({});
    });
  });

  describe("serializeSectorMeta", () => {
    it("produces a canonical sorted SYM:SECTOR wire string", () => {
      expect(
        serializeSectorMeta({ MSFT: "Technology", AAPL: "Technology" }),
      ).toBe("AAPL:Technology,MSFT:Technology");
    });

    it("is order-insensitive for the same contents", () => {
      const a = serializeSectorMeta({ MSFT: "Technology", AAPL: "Technology" });
      const b = serializeSectorMeta({ AAPL: "Technology", MSFT: "Technology" });
      expect(a).toBe(b);
    });

    it("returns empty string for an empty map", () => {
      expect(serializeSectorMeta({})).toBe("");
    });
  });

  describe("resolveSectorTag precedence", () => {
    it("prefers the curated tag over the provider sector", () => {
      expect(resolveSectorTag("Technology", "Healthcare")).toBe("Technology");
    });

    it("falls back to the provider sector when no curated tag exists", () => {
      expect(resolveSectorTag(undefined, "Energy")).toBe("Energy");
      expect(resolveSectorTag("", "Energy")).toBe("Energy");
    });

    it("returns null when both sides are blank or missing", () => {
      expect(resolveSectorTag(undefined, undefined)).toBeNull();
      expect(resolveSectorTag("  ", "")).toBeNull();
      expect(resolveSectorTag(null, "  ")).toBeNull();
    });
  });
});
