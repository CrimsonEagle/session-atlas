# Session Atlas

Portable, local usage analytics for **Claude Code and OpenAI Codex**. No installer, npm installation, API keys, or external fonts. Analytics work offline; only the optional pricing update requires internet access. Requires **Node.js 22 or newer** and a current browser. Developed for Windows.

## Getting Started

**Double-click `Start.cmd`.** The Node process starts in the background and opens the interface at **http://127.0.0.1:4317**. Starting it again opens the existing app. The brief startup window closes automatically.

Alternatively, run this in the project folder:

```powershell
node launcher.mjs
```

Or use a visible terminal for diagnostics, then open the address in your browser:

```powershell
npm start
```

`npm install` is not required. Use `node server.mjs --open` to open the browser when starting from a terminal as well. If a corporate policy blocks Node, PowerShell, or opening browsers, the app does not bypass that policy. Running `node server.mjs` and opening the browser manually does not require PowerShell.

## Features

- Live overview, stacked timeline charts for tokens and costs, and daily, weekly, or monthly aggregation.
- Direct comparison of two periods with metrics, a relative timeline, and contributions by project, model, or AI tool. Available comparison periods are the preceding period of equal length, previous calendar week, previous calendar month, and a custom period.
- Activity calendar for the last twelve months or a calendar year, selectable by tokens, API-equivalent cost, or model responses. Selecting a day restricts the table and details to the same local calendar day.
- Recursive session trees for Claude Code and Codex parent sessions with explicitly associated subagents or review agents. Hierarchy is visible in the session list, session details, and expandable task view; self usage stays separate from usage including child agents, while uncertain or missing relationships remain visible instead of being estimated.
- Session names are shown as the primary label throughout the interface, with the session ID as secondary context. Claude Code names come from the session log; Codex uses the explicit name from its local state database and falls back to its generated title. If no name is available, the session ID becomes the label. CSV exports include both fields.
- Sessions, repositories, working directories, AI tools, and models as grouping options, plus search and combined tool, repository, model, and date filters.
- Session details with model responses, branch, working directory, input/output/cache/reasoning tokens, and a context timeline. Model or context-window changes, data gaps, and explicitly logged compactions are marked; missing window sizes do not produce invented percentages.
- Five-hour and weekly limits for both tools, including plan, measurement time, and reset: Codex from the latest logged `rate_limits`; Claude Code from `cachedUsageUtilization` in `.claude.json` and optionally from the status-line bridge. The newest measurement and its source are shown. Expired measurements appear as unknown, not 0%.
- Persistent limit history with visible reset boundaries and sources, plus configurable threshold notifications. Defaults: 80% and 95%, at most once per threshold and reset window; retention defaults to 90 days.
- Dedicated cost-limit view in the limit details: for every historical measurement, known API costs since the start of the reported five-hour or weekly window are divided by usage and extrapolated to 100%. The view can show either every individual measurement or exactly one arithmetic mean per reset window; both estimate series, the latest value, median, range, and pricing coverage are visible. Usage of 0%, missing resets, and entirely unknown prices do not produce invented values.
- Rolling costs for the last five hours or seven days for both tools. These are **not identical billing windows** and are not a substitute for percentage-based subscription limits.
- Manual refresh and automatic scanning (default 30 seconds, configurable from 10 to 3,600 seconds).
- Losing focus, switching browser tabs, or minimizing the window stops further automatic scans. Returning triggers an immediate refresh. A scan already in progress is allowed to finish. An additional open, focused app window may continue to trigger scans. The server has no background polling timer and no file watchers.
- CSV export of filtered usage events with precise values, compatible with German Excel. Cell contents are protected against formula execution. Grouping changes only the view; exports remain at event level.
- Choice between current and historically recorded pricing. Immutable pricing snapshots, effective dates, sources, and rule versions remain locally auditable; two snapshots can be compared for the same period. CSV exports include valuation mode, pricing-snapshot reference, and rule version.
- Complete local gzip backup with a manifest and SHA-256 checksums, plus controlled restoration. Size, session count, and categories are displayed before import; missing source folders can be remapped. A recovery snapshot is created automatically before every restore.
- Enable or disable Windows startup in the settings. A shortcut is created in the current user's Startup folder; no administrator rights, service, or installation are required.
- “Exit App Completely” stops the Node process. Closing the browser tab leaves the idle server running.

The animated background uses the locally bundled **PixiJS 8.21.0 (MIT)** with WebGL: four selectable motifs (the original flowing data streams, orbital pulses, aurora ribbons, and a constellation network), a selectable FPS cap (30, 60, 120, 144, or monitor maximum; default 60), synchronization with the display, 48 particles (24 on narrow displays), rendering resolution up to 4K (8.29 million pixels), up to 2× pixel density for HiDPI displays, and WebGL antialiasing. Particle size and speed remain independent of pixel density. No blur filters are used; the scene requests a power-efficient graphics adapter. Switching tabs or minimizing cancels the animation frame; there is no animation timer, and PixiJS system/shared tickers remain disabled. On return, animation resumes without a time jump. “Reduced Motion” displays a static motif. Under **Settings → Animated Background**, you can enable or disable the animation, choose a motif, and select the FPS cap. These choices take effect immediately and are stored in this browser. Monitor maximum renders on every animation frame supplied by the browser; the actual frame rate depends on the display, browser, and available performance. If WebGL is unavailable, the app remains usable and shows a notice in the settings. Actual CPU and GPU load depends on the device.

