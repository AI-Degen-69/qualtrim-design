import { parseTradeDate } from "./finance";

export interface EarningsDateCandidate {
  symbol: string;
  date: string;
}

export function nextUpcomingEarningsDate(
  ticker: string,
  quoteDate: string | number | null | undefined,
  calendar: ReadonlyArray<EarningsDateCandidate>,
  now = Date.now(),
): string | number | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const symbol = ticker.trim().toUpperCase();
  const upcoming = calendar
    .filter((event) => event.symbol.trim().toUpperCase() === symbol)
    .map((event) => ({ raw: event.date, ms: parseTradeDate(event.date) }))
    .filter(
      (event): event is { raw: string; ms: number } =>
        event.ms !== null && event.ms >= todayMs,
    )
    .sort((a, b) => a.ms - b.ms);

  if (upcoming[0]) return upcoming[0].raw;
  const quoteMs = parseTradeDate(quoteDate);
  return quoteMs !== null && quoteMs >= todayMs ? (quoteDate ?? null) : null;
}
