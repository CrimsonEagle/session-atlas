# Session Atlas

Portable, lokale Nutzungsanalyse für **Claude Code und OpenAI Codex**. Ohne Installer, npm-Installation, API-Schlüssel oder externe Schriftarten. Die Auswertung funktioniert offline; nur der optionale Preisabruf benötigt Internet. Benötigt **Node.js 22 oder neuer** und einen aktuellen Browser. Für Windows entwickelt.

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
- Direkter Vergleich zweier Zeiträume mit Kennzahlen, relativer Zeitachse und Beiträgen nach Projekt, Modell oder KI-Tool. Verfügbar sind die gleich lange Vorperiode, vorige Kalenderwoche, voriger Kalendermonat und ein eigener Vergleichszeitraum.
- Aktivitätskalender für die letzten zwölf Monate oder ein Kalenderjahr, wahlweise nach Tokens, API-Gegenwert oder Modellantworten. Ein ausgewählter Tag grenzt Tabelle und Details auf denselben lokalen Kalendertag ein.
- Aufgabenansicht für Codex-Hauptsessions und explizit zugeordnete Subagents beziehungsweise Prüf-Agents. Aufklappbare Bäume unterscheiden Eigenverbrauch und Verbrauch einschließlich untergeordneter Agents; unsichere oder fehlende Beziehungen bleiben sichtbar statt geschätzt zu werden.
- Sessions, Repositories, Arbeitsordner, KI-Tools und Modelle als Gruppierungen; Suche sowie kombinierte Tool-, Repository-, Modell- und Datumsfilter.
- Sessiondetails mit Modellantworten, Branch, Arbeitsordner, Input-/Output-/Cache-/Reasoning-Tokens und einem Kontextverlauf. Modell-/Fensterwechsel, Datenlücken sowie ausdrücklich protokollierte Komprimierungen werden markiert; fehlende Fenstergrößen erzeugen keine erfundenen Prozentwerte.
- 5-Stunden-/Wochenlimits für beide Tools, inklusive Plan, Messzeitpunkt und Reset: Codex aus den letzten protokollierten `rate_limits`, Claude Code aus `cachedUsageUtilization` in `.claude.json` und optional aus der Statusline-Bridge. Angezeigt wird jeweils der jüngere Messwert samt Quelle. Abgelaufene Messwerte erscheinen als unbekannt, nicht als 0 %.
- Persistenter Limitverlauf mit sichtbaren Resetgrenzen und Quellen sowie konfigurierbaren Schwellenhinweisen. Voreinstellung: 80 % und 95 %, höchstens einmal je Schwelle und Resetfenster; Aufbewahrung standardmäßig 90 Tage.
- Rollierende Kosten der letzten 5 Stunden / 7 Tage für beide Tools. Diese sind **kein identisches Abrechnungsfenster** und kein Ersatz für prozentuale Abolimits.
- Manuelles Aktualisieren und automatischer Scan (Standard 30 s, einstellbar 10–3600 s).
- Fokusverlust, anderer Browsertab oder minimiertes Fenster stoppen weitere automatische Scans. Bei Rückkehr sofortige Aktualisierung. Ein schon laufender Scan darf zu Ende laufen. Ein zusätzlich geöffnetes, fokussiertes App-Fenster kann weiterhin Scans auslösen. Der Server hat keinen Hintergrund-Polling-Timer und keine Dateiwatcher.
- CSV-Export der gefilterten Nutzungsereignisse mit präzisen Werten, kompatibel mit deutschem Excel. Zellinhalte werden gegen Formelausführung abgesichert. Gruppierung verändert nur die Ansicht; der Export bleibt auf Ereignisebene.
- Wahl zwischen aktueller und historisch hinterlegter Preisbewertung. Unveränderliche Preisstände, Gültigkeitsbeginn, Quelle und Regelversion bleiben lokal nachvollziehbar; zwei Stände lassen sich für denselben Zeitraum vergleichen. Der CSV-Export enthält Bewertungsmodus, Preisstand-Referenz und Regelversion.
- Vollständiges lokales gzip-Backup mit Manifest und SHA-256-Prüfsummen sowie kontrollierter Wiederherstellung. Vor der Übernahme erscheinen Größe, Sessionanzahl und Kategorien; fehlende Quellordner können neu zugeordnet werden. Vor jedem Restore entsteht automatisch ein Rückfallstand.
- Windows-Autostart in den Einstellungen aktivieren/deaktivieren. Es wird eine Verknüpfung im Autostartordner des aktuellen Nutzers erstellt; keine Administratorrechte, kein Dienst, keine Installation.
- „App vollständig beenden“ beendet den Node-Prozess. Das Schließen des Browsertabs lässt den ruhenden Server weiterlaufen.

