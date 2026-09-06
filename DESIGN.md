## <!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

name: Vantage
description: An observatory for company fundamentals — quiet, precise, luminous.
colors:
night-sky: "hsl(250 45% 4%)"
deep-field: "hsl(250 30% 9%)"
graticule: "hsl(250 20% 16%)"
starlight-white: "hsl(210 20% 95%)"
dust: "hsl(220 10% 60%)"
starlight-gold: "hsl(42 65% 70%)"
aurora-green: "hsl(155 55% 50%)"
ember-red: "hsl(6 70% 58%)"
nebula-blue: "hsl(200 60% 60%)"
deep-space-violet: "hsl(265 45% 62%)"
typography:
display:
fontFamily: "Inter, -apple-system, sans-serif"
fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
fontWeight: 700
lineHeight: 1.1
letterSpacing: "-0.01em"
body:
fontFamily: "Inter, -apple-system, sans-serif"
fontSize: "0.9375rem"
fontWeight: 400
lineHeight: 1.5
letterSpacing: "normal"
label:
fontFamily: "Inter, -apple-system, sans-serif"
fontSize: "0.75rem"
fontWeight: 600
lineHeight: 1.3
letterSpacing: "0.04em"
readout:
fontFamily: "JetBrains Mono, ui-monospace, monospace"
fontSize: "1rem"
fontWeight: 600
lineHeight: 1.2
letterSpacing: "-0.01em"
rounded:
panel: "2px"
control: "6px"
controlLg: "10px"
full: "9999px"
spacing:
xs: "4px"
sm: "8px"
md: "16px"
lg: "24px"
xl: "40px"

---

# Design System: Vantage

## Overview

**Creative North Star: "The Observatory Light-Curve"**

Vantage is not a live ticker — it's an instrument for reading a company's history. The chosen world treats every fundamental metric the way an astronomer treats a variable star: not a single number, but a record charted over time, read for its pattern rather than its instant value. The page opens quiet — ticker, last price, the day's percent change, small and unhurried, never the star of the page. Scrolling down, financial ratios settle into precise, gridded panels grouped by category (Valuation, Profitability, Liquidity, Growth), and every historical metric gets its own light-curve chart: a thin luminous line tracing up to five years of data against a fine graticule on a deep night-sky ground. Expanding a chart is a deliberate, satisfying motion — it grows, and a "period analysis" panel slides in with the 1-year, 3-year, and 5-year CAGR, styled like a calculated readout rather than a decorative stat.

This is a redesign: the prior "Bloomberg Terminal" look (amber-on-black, hardcoded slate-gray chrome, no unifying logic between nav and data surfaces) is retired as evidence, not preserved. The new world keeps the page structure the incumbent already got right — quiet price header, categorized ratio panels, per-metric expandable historical charts with quarterly/annual toggle — and rebuilds everything visual underneath it.

