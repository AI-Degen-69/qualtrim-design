import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildSecHistoryRows,
  extendFinancialStatements,
  extendFinancialHistory,
  lookupCik,
  secTargetRows,
  __test__,
} from "./secEdgar";
import type {
  BalanceSheetRow,
  CashFlowRow,
  FinancialStatements,
  IncomeStatementRow,
} from "../../shared/api";

/* ------------------------------------------------------------------ *
 * Synthetic companyfacts fixture                                    *
 *                                                                   *
 * TESTCO: fiscal year = calendar year, FY ends 12/31. Only YTD      *
 * cumulative figures are tagged on 10-Qs (the hard case — the       *
 * mapper must derive single quarters by subtraction), plus direct   *
 * 10-K FY totals. Balance-sheet facts are point-in-time.             *
 * ------------------------------------------------------------------ */

interface Fact {
  start?: string;
  end: string;
  val: number;
  form: string;
  fy: number;
  fp: string;
  filed: string;
}

const ent = (e: Fact) => e;
// YTD cumulative + FY total entries for a flow concept. `ytd` maps an end
// date to its cumulative value; `fy` maps a fiscal year to its 10-K total.
function flowEntries(
  ytd: Record<string, number>,
  fyTotals: Record<number, number>,
): Fact[] {
  const out: Fact[] = [];
  for (const [end, val] of Object.entries(ytd)) {
    const fy = Number(end.slice(0, 4));
    const quarter = Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1;
    out.push(
      ent({
        start: `${fy}-01-01`,
        end,
        val,
        form: "10-Q",
        fy,
        fp: `Q${quarter}`,
        filed: `${fy + (quarter === 4 ? 0 : 1)}-02-15`,
      }),
    );
  }
  for (const [fy, val] of Object.entries(fyTotals)) {
    out.push(
      ent({
        start: `${fy}-01-01`,
        end: `${fy}-12-31`,
        val,
        form: "10-K",
        fy: Number(fy),
        fp: "FY",
        filed: `${Number(fy) + 1}-02-15`,
      }),
    );
  }
  return out;
}

// Point-in-time facts (balance sheet): each end reported in a 10-Q (Q1–Q3)
// and the 10-K (FY end). `points` maps end → value.
function pointEntries(points: Record<string, number>): Fact[] {
  return Object.entries(points).map(([end, val]) => {
    const fy = Number(end.slice(0, 4));
    const isFyEnd = end.endsWith("12-31");
    return ent({
      end,
      val,
      form: isFyEnd ? "10-K" : "10-Q",
      fy,
      fp: isFyEnd ? "FY" : "Q1",
      filed: `${fy + 1}-02-15`,
    });
  });
}

const usd = (facts: Fact[]) => ({ units: { USD: facts } });

