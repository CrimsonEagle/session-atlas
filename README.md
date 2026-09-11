# Session Atlas

Portable, lokale Nutzungsanalyse für **Claude Code und OpenAI Codex**. Ohne Installer, npm-Abhängigkeiten, API-Schlüssel oder externe Schriftarten. Die Auswertung funktioniert offline; nur der optionale Preisabruf benötigt Internet. Benötigt **Node.js 22 oder neuer** und einen aktuellen Browser. Für Windows entwickelt.

## Starten

**`Start.cmd` doppelklicken.** Der Node-Prozess startet im Hintergrund und öffnet die Oberfläche unter **http://127.0.0.1:4317**. Erneutes Starten öffnet die bestehende App. Das kurze Startfenster schließt sich wieder.

Alternativ im Projektordner:

```powershell
node launcher.mjs
```

Oder mit sichtbarem Terminal für Diagnose (anschließend die Adresse im Browser öffnen):

```powershell
npm start
```

`npm install` ist nicht nötig. Mit `node server.mjs --open` lässt sich der Browser auch beim Terminalstart öffnen. Wenn eine Firmenrichtlinie Node, PowerShell oder das Öffnen von Browsern blockiert, umgeht die App diese Richtlinie nicht. `node server.mjs` mit manuellem Browseraufruf benötigt keine PowerShell.

## Funktionen

- Live-Übersicht, gestapelte Verlaufsdiagramme für Tokens/Kosten, Tages-/Wochen-/Monatsaggregation.
- Sessions, Repositories, Arbeitsordner, KI-Tools und Modelle als Gruppierungen; Suche und kombinierte Filter; eigene Datumsbereiche.
- Sessiondetails mit Modellantworten, Branch, Arbeitsordner, Kontextstand, Input-/Output-/Cache-/Reasoning-Tokens.
- Codex-5h-/Wochenlimits aus den letzten protokollierten `rate_limits`, inklusive Messzeitpunkt und Reset. Abgelaufene Messwerte erscheinen als unbekannt, nicht als 0 %.
- Rollierende Kosten der letzten 5 Stunden / 7 Tage für beide Tools. Diese sind **kein identisches Abrechnungsfenster** und kein Ersatz für prozentuale Abolimits.
- Manuelles Aktualisieren und automatischer Scan (Standard 30 s, einstellbar 10–3600 s).
- Fokusverlust, anderer Browsertab oder minimiertes Fenster stoppen weitere automatische Scans. Bei Rückkehr sofortige Aktualisierung. Ein schon laufender Scan darf zu Ende laufen. Ein zusätzlich geöffnetes, fokussiertes App-Fenster kann weiterhin Scans auslösen. Der Server hat keinen Hintergrund-Polling-Timer und keine Dateiwatcher.
- CSV-Export der gefilterten Nutzungsereignisse mit präzisen Werten, kompatibel mit deutschem Excel. Zellinhalte werden gegen Formelausführung abgesichert. Gruppierung verändert nur die Ansicht; der Export bleibt auf Ereignisebene.
- Windows-Autostart in den Einstellungen aktivieren/deaktivieren. Es wird eine Verknüpfung im Autostartordner des aktuellen Nutzers erstellt; keine Administratorrechte, kein Dienst, keine Installation.
- „App vollständig beenden“ beendet den Node-Prozess. Das Schließen des Browsertabs lässt den ruhenden Server weiterlaufen.

## Datenquellen und Privatheit

Standardmäßig werden diese Ordner gelesen:

| Tool | Datenquelle |
| --- | --- |
| Claude Code | `%USERPROFILE%\.claude\projects` inklusive `subagents` |
| Codex | `%USERPROFILE%\.codex\sessions` und `archived_sessions` |

`CLAUDE_CONFIG_DIR` und `CODEX_HOME` überschreiben das jeweilige Stammverzeichnis beim ersten Start. Weitere absolute Quellordner lassen sich in den Einstellungen ergänzen (auch erreichbare UNC-/WSL-Verzeichnisse). Daten auf anderen Rechnern oder im Browser werden nicht automatisch erfasst.

Die Dateien werden **nur gelesen**. Kein Zugriff auf Zugangsdaten. Prompts und Antworten werden beim Parsen verworfen. Der lokale Cache enthält Nutzungsereignisse, Session-IDs, Metadaten wie Arbeitsordner/Branch/Sessiontitel und zuletzt gemeldete Codex-Limits. Diese Daten liegen in `.local/usage-cache.json`, Einstellungen in `.local/settings.json`. Der Server ist ausschließlich an `127.0.0.1` gebunden; fremde Origins und Änderungen ohne lokalen Sitzungstoken werden abgewiesen.

Neue Dateiinhalte werden ab dem letzten vollständig gelesenen Zeilenende verarbeitet. Unveränderte Dateien werden nicht erneut gelesen. Ungültige vollständige Zeilen werden übersprungen und gezählt; eine gerade geschriebene Schlusszeile wird beim nächsten Scan vervollständigt. Nutzungsdaten gelöschter Quelldateien bleiben im Cache historisch verfügbar. Entfernte Datenquellen fließen nicht mehr in Auswertungen ein. Für einen vollständigen Neuimport: App beenden und `.local/usage-cache.json` entfernen.

Git-Repositories werden anhand der `.git`-Metadaten erkannt, Worktrees über `commondir` zugeordnet. Nicht mehr vorhandene Projektordner bleiben anhand ihres protokollierten Arbeitsordners auswertbar.

## Zählung und bekannte Grenzen

### Preise per Button aktualisieren

