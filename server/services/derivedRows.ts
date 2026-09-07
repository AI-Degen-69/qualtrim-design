/**
 * server/services/derivedRows.ts
 *
 * Stocknest-style derived statement rows, computed inside the statement
 * normalization so both entrypoints (TS server + Vercel `_router.js` twin)
 * and both providers (FMP + Yahoo FTS) expose the same derived fields.
 *
 * Conventions (match stocknest's `_derived_*` definitions, which FMP itself
 * does not publish as single fields):
 *  - `_derived_totalIntangibles` = goodwill + intangible assets
 *  - `_derived_tbv` (tangible book value) = equity − total intangibles
 *  - `_derived_totalTangible` = total assets − total intangibles
 *  - `_derived_netReturned` = dividends paid + net buybacks (positive =
 *    cash returned to shareholders), from FMP's signed `dividendsPaid` /
 *    `salePurchaseOfStock` (both ≤ 0 for a net buyback regime).
 *
 * Every derived field is emitted ONLY when its inputs exist — a missing
 * goodwill field must not masquerade as zero (which would overstate
 * intangible value for symbols whose balance sheet omits it).
 */

import type { BalanceSheetRow, CashFlowRow } from "@shared/api";

export type BalanceDerived = Pick<
  BalanceSheetRow,
  "_derived_totalIntangibles" | "_derived_tbv" | "_derived_totalTangible"
>;

/** Treat null/undefined/non-finite as missing. */
function finite(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function deriveBalanceRows(inputs: {
  goodwill?: number | null;
  intangibleAssets?: number | null;
  totalEquity?: number | null;
  totalAssets?: number | null;
}): BalanceDerived {
  const goodwill = finite(inputs.goodwill);
  const intangibleAssets = finite(inputs.intangibleAssets);
  const equity = finite(inputs.totalEquity);
  const assets = finite(inputs.totalAssets);

  // Only derive intangibles when at least one component is actually present.
  const totalIntangibles =
    goodwill !== undefined || intangibleAssets !== undefined
      ? (goodwill ?? 0) + (intangibleAssets ?? 0)
      : undefined;

  const out: BalanceDerived = {};
  if (totalIntangibles !== undefined) {
    out._derived_totalIntangibles = totalIntangibles;
    if (equity !== undefined) out._derived_tbv = equity - totalIntangibles;
    if (assets !== undefined)
      out._derived_totalTangible = assets - totalIntangibles;
  }
  return out;
}

export type CashDerived = Pick<CashFlowRow, "_derived_netReturned">;

export function deriveNetReturned(inputs: {
  dividendsPaid?: number | null;
  /** FMP net buybacks (`salePurchaseOfStock`); Yahoo FTS `repurchaseOfCapitalStock`. */
  salePurchaseOfStock?: number | null;
  commonStockRepurchased?: number | null;
}): CashDerived {
  const dividendsPaid = finite(inputs.dividendsPaid);
  const sps = finite(inputs.salePurchaseOfStock);
  const repurchased = finite(inputs.commonStockRepurchased);

  const hasAny =
    dividendsPaid !== undefined || sps !== undefined || repurchased !== undefined;
  if (!hasAny) return {};

  let net = dividendsPaid ?? 0;
  if (sps !== undefined) net += sps;
  else if (repurchased !== undefined) net += repurchased;

  // Flip the providers' signed convention (cash outflows ≤ 0) so the
  // derived row reads "positive = returned to shareholders". Normalize -0
  // to 0 so Object.is-equality consumers and JSON both see a plain zero.
  const returned = -net;
  return { _derived_netReturned: returned === 0 ? 0 : returned };
}