import {
  Banknote,
  CircleDollarSign,
  ChartNoAxesCombined,
  Landmark,
  Lock,
  Percent,
  Clock,
  Sigma,
  HelpCircle,
  AlertTriangle,
  CircleX,
  Minus,
} from "lucide-react";
import DataStatusBadge from "@/components/DataStatusBadge";
import { finite, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type {
  FinancialStatements,
  StockMetrics,
  StockQuote,
} from "@shared/api";

interface StockFundamentalsStripProps {
  quote: StockQuote | null | undefined;
  metrics: StockMetrics | null | undefined;
  annualFinancials: FinancialStatements | null | undefined;
  quarterlyFinancials: FinancialStatements | null | undefined;
  marketCap?: number | null;
  loading?: boolean;
}

type MetricValue = string | number | null | undefined;
type Source = { label: string } | undefined;

function formatNumber(value: unknown, digits = 2): string | null {
  const n = finite(value);
  return n === null ? null : n.toFixed(digits);
}

function percentValue(value: unknown): number | null {
  const n = finite(value);
  return n === null ? null : n;
}

function formatPercent(value: unknown): string | null {
  const n = percentValue(value);
  return n === null ? null : `${n.toFixed(2)}%`;
}

function latest<T extends { date: string }>(rows: T[] | undefined): T | null {
  if (!rows?.length) return null;
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return ordered[ordered.length - 1] ?? null;
}

function sourceLabel(
  source: "fmp" | "yahoo" | null | undefined,
): string | undefined {
  return source === "fmp"
    ? "FMP"
    : source === "yahoo"
      ? "Yahoo Finance"
      : undefined;
}

type AvailabilityState =
  | "available"
  | "pro"
  | "rateLimited"
  | "calcBroken"
  | "stale"
  | "notFound"
  | "nullByDesign";

function availabilityBadge({
  state,
  label,
  fullKey,
  t,
}: {
  state: AvailabilityState;
  label: string;
  fullKey?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const map: Record<
    AvailabilityState,
    { icon: typeof Lock; cls: string; textKey: string; titleKey: string }
  > = {
    pro: {
      icon: Lock,
      cls: "border-chart-amber/30 bg-chart-amber/5 text-chart-amber",
      textKey: "availability.pro",
      titleKey: "availability.proTitle",
    },
    rateLimited: {
      icon: Clock,
      cls: "border-chart-amber/30 bg-chart-amber/5 text-chart-amber",
      textKey: "availability.rateLimited",
      titleKey: "availability.rateLimitedTitle",
    },
    calcBroken: {
      icon: Sigma,
      cls: "border-muted/30 bg-muted/5 text-muted-foreground",
      textKey: "availability.calcBroken",
      titleKey: "availability.calcBrokenTitle",
    },
    stale: {
      icon: Clock,
      cls: "border-muted/30 bg-muted/5 text-muted-foreground/70",
      textKey: "availability.stale",
      titleKey: "availability.staleTitle",
    },
    notFound: {
      icon: CircleX,
      cls: "border-red-500/30 bg-red-500/5 text-red-500",
      textKey: "availability.notFound",
      titleKey: "availability.notFoundTitle",
    },
    nullByDesign: {
      icon: Minus,
      cls: "border-muted/20 bg-muted/5 text-muted-foreground/60",
      textKey: "availability.nullByDesign",
      titleKey: "availability.nullByDesignTitle",
    },
    available: {
      icon: HelpCircle,
      cls: "border-muted/20 bg-muted/5 text-muted-foreground/60",
      textKey: "availability.unknown",
      titleKey: "availability.unknownTitle",
    },
  };
  const cfg = map[state] ?? map.available;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-sans font-medium uppercase leading-none tracking-wide ${cfg.cls}`}
      title={t(cfg.titleKey, { label: fullKey ?? label })}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span>{t(cfg.textKey)}</span>
    </span>
  );
}

function Value({
  value,
  label,
  fullKey,
  loading,
  availability,
  t,
}: {
  value: MetricValue;
  label: string;
  fullKey?: string;
  loading?: boolean;
  availability?: AvailabilityState;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (loading) return <span className="text-muted-foreground/60">…</span>;
  if (value === null || value === undefined || value === "")
    return availabilityBadge({
      state: availability ?? "nullByDesign",
      label,
      fullKey,
      t,
    });
  return <span dir="ltr">{value}</span>;
}

function MetricRow({
  label,
  fullKey,
  value,
  loading,
  source,
  availability,
  t,
}: {
  label: string;
  fullKey?: string;
  value: MetricValue;
  loading?: boolean;
  source?: Source;
  availability?: AvailabilityState;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div className="flex items-baseline justify-between gap-1.5 overflow-hidden border-b border-border/40 py-1.5 text-xs last:border-0">
      <span
        className="min-w-0 truncate font-medium leading-tight text-muted-foreground"
        title={label}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
        <Value
          value={value}
          label={label}
          fullKey={fullKey}
          availability={availability}
          t={t}
          loading={loading}
        />
        {!loading && hasValue && source && (
          <DataStatusBadge
            status="live"
            source={source.label}
            compact
            iconOnly
          />
        )}
      </span>
    </div>
  );
}

const GROUP_ICONS = {
  valuation: CircleDollarSign,
  cashFlow: Banknote,
  marginsGrowth: ChartNoAxesCombined,
  balance: Landmark,
  dividend: Percent,
} as const;

function MetricGroup({
  title,
  groupKey,
  children,
}: {
  title: string;
  groupKey: keyof typeof GROUP_ICONS;
  children: React.ReactNode;
}) {
  const Icon = GROUP_ICONS[groupKey];
  return (
    <section className="min-w-0 border-border/50 px-0 sm:border-l sm:px-3 first:pl-0 first:sm:border-l-0 last:pr-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/80">
        <Icon className="h-3.5 w-3.5 text-primary/80" aria-hidden="true" />
        <span>{title}</span>
      </h3>
      <div>{children}</div>
    </section>
  );
}

/** Dense fundamentals summary containing only provider-reported values. */
export default function StockFundamentalsStrip({
  quote,
  metrics,
  annualFinancials,
  quarterlyFinancials,
  marketCap: marketCapProp,
  loading = false,
}: StockFundamentalsStripProps) {
  const { t } = useI18n();
  const f = (key: string) => t(`fundamentals.${key}`);
  const fGroup = (key: string) => t(`fundamentals.group.${key}`);
  const hasQuarterly = Boolean(
    quarterlyFinancials?.income?.length ||
      quarterlyFinancials?.balance?.length ||
      quarterlyFinancials?.cash?.length,
  );
  const statements = hasQuarterly ? quarterlyFinancials : annualFinancials;
  const balance = latest(statements?.balance);
  const marketCap = finite(marketCapProp) ?? finite(quote?.marketCap);
  const balanceSource = sourceLabel(statements?.sources?.balance);
  const metricsSource = sourceLabel(metrics?.source) ?? undefined;
  const quoteSource = quote ? "Yahoo Finance" : undefined;
  const availability = metrics?.availability ?? {};

  return (
    <div className="mt-8 w-full border-t border-border/60 pt-6 text-left">
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-5">
        <MetricGroup title={fGroup("valuation")} groupKey="valuation">
          <MetricRow
            t={t}
            label={f("priceToSales")}
            value={formatNumber(
              metrics?.metrics?.priceToSalesRatioTTM ??
                metrics?.ratios?.priceToSalesRatioTTM,
            )}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("evToEbitda")}
            value={formatNumber(metrics?.metrics?.evToEBITDATTM)}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("priceToBook")}
            value={formatNumber(
              metrics?.metrics?.priceToBookRatioTTM ??
                metrics?.ratios?.priceToBookRatioTTM,
            )}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
        </MetricGroup>

        <MetricGroup title={fGroup("cashFlow")} groupKey="cashFlow">
          <MetricRow
            t={t}
            label={f("pcf")}
            fullKey={f("pcfFull")}
            value={formatNumber(
              metrics?.ratios?.priceToOperatingCashFlowRatioTTM ??
                metrics?.ratios?.priceToCashFlowRatioTTM,
            )}
            loading={loading}
            availability={availability.pcf}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("pfcf")}
            fullKey={f("pfcfFull")}
            value={formatNumber(metrics?.ratios?.priceToFreeCashFlowRatioTTM)}
            loading={loading}
            availability={availability.pfcf}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("fcfYield")}
            fullKey={f("fcfFull")}
            value={formatPercent(metrics?.metrics?.freeCashFlowYieldTTM)}
            loading={loading}
            availability={availability.fcfYield}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
        </MetricGroup>

        <MetricGroup title={fGroup("marginsGrowth")} groupKey="marginsGrowth">
          <MetricRow
            t={t}
            label={f("profitMargin")}
            value={formatPercent(metrics?.ratios?.netProfitMargin)}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("operatingMargin")}
            value={formatPercent(metrics?.ratios?.operatingProfitMarginTTM)}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("roic")}
            fullKey={f("roic")}
            availability={availability.roic}
            // Percent units: the FMP metrics path normalizes roicTTM from
            // FMP's decimal fraction (0.44 → 44.05) server-side, matching
            // the Yahoo path's convention — formatPercent displays as-is.
            value={formatPercent(metrics?.metrics?.roicTTM)}
            loading={loading}
            source={metricsSource ? { label: metricsSource } : undefined}
          />
        </MetricGroup>

        <MetricGroup title={fGroup("balance")} groupKey="balance">
          <MetricRow
            t={t}
            label={f("cash")}
            value={formatMoney(balance?.cashAndCashEquivalents)}
            loading={loading}
            source={balanceSource ? { label: balanceSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("debt")}
            value={formatMoney(balance?.totalDebt)}
            loading={loading}
            source={balanceSource ? { label: balanceSource } : undefined}
          />
          <MetricRow
            t={t}
            label={f("netDebt")}
            value={formatMoney(balance?.netDebt)}
            loading={loading}
            source={balanceSource ? { label: balanceSource } : undefined}
          />
        </MetricGroup>

        <MetricGroup title={fGroup("dividend")} groupKey="dividend">
          <MetricRow
            t={t}
            label={f("dividendYield")}
            value={formatPercent(
              quote?.dividendYield ?? metrics?.metrics?.dividendYieldTTM,
            )}
            loading={loading}
            source={
              quote?.dividendYield != null
                ? { label: "Yahoo Finance" }
                : metricsSource
                  ? { label: metricsSource }
                  : undefined
            }
          />
          <MetricRow
            t={t}
            label={f("payoutRatio")}
            value={formatPercent(
              quote?.payoutRatio ?? metrics?.ratios?.dividendPayoutRatioTTM,
            )}
            loading={loading}
            source={
              quote?.payoutRatio != null
                ? { label: "Yahoo Finance" }
                : metricsSource
                  ? { label: metricsSource }
                  : undefined
            }
          />
          <MetricRow
            t={t}
            label={f("payoutDate")}
            fullKey={f("payoutDate")}
            availability={availability.payoutDate}
            value={null}
            loading={loading}
          />
        </MetricGroup>
      </div>
    </div>
  );
}
