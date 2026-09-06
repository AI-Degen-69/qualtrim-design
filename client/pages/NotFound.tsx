import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Compass, ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * 404 Not Found error page styled with Vantage dark theme design tokens.
 */
export default function NotFound() {
  const { t } = useI18n();
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
          <Compass className="w-8 h-8 motion-safe:animate-pulse" />
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-primary/80">
            {t("notfound.title")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("notfound.description")}
          </h1>
          <p
            className="text-sm text-muted-foreground font-mono truncate px-2 py-1 rounded bg-muted/50"
            dir="ltr"
          >
            {location.pathname}
          </p>
        </div>
        <div>
          <Button asChild className="w-full">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{t("notfound.returnHome")}</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