Der animierte Hintergrund nutzt lokal mitgeliefertes **PixiJS 8.18.0 (MIT)** mit WebGL: leuchtende Partikel auf bewegten Kurven, wählbares FPS-Limit (30, 60, 120, 144 oder Monitor-Maximum; Standard 60), mit dem Bildschirm synchronisiert, 48 Partikel (24 auf schmalen Displays), Renderauflösung bis 4K (8,29 Millionen Pixel), bis zu zweifache Pixeldichte für HiDPI-Displays und WebGL-Kantenglättung. Partikelgröße und Geschwindigkeit bleiben unabhängig von der Pixeldichte. Keine Blur-Filter; die Szene fordert einen stromsparenden Grafikadapter an. Tabwechsel und Minimieren stornieren den Animation-Frame; es gibt keinen Animationstimer; PixiJS-System-/Shared-Ticker bleiben deaktiviert. Bei Rückkehr wird ohne Zeitsprung fortgesetzt. „Reduzierte Bewegung“ zeigt ein statisches Motiv. Unter **Einstellungen → Animierter Hintergrund** lässt sich die Animation ein-/ausschalten und das FPS-Limit wählen. Beide Einstellungen wirken sofort und bleiben in diesem Browser gespeichert. Monitor-Maximum zeichnet bei jedem vom Browser gelieferten Animation-Frame; die tatsächliche Bildrate hängt vom Display, Browser und der verfügbaren Leistung ab. Ohne verfügbares WebGL bleibt die App bedienbar und zeigt in den Einstellungen einen Hinweis. Die tatsächliche CPU-/GPU-Last hängt vom Gerät ab.

## Datenquellen und Privatheit

Standardmäßig werden diese Ordner gelesen:

| Tool | Datenquelle |
| --- | --- |
| Claude Code | `%USERPROFILE%\.claude\projects` inklusive `subagents`; Limits zusätzlich aus `%USERPROFILE%\.claude.json` und, falls eingerichtet, aus `%USERPROFILE%\.claude\session-atlas-limits.json` |
| Codex | `%USERPROFILE%\.codex\sessions` und `archived_sessions` |

`CLAUDE_CONFIG_DIR` und `CODEX_HOME` überschreiben das jeweilige Stammverzeichnis beim ersten Start. Weitere absolute Quellordner lassen sich in den Einstellungen ergänzen (auch erreichbare UNC-/WSL-Verzeichnisse). Daten auf anderen Rechnern oder im Browser werden nicht automatisch erfasst.

Die Dateien werden **nur gelesen**. Kein Zugriff auf Zugangsdaten. Prompts und Antworten werden beim Parsen verworfen. Aus `.claude.json` werden ausschließlich Plan, Messzeitpunkt und die beiden Limitfenster gelesen; Account-Kennung, Projektliste und Prompt-Historie derselben Datei bleiben ungelesen und werden **nicht** zwischengespeichert. Die optionale Statusline-Bridge ist der einzige Teil, der überhaupt in der Claude-Konfiguration schreibt: Claude Code ruft sie beim Rendern der Statusline auf, sie legt ausschließlich den Limitblock in `session-atlas-limits.json` ab und verwirft Modell, Arbeitsordner, Branch und alle übrigen Felder ihrer Eingabe. Der Server selbst schreibt nie in die Quellordner. Der lokale Cache enthält Nutzungsereignisse, Kontextproben, Session-IDs, Metadaten wie Arbeitsordner/Branch/Sessiontitel und zuletzt gemeldete Codex-Limits.

App-Daten liegen in einem versionierten Satz unter `.local/states/<id>/`; `.local/active-state.json` verweist atomar auf den aktiven Satz. Dazu gehören `usage-cache.json`, `settings.json`, `model-prices.json` und `price-history.json`. Bestehende flache Dateien werden beim ersten Start in einen initialen Satz kopiert. Der Server ist ausschließlich an `127.0.0.1` gebunden; fremde Origins und Änderungen ohne lokalen Sitzungstoken werden abgewiesen.

Neue Dateiinhalte werden ab dem letzten vollständig gelesenen Zeilenende verarbeitet. Unveränderte Dateien werden anhand ihrer Metadaten geprüft und nicht geöffnet. Bei geänderten Dateien wird der gesamte bereits übernommene Inhalt per SHA-256 geprüft, bevor neue Zeilen verarbeitet werden; neu geschriebene Dateien werden so auch bei gewachsener Dateigröße erkannt. Bis zu vier Dateien werden gleichzeitig verarbeitet. Ungültige vollständige Zeilen werden übersprungen und gezählt; eine gerade geschriebene Schlusszeile wird beim nächsten Scan vervollständigt. Nutzungsdaten gelöschter Quelldateien bleiben im Cache historisch verfügbar. Entfernte Datenquellen fließen nicht mehr in Auswertungen ein. Für einen vollständigen Neuimport: App beenden und `.local/usage-cache.json` entfernen.

