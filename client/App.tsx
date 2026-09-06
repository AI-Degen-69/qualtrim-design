import "./global.css";

import { Component, ReactNode, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { WatchlistsProvider } from "@/hooks/useWatchlists";
import { EarningsAlertEngine } from "@/hooks/useEarningsAlerts";
import TopBar from "@/components/TopBar";
import ProviderHealthIndicator from "@/components/ProviderHealthIndicator";
import { RouteFallback } from "@/components/Skeleton";
import NotFound from "./pages/NotFound";

// ----------------------------------------------------------------------------
// Route-level code splitting (Workstream 3)
// ----------------------------------------------------------------------------
// Every page is loaded via React.lazy so the initial bundle only carries the
// app shell. Each feature route's JS chunk streams in on first navigation,
// which keeps chart/portfolio dependencies out of the home/insights load.
// The existing per-route <ErrorBoundary> wraps the lazy elements below, so a
// failed chunk fetch or render crash surfaces the recoverable error screen
// instead of white-screening the app.
const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
// Dev-only translator QA route. The lazy() call itself is gated behind
// import.meta.env.DEV so the I18nDebug chunk is excluded from production
// builds entirely (Vite statically replaces the flag with `false` and the
// dead branch is dropped) — a top-level lazy() here would emit an unused
// chunk that prod never references.
const I18nDebug = import.meta.env.DEV
  ? lazy(() => import("./pages/I18nDebug"))
  : null;
const Insights = lazy(() => import("./pages/Insights"));
const Charts = lazy(() => import("./pages/Charts"));
const Screener = lazy(() => import("./pages/Screener"));
const Watchlists = lazy(() => import("./pages/Watchlists"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Portfolios = lazy(() => import("./pages/Portfolios"));
// NotFound stays a static import: it's the catch-all error route, so it must
// render immediately on unknown URLs (no loading flash) and survive a chunk
// fetch failure without replacing the 404 with the error boundary. At ~0.7 kB
// it costs nothing meaningful in the entry chunk.

// Shared Suspense fallback for lazy routes — localized, keyboard-safe, and
// layout-stable (the shell stays mounted; only the routed content suspends).
const withFallback = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

// ----------------------------------------------------------------------------
// QueryClient — shared defaults (Phase 0 — C4)
// ----------------------------------------------------------------------------
// staleTime  = 60s      → don't refetch immediately on every render
// gcTime     = 5min    → keep cache in memory for back-nav
// retry      = 1        → ONE retry, not infinite
// refetchOnWindowFocus  → off; explicit refetchInterval on quote hooks is enough
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ----------------------------------------------------------------------------
// SplAppLayout + SplashPage
// ----------------------------------------------------------------------------
const AppLayout = () => (
  // `<WatchlistsProvider>` lifts the module-level watchlists subscription
  // into the React tree so every consumer (page, alert engine, ...) reads
  // the same snapshot via `useSyncExternalStore`. Mounted at AppLayout-
  // level so it wraps ALL pages and never re-mounts on route change.
  //
  // `<EarningsAlertEngine>` (nested INSIDE the Watchlists Provider) runs
  // the engine work exactly once for the whole layout — one TanStack
  // Query subscription, one 60s heartbeat, one storage listener — and
  // exposes the resulting `EngineData` via Context. The Strip and
  // HistoryPanel mounted in TopBar are reading through this Provider;
  // no second subscription layer.
  <WatchlistsProvider>
    <EarningsAlertEngine>
      <div className="flex h-screen bg-background dark overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <TopBar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <ProviderHealthIndicator />
        </div>
      </div>
    </EarningsAlertEngine>
  </WatchlistsProvider>
);

// ----------------------------------------------------------------------------
// ErrorBoundary — single route crashes shouldn't white-screen the app (Phase 0 — C3)
// ----------------------------------------------------------------------------
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}
interface ErrorBoundaryState {
  error: Error | null;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-8 mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-chart-negative mb-3">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error.message || "Unknown rendering error"}
          </p>
          <button
            className="px-4 py-2 rounded-[6px] bg-primary hover:opacity-90 text-primary-foreground text-sm transition-opacity"
            onClick={() => {
              // A full reload is the only safe recovery from a render crash —
              // no point partial-patching the React tree. The new mount re-runs
              // getDerivedStateFromError with a fresh error=null state.
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------------------------------
// App
/**
 * Configures shared application providers and renders the application's routes.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route element={<AppLayout />}>
                <Route
                  path="/"
                  element={
                    <ErrorBoundary>{withFallback(<Landing />)}</ErrorBoundary>
                  }
                />
                <Route
                  path="/portfolios"
                  element={
                    <ErrorBoundary>
                      {withFallback(<Portfolios />)}
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/stock/:ticker"
                  element={
                    <ErrorBoundary>{withFallback(<Index />)}</ErrorBoundary>
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <ErrorBoundary>{withFallback(<Insights />)}</ErrorBoundary>
                  }
                />
                <Route
                  path="/watchlists"
                  element={
                    <ErrorBoundary>
                      {withFallback(<Watchlists />)}
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/charts"
                  element={
                    <ErrorBoundary>{withFallback(<Charts />)}</ErrorBoundary>
                  }
                />
                <Route
                  path="/screener"
                  element={
                    <ErrorBoundary>{withFallback(<Screener />)}</ErrorBoundary>
                  }
                />
                <Route
                  path="/earnings"
                  element={
                    <ErrorBoundary>{withFallback(<Earnings />)}</ErrorBoundary>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                {/* Dev-only `/i18n` translator QA route — gated so the bundle
                    is excluded from production builds via Vite tree-shake on
                    the dead branch. Tree-shake succeeds because `import.meta.env.DEV`
                    is statically replaced with `false` at build time. */}
                {import.meta.env.DEV && I18nDebug && (
                  <Route
                    path="/i18n"
                    element={
                      <ErrorBoundary>
                        {withFallback(<I18nDebug />)}
                      </ErrorBoundary>
                    }
                  />
                )}
              </Route>
              <Route
                path="*"
                element={
                  <ErrorBoundary>{withFallback(<NotFound />)}</ErrorBoundary>
                }
              />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
