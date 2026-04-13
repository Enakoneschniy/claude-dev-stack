# Roadmap: claude-dev-stack

## Milestones

- ✅ **v0.8 NotebookLM Sync** - Phases 1–5 (shipped 2026-04-10)
- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** - Phases 6–9 (shipped 2026-04-11)
- ✅ **v0.10 Query, Sync Automation & Quality** - Phases 10–13 (shipped 2026-04-13)
- 🚧 **v0.11 DX Polish & Ecosystem** - Phases 14–18 (in progress)

---

<details>
<summary>✅ v0.8–v0.10 (Phases 1–13) - SHIPPED 2026-04-13</summary>

### v0.8 — NotebookLM Sync (Phases 1–5)

4 phases completed. NotebookLM sync pipeline, manifest change detection, CLI integration, session-context fix.

### v0.9 — Git Conventions & NotebookLM Per-Project (Phases 6–9)

4 phases completed. Git conventions skill ecosystem, per-project notebook manifest v2, migration script, Notion auto-import via MCP.

### v0.10 — Query, Sync Automation & Quality (Phases 10–13)

4 phases completed. Bugfixes, NotebookLM Query API, sync automation + install.mjs refactor, GSD infrastructure (ADR bridge + parallel execution).

Archive: `.planning/milestones/v0.10-ROADMAP.md`

</details>

---

## 🚧 v0.11 — DX Polish & Ecosystem (In Progress)

**Milestone Goal:** Improve developer experience with auto-approve for vault operations, idempotent re-install wizard, git-conventions enhancements, NotebookLM cross-notebook search, Notion whole-database import, analytics integration, and path→slug centralization.

**Phase numbering:** continues from v0.10 (last phase: 13) → starts at Phase 14
**Granularity:** standard
**Test baseline:** 483 (v0.10.0)
**Branching:** `phase` → `gsd/phase-{phase}-{slug}`

## Phases

- [ ] **Phase 14: Code Review Fixes + Quality Refactor** — Fix 4 Phase 11 code review warnings and consolidate path-to-slug mapping into a single module
- [ ] **Phase 15: DX — Auto-Approve & Smart Re-install** — Configure auto-approve for vault operations and make the install wizard idempotent with pre-filled values
- [ ] **Phase 16: Git Conventions Ecosystem** — Add error handling, gitmoji support, GitHub Action generation, and CLAUDE.md migration helper to git-conventions
- [ ] **Phase 17: NotebookLM Cross-Notebook Search** — Enable querying across all project notebooks simultaneously from a single CLI command
- [ ] **Phase 18: Notion Database Import + Analytics Integration** — Import full Notion databases into vault and surface NotebookLM sync stats in the analytics dashboard

---

## Phase Details

### Phase 14: Code Review Fixes + Quality Refactor
**Goal**: Codebase is clean — Phase 11 warnings are fixed and path-to-slug mapping is centralized so future modules have one import to call instead of reinventing the same slug logic.
**Depends on**: Nothing (starts off main; all changes are to shipped code)
**Requirements**: REVIEW-01, QUALITY-01
**Success Criteria** (what must be TRUE):
  1. `npm test` passes with 0 failures and the 4 Phase 11 warnings (WR-01..WR-04: unused tmpdir, missing null check, shell quoting, silent flag discard) are gone from `lib/notebooklm.mjs` and `lib/notebooklm-cli.mjs`.
  2. A new `lib/project-naming.mjs` module exists and exports `toSlug(name)` and `fromSlug(slug)`.
  3. `add-project.mjs`, `projects.mjs`, `project-setup.mjs`, and `docs.mjs` all import slug utilities from `lib/project-naming.mjs` — no local duplicate implementations remain.
  4. All existing tests pass with the refactored imports — no behavior change observable by users.
**Plans:** 2 plans
Plans:
- [ ] 14-01-PLAN.md — Fix 4 Phase 11 code review warnings (WR-01..WR-04) in notebooklm.mjs and notebooklm-cli.mjs
- [ ] 14-02-PLAN.md — Centralize slug logic into lib/project-naming.mjs and update all consumer files

---

