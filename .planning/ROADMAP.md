# Milestone v0.10 Roadmap — Query, Sync Automation & Quality

**Goal**: Make NotebookLM a two-way tool (upload + query), auto-sync vault on session end, fix v0.9 bugs, and prepare infrastructure for parallel phase execution.
**Status**: 🚧 in progress
**Created**: 2026-04-12
**Phase numbering**: continues from v0.9 (last phase: 9) → starts at Phase 10
**Branching**: `phase` (per config.json `branching_strategy: "phase"` → `gsd/phase-{phase}-{slug}`)
**Granularity**: standard
**Test baseline**: 406 (v0.9.1)
**Single-dep constraint**: preserved unchanged (`prompts@^2.4.2` only)
**Core Value**: Claude Code can resume work across sessions as if it remembered everything — extended with two-way NotebookLM (upload + query) and automatic session-end sync.

---

## Phases

- [x] **Phase 10: Bugfixes** — Fix v0.9 migration ADR path resolution, sync stats `undefined` display, and 5 Phase 6 code-review warnings (completed 2026-04-12)
- [x] **Phase 11: NotebookLM Query API** — `askNotebook()` + `generateArtifact()` in `lib/notebooklm.mjs`, `notebooklm ask` CLI command with optional `--save` to vault (completed 2026-04-12)
- [x] **Phase 12: Sync Automation + install.mjs Refactor** — Session-end hook triggers background sync; `bin/install.mjs` split from 1287-line monolith into focused modules (completed 2026-04-12)
- [ ] **Phase 13: GSD Infrastructure** — ADR bridge (decisions auto-populated from `.planning/CONTEXT.md`) + parallel phase execution via TeamCreate

---

## Phase Details

### Phase 10: Bugfixes
**Goal**: Users can run NotebookLM migrate and sync commands without hitting the three known v0.9 bugs — ADR path mismatch, undefined sync counts, and the 5 code-review warnings that cause subtle misbehavior in the CLI.
**Depends on**: Nothing (starts fresh off main, all fixes are to shipped code)
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. User running `notebooklm migrate --execute` on a vault with ADR files titled `{slug}__ADR-NNNN-slug.md` sees the file resolved to `vault/projects/{slug}/decisions/NNNN-slug.md` (no `ADR-` in filename) with no "file not found" errors.
  2. User running `notebooklm sync` sees actual numeric counts in the output (`12 uploaded, 5 skipped, 0 failed`) instead of `undefined` for any field.
  3. `hasCommand()` uses `spawnSync` (not shell string interpolation), `--full` mode does not double-prompt for main branch, Go detector skips `node_modules/vendor/.git`, `installSessionHook` warns on corrupt settings.json, and `withStubBinary` is async-safe — all verified by `npm test` green.
**Plans:** 2/2 plans complete
Plans:
- [x] 10-01-PLAN.md — Fix ADR path resolution (FIX-01) and sync stats undefined (FIX-02)
- [x] 10-02-PLAN.md — Fix 5 code review warnings WR-01 through WR-05 (FIX-03)

---

### Phase 11: NotebookLM Query API
**Goal**: Users can query their NotebookLM notebook from the CLI and from `lib/notebooklm.mjs` API — turning NotebookLM from a write-only sync target into a queryable knowledge base.
**Depends on**: Phase 10 (clean baseline — migrate and sync bugs resolved before adding new NotebookLM surface)
**Requirements**: QUERY-01, QUERY-02, QUERY-03
**Success Criteria** (what must be TRUE):
  1. User can call `askNotebook(notebookId, question)` from code and get back `{answer, citations}` — with JSON parsing, transient-error retry, and a meaningful error message on permanent failure.
  2. User running `claude-dev-stack notebooklm ask "what did we decide about auth?"` sees the answer printed in the terminal with citations listed beneath it.
  3. User running the same command with `--save` gets the answer written to `vault/projects/{slug}/docs/notebooklm-answers/{timestamp}-{slug}.md` and sees a confirmation path in the output.
  4. User can call `generateArtifact(notebookId, 'report')` (or `mind-map` / `quiz`) from code and get back artifact content or a download path.
**Plans**: TBD
**UI hint**: no

---

### Phase 12: Sync Automation + install.mjs Refactor
**Goal**: Vault syncs to NotebookLM automatically on every session end (no manual intervention), and `bin/install.mjs` becomes maintainable by splitting the 1287-line monolith into focused importable modules.
**Depends on**: Phase 11 (session-end sync is most valuable after query also works — user gets full two-way flow from day one of this phase)
**Requirements**: SYNC-01, REFACTOR-01
**Success Criteria** (what must be TRUE):
  1. User ending a Claude session (triggering the session-end hook) sees vault sync to NotebookLM start silently in the background — with no blocking, no modal prompt, and a non-intrusive log entry in `~/vault/.notebooklm-sync.log`.
  2. If sync fails during session end, the session-end hook exits 0 (non-blocking) and a warn-level message appears in the log — Claude's session end is never interrupted by a sync failure.
  3. `bin/install.mjs` wizard runs identically before and after the refactor — all existing interactive flows, prompts, and defaults are preserved. No wizard behavior changes.
  4. Each wizard section extracted from `bin/install.mjs` is a separately importable function in its own module — utility functions duplicated from `lib/shared.mjs` are removed from install.mjs and the shared version is imported instead.