const FACTS = {
  cik: 999,
  entityName: "TestCo",
  facts: {
    "us-gaap": {
      // FY2021 total 300; Q1 70, Q2 80, Q3 80, Q4 70. The FY2020 10-K
      // anchor exists so 2021 quarters have a fiscal-year start to derive
      // against (year-one quarters can't be diffed without a prior anchor).
      Revenues: usd(
        flowEntries(
          {
            "2021-03-31": 70,
            "2021-06-30": 150,
            "2021-09-30": 230,
          },
          { 2020: 250, 2021: 300 },
        ),
      ),
      // FY2022 total 360; Q1 80, Q2 90, Q3 90, Q4 100
      SalesRevenueNet: usd(
        flowEntries(
          {
            "2022-03-31": 80,
            "2022-06-30": 170,
            "2022-09-30": 260,
          },
          { 2022: 360 },
        ),
      ),
      // FY2023 total 420
      RevenueFromContractWithCustomerExcludingAssessedTax: usd(
        flowEntries(
          {
            "2023-03-31": 100,
            "2023-06-30": 210,
            "2023-09-30": 320,
          },
          { 2023: 420 },
        ),
      ),
      NetIncomeLoss: usd(
        flowEntries(
          {
            "2021-03-31": 10,
            "2021-06-30": 22,
            "2021-09-30": 35,
            "2022-03-31": 12,
            "2022-06-30": 26,
            "2022-09-30": 40,
            "2023-03-31": 15,
            "2023-06-30": 32,
            "2023-09-30": 50,
          },
          { 2021: 40, 2022: 50, 2023: 60 },
        ),
      ),
      GrossProfit: usd(
        flowEntries({}, { 2021: 130, 2022: 150, 2023: 180 }),
      ),
      OperatingIncomeLoss: usd(
        flowEntries({}, { 2021: 90, 2022: 100, 2023: 120 }),
      ),
      DepreciationDepletionAndAmortization: usd(
        flowEntries({}, { 2021: 30, 2022: 30, 2023: 30 }),
      ),
      Assets: usd(
        pointEntries({
          "2021-03-31": 700,
          "2021-06-30": 720,
          "2021-09-30": 740,
          "2021-12-31": 800,
          "2022-03-31": 820,
          "2022-06-30": 850,
          "2022-09-30": 870,
          "2022-12-31": 900,
          "2023-03-31": 910,
          "2023-06-30": 930,
          "2023-09-30": 950,
          "2023-12-31": 1000,
        }),
      ),
      CashAndCashEquivalentsAtCarryingValue: usd(
        pointEntries({
          "2022-12-31": 120,
          "2023-12-31": 150,
        }),
      ),
      StockholdersEquity: usd(
        pointEntries({
          "2022-12-31": 400,
          "2023-12-31": 450,
        }),
      ),
      NetCashProvidedByUsedInOperatingActivities: usd(
        flowEntries(
          {
            "2023-03-31": 50,
            "2023-06-30": 110,
            "2023-09-30": 170,
          },
          { 2023: 250 },
        ),
      ),
      PaymentsToAcquirePropertyPlantAndEquipment: usd(
        flowEntries({}, { 2023: -40 }),
      ),
    },
  },
} as any;

describe("secEdgar concept → row mapping", () => {
  it("maps annual 10-K rows with fiscal labels and SEC provenance", () => {
    const { income, balance, cash } = buildSecHistoryRows(FACTS, "TEST", "annual");
    expect(income.map((r) => [r.calendarYear, r.revenue])).toEqual([
      ["2021", 300],
      ["2022", 360],
      ["2023", 420],
    ]);
    const fy2022 = income[1];
    expect(fy2022).toMatchObject({
      date: "2022-12-31",
      symbol: "TEST",
      reportedCurrency: "USD",
      period: "FY",
      grossProfit: 150,
      netIncome: 50,
      operatingIncome: 100,
      ebitda: 130, // operating income 100 + D&A 30
      dataSource: "sec",
    });
    // Balance annual rows appear only at fiscal-year ends.
    expect(balance.map((r) => r.date)).toEqual([
      "2021-12-31",
      "2022-12-31",
      "2023-12-31",
    ]);
    const fy2023Bal = balance[2];
    expect(fy2023Bal).toMatchObject({
      totalAssets: 1000,
      totalEquity: 450,
      cashAndCashEquivalents: 150,
      dataSource: "sec",
    });
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({
      date: "2023-12-31",
      operatingCashFlow: 250,
      capitalExpenditure: -40,
      freeCashFlow: 210,
    });
  });

  it("derives single quarters from YTD cumulative figures by subtraction", () => {
    const { income } = buildSecHistoryRows(FACTS, "TEST", "quarter");
    const fy2022 = income.filter((r) => r.calendarYear === "2022");
    expect(fy2022).toHaveLength(4);
    expect(fy2022.map((r) => [r.period, r.revenue, r.netIncome])).toEqual([
      ["Q1", 80, 12],
      ["Q2", 90, 14],
      ["Q3", 90, 14],
      ["Q4", 100, 10],
    ]);
    // Rows ascend by period end with fiscal-year labels (Q1 2022 is the
    // quarter ending 2022-03-31, not the calendar 2022 Q3).
    expect(fy2022.map((r) => r.date)).toEqual([
      "2022-03-31",
      "2022-06-30",
      "2022-09-30",
      "2022-12-31",
    ]);
    expect(fy2022.every((r) => r.dataSource === "sec")).toBe(true);
    // Concept migration between years doesn't leak: 2021 vs 2023 both clean.
    const fy2021 = income.filter((r) => r.calendarYear === "2021");
    expect(fy2021.map((r) => [r.period, r.revenue])).toEqual([
      ["Q1", 70],
      ["Q2", 80],
      ["Q3", 80],
      ["Q4", 70],
    ]);
  });

  it("keeps quarterly balance rows for 10-Q ends and the FY end (as Q4)", () => {
    const { balance } = buildSecHistoryRows(FACTS, "TEST", "quarter");
    const fy2022 = balance.filter((r) => r.calendarYear === "2022");
    expect(fy2022.map((r) => [r.period, r.date, r.totalAssets])).toEqual([
      ["Q1", "2022-03-31", 820],
      ["Q2", "2022-06-30", 850],
      ["Q3", "2022-09-30", 870],
      ["Q4", "2022-12-31", 900],
    ]);
  });

  it("derives quarterly cash flow with a capital-expenditure outflow sign", () => {
    const { cash } = buildSecHistoryRows(FACTS, "TEST", "quarter");
    const fy2023 = cash.filter((r) => r.calendarYear === "2023");
    expect(fy2023).toHaveLength(4);
    expect(fy2023.map((r) => r.operatingCashFlow)).toEqual([50, 60, 60, 80]);
    // Capex was only tagged as a full-year 10-K outflow: Q1–Q3 fall back to
    // no per-quarter figure, Q4 = FY total minus prior cumulative (nothing
    // tagged) so it stays undefined rather than inventing a number.
    expect(fy2023[3].capitalExpenditure).toBeUndefined();
    expect(fy2023[0].freeCashFlow).toBeUndefined();
  });
});

