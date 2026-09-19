# E2 – Task-Relationship Audit

Status: September 15, 2026

The implementation uses only explicit relationships supported by the respective session format. Prompt and response content is neither read nor stored for this purpose.

| Source | Field | Meaning | Handling |
| --- | --- | --- | --- |
| Codex `session_meta` | `payload.parent_thread_id` | Direct parent task | Stored as a parent relationship |
| Codex `session_meta` | `payload.thread_source = subagent` | Delegated subtask | Relationship type `subagent` |
| Codex `session_meta` | `payload.thread_source = guardian_review` | Automated review task | Relationship type `guardian_review` |
| Codex `session_meta` | `payload.forked_from_id` | Fork of a task | Stored separately as `fork`; not counted as a delegated subtask |
| Claude message | `parentUuid` | Previous message in the same session | Not interpreted as a task relationship |

## Limitations and Fallbacks

- If a referenced parent session is unavailable locally, the relationship is preserved and may appear as unassigned in the interface.
- Relationships are not inferred from temporal proximity, file paths, or names.
- The tree view must defensively handle cycles and self-references, even though the audited Codex logs contained no such cases.
- The Claude logs reviewed so far contain no reliable cross-session parent field. Claude sessions therefore remain flat until a documented format feature becomes available.

## Migration

The parser has its own version number. When its semantics change, unchanged log files are re-read once in a controlled migration. Before the new cache format is written for the first time, the existing cache is backed up once as `*.v<version>.backup`. The cache continues to contain usage metadata only, with no conversation content.
