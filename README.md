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
- The latest recorded five-hour and weekly limit measurements for Claude Code and Codex, their history, reset boundaries, and configurable notifications.
- Current or historically recorded model prices, with local pricing snapshots that can be compared for the same period.

Closing the browser tab leaves the idle server running. Use **Exit App Completely** to stop it.

## Settings

| Setting | What to know |
| --- | --- |
| **Data Sources** | Default local folders are scanned automatically. Add other absolute folders, including accessible UNC or WSL paths on Windows. `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `HERMES_HOME` change the respective default roots. |
| **Automatic Scanning** | Defaults to 30 seconds; choose 10–3,600 seconds. Scanning pauses when the app is out of focus and refreshes when you return. You can also refresh manually. |
| **Limit Notifications** | Thresholds default to 80% and 95%, with at most one notification per threshold and reset window. Limit history is kept for 90 days by default. |
| **Keep Claude Limits Current** | The optional status-line bridge below records updated Claude limit measurements. Without it, Atlas uses the latest values Claude Code has stored locally, which may be old. |
| **Update Model Prices** | Update prices manually from LiteLLM, models.dev, and OpenRouter. No session data is sent. Manual prices take precedence; bundled prices remain a fallback. There is no background price download. |
| **Backup & Restore** | Export a local `.json.gz` backup of app data and settings. Import validates and previews it, can remap missing source folders, and saves a recovery snapshot before restoration. Original logs and startup configuration are not included. Backups contain personal paths and session titles. |
| **Theme** | Choose a color theme and light, dark, or system mode. |
| **Animated Background** | Choose a motif, turn animation off, or set an FPS cap (30, 60, 120, 144, or monitor maximum; default 60). Reduced Motion shows a static motif. Choices are stored in this browser; the interface still works without WebGL. |
| **Start with System** | Enable or disable autostart without administrator rights. Windows uses the user's Startup folder; Linux uses an XDG autostart entry. After moving Atlas or Node, disable and re-enable autostart. |

### Local data and privacy

| Tool | Default sources |
| --- | --- |
| Claude Code | `~/.claude/projects` including subagents; limit data from `~/.claude.json` and the optional bridge files under `~/.claude` |
| Codex | `~/.codex/sessions`, `~/.codex/archived_sessions`, and the read-only `state_*.sqlite` metadata database |
| Hermes Agent | `~/.hermes/state.db` and profile databases under `~/.hermes/profiles` on Linux; `%LOCALAPPDATA%/hermes` by default on Windows |

`~` is the current user's home directory. Session logs and source databases are read-only. Atlas discards prompt and response text while parsing and does not access credentials. Its local cache stores usage, session metadata, and limit history under `.local/states/<id>/`. Browser data is not collected. A backup preserves the imported history even if the original logs are no longer available.

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

### Server configuration

The server listens on `127.0.0.1:4317` by default. Set `ATLAS_PORT` to change the port, `ATLAS_DATA_DIR` for another writable app-data folder, or `ATLAS_HOST` for a specific IPv4 address on a trusted network. `ATLAS_HOST=0.0.0.0` is not allowed. Other devices that can reach the selected address can view analytics and change settings, so restrict access with your firewall.

Environment variables must be available to the process that starts Atlas. For persistent autostart settings, configure them in the Windows user environment or the Linux desktop session environment; a terminal-only Linux export will not carry over to the next login. Linux autostart uses `~/.config/autostart/session-atlas.desktop` by default, or `$XDG_CONFIG_HOME/autostart` when set.

## Counting and limitations

- Costs are **API-equivalent estimates in USD, not subscription invoices**. Unknown prices remain unknown; custom prices can be entered in Settings. Historical prices reflect Atlas's locally recorded snapshots, which do not prove earlier provider prices.
- Subscription limits are account-wide measurements, not values reconstructed from session logs. Old or missing measurements appear as unknown. Rolling five-hour and seven-day costs are separate estimates and do not match subscription billing windows.
- Context timelines show only values present in the logs. Deleted source logs remain in the imported history; removing a data source excludes it from analytics.
- Claude responses are deduplicated by message ID. Codex response records take precedence over cumulative snapshots when available. Hermes usage comes from local SQLite counters and represents usage measurements rather than individual model responses.

## Share or develop

Run `npm run package` to create `dist/Session-Atlas-portable.zip`. It contains program files, **not** your cache, sessions, or personal settings. Extract it into a writable folder and use `Start.cmd` on Windows or `Start.sh` on Linux. Do not share the whole working directory with `.local`.

Run `npm test` for parser, counting, cache, and restoration tests. The server uses built-in Node functionality and the UI uses HTML, CSS, and JavaScript. For a synthetic scan benchmark, run `node scripts/benchmark-scan.mjs`; details are in [Scan Performance](docs/scan-performance.md).
