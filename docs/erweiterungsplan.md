# Session Atlas: Erweiterungsplan

Stand: 15. September 2026. Grundlage: aktueller Repository-Stand, README, Parser, Store, Preisverwaltung, Server und Oberfläche.

Status: Planung. Dieses Dokument beschreibt zehn Erweiterungen; die Funktionen sind noch nicht implementiert. Die vorgeschlagenen Dateinamen und Schnittstellen sind Arbeitsvorschläge.

## 1. Ziel und Leitlinien

Session Atlas soll drei Fragen schneller beantworten:

1. Wie hat sich meine Nutzung verändert und welche Projekte oder Modelle tragen dazu bei?
2. Was hat eine vollständige Aufgabe einschließlich ihrer Subagents verbraucht?
3. Wie kann ich meine lokale Nutzungshistorie zuverlässig auswerten, organisieren und sichern?

Für die Umsetzung gelten diese Leitlinien:

- Lokaler Betrieb und Offline-Auswertung bleiben die Grundlage. Preisabrufe erfolgen weiterhin ausdrücklich per Klick.
- Die Anwendung verwendet weiterhin Node-Bordmittel sowie HTML, CSS und JavaScript. Zusätzliche Laufzeitabhängigkeiten sind für die geplanten Funktionen zunächst nicht nötig.
- Kosten bleiben geschätzte API-Gegenwerte in USD. Aboauslastung, Tokenverbrauch und API-Gegenwert bleiben getrennte Kennzahlen.
- Fehlende Messwerte und Preise erscheinen als unbekannt. Fehlende Zeitabschnitte werden nicht als gemessene Null interpretiert.
- Prompts und Antworttexte werden für die neuen Analysen nicht gespeichert.
- Bestehende Filter wirken einheitlich auf Diagramme, Tabellen, Detailansichten und Exporte. Abweichungen werden sichtbar bezeichnet.
- Neue Datenformate sind versioniert. Migrationen erhalten die bestehende Nutzungshistorie, einschließlich Daten aus inzwischen gelöschten Quelldateien.
- Die Standardaktualisierung bleibt an das fokussierte App-Fenster gebunden. Hintergrundüberwachung ist ein eigener, optionaler Ausbau.

## 2. Ausgangslage und Prioritäten

| ID | Erweiterung | Vorhandene Grundlage | Wichtigste neue Arbeit | Aufwand |
| --- | --- | --- | --- | --- |
| E1 | Zeiträume direkt vergleichen | Datumsfilter, Aggregationen, Diagramme, Vorperiodenwerte in Details | Gemeinsame Vergleichslogik, zwei Zeitreihen, Ursachenaufschlüsselung | Mittel |
| E2 | Hauptsession und Subagents zusammenführen | Kennzeichnung und Gruppierung nach Sessiontyp | Belastbare Elternbeziehungen, Aufgabenbaum, deduplizierte Gesamtsummen | Groß |
| E3 | Limitverlauf und Schwellenhinweise | Letzter Messwert, Quelle, Messzeitpunkt und Reset | Messwerthistorie, Fensterzuordnung, Hinweise ohne Wiederholungen | Mittel bis groß |
| E4 | Gespeicherte Ansichten und Projekt-Tags | Kombinierte Filter und Repository-Erkennung | Persistente Ansichten, eigene Projektgruppen und Tags | Mittel |
| E5 | Kontextverlauf innerhalb einer Session | Letzter Kontextstand, Modelle und Antwortereignisse | Zusätzliche Parserereignisse, Verlauf und Ereignismarker | Groß |
| E6 | Preisstände historisch speichern | Mitgelieferte, abgerufene und manuelle Preise | Versionierte Preisstände und reproduzierbare Kostenberechnung | Groß |
| E7 | Lokales Backup und Wiederherstellung | Lokaler Cache und Einstellungsdateien | Konsistente Sicherung, Importprüfung, Wiederherstellung und Rückfall | Groß |
| E8 | Aktivitätskalender | Zeitstempel und aggregierbare Nutzungsereignisse | Tagesraster, Filteranbindung, Tastaturbedienung | Klein bis mittel |
| E9 | Preisformular statt JSON | Preisvalidierung und JSON-Eingabe | Formulare, Quellenanzeige und transparente Standardwerte | Klein bis mittel |
| E10 | Anonymisierter Export | CSV-Export der gefilterten Ereignisse | Exportprofil, konsistente Ersatzbezeichnungen und Vorschau | Klein bis mittel |

Die Aufwandsklassen sind relative Einschätzungen einschließlich Integration und Prüfung, keine verbindlichen Zeitzusagen. Bei E2 und E5 entscheidet eine Untersuchung der verfügbaren Logformate über den tatsächlich erreichbaren Umfang. E7 ist wegen der möglichen historischen Einzigartigkeit des Caches anspruchsvoller als ein einfacher Datei-Download.

Fachliche Priorität: E1, E2 und E3 bringen den größten unmittelbaren Analysegewinn. Technisch werden Datensicherung und Migrationsgrundlagen vor umfangreichen Änderungen an gespeicherten Daten umgesetzt.

## 3. Gemeinsame Grundlagen

### 3.1 Einheitlicher Auswertungskontext

