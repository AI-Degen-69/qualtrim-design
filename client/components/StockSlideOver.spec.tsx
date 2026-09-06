// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import * as React from "react";
import { StockSlideOver } from "./StockSlideOver";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

describe("StockSlideOver", () => {
  it("renders nothing when isOpen is false", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StockSlideOver ticker="AAPL" isOpen={false} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toBe("");
  });
});
