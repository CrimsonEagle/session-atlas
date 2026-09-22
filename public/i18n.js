const STORAGE_KEY='session-atlas-language';
const choices=new Set(['system','de','en']);

// German remains the canonical source language in the templates. Keeping the
// translations here means dynamically rendered panels, dialogs and tooltips use
// the same vocabulary as the static shell.
const phrases={
 'Session Atlas · KI-Nutzung':'Session Atlas · AI usage',
 'Bleibt auf deinem Rechner':'Stays on your computer',
 'Lokale Daten. Kein Konto.':'Local data. No account.',
 'Kein Upload.':'No upload.',
 'Dein Workspace wird eingelesen':'Reading your workspace',
 'Beim ersten Start kann das bei großen Session-Archiven etwas dauern.':'Large session archives may take a moment on the first launch.',
 'Alle Kosten in USD · API-Schätzwerte, können höher ausfallen':'All costs in USD · API estimates; actual costs may be higher',
 'Session, Repository oder Modell suchen …':'Search sessions, repositories, or models…',
 'Ausgewählte Projekte, Modelle, KI-Tools, Suche und Diagrammabschnitte zurücksetzen':'Reset selected projects, models, AI tools, search, and chart ranges',
 'Keine Auswahlfilter aktiv':'No selection filters active',
 'Schätzung; tatsächlicher Wert kann höher liegen':'Estimate; actual amount may be higher',
 'Letzte 90 Zeitabschnitte · für mehr Verlauf „Monat“ wählen':'Last 90 periods · select “Month” for a longer range',
 'Leuchtende Datenströme · pausiert automatisch in unsichtbaren Tabs.':'Glowing data streams · pauses automatically in hidden tabs.',
 'Systemeinstellung „Reduzierte Bewegung“ aktiv: Das Motiv bleibt still.':'The system setting “Reduce motion” is active: the background remains still.',
 'WebGL ist nicht verfügbar. Der Hintergrund konnte nicht gestartet werden.':'WebGL is unavailable. The background could not be started.',
 'Grafik wird wiederhergestellt …':'Restoring graphics…',
 'Hintergrund ausgeschaltet.':'Background disabled.',
 'Wähle einen gültigen, begrenzten Zeitraum.':'Choose a valid, bounded date range.',
 'Der Kalender zeigt höchstens 12 Monate beziehungsweise ein Kalenderjahr. Wähle oben einen passenden Zeitraum.':'The calendar shows at most 12 months or one calendar year. Choose a suitable range above.',
 'Jede Zelle zeigt zusätzlich den Kalendertag als Zahl.':'Each cell also shows the day of the month as a number.',
 'Ausgewählt · erneut anklicken, um den Filter aufzuheben':'Selected · click again to clear the filter',
 'Anklicken, um die Daten darunter zu filtern':'Click to filter the data below',
 'Anklicken, um diesen Tag auszuwählen':'Click to select this day',
 'Keine Aktivität protokolliert':'No activity recorded',
 'Liegt in der Zukunft':'In the future',
 'Lokale Kalendertage · Montag bis Sonntag':'Local calendar days · Monday through Sunday',
 'Für den Gesamtverlauf oder einen unvollständigen eigenen Zeitraum ist kein Vergleich möglich.':'The full history or an incomplete custom range cannot be compared.',
 'Keine Zeitreihendaten für diesen Vergleich.':'No time-series data for this comparison.',
 'Keine Aktivitäten in beiden Zeiträumen.':'No activity in either period.',
 'Was hat sich verändert?':'What changed?',
 'Kosten nur eingeschränkt vergleichbar:':'Costs are only partially comparable:',
 'Protokollierter Kontextstand je Antwort; Komprimierungen nur bei explizitem Logereignis':'Recorded context state per response; compactions only for explicit log events',
 'Für diese Session wurde kein belastbarer Kontextverlauf protokolliert.':'No reliable context history was recorded for this session.',
 'Nur der letzte Stand ist verfügbar:':'Only the latest state is available:',
 'Datenlücke oder Komprimierungsgrenze':'Data gap or compaction boundary',
 'Kontextfenster geändert':'Context window changed',
 'Explizite Komprimierung':'Explicit compaction',
 'Modell-/Fensterwechsel':'Model/window change',
 'Übergeordnete Session ist lokal nicht verfügbar':'Parent session is not available locally',
 'Zyklische oder selbstreferenzierende Beziehung':'Cyclic or self-referencing relationship',
 'Widersprüchliche Beziehungsnachweise':'Conflicting relationship evidence',
 'Beziehung vorhanden, aber Parent fehlt oder ist widersprüchlich.':'A relationship exists, but the parent is missing or inconsistent.',
 'Parent außerhalb der Auswahl':'Parent outside the selection',
 'Parent zur Orientierung':'parent for context',
 'Orientierung · außerhalb der Auswahl':'Context · outside the selection',
 'Keine Nutzungsdaten im Zeitraum.':'No usage data in this period.',
 'Keine Aufgaben für diese Auswahl.':'No tasks for this selection.',
 'Aufgaben mit Agents':'Tasks with agents',
 'Verteilung auf Agents':'Distribution across agents',
 'Verteilung auf Modelle':'Distribution across models',
 'nicht sicher zugeordnet':'not reliably assigned',
 'Kostenlimits & Verlauf':'Cost limits & history',
 'Kein Limit-Messwert in der Claude-Konfiguration':'No limit reading in the Claude configuration',
 'Kein Limit-Messwert im Log':'No limit reading in the log',
 'Reset vorbei · neuer Messwert fehlt':'Reset passed · new reading missing',
 'Bekannte Kosten im Fenster':'Known cost in window',
 'Deine Usage-Fenster':'Your usage windows',
 'Keine Nutzungsdaten protokolliert':'No usage data recorded',
 'Alle zugehörigen Sessions':'All related sessions',
 'Sessions auf diesem Branch':'Sessions on this branch',
 'Hauptsession oder Subagent':'Main session or subagent',
 'Noch keine Sessions gefunden':'No sessions found yet',
 'Keine Sessions für diese Auswahl':'No sessions for this selection',
 'Passe den Zeitraum oder die Filter an, um weitere Sessions anzuzeigen.':'Adjust the date range or filters to display more sessions.',
 'Datenquellen einstellen':'Configure data sources',
 'Repositories mit dem höchsten Tokenverbrauch':'Repositories with the highest token usage',
 'Alle Repositories ansehen':'View all repositories',
 'Wo deine KI arbeitet':'Where your AI works',
 'Noch kein Online-Abruf. Mitgelieferte Preise sind aktiv.':'No online fetch yet. Bundled prices are active.',
 'Lokale Stände machen frühere Kostenberechnungen reproduzierbar.':'Local snapshots make past cost calculations reproducible.',
 'Noch kein Preisstand gespeichert.':'No pricing snapshot saved yet.',
 'Historische Preisstände':'Historical pricing snapshots',
 'Preisstände verwalten':'Manage pricing snapshots',
 'Automatische Aktualisierung':'Automatic refresh',
 'Der Scan pausiert, wenn das Fenster nicht aktiv ist. Ein laufender Scan wird beendet.':'Scanning pauses while the window is inactive. A running scan is stopped.',
 'Bewegte Lichtpartikel in den Farben deiner KI-Tools.':'Moving light particles in the colors of your AI tools.',
 '30 FPS spart Ressourcen; höhere Werte wirken flüssiger.':'30 FPS saves resources; higher values appear smoother.',
 'Änderungen wirken sofort und gelten nur in diesem Browser.':'Changes take effect immediately and apply only in this browser.',
 'Ein absoluter Pfad pro Zeile. Unterordner und Subagents werden automatisch berücksichtigt.':'One absolute path per line. Subfolders and subagents are included automatically.',
 'Aktive und archivierte Sessions werden zusammen ausgewertet.':'Active and archived sessions are analyzed together.',
 'Standard ist dein .claude/projects-Ordner, inklusive Subagents.':'The default is your .claude/projects folder, including subagents.',
 'Steuere, mit welchem Preisstand Session Atlas deine lokale Nutzung bewertet.':'Choose which pricing snapshot Session Atlas uses to value local usage.',
 'Historisch nutzt den zum Ereigniszeitpunkt lokal gültigen Stand.':'Historical mode uses the locally valid snapshot at the event time.',
 'Leer bedeutet: ab dem Speichern.':'Empty means: from the time it is saved.',
 'Eigene Preise in USD pro Million Tokens. Der Modellname muss exakt dem Log entsprechen.':'Custom prices in USD per million tokens. The model name must exactly match the log.',
 'Ruft LiteLLM und models.dev ab. Manuelle Einträge behalten Vorrang; Sessiondaten werden nicht übertragen.':'Fetches LiteLLM and models.dev. Manual entries take priority; session data is not transmitted.',
 'Bestimme Aufbewahrung und Warnschwellen für deine Codex- und Claude-Limits.':'Set retention and warning thresholds for your Codex and Claude limits.',
 'Deine Auswertung bleibt lokal. Prompts und Antworten landen nicht im Cache.':'Your analysis remains local. Prompts and responses are not stored in the cache.',
 'Historische Nutzungsdaten bleiben erhalten, auch wenn ursprüngliche Logs später fehlen.':'Historical usage remains available even if original logs are later missing.',
 'Neu aufbauen liest alle verfügbaren Logs erneut ein. Zuvor wird ein Rückfall-Backup erstellt.':'Rebuild rereads every available log. A fallback backup is created first.',
 'Steuere den lokalen Start und selten benötigte App-Aktionen.':'Control local startup and less frequently used app actions.',
 'Session Atlas bei der Anmeldung starten und im Browser öffnen.':'Start Session Atlas at sign-in and open it in the browser.',
 'Die Verknüpfung verweist auf diesen Ordner. Nach einem Umzug bitte neu aktivieren.':'The shortcut points to this folder. Re-enable it after moving the folder.',
 'Auf diesem Betriebssystem ist Windows-Autostart nicht verfügbar.':'Windows startup is unavailable on this operating system.',
 'Beendet den lokalen Node-Prozess vollständig. Der Neustart erfolgt über':'Completely stops the local Node process. Restart it with',
 'Pfade, Intervall, Preise und Limits werden gemeinsam übernommen.':'Paths, interval, prices, and limits are saved together.',
 'Provider, Pfade, Intervall, Preise und Limits werden gemeinsam übernommen.':'Providers, paths, interval, prices, and limits are saved together.',
 'Blendet alle Nutzungsdaten, Diagramme, Limits und Filter des jeweiligen Providers aus. Die lokalen Daten bleiben erhalten.':'Hide all usage data, charts, limits, and filters for that provider. Local data is retained.',
 'Standardmäßig sind beide Provider sichtbar. Die Änderung wird mit den übrigen Einstellungen gespeichert.':'Both providers are visible by default. This change is saved with the other settings.',
 'Alle Provider sind ausgeblendet':'All providers are hidden',
 'Aktiviere OpenAI Codex oder Claude Code in den Einstellungen, um Nutzungsdaten anzuzeigen.':'Enable OpenAI Codex or Claude Code in Settings to display usage data.',
 'Daten darunter gefiltert auf':'Data below filtered to',
 'Für Modellantworten fehlt ein verlässlicher Preis.':'Some model responses have no reliable price.',
 'Bekannte Kosten sind Untergrenzen und können höher ausfallen; zusätzlich ist die Summe unvollständig.':'Known costs are a lower bound and may be higher; the total is also incomplete.',
 'Limit- und Kostendaten werden zusammengeführt …':'Combining limit and cost data…',
 'Auf 100 % hochgerechneter API-Gegenwert · historischer Verlauf':'API-equivalent extrapolated to 100% · historical trend',
 'Gemessene Usage · getrennt an Resetgrenzen':'Measured usage · split at reset boundaries',
 'Messpunkte bilden die Entwicklung deiner verfügbaren Kontingente ab.':'Measurements show how your available quotas change over time.',
 'Hinweise erscheinen pro Schwelle und Resetfenster nur einmal.':'Notifications appear only once per threshold and reset window.',
 'Prozentwerte, kommagetrennt':'Comma-separated percentages',
 'Vollständiges lokales Backup erstellt.':'Complete local backup created.',
 'Pfade und Sessiontitel können persönliche Informationen enthalten. Original-Logdateien sind nicht Bestandteil der Sicherung.':'Paths and session titles may contain personal information. Original log files are not included in the backup.',
 'Die gesicherte Historie bleibt auch ohne Zuordnung lesbar. Optional kannst du hier den entsprechenden absoluten Ordner auf diesem Rechner eintragen.':'The backed-up history remains readable without a mapping. You can optionally enter the corresponding absolute folder on this computer.',
 'Den aktuellen App-Datenstand jetzt durch das geprüfte Backup ersetzen?':'Replace the current app data with the verified backup now?',
 'Session Atlas vollständig beenden?':'Quit Session Atlas completely?',
 'App beendet. Zum Starten Start.cmd öffnen.':'App stopped. Open Start.cmd to start it again.',
 'Wähle zuerst einen begrenzten Zeitraum.':'Choose a bounded date range first.',
 'Session-Daten sind aktuell.':'Session data is up to date.',
 'Keine Verbindung zur lokalen App':'No connection to the local app',
 'Starte Start.cmd und lade diese Seite neu.':'Start Start.cmd and reload this page.',
 'Gesamte Session · unabhängig vom Zeitraumfilter':'Entire session · independent of the date filter',
 'Diese Session enthält noch keine Nutzungsmetriken.':'This session does not contain usage metrics yet.',
 'Diese Session enthält keine Nutzungsmetriken im gewählten Zeitraum.':'This session contains no usage metrics in the selected period.',
 'Kontext laut letztem Log':'Context from latest log',
 'Beginn / letzte Aktivität':'Start / latest activity',
 'Letzte Modellantworten':'Latest model responses',
 'So verteilen sich die Tokens':'Token distribution',
 'Wird aktualisiert …':'Refreshing…',
 'Im Hintergrund pausiert':'Paused in background',
 'Lokale Session-Daten werden geladen …':'Loading local session data…',
 'App vollständig beenden':'Quit app completely',
 'Zeiträume vergleichen':'Compare periods',
 'Vorheriger gleich langer Zeitraum':'Previous period of equal length',
 'Vorige Kalenderwoche':'Previous calendar week',
 'Voriger Kalendermonat':'Previous calendar month',
 'Eigener Vergleichszeitraum':'Custom comparison period',
 'Filter zurücksetzen':'Reset filters',
 'Gesamter Verlauf':'Full history',
 'Eigener Zeitraum':'Custom range',
 'Letzte 12 Monate':'Last 12 months',
 'Letzte 90 Tage':'Last 90 days',
 'Letzte 30 Tage':'Last 30 days',
 'Letzte 7 Tage':'Last 7 days',
 'Dieser Monat':'This month',
 'Diese Woche':'This week',
 'Alle KI-Tools':'All AI tools',
 'Alle Repositories':'All repositories',
 'Alle Modelle':'All models',
 'Alle Zeitabschnitte anzeigen':'Show all periods',
 'Tagesauswahl aufheben':'Clear day selection',
 'Aktueller Zeitraumfilter':'Current date filter',
 'Aktivitätskalender':'Activity calendar',
 'Kalenderzeitraum':'Calendar range',
 'Kalendermetrik':'Calendar metric',
 'Übersichtsdarstellung':'Overview display',
 'Verbrauchte Tokens':'Tokens used',
 'Geschätzte API-Kosten':'Estimated API cost',
 'Sessions im Zeitraum':'Sessions in period',
 'Aus dem Cache':'From cache',
 'gecachte Input-Tokens':'cached input tokens',
 'Nutzung im Verlauf':'Usage over time',
 'Tokenverbrauch im Zeitverlauf':'Token usage over time',
 'Kosten im Zeitverlauf':'Cost over time',
 'Verbrauch nach Projekt':'Usage by project',
 'Verbrauch nach Modell':'Usage by model',
 'Gruppierte Auswertung':'Grouped analysis',
 'Einzelne Sessions':'Individual sessions',
 'Nach Repository':'By repository',
 'Nach KI-Tool':'By AI tool',
 'Nach Modell':'By model',
 'Nach Branch':'By branch',
 'Hauptsessions / Subagents':'Main sessions / subagents',
 'Letzte Aktivität':'Latest activity',
 'Meiste Tokens':'Most tokens',
 'Höchste Kosten':'Highest cost',
 'Zuletzt aktiv':'Recently active',
 'API-Schätzung':'API estimate',
 'API-Kosten':'API cost',
 'Modellantworten':'Model responses',
 'Cache-Anteil':'Cache share',
 'Preisabdeckung':'Price coverage',
 'Aktive Tage':'Active days',
 'aktive Tage':'active days',
 'Tokenstruktur':'Token breakdown',
 'Frisch gesendete Eingabe-Tokens':'Newly sent input tokens',
 'Wiederverwendete Eingabe-Tokens':'Reused input tokens',
 'Neu in den Prompt-Cache geschriebene Tokens':'Tokens newly written to the prompt cache',
 'Antwort-Tokens inklusive Reasoning':'Response tokens including reasoning',
 'Zugehörige Sessions':'Related sessions',
 'Sessions durchsuchen':'Search sessions',
 'Alle Sessiontypen':'All session types',
 'Modell / Branch':'Model / branch',
 'Nicht protokolliert':'Not recorded',
 'Ohne Branch':'No branch',
 'Als Hauptfilter übernehmen':'Apply as main filter',
 'Im gewählten Zeitraum':'In selected period',
 'Gesamte Session':'Entire session',
 'Aktivität im Ausschnitt':'Activity in selection',
 'Modelle / Service-Tiers':'Models / service tiers',
 'Reasoning / Region':'Reasoning / region',
 'Kontextfenster':'Context window',
 'Stand der letzten protokollierten Antwort':'State at the latest recorded response',
 'Verlaufsmetrik':'Trend metric',
 'Keine Nutzungsereignisse für den Verlauf.':'No usage events for the trend.',
 'Keine Nutzungsereignisse im Ausschnitt':'No usage events in the selection',
 'Aktive Unterauswahl':'Active subselection',
 'Klicken grenzt die Auswertung ein':'Click to narrow the analysis',
 'Keine Daten':'No data',
 'Weitere':'More',
 'Details schließen':'Close details',
 'Einstellungen gespeichert.':'Settings saved.',
 'Windows-Autostart aktiviert.':'Windows startup enabled.',
 'Windows-Autostart entfernt.':'Windows startup removed.',
 'Preise aktualisiert und lokal gespeichert.':'Prices updated and saved locally.',
 'Preise teilweise aktualisiert.':'Prices partially updated.',
 'Preise werden abgerufen …':'Fetching prices…',
 'Preise aktualisieren':'Update prices',
 'Öffentliche Preise aktualisieren':'Update public prices',
 'Effektive Preise anzeigen':'Show effective prices',
 'Aktuelle Preise':'Current prices',
 'Historisch hinterlegte Preise':'Stored historical prices',
 'Bewertungsmodus':'Valuation mode',
 'Manuelle Preise gültig ab':'Manual prices valid from',
 'Format & Beispiel':'Format & example',
 'Eigene Modellpreise als JSON':'Custom model prices as JSON',
 'Modellpreise':'Model prices',
 'Datenquellen':'Data sources',
 'Datenverwaltung':'Data management',
 'Lokaler Cache':'Local cache',
 'Cache neu aufbauen':'Rebuild cache',
 'Animierter Hintergrund':'Animated background',
 'Bewegungsqualität':'Motion quality',
 'Monitor-Maximum':'Monitor maximum',
 'Windows-Autostart':'Windows startup',
 'Portable weitergeben':'Share portable version',
 'Ohne Installation':'No installation',
 'App beenden':'Quit app',
 'Änderungen speichern':'Save changes',
 'Noch nicht gespeichert?':'Not saved yet?',
 'Allgemein':'General',
 'Einstellungen':'Settings',
 'Übersicht':'Overview',
 'Repositories':'Repositories',
 'Modelle':'Models',
 'Hauptnavigation':'Main navigation',
 'Darstellung':'Appearance',
 'Systemstandard':'System default',
 'Heller Modus':'Light mode',
 'Dunkler Modus':'Dark mode',
 'Aktualisieren':'Refresh',
 'CSV exportieren':'Export CSV',
 'Sprache':'Language',
 'Deutsch':'German',
 'Englisch':'English',
 'Systemsprache':'System language',
 'Filter zurücksetzen':'Reset filters',
 'Zeitraum':'Date range',
 'Vergleichszeitraum':'Comparison period',
 'Repository':'Repository',
 'Modell':'Model',
 'Heute':'Today',
 'Kalender':'Calendar',
 'Verlauf':'Trend',
 'Kosten':'Cost',
 'Antworten':'Responses',
 'Antwort':'Response',
 'Sitzungen':'Sessions',
 'Aufgabenbaum':'Task tree',
 'Session-Hierarchie':'Session hierarchy',
 'rekursiv über direkte Parent-Beziehungen':'recursively through direct parent relationships',
 'Prüf-Agent':'Review agent',
 'Hauptsession':'Main session',
 'Nicht zugeordnet':'Unassigned',
 'Eigen':'Own',
 'Mit Kindern':'Including children',
 'Aufbewahrung':'Retention',
 'Warnschwellen anpassen':'Adjust warning thresholds',
 'Limitverlauf aufbewahren':'Retain limit history',
 'Schwellen':'Thresholds',
 'Quelle':'Source',
 'Verfügbar':'Available',
 'Genutzt':'Used',
 'Fensterbeginn':'Window start',
 'Unbekannt':'Unknown',
 'Nicht verfügbar':'Unavailable',
 'Nicht berechenbar':'Cannot be calculated',
 'Keine Änderung':'No change',
 'Neu':'New',
 'Aktuell':'Current',
 'Vergleich':'Comparison',
 'Absolut':'Absolute',
 'Relativ':'Relative',
 'Anteil':'Share',
 'Gesamt':'Total',
 'Belegt':'Used',
 'Frei':'Free',
 'Fenster':'Window',
 'Auslastung':'Usage',
 'Modellwechsel':'Model change',
 'Komprimierung':'Compaction',
 'Lücke':'Gap',
 'Belegte Tokens':'Used tokens',
 'Fenstergröße unbekannt':'window size unknown',
 'Tag':'Day',
 'Woche':'Week',
 'Monat':'Month',
 'Kalenderjahr':'Calendar year',
 'Woche ab':'Week of',
 'Keine':'None',
 'Mehr':'More',
 'Maximum':'Maximum',
 'Von':'From',
 'Bis':'To',
 'Seite':'Page',
 'Treffer':'results',
 'Dateien':'files',
 'geändert':'changed',
 'Bereit · noch kein Scan':'Ready · no scan yet',
 'Pausiert':'Paused',
 'Beendet':'Stopped',
 'Hell':'Light',
 'Dunkel':'Dark',
 'Lokal':'Local',
 'Tage':'days',
 'Stunden':'hours',
 'Wöchentlich':'Weekly',
 'Minuten':'minutes',
 'Zeitpunkt':'Time',
 'Beginn':'Start',
 'Sortierung':'Sorting',
 'Gruppierung':'Grouping',
 'Ansicht':'View',
 'Intervall':'Interval',
 'Sek.':'sec.',
 'System':'System'
};

