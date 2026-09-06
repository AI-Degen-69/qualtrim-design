import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Renders a language switcher for English and Hebrew.
 */
export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const currentLang = lang;

  const switchLanguage = (lng: "en" | "he") => {
    setLang(lng);
  };

  return (
    <div className="flex items-center justify-center p-1 bg-secondary/60 rounded-full border border-border shadow-inner overflow-hidden rtl:flex-row-reverse relative">
      <button
        onClick={() => switchLanguage("en")}
        className={cn(
          "relative flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-full transition-all duration-300 z-10",
          currentLang === "en"
            ? "text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        dir="ltr"
        aria-pressed={currentLang === "en"}
      >
        <span className="text-base">🇺🇸</span>
        <span className="font-semibold tracking-wide">US</span>
      </button>

      <button
        onClick={() => switchLanguage("he")}
        className={cn(
          "relative flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-full transition-all duration-300 z-10",
          currentLang === "he"
            ? "text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        dir="rtl"
        aria-pressed={currentLang === "he"}
      >
        <span className="text-base">🇮🇱</span>
        <span className="font-semibold tracking-wide">עב</span>
      </button>

      {/* Animated Pill Background */}
      <div
        className={cn(
          "absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-full transition-transform duration-300 ease-out z-0",
          currentLang === "en"
            ? "translate-x-0 rtl:translate-x-full left-1 rtl:left-auto rtl:right-1"
            : "translate-x-full rtl:translate-x-0 left-1 rtl:left-auto rtl:right-1",
        )}
      />
    </div>
  );
}

export default LanguageSwitcher;