**Plans:** 3/3 plans complete
Plans:
- [x] 12-01-PLAN.md — SYNC-01 verification + structural regression tests
- [x] 12-02-PLAN.md — Extract 13 wizard modules from install.mjs into lib/install/
- [x] 12-03-PLAN.md — Rewrite bin/install.mjs as thin orchestrator + update tests

---

### Phase 13: GSD Infrastructure
**Goal**: GSD workflow captures locked decisions into vault ADRs automatically, and independent phases can be offered to run in parallel (with explicit user consent) — reducing manual ceremony around decision logging and cutting wall-clock time for future milestones.
**Depends on**: Nothing (pure GSD tooling; independent of NotebookLM phases)
**Requirements**: INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. After a GSD phase transition, locked decisions from `.planning/CONTEXT.md` (D-XX entries) are automatically written as ADR files in `vault/projects/{slug}/decisions/` with standardized format — without any manual copy-paste from the user.
  2. User can open an existing vault ADR and see it was created by the bridge (via a provenance comment or frontmatter field) rather than being manually authored.
  3. When GSD detects two or more phases with no shared `depends_on` overlap, it presents the user with a parallel execution option and a cost estimate before spawning any subagents — explicit consent is required every time.
  4. If user declines parallel execution, phases run sequentially in their numbered order — existing GSD behavior is fully preserved as the default.
**Plans**: TBD

---

## Coverage Table

All 10 v1 requirements mapped to exactly one owning phase:

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| FIX-01 | 10 | ADR path resolution in notebooklm-migrate.mjs |
| FIX-02 | 10 | Sync stats undefined display fix in notebooklm-sync.mjs |
| FIX-03 | 10 | 5 code-review warnings from Phase 6 |
| QUERY-01 | 11 | `askNotebook()` API in lib/notebooklm.mjs |
| QUERY-02 | 11 | `notebooklm ask` CLI with --save flag |
| QUERY-03 | 11 | `generateArtifact()` API in lib/notebooklm.mjs |
| SYNC-01 | 12 | Session-end hook triggers background sync |
| REFACTOR-01 | 12 | bin/install.mjs monolith split |
| INFRA-03 | 13 | ADR bridge from .planning/CONTEXT.md decisions |
| INFRA-04 | 13 | Parallel phase execution via TeamCreate |

**Coverage check**: 10/10 requirements mapped (100%), 0 orphaned.

- Phase 10: 3 requirements (FIX-01, FIX-02, FIX-03)
- Phase 11: 3 requirements (QUERY-01, QUERY-02, QUERY-03)
- Phase 12: 2 requirements (SYNC-01, REFACTOR-01)
- Phase 13: 2 requirements (INFRA-03, INFRA-04)

Total: 3 + 3 + 2 + 2 = 10 ✓

---

## Dependency Graph

```
Phase 10 — Bugfixes (LOW risk)
  ├─ fixes shipped code in notebooklm-migrate.mjs, notebooklm-sync.mjs, shared utilities
  └─ no upstream deps — starts fresh off main

Phase 11 — NotebookLM Query API (LOW-MEDIUM risk)
  ├─ depends on Phase 10: clean NotebookLM baseline (migrate + sync bugs resolved)
  └─ extends lib/notebooklm.mjs with askNotebook + generateArtifact

Phase 12 — Sync Automation + install.mjs Refactor (LOW risk)
  ├─ SYNC-01 depends on Phase 11: session-end sync more coherent after query ships
  ├─ REFACTOR-01 is independent but co-located for milestone coherence
  └─ no new external dependencies introduced

Phase 13 — GSD Infrastructure (LOW risk)
  ├─ INFRA-03: independent of all NotebookLM phases
  ├─ INFRA-04: independent of all NotebookLM phases
  └─ can execute in parallel with Phase 10 or 11 if INFRA-04 were already done (ironic)
```

**DAG verification**: strict DAG, no cycles. Forward edges only: 10→11, 11→12. Phase 10 and Phase 13 are both source-adjacent (13 has no deps on any v0.10 phase). Phase 12 is the sink for the NotebookLM track.

---

## Progress Table

| Phase | Plans Complete | Status | Tests Added (est) | Completed |
|-------|---------------|--------|-------------------|-----------|
| 10. Bugfixes | 0/2 | 2/2 | Complete    | 2026-04-12 |
| 11. NotebookLM Query API | 0/? | 2/2 | Complete    | 2026-04-12 |
| 12. Sync Automation + install.mjs Refactor | 0/3 | 3/3 | Complete   | 2026-04-12 |
| 13. GSD Infrastructure | 0/? | Not started | ~10 (~451 → ~461) | — |

**Total plans (estimated)**: TBD (plan counts filled during `/gsd-plan-phase`)
**Total tests added (estimated)**: ~55 (406 → ~461)

---

## Backlog

### Phase 999.1: Smart Re-install Wizard (BACKLOG)

**Goal:** Make the install wizard idempotent — detect existing vault/config, skip completed steps, pre-fill known values (git remote, profile, projects). Running wizard twice should not re-ask for info it already has. Needs global config or vault-based state to remember what was installed. User-reported friction: vault found but git sync still asks for remote URL that's already configured. Scope to be detailed after v0.10 release — likely more issues than initially listed.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---

*Roadmap generated: 2026-04-12 by `gsd-roadmapper` from REQUIREMENTS.md. Phase numbering continues from v0.9 (last phase: 9) → starts at Phase 10. 10/10 v1 requirements mapped, 0 orphaned.*
