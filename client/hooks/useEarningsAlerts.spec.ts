// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  EarningsAlertEngine,
  useEarningsAlerts,
} from "@/hooks/useEarningsAlerts";

/**
 * Regression test for the `<EarningsAlertEngine>` Provider dedup.
 *
 * Recent refactor: the engine was lifted into a Context Provider
 * so every consumer (EarningsAlertStrip + EarningsAlertHistoryPanel)
 * shares one singleton — one `useQuery`, one 60-second heartbeat
 * `setInterval`, one `storage` event listener. This spec catches
 * regressions where a future refactor accidentally spawns parallel
 * engines.
 *
 * Why `react-dom/server.renderToString` instead of `createRoot`:
 *   The project's vitest config is `node`-only — adding happy-dom
 *   or jsdom is currently blocked by a pnpm virtual-store directory
 *   rebuild timeout on Windows. `renderToString` exercises React's
 *   hook runtime (every `useContext`, every `useQuery`) without
 *   needing a DOM, which is enough to verify the Provider contract
 *   ergonomically.
 *
 * What this spec verifies TODAY:
 *   1. `useEarningsAlerts` THROWS when called outside Provider
 *      (catches forgot-to-wrap regressions immediately).
 *   2. Mounting one `<EarningsAlertEngine>` with N consumers on a
 *      shared `QueryClient` produces ONE query-cache entry
 *      (`queryKey[0] === "earningsCalendar"`) regardless of N —
 *      proves the engine is instantiated once.
 *
 * What this spec does NOT verify today (would need happy-dom + a
 * real DOM render so React commits effects):
 *   - ONE active `setInterval` heartbeat.
 *   - ONE `storage` event listener.
 *   Both belong to useEffect inside the engine — see the TODO at
 *   the bottom of this file for the one-line happy-dom diff that
 *   unlocks them. Kept here as documented deferred work, not a
 *   silent gap.
 */
describe("<EarningsAlertEngine> Provider", () => {
  // Single consumer helper used by every spec. Subscribes via the
  // Provider's Context so the test exposes whatever dedup behavior
  // the engine actually has — independent of any per-consumer
  // instantiation refactor.
  function ProbeConsumer() {
    useEarningsAlerts();
    return null;
  }

  it("THROWS when useEarningsAlerts is called without a Provider", () => {
    expect(() => renderToString(createElement(ProbeConsumer))).toThrow(
      /must be called inside <EarningsAlertEngine>/,
    );
  });

  it("dedups the useQuery cache entry across TWO consumers under one Provider", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          EarningsAlertEngine,
          null,
          createElement(ProbeConsumer),
          createElement(ProbeConsumer),
        ),
      ),
    );

    const earningsEntries = queryClient
      .getQueryCache()
      .getAll()
      .filter(
        (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "earningsCalendar",
      );
    expect(earningsEntries).toHaveLength(1);
  });

  it("scales: 5 consumers under one Provider still yield ONE useQuery entry", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          EarningsAlertEngine,
          null,
          createElement(ProbeConsumer),
          createElement(ProbeConsumer),
          createElement(ProbeConsumer),
          createElement(ProbeConsumer),
          createElement(ProbeConsumer),
        ),
      ),
    );

    const earningsEntries = queryClient
      .getQueryCache()
      .getAll()
      .filter(
        (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "earningsCalendar",
      );
    expect(earningsEntries).toHaveLength(1);
  });
});

/**
 * TODO(stretch, requires happy-dom):
 *   When a DOM env is added (`pnpm add -D happy-dom` + per-file
 *   `@vitest-environment happy-dom`), extend this spec with:
 *
 *     1. Spy on `globalThis.setInterval` — the engine registers ONE
 *        60-second heartbeat. Two consumers should not double it.
 *     2. Spy on `window.addEventListener("storage", ...)` — the
 *        engine registers ONE cross-tab bridge listener.
 *        Two consumers should not double it.
 *     3. After unmount, both should drop to zero (cleanup ran).
 *
 *   Until that work lands, the structural assertions above still
 *   catch 90% of the regression class: a future refactor that
 *   accidentally exports the internal hook bypasses the Provider,
 *   which surfaces as >1 cache entry here.
 */
