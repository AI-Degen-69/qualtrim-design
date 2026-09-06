import { useState, useMemo } from "react";
import { useProviderHealth } from "@/hooks/useStockData";
import { useI18n } from "@/lib/i18n";
import {
  perProviderStatus,
  PROVIDER_STATUS_RANK,
} from "@shared/providerHealth";
import type { ProviderHealthEntry, ProviderStatus } from "@shared/api";
import {
  Activity,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";

/** Display labels for each provider. */
function getProviderName(
  provider: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (provider === "yahoo") return t("source.yahoo");
  if (provider === "fmp") return t("source.fmp");
  if (provider === "alphavantage") return t("source.alphavantage");
  return provider;
}

/** Display labels for each probed feature. */
function getFeatureName(
  feature: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (feature === "batch-quote") return t("providerHealth.feature.batchQuote");
  if (feature === "quote") return t("providerHealth.feature.quote");
  if (feature === "chart") return t("providerHealth.feature.chart");
  return feature;
}

/** Severity styling for individual status */
function getStatusMeta(
  status: ProviderStatus,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  switch (status) {
    case "ok":
      return {
        label: t("providerHealth.status.ok"),
        dotColor: "bg-emerald-400",
        badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        icon: CheckCircle2,
        iconColor: "text-emerald-400",
      };
    case "degraded":
      return {
        label: t("providerHealth.status.degraded"),
        dotColor: "bg-amber-400",
        badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
        icon: AlertTriangle,
        iconColor: "text-amber-400",
      };
    case "down":
      return {
        label: t("providerHealth.status.down"),
        dotColor: "bg-red-500",
        badgeBg: "bg-red-500/10 text-red-400 border-red-500/30",
        icon: XCircle,
        iconColor: "text-red-400",
      };
    case "known_restriction":
      return {
        label: t("providerHealth.status.knownRestriction"),
        dotColor: "bg-amber-300",
        badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        icon: AlertTriangle,
        iconColor: "text-amber-300",
      };
    case "not_configured":
    default:
      return {
        label: t("providerHealth.status.notConfigured"),
        dotColor: "bg-muted-foreground",
        badgeBg: "bg-muted text-muted-foreground border-border",
        icon: HelpCircle,
        iconColor: "text-muted-foreground",
      };
  }
}

/**
 * Redesigned, comprehensive Provider Health & Telemetry Bar.
 * Positioned at the bottom of the workspace (footer status strip).
 * Features at-a-glance provider chips, fallback awareness, and an expandable
 * diagnostic drawer explaining live routing and status per provider.
 */
export function ProviderHealthIndicator() {
  const { t } = useI18n();
  const { data, refetch, isFetching } = useProviderHealth();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const entries = data?.providers ?? [];
  const collapsedMap = useMemo(() => perProviderStatus(entries), [entries]);

  // Aggregate providers list: yahoo, fmp, alphavantage
  const providerList = useMemo(() => {
    const defaultProviders = ["yahoo", "fmp", "alphavantage"] as const;
    return defaultProviders.map((p) => {
      const providerEntries = entries.filter((e) => e.provider === p);
      const rawStatus = (collapsedMap.get(p) ??
        (providerEntries.length > 0
          ? "ok"
          : "not_configured")) as ProviderStatus;
      const minLatency = providerEntries.reduce<number | null>((acc, curr) => {
        if (curr.latencyMs == null) return acc;
        return acc == null ? curr.latencyMs : Math.min(acc, curr.latencyMs);
      }, null);

      return {
        id: p,
        name: getProviderName(p, t),
        status: rawStatus,
        entries: providerEntries,
        latencyMs: minLatency,
      };
    });
  }, [entries, collapsedMap, t]);

  const hasDegradedOrDown = useMemo(() => {
    return providerList.some(
      (p) => p.status === "down" || p.status === "degraded",
    );
  }, [providerList]);

  if (!data) return null;

  // If user minimized the bottom bar, show a tiny floating indicator pill in the corner
  if (isMinimized) {
    return (
      <aside
        aria-label={t("providerHealth.title")}
        className="fixed bottom-2 end-4 z-40"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-mono shadow-lg backdrop-blur bg-background/90 hover:bg-card transition-colors ${
            hasDegradedOrDown
              ? "border-amber-500/40 text-amber-300"
              : "border-border text-muted-foreground"
          }`}
          title={t("providerHealth.viewDetails")}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasDegradedOrDown
                ? "bg-amber-400 animate-pulse"
                : "bg-emerald-400"
            }`}
          />
          <span>{t("providerHealth.barTitle")}</span>
          <ChevronUp className="w-3 h-3" />
        </button>
      </aside>
    );
  }

  return (
    <footer
      role="status"
      aria-live="polite"
      aria-label={t("providerHealth.title")}
      className="w-full shrink-0 border-t border-border bg-card/95 backdrop-blur z-30 transition-all text-xs font-mono"
    >
      {/* ------------------------------------------------------------------ */}
      {/* 1. EXPANDABLE DIAGNOSTICS & TELEMETRY DRAWER                       */}
      {/* ------------------------------------------------------------------ */}
      {isExpanded && (
        <div className="border-b border-border/80 bg-background/95 p-4 sm:p-6 space-y-4 max-h-[380px] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>{t("providerHealth.modalTitle")}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                {t("providerHealth.modalSubtitle")}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-border bg-muted/60 hover:bg-muted text-foreground text-[11px] font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`}
                />
                <span>{t("providerHealth.recheck")}</span>
              </button>

              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={t("providerHealth.hideDetails")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Transparent Fallback Notice when FMP is rate-limited */}
          {hasDegradedOrDown && (
            <div className="flex items-start gap-2.5 p-3 rounded-[6px] bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-300">
                  {t("providerHealth.fallbackActive")}
                </div>
                <p className="text-[11px] text-amber-200/80 leading-normal">
                  {t("providerHealth.fallbackEngagedNote")}
                </p>
              </div>
            </div>
          )}

          {/* 3 Provider Deep-Dive Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {providerList.map((prov) => {
              const meta = getStatusMeta(prov.status, t);
              const Icon = meta.icon;
              const description =
                prov.id === "yahoo"
                  ? t("providerHealth.yahooDesc")
                  : prov.id === "fmp"
                    ? t("providerHealth.fmpDesc")
                    : t("providerHealth.alphavantageDesc");

              return (
                <div
                  key={prov.id}
                  className="p-3.5 rounded-[6px] border border-border bg-card space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${meta.dotColor}`}
                        />
                        <span className="font-bold text-foreground text-sm">
                          {prov.name}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${meta.badgeBg}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-normal">
                      {description}
                    </p>
                  </div>

                  {/* Probed features breakdown */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-[10px]">
                    {prov.entries.length > 0 ? (
                      prov.entries.map((entry) => {
                        const entryMeta = getStatusMeta(entry.status, t);
                        return (
                          <div
                            key={entry.feature}
                            className="flex items-center justify-between text-muted-foreground"
                          >
                            <span className="truncate">
                              {getFeatureName(entry.feature, t)}
                            </span>
                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              dir="ltr"
                            >
                              {entry.latencyMs != null && (
                                <span className="text-muted-foreground/70">
                                  {entry.latencyMs}ms
                                </span>
                              )}
                              <span
                                className={`px-1 rounded ${entryMeta.badgeBg} font-semibold`}
                              >
                                {entry.status}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-muted-foreground/60 italic">
                        {t("providerHealth.status.notConfigured")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. SLIM FOOTER STATUS BAR (ALWAYS VISIBLE)                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Global Feed Health Summary */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-foreground font-semibold">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span>{t("providerHealth.barTitle")}:</span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border text-[11px] font-medium ${
              hasDegradedOrDown
                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasDegradedOrDown
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-400"
              }`}
            />
            <span>
              {hasDegradedOrDown
                ? t("providerHealth.fallbackActive")
                : t("providerHealth.allHealthy")}
            </span>
          </div>
        </div>

        {/* Center: Live Provider Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {providerList.map((prov) => {
            const meta = getStatusMeta(prov.status, t);
            return (
              <button
                key={prov.id}
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-background/80 hover:bg-background border border-border/80 text-[11px] transition-colors"
                title={`${prov.name}: ${meta.label}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                <span className="font-semibold text-foreground">
                  {prov.name}
                </span>
                {prov.latencyMs != null && (
                  <span className="text-muted-foreground text-[10px]" dir="ltr">
                    ({prov.latencyMs}ms)
                  </span>
                )}
                {prov.status === "degraded" && (
                  <span className="text-amber-400 text-[10px] font-bold">
                    [Fallback]
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Expand Details & Minimize Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-muted/60 hover:bg-muted text-foreground text-[11px] transition-colors"
          >
            <span>
              {isExpanded
                ? t("providerHealth.hideDetails")
                : t("providerHealth.viewDetails")}
            </span>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Minimize bar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}

export default ProviderHealthIndicator;
