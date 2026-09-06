import type { ReactNode } from "react";
import DataStatusBadge, { type DataStatus } from "@/components/DataStatusBadge";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: DataStatus;
  source?: string;
  updatedAt?: number | null;
  actions?: ReactNode;
  /** Optional identity mark rendered directly beside the title. */
  titleAdornment?: ReactNode;
  /** Optional identity mark rendered before the title. */
  titleLeadingAdornment?: ReactNode;
  /** When true, stack + center the eyebrow/title (stock hero header). */
  centered?: boolean;
  className?: string;
}

/** Shared page-level hierarchy for the research surfaces. */
export default function PageHeader({
  eyebrow,
  title,
  description,
  status,
  source,
  updatedAt,
  actions,
  titleAdornment,
  titleLeadingAdornment,
  centered = false,
  className = "",
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className} ${centered ? "sm:flex-col sm:items-center sm:justify-center text-center" : ""}`}
    >
      <div
        className={`min-w-0 ${centered ? "flex flex-col items-center text-center" : ""}`}
      >
        {eyebrow && (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {titleLeadingAdornment}
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {titleAdornment}
          {status && (
            <DataStatusBadge
              status={status}
              source={source}
              updatedAt={updatedAt}
              iconOnly
            />
          )}
        </div>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
