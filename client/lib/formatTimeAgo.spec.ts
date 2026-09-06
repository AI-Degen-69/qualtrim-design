import { describe, it, expect } from "vitest";
import { formatTimeAgo, TIME_AGO_BUCKETS } from "./formatTimeAgo";

// Fixed `now` so the boundary assertions don't drift across runs.
const NOW_MS = 1_700_000_000_000; // ~Nov 2023
const now = (offsetSec: number) => NOW_MS - offsetSec * 1000;

/**
 * Minimal dictionary stub covering exactly the keys `formatTimeAgo` looks up.
 * Carries the suffixed forms so pluralization gets exercised.
 */
function makeT(lang: "en" | "he" = "en") {
  const en: Record<string, string> = {
    "timeAgo.justNow": "just now",
    "timeAgo.minutesAgo_one": "{{count}} minute ago",
    "timeAgo.minutesAgo_other": "{{count}} minutes ago",
    "timeAgo.hoursAgo_one": "{{count}} hour ago",
    "timeAgo.hoursAgo_other": "{{count}} hours ago",
    "timeAgo.daysAgo_one": "{{count}} day ago",
    "timeAgo.daysAgo_other": "{{count}} days ago",
    "timeAgo.weeksAgo_one": "{{count}} week ago",
    "timeAgo.weeksAgo_other": "{{count}} weeks ago",
    "timeAgo.monthsAgo_one": "{{count}} month ago",
    "timeAgo.monthsAgo_other": "{{count}} months ago",
    "timeAgo.yearsAgo_one": "{{count}} year ago",
    "timeAgo.yearsAgo_other": "{{count}} years ago",
  };
  const he: Record<string, string> = {
    "timeAgo.justNow": "עכשיו",
    "timeAgo.minutesAgo_one": "לפני דקה",
    "timeAgo.minutesAgo_two": "לפני שתי דקות",
    "timeAgo.minutesAgo_other": "{{count}} דקות",
    "timeAgo.hoursAgo_one": "לפני שעה",
    "timeAgo.hoursAgo_two": "לפני שעתיים",
    "timeAgo.hoursAgo_other": "{{count}} שעות",
    "timeAgo.daysAgo_one": "אתמול",
    "timeAgo.daysAgo_other": "{{count}} ימים",
    "timeAgo.weeksAgo_one": "לפני שבוע",
    "timeAgo.weeksAgo_other": "{{count}} שבועות",
    "timeAgo.monthsAgo_one": "לפני חודש",
    "timeAgo.monthsAgo_other": "{{count}} חודשים",
    "timeAgo.yearsAgo_one": "לפני שנה",
    "timeAgo.yearsAgo_other": "{{count}} שנים",
  };
  // Mimics the production I18nProvider._suffix / plural-rules chain in
  // miniature — resolvePluralKey picks the suffixed entry keyed by CLDR
  // category for the active language.
  const dict = lang === "he" ? he : en;
  const pluralRule = (n: number) => {
    if (n === 1) return "one";
    if (n === 2 && lang === "he") return "two";
    return "other";
  };
  return (key: string, vars?: Record<string, string | number>) => {
    if (vars?.count !== undefined) {
      const cat = pluralRule(vars.count as number);
      const suffixed = `${key}_${cat}`;
      if (dict[suffixed] !== undefined)
        return interpolate(dict[suffixed], vars);
      const other = `${key}_other`;
      if (dict[other] !== undefined) return interpolate(dict[other], vars);
    }
    return dict[key] ?? key;
  };
}

