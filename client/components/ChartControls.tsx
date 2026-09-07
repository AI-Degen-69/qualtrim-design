import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CHART_FREQUENCIES,
  CHART_RANGES,
  frequencyLabelKey,
  type ChartFrequency,
  type ChartRange,
} from "@/lib/financialSeries";

/**
 * Stocknest-style chart control clusters — the shared tab language used by
 * both the metrics-grid header and the expanded chart modal:
 *
 *   [ 2Y  5Y  10Y  All ]        [ ☐ YoY % ]        [ Quarterly | Annual | TTM ]
 *
 * Tab groups sit in one bordered pill; the active tab is a filled control
 * using the site's primary accent, matching the app's existing active-tab
 * pattern while borrowing Stocknest's spacing, sizing, and grouping.
 */

interface RangeTabsProps {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  className?: string;
}

export function RangeTabs({ value, onChange, className }: RangeTabsProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5",
        className,
      )}
      role="tablist"
      aria-label={t("chart.timeframe")}
    >
      {CHART_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(range)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-bold font-mono tabular-nums transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}

interface FrequencyTabsProps {
  value: ChartFrequency;
  onChange: (frequency: ChartFrequency) => void;
  className?: string;
}

export function FrequencyTabs({
  value,
  onChange,
  className,
}: FrequencyTabsProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5",
        className,
      )}
      role="tablist"
      aria-label={t("chart.granularity")}
    >
      {CHART_FREQUENCIES.map((frequency) => {
        const active = frequency === value;
        return (
          <button
            key={frequency}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(frequency)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-bold transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {t(frequencyLabelKey(frequency))}
          </button>
        );
      })}
    </div>
  );
}

interface YoYToggleProps {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  className?: string;
}

/** Checkbox-style toggle that flips the modal's bars to per-period YoY %. */
export function YoYToggle({ checked, onToggle, className }: YoYToggleProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onToggle(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
        checked
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background/60",
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      <span dir="ltr">{t("chart.yoyToggle")}</span>
    </button>
  );
}
