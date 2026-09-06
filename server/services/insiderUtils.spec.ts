import { describe, expect, it } from "vitest";
import {
  classifyTransaction,
  parseTransactionPrice,
  resolveTransactionValue,
} from "./insiderUtils";

describe("parseTransactionPrice", () => {
  it("parses an exact Yahoo transaction price", () => {
    expect(parseTransactionPrice("Sale at price 311.02 per share.")).toEqual({
      low: 311.02,
      high: 311.02,
      exact: 311.02,
    });
  });

  it("parses a price range without inventing an execution price", () => {
    expect(
      parseTransactionPrice("Sale at price 284.57 - 285.04 per share."),
    ).toEqual({
      low: 284.57,
      high: 285.04,
      exact: null,
    });
  });

  it("does not treat a zero-price gift as a market price", () => {
    expect(
      parseTransactionPrice("Stock Gift at price 0.00 per share."),
    ).toBeNull();
  });
});

describe("classifyTransaction", () => {
  it("marks open-market sales as non-administrative", () => {
    expect(classifyTransaction("Sale at price 311.02 per share.")).toEqual({
      category: "sale",
      isAdministrative: false,
    });
  });

  it("marks gifts as administrative", () => {
    expect(classifyTransaction("Stock Gift at price 0.00 per share.")).toEqual({
      category: "gift",
      isAdministrative: true,
    });
  });

  it("uses a transaction code when text is missing", () => {
    expect(classifyTransaction("", "F")).toEqual({
      category: "withholding",
      isAdministrative: true,
    });
  });
});

describe("resolveTransactionValue", () => {
  it("prefers a provider-reported value", () => {
    expect(
      resolveTransactionValue(
        15551000,
        50000,
        parseTransactionPrice("Sale at price 311.02 per share."),
      ),
    ).toEqual({
      value: 15551000,
      source: "reported",
    });
  });

  it("derives value only from an exact reported price", () => {
    expect(
      resolveTransactionValue(
        null,
        100,
        parseTransactionPrice("Sale at price 25.50 per share."),
      ),
    ).toEqual({
      value: 2550,
      source: "derived",
    });
    expect(
      resolveTransactionValue(
        null,
        100,
        parseTransactionPrice("Sale at price 25.00 - 26.00 per share."),
      ),
    ).toEqual({
      value: null,
      source: null,
    });
  });
});