Object.assign(phrases,{
 'Anfrage fehlgeschlagen.':'Request failed.',
 'Aktueller und vorheriger Zeitraum auf gemeinsamer relativer Zeitachse':'Current and previous period on a shared relative timeline',
 'Tag im Zeitraum':'Day in period','Ende':'End','aktuell':'current','im Vergleich':'in comparison',
 'Kontextverlauf mit':'Context history with','Messpunkten':'measurements','Deine Sessions':'Your sessions',
 'Starte eine Session mit':'Start a session with',
 'Falls du andere Datenordner verwendest, trage sie in den Einstellungen ein.':'If you use different data folders, add them in Settings.',
 'im lokalen Preiscache':'in the local price cache','abgerufen':'fetched',
 'Preiseffekt vergleichen':'Compare price effect','Erster Preisstand':'First pricing snapshot','Zweiter Preisstand':'Second pricing snapshot','Preisstände vergleichen':'Compare pricing snapshots',
 'Backup & Wiederherstellung':'Backup & restore','Exportiere Einstellungen, Verlauf und persönliche Metadaten in eine lokale Sicherung.':'Export settings, history, and personal metadata to a local backup.',
 'Backup erstellen':'Create backup','Backup wiederherstellen':'Restore backup',
 'Maximal 64 MB komprimiert und 256 MB entpackt. Vor jeder Wiederherstellung wird automatisch ein Rückfallstand angelegt.':'Maximum 64 MB compressed and 256 MB unpacked. A fallback snapshot is created automatically before each restore.',
 'Claude-Limits aktuell halten':'Keep Claude limits current','Die optionale Statusline-Bridge übernimmt bei jedem Rendern einen frischen Messwert.':'The optional status-line bridge captures a fresh reading on every render.',
 'Letzter Messwert':'Latest reading','Ohne Bridge können die Werte aus .claude.json mehrere Tage alt sein.':'Without the bridge, values from .claude.json may be several days old.',
 'Einrichtung für eine neue oder bereits vorhandene Claude-Code-Statusline.':'Setup for a new or existing Claude Code status line.','Bridge einrichten':'Set up bridge','Statusline-Bridge einrichten':'Set up status-line bridge',
 'zwei Varianten':'two options','Variante 1 · noch keine Statusline eingerichtet':'Option 1 · no status line configured yet','Variante 2 · vorhandene Statusline behalten':'Option 2 · keep the existing status line',
 'Schalter der Bridge':'Bridge options','Vorher:':'Before:','Nachher:':'After:',
 'Lege fest, wie Session Atlas aktualisiert wird und sich in diesem Browser verhält.':'Choose how Session Atlas refreshes and behaves in this browser.',
 'Einstellungsbereiche':'Settings sections','Quellordner':'source folders','Scan & Darstellung':'Scan & appearance','Bewertung & Verlauf':'Valuation & history','Schwellen & Bridge':'Thresholds & bridge','Cache & Backup':'Cache & backup','Autostart & App':'Startup & app',
 'Basispreise vom':'Base prices from','API-Schätzwerte':'API estimates',
 'Aktualisierung fehlgeschlagen:':'Refresh failed:','App konnte nicht geladen werden:':'App could not be loaded:','Sessiondetails konnten nicht geladen werden:':'Session details could not be loaded:','CSV-Export fehlgeschlagen:':'CSV export failed:','Backup fehlgeschlagen:':'Backup failed:','Limitverlauf konnte nicht geladen werden:':'Limit history could not be loaded:','Messpunkte werden geladen':'Loading measurements',
 'Zur vorherigen Auswertung':'Back to previous analysis','je Antwort':'per response','mit Preis':'priced','Tage mit Modellantworten':'days with model responses','Tokens pro Session im Durchschnitt.':'tokens per session on average.',
 'der Tokens stammen aus den drei größten Sessions.':'of tokens come from the three largest sessions.','aktive Tage im gewählten Ausschnitt.':'active days in the selected range.','in der Unterauswahl':'in the subselection',
 'Die bekannte Kostensumme ist eine Untergrenze.':'The known cost total is a lower bound.','ungültige Logzeilen wurden übersprungen.':'invalid log lines were skipped.',
 'Preisbewertung:':'Price valuation:','historisch hinterlegt':'historically stored','Regel':'Rule','kein zugeordneter Stand':'no assigned snapshot',
 'Kostenlimits':'Cost limits','Kostenlimit':'Cost limit','Limitverlauf':'Limit history','Limitdarstellung':'Limit display','Gemessener Limitverlauf':'Measured limit history',
 'Gefüllte Flächen für das 5-Stunden- und Wochenlimit. Die Flächen werden an Resetgrenzen getrennt.':'Filled areas for the five-hour and weekly limits. Areas are split at reset boundaries.',
 'Für diesen Zeitraum lässt sich noch kein Kostenlimit hochrechnen. Benötigt werden ein positiver Usage-Wert, ein gemeldeter Reset und bepreiste Nutzungsereignisse im selben Fenster.':'A cost limit cannot yet be extrapolated for this period. A positive usage value, a reported reset, and priced usage events in the same window are required.',
 'Geschätzte nutzbare Kostenlimits im Zeitverlauf':'Estimated usable cost limits over time','Zwei Linien zeigen die auf einhundert Prozent hochgerechneten Kostenlimits für fünf Stunden und eine Woche.':'Two lines show cost limits extrapolated to one hundred percent for five hours and one week.',
 'Zeitfenster in Diagramm und Tabelle':'Time windows in chart and table','in Diagramm und Tabelle ausblenden':'hide in chart and table','in Diagramm und Tabelle einblenden':'show in chart and table','Flächen enden an Resetgrenzen.':'Areas end at reset boundaries.',
 'Jüngstes Fenstermittel':'Latest window average','Jüngste Hochrechnung':'Latest extrapolation','Median der Fenstermittel':'Median of window averages','Median der Messpunkte':'Median of measurements','Noch nicht berechenbar':'Not yet calculable',
 'Keine Zeitfenster ausgewählt.':'No time windows selected.','Messzeitpunkt':'Measurement time','Nicht gemeldet':'Not reported','Letzter Messpunkt':'Latest measurement','Fenstermittel':'Window average','Einzelmessungen':'Individual measurements',
 'Kosten bis dahin':'Cost up to that point','Kosten bis Messpunkt':'Cost up to measurement','100%-Schätzung':'100% estimate','Spannweite':'Range','Messungen':'Measurements','Messpunkte mit unbekannten Preisen':'measurements with unknown prices',
 'Geschätzter API-Gegenwert des nutzbaren Kontingents:':'Estimated API value of the usable quota:',
 'Jede Rohmessung wird auf 100 % hochgerechnet; dargestellt wird anschließend genau ein arithmetischer Mittelwert je gemeldetem 5-Stunden- oder 7-Tage-Fenster.':'Each raw measurement is extrapolated to 100%; exactly one arithmetic mean is then shown for each reported five-hour or seven-day window.',
 'Jeder Punkt zeigt eine einzelne historische Hochrechnung: bekannte Kosten vom Fensterbeginn bis zum Messpunkt, geteilt durch die gemessene Usage und auf 100 % hochgerechnet.':'Each point shows one historical extrapolation: known costs from the start of the window to the measurement, divided by measured usage and extrapolated to 100%.',
 'Diese Werte sind unvollständig und können höher ausfallen.':'These values are incomplete and may be higher.',
 'Die Hochrechnung ist eine lokale Näherung aus API-Preisen, keine Auskunft des Anbieters über ein Geldlimit.':'The extrapolation is a local approximation based on API prices, not a provider statement about a monetary limit.',
 'der eingeblendeten Zeitfenster':'across the displayed time windows','Messpunkte insgesamt':'measurements in total','Fenstermitteln':'window averages','Fenstermittel aus':'window averages from',
 'enthalten Messpunkte mit unbekannten Modellpreisen.':'contain measurements with unknown model prices.','enthalten Antworten ohne bekannten Modellpreis.':'contain responses without a known model price.',
 'Abschnitte':'periods','Abschnitt':'period',
 'insgesamt':'in total',
 'Messpunkte':'Measurements','Punkte':'Points','Ø Usage':'Average usage','Ø Preisabdeckung':'Average price coverage',
 'Output-Tokens':'output tokens','gelesene Tokens':'tokens read','Cache lesen':'Cache read','Cache schreiben':'Cache write','Davon Reasoning':'Including reasoning',
 'Preisstand-Referenzen':'pricing snapshot references','Preisstand-Referenz':'pricing snapshot reference','Kontextverlauf':'Context history',
 'Service-Tier':'Service tier','aktuelle Hauptfilter':'current primary filters','Hauptsessions':'Main sessions','Aktivität':'Activity',
 'Modelle ohne Preis':'Models without pricing','Aktuelle Filter und gewählter Zeitraum':'Current filters and selected period','Modellname':'Model name','Antworten ohne Preis':'Responses without pricing','Modellnamen':'model names','Preise in den Einstellungen ergänzen':'Add prices in Settings',
 'Für diese Modellnamen konnte keine verlässliche Preiszuordnung gefunden werden. Die Anzahl zeigt, wie viele Modellantworten dadurch ohne Kostenschätzung bleiben.':'No reliable price match was found for these model names. The count shows how many model responses therefore have no cost estimate.',
 'Format für eigene Modellpreise':'Custom model price format','JSON · alle Beträge in USD pro Million Tokens':'JSON · all amounts in USD per million tokens',
 'Jeder Eintrag besteht aus dem exakten Modellnamen und einem Array mit drei bis fünf Preisen. Dezimalzahlen werden mit einem Punkt geschrieben.':'Each entry consists of the exact model name and an array of three to five prices. Use a period as the decimal separator.',
 'Normale Input-Tokens':'Regular input tokens','Wiederverwendete Input-Tokens':'Reused input tokens','Ausgabe inklusive Reasoning':'Output including reasoning',
 'Optional; ohne Angabe gilt der Input-Preis':'Optional; defaults to the input price','Optional; ohne Angabe gilt der vorherige Schreibpreis':'Optional; defaults to the preceding write price',
 'Beispiel':'Example','Das gesamte Feld muss ein gültiges JSON-Objekt sein. Verwende doppelte Anführungszeichen und kein Komma nach dem letzten Eintrag.':'The entire field must be a valid JSON object. Use double quotation marks and no comma after the final entry.',
 'settings.json von Claude Code · zwei Varianten':'Claude Code settings.json · two options',
 'Claude Code übergibt seiner Statusline bei jedem Rendern die aktuellen Limitwerte. Die Bridge greift genau diese ab und verwirft alle übrigen Felder. Diese App sucht die Datei unter':'Claude Code passes the current limit values to its status line on every render. The bridge captures only these values and discards all other fields. This app looks for the file at',
 '; dorthin schreibt die Bridge standardmäßig auch. Ohne sie stammen die Prozentwerte aus':'; by default, the bridge writes there too. Without it, percentages come from',
 'und können mehrere Tage alt sein.':'and may be several days old.',
 'Diesen Block in die settings.json übernehmen. Die Bridge gibt dann selbst eine kompakte Zeile aus: Modell, 5-Stunden-Wert und Wochenwert.':'Add this block to settings.json. The bridge will then output a compact line itself: model, five-hour value, and weekly value.',
 'Den bisherigen Befehl hinter':'Place the existing command after','stellen. Die Bridge reicht die unveränderte Eingabe durch und überlässt ihm die Ausgabe; sichtbar ändert sich nichts.':'. The bridge passes the input through unchanged and lets that command produce the output; nothing changes visually.',
 'Unter Windows kann ein blosses':'On Windows, a bare','über den PATH auf die WSL-Bash zeigen, die Pfade wie /c/Users/… nicht findet. Sicherer ist der absolute Pfad zur gewünschten Bash; in der Git-Bash liefert ihn':'on PATH may resolve to WSL Bash, which cannot find paths such as /c/Users/…. The absolute path to the intended Bash is safer; in Git Bash, obtain it with',
 'Schalter der Bridge':'Bridge options','Befehl':'command','Reicht die Eingabe weiter; der Befehl gibt die Zeile aus':'Passes the input through; the command outputs the line','Schreibt nur die Datei und gibt nichts aus':'Writes only the file and produces no output','Zieldatei umlegen, falls sie nicht am gesuchten Ort landet':'Change the destination file if it does not end up at the expected location','Ohne Argument':'Without an argument','Schreibt die Datei und gibt die eigene kompakte Zeile aus':'Writes the file and outputs its own compact line',
 'Fehler bleiben folgenlos: Bei ungültiger Eingabe, fehlenden Limitfeldern oder nicht startbarem Folgebefehl schreibt die Bridge nichts und endet mit Code 0, damit die Statusline nicht bricht.':'Errors remain harmless: if the input is invalid, limit fields are missing, or the follow-up command cannot start, the bridge writes nothing and exits with code 0 so the status line keeps working.',
 'Vorher:':'Before:','Nachher:':'After:',
 'Cache schreiben, 5 Min.':'Cache write, 5 min.','Cache schreiben, 1 Std.':'Cache write, 1 hr.',
 'Session-Log':'Session log','im gewählten Zeitraum · maximal 100 werden in der Tabelle angezeigt':'in the selected period · at most 100 are shown in the table','Diagramm auf':'chart condensed to','Punkte verdichtet':'points',
 'Backup prüfen':'Review backup','Noch wurde nichts verändert':'Nothing has been changed yet','Diese Wiederherstellung ersetzt den aktuellen App-Datenstand. Unmittelbar davor wird automatisch ein lokaler Rückfallstand gespeichert.':'This restore replaces the current app data. A local fallback snapshot is saved automatically immediately beforehand.',
 'Erstellt':'Created','Größe':'Size','Byte komprimiert':'bytes compressed','Byte entpackt':'bytes unpacked','Formatversion':'Format version','Enthaltene Kategorien':'Included categories','Nicht gefundene Quellordner':'Source folders not found','Neuer absoluter Pfad (optional)':'New absolute path (optional)','Diesen Datenstand wiederherstellen':'Restore this data snapshot',
 'Antworten ohne Preis · Schätzung ist unvollständig':'responses without a price · estimate is incomplete','Im gewählten Zeitraum wurden keine Limitmessungen gespeichert.':'No limit measurements were saved in the selected period.','Noch keine Limitmessungen für dieses Tool gespeichert.':'No limit measurements have been saved for this tool yet.',
 'KI-Tool':'AI tool','KI-Tools':'AI tools','Kennzahlen':'Metrics','Modelle anzeigen':'Show models','Diagramm-Metrik':'Chart metric',
 'Eigene Preise lassen sich in den':'Custom prices can be added in',' ergänzen.':'.','ergänzen.':'.','Vorherige Seite':'Previous page','Nächste Seite':'Next page',
 'aufsteigend':'ascending','absteigend':'descending','Aktualisiert':'Updated','Sichtbare Provider':'Visible providers','anzeigen':'show','Stände':'snapshots',
 'Mit ':'Create a ZIP with ',' ein ZIP ohne persönliche Daten erstellen. Node.js 22+ genügt.':' without personal data. Node.js 22+ is sufficient.'
});

