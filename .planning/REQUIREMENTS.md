# Requirements: claude-dev-stack — NotebookLM Sync Milestone

**Defined:** 2026-04-10
**Milestone:** v0.8 — NotebookLM Auto-Sync MVP
**Core Value:** Claude Code can resume work across sessions as if it remembered everything — extended now with grounded recall from historical vault content via NotebookLM.

---

## v1 Requirements (this milestone — committed to roadmap)

### Session-Manager Auto-Update (prerequisite)

Fix the existing bug where `context.md` doesn't actually update on session end, which would make NotebookLM sync upload stale data.

- [x] **SKILL-01**: `session-manager /end` writes a "Session History" entry to `vault/projects/{name}/context.md` linking the new session log file
- [ ] **SKILL-02**: `context.md` update preserves all other sections (the existing markers-based or section-based replace pattern, not full-file rewrite)
- [x] **SKILL-03**: The logic lives in executable code (bash or Node.js helper), not as a markdown comment in `SKILL.md`
- [ ] **SKILL-04**: If `context.md` doesn't yet have a "Session History" section, it is created and appended at a predictable location (after "## Overview" or at the end before any footer)
- [x] **SKILL-05**: Existing `tests/hooks.test.mjs` or new test verifies context.md is actually modified after a simulated session end

### NotebookLM Client Module

New `lib/notebooklm.mjs` — thin wrapper over the `notebooklm-py` CLI (`pip install notebooklm-py`) that exposes a JavaScript API for Phase 4's sync pipeline.

**Pivot notice (2026-04-10, ADR-0001):** Google NotebookLM has no public REST API with API-key authentication. All programmatic access goes through the `notebooklm-py` Python CLI which uses browser OAuth cookies under the hood. Phase 2 is therefore a CLI wrapper, not an HTTP client. See `vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` for the full rationale.

- [ ] **NBLM-01**: Module `lib/notebooklm.mjs` exports `createNotebook(name)`, `listSources(notebookId)`, `uploadSource(notebookId, filepath)`, `deleteSource(notebookId, sourceId)`, `deleteSourceByTitle(notebookId, title)`, and `updateSource(notebookId, sourceId, filepath)`; each function wraps a single `spawnSync('notebooklm', [...args, '--json'])` invocation, parses stdout as JSON, and returns the parsed object or throws a typed Error
- [ ] **NBLM-02**: Module detects the `notebooklm` binary via `hasCommand('notebooklm')` (or equivalent PATH check) on first call; if missing, throws a `NotebooklmNotInstalledError` whose message includes the install hint `pipx install notebooklm-py` (or `pip install --user notebooklm-py`). Authentication is **delegated entirely** to `notebooklm-py` — the module never reads `NOTEBOOKLM_API_KEY`, never touches cookies, never stores credentials
- [ ] **NBLM-03**: JavaScript side remains single-dep — `package.json` `dependencies` stays `{"prompts": "^2.4.2"}` after this phase. Adds one **system dependency**: `notebooklm-py >= 0.3.4` (documented in PROJECT.md Constraints; detected by `doctor.mjs` and offered in the install wizard during Phase 5)
- [ ] **NBLM-04**: CLI non-zero exit codes are caught by inspecting the `spawnSync` result; errors thrown include the invoked command, exit code, and captured stderr. Errors are structured via a `NotebooklmCliError` class exported from the module, so callers can match `error instanceof NotebooklmCliError` and access `{ command, exitCode, stderr }`
- [ ] **NBLM-05**: Rate-limit and transient upstream failures are detected by matching known `notebooklm-py` stderr patterns (e.g., `"No result found for RPC ID"`, `"GENERATION_FAILED"`); a `NotebooklmRateLimitError` subclass is thrown. Module optionally forwards a caller-supplied `retry: N` option to `notebooklm-py` via its `--retry` flag on generate-class commands. Claude-dev-stack does NOT implement its own retry loop — rate-limit handling is delegated to the CLI
- [ ] **NBLM-06**: `tests/notebooklm.test.mjs` exercises all exported functions against a **fake `notebooklm` binary** — a bash stub placed at the front of `PATH` during the test run, emitting canned JSON on stdout and controlled exit codes. Covers: success path, binary-missing fast-fail, CLI non-zero exit with parsed stderr, rate-limit stderr pattern detection. Matches the existing `tests/hooks.test.mjs` shell-stub pattern. No real `notebooklm` binary is invoked in tests

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
- [ ] **NBLM-21**: `session-manager /end` skill, after the SKILL-01 fix, triggers a background sync — only if `notebooklm` binary is present in PATH AND `notebooklm auth check` returns exit code 0. Otherwise sync step is silently skipped (no hard dependency on NotebookLM being set up).
- [ ] **NBLM-22**: Trigger mechanism uses detached `spawn` (not `spawnSync`) so session-end flow isn't blocked by network I/O
- [ ] **NBLM-23**: Sync failures on session-end trigger are logged to `~/vault/.notebooklm-sync.log` but do NOT propagate errors to the user's terminal (best-effort). `NotebooklmNotInstalledError` and auth-check failures are treated as "feature not configured" and logged at info level, not as errors

