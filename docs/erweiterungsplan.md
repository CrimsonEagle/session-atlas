# Session Atlas: Offene Erweiterungen

Stand: 19. September 2026.

Diese Datei ist nur noch die Roadmap für die ausstehenden Erweiterungen. Bereits
umgesetzte Funktionen und ihre Bedienung sind in der README dokumentiert und
durch die Tests im Repository abgesichert.

Offen sind:

| ID | Erweiterung | Aufwand |
| --- | --- | --- |
| E4 | Gespeicherte Ansichten, Projektgruppen und Tags | Mittel |
| E9 | Preisformular zusätzlich zur JSON-Ansicht | Klein bis mittel |
| E10 | Exportprofil „Zum Teilen“ | Klein bis mittel |

Die früher hier geplanten Erweiterungen E1, E2, E3, E5, E6, E7 und E8 sind
umgesetzt. Technische Hintergründe zur Aufgabenbeziehung und Scanleistung stehen
in `docs/e2-logformat-audit.md` und `docs/scan-performance.md`.

## Gemeinsame Leitlinien

- Lokaler Betrieb und Offline-Auswertung bleiben die Grundlage.
- Prompts und Antworttexte werden nicht gespeichert.
- Bestehende Filter wirken einheitlich auf Ansichten, Details und Exporte.
- Fehlende Werte werden als unbekannt dargestellt und nicht als null geschätzt.
- Neue lokale Organisationsdaten werden versioniert gespeichert und in Backup
  und Wiederherstellung aufgenommen.
- Kosten bleiben geschätzte API-Gegenwerte und verwenden den gewählten aktuellen
  oder historischen Preisstand.

## E4: Gespeicherte Ansichten, Projektgruppen und Tags

### Ziel

Wiederkehrende Auswertungen sollen mit einem Klick erreichbar sein. Mehrere
Repositories sollen sich fachlich zusammenfassen und mit frei wählbaren Tags
versehen lassen.

### Umfang

- Die aktuelle Filterauswahl unter einem Namen speichern.
- Ansichten umbenennen, überschreiben und löschen sowie optional als
  Startansicht festlegen.
- Relative Zeiträume beim Öffnen neu berechnen; feste Datumsbereiche bleiben
  unverändert.
- Projektgruppen mit Name, optionaler Farbe und zugeordneten Repositories oder
  Arbeitsordnern verwalten.
- Freie Tags wie „Privat“, „Kunde A“ oder „Experiment“ vergeben und danach
  filtern.
- Projektgruppe und Tags in den zugehörigen Details anzeigen.

### Regeln

- Gespeichert werden Auswahldaten und Zuordnungen, keine Kopien der
  Nutzungsereignisse.
- Ansichten, Gruppen und Tags erhalten stabile interne IDs.
- Ein Repository gehört höchstens zu einer primären Projektgruppe. Tags dürfen
  sich überschneiden, ohne Ereignisse in Summen doppelt zu zählen.
- Fehlende Repositories bleiben als fehlende Zuordnung sichtbar. Eine Ansicht
  darf dadurch nicht unbemerkt auf „Alle“ erweitert werden.
- Die Organisationsdaten werden vom bestehenden Backup vollständig erfasst und
  wiederhergestellt.

### Abnahme

- Ansichten überstehen Neustart sowie Backup und Wiederherstellung.
- Relative Zeiträume werden beim Öffnen korrekt neu aufgelöst.
- Umbenennungen erhalten Zuordnungen; Mehrfach-Tags erzeugen keine
  Doppelzählung.
- Fehlende Filterziele bleiben erkennbar und schränken die Auswahl weiterhin
  sicher ein.

## E9: Preisformular zusätzlich zur JSON-Ansicht

### Ziel

Eigene Modellpreise sollen ohne Kenntnis des internen JSON-Formats gepflegt
werden können. Die vorhandene JSON-Ansicht bleibt als Expertenansicht erhalten.

### Umfang

- Modelle suchen, vorhandene Überschreibungen bearbeiten und neue Modelle
  hinzufügen.
- Beschriftete Felder für Input, Cache lesen, Output sowie Cache schreiben für
  fünf Minuten und eine Stunde anbieten; Einheit ist USD pro Million Tokens.
- Quelle und wirksamen Wert anzeigen: manuell, abgerufen oder mitgeliefert.
- Fehlende Preise direkt aus der bestehenden Hinweisliste im Formular öffnen.
- Überschreibungen entfernen und den danach wirksamen Rückfallpreis vor dem
  Speichern zeigen.
