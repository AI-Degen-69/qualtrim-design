import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { useEarningsAlerts } from "@/hooks/useEarningsAlerts";
import { formatTimeUntil } from "@/lib/alertUtils";

/**
 * The alert engine's UI surface for the actual "live" queue.
 *
 * Renders nothing itself (no DOM) — its sole job is to dispatch one
 * sonner toast per upcoming alert and reconcile the live set against
 * the rendered set on every update:
 *
 *   - **New event surfaced upstream**: dispatch a fresh toast and stash
 *     its sonner id in `shownRef`.
 *   - **User snoozed / acknowledged** (locally or in another tab): the
 *     engine's `upcoming` array drops the key, the effect dismisses the
 *     matching sonner toast by id, removes the entry from `shownRef`.
 *   - **Event rolled past 24h** without user interaction: the natural
 *     `upcoming` filter excludes it, the toast is dismissed and the
 *     history is *not* updated (auto-dismissals aren't logged).
 *
 * Reconciliation is keyed on `upcoming` (the upstream value) NOT on
 * `shownRef` so we never leak a "shown but no longer upcoming" toast if
 * React batches updates oddly.
 */
export function EarningsAlertStrip() {
  const { upcoming, snooze, acknowledge } = useEarningsAlerts();
  const { t } = useI18n();
  const navigate = useNavigate();
  // `shownRef.current` mirrors the {alertKey → sonner toastId} mapping
  // for the current mount. We use a ref so the dispatch function inside
  // `useEffect` always reads the latest snapshot — closing over the
  // value at mount-time would let memoization hot-warm-up divergence.
  const shownRef = useRef<Map<string, string | number>>(new Map());

  useEffect(() => {
    const liveKeys = new Set(upcoming.map((u) => u.key));

    // Drop toasts whose alerts were snoozed / acknowledged / past 24h.
    for (const [key, id] of Array.from(shownRef.current.entries())) {
      if (!liveKeys.has(key)) {
        shownRef.current.delete(key);
        try {
          toast.dismiss(id);
        } catch {
          // sonner has already removed it — fine.
        }
      }
    }

    // Dispatch new alerts. Skip if already shown.
    for (const alert of upcoming) {
      if (shownRef.current.has(alert.key)) continue;
      const id = toast.custom(
        () => (
          <div
            className="flex items-start gap-3 w-full"
            data-alert-key={alert.key}
          >
            <div
              className={`p-1.5 rounded-md shrink-0 ${
                alert.event.time === "bmo"
                  ? "bg-amber-500/20 text-amber-400"
                  : alert.event.time === "amc"
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-slate-700/30 text-slate-300"
              }`}
            >
              {alert.event.time === "bmo" ? (
                <Sun className="w-4 h-4" />
              ) : alert.event.time === "amc" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <span className="text-xs font-bold px-1.5">•</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap" dir="ltr">
                <span className="font-bold text-foreground">
                  {alert.event.symbol}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    alert.event.time === "bmo"
                      ? "bg-amber-500/15 text-amber-300"
                      : alert.event.time === "amc"
                        ? "bg-purple-500/15 text-purple-300"
                        : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {alert.event.time === "bmo"
                    ? t("earnings.bmo")
                    : alert.event.time === "amc"
                      ? t("earnings.amc")
                      : t("earnings.midday")}
                </span>
                <span className="text-xs text-slate-500">
                  {formatTimeUntil(alert.event, t)}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5" dir="ltr">
                {t("earnings.eps_est")} $
                {(alert.event.epsEstimated ?? 0).toFixed(2)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => {
                    acknowledge(alert.key, "opened");
                    toast.dismiss(id);
                    const focus = encodeURIComponent(alert.event.symbol);
                    const date = encodeURIComponent(alert.event.date);
                    navigate(`/earnings?focus=${focus}&date=${date}`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
                >
                  {t("earningsAlerts.open")}
                </button>
                <button
                  onClick={() => {
                    snooze(alert.key);
                    toast.dismiss(id);
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1 rounded transition-colors"
                >
                  {t("earningsAlerts.snooze")}
                </button>
                <button
                  onClick={() => {
                    acknowledge(alert.key, "dismissed");
                    toast.dismiss(id);
                  }}
                  className="ms-auto text-slate-500 hover:text-slate-200 text-lg leading-none px-1"
                  aria-label={t("earningsAlerts.dismiss")}
                  title={t("earningsAlerts.dismiss")}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ),
        {
          duration: Number.POSITIVE_INFINITY,
          unstyled: true,
          classNames: {
            toast:
              "bg-slate-900 border border-slate-700 text-foreground shadow-lg rounded-lg p-3 flex min-w-[320px] max-w-[420px]",
          },
        },
      );
      shownRef.current.set(alert.key, id);
    }
  }, [upcoming, snooze, acknowledge, navigate, t]);

  return null;
}
