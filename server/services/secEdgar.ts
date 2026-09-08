/**
 * SEC EDGAR XBRL history backfill for the free tier.
 *
 * Problem this solves: FMP's free tier caps statement responses at 5 annual /
 * 7 quarterly rows and Yahoo FTS only walks ~5 years, so the financial-charts
 * surface tops out around 3–5 years of history even though the underlying
 * SEC filings go back to ~2009 for most large US filers. stocknest.app's
 * ~10 years of quarterly rows is the same underlying data served from a paid
 * FMP plan; this module reproduces the depth for free straight from the
 * source SEC filers publish — no key, no daily quota.
 *
 * Data source: `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`
 * (one file per issuer, one JSON object of every tagged us-gaap fact the
 * company has ever filed). Ticker → CIK comes from
 * `https://www.sec.gov/files/company_tickers.json`.
 *
 * SEC requests must carry an identifying User-Agent. Override via
 * `SEC_EDGAR_USER_AGENT`; the default names the project. No new env var is
 * REQUIRED — acceptance for the backfill feature is keyless.
 *
 * Concepts: XBRL tags migrate across taxonomy releases (AAPL revenue moved
 * `SalesRevenueNet` → `RevenueFromContractWithCustomerExcludingAssessedTax`
 * at ASC 606), so every metric maps an alias list. Flow values inside a
 * filing can be single-quarter ("three months ended") or fiscal-year-to-date
 * cumulative ("six/nine months ended"); point-in-time values (balance sheet)
 * are as-of the period end. Rows are derived as follows:
 *
 *   - Annual rows   — 10-K full-period values (the FY total as reported).
 *   - Quarterly rows — prefer a filer's own single-quarter figure; when only
 *     YTD cumulative figures are tagged, subtract the previous quarter's
 *     cumulative figure within the same fiscal year (Q1 = YTD; Q4 = FY −
 *     last YTD). Same-concept subtraction only, and only inside one fiscal
 *     year, so a concept migration never mixes two tag families.
 *
 * Nothing here is write-only archaeology: a small audit script lives in
 * `scripts/sec-audit.ts` (`pnpm sec:audit -- AAPL`) to eyeball derived rows
 * against FMP/Yahoo for the same ticker.
 */

import type {
  BalanceSheetRow,
  CashFlowRow,
  FinancialStatements,
  IncomeStatementRow,
} from "../../shared/api";

/* ------------------------------------------------------------------ *
 * Cache + memo plumbing                                             *
 * ------------------------------------------------------------------ */

/** Minimal KV-shaped cache — both twins (TS `kvJsonCache`, JS router) fit. */
export interface SecCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const secFactsUrl = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

const secUserAgent = () =>
  process.env.SEC_EDGAR_USER_AGENT ||
  "Vantage research (roberttiger9@gmail.com)";

/** How much history to fill (fiscal years / fiscal quarters). */
export const SEC_TARGET_YEARS = 10;
export const secTargetRows = (period: "annual" | "quarter") =>
  period === "quarter" ? SEC_TARGET_YEARS * 4 : SEC_TARGET_YEARS;

/** Long TTLs: SEC filings are slow-moving (see docs/data-providers.md §4). */
export const SEC_EXT_TTL = 86_400; // 24h — extension rows cache
const CIK_MEMO_TTL = 7 * 86_400; // ticker→CIK map barely moves
const FACTS_MEMO_TTL = 86_400; // raw companyfacts per CIK, 24h
const FACTS_MEMO_MAX = 24; // bound per-process memory (files are multi-MB)

const _warned = new Map<string, number>();
function throttledWarn(key: string, ...args: unknown[]): void {
  const now = Date.now();
  const last = _warned.get(key);
  if (last !== undefined && now - last < 60_000) return;
  _warned.set(key, now);
  // eslint-disable-next-line no-console
  console.warn(...args);
}

/** In-process memo (per lambda). Cross-instance sharing rides the cache keys. */
const cikMemo = new Map<string, { cik: string | null; at: number }>();
const factsMemo = new Map<string, { data: SecCompanyFacts | null; at: number }>();

