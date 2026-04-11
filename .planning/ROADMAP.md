# Roadmap: claude-dev-stack — NotebookLM Auto-Sync (v0.8)

**Created:** 2026-04-10
**Milestone:** v0.8 — NotebookLM Auto-Sync MVP
**Granularity:** standard (3-5 plans per phase)
**Coverage:** 36/36 v1 requirements mapped (TEST-04 is continuous across all phases)

**Core Value:** Claude Code can resume work across sessions as if it remembered everything — extended with grounded recall from historical vault content via NotebookLM.

---

## Phases

- [x] **Phase 1: Fix Session-Manager Context Auto-Update** — Make `context.md` actually update on session end (prerequisite for syncing non-stale data) (completed 2026-04-10)
- [x] **Phase 2: NotebookLM CLI Wrapper** — Build `lib/notebooklm.mjs` as a thin wrapper over the `notebooklm-py` CLI (ADR-0001 pivot: no public NotebookLM REST API exists; delegate to upstream Python tool) (completed 2026-04-10)
- [x] **Phase 3: Sync Manifest & Change Detection** — Local hash manifest at `~/vault/.notebooklm-sync.json` to skip unchanged files (completed 2026-04-11)
- [ ] **Phase 4: Vault → NotebookLM Sync Pipeline** — Walk vault content categories and upload with `{project}__` naming convention
- [ ] **Phase 5: CLI Integration, Trigger & Wizard** — `notebooklm sync`/`status` commands, session-end background trigger, installer + doctor integration

---

## Phase Details

### Phase 1: Fix Session-Manager Context Auto-Update
**Goal**: `context.md` reliably gains a linked Session History entry every time a user ends a session, eliminating the stale-data risk that would otherwise poison NotebookLM sync.
**Depends on**: Nothing (first phase)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, TEST-03
**Success Criteria** (what must be TRUE):
  1. After a user invokes `session-manager /end` and a new session log is written, `~/vault/projects/{name}/context.md` contains a new entry under "Session History" linking that log file.
  2. All other sections of `context.md` (Overview, key decisions, footers) remain byte-for-byte intact after the update.
  3. If a project's `context.md` has no "Session History" section yet, the first `/end` creates it at a predictable anchor and subsequent ends append to it.
  4. The update logic lives in executable code (bash helper or Node.js script invoked by the skill), not as prose inside `SKILL.md`.
  5. `npm test` includes a test that simulates a session end and asserts `context.md` was actually modified with the expected entry.
**Plans**: 2 plans
Plans:
- [x] 01-01-PLAN.md — Pure session-context helper + unit tests (lib/session-context.mjs)
- [x] 01-02-PLAN.md — Wire wrapper, hook, skill, integration test
**UI hint**: no

### Phase 2: NotebookLM CLI Wrapper (`notebooklm-py`)
**Goal**: A developer using `lib/notebooklm.mjs` can create a notebook, list its sources, and upload/replace/delete a source by delegating to the `notebooklm-py` CLI via `spawnSync`, with no new npm dependencies, structured error types, and a fast-fail path when the binary is missing.
**Depends on**: Nothing (can run in parallel with Phase 1)
**Requirements**: NBLM-01, NBLM-02, NBLM-03, NBLM-04, NBLM-05, NBLM-06, TEST-01
**Scope pivot (2026-04-10, ADR-0001):** Originally scoped as an HTTP client to a public NotebookLM REST API with `NOTEBOOKLM_API_KEY`. Research during discuss-phase established that no such API exists — all programmatic NotebookLM access goes through `notebooklm-py` (Python CLI with browser OAuth). Phase 2 is therefore a thin wrapper over that CLI. See `vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` for rationale, alternatives considered, and consequences.
**Success Criteria** (what must be TRUE):
  1. `lib/notebooklm.mjs` exports `createNotebook`, `listSources`, `uploadSource`, `deleteSource`, `deleteSourceByTitle`, and `updateSource`. Each function calls `spawnSync('notebooklm', [...args, '--json'])` exactly once, parses stdout as JSON on success, and throws a typed Error (`NotebooklmCliError`, `NotebooklmRateLimitError`, or `NotebooklmNotInstalledError`) on failure.
  2. `package.json` `dependencies` block still contains only `{"prompts": "^2.4.2"}` after this phase — JavaScript single-dep constraint preserved. `notebooklm-py >= 0.3.4` is documented as a **system dependency** in `.planning/PROJECT.md` Constraints and checked by `lib/doctor.mjs` (Phase 5).
  3. `npm test` exercises `tests/notebooklm.test.mjs` against a **fake `notebooklm` binary** (bash stub placed at the front of `PATH` during test setup). The test covers: success path with canned JSON output, fast-fail when binary is missing from `PATH`, non-zero exit with stderr captured in the thrown error, rate-limit stderr pattern (`"No result found for RPC ID"`) producing `NotebooklmRateLimitError`. No real `notebooklm` binary is invoked in tests.
  4. Calling any exported function on a machine without `notebooklm` in `PATH` produces a `NotebooklmNotInstalledError` whose message includes the install hint (`pipx install notebooklm-py`) — not an `ENOENT` stack trace from `spawnSync`.
  5. Authentication is entirely delegated to `notebooklm-py`: `lib/notebooklm.mjs` never reads any env var related to auth, never touches `~/.notebooklm/storage_state.json`, never invokes `notebooklm login`. Verified by `grep -r NOTEBOOKLM_API_KEY lib/notebooklm.mjs` returning zero matches and by code review confirming no credential handling.
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — lib/notebooklm.mjs scaffold (errors, dual-mode runNotebooklm helper, lazy detection, stub fixture, test harness)
- [x] 02-02-PLAN.md — 6 public async functions + full test coverage + PROJECT.md system dep entry
**UI hint**: no