Git-Repositories werden anhand der `.git`-Metadaten erkannt, Worktrees über `commondir` zugeordnet. Nicht mehr vorhandene Projektordner bleiben anhand ihres protokollierten Arbeitsordners auswertbar.

### Claude-Limits aktuell halten (optional)

Claude Code schreibt `cachedUsageUtilization` nur, wenn es die Werte selbst abruft, nicht bei jeder Antwort. Der Messwert kann dadurch mehrere Tage alt sein. Die mitgelieferte Bridge hängt sich an die dokumentierte Statusline-Schnittstelle und hinterlegt bei jedem Rendern einen frischen Wert. Dafür in der `settings.json` von **Claude Code** eintragen:

```json
"statusLine": { "command": "node \"C:\\Pfad\\zu\\Session-Atlas\\bridge\\atlas-statusline.mjs\"" }
```

Wer bereits eine Statusline nutzt, stellt den bisherigen Befehl dahinter. Die Bridge reicht die unveränderte Eingabe weiter und überlässt ihm die Ausgabe:

```powershell
node "C:\Pfad\zu\Session-Atlas\bridge\atlas-statusline.mjs" -- bash mein-skript.sh
```

Mit `--quiet` schreibt sie nur die Datei und gibt nichts aus. `ATLAS_RATE_LIMIT_FILE` verschiebt die Zieldatei. Pro Statusline-Rendern startet ein kurzer Node-Prozess; wie oft das geschieht, steuert die Claude-Code-Einstellung `statusLine.refreshInterval`. Fehler bleiben folgenlos: Bei ungültiger Eingabe, fehlenden Limitfeldern oder nicht startbarem Folgebefehl schreibt die Bridge nichts und endet mit Code 0, damit die Statusline nicht bricht. Den erwarteten Pfad und den aktuellen Status zeigt die App unter **Einstellungen → Claude-Limits aktuell halten**.

## Zählung und bekannte Grenzen

### Preise per Button aktualisieren