Eine gemeinsame Beschreibung der Auswahl enthält Zeitraum, KI-Tool, Repository beziehungsweise Projektgruppe, Suche, Modellfilter, Tags, Gruppierung und Sortierung. Für neue Filter werden die bisher vorhandenen Steuerelemente gezielt erweitert.

- Filter und Datumsberechnung werden aus mehrfach vorhandener UI-Logik in gemeinsam nutzbare Funktionen überführt.
- Zeitstempel werden intern in UTC gespeichert; Kalendertage und Wochen werden in einer expliziten Auswertungszeitzone gebildet. Vorgabe ist die lokale Zeitzone des Browsers.
- Wochen beginnen montags. Sommerzeit und lokale Tagesgrenzen werden bei allen Ansichten gleich behandelt.
- Reine Kalenderschlüssel wie `2026-09-15` werden getrennt von Zeitpunkten behandelt.
- Einheiten und Zählweisen bleiben identisch: Cache und Reasoning werden nicht doppelt gezählt; Aufgaben-, Session- und Antwortanzahl sind getrennt.

### 3.2 Versionierte Speicherung und Migration

- Ein kleiner gemeinsamer Speicherbaustein übernimmt Schema-Prüfung, temporäres Schreiben und sichere Übernahme.
- Vor Änderungen am bestehenden Cache wird eine lokale Sicherung angelegt. Ein fehlgeschlagener Umbau darf den bisherigen Stand nicht ersetzen.
- Neue optionale Felder können fehlen, ohne alte Sessions auszuschließen.
- Elternbeziehungen und Kontextverläufe erfordern eine eigene Parser-Version pro eingelesener Datei. Nur das Hinzufügen neuer Felder reicht nicht: unveränderte Dateien würden sonst weiterhin übersprungen.
- Noch vorhandene Logs werden für neue Parserdaten kontrolliert erneut gelesen. Nutzungsereignisse aus fehlenden Logs bleiben erhalten; neue Zusatzinformationen werden dort als nicht verfügbar ausgewiesen.
- Neuimport, Wiederherstellung, Scans und andere schreibende Vorgänge werden koordiniert. Ein Scan darf keine zurückgespielten Daten mit einem älteren Speicherstand überschreiben.

### 3.3 Oberfläche und Module

- Bestehende Gestaltung, Darstellungseinstellungen und Diagrammkomponenten weiterverwenden.
- Neue größere Funktionen in eigene Module aufteilen, etwa `comparison.js`, `activity-calendar.js`, `export.js` und passende Servermodule.
- Zusätzliche Browsermodule in die ausdrückliche Liste ausgelieferter Dateien im Server aufnehmen.
- Keine neue Hauptnavigation pro Kleinfeature: Vergleich und Kalender gehören zur Übersicht, Aufgaben zur Sessionansicht, Preisverwaltung und Backup in die Einstellungen.

## 4. E1: Zeiträume direkt vergleichen

### Ziel und Bedienung

Die Frage „Warum ist mein Verbrauch gestiegen?“ soll aus der Übersicht beantwortbar sein.

- Schalter „Vergleichen“ neben der Zeitraumwahl.
- Auswahl: vorheriger gleich langer Zeitraum, vorige Kalenderwoche, voriger Kalendermonat oder frei gewählter Vergleichszeitraum.
- Bei laufender Woche beziehungsweise laufendem Monat standardmäßig den bisher verstrichenen Abschnitt mit demselben Abschnitt der Vorperiode vergleichen. Vollständige Perioden sind ausdrücklich wählbar.
- Beide tatsächlich verwendeten Zeiträume mit Datum anzeigen.
- Kennzahlen: Tokens, API-Gegenwert, Modellantworten, Sessions und Cache-Anteil.
- Verlauf mit zwei unterscheidbaren Linien; die relative Position innerhalb der Periode bildet die gemeinsame Achse. Tool-Aufteilung zunächst als Filter, damit das Diagramm übersichtlich bleibt.
- Tabelle „Was hat sich verändert?“ mit Umschaltung zwischen Projekten, Modellen und KI-Tools: Vorwert, aktueller Wert und absolute sowie relative Veränderung.
- Klick auf einen Eintrag übernimmt die entsprechende Einschränkung in beide Vergleichsseiten.

### Berechnungsregeln

- Bei Vorwert null: „Neu“ statt einer unendlichen Prozentzahl; bei beiden Werten null: keine Veränderung.
- Änderungen des Cache-Anteils in Prozentpunkten zeigen.
- Unterschiedlich lange frei gewählte Zeiträume sichtbar kennzeichnen; optional Durchschnitt pro Kalendertag ergänzen.
- Bei vollständigen Monaten mit verschiedener Tageszahl fehlende Vergleichstage nicht als gemessene Null darstellen.
- Unbekannte Kosten pro Seite separat ausweisen. Bei unvollständiger Preisabdeckung ist eine Kostendifferenz als eingeschränkt vergleichbar zu kennzeichnen.
- Kosten zunächst auf derselben aktuellen Preisbasis berechnen; nach E6 den gewählten Bewertungsmodus auf beide Seiten anwenden.
- Beiträge zur Veränderung werden pro Dimension berechnet. Beiträge nach Modell und Projekt dürfen nicht miteinander addiert werden.

### Technische Arbeit

