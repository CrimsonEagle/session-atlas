# Scan-Performance

Stand: 14. September 2026. Die Optimierung baut auf den Korrekturen zur Erkennung neu geschriebener Logs und zur sessionweiten Codex-Deduplizierung auf.

## Ursache und Änderungen

Der vorherige Scan öffnete jede gefundene Datei, rief `handle.stat()` auf und schloss sie wieder – auch bei vollständig unveränderten Logs. Diese Zugriffe liefen nacheinander. Bei geänderten Dateien wurden außerdem sämtliche historischen Ereignisse tief kopiert und beim Einlesen für jede einzelne Zeile Hash-Updates ausgeführt.

Der optimierte Scan:

- prüft gecachte Dateien zuerst mit `fs.stat()` und öffnet sie nur bei Änderungen;
- führt höchstens vier Dateiverarbeitungen gleichzeitig aus und übernimmt die Ergebnisse in der ursprünglichen Reihenfolge, damit Duplikate nicht zufällig anders ausgewählt werden;
- verarbeitet identische, über mehrere Quellordner gefundene Pfade nur einmal;
- teilt gleichzeitig angefragte Repository-Auflösungen desselben Arbeitsordners;
- kopiert beim Anhängen nur die Container der Parser-Ereignisse, da der Parser deren Einträge ersetzt; alte Zustände bleiben dadurch auch bei Fehlern erhalten;
- liest mit 512-KiB-Puffern, vermeidet unnötige Pufferkopien und aktualisiert den Hash für vollständige Zeilen gemeinsam je Puffer.

Die vollständige SHA-256-Prüfung des bereits eingelesenen Präfixes geänderter Dateien bleibt erhalten. Es werden keine Stichproben verwendet. Prüfung und Einlesen erfolgen über denselben Dateihandle. Zusätzlich werden bei neu importierten Dateiständen `ctime`, Dateikennung und Gerät gespeichert und in die Erkennung unveränderter Dateien einbezogen. Bestehende Version-3-Caches bleiben lesbar; fehlende zusätzliche Metadaten werden beim nächsten Dateiimport ergänzt.

## Vergleichsmessung

Künstliche Daten: 193 JSONL-Dateien, 16.384 Ereignisse, ungefähr 30,7 MiB. Eine Datei mit ungefähr 9,2 MiB wächst für den Append-Fall um ein Ereignis. Die Messung lief unter Windows im selben Arbeitskontext mit der bisherigen und der optimierten Implementierung; die Ausführungsreihenfolge wurde zwischen Durchläufen gewechselt.

| Szenario | Vorher, Gesamtzeit | Optimiert, Gesamtzeit | Vorher, UI-Scanzeit | Optimiert, UI-Scanzeit |
| --- | ---: | ---: | ---: | ---: |
| Erstimport ohne Anwendungscache | 258,28 ms | 145,34 ms | 230 ms | 127 ms |
| Folgeaktualisierung ohne Änderungen | 63,78 ms | 9,03 ms | 59 ms | 4 ms |
| Erster Scan nach Laden des Caches | 61,32 ms | 9,72 ms | 57 ms | 4 ms |
| Folgeaktualisierung mit angehängter Antwort | 94,06 ms | 41,78 ms | 79 ms | 26 ms |

Median aus jeweils drei Durchläufen; bei unveränderten Dateien aus 21 Scans. Die Gesamtzeit umfasst `Store.scan()` einschließlich Cache-Schreiben und Snapshot-Erzeugung. Die bisherige UI-Metrik `stats.durationMs` endet bereits vor diesen beiden Schritten; ihre Bedeutung wurde nicht verändert. Das Laden des Caches vor dem Neustart-Szenario ist nicht Teil der angegebenen Scanzeit. HTTP-Übertragung und Browser-Rendering sind ebenfalls nicht enthalten.

„Erstimport“ bedeutet einen leeren Anwendungscache, nicht einen kalten Betriebssystem-Dateicache. Die Werte beschreiben diesen synthetischen Vergleich und sind keine Zusage für andere Rechner oder Datenmengen. In beiden Implementierungen wurden dieselben Mengen gelesen: unverändert 0 Bytes, beim Anhängen weiterhin das vollständige relevante Präfix. Die normalisierten Sessioninhalte einschließlich Ereignissen und Kosten waren in allen verglichenen Durchläufen identisch.

## Reproduzieren

```powershell
node scripts/benchmark-scan.mjs
```

Ein optionales Argument erlaubt den Vergleich mit einer zweiten Store-Implementierung:

```powershell
node scripts/benchmark-scan.mjs C:\Pfad\zur\Vergleichsversion\store.mjs
```

Die Vergleichsdatei muss `Store` exportieren und ihre relativen Imports korrekt auflösen. Der Benchmark erstellt ausschließlich künstliche Logs und Cachedateien in einem eigenen temporären Ordner und entfernt diesen anschließend. Persönliche Sessiondateien und der laufende Server werden nicht verwendet.

## Absicherung und Grenzen

Die vollständige Testsuite besteht mit 51 Tests. Zusätzliche Regressionstests prüfen Hashes über mehrere Puffer samt beschädigten Zeilen und geteilten UTF-8-Zeichen, Veränderungen mitten in einem gewachsenen Log nach Cache-Neustart, unveränderte alte Zustände bei fehlgeschlagenen Dateiupdates sowie deterministische Duplikatbehandlung trotz überlappender Quellordner und unterschiedlicher Abschlusszeiten.

Die Erkennung unveränderter Dateien beruht weiterhin auf Dateisystem-Metadaten. Eine Inhaltsänderung, die sämtliche verglichenen Metadaten unverändert lässt, lässt sich ohne erneutes Lesen nicht erkennen. Die Optimierung schwächt die bisherige Prüfung nicht ab; zusätzliche Metadaten verbessern sie für neu eingelesene Zustände.

Bei stark wachsenden, sehr großen Logs bleibt die vollständige Präfixprüfung ein Aufwand proportional zur bereits eingelesenen Dateigröße. Diesen Aufwand durch bloße Stichproben zu ersetzen würde die Erkennung von Änderungen in der Dateimitte schwächen. Sehr große Auswertungen können außerdem weiterhin durch das Schreiben des gesamten JSON-Caches und die Snapshot-Erzeugung begrenzt sein.

Der laufende Server muss nach einem Codeupdate neu gestartet werden. Ein erneuter Aufruf von `Start.cmd` allein öffnet bei bereits laufendem Server nur dessen bestehende Instanz; zum Übernehmen der Änderungen zuerst „App vollständig beenden“ verwenden und anschließend starten.
