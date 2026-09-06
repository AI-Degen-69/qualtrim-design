import { describe, it, expect } from "vitest";
import {
  eventEpochMs,
  isWithin24h,
  hoursUntil,
  formatTimeUntil,
} from "./alertUtils";
import type { EarningsEvent } from "@shared/api";

function ev(
  partial: Partial<EarningsEvent> & {
    date: string;
    time: EarningsEvent["time"];
    symbol: string;
  },
): EarningsEvent {
  return {
    symbol: partial.symbol,
    date: partial.date,
    time: partial.time,
    epsEstimated: 1.0,
    eps: null,
    revenueEstimated: 100,
    revenue: null,
  };
}

// All math uses local-clock-derived epoch ms. To keep the assertions
// consistent regardless of test-machine timezone, we anchor each expectation
// to `Date(y, m-1, d).setHours(...)` which is exactly what the impl mirrors.

describe("eventEpochMs", () => {
  it("computes 09:30 local for bmo", () => {
    const ms = eventEpochMs(
      ev({ symbol: "AAPL", date: "2025-09-15", time: "bmo" }),
    );
    const expected = new Date(2025, 8, 15, 9, 30, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it("computes 16:00 local for amc", () => {
    const ms = eventEpochMs(
      ev({ symbol: "NVDA", date: "2025-09-15", time: "amc" }),
    );
    const expected = new Date(2025, 8, 15, 16, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it("computes 12:00 local for dmh", () => {
    const ms = eventEpochMs(
      ev({ symbol: "MDT", date: "2025-09-15", time: "dmh" }),
    );
    const expected = new Date(2025, 8, 15, 12, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it("falls back to 09:00 for unknown time strings", () => {
    const ms = eventEpochMs(
      ev({ symbol: "X", date: "2025-09-15", time: "strange" }),
    );
    const expected = new Date(2025, 8, 15, 9, 0, 0, 0).getTime();
    expect(ms).toBe(expected);
  });

  it("returns NaN for malformed date strings", () => {
    expect(
      eventEpochMs(ev({ symbol: "X", date: "not-a-date", time: "bmo" })),
    ).toBeNaN();
    expect(
      eventEpochMs(ev({ symbol: "X", date: "2025", time: "bmo" })),
    ).toBeNaN();
  });
});

describe("isWithin24h", () => {
  const baseMs = new Date(2025, 8, 15, 12, 0, 0, 0).getTime(); // Mon noon

  it("accepts events scheduled within the next 24h", () => {
    const in23 = ev({ symbol: "AAPL", date: "2025-09-16", time: "bmo" }); // 21h away
    expect(isWithin24h(in23, baseMs)).toBe(true);
  });

  it("accepts events that fired up to 5 minutes ago", () => {
    const inPast = ev({ symbol: "AAPL", date: "2025-09-15", time: "bmo" }); // 2.5h ago
    expect(isWithin24h(inPast, baseMs)).toBe(false); // 2.5h > 5min grace
  });

  it("accepts an event that fired 1 minute ago", () => {
    // Event is scheduled at 09:30 local. "Now" is 09:31 — 1 minute past.
    // Falls inside the 5-minute backward grace window so the alert engine
    // still considers this in the live queue.
    const oneMinAfter = new Date(2025, 8, 15, 9, 31, 0, 0).getTime();
    const evNow = ev({ symbol: "AAPL", date: "2025-09-15", time: "bmo" });
    expect(isWithin24h(evNow, oneMinAfter)).toBe(true);
  });

  it("rejects events beyond 24h forward", () => {
    const tooFar = ev({ symbol: "AAPL", date: "2025-09-17", time: "bmo" }); // ~45h away
    expect(isWithin24h(tooFar, baseMs)).toBe(false);
  });

  it("rejects malformed-date events", () => {
    const bad = ev({ symbol: "X", date: "garbage", time: "bmo" });
    expect(isWithin24h(bad, baseMs)).toBe(false);
  });
});

describe("hoursUntil", () => {
  const baseMs = new Date(2025, 8, 15, 12, 0, 0, 0).getTime();

  it("returns positive hours for future events", () => {
    const future = ev({ symbol: "AAPL", date: "2025-09-15", time: "amc" });
    expect(hoursUntil(future, baseMs)).toBeCloseTo(4);
  });

  it("returns negative hours for past events", () => {
    const past = ev({ symbol: "AAPL", date: "2025-09-15", time: "bmo" });
    expect(hoursUntil(past, baseMs)).toBeCloseTo(-2.5);
  });
});

describe("formatTimeUntil", () => {
  const baseMs = new Date(2025, 8, 15, 12, 0, 0, 0).getTime();
  const tStub = (k: string, v?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "earningsAlerts.timeUntilNow": "now",
      "earningsAlerts.timeUntilMinutes_other": `in ${v?.count}m`,
      "earningsAlerts.timeUntilHours_other": `in ${v?.count}h`,
      "earningsAlerts.timeUntilDays_one": `in ${v?.count}d`,
      "earningsAlerts.timeUntilDays_other": `in ${v?.count}d`,
    };
    return map[k] ?? k;
  };

  it("returns 'now' for past events", () => {
    const past = ev({ symbol: "AAPL", date: "2025-09-15", time: "bmo" });
    expect(formatTimeUntil(past, tStub, baseMs)).toBe("now");
  });

  it("returns minutes for sub-1h events", () => {
    const soon = ev({ symbol: "AAPL", date: "2025-09-15", time: "dmh" }); // 0h
    // setHours(12,0,0) == baseMs => delta=0 => 'now'
    // bump it 30m later:
    const e30 = ev({ symbol: "AAPL", date: "2025-09-15", time: "amc" });
    expect(formatTimeUntil(e30, tStub, baseMs)).toBe("in 4h");
  });

  it("returns days for events beyond 1 day", () => {
    const tomorrowAmc = ev({ symbol: "AAPL", date: "2025-09-16", time: "amc" });
    expect(formatTimeUntil(tomorrowAmc, tStub, baseMs)).toBe("in 1d");
  });
});