Gemeinsame Zeitraum- und Filterlogik in `public/analytics-core.js` erweitern; bestehende Vorperiodenberechnung in `public/details.js` darauf umstellen; Vergleichskomponenten in Übersicht und Diagrammen ergänzen. Serverseitige Aggregation erst bei gemessenem Bedarf.

### Abnahme

- Monatswechsel, Sommerzeit, leere Perioden und laufende Perioden liefern nachvollziehbare Grenzen.
- Je Dimension ergibt die Summe aller absoluten Beiträge die Gesamtveränderung derselben Kennzahl.
- Filter gelten auf beiden Seiten identisch; Diagramm, Tabelle und Details stimmen überein.
- Vorhandene einfache Vorperiodenwerte verwenden dieselben Regeln.

## 5. E2: Hauptsession und Subagents als Aufgabe

### Ziel und Bedienung

Eine Aufgabe zeigt den Verbrauch der Hauptsession und aller zuverlässig zugehörigen Agents.

- In der Sessionansicht zwischen „Einzelne Sessions“ und „Aufgaben“ wechseln.
- Aufgabenzeile mit Titel der Hauptsession, KI-Tool, Projekt, letzter Aktivität, Anzahl zugehöriger Sessions und Gesamtverbrauch.
- Aufklappbarer Baum mit Hauptsession, direkten Subagents und weiteren Ebenen.
- Pro Knoten Eigenverbrauch und Verbrauch einschließlich untergeordneter Agents unterscheiden.
- Detailansicht mit Verteilung auf Agents und Modelle sowie Navigation zur einzelnen Session.
- Bei aktiven Zeitfiltern nur Ereignisse des gewählten Zeitraums summieren. Eltern außerhalb des Zeitraums können zur Orientierung sichtbar bleiben.

### Datenbedarf und Vorprüfung

- Zuerst feststellen, welche vorhandenen Claude- und Codex-Logvarianten explizite Eltern- oder Ursprungsbeziehungen enthalten.
- Kleine bereinigte Testbeispiele mit und ohne Beziehung, mit Archivduplikaten und mit mehreren Delegationsebenen erstellen.
- Vorgeschlagene Metadaten: Eltern-ID, Beziehungstyp, Herkunft des Nachweises und Parser-Version.
- Fork beziehungsweise Fortsetzung und tatsächlich delegierter Subagent werden unterschieden. Ein Fork wird nicht allein wegen einer Ursprungs-ID als Kindaufgabe addiert.
- Zeitliche Nähe, gemeinsamer Ordner und Branch reichen für eine automatische Zuordnung nicht aus.
- Sessions ohne sicheren Bezug erscheinen unter „Nicht zugeordnet“. Fehlende oder widersprüchliche Beziehungen bleiben sichtbar.

### Technische Arbeit

Parser und Cache ergänzen; beim Snapshot oder in einer eigenen Analysefunktion einen zyklusfreien Aufgabenbaum bilden. Selbstreferenzen, Zyklen, fehlende Eltern und mehrdeutige IDs abfangen. Die bisherige Deduplizierung von Antworten und geerbten Codex-Verläufen bleibt die Grundlage.

### Abnahme

- Aufgaben-Gesamtwerte entsprechen der Summe der eindeutigen Nutzungsereignisse ihrer zugehörigen Sessions.
- Hauptsessions, Kindzeilen und Zwischensummen werden in übergeordneten Summen nicht mehrfach gezählt.
- Ein Baum funktioniert auch, wenn das Elternlog fehlt oder erst später eingelesen wird.
- Alte Logs ohne Beziehung bleiben vollständig als einzelne Sessions auswertbar.
- Die Vorprüfung dokumentiert ausdrücklich, für welche Logvarianten die Zuordnung möglich ist.

## 6. E3: Limitverlauf und Schwellenhinweise

### Ziel und Bedienung

Die bestehenden Limitkarten erhalten eine Verlaufsansicht und konfigurierbare Hinweise.

- Verlauf getrennt nach Tool und 5-Stunden- beziehungsweise Wochenfenster öffnen.
- Messpunkte mit Auslastung, Messzeitpunkt, Quelle und Reset anzeigen.
- Lücken und Quellenwechsel sichtbar machen; keine durchgehende Linie über einen Reset oder unbeobachteten Zeitraum suggerieren.
- Voreinstellung für optionale Hinweise: 80 % und 95 %. Schwellen pro Tool und Fenstertyp anpassbar.
- In-App-Hinweis nennt Tool, Fenster, gemessene Auslastung und Resetzeit.

### Speicherung und Auslösung

- Beobachtungen getrennt vom letzten Sessionzustand speichern: Tool, Limitkennung, Fensterdauer, Reset, Auslastung, Quellzeitpunkt und Erfassungszeitpunkt.
- Wiederholt eingelesene identische Quellmesswerte nicht als neue Beobachtung speichern.
- Einen neuen Messwert auch dann übernehmen, wenn keine Sessiondatei geändert wurde; das betrifft insbesondere die Claude-Bridge.
- Bekannte alte Codex-Messwerte nur aus noch vorhandenen Logs nachlesen. Für Claude nicht nachträglich Beobachtungen zwischen vorhandenen Messpunkten erzeugen.
- Hinweis pro Schwelle und Resetfenster höchstens einmal auslösen. Bei einem Sprung über mehrere Schwellen nur die höchste neu überschrittene Schwelle melden und die niedrigeren als verarbeitet markieren.
- Meldestatus über Neustarts hinweg speichern und zwischen App-Fenstern koordinieren.
- Abgelaufene Messwerte lösen keine Hinweise aus. Ein fehlender Reset wird ausdrücklich behandelt und darf keine unbegrenzten Wiederholungen verursachen.
- Vorgeschlagene Aufbewahrung: 90 Tage, sichtbar einstellbar. Ältere Messpunkte erst nach Anwendung der gewählten Aufbewahrungsregel entfernen.

