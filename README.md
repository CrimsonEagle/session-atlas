# Session Atlas

Session Atlas shows local usage for **Claude Code, OpenAI Codex, and Hermes Agent** on **Windows and Linux**. Run it on the computer that holds the session data. Analytics work offline; only a manual price update needs internet access. Requires **Node.js 22.13 or newer** and a current browser. No `npm install`, API key, or build step is needed.

## Start

| System | Start the portable app |
| --- | --- |
| Windows | Double-click `Start.cmd`. |
| Linux | Run `./Start.sh` from the extracted ZIP, or `sh Start.sh` if the executable bit was lost. |

The launcher starts the server in the background and opens **http://127.0.0.1:4317**. Starting it again opens the running app. On Linux, browser opening uses `xdg-open`; open the address manually if it is unavailable. For a visible terminal, run `npm start`. You can also run `node launcher.mjs`, or `node server.mjs --open` to start the server and open the browser.

## What it shows

- Token use, API-equivalent costs, session details, and timelines by day, week, or month; compare two periods and filter by tool, repository, model, or date.
- An activity calendar, linked parent and subagent sessions, context timelines where logs provide them, and CSV exports of filtered usage events.
- **Hermes Agent** usage is read from local SQLite counters in `state.db`: per-model token counts, reported or estimated costs, session titles, and parent/subagent links. Reset boundaries start independent conversations; proven compression continuations are combined into one session with a segment count, and actual delegated workers remain underneath it. This also applies when a Telegram conversation is continued in Desktop. Original Hermes data and per-segment usage stay unchanged. **OpenRouter** spending is taken from the billing provider recorded on those sessions and appears as its own recorded-spending card.
- The overview gives each visible usage-limit or explicit API billing provider (for example OpenRouter) its own card. Up to two cards sit beside the chart; any others appear as separate cards below it. Hiding a tool in Settings removes its entire limit card and its sessions from the billing data; hiding OpenRouter removes only its recorded-spending card without changing usage data or totals. The remaining cards fill the available positions. Five-hour and weekly usage bars remain visible without opening details; unavailable readings show **unknown**, not a zero-percent bar. Billing cards show locally recorded costs, not account credit or subscription limits, and their model breakdown respects the current date range and filters. Historical measurements, reset boundaries, and configurable notifications remain available.
- Current or historically recorded model prices, with local pricing snapshots that can be compared for the same period.

Closing the browser tab leaves the idle server running. Use **Exit App Completely** to stop it.

## Settings

