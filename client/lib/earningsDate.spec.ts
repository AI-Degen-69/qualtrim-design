import { describe, expect, it } from "vitest";
import { nextUpcomingEarningsDate } from "./earningsDate";

describe("nextUpcomingEarningsDate", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");

  it("prefers the nearest future calendar event", () => {
    expect(
      nextUpcomingEarningsDate(
        "F",
        "2026-07-28",
        [
          { symbol: "F", date: "2026-09-01" },
          { symbol: "F", date: "2026-08-20" },
        ],
        now,
      ),
    ).toBe("2026-08-20");
  });

  it("does not display a stale past quote date", () => {
    expect(nextUpcomingEarningsDate("F", "2026-07-28", [], now)).toBeNull();
  });

  it("uses a same-day quote date when no calendar event exists", () => {
    expect(nextUpcomingEarningsDate("F", "2026-08-07", [], now)).toBe(
      "2026-08-07",
    );
  });

  it("ignores events for other tickers", () => {
    expect(
      nextUpcomingEarningsDate(
        "F",
        null,
        [{ symbol: "AAPL", date: "2026-08-20" }],
        now,
      ),
    ).toBeNull();
  });
});
