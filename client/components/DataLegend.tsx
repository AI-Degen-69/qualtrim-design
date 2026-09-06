import DataStatusBadge from "@/components/DataStatusBadge";
import { useI18n } from "@/lib/i18n";

interface DataLegendProps {
  className?: string;
  showDerived?: boolean;
}

/** A small honesty legend for pages that mix provider data and calculations. */
export default function DataLegend({
  className = "",
  showDerived = true,
}: DataLegendProps) {
  const { lang } = useI18n();
  return (
    <div
      dir={lang === "he" ? "rtl" : "ltr"}
      className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${className}`}
      aria-label={lang === "he" ? "מקרא סטטוס נתונים" : "Data status legend"}
    >
      <span className="mr-1 font-medium">
        {lang === "he" ? "נתונים:" : "Data:"}
      </span>
      <DataStatusBadge status="live" compact />
      <DataStatusBadge status="estimate" compact />
      <DataStatusBadge status="mock" compact />
      {showDerived && <DataStatusBadge status="derived" compact />}
    </div>
  );
}