### Optionaler Folgeausbau: Hintergrundmeldungen

Der erste Umfang prüft bei den ohnehin stattfindenden Aktualisierungen der aktiven App. Ein weiterer Schritt kann ausdrücklich aktivierbares serverseitiges Polling und Betriebssystemmeldungen ergänzen. Dafür sind Ressourcenverbrauch, Windows-Zustellung, Mehrfensterverhalten und Browserberechtigungen gesondert zu prüfen. Browsermeldungen allein garantieren keine Überwachung bei geschlossener App.

### Abnahme

- Identische Messwerte, App-Neustarts und mehrere Fenster erzeugen keine Meldungsserie.
- Resets beginnen ein neues Benachrichtigungsfenster.
- Ein alter oder abgelaufener Messwert wird nicht als frische Auslastung verwendet.
- Quelle, Messzeitpunkt und Erfassungslücken bleiben nachvollziehbar.
- Die Standardversion startet keinen zusätzlichen Hintergrundtimer.

## 7. E4: Gespeicherte Ansichten und Projekt-Tags

### Ziel und Bedienung

Wiederkehrende Auswertungen sind mit einem Klick erreichbar; mehrere Repositories lassen sich fachlich zusammenfassen.

- Aktuelle Auswahl unter einem Namen speichern, beispielsweise „Claude · Kundenportal · letzte 7 Tage“.
- Ansichten umbenennen, überschreiben, löschen und als Startansicht festlegen.
- Relative Zeiträume bleiben relativ; frei gewählte feste Daten bleiben fest.
- Projektgruppen mit Name, optionaler Farbe und zugeordneten Repositories oder Arbeitsordnern anlegen.
- Freie Tags wie „Privat“, „Kunde A“ oder „Experiment“ vergeben und danach filtern.
- Zugeordnete Projektgruppe und Tags in Details anzeigen.

### Regeln und Datenmodell

- Gespeichert werden nur Auswahldaten, keine Kopien der Nutzungsereignisse.
- Ansichten und Projektgruppen besitzen stabile interne IDs; Änderungen des Anzeigenamens ändern keine Zuordnung.
- Für eindeutige Projekt-Gesamtsummen gehört ein Repository zunächst höchstens zu einer primären Projektgruppe.
- Tags dürfen sich überschneiden. Summen mehrerer Tag-Gruppen sind deshalb nicht additiv; eine kombinierte Auswahl verwendet die Vereinigungsmenge der Ereignisse ohne Duplikate.
- Ohne Projektzuordnung bleibt das bisherige Repository als Auswertungsgruppe verfügbar.
- Tags gelten zunächst für Projekte beziehungsweise Repositories, nicht für beliebige einzelne Antworten.
- Fehlende Quellordner und entfernte Repositories werden in gespeicherten Ansichten als fehlende Zuordnung angezeigt. Die Ansicht darf nicht unbemerkt auf „Alle“ ausweiten.
- Speicherung in einer versionierten lokalen Organisationsdatei, die E7 mitsichert.

### Abnahme

- Ansichten überstehen Neustarts und lösen relative Zeiträume beim Öffnen neu auf.
- Projektumbenennungen erhalten Zuordnungen.
- Mehrfach-Tags verursachen keine Doppelzählung in Gesamtsummen.
- Fehlende Filterziele sind erkennbar und schränken weiterhin sicher ein.

## 8. E5: Kontextverlauf innerhalb einer Session

### Ziel und Bedienung

Die Sessiondetails zeigen die Entwicklung des tatsächlich protokollierten Kontextstands.

- Diagramm „Kontextverlauf“ mit Zeit beziehungsweise Antwortreihenfolge auf der horizontalen Achse.
- Anzeige in Tokens, ergänzend in Prozent des jeweils bekannten Kontextfensters.
- Modellwechsel, Änderungen des Kontextfensters und explizit protokollierte Komprimierungen markieren.
- Hover beziehungsweise Tastaturfokus zeigt Zeitpunkt, Modell, belegten Kontext und Fenstergröße.
- Der Verlauf kann neben der Tokenverteilung helfen, große Eingaben und wiederholte Kontextnutzung zeitlich einzuordnen.

### Datenbedarf und Grenzen

- Vorprüfung je Tool: Welche Felder messen tatsächlichen Kontext, welche nur kumulative Nutzung oder Input einer einzelnen Antwort?
- Kontextproben als eigene Ereignisse speichern. Vorgeschlagene Felder: Zeit, Modell, belegte Tokens, Fenstergröße, Quelltyp und optionale Antwortreferenz.
- Kumulierte Sessiontokens nicht als Kontextfüllstand ausgeben.
- Nur explizite Komprimierungsereignisse entsprechend beschriften. Ein bloßer Rückgang des Werts ist kein ausreichender Beleg.
- Bei Modellwechseln wechselnde Nenner für die Prozentdarstellung berücksichtigen.
- Falls ein Format nur den aktuellen letzten Stand liefert, diesen weiterhin zeigen und den Verlauf als nicht verfügbar kennzeichnen.
- Fehlende historische Daten können nur aus noch vorhandenen Logs ergänzt werden.

