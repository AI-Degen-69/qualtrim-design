import { describe, expect, it } from "vitest";
import { mergeFinancialStatements } from "./financialStatementFallback";

const income = [{ date: "2025-12-31" }] as any;
const balance = [{ date: "2025-12-31" }] as any;
const cash = [{ date: "2025-12-31" }] as any;

describe("mergeFinancialStatements", () => {
  it("prefers FMP independently for each statement family", () => {
    const result = mergeFinancialStatements(
      { income, balance: [], cash },
      {
        income: [{ date: "2025-09-30" }] as any,
        balance,
        cash: [{ date: "2025-09-30" }] as any,
      },
    );

    expect(result.income).toBe(income);
    expect(result.balance).toBe(balance);
    expect(result.cash).toBe(cash);
    expect(result.sources).toEqual({
      income: "fmp",
      balance: "yahoo",
      cash: "fmp",
    });
  });

  it("returns unavailable source markers when neither provider has a family", () => {
    const result = mergeFinancialStatements(
      { income: [], balance: [], cash: [] },
      { income: [], balance: [], cash: [] },
    );

    expect(result.sources).toEqual({ income: null, balance: null, cash: null });
  });
});
