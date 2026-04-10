# Requirements: claude-dev-stack — NotebookLM Sync Milestone

**Defined:** 2026-04-10
**Milestone:** v0.8 — NotebookLM Auto-Sync MVP
**Core Value:** Claude Code can resume work across sessions as if it remembered everything — extended now with grounded recall from historical vault content via NotebookLM.

---

## v1 Requirements (this milestone — committed to roadmap)

### Session-Manager Auto-Update (prerequisite)

Fix the existing bug where `context.md` doesn't actually update on session end, which would make NotebookLM sync upload stale data.

- [ ] **SKILL-01**: `session-manager /end` writes a "Session History" entry to `vault/projects/{name}/context.md` linking the new session log file
- [ ] **SKILL-02**: `context.md` update preserves all other sections (the existing markers-based or section-based replace pattern, not full-file rewrite)
- [ ] **SKILL-03**: The logic lives in executable code (bash or Node.js helper), not as a markdown comment in `SKILL.md`
- [ ] **SKILL-04**: If `context.md` doesn't yet have a "Session History" section, it is created and appended at a predictable location (after "## Overview" or at the end before any footer)
- [ ] **SKILL-05**: Existing `tests/hooks.test.mjs` or new test verifies context.md is actually modified after a simulated session end

### NotebookLM Client Module

New `lib/notebooklm.mjs` — thin API client that reads/writes sources in a NotebookLM notebook.

- [ ] **NBLM-01**: Module exports `createNotebook(name)`, `listSources(notebookId)`, `uploadSource(notebookId, name, content)`, `deleteSource(notebookId, sourceId)`, `updateSource(notebookId, sourceId, content)` functions
- [ ] **NBLM-02**: Authentication via env var `NOTEBOOKLM_API_KEY` — reads from `process.env`, never from a committed file
- [ ] **NBLM-03**: Uses native `fetch` or `node:https` — no new npm dependencies added (maintains single-dep constraint)
- [ ] **NBLM-04**: HTTP errors surface with meaningful messages (not silent null returns) so the caller can warn the user
- [ ] **NBLM-05**: Rate-limiting aware — respects `Retry-After` headers on 429 responses
- [ ] **NBLM-06**: Module has its own `tests/notebooklm.test.mjs` with HTTP mocked via the `node:http` test server pattern (no real API calls in tests)

### Sync Pipeline

Actual logic that walks vault content and pushes it to NotebookLM.

- [ ] **NBLM-07**: New module/function walks `vault/projects/*/sessions/*.md` and uploads each as a separate source with filename `{project}__{YYYY-MM-DD}-{slug}.md`
- [ ] **NBLM-08**: Walks `vault/projects/*/decisions/*.md` (ADRs) and uploads with filename `{project}__ADR-{NNNN}-{slug}.md` — uses **replace-by-filename** (delete old source with same name before upload)
- [ ] **NBLM-09**: Walks `vault/projects/*/docs/*.md` (includes Notion-imported docs) and uploads with filename `{project}__doc-{slug}.md` — uses replace-by-filename
- [ ] **NBLM-10**: Uploads `vault/projects/*/context.md` as `{project}__context.md` with replace-by-filename
- [ ] **NBLM-11**: `shared/patterns.md` and `meta/*.md` are NOT synced (explicitly out of scope for per-project pipeline — see Out of Scope)
- [ ] **NBLM-12**: Target notebook is a single shared notebook named `claude-dev-stack-vault` (or configured name); notebook is auto-created on first sync if it doesn't exist
- [ ] **NBLM-13**: Notebook name is configurable via env var `NOTEBOOKLM_NOTEBOOK_NAME` (default: `claude-dev-stack-vault`)

### Change Detection (Manifest)

Prevent unnecessary re-uploads.

- [ ] **NBLM-14**: Local manifest file at `~/vault/.notebooklm-sync.json` tracks which vault files have been uploaded and their SHA-256 content hash
- [ ] **NBLM-15**: On sync, each file's current hash is compared to the manifest — unchanged files are skipped entirely (no API call)
- [ ] **NBLM-16**: Manifest stores `{filepath: {hash, notebook_source_id, uploaded_at}}` so we can delete the right source on replace-by-filename updates
- [ ] **NBLM-17**: Manifest is updated atomically (write to `.notebooklm-sync.json.tmp` then rename) to prevent corruption on crash mid-sync
- [ ] **NBLM-18**: `~/vault/.notebooklm-sync.json` is added to vault's `.gitignore` (it's local state, not shared)

### Sync Trigger (Integration)

- [ ] **NBLM-19**: New CLI command `claude-dev-stack notebooklm sync` runs the full sync manually
- [ ] **NBLM-20**: New CLI command `claude-dev-stack notebooklm status` shows manifest state (last sync, file count, stale count)
- [ ] **NBLM-21**: `session-manager /end` skill, after the SKILL-01 fix, triggers a background sync — if `NOTEBOOKLM_API_KEY` is set. If not set, sync step is silently skipped (no hard dependency).
- [ ] **NBLM-22**: Trigger mechanism uses detached `spawn` (not `spawnSync`) so session-end flow isn't blocked by network I/O
- [ ] **NBLM-23**: Sync failures on session-end trigger are logged to `~/vault/.notebooklm-sync.log` but do NOT propagate errors to the user's terminal (best-effort)

### CLI Integration & UX