const replacements=Object.entries(phrases).sort((a,b)=>b[0].length-a[0].length);
const monthAndDayReplacements=[
 [/(?<![\p{L}])Montag(?![\p{L}])/gu,'Monday'],[/(?<![\p{L}])Dienstag(?![\p{L}])/gu,'Tuesday'],
 [/(?<![\p{L}])Mittwoch(?![\p{L}])/gu,'Wednesday'],[/(?<![\p{L}])Donnerstag(?![\p{L}])/gu,'Thursday'],
 [/(?<![\p{L}])Freitag(?![\p{L}])/gu,'Friday'],[/(?<![\p{L}])Samstag(?![\p{L}])/gu,'Saturday'],
 [/(?<![\p{L}])Sonntag(?![\p{L}])/gu,'Sunday'],[/(?<![\p{L}])Januar(?![\p{L}])/gu,'January'],
 [/(?<![\p{L}])Februar(?![\p{L}])/gu,'February'],[/(?<![\p{L}])März(?![\p{L}])/gu,'March'],
 [/(?<![\p{L}])Mai(?![\p{L}])/gu,'May'],[/(?<![\p{L}])Juni(?![\p{L}])/gu,'June'],
 [/(?<![\p{L}])Juli(?![\p{L}])/gu,'July'],[/(?<![\p{L}])Oktober(?![\p{L}])/gu,'October'],
 [/(?<![\p{L}])Dezember(?![\p{L}])/gu,'December']
];