### CLI Integration & UX

- [ ] **NBLM-24**: `bin/cli.mjs` routes `notebooklm` subcommand to `lib/notebooklm.mjs::main(args)`
- [ ] **NBLM-25**: Help text in `cli.mjs` includes `notebooklm sync` and `notebooklm status` commands
- [ ] **NBLM-26**: Setup wizard (`bin/install.mjs`) offers NotebookLM setup as an optional step: (a) explains what it does and that it requires `notebooklm-py`, (b) detects whether `notebooklm` binary is already in PATH, (c) if absent, offers to install via `pipx install notebooklm-py` (fallback `pip install --user notebooklm-py`), (d) runs `notebooklm login` as an interactive subprocess to kick off the browser OAuth flow, (e) verifies setup by running `notebooklm auth check` and reporting the result. No API key is ever prompted for or stored by claude-dev-stack
- [ ] **NBLM-27**: `lib/doctor.mjs` adds a check: "`notebooklm` binary in PATH? `notebooklm auth check` passing? Last sync status?" — each reported as a separate line. Doctor does NOT attempt to install the binary; only reports and points to `claude-dev-stack install` for setup

### Testing

- [ ] **TEST-01**: `tests/notebooklm.test.mjs` covers: manifest read/write/update, hash computation, upload/replace logic (with mocked HTTP), error propagation
- [ ] **TEST-02**: `tests/project-setup.test.mjs` extended with a smoke test that `claude-dev-stack notebooklm status` exits cleanly on a fresh vault
- [x] **TEST-03**: `tests/skills.test.mjs` or new `tests/session-manager.test.mjs` verifies SKILL-01/SKILL-02 (context.md actually gets updated)
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
| Authentication implemented inside claude-dev-stack | Delegated entirely to `notebooklm-py` (`notebooklm login` handles browser OAuth). Claude-dev-stack never stores credentials or tokens. Per ADR-0001. |
| Reimplementing NotebookLM RPC protocol in Node.js | Google has no public NotebookLM API. `notebooklm-py` already reverse-engineered the internal RPC layer. Duplicating that work in pure Node.js would break single-dep constraint (requires `playwright`) and add fragility. Per ADR-0001 (alternative B, rejected). |
| Graceful cross-machine sync | Manifest is per-machine (~/vault path is local). Multi-machine dedup is v2+ concern. |
| Pre-sync dry-run mode | Useful but adds complexity. Manifest status command (NBLM-20) gives visibility. |
| Undo / rollback after sync | Sync is idempotent by design (replace-by-name). If wrong, re-sync fixes it. |

---

## Traceability

*Populated during roadmap creation (next step). Each requirement maps to exactly one phase.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKILL-01 | Phase 1 | Complete |
| SKILL-02 | Phase 1 | Pending |
| SKILL-03 | Phase 1 | Complete |
| SKILL-04 | Phase 1 | Pending |
| SKILL-05 | Phase 1 | Complete |
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
| TEST-03 | Phase 1 | Complete |
| TEST-04 | All phases | Continuous |

**Coverage:**
- v1 requirements: 36 total (SKILL: 5, NBLM: 27, TEST: 4)
- Mapped to phases: 36
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after Phase 2 pivot per ADR-0001 (rewrite NBLM-01..06, update NBLM-21/23/26/27, count mismatch 37→36 corrected)*
