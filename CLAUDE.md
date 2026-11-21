# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Session Atlas: a local, offline web app that shows token usage, API-equivalent costs, and subscription limits for Claude Code (incl. Claude Desktop Cowork), OpenAI Codex, Hermes Agent (incl. OpenRouter spending), and Google Antigravity. It needs Node.js >= 22.13 and has **no dependencies, no `npm install`, and no build step**. It uses only Node built-ins on the server and plain ES modules in the browser. Vendored libraries live in `public/vendor/` (PixiJS).

## Commands

- `npm start` (= `node server.mjs`): run the server in the foreground on http://127.0.0.1:4317. Add `--open` to open the browser too.
- `node launcher.mjs` / `Start.cmd` / `Start.sh`: start a detached server and open the browser. If a server is already running with a different code revision, the launcher shuts it down and starts a new one.
- `npm test` (= `node --test`): run all tests in `test/*.test.mjs` with the built-in Node test runner.
- Run one file: `node --test test/parser.test.mjs`. Run one test by name: `node --test --test-name-pattern="pattern" test/parser.test.mjs`.
- `npm run package`: build `dist/Session-Atlas-portable.zip` from an explicit allowlist in `scripts/package.mjs`. **Add new top-level files or folders that must ship to that list.**
- `node scripts/benchmark-scan.mjs`: run the synthetic scan benchmark (see `docs/scan-performance.md`).

Env vars: `ATLAS_PORT`, `ATLAS_HOST` (a specific IPv4 address; `0.0.0.0` is rejected), `ATLAS_DATA_DIR` (default `.local/`), `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HERMES_HOME`, `ANTIGRAVITY_HOME`, `T3CODE_HOME`, `AGY_BIN`, `AGY_USAGE_POLL_MINUTES`, `AGY_USAGE_TIMEOUT_MS`.

## Architecture

**Server (`server.mjs`)**: a single `http.createServer` handler with manual `url.pathname` routing. GET endpoints are open: `/api/health`, `/api/bootstrap`, `/api/snapshot`, `/api/session-details`, `/api/limit-history`, `/api/export-data`, and static assets. Every POST requires the `X-Atlas-Token` header, whose token is random per process and handed out by `/api/bootstrap`. Requests with a foreign Host header or Origin are rejected, and a strict CSP is set, so no inline scripts are allowed. Static files are served only through the allowlist in `lib/static-assets.mjs`: fixed CSS and image paths, plus any `.js`/`.mjs` path under `public/`. A new CSS or image file must be added there. Settings are validated in `validateSettings`, so a new setting needs a default in `defaults`, a validation rule there, and handling in backup restore (`mappedRestoreFiles`) when it holds paths.

**Data state (`lib/state-set.mjs`)**: app data lives in versioned state directories `<dataRoot>/states/<id>/`. Each holds the `STATE_FILES` (`usage-cache.json`, `settings.json`, price files, …), and a pointer file selects the active one. Backup restore prepares a new state and switches the pointer, so the old state remains as a recovery fallback. `reloadRuntime` then swaps the in-memory `settings`, `store`, and `priceHistory`.

