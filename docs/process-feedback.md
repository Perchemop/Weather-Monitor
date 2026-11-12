# Process Feedback (append-only)

Friction log for the development process. Append new entries; do not rewrite history.

## Template

```markdown
### YYYY-MM-DD — <short title>

- **Context:** (slice / task)
- **Friction:** what slowed or confused things
- **Suggestion:** small, concrete improvement
- **Evidence/refs:** PR/CI/run (if any)
```

## Entries

### 2026-11-12 — Documentation reconciliation

- **Context:** Exhaustive audit reconciliation of docs vs shipped state.
- **Friction:** Contradictory test counts, version numbers, and shipped/deferred statuses across multiple docs increased drift risk.
- **Suggestion:** Single-source counts/versions in one place and reference them; keep a reconciliation checklist in the release/PR flow.
- **Evidence/refs:** Documentation reconciliation pass (this session).