### Abnahme

- Ein synthetischer Verlauf mit Modellwechsel, verändertem Fenster, Komprimierung und Datenlücke wird korrekt angezeigt.
- Fehlende Fenstergrößen ergeben keine erfundenen Prozentwerte.
- Wiederholte Metadaten und Archivkopien erzeugen keine doppelten Verlaufspunkte.
- Bestehende Token- und Kostensummen ändern sich durch Kontextproben nicht.

## 9. E6: Historische Preisstände

### Ziel und Bedienung

Ein Preisupdate soll nachvollziehbar bleiben und reproduzierbare Auswertungen ermöglichen.

- Auswahl zwischen „Aktuelle Preise“ und „Historisch hinterlegte Preise“.
- Preisverwaltung zeigt gespeicherte Stände, Herkunft, Erfassungszeitpunkt und lokale Gültigkeit.
- Manuelle Preisänderungen können ab einem angegebenen Zeitpunkt gelten.
- In den Details nachvollziehbar machen, welcher Preisstand und welche Berechnungsregeln verwendet wurden.
- Nach Preisänderungen auf Wunsch denselben Zeitraum mit zwei Preisständen vergleichen, um den Preiseffekt zu sehen.

### Wichtige fachliche Festlegung

Ein Abrufzeitpunkt ist kein Beleg für das tatsächliche Änderungsdatum eines Anbieterpreises. „Historisch hinterlegt“ bedeutet den zu diesem Ereigniszeitpunkt lokal gültigen hinterlegten Stand. Tatsächliche historische Anbieterpreise können nur durch zusätzlich verifizierte oder manuell eingetragene Gültigkeitsdaten abgebildet werden.

Für Zeiten vor dem ersten verlässlich zugeordneten Preisstand gilt im historischen Modus „Kein historischer Preisstand“. Die App kann diese alten Ereignisse weiterhin mit aktuellen Preisen schätzen, muss dies aber ausdrücklich als anderen Bewertungsmodus kennzeichnen.

### Technische Arbeit

- Preisstände unveränderlich und versioniert speichern; eine Korrektur erzeugt einen neuen Stand.
- Bei Einführung die vorhandenen manuellen und abgerufenen Preise als initialen lokalen Stand sichern. Aus bekannten Abrufdaten keine weiter zurückreichende Anbieterhistorie ableiten.
- Quellen und manuelle Überschreibungen einschließlich Entfernung einer Überschreibung abbilden.
- Die fünf Preiskategorien erhalten; unbekannte Kategorien nicht stillschweigend zu null machen.
- Preisauflösung von Kostenberechnung trennen: Ereignis plus gewählter Preisstand plus versioniertes Regelwerk ergeben Kosten und Nachweis.
- Auch bekannte Kontextaufschläge, Service-Tiers und regionale Faktoren müssen an ein reproduzierbares Regelwerk gebunden sein. Nur eine alte Basistabelle zu speichern reicht nicht.
- Erneuter Abruf unveränderter Preise kann denselben Preisstand referenzieren; Abrufhistorie bleibt separat nachvollziehbar.
- CSV-Export um Bewertungsmodus und Referenz auf den Preisstand ergänzen, ohne bisherige Spalten bedeutungsändernd umzunutzen.

### Abnahme

- Eine historische Auswertung bleibt nach einem neuen Preisabruf und App-Neustart bei gleichem Stand und Regelwerk identisch.
- Aktuelle Bewertung reagiert weiterhin auf neue Preise.
- Manuelle Preise, entfernte Überschreibungen und Modellnamen mit Datumszusatz werden konsistent aufgelöst.
- Unbekannte historische Kategorien bleiben unbekannt.
- Vergleichsansicht und Exporte verwenden denselben gewählten Modus.

## 10. E7: Lokales Backup und Wiederherstellung

### Ziel und Bedienung

Unter Einstellungen eine vollständige lokale Sicherung erstellen und kontrolliert zurückspielen.

- „Backup erstellen“ lädt eine Sicherungsdatei mit Manifest, Version, Erstellungsdatum und enthaltenen Kategorien herunter.
- Enthalten: Nutzungscache, Einstellungen, aktuelle Preise, Preisgeschichte, Limitgeschichte, gespeicherte Ansichten, Projektgruppen und Tags, sobald diese existieren.
- Die Sicherung enthält persönliche Metadaten wie Pfade und Sessiontitel. Dies direkt vor dem Download verständlich angeben.
- Beim Import zuerst prüfen und eine Vorschau mit Datum, Größe, Sessionanzahl und enthaltenen Kategorien zeigen.
- Bei Wiederherstellung auf einem anderen Rechner Quellordner prüfen und eine Zuordnung anbieten. Gesicherte Historie muss auch ohne verfügbare Originalpfade zugänglich bleiben; gesicherte und live eingelesene Daten dürfen beim späteren Wiederanschluss nicht doppelt zählen.
- Wiederherstellen ersetzt den aktuellen App-Datenstand nach Bestätigung der konkreten Vorschau. Unmittelbar vorher automatisch einen Rückfallstand sichern.