### Phase 15: DX — Auto-Approve & Smart Re-install
**Goal**: Running `claude-dev-stack` on a machine with existing config pre-fills known values and skips completed steps, and session-manager vault operations no longer trigger permission prompts.
**Depends on**: Phase 14 (clean baseline — slug module available for wizard to use when detecting existing projects)
**Requirements**: DX-01, DX-02
**Success Criteria** (what must be TRUE):
  1. User running `claude-dev-stack` on a machine with existing vault sees vault path, git remote, and project list pre-filled — they do not have to retype values they already configured.
  2. Each wizard section (vault setup, git sync, profiles, projects) shows a "skip" option when that section is already complete — user can skip all complete sections in one pass.
  3. User who selects "reconfigure" on a completed section sees the wizard re-run that section with existing values as defaults (not blank fields).
  4. Session-manager reads `context.md` and writes session logs without triggering permission prompts — `allowedTools` patterns are added to `.claude/settings.json` covering vault read/write paths.
  5. User can inspect `.claude/settings.json` and see the auto-approve allowlist patterns that were written during wizard setup.
**Plans**: TBD
**UI hint**: yes

---

### Phase 16: Git Conventions Ecosystem
**Goal**: Git-conventions skill is production-ready — missing prerequisites surface a clear error, gitmoji is opt-in, a GitHub Action enforces conventions in CI, and existing prose CLAUDE.md can be migrated to `git-scopes.json` automatically.
**Depends on**: Phase 14 (slug refactor in place; git-conventions tooling may use slug for file naming)
**Requirements**: GIT-01, GIT-02, GIT-03, GIT-04
**Success Criteria** (what must be TRUE):
  1. User running `scopes init` without git or Node installed sees a formatted error message with install instructions — no cryptic stack trace or silent failure.
  2. User who ran `scopes init --gitmoji` (or selected gitmoji in the interactive prompt) sees emoji prefixes applied to their commits — the mapping is stored in `git-scopes.json` and the skill reads it.
  3. User running `claude-dev-stack git-action` gets a `.github/workflows/commitlint.yml` file written to their project — the file is valid YAML that runs commitlint on every PR.
  4. User running `claude-dev-stack migrate-claude-md` sees an interactive review of extracted scopes/conventions before any file is written — they can accept, edit, or cancel before `git-scopes.json` is created.
**Plans**: TBD

---

### Phase 17: NotebookLM Cross-Notebook Search
**Goal**: Users can search across all their project notebooks with a single command — results are attributed to the right project so they know where each answer came from.
**Depends on**: Nothing (independent of Phases 15–16; builds on existing `lib/notebooklm.mjs` askNotebook from Phase 11)
**Requirements**: NBLM-01
**Success Criteria** (what must be TRUE):
  1. User running `claude-dev-stack notebooklm search "query"` sees results from all project notebooks — each result shows the project name, source title, and a relevant excerpt.
  2. Search runs notebooks in parallel — a query to 5 notebooks does not take 5× longer than a single-notebook query.
  3. If one notebook query fails, the command still returns results from the other notebooks — partial results are shown with a warning for the failed project.
  4. User with zero configured notebooks sees a clear message ("no notebooks configured") instead of an empty result or an error.
**Plans**: TBD

---

### Phase 18: Notion Database Import + Analytics Integration
**Goal**: Users can import an entire Notion database into vault with one command, and the analytics dashboard shows NotebookLM sync stats alongside existing session metrics.
**Depends on**: Phase 14 (slug module needed for database page file naming in vault)
**Requirements**: NOTION-01, ANALYTICS-01
**Success Criteria** (what must be TRUE):
  1. User running `claude-dev-stack notion import --database <id>` sees all pages from the Notion database saved as individual markdown files in `vault/projects/{name}/docs/notion/` — databases with more than 100 pages are fully imported (pagination handled).
  2. User running `claude-dev-stack analytics` sees NotebookLM sync stats (last sync time, source count, sync duration) in the dashboard output alongside existing session and context quality metrics.
  3. User running `claude-dev-stack analytics` sees query usage stats (questions asked, artifacts generated) — these counts update after each `notebooklm ask` or `notebooklm generate` call.
  4. User with no NotebookLM configured sees analytics dashboard without errors — NotebookLM section shows "not configured" instead of crashing or showing undefined values.
**Plans**: TBD

---

## Coverage Table

All 11 v1 requirements mapped to exactly one owning phase:

| REQ-ID | Phase | Description |
|--------|-------|-------------|
| REVIEW-01 | 14 | Fix 4 Phase 11 code review warnings (WR-01..WR-04) |
| QUALITY-01 | 14 | Centralize path-to-slug into lib/project-naming.mjs |
| DX-01 | 15 | Auto-approve allowlist for vault read/write in settings.json |
| DX-02 | 15 | Smart re-install wizard with pre-fill + skip/reconfigure |
| GIT-01 | 16 | GIT-09 error path — clear error for missing prerequisites |
| GIT-02 | 16 | Gitmoji opt-in via --gitmoji flag or interactive prompt |
| GIT-03 | 16 | GitHub Action generation for commitlint CI enforcement |
| GIT-04 | 16 | Migration helper from prose CLAUDE.md to git-scopes.json |
| NBLM-01 | 17 | Cross-notebook search with parallel execution + attribution |
| NOTION-01 | 18 | Notion database import with pagination handling |
| ANALYTICS-01 | 18 | NotebookLM sync stats + query usage in analytics dashboard |

**Coverage check**: 11/11 requirements mapped (100%), 0 orphaned.

- Phase 14: 2 requirements (REVIEW-01, QUALITY-01)
- Phase 15: 2 requirements (DX-01, DX-02)
- Phase 16: 4 requirements (GIT-01, GIT-02, GIT-03, GIT-04)
- Phase 17: 1 requirement (NBLM-01)
- Phase 18: 2 requirements (NOTION-01, ANALYTICS-01)

Total: 2 + 2 + 4 + 1 + 2 = 11 ✓

---

## Dependency Graph

```
Phase 14 — Code Review Fixes + Quality Refactor (LOW risk)
  ├─ fixes shipped Phase 11 warnings (notebooklm.mjs, notebooklm-cli.mjs)
  ├─ extracts slug logic into lib/project-naming.mjs
  └─ no upstream deps — starts fresh off main

Phase 15 — DX: Auto-Approve & Smart Re-install (MEDIUM risk)
  ├─ depends on Phase 14: slug module available for wizard project detection
  └─ largest feature in milestone — wizard refactor touches bin/install.mjs

Phase 16 — Git Conventions Ecosystem (LOW risk)
  ├─ depends on Phase 14: slug module (file naming)
  ├─ independent of Phase 15 — can run in parallel with 15
  └─ extends existing git-conventions skill infrastructure

Phase 17 — NotebookLM Cross-Notebook Search (LOW-MEDIUM risk)
  ├─ no upstream deps — independent of Phases 15, 16
  ├─ builds on lib/notebooklm.mjs askNotebook() from Phase 11
  └─ can execute in parallel with Phases 15 and 16 after Phase 14 completes

Phase 18 — Notion Database Import + Analytics Integration (LOW risk)
  ├─ depends on Phase 14: slug module for file naming
  ├─ independent of Phases 15, 16, 17 — can run in parallel with them
  └─ ANALYTICS-01 extends lib/analytics.mjs; NOTION-01 extends lib/docs.mjs
```

**Parallel opportunities** (after Phase 14):
- Phases 15, 16, 17, 18 are all independent of each other
- All depend only on Phase 14 (slug module)
- Maximum parallelism: run 15+16+17+18 concurrently after 14 completes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 10. Bugfixes | v0.10 | 2/2 | Complete | 2026-04-12 |
| 11. NotebookLM Query API | v0.10 | 2/2 | Complete | 2026-04-12 |
| 12. Sync Automation + install.mjs Refactor | v0.10 | 3/3 | Complete | 2026-04-13 |
| 13. GSD Infrastructure | v0.10 | 2/2 | Complete | 2026-04-13 |
| 14. Code Review Fixes + Quality Refactor | v0.11 | 0/2 | Planned | - |
| 15. DX — Auto-Approve & Smart Re-install | v0.11 | 0/? | Not started | - |
| 16. Git Conventions Ecosystem | v0.11 | 0/? | Not started | - |
| 17. NotebookLM Cross-Notebook Search | v0.11 | 0/? | Not started | - |
| 18. Notion Database Import + Analytics Integration | v0.11 | 0/? | Not started | - |

---

*Roadmap updated: 2026-04-13 — Phase 14 planned: 2 plans, 1 wave (parallel). v0.11 phases 14–18, 11/11 v1 requirements mapped, 0 orphaned.*