function memoFresh<K, V extends { at: number }>(
  map: Map<K, V>,
  key: K,
  ttlMs: number,
): boolean {
  const hit = map.get(key);
  if (!hit) return false;
  if (Date.now() - hit.at > ttlMs) {
    map.delete(key);
    return false;
  }
  return true;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": secUserAgent(), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    throttledWarn(
      `secEdgar:fetch:${url.slice(0, 80)}`,
      "[secEdgar] fetch failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Company facts JSON shape                                          *
 * ------------------------------------------------------------------ */

interface SecFactEntry {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

interface SecCompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: { "us-gaap"?: Record<string, { units?: Record<string, SecFactEntry[]> }> };
}

/** All us-gaap facts for a concept (USD unit only). */
function conceptEntries(
  facts: SecCompanyFacts,
  concept: string,
): SecFactEntry[] {
  const units = facts?.facts?.["us-gaap"]?.[concept]?.units;
  if (!units) return [];
  // us-gaap dollar amounts live under "USD"; per-share amounts under
  // "USD/shares" — the caller picks the unit it wants.
  const entries = units.USD ?? units["USD/shares"];
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e) => e && typeof e.val === "number" && Number.isFinite(e.val) && e.end,
  );
}

/* ------------------------------------------------------------------ *
 * Fiscal calendar from 10-K filings                                 *
 * ------------------------------------------------------------------ */

const FY_FORM = "10-K";
const FY_MIN_SPAN_DAYS = 300;

function spanDays(start: string, end: string): number {
  return Math.round(
    (Date.parse(end) - Date.parse(start)) / 86_400_000,
  );
}

/** Distinct 10-K period ends, ascending — the issuer's fiscal year ends. */
function fiscalYearEnds(
  facts: SecCompanyFacts,
  anchorConcepts: string[],
): string[] {
  const seen = new Set<string>();
  for (const concept of anchorConcepts) {
    for (const e of conceptEntries(facts, concept)) {
      if (e.form !== FY_FORM || !e.start) continue;
      if (spanDays(e.start, e.end!) < FY_MIN_SPAN_DAYS) continue;
      seen.add(e.end!);
    }
  }
  return [...seen].sort();
}

/** Fiscal-year label SEC itself uses for a period end (e.g. AAPL FY2025 = 2025). */
function fiscalYearLabel(
  facts: SecCompanyFacts,
  anchorConcepts: string[],
  end: string,
): number | null {
  let best: SecFactEntry | null = null;
  for (const concept of anchorConcepts) {
    for (const e of conceptEntries(facts, concept)) {
      if (e.form !== FY_FORM || !e.start) continue;
      if (e.end !== end) continue;
      if (spanDays(e.start, e.end) < FY_MIN_SPAN_DAYS) continue;
      // The ORIGINAL 10-K carries the issuer's own fiscal-year label;
      // later 10-Ks re-tag the same period as a comparative with their own
      // (different) fy. Earliest filing wins for the label.
      if (!best || (e.filed ?? "") < (best.filed ?? "")) best = e;
    }
  }
  return best?.fy ?? null;
}

interface FiscalCal {
  /** All fiscal-year end dates, ascending. */
  ends: string[];
  /** Fiscal-year label for a quarter/FY end (label of the FY it belongs to). */
  labelFor(end: string): number | null;
  /** Start of the fiscal year containing `end` (previous FY end + 1 day). */
  startOf(end: string): string | null;
  /** Index (1..4) of a fiscal quarter whose period ends at `end`. */
  quarterOf(end: string): number | null;
}