- [ ] **NBLM-24**: `bin/cli.mjs` routes `notebooklm` subcommand to `lib/notebooklm.mjs::main(args)`
- [ ] **NBLM-25**: Help text in `cli.mjs` includes `notebooklm sync` and `notebooklm status` commands
- [ ] **NBLM-26**: Setup wizard (`bin/install.mjs`) offers NotebookLM setup as an optional step: explain what it does, ask for API key, save to `~/.claude/.env` or similar user config, test connectivity
- [ ] **NBLM-27**: `lib/doctor.mjs` adds a check: "NotebookLM API key configured? Last sync successful?"

### Testing

- [ ] **TEST-01**: `tests/notebooklm.test.mjs` covers: manifest read/write/update, hash computation, upload/replace logic (with mocked HTTP), error propagation
- [ ] **TEST-02**: `tests/project-setup.test.mjs` extended with a smoke test that `claude-dev-stack notebooklm status` exits cleanly on a fresh vault
- [ ] **TEST-03**: `tests/skills.test.mjs` or new `tests/session-manager.test.mjs` verifies SKILL-01/SKILL-02 (context.md actually gets updated)
- [ ] **TEST-04**: Full test suite still passes (`npm test` → 54 → 54+N passed, 0 failed)

---

## v2 Requirements (deferred to future milestone)

### Notion MCP Automation

- **NBLM-V2-01**: Automate Notion → vault step using Notion MCP server so users don't have to manually Export → zip → docs add. Once Notion docs land in vault, the existing sync pipeline picks them up.

### Per-Project Notebooks

- **NBLM-V2-02**: Option to sync into per-project notebooks instead of shared — configurable per project, migration script from shared to per-project
- **NBLM-V2-03**: Hybrid model — shared notebook for ADRs/context + per-project notebooks for hot projects only

### Advanced Sync Behaviors

- **NBLM-V2-04**: Cron-based periodic sync (not just on session-end)
- **NBLM-V2-05**: Delta sync for context.md (only changed sections)
- **NBLM-V2-06**: Conflict detection if user edits a notebook source manually and vault also updated
- **NBLM-V2-07**: `shared/patterns.md` cross-project sync
- **NBLM-V2-08**: External library docs sync (dev-research integration)

### Observability

- **NBLM-V2-09**: Analytics dashboard integration (`lib/analytics.mjs`) to show sync stats per project
- **NBLM-V2-10**: Rate-limit budget display in `doctor`

---

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Per-project notebooks | MVP uses single shared notebook; per-project adds config complexity and N-times API quota usage. Migration path kept open. |
| Two-way sync (NotebookLM → vault) | Vault is source of truth. Downloading notebook state back creates merge conflicts for zero benefit. |
| Automating Notion export | Already works manually via `docs add`. Automation belongs in v2 behind Notion MCP. |
| Cron / scheduled sync | On-session-end trigger is sufficient for the core use case. Adds cron complexity for minimal gain. |
| Shared patterns sync | Outside per-project flow. Belongs to separate "shared knowledge" feature. |
| Notebook content retrieval / query | That's `dev-research` skill's job, not sync's. Sync is upload-only. |
| Authentication beyond env var | No OAuth, no keyring integration in MVP. Env var is standard for CLI tools. |
| Graceful cross-machine sync | Manifest is per-machine (~/vault path is local). Multi-machine dedup is v2+ concern. |
| Pre-sync dry-run mode | Useful but adds complexity. Manifest status command (NBLM-20) gives visibility. |
| Undo / rollback after sync | Sync is idempotent by design (replace-by-name). If wrong, re-sync fixes it. |

---

## Traceability

*Populated during roadmap creation (next step). Each requirement maps to exactly one phase.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKILL-01 | Phase 1 | Pending |
| SKILL-02 | Phase 1 | Pending |
| SKILL-03 | Phase 1 | Pending |
| SKILL-04 | Phase 1 | Pending |
| SKILL-05 | Phase 1 | Pending |
| NBLM-01 | Phase 2 | Pending |
| NBLM-02 | Phase 2 | Pending |
| NBLM-03 | Phase 2 | Pending |
| NBLM-04 | Phase 2 | Pending |
| NBLM-05 | Phase 2 | Pending |
| NBLM-06 | Phase 2 | Pending |
| NBLM-14 | Phase 3 | Pending |
| NBLM-15 | Phase 3 | Pending |
| NBLM-16 | Phase 3 | Pending |
| NBLM-17 | Phase 3 | Pending |
| NBLM-18 | Phase 3 | Pending |
| NBLM-07 | Phase 4 | Pending |
| NBLM-08 | Phase 4 | Pending |
| NBLM-09 | Phase 4 | Pending |
| NBLM-10 | Phase 4 | Pending |
| NBLM-11 | Phase 4 | Pending |
| NBLM-12 | Phase 4 | Pending |
| NBLM-13 | Phase 4 | Pending |
| NBLM-19 | Phase 5 | Pending |
| NBLM-20 | Phase 5 | Pending |
| NBLM-21 | Phase 5 | Pending |
| NBLM-22 | Phase 5 | Pending |
| NBLM-23 | Phase 5 | Pending |
| NBLM-24 | Phase 5 | Pending |
| NBLM-25 | Phase 5 | Pending |
| NBLM-26 | Phase 5 | Pending |
| NBLM-27 | Phase 5 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 1 | Pending |
| TEST-04 | All phases | Continuous |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
