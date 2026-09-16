# E2 – Audit der Aufgabenbeziehungen

Stand: 15. September 2026

Die Implementierung verwendet ausschließlich explizite, im jeweiligen Sitzungsformat belegte Beziehungen. Inhalte von Prompts oder Antworten werden dafür weder gelesen noch gespeichert.

| Quelle | Feld | Bedeutung | Behandlung |
| --- | --- | --- | --- |
| Codex `session_meta` | `payload.parent_thread_id` | Direkte übergeordnete Aufgabe | Als Parent-Beziehung gespeichert |
| Codex `session_meta` | `payload.thread_source = subagent` | Delegierte Unteraufgabe | Beziehungstyp `subagent` |
| Codex `session_meta` | `payload.thread_source = guardian_review` | Automatische Prüfaufgabe | Beziehungstyp `guardian_review` |
| Codex `session_meta` | `payload.forked_from_id` | Abzweigung einer Aufgabe | Separat als `fork` gespeichert, nicht als delegierte Unteraufgabe summiert |
| Claude-Nachricht | `parentUuid` | Vorherige Nachricht derselben Sitzung | Nicht als Aufgabenbeziehung interpretiert |

## Grenzen und Fallbacks

- Fehlt eine referenzierte Parent-Sitzung lokal, bleibt die Beziehung erhalten und kann in der Oberfläche als nicht zugeordnet angezeigt werden.
- Beziehungen werden nicht aus Zeitnähe, Dateipfaden oder Namen geraten.
- Die Baumdarstellung muss Zyklen und Selbstreferenzen defensiv abfangen, auch wenn die geprüften Codex-Logs keine solchen Fälle enthielten.
- Für die derzeit geprüften Claude-Logs existiert kein belastbares sitzungsübergreifendes Parent-Feld. Claude-Sitzungen bleiben daher flach, bis ein dokumentiertes Formatmerkmal vorliegt.

## Migration

Der Parser trägt eine eigene Versionsnummer. Ändert sich die Semantik, werden unveränderte Logdateien einmal kontrolliert neu eingelesen. Vor dem ersten Schreiben des neuen Cacheformats wird der vorhandene Cache einmalig als `*.v<version>.backup` gesichert. Der Cache enthält weiterhin nur Nutzungsmetadaten, keine Gesprächsinhalte.
