import type { EarningsCallTime, EarningsEvent } from "@shared/api";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Default scheduled hour:minute for an `EarningsCallTime` slot, expressed
 * in the user's local timezone. BMO = pre-market open (NASDAQ 09:30 ET
 * assumed as UTC offset surrogate); AMC = post-close 16:00; DMH = midday
 * 12:00; any other server-side variant defaults to 09:00.
 *
 * NOTE: timezone is approximated as local — a more rigorous implementation
 * would convert from the issuer's exchange TZ. For the alert engine's
 * 24h-window purpose this approximation is sufficient: the alert fires
 * within the right day, off by no more than a few hours. Future polish:
 * pull server-reported announcement time-of-day.
 */
function defaultTimeFor(time: EarningsCallTime): { hour: number; min: number } {
  switch (time) {
    case "bmo":
      return { hour: 9, min: 30 };
    case "amc":
      return { hour: 16, min: 0 };
    case "dmh":
      return { hour: 12, min: 0 };
    default:
      return { hour: 9, min: 0 };
  }
}

/**
 * Local-time epoch ms when this event is scheduled to fire. Returns NaN for
 * malformed date strings (callers must filter `.filter(Number.isFinite)`).
 *
 * The date is parsed as a *local* calendar date — `2024-09-15` → 15
 * September in the user's locale, NOT UTC. This is deliberate so the
 * schedule lines up with the user's clock when they wake up.
 */
export function eventEpochMs(event: EarningsEvent): number {
  const parts = event.date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return Number.NaN;
  }
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const hhmm = defaultTimeFor(event.time);
  dt.setHours(hhmm.hour, hhmm.min, 0, 0);
  return dt.getTime();
}

/**
 * Whether the event is scheduled within a 24-hour forward window from `now`.
 *
 * A small 5-minute backward grace is permitted so an event whose call just
 * started remains visible (the user might be late to the page).
 */
export function isWithin24h(
  event: EarningsEvent,
  now: number = Date.now(),
): boolean {
  const ms = eventEpochMs(event);
  if (!Number.isFinite(ms)) return false;
  return ms >= now - 5 * 60 * 1000 && ms <= now + MS_PER_DAY;
}

/** Hours until the event fires; negative if the event has already fired. */
export function hoursUntil(
  event: EarningsEvent,
  now: number = Date.now(),
): number {
  return (eventEpochMs(event) - now) / MS_PER_HOUR;
}

/**
 * Render an i18n-friendly countdown label. Bundles the plural-key selection
 * so callers don't need an `n === 1 ? ... : ...` ternary at every
 * call site.
 *
 * Examples (English):
 *   in 12 min / in 3h / in 1d / now (when event has passed)
 */
export function formatTimeUntil(
  event: EarningsEvent,
  t: (key: string, vars?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string {
  const ms = eventEpochMs(event);
  if (!Number.isFinite(ms)) return "";
  const deltaMs = ms - now;
  if (deltaMs <= 0) return t("earningsAlerts.timeUntilNow");
  const totalMin = Math.floor(deltaMs / (60 * 1000));
  if (totalMin < 60) {
    const count = Math.max(1, totalMin);
    return t(
      count === 1
        ? "earningsAlerts.timeUntilMinutes_one"
        : "earningsAlerts.timeUntilMinutes_other",
      { count },
    );
  }
  const totalHour = Math.floor(deltaMs / MS_PER_HOUR);
  if (totalHour < 24) {
    return t(
      totalHour === 1
        ? "earningsAlerts.timeUntilHours_one"
        : "earningsAlerts.timeUntilHours_other",
      { count: totalHour },
    );
  }
  const days = Math.floor(deltaMs / MS_PER_DAY);
  return t(
    days === 1
      ? "earningsAlerts.timeUntilDays_one"
      : "earningsAlerts.timeUntilDays_other",
    { count: days },
  );
}
