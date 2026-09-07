/**
 * client/lib/metricCatalog.ts
 *
 * Typed catalog of the chartable financial metrics — the vocabulary behind
 * the ticker-page metrics grid (Index.tsx) and the expanded chart modal
 * (ChartModal.tsx). One declarative row per plottable line describing:
 *
 *   - where its series comes from (statement family + row field, mirroring
 *     `finance.metricStatementKey` — a spec pins the two together so the
 *     mirror can never drift),
 *   - the display unit its values are normalized to (B = billions of USD,
 *     $ = per-share dollars),
 *   - the default chart kind,
 *   - its thematic group (revenue / profitability / per-share / balance /
 *     cash flow),
 *   - whether TTM is meaningful (`flow` rolls the trailing four quarters;
 *     `stock` is a point-in-time balance where TTM bars fall back to the
 *     latest period),
 *   - whether a right-axis close-price overlay makes sense for it
 *     (dollar-denominated flow / per-share series you can compare to the
 *     share price — not balance stocks like total assets).
 *
 * Pure data only — no React, no fetching. Consumers read rows through the
 * lookups below; the statement bindings are also surfaced so series
 * projections (annual / quarterly / TTM) share one source of truth.
 */

export type MetricUnit = "B" | "$";
export type ChartKind = "bar" | "line";
export type MetricGroupId =
  | "revenue"
  | "profitability"
  | "perShare"
  | "balanceSheet"
  | "cashflow";
export type MetricFlowModel = "flow" | "stock";

export interface ChartMetricDefinition {
  /** insights.* i18n key — also the series identity everywhere on the page. */
  id: string;
  /** Statement family the series projects from. */
  statement: "income" | "balance" | "cash";
  /** Row field name on that statement family. */
  field: string;
  /** Raw-dollar divisor used to reach the display unit (1e9 → B). */
  divisor: number;
  unit: MetricUnit;
  chart: ChartKind;
  group: MetricGroupId;
  /** flow = TTM-capable (rolling 4-quarter sum); stock = point-in-time. */
  flowModel: MetricFlowModel;
  /** True when the metric is a per-share / flow series the price is comparable to. */
  priceOverlay: boolean;
}

/** Grid order = catalog order (the modal's prev/next cycles this sequence). */
export const METRIC_CATALOG: readonly ChartMetricDefinition[] = [
  {
    id: "insights.revenue",
    statement: "income",
    field: "revenue",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "revenue",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.ebitda",
    statement: "income",
    field: "ebitda",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "profitability",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.grossProfit",
    statement: "income",
    field: "grossProfit",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "profitability",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.operatingIncome",
    statement: "income",
    field: "operatingIncome",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "profitability",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.netIncome",
    statement: "income",
    field: "netIncome",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "profitability",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.eps",
    statement: "income",
    field: "eps",
    divisor: 1,
    unit: "$",
    chart: "line",
    group: "perShare",
    flowModel: "flow",
    priceOverlay: true,
  },
  {
    id: "insights.cashAndEquivalents",
    statement: "balance",
    field: "cashAndCashEquivalents",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "balanceSheet",
    flowModel: "stock",
    priceOverlay: false,
  },
  {
    id: "insights.totalAssets",
    statement: "balance",
    field: "totalAssets",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "balanceSheet",
    flowModel: "stock",
    priceOverlay: false,
  },
  {
    id: "insights.fcf",
    statement: "cash",
    field: "freeCashFlow",
    divisor: 1e9,
    unit: "B",
    chart: "bar",
    group: "cashflow",
    flowModel: "flow",
    priceOverlay: true,
  },
];

const BY_ID: ReadonlyMap<string, ChartMetricDefinition> = new Map(
  METRIC_CATALOG.map((entry) => [entry.id, entry]),
);

/** The definition for a metric id (e.g. "insights.revenue"), or undefined. */
export function chartMetricById(
  id: string,
): ChartMetricDefinition | undefined {
  return BY_ID.get(id);
}

/** Whether the metric rolls a trailing-four-quarter TTM series. */
export function chartMetricSupportsTtm(id: string): boolean {
  return BY_ID.get(id)?.flowModel === "flow";
}

/** Whether the metric accepts a right-axis close-price overlay. */
export function chartMetricAllowsPriceOverlay(id: string): boolean {
  return BY_ID.get(id)?.priceOverlay ?? false;
}
