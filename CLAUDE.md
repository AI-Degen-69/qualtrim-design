# Vantage

Stock research and valuation app. Vite + React 18 SPA on the client, Express 5 on the server, deployed to Vercel.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml`, `packageManager: pnpm@10.14.0`). Note the `build` script shells out to `npm run` internally.

| Task | Command |
|------|---------|
| Dev server | `pnpm dev` (vite) |
| Build (client + server) | `pnpm build` |
| Build client only | `pnpm build:client` |
| Build server only | `pnpm build:server` |
| Start built server | `pnpm start` (`node dist/server/node-build.mjs`) |
| Test | `pnpm test` (`vitest --run`) |
| Typecheck | `pnpm typecheck` (`tsc`, noEmit) |
| Format | `pnpm format.fix` (prettier) |
| FMP data audit | `pnpm fmp:audit` (`tsx scripts/fmp-audit.ts`) |

There is no lint script; prettier + `tsc` are the only static gates.

## Layout

- `client/` — React SPA (`App.tsx`, `pages/`, `components/`, `hooks/`, `lib/`, `locales/`). Aliased as `@/*`.
- `server/` — Express app (`index.ts`, `routes/`, `services/`, `helpers/`), built to `dist/server/node-build.mjs`.
- `api/` — Vercel serverless entry (`[[...slug]].ts` → `_router.js`) with colocated `*.spec.ts` route tests.
- `shared/` — code used by both client and server (`api.ts`, sector/provider helpers). Aliased as `@shared/*`.
- `scripts/` — one-off data and audit scripts run via `tsx`.
- `data/`, `public/`, `docs/` — static data, static assets, project docs.

## Conventions

- TypeScript is **non-strict** (`strict: false`, `strictNullChecks: false`, `noImplicitAny: false`). Do not assume null-safety from types; check at runtime.
- Tests are colocated `*.spec.ts` next to the code, run by vitest with `happy-dom`.
- UI is Tailwind + Radix primitives (shadcn-style, see `components.json`) with `framer-motion` for animation and `recharts` for charts.
- Server-side caching uses `node-cache`; local persistence uses `better-sqlite3`.
- Secrets live in `.env` / `.env.local`; `.env.example` lists required keys. Never commit real keys.

## Deploy

- **Vercel**: `vercel.json` builds with `vite build`, serves `dist/spa`, rewrites all non-`/api/` paths to `index.html`.

## Agent config

ECC rules are installed project-local under `.claude/rules/ecc/` (managed by the ECC installer; state in `.claude/ecc/install-state.json`). Relevant sets for this repo: `common/`, `typescript/`, `react/`, `web/`. ECC agents, skills, and commands come from the globally installed ECC plugin, not from this repo.
