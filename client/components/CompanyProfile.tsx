import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  useStockProfile,
  useStockInsider,
  useStockNews,
  useStockMetrics,
  useScreenerAsset,
} from "@/hooks/useStockData";
import { formatTradeDateLocale, parseTradeDateMs } from "@/lib/finance";
import { formatMoneyCompact } from "@/lib/format";
import type { InsiderTransactionCategory } from "@shared/api";
import { SectionCardSkeleton } from "@/components/Skeleton";
import DataStatusBadge from "@/components/DataStatusBadge";
import {
  Building2,
  Newspaper,
  Scale,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export default function CompanyProfile({
  ticker = "AAPL",
}: {
  ticker?: string;
}) {
  const { t } = useI18n();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const { data: overviewData, isLoading: overviewLoading } =
    useStockProfile(ticker);
  const { data: screenerAsset } = useScreenerAsset(ticker);
  const { data: insiderData } = useStockInsider(ticker);
  const { data: newsData } = useStockNews(ticker);
  const { data: metricsData } = useStockMetrics(ticker);

  const description =
    overviewData?.description || screenerAsset?.summary || null;
  const canExpandDescription = Boolean(description && description.length > 260);
  const sector = overviewData?.sector || screenerAsset?.sector || null;
  const industry = overviewData?.industry || screenerAsset?.industry || null;
  const ceo = overviewData?.ceo || null;
  const beta = overviewData?.beta ?? null;
  const piotroskiScore = metricsData?.scores?.piotroskiScore ?? null;
  const website = overviewData?.website?.trim() || null;

  const news = (newsData ?? []).map((item) => ({
    headline: item.title,
    publisher: item.publisher,
    timestamp: item.providerPublishTime
      ? (formatTradeDateLocale(item.providerPublishTime) ?? "Recent")
      : "Recent",
    thumbnail: item.thumbnail ?? null,
    url: item.link || "#",
  }));

  const insiders = (insiderData ?? [])
    .slice()
    .sort(
      (a, b) => parseTradeDateMs(b.startDate) - parseTradeDateMs(a.startDate),
    )
    .map((item) => ({
      name: item.filerName,
      relation: item.filerRelation ?? null,
      date: formatTradeDateLocale(item.startDate) ?? "—",
      typeLabel: i18nInsiderCategory(t, item.category, item.transactionText),
      category: item.category,
      isAdministrative: item.isAdministrative,
      transactionText: item.transactionText,
      shares: item.shares,
      price: item.price,
      priceLow: item.priceLow ?? null,
      priceHigh: item.priceHigh ?? null,
      value: item.value,
      marketClosePrice: item.marketClosePrice ?? null,
    }));

  if (overviewLoading) {
    return (
      <div className="mt-10 space-y-6">
        <SkeletonHeader />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SectionCardSkeleton height={360} />
            <SectionCardSkeleton height={260} />
          </div>
          <div className="space-y-6">
            <SectionCardSkeleton height={360} />
            <SectionCardSkeleton height={220} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-10 text-left">
      {/* 1. Company News & Media Wire Section */}
      <div>
        <SectionHeading
          icon={Newspaper}
          title={t("insights.news")}
          live={Boolean(newsData?.length)}
          source="Yahoo Finance"
          subtitle="Latest company press releases, market coverage, and analyst commentary."
        />

        <section className="rounded-panel border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-md shadow-xs hover:border-border transition-all">
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            {news.slice(0, 8).map((item, index) => {
              const initial = (item.publisher || "?")
                .trim()
                .charAt(0)
                .toUpperCase();
              return (
                <a
                  key={index}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 gap-3.5 rounded-lg border border-border/40 bg-background/50 p-3 transition-all hover:border-primary/40 hover:bg-muted/40 cursor-pointer"
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 shrink-0 rounded-md bg-muted object-cover border border-border/40"
                    />
                  ) : (
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-muted to-card text-base font-bold text-muted-foreground border border-border/40"
                      aria-hidden="true"
                    >
                      {initial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <p
                      className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary"
                      title={item.headline}
                    >
                      {item.headline}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
                      <span
                        className="truncate font-semibold px-1.5 py-0.5 rounded bg-muted/80 text-foreground/80 border border-border/40 text-[10px] uppercase"
                        title={item.publisher}
                      >
                        {item.publisher}
                      </span>
                      <span className="shrink-0 text-muted-foreground/70 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground/50" />
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
            {news.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-muted-foreground italic">
                No recent news available for {ticker}.
              </div>
            )}
          </div>
          {news.length > 0 && (
            <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground/80">
              {t("news.footer", { count: Math.min(news.length, 8) })}
            </p>
          )}
        </section>
      </div>

      {/* 2. Insider Trading Section */}
      <div>
        <SectionHeading
          icon={Scale}
          title={t("insights.insiderTrading")}
          live={Boolean(insiderData?.length)}
          source="Yahoo Finance"
          subtitle="Recent executive and director stock transactions filed with the SEC."
        />

        <section className="rounded-panel border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-md shadow-xs hover:border-border transition-all">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border/60 text-[11px] font-mono uppercase font-bold text-muted-foreground/80">
                <tr>
                  <th className="pb-3 font-semibold">{t("common.name")}</th>
                  <th className="pb-3 font-semibold">{t("common.date")}</th>
                  <th className="pb-3 font-semibold">{t("common.type")}</th>
                  <th className="pb-3 font-semibold">{t("common.shares")}</th>
                  <th className="pb-3 font-semibold">
                    {t("common.pricePerShare")}
                  </th>
                  <th className="pb-3 font-semibold">{t("common.value")}</th>
                  <th className="pb-3 text-right font-semibold">
                    {t("common.marketClose")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-xs">
                {insiders.slice(0, 8).map((trade, index) => {
                  const isPurchase = trade.category === "purchase";
                  const isSale = trade.category === "sale";
                  const price =
                    trade.price !== null
                      ? `$${trade.price.toFixed(2)}`
                      : trade.priceLow !== null && trade.priceHigh !== null
                        ? `$${trade.priceLow.toFixed(2)}–$${trade.priceHigh.toFixed(2)}`
                        : "—";
                  return (
                    <tr
                      key={`${trade.name}-${trade.date}-${index}`}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="py-3 font-medium font-sans">
                        <span className="font-semibold text-foreground text-sm">
                          {trade.name}
                        </span>
                        {trade.relation && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {trade.relation}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {trade.date}
                      </td>
                      <td
                        className="max-w-[190px] py-3"
                        title={trade.transactionText}
                      >
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-bold border ${
                            isPurchase
                              ? "bg-chart-positive/10 text-chart-positive border-chart-positive/30"
                              : isSale
                                ? "bg-chart-negative/10 text-chart-negative border-chart-negative/30"
                                : "bg-muted text-muted-foreground border-border/50"
                          }`}
                        >
                          {trade.typeLabel}
                        </span>
                        {trade.isAdministrative && (
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {t("insider.administrative")}
                          </span>
                        )}
                      </td>
                      <td
                        className="py-3 font-mono tabular-nums text-foreground font-semibold"
                        dir="ltr"
                      >
                        {trade.shares.toLocaleString()}{" "}
                        <span className="text-[11px] text-muted-foreground/70 font-normal">
                          {t("common.sharesUnit")}
                        </span>
                      </td>
                      <td
                        className="py-3 font-mono tabular-nums text-foreground"
                        dir="ltr"
                        title={
                          trade.price !== null
                            ? t("insider.reportedPrice")
                            : t("insider.priceUnavailable")
                        }
                      >
                        {price}
                      </td>
                      <td
                        className="py-3 font-mono tabular-nums text-foreground font-bold"
                        dir="ltr"
                      >
                        {formatMoneyCompact(trade.value) ?? "—"}
                      </td>
                      <td
                        className="py-3 text-right font-mono tabular-nums text-muted-foreground"
                        dir="ltr"
                        title={t("insider.marketCloseContext")}
                      >
                        {trade.marketClosePrice !== null
                          ? `$${trade.marketClosePrice.toFixed(2)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                {insiders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-6 text-center text-xs text-muted-foreground italic font-sans"
                    >
                      No insider transaction records found for {ticker}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 3. Company Profile Section */}
      <div>
        <SectionHeading
          icon={Building2}
          title={t("insights.companyProfile")}
          live={Boolean(overviewData || screenerAsset)}
          source="FMP / FinanceDatabase"
          subtitle="Corporate background, leadership team, and regulatory identifiers."
        />

        <section
          className="rounded-panel border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-md shadow-xs hover:border-border transition-all flex flex-col justify-between"
          aria-labelledby="company-profile-card-title"
        >
          {/* Internal Card Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-border/50 mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <h3
                id="company-profile-card-title"
                className="font-display text-xs font-bold uppercase tracking-[0.14em] text-foreground flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>Corporate Summary & Executive Details</span>
              </h3>
            </div>
            {overviewData?.exchangeFullName && (
              <span className="text-[10px] font-mono text-muted-foreground/80 px-2 py-0.5 rounded bg-muted/60 border border-border/40 uppercase">
                {overviewData.exchangeFullName}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Summary Description */}
            <div className="lg:col-span-7">
              {description && (
                <div>
                  <p
                    id="company-description"
                    className={`text-sm sm:text-[14.5px] leading-relaxed text-muted-foreground/90 font-normal ${
                      descriptionExpanded ? "" : "line-clamp-6"
                    }`}
                  >
                    {description}
                  </p>
                  {canExpandDescription && (
                    <button
                      type="button"
                      className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
                      onClick={() => setDescriptionExpanded((value) => !value)}
                      aria-expanded={descriptionExpanded}
                      aria-controls="company-description"
                    >
                      <span>
                        {descriptionExpanded
                          ? t("insights.showLess")
                          : t("insights.showMore")}
                      </span>
                      {descriptionExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: Key Facts & Fundamental Metrics */}
            <div className="lg:col-span-5 space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
                <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-primary/30 transition-colors">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                    {t("insights.ceo")}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-foreground truncate"
                    title={ceo ?? "—"}
                  >
                    {ceo ?? "—"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-primary/30 transition-colors">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                    {t("insights.sector")}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-foreground truncate"
                    title={sector ?? "—"}
                  >
                    {sector ?? "—"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-primary/30 transition-colors">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                    {t("insights.industry")}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-foreground truncate"
                    title={industry ?? "—"}
                  >
                    {industry ?? "—"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-primary/30 transition-colors">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                    {t("insights.beta")}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-foreground tabular-nums"
                    dir="ltr"
                  >
                    {beta !== null ? beta.toFixed(2) : "—"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-1 hover:border-primary/30 transition-colors col-span-2 sm:col-span-1 lg:col-span-2">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
                    {t("insights.piotroskiScore")}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-chart-positive tabular-nums"
                    dir="ltr"
                  >
                    {piotroskiScore !== null
                      ? `${piotroskiScore} / 9 (Financial Health)`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Identifiers Chip Strip */}
              <div className="border-t border-border/50 pt-3">
                <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground/70">
                  {t("insights.idChips")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {overviewData?.cik && (
                    <Chip label={t("insights.cik")} value={overviewData.cik} />
                  )}
                  {overviewData?.isin && (
                    <Chip
                      label={t("insights.isin")}
                      value={overviewData.isin}
                    />
                  )}
                  {overviewData?.cusip && (
                    <Chip
                      label={t("insights.cusip")}
                      value={overviewData.cusip}
                    />
                  )}
                  {overviewData?.ipoDate && (
                    <Chip
                      label={t("insights.ipoDate")}
                      value={overviewData.ipoDate}
                    />
                  )}
                  {website && (
                    <Chip
                      label={t("insights.website")}
                      value={website
                        .replace(/^https?:\/\//i, "")
                        .replace(/\/+$/, "")}
                      href={website}
                    />
                  )}
                  {overviewData?.lastDividend !== undefined && (
                    <Chip
                      label={t("insights.lastDividend")}
                      value={`$${overviewData.lastDividend.toFixed(2)}`}
                      tone="success"
                    />
                  )}
                  {overviewData?.isActivelyTrading !== undefined && (
                    <FlagBadge
                      label={t("insights.activeStatus")}
                      tone={
                        overviewData.isActivelyTrading ? "success" : "danger"
                      }
                      value={
                        overviewData.isActivelyTrading
                          ? t("insights.yes")
                          : t("insights.no")
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  tone = "normal",
  href,
}: {
  label: string;
  value: string;
  tone?: "success" | "normal";
  href?: string;
}) {
  const content = (
    <>
      <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span
        className={
          tone === "success"
            ? "truncate font-mono text-xs font-bold text-chart-positive"
            : "truncate font-mono text-xs font-medium text-foreground"
        }
      >
        {value}
      </span>
      {href && (
        <ExternalLink className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2.5 py-1 text-xs transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-xs cursor-pointer"
        dir="ltr"
        title={`${label}: ${value}`}
      >
        {content}
      </a>
    );
  }

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2.5 py-1 text-xs"
      dir="ltr"
      title={`${label}: ${value}`}
    >
      {content}
    </span>
  );
}

function FlagBadge({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "danger";
  value: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-mono font-medium uppercase tracking-wider ${
        tone === "success"
          ? "border-chart-positive/30 bg-chart-positive/10 text-chart-positive"
          : "border-chart-negative/30 bg-chart-negative/10 text-chart-negative"
      }`}
    >
      <span className="text-[10px] font-bold opacity-75">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  live,
  source,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  live?: boolean;
  source?: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-xs">
            <Icon className="w-4 h-4" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-bold text-foreground tracking-tight">
            {title}
          </h2>
          {live && source && (
            <DataStatusBadge status="live" source={source} compact iconOnly />
          )}
        </div>
        {subtitle && (
          <p className="mt-1.5 text-xs text-muted-foreground/80">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function SkeletonHeader() {
  return (
    <div className="relative h-7 w-48 overflow-hidden rounded-[6px] bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-border/40 before:to-transparent" />
  );
}

function i18nInsiderCategory(
  t: (key: string) => string,
  category: InsiderTransactionCategory,
  fallback: string,
): string {
  switch (category) {
    case "purchase":
      return t("insider.type.P");
    case "sale":
      return t("insider.type.S");
    case "award":
      return t("insider.type.A");
    case "gift":
      return t("insider.type.G");
    case "optionExercise":
      return t("insider.type.M");
    case "withholding":
      return t("insider.type.F");
    case "disposal":
      return t("insider.type.D");
    case "optionGrant":
      return t("insider.type.X");
    case "conversion":
      return t("insider.type.C");
    default:
      return fallback || t("insider.type.other");
  }
}
