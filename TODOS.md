# TODOS

## Verify whether client/locales/\*/translation.json is used (P3, S)

- **What:** Grep for imports of `client/locales/en/translation.json` / `he/translation.json`; delete if dead, wire up if intended.
- **Why:** Candidate 2's card flagged the `locales/` dir as possibly unused; the i18n provider currently serves the inline dictionaries in `client/lib/i18n/`. Dead locale files mislead contributors about where translations live.
- **Effort:** S (human ~30min / CC ~5min). **Depends on:** nothing.


## Install codex CLI for dual-voice reviews (P3, S)

- **What:** `npm install -g @openai/codex` + `codex login`.
- **Why:** autoplan/CEO reviews degrade to single-reviewer mode without it; cross-model consensus is the main missing signal in this run.
- **Effort:** S. **Depends on:** nothing.
