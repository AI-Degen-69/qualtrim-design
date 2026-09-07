/**
 * SEC EDGAR backfill audit CLI.
 *
 * Pulls a ticker's real companyfacts file from data.sec.gov (no key) and
 * prints the statement rows the mapper derives, so a human can eyeball them
 * against FMP / Yahoo / the company's own press releases.
 *
 * Usage:
 *   pnpm sec:audit -- AAPL            # annual + quarterly row counts + latest rows
 *   pnpm sec:audit -- AAPL quarterly  # quarterly only
 *
 * SEC asks callers to identify themselves in the User-Agent — set
 * `SEC_EDGAR_USER_AGENT` to your project + contact when running frequently.
 */

import { buildSecHistoryRows, lookupCik, fetchCompanyFacts } from "../server/services/secEdgar";
import { secTargetRows } from "../server/services/secEdgar";

const [, , symbolArg, periodArg] = process.argv;
const symbol = (symbolArg || "AAPL").toUpperCase();
const period = periodArg === "quarterly" || periodArg === "quarter" ? "quarter" : "annual";

async function main() {
  const cik = await lookupCik(symbol);
  if (!cik) {
    console.error(`No SEC CIK found for ${symbol} — likely non-US, an ETF, or unlisted.`);
    process.exit(1);
  }
  console.log(`Fetching companyfacts for ${symbol} (CIK${cik}) …`);
  const facts = await fetchCompanyFacts(cik);
  if (!facts) {
    console.error("Failed to fetch companyfacts from data.sec.gov.");
    process.exit(1);
  }
  const rows = buildSecHistoryRows(facts, symbol, period);
  const target = secTargetRows(period);
  const summarize = (label: string, arr: { date: string; calendarYear?: string; period?: string }[]) => {
    console.log(
      `  ${label.padEnd(8)} n=${String(arr.length).padStart(3)} (target ${target})  ` +
        `${arr.length > 0 ? `${arr[0].date} → ${arr[arr.length - 1].date}` : "—"}`,
    );
  };
  console.log(`\n${symbol} ${period} — SEC EDGAR XBRL derived rows (dataSource:"sec"):`);
  summarize("income", rows.income);
  summarize("balance", rows.balance);
  summarize("cash", rows.cash);
  if (period === "annual") {
    console.log("\nLatest annual income rows:");
    for (const r of rows.income.slice(-6)) {
      console.log(
        `  ${r.date}  FY${r.calendarYear}  rev=${(r.revenue / 1e6).toFixed(0)}M  ` +
          `ni=${(r.netIncome / 1e6).toFixed(0)}M  eps=${r.eps}`,
      );
    }
  } else {
    console.log("\nLatest quarterly income rows:");
    for (const r of rows.income.slice(-6)) {
      console.log(
        `  ${r.date}  FY${r.calendarYear} ${r.period}  rev=${(r.revenue / 1e6).toFixed(0)}M  ` +
          `ni=${(r.netIncome / 1e6).toFixed(0)}M`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
