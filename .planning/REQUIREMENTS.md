# Milestone v0.10 Requirements — Query, Sync Automation & Quality

**Goal**: Make NotebookLM a two-way tool (upload + query), auto-sync vault on session end, fix v0.9 bugs, and prepare infrastructure for parallel phase execution.

**Phase numbering**: continues from v0.9 — first phase is **Phase 10**.
**Test baseline**: 406 (v0.9.1).
**Total requirements**: 10 v1 requirements + future requirements.

---

## v1 Requirements

### NotebookLM Query & Automation (QUERY)

- [ ] **QUERY-01**: User can call `askNotebook(notebookId, question)` from `lib/notebooklm.mjs` — wraps `notebooklm ask --json`, returns `{answer, citations}` with error handling, JSON parsing, and retry on transient failures
- [ ] **QUERY-02**: User can run `claude-dev-stack notebooklm ask "question"` from CLI — displays answer in terminal with citations, optional `--save` flag writes answer to `vault/projects/{slug}/docs/notebooklm-answers/`
- [ ] **QUERY-03**: User can call `generateArtifact(notebookId, type)` from `lib/notebooklm.mjs` — wraps `notebooklm generate report|mind-map|quiz`, returns artifact content/download path
- [ ] **SYNC-01**: User's vault auto-syncs to NotebookLM on session end — session-end hook triggers `notebooklm sync` silently in background after session log creation. Failure is non-blocking (warn only).

### Bugfixes (FIX)

- [ ] **FIX-01**: User running `notebooklm migrate --execute` on a vault with ADR files (title format `{slug}__ADR-NNNN-slug.md`) sees correct disk path resolution — maps to `vault/projects/{slug}/decisions/NNNN-slug.md` without `ADR-` prefix
- [ ] **FIX-02**: User running `notebooklm sync` sees actual counts in output (`12 uploaded, 5 skipped, 0 failed`) instead of `undefined`
- [ ] **FIX-03**: 5 code review warnings from Phase 6 fixed: (a) `hasCommand` uses `spawnSync` not shell interpolation, (b) `--full` mode doesn't double-prompt for main branch, (c) Go detector skips `node_modules/vendor/.git`, (d) `installSessionHook` warns on corrupt settings.json instead of silent overwrite, (e) `withStubBinary` is async-safe

### Refactoring (REFACTOR)

- [ ] **REFACTOR-01**: `bin/install.mjs` split from 1287-line monolith into focused modules — utility duplication with `lib/shared.mjs` removed, each wizard section is a separate importable function

### Infrastructure (INFRA)

- [ ] **INFRA-03**: ADR bridge — vault/decisions auto-populated from `.planning/CONTEXT.md` locked decisions (D-XX entries) during GSD workflow. Each decision becomes an ADR file with standardized format.
- [ ] **INFRA-04**: GSD parallel phase execution via `TeamCreate` — when ROADMAP shows independent phases (no `depends_on` overlap), GSD presents option to run them in parallel with cost estimate. User consent required before spawning.

---

## Future Requirements (v0.11+)

- **GIT-FUT-01**: Migration helper from prose CLAUDE.md → git-scopes.json
- **GIT-FUT-02**: Gitmoji extension for git-conventions skill (opt-in)
- **GIT-FUT-03**: GitHub Action generation for commitlint enforcement
- **NBLM-FUT-01**: Cross-notebook search aggregation in dev-research skill
- **NOTION-FUT-01**: Whole-database import (currently page-list only)
- **NOTION-FUT-02**: Notion REST API fallback when MCP server unavailable

## Out of Scope

- Two-way sync (NotebookLM ↔ vault) — vault is source of truth, NotebookLM is consumer + query target
- Real-time streaming of `notebooklm ask` responses — batch response only for v0.10
- Auto-sync on every file save — only on session end (intent-driven)
- Per-session notebook granularity — per-project is correct level
- Teams API direct integration — uses Claude Code's TeamCreate tool, not a custom API

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 10 | pending |
| FIX-02 | Phase 10 | pending |
| FIX-03 | Phase 10 | pending |
| QUERY-01 | Phase 11 | pending |
| QUERY-02 | Phase 11 | pending |
| QUERY-03 | Phase 11 | pending |
| SYNC-01 | Phase 12 | pending |
| REFACTOR-01 | Phase 12 | pending |
| INFRA-03 | Phase 13 | pending |
| INFRA-04 | Phase 13 | pending |
