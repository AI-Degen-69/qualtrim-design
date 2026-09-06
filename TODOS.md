# TODOS

## Verify whether client/locales/*/translation.json is used (P3, S)
- **What:** Grep for imports of `client/locales/en/translation.json` / `he/translation.json`; delete if dead, wire up if intended.
- **Why:** Candidate 2's card flagged the `locales/` dir as possibly unused; the i18n provider currently serves the inline dictionaries in `client/lib/i18n/`. Dead locale files mislead contributors about where translations live.
- **Effort:** S (human ~30min / CC ~5min). **Depends on:** nothing.

## Land one prettier normalization commit (P2, S)
- **What:** `.gitattributes` (`* text=auto eol=lf`) and `.prettierignore` are in place, so EOL churn is gone and prettier no longer scans agent/tool dirs. What remains is real formatting drift: `npx prettier --list-different .` reports 238 source files. Land them as one mechanical commit that touches nothing else.
- **Why:** Until that commit lands, any `pnpm format.fix` still buries a real diff under hundreds of reformatted files.
- **Effort:** S (human ~30min / CC ~10min). **Depends on:** nothing — do it on a quiet branch with no other PRs open.
- **Note:** the index was already LF; only the working tree was CRLF via `core.autocrlf=true`. `git add --renormalize .` produced no changes, so no history rewrite is needed.

## Install codex CLI for dual-voice reviews (P3, S)
- **What:** `npm install -g @openai/codex` + `codex login`.
- **Why:** autoplan/CEO reviews degrade to single-reviewer mode without it; cross-model consensus is the main missing signal in this run.
- **Effort:** S. **Depends on:** nothing.