function addDays(date: string, days: number): string {
  const d = new Date(Date.parse(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildFiscalCal(facts: SecCompanyFacts, anchors: string[]): FiscalCal {
  const ends = fiscalYearEnds(facts, anchors);
  const labelCache = new Map<string, number | null>();
  // Every distinct 10-Q period end ever reported (across the anchor
  // concepts) — used to positionally number fiscal quarters. Calendar
  // months are a poor proxy for issuers on a 52/53-week fiscal calendar
  // (AAPL Q2 FY2023 ended 2023-04-01 = 6 months + ~1 week after FY start),
  // but filings always mark each fiscal quarter end, so the ordinal of the
  // end within its fiscal year is exact.
  const qEndsSet = new Set<string>();
  for (const concept of anchors) {
    for (const e of conceptEntries(facts, concept)) {
      if (e.form === "10-Q") qEndsSet.add(e.end!);
    }
  }
  const qEnds = [...qEndsSet].sort();
  return {
    ends,
    labelFor(end: string): number | null {
      const hit = labelCache.get(end);
      if (hit !== undefined) return hit;
      // The fiscal year containing `end` ends at the first anchor >= end.
      let label: number | null = null;
      let spanEnd = "";
      for (const fe of ends) {
        if (fe >= end) {
          spanEnd = fe;
          break;
        }
      }
      if (spanEnd) label = fiscalYearLabel(facts, anchors, spanEnd);
      labelCache.set(end, label);
      return label;
    },
    startOf(end: string): string | null {
      let prev = "";
      for (const fe of ends) {
        if (fe >= end) break;
        prev = fe;
      }
      if (!prev) return null;
      return addDays(prev, 1);
    },
    quarterOf(end: string): number | null {
      const start = this.startOf(end);
      if (!start) return null;
      if (ends.includes(end)) return 4; // a fiscal year end IS fiscal Q4
      let ordinal = 0;
      for (const qe of qEnds) {
        if (qe <= start) continue;
        if (qe > end) break;
        ordinal++;
      }
      return ordinal >= 1 && ordinal <= 4 ? ordinal : null;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Per-metric extraction                                             *
 * ------------------------------------------------------------------ */

/**
 * Pick the value for a period end from an alias list. For balance-sheet
 * (point-in-time) facts every report at the same end competes: keep the
 * latest filing (it incorporates any restatement).
 */
function pointValueAt(
  facts: SecCompanyFacts,
  aliases: string[],
  end: string,
  forms = new Set(["10-K", "10-K/A", "10-Q", "8-K"]),
): number | undefined {
  let best: SecFactEntry | null = null;
  for (const concept of aliases) {
    for (const e of conceptEntries(facts, concept)) {
      if (!forms.has(e.form ?? "")) continue;
      if (e.end !== end) continue;
      if (!best || (e.filed ?? "") > (best.filed ?? "")) best = e;
    }
  }
  return best?.val;
}

/**
 * Build a flow metric's per-period values for one fiscal year.
 *
 * Flow facts are durations. 10-Q filings usually tag fiscal-YTD cumulative
 * values ("six months ended …"); many issuers (AAPL among them) also tag the
 * standalone single-quarter column. Prefer the filer's own single-quarter
 * figure, and derive any quarter the filer didn't tag by subtracting YTD
 * cumulative figures inside the same fiscal year on the same concept.
 */
function flowValuesForFy(
  facts: SecCompanyFacts,
  aliases: string[],
  fyEnd: string,
  cal: FiscalCal,
): Map<string, number> {
  const out = new Map<string, number>();
  const fyStart = cal.startOf(fyEnd);
  if (!fyStart) return out;
  const fyLabel = cal.labelFor(fyEnd);
  if (fyLabel === null) return out;

  // Group entries per concept, deduped within (class, end): later filings
  // win because comparative re-tags carry the same numbers as the original.
  type Bucket = Map<string, SecFactEntry>;
  const ytd = new Map<string, Bucket>();
  const direct = new Map<string, Bucket>();
  for (const concept of aliases) {
    ytd.set(concept, new Map());
    direct.set(concept, new Map());
  }
  const putDedup = (bucket: Bucket, e: SecFactEntry) => {
    const prev = bucket.get(e.end!);
    if (!prev || (e.filed ?? "") >= (prev.filed ?? "")) bucket.set(e.end!, e);
  };
  for (const concept of aliases) {
    for (const e of conceptEntries(facts, concept)) {
      const form = e.form ?? "";
      if (form !== "10-Q" && form !== "10-K" && form !== "10-K/A") continue;
      if (!e.start) continue;
      if ((e.end ?? "") > fyEnd) continue; // don't leak into the next fiscal year
      const ytdStart = e.start >= fyStart && e.start <= addDays(fyStart, 7);
      if (form === "10-Q" && ytdStart) {
        putDedup(ytd.get(concept)!, e);
        continue;
      }
      const span = spanDays(e.start, e.end!);
      if (span >= 75 && span <= 105) {
        // Single-quarter figures: restrict to ends inside THIS fiscal year.
        // Later 10-Qs re-tag prior-year single-quarter comparatives, which
        // must not be re-derived under the wrong fiscal label.
        if (!(e.end! > fyStart)) continue;
        putDedup(direct.get(concept)!, e);
        continue;
      }
    }
  }

  // Column concept: the alias with the widest YTD coverage in this FY, so
  // subtractive derivation never crosses a concept migration.
  let column: string | null = null;
  let columnScore = 0;
  for (const concept of aliases) {
    const score = ytd.get(concept)!.size;
    if (score > columnScore) {
      column = concept;
      columnScore = score;
    }
  }
  if (!column) return out;

  const ytdCol = ytd.get(column)!;
  const directCol = direct.get(column)!;

  // 1) Prefer a directly tagged single-quarter figure.
  for (const [end, e] of directCol) {
    out.set(end, e.val);
  }

  // 2) Fill every other fiscal quarter from YTD cumulative differences.
  const fyTotal = pointValueAt(facts, [column], fyEnd, new Set([FY_FORM, "10-K/A"]));
  const ytdEnds = [...ytdCol.keys()].sort();
  if (ytdEnds.length > 0) {
    let cum = 0;
    for (const end of ytdEnds) {
      const e = ytdCol.get(end)!;
      // Only derive when the two cumulative figures come from the same
      // concept (guaranteed: both from `column`) and both exist.
      const quarter = e.val - cum;
      cum = e.val;
      if (!out.has(end)) out.set(end, quarter);
    }
    // Fiscal Q4 when the FY end is not itself a 10-Q YTD period end (the
    // common case: Q4 is covered by the 10-K, not a 10-Q).
    const lastYtdEnd = ytdEnds[ytdEnds.length - 1];
    if (fyTotal !== undefined && lastYtdEnd !== fyEnd && lastYtdEnd) {
      const lastCum = ytdCol.get(lastYtdEnd)!.val;
      if (!out.has(fyEnd)) out.set(fyEnd, fyTotal - lastCum);
    } else if (fyTotal !== undefined && !out.has(fyEnd) && ytdCol.has(fyEnd)) {
      // 10-Q YTD through FY end exists — Q4 = that YTD minus previous YTD.
      const prevCum = ytdEnds.length > 1 ? ytdCol.get(ytdEnds[ytdEnds.length - 2])!.val : 0;
      const q4 = (ytdCol.get(fyEnd)!.val ?? 0) - prevCum;
      if (!out.has(fyEnd)) out.set(fyEnd, q4);
    }
  }

  return out;
}

/** EPS / per-share metrics are rates, not flows — direct values only. */
function perShareValueAt(
  facts: SecCompanyFacts,
  aliases: string[],
  end: string,
  forms = new Set(["10-K", "10-K/A", "10-Q"]),
): number | undefined {
  let best: SecFactEntry | null = null;
  for (const concept of aliases) {
    const units = facts?.facts?.["us-gaap"]?.[concept]?.units;
    const entries = units?.["USD/shares"];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!forms.has(e.form ?? "")) continue;
      if (e.end !== end) continue;
      if (!best || (e.filed ?? "") > (best.filed ?? "")) best = e;
    }
  }
  return best?.val;
}

/* ------------------------------------------------------------------ *
 * Row builders                                                      *
 * ------------------------------------------------------------------ */

export interface SecHistoryRows {
  income: IncomeStatementRow[];
  balance: BalanceSheetRow[];
  cash: CashFlowRow[];
}

export const INCOME_ANCHORS = [
  "NetIncomeLoss",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "Revenues",
];

const INCOME_FLOWS: Record<
  "revenue" | "costOfRevenue" | "grossProfit" | "operatingIncome" | "operatingExpense" | "netIncome" | "da",
  string[]
> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
  ],
  costOfRevenue: ["CostOfGoodsAndServicesSold", "CostOfRevenue"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingExpense: ["OperatingExpenses"],
  netIncome: ["NetIncomeLoss"],
  // Depreciation & amortization — used to approximate EBITDA
  // (OperatingIncomeLoss + D&A), mirroring how the rest of the app treats
  // the FMP `ebitda` line.
  da: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
  ],
};

const EPS_DILUTED = ["EarningsPerShareDiluted"];
const EPS_BASIC = ["EarningsPerShareBasic"];

const BALANCE_POINTS: Record<string, string[]> = {
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  totalEquity: ["StockholdersEquity"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  totalDebtCombined: ["LongTermDebt"],
  debtNoncurrent: ["LongTermDebtNoncurrent"],
  debtCurrent: ["LongTermDebtCurrent"],
  commercialPaper: ["CommercialPaper"],
  shortTermBorrowings: ["ShortTermBorrowings"],
};

const CASH_FLOWS: Record<"ocf" | "capex" | "sbc" | "dividends", string[]> = {
  ocf: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
  ],
  sbc: ["ShareBasedCompensation"],
  dividends: [
    "PaymentsOfDividends",
    "PaymentsOfDividendsCommonStock",
    "PaymentsOfDividendsPreferredStock",
  ],
};

function sumDefined(values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce((a, b) => a + b, 0);
}

function toUsd(v: number | undefined): number | undefined {
  return v;
}

function incomePeriodLabel(q: number | null, isAnnual: boolean): string {
  if (isAnnual) return "FY";
  return q !== null ? `Q${q}` : "FY";
}

/**
 * Map raw companyfacts JSON into statement rows. Both granularities are
 * produced from one call because they share the fiscal-calendar pass.
 *
 * Rows are ascending by period end, carry `dataSource: "sec"` so clients
 * can badge SEC-sourced history, and only include fields that were actually
 * tagged (optional fields stay undefined).
 */
export function buildSecHistoryRows(
  facts: SecCompanyFacts,
  symbol: string,
  period: "annual" | "quarter",
): SecHistoryRows {
  const sym = symbol.trim().toUpperCase();
  const empty: SecHistoryRows = { income: [], balance: [], cash: [] };
  if (!facts?.facts?.["us-gaap"]) return empty;

  const anchors = INCOME_ANCHORS;
  const cal = buildFiscalCal(facts, anchors);
  if (cal.ends.length === 0) return empty;

  const symbolField = { symbol: sym, reportedCurrency: "USD", dataSource: "sec" as const };

  // ── Income statement ──────────────────────────────────────────────────
  const income: IncomeStatementRow[] = [];
  for (const fyEnd of cal.ends) {
    const fyLabel = cal.labelFor(fyEnd);
    if (fyLabel === null) continue;
    const flowValues = (key: keyof typeof INCOME_FLOWS) =>
      flowValuesForFy(facts, INCOME_FLOWS[key], fyEnd, cal);

    if (period === "annual") {
      const revenue = pointValueAt(
        facts,
        INCOME_FLOWS.revenue,
        fyEnd,
        new Set([FY_FORM, "10-K/A"]),
      );
      if (revenue === undefined) continue;
      const netIncome = pointValueAt(facts, INCOME_FLOWS.netIncome, fyEnd);
      if (netIncome === undefined) continue;
      const grossProfit = pointValueAt(facts, INCOME_FLOWS.grossProfit, fyEnd);
      const operatingIncome = pointValueAt(facts, INCOME_FLOWS.operatingIncome, fyEnd);
      const operatingExpense = pointValueAt(facts, INCOME_FLOWS.operatingExpense, fyEnd);
      const costOfRevenue = pointValueAt(facts, INCOME_FLOWS.costOfRevenue, fyEnd);
      const da = pointValueAt(facts, INCOME_FLOWS.da, fyEnd);
      const eps = perShareValueAt(facts, EPS_DILUTED, fyEnd) ?? perShareValueAt(facts, EPS_BASIC, fyEnd);
      const epsDiluted = perShareValueAt(facts, EPS_DILUTED, fyEnd);
      income.push({
        date: fyEnd,
        ...symbolField,
        calendarYear: String(fyLabel),
        period: "FY",
        revenue: toUsd(revenue) ?? 0,
        costOfRevenue: toUsd(costOfRevenue),
        grossProfit: toUsd(grossProfit) ?? 0,
        operatingIncome: toUsd(operatingIncome),
        operatingExpense: toUsd(operatingExpense),
        ebitda:
          operatingIncome !== undefined && da !== undefined
            ? operatingIncome + Math.abs(da)
            : 0,
        netIncome: toUsd(netIncome) ?? 0,
        eps: eps ?? 0,
        epsDiluted,
      });
      continue;
    }

    // Quarterly: quarter keys come from the revenue column (revenue is the
    // most reliably tagged flow) so income rows align with the client's
    // `Q1 2025`-style x labels across every metric.
    const revenueQ = flowValues("revenue");
    if (revenueQ.size === 0) continue;
    const allFlows = {
      revenue: revenueQ,
      netIncome: flowValues("netIncome"),
      grossProfit: flowValues("grossProfit"),
      operatingIncome: flowValues("operatingIncome"),
      operatingExpense: flowValues("operatingExpense"),
      costOfRevenue: flowValues("costOfRevenue"),
      da: flowValues("da"),
    };
    const epsByEnd = new Map<string, number>();
    for (const end of revenueQ.keys()) {
      const d = perShareValueAt(facts, EPS_DILUTED, end);
      const b = perShareValueAt(facts, EPS_BASIC, end);
      if (d !== undefined || b !== undefined) epsByEnd.set(end, d ?? b!);
    }
    for (const end of [...revenueQ.keys()].sort()) {
      const q = cal.quarterOf(end);
      if (q === null) continue;
      const revenue = revenueQ.get(end);
      if (revenue === undefined) continue;
      const netIncome = allFlows.netIncome.get(end);
      if (netIncome === undefined) continue;
      const op = allFlows.operatingIncome.get(end);
      const daV = allFlows.da.get(end);
      income.push({
        date: end,
        ...symbolField,
        calendarYear: String(fyLabel),
        period: incomePeriodLabel(q, false),
        revenue,
        costOfRevenue: allFlows.costOfRevenue.get(end),
        grossProfit: allFlows.grossProfit.get(end) ?? 0,
        operatingIncome: op,
        operatingExpense: allFlows.operatingExpense.get(end),
        ebitda: op !== undefined && daV !== undefined ? op + Math.abs(daV) : 0,
        netIncome,
        eps: epsByEnd.get(end) ?? 0,
        epsDiluted: perShareValueAt(facts, EPS_DILUTED, end),
      });
    }
  }

  // ── Balance sheet (point-in-time facts) ───────────────────────────────
  const balance: BalanceSheetRow[] = [];
  const balanceEnds = new Set<string>();
  for (const aliases of Object.values(BALANCE_POINTS)) {
    for (const concept of aliases) {
      for (const e of conceptEntries(facts, concept)) {
        if (e.form === "10-K" || e.form === "10-Q" || e.form === "10-K/A" || e.form === "8-K") {
          balanceEnds.add(e.end!);
        }
      }
    }
  }
  for (const end of [...balanceEnds].sort()) {
    const isFyEnd = cal.ends.includes(end);
    if (period === "annual" && !isFyEnd) continue;
    const fyLabel = cal.labelFor(end);
    if (fyLabel === null) continue;
    const at = (key: string) => pointValueAt(facts, BALANCE_POINTS[key], end);
    const totalAssets = at("totalAssets");
    const cash = at("cash");
    if (totalAssets === undefined && cash === undefined) continue; // nothing to show
    const totalDebt =
      at("totalDebtCombined") ??
      sumDefined([
        at("debtNoncurrent"),
        at("debtCurrent"),
        at("commercialPaper"),
        at("shortTermBorrowings"),
      ]);
    const totalEquity = at("totalEquity");
    const totalLiabilities = at("totalLiabilities");
    balance.push({
      date: end,
      ...symbolField,
      calendarYear: String(fyLabel),
      period: incomePeriodLabel(isFyEnd ? 4 : cal.quarterOf(end), period === "annual"),
      totalAssets: totalAssets ?? 0,
      totalLiabilities,
      totalEquity,
      totalDebt,
      cashAndCashEquivalents: cash ?? 0,
      netDebt: totalDebt !== undefined && cash !== undefined ? totalDebt - cash : undefined,
    });
  }

  // ── Cash flow ─────────────────────────────────────────────────────────
  const cash: CashFlowRow[] = [];
  const fyForms = new Set([FY_FORM, "10-K/A"]);
  const outflow = (v: number | undefined) =>
    v !== undefined ? -Math.abs(v) : undefined;
  for (const fyEnd of cal.ends) {
    const fyLabel = cal.labelFor(fyEnd);
    if (fyLabel === null) continue;

    if (period === "annual") {
      // Annual rows read the 10-K full-year total (NOT the derived Q4).
      const ocf = pointValueAt(facts, CASH_FLOWS.ocf, fyEnd, fyForms);
      if (ocf === undefined) continue;
      const capexAbs = outflow(
        pointValueAt(facts, CASH_FLOWS.capex, fyEnd, fyForms),
      );
      cash.push({
        date: fyEnd,
        ...symbolField,
        calendarYear: String(fyLabel),
        period: "FY",
        operatingCashFlow: ocf,
        capitalExpenditure: capexAbs,
        freeCashFlow: capexAbs !== undefined ? ocf + capexAbs : undefined,
        stockBasedCompensation: pointValueAt(
          facts,
          CASH_FLOWS.sbc,
          fyEnd,
          fyForms,
        ),
        dividendPayments: pointValueAt(facts, CASH_FLOWS.dividends, fyEnd, fyForms),
      });
      continue;
    }

    const ocfQ = flowValuesForFy(facts, CASH_FLOWS.ocf, fyEnd, cal);
    if (ocfQ.size === 0) continue;
    const capexQ = flowValuesForFy(facts, CASH_FLOWS.capex, fyEnd, cal);
    const sbcQ = flowValuesForFy(facts, CASH_FLOWS.sbc, fyEnd, cal);
    const divQ = flowValuesForFy(facts, CASH_FLOWS.dividends, fyEnd, cal);
    for (const end of [...ocfQ.keys()].sort()) {
      const q = cal.quarterOf(end);
      if (q === null) continue;
      const ocf = ocfQ.get(end);
      if (ocf === undefined) continue;
      // XBRL capital-expenditure flows are outflows (negative). Keep the
      // negative sign so FCF = OCF + capex reads naturally, matching the
      // FMP convention the rest of the app normalizes to.
      const capexAbs = outflow(capexQ.get(end));
      cash.push({
        date: end,
        ...symbolField,
        calendarYear: String(fyLabel),
        period: incomePeriodLabel(q, false),
        operatingCashFlow: ocf,
        capitalExpenditure: capexAbs,
        freeCashFlow: capexAbs !== undefined ? ocf + capexAbs : undefined,
        stockBasedCompensation: sbcQ.get(end),
        dividendPayments: divQ.get(end),
      });
    }
  }

  return { income, balance, cash };
}

/* ------------------------------------------------------------------ *
 * Fetching: ticker → CIK, companyfacts per CIK                     *
 * ------------------------------------------------------------------ */

const CIK_PAD = 10;

function padCik(cik: number | string): string {
  return String(cik).padStart(CIK_PAD, "0");
}

/**
 * Resolve a ticker to its zero-padded CIK. Backed by the SEC's full
 * ticker→CIK map, memoized per process for 7 days (SEC asks callers to
 * cache; the file is a few MB and barely moves).
 */
export async function lookupCik(symbol: string): Promise<string | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  if (memoFresh(cikMemo, sym, CIK_MEMO_TTL)) return cikMemo.get(sym)!.cik;
  let map: Record<string, { cik_str?: number; ticker?: string; title?: string }> | null =
    null;
  try {
    map = await fetchJsonWithTimeout<typeof map>(SEC_TICKER_MAP_URL, 15_000);
  } catch {
    map = null;
  }
  const entry = map
    ? Object.values(map).find((e) => (e?.ticker ?? "").toUpperCase() === sym)
    : undefined;
  const cik = entry?.cik_str ? padCik(entry.cik_str) : null;
  cikMemo.set(sym, { cik, at: Date.now() });
  return cik;
}

/** Fetch (once per process per 24h) the companyfacts file for a CIK. */
export async function fetchCompanyFacts(cik: string): Promise<SecCompanyFacts | null> {
  const memoKey = `cik:${cik}`;
  if (memoFresh(factsMemo, memoKey, FACTS_MEMO_TTL))
    return factsMemo.get(memoKey)!.data;
  const data = await fetchJsonWithTimeout<SecCompanyFacts>(secFactsUrl(cik), 20_000);
  // Keep the memo bounded (files are multi-MB) — evict oldest on overflow.
  if (factsMemo.size >= FACTS_MEMO_MAX && !factsMemo.has(memoKey)) {
    const oldestKey = factsMemo.keys().next().value as string;
    factsMemo.delete(oldestKey);
  }
  factsMemo.set(memoKey, { data, at: Date.now() });
  return data;
}

/* ------------------------------------------------------------------ *
 * Merge + orchestration                                             *
 * ------------------------------------------------------------------ */

function appendOlderSecRows<T extends { date: string; dataSource?: string }>(
  primary: T[],
  sec: T[],
  targetRows: number,
): T[] {
  if (sec.length === 0) return primary;
  const seen = new Set(primary.map((r) => r.date));
  const oldestPrimary = primary.reduce<string | null>(
    (oldest, r) => (oldest === null || r.date < oldest ? r.date : oldest),
    null,
  );
  let added = 0;
  const needed = Math.max(0, targetRows - primary.length);
  const extras: T[] = [];
  // SEC rows ascend by date; take the newest `needed` that are strictly
  // older than the primary window so live-fresh rows stay primary-sourced.
  for (let i = sec.length - 1; i >= 0 && added < needed; i--) {
    const row = sec[i];
    if (seen.has(row.date)) continue;
    if (oldestPrimary !== null && row.date >= oldestPrimary) continue;
    extras.unshift(row);
    seen.add(row.date);
    added++;
  }
  if (extras.length === 0) return primary;
  return [...primary, ...extras].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Extend a financial-statements payload with SEC history for the older
 * periods the primary providers don't cover. Primary (FMP/Yahoo) rows are
 * never replaced — SEC rows are strictly older than the primary window and
 * carry `dataSource: "sec"` for the UI badge.
 */
export function extendFinancialStatements(
  base: FinancialStatements,
  sec: SecHistoryRows,
  period: "annual" | "quarter",
): FinancialStatements {
  const target = secTargetRows(period);
  const out: FinancialStatements = {
    income: base.income ?? [],
    balance: base.balance ?? [],
    cash: base.cash ?? [],
    sources: base.sources,
  };
  const anyMissing =
    out.income.length < target ||
    out.balance.length < target ||
    out.cash.length < target;
  if (!anyMissing || sec.income.length + sec.balance.length + sec.cash.length === 0)
    return out;
  out.income = appendOlderSecRows(
    out.income as { date: string; dataSource?: string }[],
    sec.income as { date: string; dataSource?: string }[],
    target,
  ) as IncomeStatementRow[];
  out.balance = appendOlderSecRows(
    out.balance as { date: string; dataSource?: string }[],
    sec.balance as { date: string; dataSource?: string }[],
    target,
  ) as BalanceSheetRow[];
  out.cash = appendOlderSecRows(
    out.cash as { date: string; dataSource?: string }[],
    sec.cash as { date: string; dataSource?: string }[],
    target,
  ) as CashFlowRow[];
  return out;
}

const extCacheKey = (symbol: string, period: string) =>
  `secExt_${symbol.toUpperCase()}_${period}`;

/**
 * Full backfill pipeline used by both servers (stockService TS + api/_router
 * JS parity twin). Given the current (FMP/Yahoo) payload it:
 *
 *   1. Skips entirely when every statement already meets the depth target.
 *   2. Serves the previously-computed SEC extension from the shared cache
 *      (24h) when present — including the negative case (an extension of
 *      zero rows), so non-US / unindexed tickers never re-probe SEC hourly.
 *   3. Resolves CIK, fetches companyfacts (memoized in-process, 24h),
 *      maps rows, caches the extension, and merges.
 *
 * Failures degrade silently to the input payload — the backfill must never
 * turn a working response into an error.
 */
export async function extendFinancialHistory(
  symbol: string,
  period: "annual" | "quarter",
  base: FinancialStatements,
  cache: SecCache,
): Promise<FinancialStatements> {
  const target = secTargetRows(period);
  const families = [base.income, base.balance, base.cash];
  if (families.every((rows) => rows.length >= target)) return base;
  if (base.income.length + base.balance.length + base.cash.length === 0) return base;

  const key = extCacheKey(symbol, period);
  try {
    const cached = await cache.get<SecHistoryRows>(key);
    if (cached !== null) {
      return extendFinancialStatements(base, cached, period);
    }
  } catch {
    // cache failure — proceed with a live attempt
  }

  const cik = await lookupCik(symbol);
  if (!cik) {
    // Negative cache: this ticker has no SEC CIK (non-US/ETF) — don't
    // re-probe for a day.
    try {
      await cache.set<SecHistoryRows>(key, { income: [], balance: [], cash: [] }, SEC_EXT_TTL);
    } catch {
      /* best-effort */
    }
    return base;
  }

  const facts = await fetchCompanyFacts(cik);
  if (!facts) return base;
  const sec = buildSecHistoryRows(facts, symbol, period);
  const hasRows = sec.income.length + sec.balance.length + sec.cash.length > 0;
  try {
    await cache.set<SecHistoryRows>(key, sec, SEC_EXT_TTL);
  } catch {
    /* best-effort */
  }
  if (!hasRows) return base;
  return extendFinancialStatements(base, sec, period);
}

/** Test/audit seam: build an in-memory cache for specs. */
export const __test__ = {
  padCik,
  fiscalYearEnds,
  fiscalYearLabel,
  buildFiscalCal,
  conceptEntries,
  flowValuesForFy,
  /** Clear the in-process CIK / companyfacts memos between specs. */
  resetMemos(): void {
    cikMemo.clear();
    factsMemo.clear();
  },
};
