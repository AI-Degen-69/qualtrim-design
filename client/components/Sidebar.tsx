import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  List,
  TrendingUp,
  Calendar,
  Search,
  BriefcaseBusiness,
  Scale,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import { getLogoDevAttributionUrl } from "@/lib/logoDev";

const navItems = [
  {
    i18nKey: "nav.insights",
    href: "/insights",
    icon: BarChart3,
  },
  {
    i18nKey: "nav.screener",
    href: "/screener",
    icon: Search,
  },
  {
    i18nKey: "nav.watchlists",
    href: "/watchlists",
    icon: List,
  },
  {
    i18nKey: "nav.compare",
    href: "/compare",
    icon: Scale,
  },
  {
    i18nKey: "nav.charts",
    href: "/charts",
    icon: TrendingUp,
  },
  {
    i18nKey: "nav.earnings",
    href: "/earnings",
    icon: Calendar,
  },
  {
    i18nKey: "nav.portfolios",
    href: "/portfolios",
    icon: BriefcaseBusiness,
  },
];

/**
 * Renders the application sidebar navigation and language switcher.
 */
export default function Sidebar() {
  const location = useLocation();
  const { t } = useI18n();

  const isItemActive = (href: string) =>
    location.pathname === href ||
    (href === "/insights" && location.pathname.startsWith("/stock/"));

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-e border-border bg-background md:flex md:h-screen md:flex-col">
        <div className="border-b border-border px-5 py-5">
          <Link
            to="/insights"
            className="font-display text-lg font-bold tracking-[0.18em] text-foreground"
          >
            VANTAGE
          </Link>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Research workspace
          </p>
        </div>
        {/* Navigation Menu */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.href);

            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-[6px] text-base font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary border-s-2 border-primary"
                    : "text-muted-foreground hover:bg-card hover:text-foreground border-s-2 border-transparent"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{t(item.i18nKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Settings */}
        <div className="border-t border-border p-4">
          <LanguageSwitcher />
          {/* Free-tier attribution link required by https://www.logo.dev/ when no
            paid plan is in place. Renders as a tiny muted text link so it
            stays out of the way visually but is always discoverable. */}
          <a
            href={getLogoDevAttributionUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide uppercase opacity-70 hover:opacity-100"
            aria-label={t("attribution.logoDevAria")}
          >
            {t("attribution.logoDev")}
          </a>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background/95 px-2 py-2 backdrop-blur md:hidden"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{t(item.i18nKey)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
