export type BarDirection = "positive" | "negative" | "neutral";

/** Return a direction only for real numeric values; missing values stay neutral. */
export function barDirection(value: unknown): BarDirection {
  if (typeof value !== "number" || !Number.isFinite(value)) return "neutral";
  if (value < 0) return "negative";
  if (value > 0) return "positive";
  return "neutral";
}

export function barGradientId(metricId: string, value: unknown): string {
  const direction = barDirection(value);
  return direction === "negative"
    ? `colorValue-negative-${metricId}`
    : direction === "positive"
      ? `colorValue-positive-${metricId}`
      : `colorValue-neutral-${metricId}`;
}

export function barStroke(value: unknown): string {
  switch (barDirection(value)) {
    case "negative":
      return "hsl(6 80% 62%)";
    case "positive":
      return "hsl(155 70% 58%)";
    default:
      return "hsl(220 10% 60%)";
  }
}

/**
 * Summarise how much of a requested chart window has a real numeric value.
 * Null/locked periods are deliberately counted as unavailable rather than
 * being allowed to silently turn into empty chart space.
 */
export function splitSparklineValues<T extends { value: unknown }>(
  rows: readonly T[],
) {
  return rows.map((row) => {
    const value =
      typeof row.value === "number" && Number.isFinite(row.value)
        ? row.value
        : null;
    return {
      ...row,
      positiveValue: value === null ? null : Math.max(value, 0),
      negativeValue: value === null ? null : Math.min(value, 0),
    };
  });
}

export function getChartAvailability(values: unknown[], expectedCount: number) {
  const availableCount = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  ).length;
  const totalCount = Math.max(Math.max(0, expectedCount), values.length);
  const lockedCount = Math.max(totalCount - availableCount, 0);

  return {
    availableCount,
    lockedCount,
    totalCount,
    hasUnavailable: lockedCount > 0,
    fractionUnavailable: totalCount > 0 ? lockedCount / totalCount : 0,
  } as const;
}

/**
 * Compute a readable numeric domain that always includes zero without
 * letting a one-sided series make the zero baseline hug the plot edge.
 *
 * A little breathing room is intentionally reserved on the opposite side of
 * zero: negative-only series get 15% positive headroom, and positive-only
 * series get 15% negative headroom. This keeps zero visible as a boundary,
 * not as the chart's top/bottom border, while preserving the data's scale.
 */
function niceStep(range: number, targetTicks = 5): number {
  if (range <= 0) return 1;
  const raw = range / Math.max(targetTicks - 1, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

export function calculateChartDomain(values: unknown[]): [number, number] {
  const finiteValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (finiteValues.length === 0) return [-1, 1];

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min === 0 && max === 0) return [-1, 1];

  // Non-negative series: start strictly at Y = 0
  if (min >= 0) {
    const rawRange = max || 1;
    const step = niceStep(rawRange, 5);
    const upper = Math.ceil((max * 1.12) / step) * step;
    return [0, Math.max(upper, step)];
  }

  // Non-positive series: cap strictly at Y = 0
  if (max <= 0) {
    const rawRange = Math.abs(min) || 1;
    const step = niceStep(rawRange, 5);
    const lower = Math.floor((min * 1.12) / step) * step;
    return [Math.min(lower, -step), 0];
  }

  // Mixed positive & negative series: span across zero
  const rawRange = max - min;
  const step = niceStep(rawRange, 5);
  const lower = Math.floor((min * 1.1) / step) * step;
  const upper = Math.ceil((max * 1.1) / step) * step;
  return [lower, upper];
}