| Setting | What to know |
| --- | --- |
| **Data Sources** | Default local folders are scanned automatically. Add other absolute folders, including accessible UNC or WSL paths on Windows. `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `HERMES_HOME` change the respective default roots. |
| **Automatic Scanning** | Defaults to 30 seconds; choose 10–3,600 seconds. Scanning pauses when the app is out of focus and refreshes when you return. You can also refresh manually. |
| **Visible Providers** | Per provider: hiding an AI tool removes its usage data, chart series, filters, and limit card; hiding OpenRouter hides only its recorded-spending card while totals and usage data stay unchanged. Saved with the settings. |
| **Limit Notifications** | Thresholds default to 80% and 95%, with at most one notification per threshold and reset window. Limit history is kept for 90 days by default. |
| **Hermes Limits** | On Linux, install the separate user timer once (below), then start or stop it in **Settings → Limits**. Atlas itself needs no autostart. |
| **Keep Claude Limits Current** | The optional status-line bridge below records updated Claude limit measurements. Without it, Atlas uses the latest values Claude Code has stored locally, which may be old. Code sessions in Claude Desktop do not run a status line; Cowork tasks supply readings automatically, because limits apply to the whole account. |
| **Update Model Prices** | Update prices manually from LiteLLM, models.dev, and OpenRouter. No session data is sent. Manual prices take precedence; bundled prices remain a fallback. There is no background price download. |
| **Backup & Restore** | Export a local `.json.gz` backup of app data and settings. Import validates and previews it, can remap missing source folders, and saves a recovery snapshot before restoration. Original logs and startup configuration are not included. Backups contain personal paths and session titles. |
| **Theme** | Choose a color theme and light, dark, or system mode. |
| **Animated Background** | Choose a motif, turn animation off, or set an FPS cap (30, 60, 120, 144, or monitor maximum; default 60). Reduced Motion shows a static motif. Choices are stored in this browser; the interface still works without WebGL. |
| **Start with System** | Enable or disable autostart without administrator rights. Windows uses the user's Startup folder; Linux uses an XDG autostart entry. After moving Atlas or Node, disable and re-enable autostart. |

### Local data and privacy

| Tool | Default sources |
| --- | --- |
| Claude Code | `~/.claude/projects` including subagents; limit data from `~/.claude.json` and the optional bridge files under `~/.claude` |
| Claude Cowork (Claude Desktop) | `local-agent-mode-sessions` in Claude Desktop's data folder (`%APPDATA%\Claude` on Windows, `~/Library/Application Support/Claude` on macOS, `~/.config/Claude` on Linux): task transcripts count as Claude Code sessions, titles come from the task metadata, and `rate_limit_event` entries in `audit.jsonl` provide account-wide Claude limit readings. Only limit values, titles, and transcript IDs are taken from these files; uploads, outputs, mounted folders, and plugin caches are not read |
| Codex | `~/.codex/sessions`, `~/.codex/archived_sessions`, and the read-only `state_*.sqlite` metadata database |
| Hermes Agent | `~/.hermes/state.db` and profile databases under `~/.hermes/profiles` on Linux; `%LOCALAPPDATA%/hermes` by default on Windows |
| OpenRouter | No separate files: spending comes from the billing provider recorded in Hermes sessions; model prices come from the public OpenRouter models endpoint during a manual price update |

`~` is the current user's home directory. Session logs and source databases are read-only. Atlas discards prompt and response text while parsing and does not access credentials. Its local cache stores usage, session metadata, and limit history under `.local/states/<id>/`. While logs only grow, the cache is rewritten at most every two minutes and on exit; limit changes are saved immediately, and any unsaved log progress is simply read again after an unexpected stop. Browser data is not collected. A backup preserves the imported history even if the original logs are no longer available.

### Optional Claude Code status-line bridge

Claude Code does not refresh its locally cached limit values after every response. To keep the five-hour and weekly measurements current, add a `statusLine` entry to **Claude Code's** `settings.json`, using the absolute path to your Atlas folder:

Windows:

```json
"statusLine": { "type": "command", "command": "node \"C:\\Path\\to\\Session-Atlas\\bridge\\atlas-statusline.mjs\"" }
```

Linux:

```json
"statusLine": { "type": "command", "command": "node '/home/you/Session-Atlas/bridge/atlas-statusline.mjs'" }
```

If you already have a status-line command, put it after the bridge with `--` so it still receives the original input; `--quiet` runs the bridge without producing status-line output. The bridge stores only limit measurements. **Settings → Keep Claude Limits Current** shows its expected path and status. Measurements recorded by the bridge can be imported when Atlas next runs.

### Hermes Codex subscription limit collector (Linux)

With Hermes's OpenAI-Codex login available to your user, run this **once** from the Atlas folder (no sudo):

```sh
node scripts/install-hermes-collector.mjs
```

This installs two fixed `systemd --user` units and reloads the user manager; **it does not start or enable the timer**. In **Settings → Limits → Collect Hermes Limits**, press **Start collection** to enable the five-minute timer and make the first measurement immediately. **Stop collection** disables it; history remains. No Atlas autostart is required: the timer operates separately while Atlas is closed. For unattended collection across logouts, enable systemd user lingering for your account (typically `loginctl enable-linger $USER`, which may need administrative permission). Re-run the installer if Atlas, Node, Hermes, or `HERMES_HOME` moves. Logs are under `journalctl --user -u session-atlas-hermes-usage.service`; the timer is `session-atlas-hermes-usage.timer`.

The collector uses `hermes usage --provider openai-codex --json` and stores only the plan, two percentages, reset timestamps and measurement time under `$HERMES_HOME` (normally `~/.hermes`). **If nothing changes, it writes no measurement, snapshot, or inbox file**, and Atlas does not rewrite its limit cache. Errors never become zeroes. Each changed value is spooled until Atlas next scans, then imported into the normal limit history and backup. A repeated value after an intervening change counts as a new transition. Historic readings start with the first sample; they cannot be reconstructed from tokens. Values describe the **whole Codex subscription account**, including usage outside Hermes. Atlas shows the same historical API-equivalent cost-limit extrapolation as for Codex and Claude, using only locally recorded Hermes sessions routed through the Codex provider. OpenRouter and other Hermes costs are excluded. Activity elsewhere and approximate timestamps of cumulative Hermes usage counters can skew this comparison; it is not a provider-reported monetary limit or a subscription invoice. The last saved value remains visible even if the collector stops or a later poll fails. After its reset passes, the live card says unknown until a new reading arrives; history remains intact. The local Atlas UI is unauthenticated on LAN: any allowed LAN client can start or stop this timer.

### Server configuration

The server listens on `127.0.0.1:4317` by default. Set `ATLAS_PORT` to change the port, `ATLAS_DATA_DIR` for another writable app-data folder, or `ATLAS_HOST` for a specific IPv4 address on a trusted network. `ATLAS_HOST=0.0.0.0` is not allowed. Other devices that can reach the selected address can view analytics and change settings, so restrict access with your firewall.

Environment variables must be available to the process that starts Atlas. For persistent autostart settings, configure them in the Windows user environment or the Linux desktop session environment; a terminal-only Linux export will not carry over to the next login. Linux autostart uses `~/.config/autostart/session-atlas.desktop` by default, or `$XDG_CONFIG_HOME/autostart` when set.

## Counting and limitations

- Costs are **API-equivalent estimates in USD, not subscription invoices**. Unknown prices remain unknown; custom prices can be entered in Settings. Historical prices reflect Atlas's locally recorded snapshots, which do not prove earlier provider prices.
- Subscription limits are account-wide measurements, not values reconstructed from session logs. Saved measurements remain visible regardless of age; missing measurements or windows whose reset has passed appear as unknown. Rolling five-hour and seven-day costs are separate estimates and do not match subscription billing windows.
- The tooltip shows when a limit was last measured. An old timestamp alone does not invalidate a value; if no reset is reported, the saved value remains visible until replaced.
- Context timelines show only values present in the logs. Deleted source logs remain in the imported history; removing a data source excludes it from analytics.
- Claude responses are deduplicated by message ID, also across session files: a response repeated in a copied or forked transcript counts once, for the earliest session. Where Claude Code stores its own running cost estimate (`cost-state`), the session details compare it with Atlas's estimate for the whole session including subagents. Codex response records take precedence over cumulative snapshots when available. Hermes usage comes from local SQLite counters and represents usage measurements rather than individual model responses.

## Share or develop

Run `npm run package` to create `dist/Session-Atlas-portable.zip`. It contains program files, **not** your cache, sessions, or personal settings. Extract it into a writable folder and use `Start.cmd` on Windows or `Start.sh` on Linux. Do not share the whole working directory with `.local`.

Run `npm test` for parser, counting, cache, and restoration tests. The server uses built-in Node functionality and the UI uses HTML, CSS, and JavaScript. For a synthetic scan benchmark, run `node scripts/benchmark-scan.mjs`; details are in [Scan Performance](docs/scan-performance.md).
