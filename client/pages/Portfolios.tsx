import { useI18n } from "@/lib/i18n";
import Portfolio from "@/components/Portfolio";
import PageHeader from "@/components/PageHeader";

/**
 * Renders the portfolios page with a unified page header and portfolio analytics.
 */
export default function Portfolios() {
  const { t } = useI18n();

  return (
    <div className="w-full bg-background dark min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <PageHeader
          eyebrow={t("nav.portfolios")}
          title={t("portfolio.title")}
          description={t("portfolio.description")}
        />

        <Portfolio />
      </div>
    </div>
  );
}