### Technische Arbeit

- Ein versioniertes, komprimiertes JSON-Containerformat mit Node-Bordmitteln verwenden. Keine beliebigen Archivpfade extrahieren.
- Export als konsistenten Schnappschuss erstellen: laufenden Scan abschließen lassen und Schreibvorgänge während der Aufnahme koordinieren.
- Große Backups als Download beziehungsweise Upload verarbeiten. Der bestehende allgemeine POST-Grenzwert von 64 KB ist dafür ungeeignet; eine eigene begrenzte Importschnittstelle vorsehen.
- Komprimierte und entpackte Größe begrenzen; Größenlimit verständlich mitteilen. Version, Datentypen, IDs und Integritätsprüfsummen vor Übernahme validieren.
- Prüfsummen erkennen Beschädigung, sind kein Nachweis einer vertrauenswürdigen Herkunft.
- Import in einen vorbereiteten Datenstand schreiben und erst nach vollständiger Prüfung aktivieren. Da mehrere Dateien beteiligt sind, reicht einzelnes Umbenennen pro Datei nicht für eine konsistente Übernahme; ein Manifest beziehungsweise ein wechselbarer Datenstand muss den aktiven Satz eindeutig bestimmen.
- Flüchtige Browser- oder Serversitzungstokens nicht sichern oder wiederherstellen.
- Windows-Autostart bei einer Wiederherstellung nicht automatisch verändern.
- Wiederherstellungsfunktion zuerst als Ersetzen auslegen. Ein Zusammenführen unabhängiger Backups ist ein späterer Ausbau mit eigener Konfliktlogik.

### Abnahme

- Export und Wiederherstellung erzeugen dieselben Auswertungen und Einstellungen.
- Defekte, zu große oder inkompatible Sicherungen verändern den aktiven Datenstand nicht.
- Ein unterbrochener Import lässt den bisherigen oder vollständig neuen Datenstand startfähig zurück.
- Gleichzeitige Aktualisierungsanfragen können die Wiederherstellung nicht überschreiben.
- Historie aus gelöschten Logs und von einem anderen Rechner bleibt lesbar.
- Das portable Programm-ZIP enthält weiterhin keine Sicherungen oder persönlichen Daten.

## 11. E8: Aktivitätskalender

### Ziel und Bedienung

Ein Kalender macht aktive Tage, Spitzen und Nutzungspausen auf einen Blick sichtbar.

- In der Übersicht zwischen bestehendem Verlauf und Kalender umschalten.
- Vorgabe: letzte zwölf Monate; Jahresauswahl ergänzen.
- Kennzahl wählen: Tokens, API-Gegenwert oder Modellantworten.
- Jeder Tag erhält eine Intensität auf einer erklärten Farbskala.
- Tooltip mit Datum, Kennzahl, Sessions und Aufteilung nach KI-Tool.
- Klick oder Enter wählt den Tag aus und aktualisiert Tabelle und Details. Eine sichtbare Aktion hebt die Tagesauswahl auf.

### Umsetzung

- Vorhandene Ereignisse nach lokalen Kalendertagen aggregieren; E1-Datumsfunktionen wiederverwenden.
- Null Aktivität, unbekannte Kosten, künftige Tage und Tage außerhalb der Auswahl visuell unterscheiden.
- Bei Kosten bekannter Anteil und unbekannte Antworten gemeinsam im Tooltip nennen.
- Skala innerhalb der sichtbaren Auswahl konsistent halten und beschriften.
- Tastaturbedienung und verständliche Beschriftungen vorsehen; Informationen nicht ausschließlich durch Farbe vermitteln.

### Abnahme

- Schaltjahre, Jahreswechsel und Sommerzeit verändern die Tageszuordnung nicht unerwartet.
- Die Summe der Kalendertage entspricht dem gleichen ausgewählten Zeitraum in der Tabelle.
- Ein ausgewählter Tag führt zu genau den zugehörigen Ereignissen.
- Helle und dunkle Darstellung sowie schmale Fenster sind geprüft.

## 12. E9: Preisformular statt JSON

### Ziel und Bedienung

Eigene Modellpreise lassen sich ohne Kenntnis des bisherigen Arrayformats pflegen.

- Modelle suchen, vorhandene Überschreibungen bearbeiten und neue Modelle hinzufügen.
- Beschriftete Felder für Input, Cache lesen, Output, Cache schreiben 5 Minuten und Cache schreiben 1 Stunde; Einheit überall USD pro Million Tokens.
- Quelle des wirksamen Werts zeigen: manuell, abgerufen oder mitgeliefert.
- Fehlende Preise aus der bestehenden Hinweisliste direkt im Formular öffnen.
- Überschreibung entfernen und anschließend wirksamen Wert vor dem Speichern anzeigen.
- JSON-Ansicht als optionale Expertenansicht erhalten; Formular und JSON verwenden dieselbe interne Repräsentation.

### Regeln