Unter **Einstellungen → Modellpreise aktualisieren → Preise aktualisieren** lädt die App die öffentlichen Kataloge von [LiteLLM](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json) und [models.dev](https://models.dev/api.json). ccusage muss dafür nicht installiert sein. Es werden ausschließlich Preisdateien heruntergeladen, keine Sessiondaten übertragen.

Die Preise werden in `.local/model-prices.json` gespeichert und beim nächsten Start offline geladen. Manuelle Preise haben Vorrang vor Online-Preisen; die mitgelieferte Tabelle bleibt als Rückfall für sonst unbekannte Modelle verfügbar. Neuere Quellabrufe haben Vorrang, bei gleichzeitigem Abruf LiteLLM. Bei einem Quellfehler wird die andere Quelle verwendet und eine Meldung angezeigt; bei vollständigem Fehlschlag bleiben die bisherigen Preise erhalten. Abrufzeitpunkte und Modellanzahl stehen beim Button. Der Abrufzeitpunkt ist kein bestätigtes Änderungsdatum der Anbieterpreise.

Der Button aktualisiert die Standard-Tokenpreise, nicht die Programmlogik für Fast-Modi oder Kontextaufschläge. Fehlende benötigte Preiskategorien bleiben unbekannt. Neue Preise gelten auch für historische Auswertungen; es entsteht keine datierte Preishistorie. Es gibt keinen automatischen Hintergrundabruf.

Claude-Antworten werden anhand der Message-ID dedupliziert, Streaming-Chunks zusammengeführt. Cache-Tokens sind bei Claude zusätzliche Input-Kategorien. Codex-Caches sind bereits in `input_tokens` enthalten und werden entsprechend getrennt. Reasoning gehört zum Output und wird nicht doppelt berechnet.

Neuere Codex-Logs enthalten eindeutige `token_usage_record`-Einträge pro Antwort. Diese haben innerhalb einer Datei Vorrang vor den parallel geschriebenen kumulativen Snapshots. Ältere Logs verwenden die Differenz von `total_token_usage`; unveränderte wiederholte Snapshots zählen nicht erneut. Geerbte Elternereignisse vor dem Sessionbeginn bzw. mit anderer Thread-ID werden ausgeschlossen. Seltene gemischte Logs, in denen nur ein Teil der Laufzeit Antwortdatensätze enthält, können deshalb weniger Nutzungsereignisse ausweisen. Alte Logs ohne Nutzungsfelder liefern keine nachträglich rekonstruierbaren Tokenzahlen.

Claude-Prozentlimits stehen in den hier unterstützten lokalen Session-Logs nicht zur Verfügung. Die App verwendet keine undokumentierten Account-Endpunkte oder OAuth-Zugangsdaten. Codex-Limits sind **zuletzt protokollierte**, accountweite Werte; ohne neue Codex-Aktivität werden sie nicht frischer. Mehrere Konten unter denselben Quellordnern können nicht zuverlässig getrennt werden.

Kosten sind **API-Gegenwerte in USD, keine Abo-Rechnung**. Preisstand: 11.09.2026. Cache-TTL, bekannte Fast-Tarife und bekannte Kontextaufschläge werden berücksichtigt. Historische Preiswechsel, Kontorabatte, regionale Besonderheiten und zusätzliche Server-Toolgebühren können abweichen. Unbekannte Modelle (etwa interne Review-Aliasse) bekommen **keinen erfundenen Preis**. Unvollständige Summen tragen `≥`, vollständig unbekannte Kosten `–`. Eigene Preise in den Einstellungen ergänzen.

Grundlagen: [ccusage-Datenformat](https://ccusage.com/guide/codex/), [OpenAI-Preise](https://developers.openai.com/api/docs/pricing), [Anthropic-Preise](https://platform.claude.com/docs/en/about-claude/pricing). ccusage ist eine hilfreiche unabhängige Vergleichsmöglichkeit (`npx ccusage`), aber keine Laufzeitabhängigkeit dieser App.

## An Freunde und Kollegen weitergeben

```powershell
npm run package
```

Erstellt **`dist/Session-Atlas-portable.zip`** direkt mit Node, ohne weitere Programme. Das ZIP enthält ausschließlich Programmdateien, **keinen Cache, keine Sessiondaten und keine persönlichen Einstellungen**. ZIP weitergeben, in einen beschreibbaren Ordner entpacken, `Start.cmd` starten. Nicht den gesamten Arbeitsordner inklusive `.local` weitergeben.

Die Autostart-Verknüpfung verweist auf den aktuellen Ordner. Nach dem Verschieben in der App aus- und wieder einschalten. Das Öffnen von PowerShell beim Autostart erfolgt mit verborgenem Fenster und ohne Änderung der Execution Policy.

## Konfiguration und Entwicklung

```powershell
$env:ATLAS_PORT = '4318'
$env:ATLAS_DATA_DIR = 'C:\Pfad\zu\Atlas-Daten'
node server.mjs
```

Der Standardport ist 4317; `ATLAS_DATA_DIR` erlaubt einen anderen beschreibbaren Cache-/Einstellungsordner. Prozessumgebungsvariablen gelten nur für den jeweiligen Start; für dauerhafte Konfiguration über Autostart müssen sie in der Windows-Benutzerumgebung verfügbar sein.

```powershell
npm test
```

Tests für Parser, Deduplizierung, kumulative Resets, Cachekosten, inkrementelles Einlesen, Wiederherstellung, beschädigte Zeilen und Worktree-Zuordnung. Server mit Node-Bordmitteln, UI mit HTML/CSS/JavaScript; kein Build erforderlich.