Background colors and motif previews follow all four color themes in light, dark, and system mode. Light mode uses deeper colors and less orbital glow; dark mode uses lighter accents. The scene is composed within the main content area, with orbital centers near its edges and a soft quiet zone around the heading and filters that follows scrolling and layout changes. Theme changes also repaint the static reduced-motion background.

## Data Sources and Privacy

These folders are read by default:

| Tool | Data source |
| --- | --- |
| Claude Code | `%USERPROFILE%\.claude\projects`, including `subagents`; limits additionally come from `%USERPROFILE%\.claude.json`, `%USERPROFILE%\.claude\session-atlas-limits.json`, and the bridge inbox `%USERPROFILE%\.claude\session-atlas-limit-inbox` |
| Codex | `%USERPROFILE%\.codex\sessions`, `archived_sessions`, and the read-only `state_*.sqlite` metadata database next to them |

`CLAUDE_CONFIG_DIR` and `CODEX_HOME` override the respective root directory on first launch. Additional absolute source folders can be added in the settings, including accessible UNC or WSL directories. Data on other computers or in the browser is not collected automatically.

Session logs, configuration files, and the Codex state database are **read-only**. Credentials are never accessed. Prompts and responses are discarded during parsing. From the Codex database, only the session ID, explicit name, and generated title are read. From `.claude.json`, only the plan, measurement time, and two limit windows are retained; the account identifier, project list, and prompt history are **not** cached. Claude Code invokes the optional status-line bridge when rendering the status line. It writes only the limit block to `session-atlas-limits.json` and, when a value changes, an immutable entry in `session-atlas-limit-inbox`; model, working directory, branch, session ID, and every other input field are discarded. After the server has committed these entries to its local cache, it removes exactly the imported inbox files. It never modifies session logs or Claude configuration. The local cache contains usage events, context samples, session IDs, metadata such as working directory, branch, and session name, and the limit history.

App data is stored in a versioned set under `.local/states/<id>/`; `.local/active-state.json` points atomically to the active set. It includes `usage-cache.json`, `settings.json`, `model-prices.json`, and `price-history.json`. Existing flat files are copied into an initial set on first launch. The server binds exclusively to `127.0.0.1`; foreign origins and changes without a local session token are rejected.

New file contents are processed from the last fully read line ending. Unchanged files are checked using their metadata and are not opened. For changed files, all previously imported content is verified with SHA-256 before new lines are processed; this also detects files rewritten while their size increased. Up to four files are processed concurrently. Invalid complete lines are skipped and counted; a final line still being written is completed during the next scan. Usage data from deleted source files remains available historically in the cache. Removed data sources are no longer included in analytics. For a complete reimport, exit the app and remove `.local/usage-cache.json`.

Git repositories are detected from their `.git` metadata, and worktrees are associated through `commondir`. Project folders that no longer exist remain available for analysis through their logged working directory.

### Keeping Claude Limits Current (Optional)

Claude Code writes `cachedUsageUtilization` only when it retrieves the values itself, not after every response. A measurement may therefore be several days old. The included bridge hooks into the documented status-line interface, refreshes the current snapshot on every render, and queues every changed measurement until Session Atlas has durably imported it. Session Atlas therefore does not need to be running while Claude Code is active. Add the following to the **Claude Code** `settings.json`:

```json
"statusLine": { "command": "node \"C:\\Path\\to\\Session-Atlas\\bridge\\atlas-statusline.mjs\"" }
```

If you already use a status line, place the existing command after the bridge. The bridge forwards the input unchanged and leaves output generation to that command:

```powershell
node "C:\Path\to\Session-Atlas\bridge\atlas-statusline.mjs" -- bash my-script.sh
```

With `--quiet`, it only writes the files and produces no output. `ATLAS_RATE_LIMIT_FILE` changes the snapshot destination; `ATLAS_RATE_LIMIT_INBOX` can override the sibling inbox directory. Unchanged percentages refresh the snapshot timestamp without creating redundant inbox entries. Each status-line render starts a short-lived Node process; the Claude Code setting `statusLine.refreshInterval` controls how often this happens. Errors are harmless: with invalid input, missing limit fields, or a follow-up command that cannot be started, the bridge writes nothing and exits with code 0 so the status line does not break. The app shows the expected path and current status under **Settings → Keep Claude Limits Current**.

## Counting and Known Limitations

### Updating Prices with the Button