- Deutsche Dezimalkommas und Dezimalpunkte akzeptieren; mehrdeutige Tausendertrennzeichen vermeiden beziehungsweise klar zurückweisen.
- Null ist ein bewusst eingetragener Preis und unterscheidet sich von einem leeren oder unbekannten Feld.
- Bestehende Standardwerte für weggelassene Cache-Schreibpreise ausdrücklich neben dem Feld anzeigen.
- Zunächst die aktuelle Überschreibung eines vollständigen Modelltarifs beibehalten. Eine spätere feldweise Vererbung würde eine eigene Schemaänderung benötigen.
- Vorhandene Preisquelle und effektiver Wert müssen korrekt aufgelöst werden; die einfache Anzeige zusammengeführter Rohobjekte genügt bei Modellaliasen nicht immer.
- Nach E6 Gültigkeitsbeginn ergänzen und beim Speichern einen neuen Preisstand erstellen.

### Abnahme

- Bestehende manuelle Preise lassen sich unverändert öffnen und erneut speichern.
- Null, leere optionale Felder und ungültige Zahlen sind eindeutig behandelt.
- Nach Entfernen einer Überschreibung wird der tatsächlich wirksame Rückfallpreis angezeigt.
- Formular und JSON liefern für dieselbe Konfiguration identische Kosten.

## 13. E10: Anonymisierter Export

### Ziel und Bedienung

Beim CSV-Export ein Profil „Zum Teilen“ wählen und die ausgegebenen Spalten vorher prüfen.

- Repository- und Ordnerpfade durch neutrale Bezeichnungen wie „Projekt 001“ und „Ordner 001“ ersetzen.
- Session-IDs durch exportlokale Kennungen ersetzen.
- Sessiontitel, Branches, Tags, Projektgruppennamen und Dateipfade nicht als Freitext übernehmen. Titel und Branches sind aktuell keine CSV-Spalten; die Regel gilt auch für künftige Erweiterungen.
- Tool, Modell, Tokenzahlen und API-Gegenwerte können enthalten bleiben. Unbekannte beziehungsweise benutzerdefinierte Modellbezeichnungen in der Vorschau ausdrücklich berücksichtigen und optional neutralisieren.
- Zeitpunkt wahlweise exakt, nur als Datum oder weggelassen exportieren; Vorgabe für das Teilen-Profil ist Tagesgenauigkeit.
- Vorschau mit einigen tatsächlich transformierten Zeilen und einer Liste entfernter beziehungsweise ersetzter Felder anzeigen.

### Technische Arbeit

- Transformation als reinen Schritt nach dem Filtern und vor der CSV-Erzeugung implementieren.
- Pro Export eine konsistente Zuordnung erzeugen; dieselbe Session oder dasselbe Projekt erhält innerhalb der Datei immer denselben Ersatznamen.
- Keine Original-ID und keinen Hash des Originalpfads als Ersatzkennung verwenden. Keine Zuordnungstabelle mitexportieren.
- CSV über eine ausdrückliche Spaltenliste erzeugen; neue Datenfelder werden nicht automatisch aufgenommen.
- Bestehende Absicherung gegen CSV-Formeln auf alle ausgegebenen Zellwerte weiterhin anwenden.
- Bewertungsmodus aus E6 aufnehmen; Preisstand-Referenzen beim Teilen neutralisieren, falls sie benutzerdefinierte Namen enthalten.

### Bezeichnung und Grenze

Die Funktion entfernt direkte Identifikatoren und ersetzt weitere Kennungen. Das ist technisch eine Pseudonymisierung. Muster, Zeitpunkte und seltene Modellkombinationen können Rückschlüsse erlauben. Die Oberfläche sollte daher „Export zum Teilen“ sagen und keine vollständige Anonymität versprechen.

### Abnahme

- Tests mit eindeutig erkennbaren künstlichen Pfaden, Nutzernamen, IDs und Freitexten finden diese Werte im Teilen-Export nicht wieder.
- Ersatzbezeichnungen bleiben innerhalb einer Datei konsistent.
- Zeilenanzahl und numerische Summen entsprechen dem normalen gefilterten Export.
- Zeitreduktion funktioniert auch an Tagesgrenzen in der gewählten Zeitzone.
- Die normale Exportvariante bleibt verfügbar.

## 14. Empfohlene Umsetzung in Etappen

| Etappe | Inhalt und Reihenfolge | Sichtbares Ergebnis | Voraussetzung für Abschluss |
| --- | --- | --- | --- |
| A: Datenlage und Grundlage | E2/E5-Logformate prüfen; gemeinsame Zeit-/Filterlogik; versionierte Speicherung planen | Verbindlich beschriebene Datenverfügbarkeit und stabile gemeinsame Berechnungen | Bereinigte Parserbeispiele und dokumentierte Migrationsstrategie |
| B: Schneller Analysegewinn | E1 Vergleich, danach E8 Kalender; E9 Preisformular; E10 Teilen-Export | Neue Auswertungen und einfachere Bedienung ohne umfangreiche Cachemigration | Übereinstimmende Summen, UI-Prüfung, Exportprüfung |
| C: Sicherung und Organisation | E7 Backup/Wiederherstellung, danach E4 Ansichten und Projekt-Tags | Wiederherstellbare Historie und wiederverwendbare Auswahlen | Erfolgreicher vollständiger Sicherungs-/Wiederherstellungslauf |
| D: Vollständige Aufgaben | E2 Aufgabenbaum, danach E5 Kontextverlauf | Nachvollziehbare Agent-Kosten und Kontextentwicklung | Bestandsdatenmigration ohne Verlust; belastbare Beziehungen und Kontextmesswerte |
| E: Historie und Hinweise | E3 Limitgeschichte mit In-App-Hinweisen; E6 historische Preise | Zeitlich nachvollziehbare Limits und reproduzierbare Kostenauswertung | Neustartfeste Hinweise, reproduzierbare Preise, Integration in Backup und Export |
| F: Optionaler Ausbau | Hintergrundüberwachung und Betriebssystemmeldungen aus E3 | Hinweise auch ohne fokussiertes App-Fenster | Explizite Aktivierung, gemessener Ressourcenverbrauch und nachgewiesene Zustellung |