- Gültigkeitsbeginn und Erzeugung eines neuen unveränderlichen Preisstands in
  die vorhandene Preisgeschichte integrieren.

### Regeln

- Deutsche Dezimalkommas und Dezimalpunkte akzeptieren; mehrdeutige
  Tausendertrennzeichen zurückweisen.
- Null ist ein bewusster Preis und unterscheidet sich von leer beziehungsweise
  unbekannt.
- Formular und JSON verwenden dieselbe interne Repräsentation und Validierung.
- Modellaliase müssen über dieselbe Preisauflösung wie die Auswertung behandelt
  werden.

### Abnahme

- Bestehende manuelle Preise lassen sich unverändert öffnen und speichern.
- Formular und JSON ergeben für dieselbe Konfiguration identische Kosten.
- Null, leere optionale Felder und ungültige Zahlen werden eindeutig behandelt.
- Nach Entfernen einer Überschreibung wird der tatsächlich wirksame Preis
  angezeigt.

## E10: Exportprofil „Zum Teilen“

### Ziel

Zusätzlich zum vollständigen CSV-Export soll ein datensparsames Profil zum
Weitergeben verfügbar sein. Es pseudonymisiert direkte Kennungen, verspricht
aber keine vollständige Anonymität.

### Umfang

- Repository- und Ordnerpfade durch konsistente Bezeichnungen wie
  „Projekt 001“ und „Ordner 001“ ersetzen.
- Session-IDs durch exportlokale Kennungen ersetzen.
- Freitext wie Sessiontitel, Branches, Tags und Projektgruppennamen nicht
  unverändert übernehmen.
- Benutzerdefinierte Modellnamen in der Vorschau kenntlich machen und optional
  neutralisieren.
- Zeitpunkte wahlweise exakt, nur als Datum oder gar nicht exportieren;
  Tagesgenauigkeit ist die Vorgabe des Teilen-Profils.
- Vor dem Download einige transformierte Zeilen sowie entfernte und ersetzte
  Felder anzeigen.
- Den normalen vollständigen CSV-Export unverändert verfügbar lassen.

### Regeln

- Die Transformation erfolgt nach dem Filtern und vor der CSV-Erzeugung.
- Dieselbe Session, dasselbe Projekt und derselbe Ordner erhalten innerhalb
  einer Datei immer dieselbe Ersatzkennung.
- Ersatzkennungen enthalten weder Original-IDs noch Hashes von Originalwerten;
  eine Zuordnungstabelle wird nicht exportiert.
- Eine ausdrückliche Spaltenliste verhindert, dass neue Datenfelder automatisch
  in den Teilen-Export gelangen.
- Der bestehende Schutz vor CSV-Formeln gilt für beide Exportprofile.
- Bewertungsmodus und Regelversion bleiben nachvollziehbar. Benutzerdefinierte
  Namen in Preisstand-Referenzen werden neutralisiert.

### Abnahme

- Künstliche Pfade, Benutzernamen, IDs und Freitexte tauchen im Teilen-Export
  nicht wieder auf.
- Ersatzbezeichnungen bleiben innerhalb einer Datei konsistent.
- Zeilenzahl und numerische Summen entsprechen dem normalen gefilterten Export.
- Zeitreduktion funktioniert auch an lokalen Tagesgrenzen.

## Empfohlene Reihenfolge

1. E9 umsetzen, da die vorhandene Preisgeschichte und Validierung bereits die
   fachliche Grundlage liefern.
2. E10 umsetzen und dabei Preisstand-Metadaten sowie später die Daten aus E4
   ausdrücklich berücksichtigen.
3. E4 umsetzen, einschließlich versionierter Speicherung und Integration in das
   bestehende Backupformat.

E4 und E10 berühren beide Projektgruppen und Tags. Wird E10 vor E4 umgesetzt,
muss das Exportprofil beim späteren Hinzufügen dieser Felder nochmals geprüft
und erweitert werden.

## Prüfung und Dokumentation

- Für jedes Arbeitspaket passende Unit- und Integrationstests ergänzen und vor
  Freigabe die vollständige Suite mit `npm test` ausführen.
- Leere Daten, unbekannte Preise, fehlende Zuordnungen, Neustart sowie Backup und
  Wiederherstellung prüfen.
- Helle und dunkle Darstellung, Tastaturbedienung und schmale Fenster manuell
  kontrollieren.
- Nach Umsetzung einer Erweiterung Bedienung und Grenzen in der README
  dokumentieren und den erledigten Abschnitt aus dieser Roadmap entfernen.