### Phase 3: Sync Manifest & Change Detection
**Goal**: A sync run can cheaply decide which vault files actually need to be re-uploaded by comparing SHA-256 hashes against a local manifest that survives crashes and is never committed to git.
**Depends on**: Nothing (can run in parallel with Phases 1 and 2)
**Requirements**: NBLM-14, NBLM-15, NBLM-16, NBLM-17, NBLM-18
**Success Criteria** (what must be TRUE):
  1. After a first sync run over a vault, `~/vault/.notebooklm-sync.json` exists and contains one entry per uploaded file with shape `{filepath: {hash, notebook_source_id, uploaded_at}}`.
  2. A second sync run immediately after the first makes zero upload API calls (all files report as unchanged via hash comparison).
  3. Editing a single vault file and running sync again re-uploads only that file; the manifest's `hash`, `notebook_source_id`, and `uploaded_at` update accordingly.
  4. Killing the process mid-write during a manifest update leaves the previous `.notebooklm-sync.json` intact (atomic write via `.tmp` + rename verified by test).
  5. Freshly initialized vault's `.gitignore` includes `.notebooklm-sync.json`, and an existing vault is migrated idempotently on first run.
**Plans**: 1 plan
Plans:
- [x] 03-01-PLAN.md — lib/notebooklm-manifest.mjs (5 exports: MANIFEST_VERSION, hashFile, readManifest, writeManifest, ensureManifestGitignored) + tests/notebooklm-manifest.test.mjs (3 tasks, ~28 new tests)
**UI hint**: no

### Phase 4: Vault → NotebookLM Sync Pipeline
**Goal**: A single function call walks all per-project vault content (sessions, ADRs, docs, context.md) and pushes it to a shared NotebookLM notebook with the correct `{project}__` naming convention and replace-by-filename semantics.
**Depends on**: Phase 2 (API client), Phase 3 (manifest)
**Requirements**: NBLM-07, NBLM-08, NBLM-09, NBLM-10, NBLM-11, NBLM-12, NBLM-13
**Success Criteria** (what must be TRUE):
  1. Running the sync function against a vault with at least two projects produces sources in the target notebook with filenames matching `{project}__{YYYY-MM-DD}-{slug}.md` (sessions), `{project}__ADR-{NNNN}-{slug}.md` (ADRs), `{project}__doc-{slug}.md` (docs), and `{project}__context.md` (context).
  2. Re-running sync after editing an ADR replaces the existing source (same filename, new content) rather than creating a duplicate — verified by listing sources before and after.
  3. Files under `~/vault/shared/` and `~/vault/meta/` are demonstrably skipped (not present in the notebook after sync).
  4. If the target notebook (default name `claude-dev-stack-vault`, or `NOTEBOOKLM_NOTEBOOK_NAME` if set) does not exist on first run, it is auto-created; subsequent runs reuse it.
  5. The pipeline reuses `projects.mjs::reverseProjectMap()` for path → project-slug lookup rather than introducing a fourth slug-generation code path.
**Plans**: TBD
**UI hint**: no