Under **Settings → Update Model Prices → Update Prices**, the app downloads the public catalogs from [LiteLLM](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json) and [models.dev](https://models.dev/api.json). ccusage does not need to be installed. Only pricing files are downloaded; no session data is transmitted.

Prices are stored in the active local data set and loaded offline on the next launch. Manual prices take precedence over online prices; the bundled table remains available as a fallback for otherwise unknown models. Newer source fetches take precedence, with LiteLLM preferred when both are fetched at the same time. If one source fails, the other is used and a message is displayed; if both fail, existing prices are preserved. Fetch times and model counts appear next to the button. A fetch time is not a confirmed date on which provider prices changed.

Every effective price change creates an immutable local pricing snapshot with an effective date and rule version. “Current Prices” continues to value all events using the currently active snapshot. “Historically Recorded Prices” selects the most recently effective local snapshot for each event; times before the first snapshot remain explicitly unknown. A manually specified effective date can extend into the past, but it does not confirm the provider price at that time. The button updates standard token prices, not the program logic for fast modes or context surcharges. Missing required pricing categories remain unknown. There is no automatic background fetch.

### Backup and Restore

Under **Settings → Backup & Restore**, the app creates a compressed `.json.gz` backup. It contains the usage cache, settings, current prices, pricing history, and all other available local organizational data. Session tokens, startup configuration, and original logs are excluded. Paths and session titles are personal metadata and remain readable in the backup, so protect the file accordingly.

During import, the container version, allowed file types, compressed and uncompressed sizes, and every SHA-256 checksum are verified. Only then is the specific preview shown. A confirmed restore is written to a new data set and activated with an atomic pointer; concurrent scans and settings changes are blocked during the operation. The previous state is additionally preserved as a gzip recovery snapshot under `.local/recovery/`. Backed-up history works without the original logs. On another computer, missing log roots can optionally be remapped so a later scan updates the same sessions instead of importing duplicates.

Claude responses are deduplicated by message ID, and streaming chunks are merged. Claude cache tokens are additional input categories. Codex cache tokens are already included in `input_tokens` and are separated accordingly. Reasoning is part of the output and is not counted twice.

The context timeline is separate from cost and token totals. For Claude, a sample consists of the logged input, cache-read, and cache-write categories of a response; for Codex, it comes from `last_token_usage` and the explicitly supplied `model_context_window`. This is the response context observable in the respective log format, not a reconstruction of unlogged intermediate states. A decrease alone is not labeled as compaction. Old or removed logs without these fields continue to provide only the last known state or no timeline at all.

Newer Codex logs contain unique `token_usage_record` entries for each response. Within a file, these take precedence over the cumulative snapshots written alongside them. Older logs use the difference between `total_token_usage` values; unchanged repeated snapshots are not counted again. Inherited parent events from before the session started or with a different thread ID are excluded. Rare mixed logs in which response records exist for only part of the runtime may therefore report fewer usage events. Old logs without usage fields cannot provide retrospectively reconstructed token counts.

The app does not use undocumented account endpoints or OAuth credentials. Limits for both tools are **most recently measured**, account-wide values; without new activity in the respective tool, they do not become more current. Claude Code writes `cachedUsageUtilization` only when it retrieves the values itself—not after every response. A measurement may therefore be several days old; the optional status-line bridge keeps it current. An expired window is reported as unknown, not 0%. Percentage values are still not included in the session logs themselves. Multiple accounts under the same source folders cannot be reliably separated.

Costs are **API-equivalent values in USD, not subscription invoices**. Pricing snapshot: September 11, 2026. Cache TTL, known fast-mode rates, and known context surcharges are taken into account. Historical price changes, account discounts, regional differences, and additional server-tool fees may vary. Unknown models, such as internal review aliases, receive **no invented price**. Known cost totals are estimates and may be higher; entirely unknown costs display `–`. Add custom prices in the settings.

References: [ccusage data format](https://ccusage.com/guide/codex/), [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing). ccusage is a useful independent comparison option (`npx ccusage`) but is not a runtime dependency of this app.

## Sharing with Friends and Colleagues

```powershell
npm run package
```

This creates **`dist/Session-Atlas-portable.zip`** directly with Node and requires no other programs. The ZIP contains only program files, with **no cache, session data, or personal settings**. Share the ZIP, extract it into a writable folder, and start `Start.cmd`. Do not share the entire working directory, including `.local`.

The startup shortcut points to the current folder. After moving the app, disable and re-enable startup in the app. PowerShell is opened at startup with a hidden window and without changing the execution policy.

## Configuration and Development

```powershell
$env:ATLAS_PORT = '4318'
$env:ATLAS_DATA_DIR = 'C:\Path\to\Atlas-Data'
node server.mjs
```

The default port is 4317; `ATLAS_DATA_DIR` allows a different writable cache and settings folder. Process environment variables apply only to the corresponding launch; for persistent startup configuration, they must be available in the Windows user environment.

```powershell
npm test
```

Tests cover parsers, deduplication, cumulative resets, cache costs, incremental reads, restoration, malformed lines, and worktree association. The server uses built-in Node functionality; the UI uses HTML, CSS, and JavaScript. No build step is required.

Use `node scripts/benchmark-scan.mjs` to measure scan performance on synthetic logs without reading personal data or changing the application cache. The benchmark also verifies that session contents remain identical. The methodology, comparison results, and limitations are documented in [Scan Performance](docs/scan-performance.md).
