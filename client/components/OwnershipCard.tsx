import { Landmark } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import DataStatusBadge from "@/components/DataStatusBadge";
import { useStockOwnership, useYahooDown } from "@/hooks/useStockData";
import type {
  InsiderHolder,
  OwnershipHolder,
} from "@shared/api";

/** Compact USD formatter: $850M / $3.4B / $62K. */
function formatUsd(value?: number): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function HolderRow({ holder }: { holder: OwnershipHolder }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground/90">
          {holder.name || "—"}
        </span>
        {holder.reportDate && (
          <span className="block text-[10px] text-muted-foreground/70">
            {t("ownership.asOf", { date: holder.reportDate })}
          </span>
        )}
      </div>
      <div className="shrink-0 text-right rtl:text-left">
        {holder.pctHeld !== undefined && (
          <span
            className="block font-mono text-xs font-semibold text-foreground tabular-nums"
            dir="ltr"
          >
            {holder.pctHeld.toFixed(2)}%
          </span>
        )}
        {formatUsd(holder.value) && (
          <span
            className="block font-mono text-[10px] text-muted-foreground tabular-nums"
            dir="ltr"
          >
            {formatUsd(holder.value)}
          </span>
        )}
      </div>
    </li>
  );
}

function InsiderRow({ holder }: { holder: InsiderHolder }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground/90">
          {holder.name || "—"}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground/70">
          {[holder.title, holder.relation].filter(Boolean).join(" · ") ||
            t("ownership.insiderRelation")}
        </span>
      </div>
      <div className="shrink-0 text-right rtl:text-left">
        {holder.shares !== undefined && (
          <span
            className="block font-mono text-xs font-semibold text-foreground tabular-nums"
            dir="ltr"
          >
            {holder.shares.toLocaleString("en-US", { notation: "compact" })}
          </span>
        )}
        {formatUsd(holder.value) && (
          <span
            className="block font-mono text-[10px] text-muted-foreground tabular-nums"
            dir="ltr"
          >
            {formatUsd(holder.value)}
          </span>
        )}
      </div>
    </li>
  );
}

function HolderList({
  titleKey,
  holders,
  emptyKey,
  Insider = false,
}: {
  titleKey: string;
  holders: OwnershipHolder[] | InsiderHolder[];
  emptyKey: string;
  Insider?: boolean;
}) {
  const { t } = useI18n();
  const Row = Insider ? InsiderRow : HolderRow;
  return (
    <div className="rounded-lg bg-background/50 border border-border/50 p-3">
      <h4 className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold mb-1.5">
        {t(titleKey)}
      </h4>
      {holders.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 py-2">{t(emptyKey)}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {holders.map((h, i) => (
            <Row key={`${i}-${(h as OwnershipHolder).name}`} holder={h} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Ownership snapshot on the ticker surface — institutional holders, fund
 * holders and top insider holders from the free Yahoo `quoteSummary`
 * modules. When Yahoo is down the card shows the standard [MOCK] badge
 * (via `useYahooDown`) and, when the payload is empty, an explicit
 * unavailable state — it never falls back to premium FMP ownership data.
 */
export default function OwnershipCard({ ticker }: { ticker: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useStockOwnership(ticker);
  const yahooDown = useYahooDown();

  return (
    <section aria-label={t("ownership.title")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary">
            <Landmark className="w-4 h-4" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-bold text-foreground tracking-tight">
            {t("ownership.title")}
          </h2>
          {data && !data.unavailable && (
            <DataStatusBadge status="live" source="Yahoo Finance" compact />
          )}
        </div>
        {yahooDown && <DataStatusBadge status="mock" source="Yahoo fallback" />}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg bg-muted/30"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : data?.unavailable ? (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("ownership.unavailable")}
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t("ownership.unavailableNote")}
          </p>
        </div>
      ) : (
        <>
          {(data?.institutionPercent !== undefined ||
            data?.insiderPercent !== undefined) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {data?.institutionPercent !== undefined && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-chart-blue/10 text-chart-blue border-chart-blue/30"
                  dir="ltr"
                >
                  {t("ownership.institutionPercent")}{" "}
                  {data.institutionPercent.toFixed(1)}%
                </span>
              )}
              {data?.insiderPercent !== undefined && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-chart-purple/10 text-chart-purple border-chart-purple/30"
                  dir="ltr"
                >
                  {t("ownership.insiderPercent")}{" "}
                  {data.insiderPercent.toFixed(1)}%
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <HolderList
              titleKey="ownership.institution"
              holders={data?.institutionHolders ?? []}
              emptyKey="ownership.emptyInstitution"
            />
            <HolderList
              titleKey="ownership.fund"
              holders={data?.fundHolders ?? []}
              emptyKey="ownership.emptyFund"
            />
            <HolderList
              titleKey="ownership.insiders"
              holders={data?.insiderHolders ?? []}
              emptyKey="ownership.emptyInsiders"
              Insider
            />
          </div>
        </>
      )}
    </section>
  );
}