### Phase 5: CLI Integration, Trigger & Wizard
**Goal**: A user with `notebooklm-py` installed and authenticated can discover the feature through `claude-dev-stack install`, run sync manually, observe status, see health in `doctor`, and get automatic best-effort sync after every session end without any terminal noise on failure. Users without `notebooklm-py` are guided through installation inside the wizard.
**Depends on**: Phase 1 (session-manager fix), Phase 2 (CLI wrapper), Phase 3 (manifest), Phase 4 (pipeline)
**Requirements**: NBLM-19, NBLM-20, NBLM-21, NBLM-22, NBLM-23, NBLM-24, NBLM-25, NBLM-26, NBLM-27, TEST-02
**Success Criteria** (what must be TRUE):
  1. `claude-dev-stack notebooklm sync` runs end-to-end, prints per-file status, and exits 0 on success; `claude-dev-stack notebooklm status` prints last sync time, file count, and stale count on a real vault.
  2. Running `claude-dev-stack notebooklm status` on a freshly initialized vault (no manifest yet) exits 0 with a "no sync yet" message and does not throw — verified by `tests/project-setup.test.mjs`.
  3. After the Phase 1 fix is in place, ending a session via `session-manager /end` on a machine where `notebooklm` binary is in `PATH` AND `notebooklm auth check` returns exit 0 causes a detached background sync to run; session-end UI does not block on network I/O and returns control to the user immediately.
  4. Sync failures during the session-end trigger are appended to `~/vault/.notebooklm-sync.log` and never surface as errors in the user's terminal; when `notebooklm` binary is absent or `notebooklm auth check` fails, no sync attempt is made and the skip is logged at info level (not as an error).
  5. The install wizard offers "Set up NotebookLM sync?" as an optional step that: (a) explains the feature and its `notebooklm-py` system dependency, (b) detects if `notebooklm` is already in `PATH`, (c) if absent, offers to install via `pipx install notebooklm-py` with a `pip install --user notebooklm-py` fallback, (d) runs `notebooklm login` as an interactive subprocess to kick off browser OAuth, (e) verifies the setup with `notebooklm auth check`. No API key is ever prompted for or persisted by claude-dev-stack. `claude-dev-stack doctor` reports `notebooklm` binary presence, `notebooklm auth check` status, and last sync status as three separate lines when run afterwards.
**Plans**: TBD
**UI hint**: no

---

## Continuous Requirements

**TEST-04**: Full test suite (`npm test`) must pass at the end of every plan in every phase. This is not a phase — it is a non-negotiable quality gate applied during each plan's verify step.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fix Session-Manager Context Auto-Update | 2/2 | Complete   | 2026-04-10 |
| 2. NotebookLM CLI Wrapper | 2/2 | Complete   | 2026-04-10 |
| 3. Sync Manifest & Change Detection | 1/1 | Complete   | 2026-04-11 |
| 4. Vault → NotebookLM Sync Pipeline | 0/0 | Not started | - |
| 5. CLI Integration, Trigger & Wizard | 0/0 | Not started | - |

Plans counts populate during `/gsd-plan-phase N`.

---

## Dependency Graph

```
Phase 1 (session-manager fix) ─┐
                               │
Phase 2 (CLI wrapper) ─────────┼──> Phase 5 (CLI + trigger + wizard)
                               │
Phase 3 (manifest) ────────────┤
                               │
Phase 4 (sync pipeline) ───────┘
  ↑
  └── depends on Phase 2 + Phase 3
```

**Parallelism notes** (config.parallelization = true):
- Phases 1, 2, and 3 have no dependencies on each other and can be planned/executed in any order or in parallel waves.
- Phase 4 blocks on both Phase 2 and Phase 3.
- Phase 5 blocks on Phases 1, 2, 3, and 4 (the full stack).

---

## Research Notes for Phase Planning

Per-phase research is enabled (`config.workflow.research = true`). Each phase should research at planning time. Key things to investigate per phase:

- **Phase 1**: Examine `skills/session-manager/SKILL.md` line 80 and the current bash script to understand the execution model (what does the skill actually invoke today? where would a helper live?).
- **Phase 2**: **Investigate the discovered `notebooklm` Claude Code skill first.** If it wraps a reusable HTTP client or contains a spec of the NotebookLM API surface, Phase 2 may shrink to "write a thin adapter". If not, Phase 2 ships a from-scratch client. This decision gates plan count and effort estimate for the phase.
- **Phase 3**: Confirm Node 18 `fs.rename` atomicity guarantees across platforms (macOS/Linux); verify SHA-256 via `node:crypto` has no hidden cost on large files.
- **Phase 4**: Audit `lib/projects.mjs::reverseProjectMap` API shape; confirm it returns what the pipeline needs without widening the path↔slug surface area (per `CONCERNS.md`).
- **Phase 5**: Check current `bin/install.mjs` wizard structure for the right insertion point; decide config-file location for the API key (`~/.claude/.env`? `~/.claude/config.json`?) and document the choice.

---

*Roadmap created: 2026-04-10*
