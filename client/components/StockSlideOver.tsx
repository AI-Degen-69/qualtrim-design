import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import TickerLogo from "@/components/TickerLogo";
import { useStockData } from "@/hooks/useStockData";

interface StockSlideOverProps {
  ticker: string;
  isOpen: boolean;
  onClose: () => void;
}

export function StockSlideOver({
  ticker,
  isOpen,
  onClose,
}: StockSlideOverProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: stockData, isLoading, isError } = useStockData(ticker);
  const [expandedStat, setExpandedStat] = useState<number | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap — focus the panel when it opens
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const quote = stockData?.quote;
  const quickStats = stockData?.quickStats ?? [];
  const ratios = stockData?.ratios;
  const priceChange = stockData?.priceChange;
  const profile = stockData?.profile;

  const handleViewFullPage = () => {
    onClose();
    navigate(`/stock/${ticker}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-card border-l border-border shadow-2xl z-50 overflow-y-auto transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Fixed Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <TickerLogo ticker={ticker} size="sm" />
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {stockData?.name || ticker}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ticker}
                  {stockData?.exchange ? ` · ${stockData.exchange}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
              <p className="text-xs text-muted-foreground">Loading data...</p>
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <p className="text-chart-negative text-sm mb-1">
                Failed to load data
              </p>
              <p className="text-xs text-muted-foreground">
                The API may be rate-limited
              </p>
            </div>
          ) : (
            <>
              {/* Price Section */}
              {quote && (
                <div className="bg-secondary/30 rounded-lg p-4 border border-border">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-3xl font-bold font-mono tabular-nums text-foreground">
                        $
                        {quote.price != null
                          ? typeof quote.price === "number"
                            ? quote.price.toFixed(2)
                            : quote.price
                          : "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {quote.change != null && (
                          <span
                            className={`text-sm font-semibold font-mono tabular-nums ${quote.change >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                          >
                            {quote.change >= 0 ? "+" : ""}
                            {typeof quote.change === "number"
                              ? quote.change.toFixed(2)
                              : quote.change}
                          </span>
                        )}
                        {quote.changePercent != null && (
                          <span
                            className={`text-xs font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded ${
                              quote.changePercent >= 0
                                ? "bg-chart-positive/15 text-chart-positive"
                                : "bg-chart-negative/15 text-chart-negative"
                            }`}
                          >
                            {quote.changePercent >= 0 ? "+" : ""}
                            {typeof quote.changePercent === "number"
                              ? quote.changePercent.toFixed(2)
                              : quote.changePercent}
                            %
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {quote.afterHoursPrice != null && (
                        <div className="text-xs text-muted-foreground">
                          <span className="text-xs">After hrs:</span>
                          <span
                            className={`ml-1 font-medium font-mono tabular-nums ${quote.afterHoursChange != null && quote.afterHoursChange >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                          >
                            ${quote.afterHoursPrice.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price Changes */}
                  {priceChange && (
                    <div className="mt-3 pt-3 border-t border-border flex gap-4 text-xs">
                      {priceChange.ytd != null && (
                        <div>
                          <span className="text-muted-foreground">YTD </span>
                          <span
                            className={`font-mono tabular-nums ${priceChange.ytd >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                          >
                            {priceChange.ytd >= 0 ? "+" : ""}
                            {priceChange.ytd.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {priceChange["1Y"] != null && (
                        <div>
                          <span className="text-muted-foreground">1Y </span>
                          <span
                            className={`font-mono tabular-nums ${priceChange["1Y"] >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                          >
                            {priceChange["1Y"] >= 0 ? "+" : ""}
                            {priceChange["1Y"].toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {priceChange["3Y"] != null && (
                        <div>
                          <span className="text-muted-foreground">3Y </span>
                          <span
                            className={`font-mono tabular-nums ${priceChange["3Y"] >= 0 ? "text-chart-positive" : "text-chart-negative"}`}
                          >
                            {priceChange["3Y"] >= 0 ? "+" : ""}
                            {priceChange["3Y"].toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Key Ratios */}
              {ratios && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Key Ratios
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "P/E (TTM)", value: ratios.peTtm, suffix: "x" },
                      { label: "P/E (Fwd)", value: ratios.peNtm, suffix: "x" },
                      { label: "P/B", value: ratios.priceToBook, suffix: "x" },
                      { label: "P/S", value: ratios.priceToSales, suffix: "x" },
                      {
                        label: "EV/EBITDA",
                        value: ratios.evToEbitda,
                        suffix: "x",
                      },
                      {
                        label: "Div Yield",
                        value: ratios.dividendYield,
                        suffix: "%",
                      },
                      { label: "PEG", value: ratios.pegRatio, suffix: "" },
                      { label: "Beta", value: ratios.beta, suffix: "" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="bg-secondary/30 rounded px-3 py-2 border border-border"
                      >
                        <p className="text-xs text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs font-semibold font-mono tabular-nums text-foreground">
                          {item.value != null
                            ? `${item.value.toFixed(2)}${item.suffix}`
                            : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              {quickStats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Quick Stats
                  </p>
                  <div className="space-y-1">
                    {quickStats.map((stat, idx) => (
                      <div key={idx}>
                        <button
                          onClick={() =>
                            setExpandedStat(expandedStat === idx ? null : idx)
                          }
                          className="w-full flex items-center justify-between bg-secondary/30 rounded px-3 py-2 border border-border hover:bg-secondary/50 transition-colors"
                        >
                          <div className="text-left">
                            <p className="text-xs text-muted-foreground">
                              {stat.label}
                            </p>
                            <p className="text-xs font-semibold text-foreground">
                              {stat.value}
                            </p>
                          </div>
                          {stat.details && (
                            <ChevronDown
                              className={`w-3 h-3 text-muted-foreground transition-transform ${expandedStat === idx ? "rotate-180" : ""}`}
                            />
                          )}
                        </button>
                        {expandedStat === idx && stat.details && (
                          <div className="ml-3 mt-0.5 space-y-0.5 bg-secondary/20 rounded px-3 py-2 border border-border">
                            {stat.details.map((d, di) => (
                              <div
                                key={di}
                                className="flex justify-between text-xs"
                              >
                                <span className="text-muted-foreground">
                                  {d.label}
                                </span>
                                <span className="text-foreground font-medium">
                                  {d.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Company Description (truncated) */}
              {profile?.description && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    About
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {profile.description}
                  </p>
                </div>
              )}

              {/* View Full Page Link */}
              <button
                onClick={handleViewFullPage}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View full stock page
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default StockSlideOver;
