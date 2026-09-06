import type {
  BalanceSheetRow,
  CashFlowRow,
  FinancialStatementSources,
  IncomeStatementRow,
} from "../../shared/api";

export interface StatementPayload {
  income: IncomeStatementRow[];
  balance: BalanceSheetRow[];
  cash: CashFlowRow[];
}

export interface MergedStatementPayload extends StatementPayload {
  sources: FinancialStatementSources;
}

/** Prefer the primary provider per statement, falling back independently. */
export function mergeFinancialStatements(
  primary: StatementPayload,
  fallback: StatementPayload,
): MergedStatementPayload {
  const income = primary.income.length > 0 ? primary.income : fallback.income;
  const balance =
    primary.balance.length > 0 ? primary.balance : fallback.balance;
  const cash = primary.cash.length > 0 ? primary.cash : fallback.cash;

  return {
    income,
    balance,
    cash,
    sources: {
      income:
        primary.income.length > 0
          ? "fmp"
          : fallback.income.length > 0
            ? "yahoo"
            : null,
      balance:
        primary.balance.length > 0
          ? "fmp"
          : fallback.balance.length > 0
            ? "yahoo"
            : null,
      cash:
        primary.cash.length > 0
          ? "fmp"
          : fallback.cash.length > 0
            ? "yahoo"
            : null,
    },
  };
}
