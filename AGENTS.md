# vantage

## GBrain search guidance

This repo is indexed in gbrain as source `projects-vantage`, pinned by `.gbrain-source` in
the repo root, so the commands below route here without a `--source` flag.

**Prefer gbrain over Grep for structural questions** — who calls a symbol, where
it is defined, what it references, what it calls. One query beats opening every
file:

```bash
gbrain code-def <symbol>       # where it is defined
gbrain code-refs <symbol>      # every reference
gbrain code-callers <symbol>   # who calls it
gbrain code-callees <symbol>   # what it calls
gbrain query "<question>"      # semantic search over this repo
```

**Read `status` before trusting an empty result.** `count: 0` means "nothing
found" only when `status` is `ready`. `not_built` or `indexing` means the call
graph is still being built and the empty list proves nothing — fall back to Grep
and say that is what you did.

**Use Grep instead** for literal text, config values, comments, and anything
added since the last sync. The index refreshes on every commit (a `post-commit`
hook) and nightly at 03:00; uncommitted work in progress is not in it. To
refresh now:

```bash
gbrain sync --source projects-vantage --strategy code
```