describe("secEdgar merge + orchestration", () => {
  it("fills older periods only, keeping recent FMP/Yahoo rows first", () => {
    const sec = buildSecHistoryRows(FACTS, "TEST", "annual");
    const baseIncome: IncomeStatementRow[] = [
      {
        date: "2024-12-31",
        symbol: "TEST",
        reportedCurrency: "USD",
        calendarYear: "2024",
        period: "FY",
        revenue: 500,
        grossProfit: 200,
        ebitda: 180,
        netIncome: 80,
        eps: 5,
      },
      {
        date: "2025-12-31",
        symbol: "TEST",
        reportedCurrency: "USD",
        calendarYear: "2025",
        period: "FY",
        revenue: 550,
        grossProfit: 220,
        ebitda: 200,
        netIncome: 90,
        eps: 6,
      },
    ];
    const base: FinancialStatements = {
      income: baseIncome,
      balance: [],
      cash: [],
    };
    const merged = extendFinancialStatements(base, sec, "annual");
    expect(merged.income.map((r) => r.date)).toEqual([
      "2021-12-31",
      "2022-12-31",
      "2023-12-31",
      "2024-12-31",
      "2025-12-31",
    ]);
    // Recent rows untouched (still no dataSource), older rows tagged SEC.
    expect(merged.income[4].dataSource).toBeUndefined();
    expect(merged.income[4].revenue).toBe(550);
    expect(merged.income[0].dataSource).toBe("sec");
    // sources passthrough preserved.
    expect(merged.sources).toBeUndefined();
  });

  it("never replaces or duplicates a primary-row period date", () => {
    const sec = buildSecHistoryRows(FACTS, "TEST", "quarter");
    // Primary already covers FY2022 — SEC must not add the same dates.
    const primary: FinancialStatements = {
      income: [
        {
          date: "2022-03-31",
          symbol: "TEST",
          reportedCurrency: "USD",
          calendarYear: "2022",
          period: "Q1",
          revenue: 80,
          grossProfit: 30,
          ebitda: 20,
          netIncome: 12,
          eps: 1,
        },
        {
          date: "2022-06-30",
          symbol: "TEST",
          reportedCurrency: "USD",
          calendarYear: "2022",
          period: "Q2",
          revenue: 90,
          grossProfit: 40,
          ebitda: 25,
          netIncome: 14,
          eps: 1.2,
        },
        {
          date: "2022-09-30",
          symbol: "TEST",
          reportedCurrency: "USD",
          calendarYear: "2022",
          period: "Q3",
          revenue: 90,
          grossProfit: 40,
          ebitda: 25,
          netIncome: 14,
          eps: 1.2,
        },
        {
          date: "2022-12-31",
          symbol: "TEST",
          reportedCurrency: "USD",
          calendarYear: "2022",
          period: "Q4",
          revenue: 100,
          grossProfit: 45,
          ebitda: 28,
          netIncome: 10,
          eps: 1,
        },
      ],
      balance: [],
      cash: [],
    };
    const merged = extendFinancialStatements(primary, sec, "quarter");
    expect(merged.income.length).toBe(8); // 4 primary + 4 older FY2021
    expect(new Set(merged.income.map((r) => r.date)).size).toBe(8);
    // Ascending merge puts the SEC rows first (they are strictly older).
    expect(merged.income.slice(0, 4).every((r) => r.dataSource === "sec")).toBe(
      true,
    );
    expect(merged.income.slice(4).every((r) => r.dataSource === undefined)).toBe(
      true,
    );
    expect(secTargetRows("quarter")).toBe(40);
    expect(secTargetRows("annual")).toBe(10);
  });

  describe("orchestration (fetch stubbed)", () => {
    beforeEach(() => {
      __test__.resetMemos();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const makeCache = () => {
      const store = new Map<string, unknown>();
      return {
        cache: {
          async get<T>(key: string): Promise<T | null> {
            return (store.get(key) as T) ?? null;
          },
          async set<T>(key: string, value: T): Promise<void> {
            store.set(key, value);
          },
        },
        store,
      };
    };

    const base = (rows: IncomeStatementRow[]): FinancialStatements => ({
      income: rows,
      balance: rows as unknown as BalanceSheetRow[],
      cash: rows as unknown as CashFlowRow[],
    });

    it("resolves CIK, fetches companyfacts once, and caches the extension", async () => {
      const { cache, store } = makeCache();
      const fetchMock = vi
        .fn()
        .mockImplementation(async (url: string) => {
          const body = url.includes("company_tickers")
            ? { "0": { cik_str: 999, ticker: "TEST", title: "TestCo" } }
            : FACTS;
          return new Response(JSON.stringify(body), { status: 200 });
        });
      vi.stubGlobal("fetch", fetchMock);

      const result = await extendFinancialHistory(
        "TEST",
        "annual",
        base([
          {
            date: "2024-12-31",
            symbol: "TEST",
            reportedCurrency: "USD",
            calendarYear: "2024",
            period: "FY",
            revenue: 500,
            grossProfit: 200,
            ebitda: 180,
            netIncome: 80,
            eps: 5,
          },
        ]),
        cache,
      );
      expect(result.income.map((r) => r.date)).toEqual([
        "2021-12-31",
        "2022-12-31",
        "2023-12-31",
        "2024-12-31",
      ]);
      // Cached extension written; second call serves from cache (no new
      // fetch of the ticker map / facts).
      expect(store.size).toBe(1);
      const key = store.keys().next().value as string;
      expect(key).toContain("TEST");
      const before = fetchMock.mock.calls.length;
      const again = await extendFinancialHistory("TEST", "annual", base([]), cache);
      expect(again.income.length).toBe(0); // base empty → no backfill, unchanged
      expect(fetchMock.mock.calls.length).toBe(before);
    });

    it("negative-caches non-US / unindexed tickers without hitting facts", async () => {
      const { cache, store } = makeCache();
      const fetchMock = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({ "0": { cik_str: 1, ticker: "MSFT" } }),
          { status: 200 },
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      const oneRow = base([
        {
          date: "2025-12-31",
          symbol: "ILCO",
          reportedCurrency: "USD",
          calendarYear: "2025",
          period: "FY",
          revenue: 1,
          grossProfit: 1,
          ebitda: 1,
          netIncome: 1,
          eps: 1,
        },
      ]);
      const result = await extendFinancialHistory("ILCO", "annual", oneRow, cache);
      expect(result.income.length).toBe(1); // untouched
      const cached = [...store.values()][0] as { income: unknown[] };
      expect(cached.income).toEqual([]); // empty extension cached for a day
    });

    it("lookupCik pads CIKs to 10 digits and uppercases symbols", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ "0": { cik_str: 320193, ticker: "aapl" } }),
            { status: 200 },
          ),
        ),
      );
      expect(await lookupCik("aapl")).toBe("0000320193");
      expect(await lookupCik("AAPL")).toBe("0000320193"); // memoized hit
    });
  });
});
