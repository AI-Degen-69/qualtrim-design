import { useI18n } from "@/lib/i18n";
import TickerLogo from "@/components/TickerLogo";
import { Sun, Moon, Clock } from "lucide-react";
import { Link } from "react-router-dom";

export interface EarningsEventData {
  ticker: string;
  name?: string;
  date: string;
  dateFull?: string;
  weekday?: number;
  epsEst?: number | null;
  epsActual?: number | null;
  revEst?: number | null;
  revActual?: number | null;
  time: "Before Open" | "After Close" | "bmo" | "amc" | "unknown" | string;
  surprise?: "beat" | "miss" | "none" | string;
  marketCap?: number | string | null;
  isWatchlist?: boolean;
}

interface EarningsCardProps {
  event: EarningsEventData;
  isFocus?: boolean;
  onSelect?: (ticker: string) => void;
}

/**
 * Formats a currency amount into billions ($B) or millions ($M) string.
 *
 * @param val - Revenue estimate provided in billions of USD (e.g. 24.6 for $24.6B)
 * @returns The human-readable formatted revenue string or '—' if unavailable
 */
function formatRevenueEst(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  if (val >= 1) {
    return `$${val.toFixed(2)}B`;
  }
  return `$${(val * 1000).toFixed(0)}M`;
}

/**
 * Displays an individual company earnings event with estimates, actuals, surprise indicators,
 * timing badges, and quick navigation.
 *
 * @param event - The earnings event data
 * @param isFocus - Whether this card is highlighted from URL params or alerts
 * @param onSelect - Optional custom click handler
 * @returns The rendered earnings card component
 */
export function EarningsCard({
  event,
  isFocus = false,
  onSelect,
}: EarningsCardProps) {
  const { t } = useI18n();

  const timeNormalized = (event.time || "").toLowerCase();
  const isBmo =
    timeNormalized === "before open" ||
    timeNormalized === "bmo" ||
    timeNormalized.includes("open");
  const isAmc =
    timeNormalized === "after close" ||
    timeNormalized === "amc" ||
    timeNormalized.includes("close");

  const timingLabel = isBmo
    ? t("earningsCalendar.beforeOpen")
    : isAmc
      ? t("earningsCalendar.afterClose")
      : t("earningsCalendar.unknownTiming");

  const hasActualEps =
    event.epsActual !== undefined &&
    event.epsActual !== null &&
    Number.isFinite(event.epsActual);
  const epsEstVal =
    event.epsEst !== undefined &&
    event.epsEst !== null &&
    Number.isFinite(event.epsEst)
      ? event.epsEst
      : null;

  // Derive surprise if not explicitly set
  let surpriseState = event.surprise;
  if (!surpriseState || surpriseState === "none") {
    if (hasActualEps && epsEstVal !== null) {
      if (event.epsActual! > epsEstVal) surpriseState = "beat";
      else if (event.epsActual! < epsEstVal) surpriseState = "miss";
    }
  }

  const dateDisplay = event.dateFull || event.date;

  return (
    <div
      data-focus-event={`${event.ticker}-${event.date}`}
      className={`bg-card/90 border rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 transition-all group ${
        isFocus
          ? "border-primary ring-2 ring-primary/50 shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
      }`}
    >
      {/* Top Row: Identity & Badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <TickerLogo
            ticker={event.ticker}
            size="sm"
            className="rounded shrink-0 shadow-sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/stock/${event.ticker}`}
                className="font-bold font-mono text-base text-foreground group-hover:text-primary transition-colors hover:underline"
              >
                {event.ticker}
              </Link>
              {event.isWatchlist && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/30 rounded">
                  {t("earningsCalendar.watchlist")}
                </span>
              )}
            </div>
            {event.name && (
              <div className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[180px]">
                {event.name}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Surprise pill & Timing Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {surpriseState === "beat" && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-chart-positive/15 text-chart-positive border border-chart-positive/30">
              {t("earningsCalendar.beat")}
            </span>
          )}
          {surpriseState === "miss" && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-chart-negative/15 text-chart-negative border border-chart-negative/30">
              {t("earningsCalendar.miss")}
            </span>
          )}

          <div
            className={`p-1.5 rounded-md flex items-center justify-center ${
              isBmo
                ? "bg-amber-500/15 text-amber-400"
                : isAmc
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
            title={timingLabel}
            aria-label={timingLabel}
          >
            {isBmo ? (
              <Sun className="w-3.5 h-3.5" />
            ) : isAmc ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </div>

      {/* Middle Metrics Breakdown */}
      <div className="space-y-1.5 text-xs font-mono pt-2 border-t border-border/60">
        <div className="flex justify-between items-center text-muted-foreground">
          <span>{t("earningsCalendar.epsEst")}</span>
          <span
            className="text-foreground font-semibold tabular-nums"
            dir="ltr"
          >
            {epsEstVal !== null ? `$${epsEstVal.toFixed(2)}` : "—"}
          </span>
        </div>

        {hasActualEps && (
          <div className="flex justify-between items-center font-medium">
            <span className="text-muted-foreground">
              {t("earningsCalendar.actualEps")}
            </span>
            <span
              className={`tabular-nums font-bold ${
                surpriseState === "beat"
                  ? "text-chart-positive"
                  : surpriseState === "miss"
                    ? "text-chart-negative"
                    : "text-foreground"
              }`}
              dir="ltr"
            >
              ${event.epsActual!.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center text-muted-foreground">
          <span>{t("earningsCalendar.revEst")}</span>
          <span
            className="text-foreground font-semibold tabular-nums"
            dir="ltr"
          >
            {formatRevenueEst(event.revEst)}
          </span>
        </div>
      </div>

      {/* Bottom Footer: Date Timing & Link */}
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-2 border-t border-border/40">
        <span className="truncate">
          {dateDisplay} · {timingLabel}
        </span>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(event.ticker)}
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors shrink-0 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transform"
          >
            <span>{t("earningsCalendar.viewStock")}</span>
          </button>
        ) : (
          <Link
            to={`/stock/${event.ticker}`}
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors shrink-0 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transform"
          >
            <span>{t("earningsCalendar.viewStock")}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export default EarningsCard;