**Scanning (`lib/store.mjs` + `lib/parser.mjs`)**: `Store.scan()` incrementally reads JSONL logs. It stats cached files first, opens only changed ones, verifies the already-read prefix with SHA-256, and parses only appended bytes. It reads at most 4 files at a time and applies results in a fixed order so deduplication stays stable. `parser.mjs` `ingest()` turns log lines into per-file state (`events`/`records`, observed limits). Prompt and response text is discarded while parsing.
- `PARSER_VERSIONS` is tracked per tool. **Bump the version of the affected tool when parse output changes**, so only that tool's logs are read again.
- The cache format version lives in `Store.load`/`persist` (currently 7). `load` also accepts the older versions it lists.
- Claude responses are deduplicated across files by message ID. The earliest session owns a repeated response, tracked through an incremental index (`claudeEventFiles`/`claudeDuplicates`).
- The server persists pure log progress at most every 2 minutes (`persistIntervalMs`) and on shutdown. Limit and metadata changes are written immediately.
- Other sources: `hermes-local.mjs` (Hermes SQLite `state.db`, read-only), `hermes-conversations.mjs` (derived projection that merges compression segments into one conversation and keeps resets separate; raw cache counters and event IDs stay untouched), `cowork.mjs` (Claude Desktop Cowork transcripts and `audit.jsonl` rate-limit events), `antigravity.mjs` (Google Antigravity `brain/*` transcripts and read-only SQLite/pbtxt metadata across `~/.gemini/antigravity-cli`, `~/.gemini/antigravity`, and T3 Code `~/.t3/userdata/providers/antigravity/<hash>/antigravity-acp`), `antigravity-limits.mjs` (background and on-demand `agy -p /usage --output-format json` 5h/weekly quota polling across all Antigravity model groups), `claude-limits.mjs` (`~/.claude.json` and the status-line bridge files), `limit-history.mjs`, `session-names.mjs`.
- `Store.snapshot(settings, opts)` builds the payload the UI uses: sessions with priced events, limits, and stats.

**Pricing**: `lib/pricing.mjs` holds bundled USD-per-million-token rates `[input, cachedInput, output, cacheWrite5m?, cacheWrite1h?]`, plus family-wide rules (fast-mode factors, GPT long-context and priority rules). Unknown models stay unpriced; never guess prices. When changing prices or rules, update `priceDate` and **`PRICING_RULE_VERSION`**. At startup, a changed rate table is recorded as a new snapshot in `lib/price-history.mjs`, which powers "historical" pricing mode. Effective rates are `{...bundled, ...remote (price-sync.mjs: LiteLLM/models.dev/OpenRouter), ...user overrides}`.

**Runtime revision (`lib/runtime-revision.mjs`)**: a hash of `server.mjs` and `lib/*.mjs`. The launcher uses it to detect a stale running server. Frontend-only changes need only a browser reload. Server or lib changes need the server restarted (re-running the launcher does this).

**Frontend (`public/`)**: plain ES modules with no framework. `app.js` is the orchestrator: state, rendering through HTML template strings with `esc()`, and polling (`polling.js`). Feature modules (`charts.js`, `analytics-core.js`, `details.js`, `comparison.js`, `usage-overview.js`, `limit-history.js`, `tasks.js`, …) mostly export pure functions that return HTML strings or data, and `test/*.test.mjs` imports them directly under Node. `tools.js` defines the per-tool metadata (`TOOL_DEFINITIONS`).

**Bridges and collectors**: `bridge/atlas-statusline.mjs` is a Claude Code `statusLine` command that records limit readings for Atlas to import. `bridge/atlas-claude.mjs` wraps headless `claude -p … --output-format stream-json --verbose` runs, passes the CLI's I/O and exit status through unchanged, and stores only the window utilization and reset from `rate_limit_event`s in the same import files. `bridge/hermes-usage.mjs` is a Linux `systemd --user` timer job. `scripts/install-hermes-collector.mjs` installs it, and `lib/hermes-collector-service.mjs` lets the UI start and stop it. The collector writes only changed values to an inbox that Atlas imports on its next scan.

## Conventions

- **German is the source language.** User-facing strings, including server error messages and HTML templates, are written in German. `public/i18n.js` maps German phrases to English. **Add the English translation to `phrases` (or its pattern rules for dynamic sentences) whenever you add or change a UI string.** No test checks that every string has a translation.
- Code style is compact: one-space indentation, many statements per line, few comments. Comments explain *why*. Match this style rather than reformatting.
- Session logs and source databases are strictly read-only, and errors or missing readings must never turn into zeroes (show "unknown").
- Tests that start the server (`test/server.test.mjs`) run `server.mjs` with a temp `ATLAS_DATA_DIR` and a free port. Follow the same pattern and never touch `.local/`.
- Commit messages: an English imperative summary plus a bullet-list body.