Unter **Einstellungen → Modellpreise aktualisieren → Preise aktualisieren** lädt die App die öffentlichen Kataloge von [LiteLLM](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json) und [models.dev](https://models.dev/api.json). ccusage muss dafür nicht installiert sein. Es werden ausschließlich Preisdateien heruntergeladen, keine Sessiondaten übertragen.

Die Preise werden im aktiven lokalen Datenstand gespeichert und beim nächsten Start offline geladen. Manuelle Preise haben Vorrang vor Online-Preisen; die mitgelieferte Tabelle bleibt als Rückfall für sonst unbekannte Modelle verfügbar. Neuere Quellabrufe haben Vorrang, bei gleichzeitigem Abruf LiteLLM. Bei einem Quellfehler wird die andere Quelle verwendet und eine Meldung angezeigt; bei vollständigem Fehlschlag bleiben die bisherigen Preise erhalten. Abrufzeitpunkte und Modellanzahl stehen beim Button. Der Abrufzeitpunkt ist kein bestätigtes Änderungsdatum der Anbieterpreise.

Jede wirksame Preisänderung erzeugt einen unveränderlichen lokalen Preisstand mit Gültigkeitsbeginn und Regelversion. „Aktuelle Preise“ bewertet weiterhin alle Ereignisse mit dem derzeit wirksamen Stand. „Historisch hinterlegte Preise“ wählt für jedes Ereignis den zuletzt lokal gültigen Stand; Zeiten vor dem ersten Stand bleiben ausdrücklich unbekannt. Ein manuell gesetzter Gültigkeitsbeginn kann zurückreichen, ist aber keine Bestätigung des damaligen Anbieterpreises. Der Button aktualisiert die Standard-Tokenpreise, nicht automatisch die Programmlogik für Fast-Modi oder Kontextaufschläge. Fehlende benötigte Preiskategorien bleiben unbekannt. Es gibt keinen automatischen Hintergrundabruf.

### Backup und Wiederherstellung

Unter **Einstellungen → Backup & Wiederherstellung** erzeugt die App eine komprimierte `.json.gz`-Sicherung. Sie enthält den Nutzungscache, Einstellungen, aktuelle Preise, Preisgeschichte und alle weiteren vorhandenen lokalen Organisationsdaten. Sitzungstoken, Autostart und Original-Logs gehören nicht dazu. Pfade und Sessiontitel sind persönliche Metadaten und bleiben im Backup lesbar; die Datei entsprechend geschützt aufbewahren.

Beim Import werden Container-Version, erlaubte Dateitypen, komprimierte und entpackte Größe sowie jede SHA-256-Prüfsumme geprüft. Erst danach erscheint die konkrete Vorschau. Eine bestätigte Wiederherstellung wird in einen neuen Datenstand geschrieben und mit einem atomaren Zeiger aktiviert; parallele Scans und Einstellungen sind währenddessen blockiert. Der vorherige Stand bleibt zusätzlich als gzip-Rückfall unter `.local/recovery/` erhalten. Gesicherte Historie funktioniert ohne Original-Logs. Auf einem anderen Rechner lassen sich fehlende Log-Wurzeln optional zuordnen, damit ein späterer Scan dieselben Sessions aktualisiert statt sie doppelt einzulesen.

Claude-Antworten werden anhand der Message-ID dedupliziert, Streaming-Chunks zusammengeführt. Cache-Tokens sind bei Claude zusätzliche Input-Kategorien. Codex-Caches sind bereits in `input_tokens` enthalten und werden entsprechend getrennt. Reasoning gehört zum Output und wird nicht doppelt berechnet.

Der Kontextverlauf ist von den Kosten- und Token-Summen getrennt. Bei Claude ergibt sich eine Probe aus den protokollierten Input-, Cache-Lese- und Cache-Schreibkategorien einer Antwort; bei Codex aus `last_token_usage` und dem ausdrücklich gelieferten `model_context_window`. Das ist der vom jeweiligen Logformat beobachtbare Antwortkontext, keine Rekonstruktion nicht protokollierter Zwischenzustände. Ein bloßer Rückgang wird nicht als Komprimierung bezeichnet. Alte oder entfernte Logs ohne diese Felder liefern weiterhin nur den letzten bekannten Stand oder keinen Verlauf.

Neuere Codex-Logs enthalten eindeutige `token_usage_record`-Einträge pro Antwort. Diese haben innerhalb einer Datei Vorrang vor den parallel geschriebenen kumulativen Snapshots. Ältere Logs verwenden die Differenz von `total_token_usage`; unveränderte wiederholte Snapshots zählen nicht erneut. Geerbte Elternereignisse vor dem Sessionbeginn bzw. mit anderer Thread-ID werden ausgeschlossen. Seltene gemischte Logs, in denen nur ein Teil der Laufzeit Antwortdatensätze enthält, können deshalb weniger Nutzungsereignisse ausweisen. Alte Logs ohne Nutzungsfelder liefern keine nachträglich rekonstruierbaren Tokenzahlen.

Die App verwendet keine undokumentierten Account-Endpunkte oder OAuth-Zugangsdaten. Limits beider Tools sind **zuletzt gemessene**, accountweite Werte; ohne neue Aktivität des jeweiligen Tools werden sie nicht frischer. Claude Code schreibt `cachedUsageUtilization` nur, wenn es die Werte selbst abruft — nicht bei jeder Antwort. Der Messwert kann daher mehrere Tage alt sein; die optionale Statusline-Bridge hält ihn aktuell. Ein abgelaufenes Fenster wird als unbekannt ausgewiesen, nicht als 0 %. In den Session-Logs selbst stehen die Prozentwerte weiterhin nicht. Mehrere Konten unter denselben Quellordnern können nicht zuverlässig getrennt werden.

Kosten sind **API-Gegenwerte in USD, keine Abo-Rechnung**. Preisstand: 11.09.2026. Cache-TTL, bekannte Fast-Tarife und bekannte Kontextaufschläge werden berücksichtigt. Historische Preiswechsel, Kontorabatte, regionale Besonderheiten und zusätzliche Server-Toolgebühren können abweichen. Unbekannte Modelle (etwa interne Review-Aliasse) bekommen **keinen erfundenen Preis**. Bekannte Kostensummen sind Schätzungen und können höher ausfallen; vollständig unbekannte Kosten tragen `–`. Eigene Preise in den Einstellungen ergänzen.

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

Mit `node scripts/benchmark-scan.mjs` lässt sich die Scanleistung auf künstlichen Logs messen, ohne persönliche Daten zu lesen oder den Anwendungscache zu verändern. Der Benchmark prüft auch die Gleichheit der Sessioninhalte. Messverfahren, Vergleichswerte und Grenzen stehen in [Scan-Performance](docs/scan-performance.md).
