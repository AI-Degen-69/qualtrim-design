import { HeartPulse, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type {
  IncomeStatementRow,
  StockMetrics,
} from "@shared/api";
import {
  altmanZone,
  compositeBand,
  growthScore,
  piotroskiBand,
  profitabilityScore,
  type ScoreBand,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";

interface StockHealthScorecardProps {
  metrics?: StockMetrics | null;
  income?: IncomeStatementRow[] | undefined;
  loading?: boolean;
}

const TONE_TEXT: Record<ScoreBand["tone"], string> = {
  positive: "text-chart-positive",
  neutral: "text-chart-amber",
  negative: "text-chart-negative",
};

const TONE_CHIP: Record<ScoreBand["tone"], string> = {
  positive: "bg-chart-positive/15 text-chart-positive border-chart-positive/30",
  neutral: "bg-chart-amber/15 text-chart-amber border-chart-amber/30",
  negative: "bg-chart-negative/15 text-chart-negative border-chart-negative/30",
};

function SourceChip({
  source,
}: {
  source: "fmp" | "derived" | "unavailable";
}) {
  const { t } = useI18n();
  if (source === "unavailable") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wide border border-border/60 bg-muted/40 text-muted-foreground"
        title={t("scorecard.unavailableTooltip")}
      >
        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        {t("scorecard.source.unavailable")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wide border",
        source === "fmp"
          ? "border-chart-positive/30 bg-chart-positive/10 text-chart-positive"
          : "border-chart-blue/30 bg-chart-blue/10 text-chart-blue",
      )}
      title={
        source === "fmp"
          ? t("scorecard.source.fmpTooltip")
          : t("scorecard.source.derivedTooltip")
      }
    >
      {source === "fmp"
        ? t("scorecard.source.fmp")
        : t("scorecard.source.derived")}
    </span>
  );
}

function ScoreCard({
  labelKey,
  value,
  band,
  explanationKey,
  source,
  year,
  loading,
}: {
  labelKey: string;
  value: string | null;
  band: ScoreBand | null;
  explanationKey: string;
  source: "fmp" | "derived" | "unavailable";
  year?: string;
  loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="p-3.5 rounded-lg bg-background/50 border border-border/50 space-y-1.5 hover:border-primary/30 transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
          {t(labelKey)}
        </span>
        <SourceChip source={source} />
      </div>
      <div className="flex items-baseline gap-2">
        {loading ? (
          <span
            className="block h-5 w-16 animate-pulse rounded bg-muted-foreground/20"
            aria-hidden="true"
          />
        ) : (
          <>
            <span
              className={cn(
                "text-base sm:text-lg font-bold font-mono tabular-nums",
                value !== null ? "text-foreground" : "text-muted-foreground/50",
              )}
              dir="ltr"
            >
              {value ?? "—"}
            </span>
            {value !== null && band && (
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border",
                  TONE_CHIP[band.tone],
                )}
              >
                {t(band.key)}
              </span>
            )}
          </>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/90 flex-1">
        {t(explanationKey)}
      </p>
      {year && value !== null && (
        <span
          className="text-[10px] font-mono text-muted-foreground/70"
          dir="ltr"
        >
          {t("scorecard.asOf", { year })}
        </span>
      )}
    </div>
  );
}

/**
 * Stock-health scorecard — Altman Z and Piotroski come straight from FMP
 * `financial-scores` (via `/api/stock-metrics`); profitability and growth
 * are transparent Vantage composites of TTM ratios and statement YoY the
 * ticker page already fetches, always badged "Derived". When FMP 429s (or
 * the Vercel Yahoo-only twin serves the payload) the FMP cards show the
 * locked "Unavailable" chip instead of inventing values.
 */
export default function StockHealthScorecard({
  metrics,
  income,
  loading = false,
}: StockHealthScorecardProps) {
  const { t } = useI18n();
  const scores = metrics?.scores ?? null;
  const altman = scores?.altmanZScore ?? null;
  const piotroski = scores?.piotroskiScore ?? null;
  const prof = profitabilityScore(metrics?.metrics, metrics?.ratios);
  const growth = growthScore(income);

  const fmpAvailable = scores !== null && altman !== null && piotroski !== null;

  return (
    <section aria-label={t("scorecard.title")}>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary">
          <HeartPulse className="w-4 h-4" aria-hidden="true" />
        </div>
        <h2 className="font-display text-base sm:text-lg font-bold text-foreground tracking-tight">
          {t("scorecard.title")}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
        <ScoreCard
          labelKey="scorecard.altman"
          value={altman !== null ? altman.toFixed(2) : null}
          band={altmanZone(altman)}
          explanationKey="scorecard.altman.explanation"
          source={fmpAvailable ? "fmp" : "unavailable"}
          year={fmpAvailable ? scores?.year : undefined}
          loading={loading}
        />
        <ScoreCard
          labelKey="scorecard.piotroski"
          value={
            piotroski !== null ? `${piotroski} / 9` : null
          }
          band={piotroskiBand(piotroski)}
          explanationKey="scorecard.piotroski.explanation"
          source={fmpAvailable ? "fmp" : "unavailable"}
          year={fmpAvailable ? scores?.year : undefined}
          loading={loading}
        />
        <ScoreCard
          labelKey="scorecard.profitability"
          value={prof !== null ? String(prof) : null}
          band={compositeBand(prof)}
          explanationKey="scorecard.profitability.explanation"
          source={prof !== null ? "derived" : "unavailable"}
          loading={loading}
        />
        <ScoreCard
          labelKey="scorecard.growth"
          value={growth !== null ? String(growth) : null}
          band={compositeBand(growth)}
          explanationKey="scorecard.growth.explanation"
          source={growth !== null ? "derived" : "unavailable"}
          loading={loading}
        />
      </div>
    </section>
  );
}