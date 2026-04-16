# Phase 38: Backfill Migration - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-16
**Phase:** 38-backfill-migration
**Areas:** Prompt strategy, Idempotency, CLI UX, Entity normalization

---

## Pre-Discussion

37 markdown session files found in `vault/projects/claude-dev-stack/sessions/`. Convention: `# Session: YYYY-MM-DD — Title` + `## Что сделано` (Russian "What was done") + `## Решения` (Decisions). Mixed Russian prose + English identifiers. No strict structure — Haiku extraction appropriate.

---

## Gray Area Selection

All 4 selected.

---

## Prompt Reuse vs Backfill-Specific

| Option | Selected |
|--------|----------|
| Shared core prompt + backfill preamble (Recommended) | ✓ |
| Reuse Phase 36 prompt verbatim | |
| Separate backfill prompt module | |

**User's choice:** Shared core prompt + backfill preamble.
**Notes:** `buildExtractionPrompt({mode, input})` accepts `'transcript' \| 'backfill'`. Backfill preamble: "you are processing a human-written summary, extract only explicit decisions, don't fabricate observations". Unified schema, shared emit_observations tool.

---

## Idempotency + Re-Migration Policy

| Option | Selected |
|--------|----------|
| Filename slug + content hash + skip (Recommended) | ✓ |
| Filename slug + naive skip | |
| Hash-only + auto-refresh | |

**User's choice:** Filename slug + content hash + skip.
**Notes:** `sessions.id = 'backfill-' + filename` (without .md). `sessions.source_hash = sha256(markdown)`. Default skip if hash matches. `--force-refresh` flag opts into re-extraction. Requires schema migration 002-entity-display-name.sql (also adds sessions.source_hash).

---

## CLI UX + Partial Failure Handling

| Option | Selected |
|--------|----------|
| Rich UX + commit-successful (Recommended) | ✓ |
| Minimal UX + all-or-nothing | |
| Interactive per-file confirm | |

**User's choice:** Rich UX + commit-successful.
**Notes:** Dry-run: per-file table with size/tokens/cost. Apply: confirm if total > $0.30 (configurable `--max-cost`). Per-session transactions (1 fail doesn't kill others). Progress streaming. Resume = idempotent re-run (no separate --resume flag).

---

## Entity Deduplication + Normalization

| Option | Selected |
|--------|----------|
| Normalize at upsert: lowercase + trim (Recommended) | ✓ |
| Accept duplicates, v1.1+ merge tool | |
| Post-migration LLM normalization pass | |

**User's choice:** Normalize at upsert: lowercase + trim.
**Notes:** `normalize(name) = name.trim().toLowerCase()`. Schema 002 adds `entities.display_name TEXT` preserving first-seen original casing. UNIQUE constraint moves to normalized key. 'Claude Code' + 'claude code' merge. 'CC' stays separate (deferred to v1.1+ merge tool).

---

## Claude's Discretion

- Markdown pre-parsing (`## Что сделано` header extraction) vs whole-file to Haiku
- Token estimation formula for dry-run (cyrillic vs latin byte ratio)
- Max retry count on Haiku API errors (default 1)
- `--max-cost N` flag format
- Internal whitespace collapsing in normalize()
- Exit code semantics on partial failures

## Deferred Ideas

- **Phase 39:** Migration guide entry, /cds-quick queries backfilled data
- **v1.1+:** merge-entities tool, parallel-N dispatch, cross-project backfill, incremental watch mode, decisions markdown migration

---

*Generated: 2026-04-16*