Explicit rejections: no live-tick price theater (no flashing numbers, no re-ranking rows chasing the second-by-second price — that is a different product's job); no neon-on-black cliché (the accent is a desaturated warm "starlight," never a saturated neon glow); no gamified/consumer-fintech energy (no confetti, no streaks, no badge collecting).

**Key Characteristics:**

- Quiet by default; luminous only where a metric's data-line or an active state earns it
- Deep, cool-tinted near-black ground (not pure black, not warm/purple "trading-floor" black)
- Every historical metric is a chart first, a table second
- Tabular/mono numerals for anything read as a precise value (prices, CAGR, ratios); humanist sans for everything read as prose or a label
- Two-tier corner language: panels stay nearly square (instrument-panel flatness), interactive controls get a soft radius

## Colors

A cool, deep night-sky palette carries the ground; one warm, desaturated gold is the only accent, reserved for the data itself and active states — not for structural chrome.

### Primary

- **Starlight Gold** (`hsl(42 65% 70%)`): the sole accent — light-curve emphasis lines, active/expanded states, the primary CTA. Deliberately desaturated and lightened versus a neon amber; it should read as glow, not warning light. **The One Light Rule.** Starlight Gold appears on ≤15% of any given screen; a page where gold is everywhere has lost the rule's whole point.

### Neutral

- **Night Sky** (`hsl(250 45% 4%)`): base background. Cool blue-violet undertone, never pure black and never the old purple-black "Bloomberg" cast.
- **Deep Field** (`hsl(250 30% 9%)`): card/panel surfaces — one step off the ground, not a separate material.
- **Graticule** (`hsl(250 20% 16%)`): borders and chart gridlines — literally the instrument's ruled grid, reused as the UI's border color so panels feel like plotted instruments, not boxes.
- **Starlight White** (`hsl(210 20% 95%)`): primary text.
- **Dust** (`hsl(220 10% 60%)`): secondary/muted text, axis labels, timestamps.

### Semantic (financial)

- **Aurora Green** (`hsl(155 55% 50%)`) — gains, positive change. A soft phosphor green, not saturated stoplight green.
- **Ember Red** (`hsl(6 70% 58%)`) — losses, negative change. A warm coral-red, not pure alarm red.

### Chart roles (multi-series)

- **Nebula Blue** (`hsl(200 60% 60%)`) and **Deep Space Violet** (`hsl(265 45% 62%)`) round out the palette for sector/comparison charts needing more than gain/loss/accent.

### Named Rules

**The Instrument, Not Alarm Rule.** Ember Red and Aurora Green are reserved strictly for gain/loss semantics. They never appear as decoration, never as a generic "error" or "success" color for unrelated UI — a form validation error uses a distinct, unambiguous red-orange that a user would never mistake for "this stock is down."

## Typography

**Display/Body Font:** Inter (with `-apple-system, sans-serif` fallback)
**Readout Font:** JetBrains Mono (with `ui-monospace, monospace` fallback)

**Character:** A workhorse humanist grotesk carries prose, labels, and navigation — legible, quiet, no personality of its own. JetBrains Mono takes over the instant a value needs to be read precisely: prices, tickers, percentages, CAGR, ratio figures. The pairing itself is the "instrument panel" cue — prose vs. readout, always visually distinct.

### Hierarchy

- **Display** (700, `clamp(1.5rem, 3vw, 2.25rem)`, 1.1): company name / page-level titles only.
- **Label** (600, 0.75rem, 0.04em tracking, uppercase): category headers (VALUATION, GROWTH), chart axis labels, section eyebrows.
- **Body** (400, 0.9375rem, 1.5): descriptions, empty states, help text.
- **Readout** (600, 1rem monospace, 1.2): price, day % change, every number inside an expanded chart's period-analysis panel, table figures. Tabular figures (`font-variant-numeric: tabular-nums`) required wherever numbers stack in a column.

### Named Rules

**The Readout Rule.** Any number the user is meant to compare against another number (a column of prices, a table of ratios, a CAGR trio) renders in JetBrains Mono with tabular figures. A sans-serif proportional number in a data column is always a bug, not a style choice.

## Layout

Single-column reading order per the incumbent structure, preserved: quiet header → categorized ratio panels (responsive grid, 2-4 columns by breakpoint) → stacked per-metric chart panels, one per row on mobile, up to 2 across on wide desktop. Generous vertical rhythm between sections (`spacing.xl` = 40px) so the page reads as a sequence of distinct "readings," not a dense wall; tighter rhythm (`spacing.sm`/`md`) within a single panel's own contents.

## Elevation & Depth

Flat by default, glow on signal. Panels are flat fields distinguished only by the Deep Field background step and a 1px Graticule border — no drop shadows as a default surface treatment (an instrument panel doesn't float). Glow is a deliberate, sparse device: the active light-curve line itself carries a soft outer glow, an expanded chart's border glows faintly while open, and a live/fresh-data indicator gets the same treatment. Glow that isn't attached to a specific piece of live or selected data is decoration, and decoration is not the point.

### Named Rules

**The Earned Glow Rule.** Glow, blur, or luminous treatment must be attached to a specific signal (this line is the data, this panel is open, this value just updated) — never applied as ambient chrome to a static container.

## Shapes

Two-tier corner language. Structural panels (cards, chart containers, category groups) use `rounded.panel` (2px) — almost square, reinforcing the "instrument," not "app card," read. Interactive controls (buttons, inputs, toggles, the quarterly/annual switch) use `rounded.control` (6px) or `rounded.controlLg` (10px) for larger touch targets — soft enough to read as touchable. Tags, category chips, and status pills use `rounded.full`.

## Do's and Don'ts

### Do:

- **Do** treat every historical fundamental as a chart first; a bare number without its multi-year context is an incomplete answer to what the user came to ask.
- **Do** reserve Starlight Gold for the data and active states (The One Light Rule); structural chrome (nav, headers, borders) stays neutral.
- **Do** render every comparable/stacked number in JetBrains Mono with tabular figures (The Readout Rule).
- **Do** attach glow only to a specific live/selected/active signal (The Earned Glow Rule).

### Don't:

- **Don't** build any live-updating price-ticker theater (flashing digits, rows re-ranking by the second) — that isn't this product's job; price is a quiet header fact, not the show.
- **Don't** default to a saturated neon accent on near-black; the calibration this world explicitly avoids is generic "AI dark mode" glow-on-black.
- **Don't** carry over the old hardcoded `slate-*`/`blue-600` chrome colors from the retired Bloomberg-terminal look — every surface uses the tokens above.
- **Don't** apply drop shadows to panels as a default; depth comes from the Deep Field/Graticule step and earned glow only.

## Component Architecture: Tables & Data Surfaces

Tables are a **display surface**, not a data-management layer. The observatory reads fundamentals; it does not edit them in a grid.

### Stack

- **shadcn/ui `Table` primitive** (`client/components/ui/table.tsx`) is the only table component. It inherits the design tokens above (Deep Field ground, Graticule borders, Readout mono for figures) — one consistent system.
- **Tailwind** for layout/styling; **Radix UI** for interactive primitives. No Material Design / MUI in the project.
- Charts via **Recharts**; dates via **react-day-picker**. Both already cover what MUI X Charts / Pickers would duplicate.

### Data flow (server-driven)

- Sorting, filtering, and pagination happen at the **API layer**, not the client grid. `Screener.tsx` holds `sortBy` / `sortDir` / `page` state and passes it into `useScreenerFilter({ sort_by, sort_dir, ... }, limit, offset)`; the `<table>` only renders the returned page.
- This is the correct architecture for a fundamentals screener: data is large and server-paginated, so client-side grid state would re-fetch or hold stale slices.

### Decision: no client-side grid library

- **MUI X Data Grid** — rejected. It ships Material Design, a second design system that fights the custom "observatory" tokens, and would re-implement the existing `useScreenerFilter` server flow. Regressive.
- **TanStack Table** — not adopted. It earns its place only for _in-memory_ interactivity (column resize/pin/reorder, row grouping, inline edit) on data already in the browser. vantage's tables are server-paginated, so TanStack buys nothing the API doesn't already provide.
- **Trigger to revisit:** a feature that manipulates fetched data _in-memory_ after load (e.g. an editable/reorderable/resizable Watchlist, or a client-side comparison grid across already-loaded tickers). Until then, shadcn `Table` + server-driven state stands.

### Named Rules

**The Server Grid Rule.** Table sorting/filtering/pagination is delegated to the API (`useScreenerFilter` and siblings); the `<table>` renders the returned page. Do not introduce a client-side grid state manager for server-paginated data.
**The One System Rule.** All tables use the shadcn `Table` primitive styled by these tokens. Do not import a second UI kit (MUI, Ant, Chakra) for tables or any other surface — it fractures the design system and the build.
