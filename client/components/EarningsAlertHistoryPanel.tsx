import { Bell } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";

import { useI18n } from "@/lib/i18n";
import { useEarningsAlerts } from "@/hooks/useEarningsAlerts";

/**
 * TopBar Bell button with a slide-down panel listing today's
 * acknowledged earnings alerts (opened / snoozed / dismissed). The
 * panel is gated by Radix Popover — clicks outside the panel, or
 * pressing Esc, dismiss it. A badge shows the count when at least
 * one entry exists for today.
 *
 * The button itself never renders anything visible beyond the bell +
 * optional count chip, so positioning is purely a TopBar layout
 * concern (inserted in the right-cluster between the freshness
 * indicator and the index pills).
 */
export function EarningsAlertHistoryButton() {
  const { history, todayIso } = useEarningsAlerts();
  const { t } = useI18n();

  // Per-day view only: anything older than today's local-midnight
  // drops out (the engine's tick-time prune handles persistence but
  // we re-filter here defensively so a clock-skewed snooze won't show
  // yesterday's history).
  const todayEntries = history.filter((h) => h.date >= todayIso);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative p-2 rounded-md hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
          aria-label={t("earningsAlerts.historyTitle")}
          title={t("earningsAlerts.historyTitle")}
        >
          <Bell className="w-4 h-4" />
          {todayEntries.length > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-xs font-bold bg-blue-500 text-white shadow"
              dir="ltr"
            >
              {todayEntries.length > 99 ? "99+" : todayEntries.length}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 max-h-[480px] overflow-auto rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl"
        >
          <div className="p-3 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur">
            <h3 className="font-bold text-sm">
              {t("earningsAlerts.historyTitle")}
            </h3>
            <span className="text-xs text-slate-500">
              {todayEntries.length === 1
                ? t("earningsAlerts.historyCount_one", {
                    count: todayEntries.length,
                  })
                : t("earningsAlerts.historyCount_other", {
                    count: todayEntries.length,
                  })}
            </span>
          </div>
          {todayEntries.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-slate-500">
                {t("earningsAlerts.historyEmpty")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {todayEntries.map((h) => (
                <li
                  key={`${h.key}-${h.ts}`}
                  className="p-3 flex items-center gap-2 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex flex-col flex-1 min-w-0" dir="ltr">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {h.symbol}
                      </span>
                      <span className="text-xs text-slate-500">{h.date}</span>
                    </div>
                    <span
                      className={`text-xs uppercase tracking-wide px-1.5 py-0.5 rounded w-fit ${
                        h.action === "opened"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : h.action === "snoozed"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {t(`earningsAlerts.historyAction.${h.action}`)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
