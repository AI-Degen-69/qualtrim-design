import { Radio, Sparkles, WandSparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type DataStatus = "live" | "mock" | "estimate" | "derived";

interface DataStatusBadgeProps {
  status: DataStatus;
  source?: string;
  updatedAt?: number | null;
  compact?: boolean;
  /** Render only the colored provider icon while retaining source details in the tooltip. */
  iconOnly?: boolean;
  className?: string;
}

const STATUS_META: Record<
  DataStatus,
  { label: string; he: string; icon: typeof Radio; className: string }
> = {
  live: {
    label: "LIVE",
    he: "חי",
    icon: Radio,
    className:
      "border-chart-positive/30 bg-chart-positive/10 text-chart-positive",
  },
  mock: {
    label: "MOCK",
    he: "לדוגמה",
    icon: WandSparkles,
    className: "border-chart-amber/30 bg-chart-amber/10 text-chart-amber",
  },
  estimate: {
    label: "ESTIMATE",
    he: "הערכה",
    icon: Sparkles,
    className: "border-chart-blue/30 bg-chart-blue/10 text-chart-blue",
  },
  derived: {
    label: "DERIVED",
    he: "מחושב",
    icon: Sparkles,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
};

function formatUpdatedAt(updatedAt: number | null | undefined): string | null {
  if (!updatedAt) return null;
  return new Date(updatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Compact, reusable provenance marker. It deliberately names the source and
 * fetch time when available so a user can tell live, estimated, mocked, and
 * locally-derived values apart without opening a provider-health panel.
 */
export default function DataStatusBadge({
  status,
  source,
  updatedAt,
  compact = false,
  iconOnly = false,
  className = "",
}: DataStatusBadgeProps) {
  const { lang } = useI18n();
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const fetched = formatUpdatedAt(updatedAt);
  const statusLabel = lang === "he" ? meta.he : meta.label;
  const details = [
    source,
    fetched ? `${lang === "he" ? "עודכן" : "updated"} ${fetched}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-mono uppercase tracking-[0.08em] ${
        iconOnly
          ? "h-4 w-4 border-0 bg-transparent p-0"
          : compact
            ? "min-h-4 px-1.5 py-0.5 text-[9px] leading-none"
            : "px-2 py-1 text-[10px]"
      } ${meta.className} ${className}`}
      title={details || statusLabel}
      aria-label={details ? `${statusLabel} · ${details}` : statusLabel}
    >
      <Icon
        className={iconOnly ? "h-2.5 w-2.5" : "h-3 w-3"}
        aria-hidden="true"
      />
      {!iconOnly && <span>{statusLabel}</span>}
      {!iconOnly && source && !compact && (
        <span className="font-sans normal-case tracking-normal opacity-75">
          · {source}
        </span>
      )}
    </span>
  );
}