E9 und E10 haben geringe Abhängigkeiten und können bei Bedarf früher geliefert werden. E6 ist fachlich unabhängig vom Aufgabenbaum, muss aber vor Freigabe in Vergleich, Preisformular, Export und Backup integriert sein. E3 und E6 erweitern bei ihrer Einführung jeweils das Backupformat mit abwärtskompatibler Leseunterstützung.

### Wichtigste Abhängigkeiten

- Gemeinsame Zeit- und Filterlogik → E1, E4, E8 und einheitliche Exporte.
- Gesicherte Migration plus E7 → umfangreiche Parser- und Historienspeicherung.
- Nachgewiesene Logfelder → E2 und E5.
- E4 → zusätzliche Projekt- und Tagdimensionen in E1 sowie Ersatzbezeichnungen in E10.
- E6 → Bewertungsmodus in E1, E8, E9 und E10.
- Jede neue lokale Datenkategorie → Erweiterung der Sicherung und Wiederherstellung in E7.

## 15. Prüfung und Freigabe

### Automatisierte Prüfung nach Änderungsumfang

- Analysefunktionen: Kalendergrenzen, Vergleichszeiträume, Filtergleichheit und additive Summen.
- Parser und Store: alte/neue Logvarianten, Archivduplikate, geerbte Ereignisse, fehlende Eltern, Zyklen, Kontextlücken und Migration.
- Preisverwaltung: unbekannte Kategorien, manuelle Überschreibungen, historische Gültigkeit und reproduzierbare Aufschläge.
- Server und Speicherung: Importgrenzen, beschädigte Backups, unterbrochene Übernahme und konkurrierende Schreibvorgänge.
- Limitlogik: frische/veraltete Messwerte, Resets, Neustarts und mehrere App-Fenster.
- Export: Filtergleichheit, konsistente Ersatznamen, keine künstlichen Originalkennungen im Teilen-Profil und Formelschutz.

Pro Arbeitspaket zunächst passende bestehende Tests und erforderliche neue Randfalltests ausführen. Vor Freigabe einer integrierten Etappe die gesamte vorhandene Testsuite mit `npm test` ausführen. Zusätzliche reine Darstellungstests nur dort einführen, wo sie ein konkretes Fehlerrisiko abdecken.

### Manuelle Prüfung

- Leere Daten, kleine Historie, große Historie und unvollständige Metadaten.
- Helle/dunkle Darstellung, Tastaturbedienung und schmale Fenster.
- Fokuswechsel, zwei App-Fenster, Neustart und vollständig offline laufende Auswertung.
- Alte Einstellungen und ein Cache mit historisch erhaltenen, inzwischen gelöschten Quelldateien.
- Backup auf abweichendem Quellpfad wiederherstellen.
- Preisupdate verändert aktuelle Bewertung; historische Bewertung bleibt beim gewählten Stand.

### Leistung und Dokumentation

- Bei Änderungen an Parser oder Store den vorhandenen Scanbenchmark mit demselben künstlichen Datensatz vergleichen. Erstimport, unveränderter Scan und angehängte Daten getrennt betrachten.
- Für Aufgabenbaum, Kontextgeschichte und Kalender zusätzlich Snapshotgröße, Browserdarstellung und Speicherbedarf messen. Bestehende Benchmarkzeiten messen nicht die gesamte UI-Latenz.
- Neue Historien getrennt oder bedarfsgerecht laden, wenn Messungen eine unnötige Vergrößerung jedes Standardsnapshots zeigen.
- README nach jeder ausgelieferten Etappe um Bedienung, Datenumfang, Grenzen und Wiederherstellung aktualisieren.
- Programmpaket auf vollständige neue Module und weiterhin ausgeschlossene persönliche Daten prüfen.

## 16. Erster konkreter Umsetzungsschritt

Mit E1 beginnen: gemeinsame Zeitraum- und Filterfunktionen festlegen, die bisherige Vorperiodenanzeige darauf umstellen und den Vergleich zweier Zeiträume einschließlich Projekt-/Modellbeiträgen implementieren. Damit entsteht die Grundlage für Kalender und gespeicherte Ansichten und zugleich ein unmittelbar nutzbares Analysefeature.

Vor einer anschließenden Umsetzung von E2 und E5 die Logprüfung aus Etappe A abschließen. Das Ergebnis entscheidet, welche Beziehungen und Kontextwerte tatsächlich angezeigt werden können; die Bedienoberfläche soll nur nachweisbare Daten versprechen.
