import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface SkeletonProps {
  className?: string;
  /** Tailwind rounded element. */
  rounded?: string;
  /** Inline styles (for height/width overrides that don't fit a className). */
  style?: CSSProperties;
}

/**
 * Renders an animated placeholder block for loading states.
 */
export function Skeleton({
  className,
  rounded = "rounded-md",
  style,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted/60",
        rounded,
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-muted-foreground/10 before:to-transparent",
        className,
      )}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Skeleton block shaped like one InsightsCard. Used inside Index.tsx grid. */
export function MetricCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-panel p-4 flex flex-col justify-between">
      <div>
        <Skeleton className="h-3 w-24 mb-2.5" />
        <div className="flex items-baseline gap-2.5 mb-3">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-14" rounded="rounded" />
        </div>
      </div>
      <Skeleton className="h-[68px] w-full mt-2" rounded="rounded-sm" />
      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-border/40">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

/**
 * Renders a skeleton placeholder for a header price and its metadata row.
 */
export function HeaderPriceSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 mb-3">
      <Skeleton className="h-12 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

/**
 * Skeleton for the "Analyst Outlook & Range" card on Index.tsx.
 *
 * Mirrors the loaded card's footprint (header row with badge, 52-week range
 * block, 2x2 stat grid) so the card frame and height stay stable while
 * quote/analyst data loads — no layout jump at first paint.
 */
export function AnalystCardSkeleton() {
  return (
    <div aria-hidden="true">
      {/* Header row: title + badge */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-5 w-24" rounded="rounded" />
      </div>

      {/* 52-week range block */}
      <div className="mb-4 p-3.5 rounded-lg bg-muted/30 border border-border/40 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-3 w-16 mx-auto" />
      </div>

      {/* 2x2 stat grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`analyst-skel-${i}`}
            className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-1.5"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for the "Quality in Brief" news list on Index.tsx.
 *
 * Mirrors three news-item rows (two-line title + publisher/date meta) so the
 * card's list area holds its height while news data loads. The card's real
 * header stays mounted outside this component, so only the list swaps.
 */
export function NewsCardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={`news-skel-${i}`}
          className="flex flex-col gap-1.5 p-2.5 rounded-lg"
        >
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex items-center gap-2 pt-0.5">
            <Skeleton className="h-4 w-16" rounded="rounded" />
            <span className="text-xs text-muted-foreground">•</span>
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders a section card placeholder with a configurable content block height.
 *
 * @param height - The height of the card's main placeholder block in pixels.
 */
export function SectionCardSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="w-full" rounded="rounded" style={{ height }} />
    </div>
  );
}

/**
 * Shared Suspense fallback for route-level lazy chunks.
 *
 * Renders a localized, keyboard-safe loading block inside the app shell
 * (the Sidebar/TopBar layout stays mounted because Suspense wraps only the
 * routed `<Outlet />` content). `role="status"` announces the state to
 * screen readers; the skeleton blocks keep the viewport from collapsing
 * to a blank screen while the chunk streams in.
 *
 * Layout stability: the grid template mirrors a typical page's card grid,
 * so the fallback occupies roughly the same vertical space as the content
 * it replaces instead of snapping to a tiny block.
 */
export function RouteFallback() {
  const { t } = useI18n();
  return (
    // role="status" already implies aria-live="polite" — the container is a
    // live region announcing the sr-only localized label below.
    <div role="status" className="w-full px-4 md:px-8 py-8 space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`route-skel-${i}`} className="h-[150px]" />
        ))}
      </div>
      <span className="sr-only">{t("route.loading")}</span>
    </div>
  );
}