export function detectSystemLanguage(navigatorLike=globalThis.navigator){
 const languages=navigatorLike?.languages?.length?navigatorLike.languages:[navigatorLike?.language];
 return String(languages.find(Boolean)||'').toLowerCase().startsWith('de')?'de':'en';
}

export function getLanguageChoice(storage=globalThis.localStorage){
 try{const saved=storage?.getItem(STORAGE_KEY);return choices.has(saved)?saved:'system';}catch{return 'system';}
}

export function language(choice=getLanguageChoice(),navigatorLike=globalThis.navigator){return choice==='system'?detectSystemLanguage(navigatorLike):choice;}
export function locale(){return language()==='de'?'de-DE':'en-US';}

export function translateGerman(value){
 let result=String(value??'');
 result=result
  .replace(/Für (\d[\d.,]*) Modellantworten fehlt ein verlässlicher Preis\./g,'For $1 model responses, no reliable price is available.')
  .replace(/(\d[\d.,]*) Fenstermittel enthalten Messpunkte mit unbekannten Modellpreisen\./g,'$1 window averages contain measurements with unknown model prices.')
  .replace(/(\d[\d.,]*) Einzelmessungen enthalten Antworten ohne bekannten Modellpreis\./g,'$1 individual measurements contain responses without a known model price.')
  .replace(/(\d[\d.,]*) Fenstermittel aus (\d[\d.,]*) Messpunkten/g,'$1 window averages from $2 measurements')
  .replace(/(\d[\d.,]*) Modellnamen · (\d[\d.,]*) Antworten ohne Preis/g,(_,models,responses)=>`${models} ${Number(String(models).replace(/\D/g,''))===1?'model name':'model names'} · ${responses} responses without pricing`)
  .replace(/(\d[\d.,]*) Einzelmessungen/g,'$1 individual measurements')
  .replace(/(\d[\d.,]*) Fenstermitteln/g,'$1 window averages')
  .replace(/(\d[\d.,]*) Modellnamen/g,'$1 model names')
  .replace(/([\d.,]+[KMB]?) von ([\d.,]+[KMB]?) Tokens/g,'$1 of $2 tokens')
  .replace(/(\d+)–(\d+) von (\d+)/g,'$1–$2 of $3')
  .replace(/(\d[\d.,]*) von (\d[\d.,]*)/g,'$1 of $2')
  .replace(/(\d[\d.,]*) Antworten ohne bekannten Preis/g,'$1 responses without a known price')
  .replace(/(\d[\d.,]*) von (\d[\d.,]*)/g,'$1 of $2')
  .replace(/(\d[\d.,]*) ohne Preis/g,'$1 without a price')
  .replace(/(\d[\d.,]*) erfasste Modellantworten/g,'$1 recorded model responses')
  .replace(/(\d[\d.,]*) Repositories/g,'$1 repositories')
  .replace(/(\d[\d.,]*) Sessions/g,'$1 sessions')
  .replace(/(\d[\d.,]*) Gruppen/g,'$1 groups')
  .replace(/(\d[\d.,]*) Messpunkte(?![\p{L}])/gu,'$1 measurements')
  .replace(/(\d[\d.,]*) Warnungen/g,'$1 warnings')
  .replace(/(\d[\d.,]*) Modelle/g,'$1 models');
 const escapeRegExp=source=>source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 for(const [source,target] of replacements)if(result.includes(source)){
  const standalone=/^[\p{L}][\p{L}-]*$/u.test(source);
  result=standalone?result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(source)}(?![\\p{L}\\p{N}])`,'gu'),target):result.replaceAll(source,target);
 }
 for(const [pattern,target] of monthAndDayReplacements)result=result.replace(pattern,target);
 result=result
  .replace(/(\d[\d.,]*) Antworten ohne bekannten Preis/g,'$1 responses without a known price')
  .replace(/(\d[\d.,]*) ohne Preis/g,'$1 without a price')
  .replace(/(\d[\d.,]*) erfasste Modellantworten/g,'$1 recorded model responses')
  .replace(/(\d[\d.,]*) Repositories/g,'$1 repositories')
  .replace(/(\d[\d.,]*) Sessions/g,'$1 sessions')
  .replace(/(\d[\d.,]*) Gruppen/g,'$1 groups')
  .replace(/(\d[\d.,]*) Messpunkte(?![\p{L}])/gu,'$1 measurements')
  .replace(/(\d[\d.,]*) Warnungen/g,'$1 warnings')
  .replace(/(\d[\d.,]*) Modelle/g,'$1 models')
  .replace(/Woche ab /g,'Week of ')
  .replace(/ zur Vorperiode/g,' vs. previous period')
  .replace(/ Prozentpunkte/g,' percentage points')
  .replace(/ sortieren/g,' sort')
  .replace(/, aktuell aufsteigend/g,', currently ascending')
  .replace(/, aktuell absteigend/g,', currently descending');
 return result;
}

const textSources=new WeakMap(),attributeSources=new WeakMap();
const attributes=['aria-label','aria-description','placeholder','title','data-tip'];
const excluded='script,style,code,pre,textarea,[data-i18n="off"]';

function localizeTextNode(node,targetLanguage){
 if(!node.nodeValue||!node.nodeValue.trim()||node.parentElement?.closest(excluded))return;
 let source=textSources.get(node),current=node.nodeValue;
 if(!source||current!==source.de&&current!==source.en){source={de:current,en:translateGerman(current)};textSources.set(node,source);}
 const next=targetLanguage==='en'?source.en:source.de;if(current!==next)node.nodeValue=next;
}

function localizeAttribute(element,name,targetLanguage){
 if(element.closest(excluded)&&name!=='aria-label')return;
 const current=element.getAttribute(name);if(current===null)return;
 let sources=attributeSources.get(element);if(!sources){sources=new Map();attributeSources.set(element,sources);}
 let source=sources.get(name);
 if(!source||current!==source.de&&current!==source.en){source={de:current,en:translateGerman(current)};sources.set(name,source);}
 const next=targetLanguage==='en'?source.en:source.de;if(current!==next)element.setAttribute(name,next);
}

export function localizeTree(root=globalThis.document?.documentElement,targetLanguage=language()){
 if(!root)return;
 if(root.nodeType===3)localizeTextNode(root,targetLanguage);
 else{
  if(root.nodeType===1)for(const name of attributes)localizeAttribute(root,name,targetLanguage);
  const walker=root.ownerDocument.createTreeWalker(root,globalThis.NodeFilter?.SHOW_TEXT??4);
  for(let node=walker.nextNode();node;node=walker.nextNode())localizeTextNode(node,targetLanguage);
  if(root.querySelectorAll)for(const element of root.querySelectorAll(attributes.map(name=>`[${name}]`).join(',')))for(const name of attributes)localizeAttribute(element,name,targetLanguage);
 }
 const document=root.ownerDocument||root;if(document?.documentElement)document.documentElement.lang=targetLanguage;
}

const listeners=new Set();
export function onLanguageChange(listener){listeners.add(listener);return()=>listeners.delete(listener);}

export function setLanguageChoice(choice,{storage=globalThis.localStorage}={}){
 const next=choices.has(choice)?choice:'system';
 try{if(next==='system')storage?.removeItem(STORAGE_KEY);else storage?.setItem(STORAGE_KEY,next);}catch{}
 for(const listener of listeners)listener({choice:next,language:language(next)});
}

export function installLocalization(documentLike=globalThis.document,windowLike=globalThis.window){
 const refresh=()=>localizeTree(documentLike.documentElement,language());
 refresh();
 const observer=new MutationObserver(records=>{
  const targetLanguage=language();
  for(const record of records){
   if(record.type==='characterData')localizeTextNode(record.target,targetLanguage);
   else if(record.type==='attributes')localizeAttribute(record.target,record.attributeName,targetLanguage);
   else for(const node of record.addedNodes)localizeTree(node,targetLanguage);
  }
 });
 observer.observe(documentLike.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
 const unsubscribe=onLanguageChange(refresh),systemChanged=()=>{if(getLanguageChoice()==='system'){for(const listener of listeners)listener({choice:'system',language:language()});}};
 windowLike?.addEventListener?.('languagechange',systemChanged);
 return {refresh,destroy(){observer.disconnect();unsubscribe();windowLike?.removeEventListener?.('languagechange',systemChanged);}};
}

export const languageStorageKey=STORAGE_KEY;