function interpolate(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

describe("formatTimeAgo", () => {
  describe("invalid input", () => {
    it("returns null for null / undefined / empty string", () => {
      const t = makeT();
      expect(formatTimeAgo(null, t, { now: NOW_MS })).toBeNull();
      expect(formatTimeAgo(undefined, t, { now: NOW_MS })).toBeNull();
      expect(formatTimeAgo("", t, { now: NOW_MS })).toBeNull();
    });
    it("returns null for NaN / Infinity numbers", () => {
      const t = makeT();
      expect(formatTimeAgo(NaN, t, { now: NOW_MS })).toBeNull();
      expect(formatTimeAgo(Infinity, t, { now: NOW_MS })).toBeNull();
    });
    it("returns null for implausible timestamps (pre-1990)", () => {
      const t = makeT();
      // 5 (treated as seconds → 1970-01-01 00:00:05 UTC) is implausible.
      expect(formatTimeAgo(5, t, { now: NOW_MS })).toBeNull();
    });
    it("returns null for unparseable ISO string", () => {
      const t = makeT();
      expect(formatTimeAgo("not a date", t, { now: NOW_MS })).toBeNull();
    });
  });

  describe("just-now boundary", () => {
    it("returns 'just now' for 0 seconds", () => {
      expect(formatTimeAgo(now(0), makeT(), { now: NOW_MS })).toBe("just now");
    });
    it("returns 'just now' for 59 seconds", () => {
      expect(formatTimeAgo(now(59), makeT(), { now: NOW_MS })).toBe("just now");
    });
    it("falls into minutes bucket at the 60-second boundary", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.justNowMax), makeT(), {
          now: NOW_MS,
        }),
      ).toBe("1 minute ago");
    });
  });

  describe("minutes bucket", () => {
    it("1 minute → singular", () => {
      expect(formatTimeAgo(now(60), makeT(), { now: NOW_MS })).toBe(
        "1 minute ago",
      );
    });
    it("30 minutes → plural", () => {
      expect(formatTimeAgo(now(60 * 30), makeT(), { now: NOW_MS })).toBe(
        "30 minutes ago",
      );
    });
    it("59 minutes → still plural", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.hourMin - 60), makeT(), {
          now: NOW_MS,
        }),
      ).toBe("59 minutes ago");
    });
  });

  describe("hours / days / weeks / months / years buckets", () => {
    it("1 hour", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.hourMin), makeT(), { now: NOW_MS }),
      ).toBe("1 hour ago");
    });
    it("5 hours", () => {
      expect(formatTimeAgo(now(5 * 60 * 60), makeT(), { now: NOW_MS })).toBe(
        "5 hours ago",
      );
    });
    it("1 day", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.dayMin), makeT(), { now: NOW_MS }),
      ).toBe("1 day ago");
    });
    it("3 days", () => {
      expect(
        formatTimeAgo(now(3 * 24 * 60 * 60), makeT(), { now: NOW_MS }),
      ).toBe("3 days ago");
    });
    it("1 week", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.weekMin), makeT(), { now: NOW_MS }),
      ).toBe("1 week ago");
    });
    it("3 weeks", () => {
      expect(
        formatTimeAgo(now(3 * 7 * 24 * 60 * 60), makeT(), { now: NOW_MS }),
      ).toBe("3 weeks ago");
    });
    it("~2 months", () => {
      expect(
        formatTimeAgo(now(60 * 24 * 60 * 60), makeT(), { now: NOW_MS }),
      ).toMatch(/month/);
    });
    it("1 year", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.yearMin), makeT(), { now: NOW_MS }),
      ).toBe("1 year ago");
    });
    it("5 years", () => {
      expect(
        formatTimeAgo(now(5 * TIME_AGO_BUCKETS.yearMin), makeT(), {
          now: NOW_MS,
        }),
      ).toBe("5 years ago");
    });
  });

  describe("Hebrew `_two` form", () => {
    it("uses the עברית _two suffix for exactly 2 minutes", () => {
      expect(formatTimeAgo(now(2 * 60), makeT("he"), { now: NOW_MS })).toBe(
        "לפני שתי דקות",
      );
    });
    it("uses `_one` for exactly 1 hour", () => {
      expect(
        formatTimeAgo(now(TIME_AGO_BUCKETS.hourMin), makeT("he"), {
          now: NOW_MS,
        }),
      ).toBe("לפני שעה");
    });
    it("falls through to `_other` for 5 hours", () => {
      expect(
        formatTimeAgo(now(5 * 60 * 60), makeT("he"), { now: NOW_MS }),
      ).toBe("5 שעות");
    });
  });

  describe("future timestamps", () => {
    it("clamps diff < 0 to 'just now' rather than '-3 minutes'", () => {
      expect(formatTimeAgo(now(-100), makeT(), { now: NOW_MS })).toBe(
        "just now",
      );
    });
  });
});
