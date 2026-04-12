# Milestone v0.9 Roadmap — Git Conventions & NotebookLM Per-Project

**Goal**: Make per-project workflow first-class — every claude-dev-stack project gets its own git policy enforcement (commits/branches/scopes) and its own dedicated NotebookLM notebook, with automated Notion imports for selected pages.
**Status**: 🚧 in progress
**Created**: 2026-04-12
**Phase numbering**: continues from v0.8 (last phase: 5) → starts at Phase 6
**Branching**: `none` (feature branches + PR + CI + squash merge, matching PRs #17–#20 posture)
**Granularity**: standard (2–3 plans per phase)
**Test baseline**: 264 → target ~350+
**Single-dep constraint**: preserved unchanged (`prompts@^2.4.2` only)
**Core Value**: Claude Code can resume work across sessions as if it remembered everything — extended so every project has its own isolated git policy, notebook, and Notion feed.

---

## Phases

- [ ] **Phase 6: Git-Conventions Skill Ecosystem** — Per-project `git-conventions` skill + `scopes` CLI + 7-stack auto-detect + wizard integration + cross-cutting fixtures/`atomicWriteJson` infra
- [ ] **Phase 7: NotebookLM Manifest v2 + Per-Project Sync Loop** — Safe v1→v2 manifest migration (in FIRST commit) + `cds__{slug}` per-project notebooks + `syncVault()` per-project loop + doctor stats
- [ ] **Phase 8: NotebookLM Migration Script (`notebooklm migrate`)** — Two-phase-commit one-shot migration of existing 27 sources from shared `claude-dev-stack-vault` into `cds__{slug}` notebooks with resume log
- [ ] **Phase 9: Notion Auto-Import via MCP (Skill-First)** — `.claude/notion_pages.json` + `notion-importer` skill + three-way-hash overwrite protection + doctor MCP check

---

## Phase Details

### Phase 6: Git-Conventions Skill Ecosystem
**Status**: planned
**Goal**: Every mapped project gets a `git-conventions` skill wired to a validated `.claude/git-scopes.json` config, auto-detected from the project's stack, with a `scopes` CLI for post-install maintenance. Also ships the cross-cutting `tests/helpers/fixtures.mjs` and `lib/shared.mjs::atomicWriteJson()` infrastructure that later phases depend on.
**Risk**: LOW
**UI hint**: no
**Depends on**: — (starts fresh off main)
**Discuss-phase**: NO — straight to `/gsd-plan-phase` (NMP reference implementation provides template shape; sentinel-file detection is mechanical; no upstream API uncertainty)
**Requirements**: INFRA-01, INFRA-02, GIT-01, GIT-02, GIT-03, GIT-04, GIT-05, GIT-06, GIT-07, GIT-08, GIT-09, GIT-10

**Success criteria** (what must be TRUE):
- [ ] 1. User can run `claude-dev-stack scopes init --quick` in a pnpm-workspace repo and within 60 seconds get a valid populated `.claude/git-scopes.json` plus an installed `{project}/.claude/skills/git-conventions/SKILL.md` — without any manual editing and without any `npm install` being spawned by claude-dev-stack itself.
- [ ] 2. User pointing `claude-dev-stack scopes init` at any of the 7 supported stack types (pnpm-workspace.yaml, npm/yarn workspaces, Nx, Turborepo, Lerna, Cargo workspace, Go multi-module, Python uv workspace) sees auto-detected scopes populated with zero false positives on the fixture matrix; projects with no detectable stack get a single `core` scope and a clear wizard message.
- [ ] 3. User running the main `bin/install.mjs` setup wizard sees git-conventions installed for every mapped project as a wizard step, with `co_authored_by` defaulting to `false` and commitlint install defaulting to OFF (print-only when opted in, never spawning `npm install`), and with main-branch auto-detected via `git symbolic-ref refs/remotes/origin/HEAD` plus a confirmable fallback prompt.
- [ ] 4. User asking Claude in a live session "commit this as a fix" inside a project with `git-conventions` installed gets a commit message built from the project's `.claude/git-scopes.json` — skill auto-triggers via its description, reads the config at invoke time, and produces the right `type(scope): subject` shape without any Co-Authored-By line for claude-dev-stack itself.
- [ ] 5. User running `claude-dev-stack doctor` on a mapped project missing `.claude/git-scopes.json` sees a WARN (existing projects) or ERROR (new installs post-wizard), and all git-scopes config files in the repo were written via `atomicWriteJson()` (temp + rename), never via plain `writeFileSync`.
- [ ] 6. Any new `tests/*.test.mjs` file needing a temp vault, temp git repo, temp monorepo, or a stub CLI binary can call `makeTempVault`, `makeTempGitRepo`, `makeTempMonorepo(stackType)`, or `withStubBinary` from `tests/helpers/fixtures.mjs` — no new test file duplicates setup boilerplate; all `/tmp/cds-*` temp dirs are cleaned up at test end.

**Estimated tests added**: ~40 (264 → ~304)
**Plans:** 3 plans

Plans:
- [ ] 06-01-PLAN.md — Cross-cutting infra: atomicWriteJson + test fixtures (makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary)
- [ ] 06-02-PLAN.md — Core git-scopes module: schema validation, 7-stack detection, SKILL.md template, CLI dispatch
- [ ] 06-03-PLAN.md — Wizard integration (installGitConventions) + doctor section + commitlint print-only

---

### Phase 7: NotebookLM Manifest v2 + Per-Project Sync Loop
**Status**: planned
**Goal**: `claude-dev-stack notebooklm sync` uploads each project's vault content into its own namespaced `cds__{slug}` notebook, with a safely-migrated v2 manifest that preserves every v1 hash entry. The manifest v1→v2 fix lands before the `MANIFEST_VERSION` bump, so no existing user's tracking history is ever wiped.
**Risk**: MEDIUM
**UI hint**: no
**Depends on**: Phase 6 (uses `tests/helpers/fixtures.mjs` for sync stubs; uses `atomicWriteJson` for migration log writes)
**Discuss-phase**: YES — atomicity + rollback semantics + manifest v2 migration strategy (ADR-0001 precedent). Must run before `/gsd-plan-phase`.
**Requirements**: NBLM-V2-01, NBLM-V2-02, NBLM-V2-03, NBLM-V2-04, NBLM-V2-08, NBLM-V2-09, TEST-04

**Success criteria** (what must be TRUE):
- [ ] 1. **CRITICAL FIRST-COMMIT GATE.** The FIRST commit of Phase 7 lands NBLM-V2-01 + TEST-04 together: `isValidManifestShape()` is split to distinguish `{valid, reason: 'unknown-version' | 'malformed'}`, `migrateV1ToV2()` is added, `readManifest()` calls it in-place with `.v1.backup.json` written on first upgrade, and `tests/notebooklm-manifest-migration.test.mjs` writes a v1 manifest with 3 entries and asserts v2 reads them as 3 migrated entries. Only AFTER that commit does any subsequent commit bump `MANIFEST_VERSION` to 2.
- [ ] 2. User running `claude-dev-stack notebooklm sync` in a vault with 2+ mapped projects ends up with one notebook per project, each named `cds__{slug}`, with sources uploaded under titles that drop the `{project}__` prefix (because the notebook is already project-scoped via `buildTitle(..., { projectScoped: true })`). A pre-flight conflict scan aborts with an actionable message if any `cds__{slug}` notebook already exists outside of claude-dev-stack's control (unless `--force-adopt`).
- [ ] 3. User upgrading from v0.8.1 (v1 manifest with N file entries) to v0.9 sees the first `notebooklm sync` run transparently upgrade the manifest to v2 shape (`{version: 2, projects: {[slug]: {notebook_id, files}}}`), with all N v1 entries still present and no source re-uploaded (hash matches survive the migration); the `.v1.backup.json` file exists next to the manifest for the duration of v0.9.
- [ ] 4. User running `claude-dev-stack doctor` after first per-project sync sees the NotebookLM section report notebook count, total sources across all notebooks, and a per-project breakdown; if `NOTEBOOKLM_NOTEBOOK_NAME` env var is set, doctor emits a deprecation warning announcing legacy single-notebook mode will be dropped in v1.0.
- [ ] 5. User running `npm test` sees the new `notebooklm-sync` per-project tests (driven by the `withStubBinary` stubbed `notebooklm` binary from Phase 6 fixtures) cover: happy-path multi-project loop, per-project stats aggregation (`{perProject: {[slug]: {...}}, total: {...}}`), v1→v2 in-place upgrade, pre-flight conflict abort, and `buildTitle` projectScoped branch dropping the prefix. `lib/notebooklm.mjs` diff is ZERO lines — D-03 boundary respected.

**Estimated tests added**: ~25 (~304 → ~329)
**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — Manifest v2 foundation: isValidManifestShape split + migrateV1ToV2 + migration tests (FIRST COMMIT GATE)
- [ ] 07-02-PLAN.md — MANIFEST_VERSION bump to 2 + per-project syncVault loop + buildTitle projectScoped + conflict scan
- [ ] 07-03-PLAN.md — Doctor per-project NotebookLM stats + NOTEBOOKLM_NOTEBOOK_NAME deprecation warning

---

### Phase 8: NotebookLM Migration Script (`notebooklm migrate`)
**Status**: pending
**Goal**: User can run `claude-dev-stack notebooklm migrate` once to relocate all existing 27 sources from the shared `claude-dev-stack-vault` notebook into per-project `cds__{slug}` notebooks, under a two-phase-commit protocol that never deletes from the shared notebook until every source has been round-trip verified in its target. The migration is idempotent, resumable, and dry-run by default.
**Risk**: MEDIUM-HIGH
**UI hint**: no
**Depends on**: Phase 7 (needs v2 manifest writer + per-project `syncVault()` + `ensureNotebook('cds__{slug}')`); also consumes Phase 6 fixtures for test matrix stubs
**Discuss-phase**: YES — dedicated discuss-phase for migration test matrix + rate-limit handling + recovery/resume semantics. Must run before `/gsd-plan-phase`.
**Requirements**: NBLM-V2-05, NBLM-V2-06, NBLM-V2-07, TEST-03

**Success criteria** (what must be TRUE):
- [ ] 1. User running `claude-dev-stack notebooklm migrate` with no flags gets a dry-run report listing every source in the shared notebook, its proposed target `cds__{slug}` notebook, and a summary count per project — with zero writes anywhere on disk or in NotebookLM. Explicit `--execute` is required for any mutation.
- [ ] 2. User running `claude-dev-stack notebooklm migrate --execute` on the real 27-source shared notebook sees Phase A (upload to per-project notebooks + round-trip verify via `listSources()` title match) complete with zero failures BEFORE Phase B (delete from shared notebook) starts; if Phase A reports any failure, Phase B is skipped entirely and the shared notebook is left untouched. The shared notebook itself is NEVER auto-deleted at any point.
- [ ] 3. User killing the migrate process mid-run and re-running `claude-dev-stack notebooklm migrate --execute` sees a resumable continuation — sources already `uploaded`+`verified` in `~/vault/.notebooklm-migration.json` are skipped; only remaining work is attempted; duplicate uploads never happen.
- [ ] 4. User auditing migration progress via `cat ~/vault/.notebooklm-migration.json` sees per-source entries with shape `{source_id, old_notebook_id, new_notebook_id, target_project, status: pending|uploaded|verified|deleted}` reflecting exactly where the two-phase commit is for every source; the log file is written via `atomicWriteJson` (from Phase 6) after every state transition.
- [ ] 5. User running `npm test` sees `tests/notebooklm-migrate.test.mjs` cover the full fixture matrix: empty notebook, 27-source real-shape fixture, partial-failure mid-project, duplicate target slug, orphan source — all driven by stubbed `lib/notebooklm.mjs` primitives (never invoking the real binary). Additionally, before Phase 8 PR merge, a real-notebook smoke test on a burner notebook confirms round-trip verification actually works end-to-end.
- [ ] 6. `lib/notebooklm-migrate.mjs` ONLY orchestrates existing `lib/notebooklm.mjs` primitives — it adds zero new primitives, and `lib/notebooklm.mjs` file diff across the entire phase is zero lines (D-03 boundary preserved).

**Estimated tests added**: ~20 (~329 → ~349)
**Estimated plans**: 2 (migrate core + test matrix/smoke test/CLI dispatch)

---

### Phase 9: Notion Auto-Import via MCP (Skill-First)
**Status**: pending
**Goal**: User can declare which Notion pages to auto-import per project via `.claude/notion_pages.json`, and trigger imports via the `notion-importer` skill inside a live Claude session (skill-first, not subprocess). Imported markdown lands in `vault/projects/{slug}/docs/notion/` with a frontmatter provenance stamp that prevents silent overwrites of local edits — shipped in the FIRST version, never retrofitted. Existing NotebookLM sync picks up the new files automatically.
**Risk**: LOW-MEDIUM
**UI hint**: no
**Depends on**: Phase 7 (imported docs flow into Phase 7's per-project `cds__{slug}` notebooks); optional dependency on Phase 6 (`.claude/` config convention + `atomicWriteJson`)
**Discuss-phase**: OPTIONAL but RECOMMENDED — Notion markdown fidelity edge cases (databases, synced blocks, mentions) + MCP error-response shapes (429 passthrough, auth expiry). Can be folded into plan-phase if time-boxed.
**Requirements**: NOTION-01, NOTION-02, NOTION-03, NOTION-04, NOTION-05, NOTION-06, NOTION-07

**Success criteria** (what must be TRUE):
- [ ] 1. User can run `claude-dev-stack notion add https://www.notion.so/workspace/Page-Name-abc123def456` and end up with a validated entry in `{project}/.claude/notion_pages.json` v1 schema — with `page_id` extracted correctly from both dashed and undashed URL formats, and with `vault_path` defaulting to `vault/projects/{slug}/docs/notion/`.
- [ ] 2. User asking Claude "import the Notion docs for this project" inside a live Claude session triggers the `notion-importer` skill, which calls `claude.ai Notion` MCP tools (`notion-fetch`, `notion-search`) directly from the session — NOT via `spawnSync('claude', ['mcp', 'call', ...])`. The skill is installed at `{project}/.claude/skills/notion-importer/SKILL.md` and auto-triggers via skill description on Notion import intents.
- [ ] 3. User's imported Notion markdown file lands at `vault/projects/{slug}/docs/notion/{cleanNotionFilename}.md` (NOT flat `docs/`) with a frontmatter provenance stamp containing `notion_page_id`, `notion_last_synced`, and `notion_content_hash` — and this stamp ships in the FIRST version of the importer, not a retrofit. `cleanNotionFilename()` and `scanDir()` are imported from `lib/docs.mjs` as named exports (extracted, not duplicated).
- [ ] 4. User who has locally edited an imported Notion file and then re-runs `claude-dev-stack notion import --page <id>` does NOT have their local changes overwritten — the three-way hash check detects the local drift, writes the new version to `{filename}.notion-update.md` as a sibling file, and emits a `warn()` message. Re-import of an unchanged file is a no-op based on `notion_content_hash` comparison.
- [ ] 5. User running `claude-dev-stack doctor` on a machine where the `claude.ai Notion` MCP server is not detected sees a hard ERROR (NOT a silent skip), and doctor's detection reuses the existing `claude mcp list --json` pattern. If the MCP server is present, doctor reports it as OK alongside the notebook/git-scopes sections.
- [ ] 6. `lib/notebooklm.mjs` diff across Phase 9 is ZERO lines, and the imported markdown files flow into each project's `cds__{slug}` NotebookLM notebook on the next `notebooklm sync` run without any Phase 9 code touching NotebookLM sync paths directly.

**Estimated tests added**: ~20 (~349 → ~369)
**Estimated plans**: 2 (config/import core + skill/doctor/CLI wiring)

---

## Continuous Testing Gates

The following requirements apply to every phase as cross-cutting quality gates, not phase-owned deliverables:

- **TEST-01** — `npm test` MUST be green at every PR across all 4 phases. Target test count growth: 264 → ~350+ by end of v0.9.
- **TEST-02** — Every new `lib/*.mjs` module introduced in any v0.9 phase MUST ship with a matching `tests/*.test.mjs` file using `node:test` + `node:assert/strict` only; no external test frameworks. External CLI dependencies (notebooklm, claude mcp) are mocked via bash stubs on `PATH` per the Phase 6 `withStubBinary` helper.

These are enforced in CI (matrix: Node 18/20/22) and verified before every PR merge — no phase can claim completion with regressions or untested new modules.

---

## Coverage Table

All 32 v1 requirements mapped to exactly one owning phase (continuous gates listed separately above):

| REQ-ID | Phase | Notes |
|---|---|---|
| INFRA-01 | 6 | `tests/helpers/fixtures.mjs` cross-cutting infra, shipped in Phase 6 for later phases to consume |
| INFRA-02 | 6 | `lib/shared.mjs::atomicWriteJson` cross-cutting infra, shipped in Phase 6 |
| GIT-01 | 6 | git-scopes.json v1 schema + validation |
| GIT-02 | 6 | 7-stack sentinel-file auto-detection |
| GIT-03 | 6 | `scopes` CLI subcommands (list/refresh/add/remove/init) |
| GIT-04 | 6 | `scopes init --quick` / `--full` modes (4-question quick mode) |
| GIT-05 | 6 | Parameterized `git-conventions` skill installed per-project |
| GIT-06 | 6 | `co_authored_by` config field, default false (MEMORY.md rule) |
| GIT-07 | 6 | Main-branch auto-detect via `git symbolic-ref` + confirmable fallback |
| GIT-08 | 6 | `bin/install.mjs::installGitConventions()` wizard integration |
| GIT-09 | 6 | Doctor WARN/ERROR severity for missing git-scopes.json |
| GIT-10 | 6 | Opt-in commitlint wizard prompt, print-only (never spawns npm install) |
| NBLM-V2-01 | 7 | **CRITICAL first-commit gate**: isValidManifestShape split + migrateV1ToV2 + `.v1.backup.json` |
| NBLM-V2-02 | 7 | syncVault per-project loop with ensureNotebook per slug |
| NBLM-V2-03 | 7 | `cds__{slug}` namespaced naming + pre-flight conflict scan |
| NBLM-V2-04 | 7 | `buildTitle(..., { projectScoped: true })` prefix-drop branch |
| NBLM-V2-05 | 8 | `notebooklm migrate` CLI + `lib/notebooklm-migrate.mjs` orchestrator |
| NBLM-V2-06 | 8 | Two-phase commit (upload+verify → delete) with idempotent resume |
| NBLM-V2-07 | 8 | `~/vault/.notebooklm-migration.json` per-source status log |
| NBLM-V2-08 | 7 | Doctor deprecation warning for `NOTEBOOKLM_NOTEBOOK_NAME` env var |
| NBLM-V2-09 | 7 | Doctor per-project NotebookLM stats (count/sources/breakdown) |
| NOTION-01 | 9 | `.claude/notion_pages.json` v1 schema + `lib/notion-config.mjs` validation |
| NOTION-02 | 9 | `notion` CLI subcommands (list/add/import) |
| NOTION-03 | 9 | `notion-importer` skill (skill-first MCP invocation, Option B locked) |
| NOTION-04 | 9 | URL → page-ID extraction (dashed + undashed formats) |
| NOTION-05 | 9 | `vault/projects/{slug}/docs/notion/` subdirectory isolation |
| NOTION-06 | 9 | Frontmatter provenance stamp in FIRST version + three-way hash check |
| NOTION-07 | 9 | Doctor hard ERROR on missing `claude.ai Notion` MCP server |
| TEST-01 | continuous | Cross-cutting gate — all PRs green, test count 264 → ~350+ |
| TEST-02 | continuous | Cross-cutting gate — every new lib/*.mjs gets matching tests |
| TEST-03 | 8 | Migration fixture matrix + real-notebook burner smoke test |
| TEST-04 | 7 | **Must land in Phase 7 FIRST commit** alongside NBLM-V2-01 |

**Coverage check**: 32/32 requirements mapped (100%), 0 orphaned.

- Phase 6: 12 requirements (INFRA-01..02, GIT-01..10)
- Phase 7: 7 requirements (NBLM-V2-01..04, NBLM-V2-08..09, TEST-04)
- Phase 8: 4 requirements (NBLM-V2-05..07, TEST-03)
- Phase 9: 7 requirements (NOTION-01..07)
- Continuous: 2 requirements (TEST-01, TEST-02)

Total: 12 + 7 + 4 + 7 + 2 = 32 ✓

---

## Dependency Graph

```
Phase 6 — git-conventions skill ecosystem (LOW risk)
  ├─ ships tests/helpers/fixtures.mjs (cross-cutting infra for all later phases)
  ├─ ships lib/shared.mjs::atomicWriteJson (cross-cutting infra)
  └─ no upstream deps — starts fresh off main

Phase 7 — NotebookLM manifest v2 + per-project sync (MEDIUM risk)
  ├─ depends on Phase 6: fixtures.mjs (withStubBinary for notebooklm stubs)
  ├─ depends on Phase 6: atomicWriteJson (for manifest writes)
  ├─ REQUIRES discuss-phase before plan-phase (atomicity + rollback + v2 migration)
  └─ FIRST COMMIT gate: NBLM-V2-01 + TEST-04 land together, BEFORE MANIFEST_VERSION bump

Phase 8 — NotebookLM migrate script (MEDIUM-HIGH risk)
  ├─ depends on Phase 7: v2 manifest writer
  ├─ depends on Phase 7: per-project syncVault + ensureNotebook('cds__{slug}')
  ├─ depends on Phase 6: fixtures.mjs (migration test matrix)
  ├─ depends on Phase 6: atomicWriteJson (migration log writes)
  └─ REQUIRES discuss-phase before plan-phase (test matrix + rate-limit + recovery)

Phase 9 — Notion auto-import via MCP (LOW-MEDIUM risk)
  ├─ depends on Phase 7: per-project notebooks (imported docs flow into cds__{slug})
  ├─ optional depends on Phase 6: .claude/ config convention + atomicWriteJson
  ├─ discuss-phase OPTIONAL (recommended for markdown fidelity + MCP error shapes)
  └─ can be deferred to v0.10 if Phase 7/8 slip without blocking core v0.9 value
```

**DAG verification**: strict DAG, no cycles. Forward edges only: 6→7, 6→8, 6→9 (optional), 7→8, 7→9. Phase 6 is a pure source node; Phase 9 is a pure sink node; Phase 7 is the critical middle with the highest-stakes first-commit gate.

---

## Locked Decisions (from research — NOT up for re-litigation)

1. **Notion MCP invocation strategy** = Option B (skill-driven from live Claude session); Option A (`spawnSync('claude', ['mcp', 'call', ...])`) deferred to v1.0
2. **Per-project notebook naming** = `cds__{slug}` namespaced prefix
3. **commitlint install** = opt-in, print-only (never `spawnSync npm install`)
4. **Co-Authored-By** = config field in git-scopes.json, default OFF for claude-dev-stack
5. **Manifest v2 migration** = auto-migrate in place from v1 at `readManifest()` time, `.v1.backup.json` kept one milestone
6. **Migration protocol** = two-phase commit (Phase A upload+verify → Phase B delete) with `~/vault/.notebooklm-migration.json` log
7. **Notion imports land in** = `vault/projects/{slug}/docs/notion/` subdirectory (not flat docs/)
8. **Frontmatter provenance stamp** ships in FIRST version of Notion importer, never retrofitted
9. **Branching strategy** = `none`, feature branches + PR + CI + squash merge (matching PRs #17–#20)
10. **Single-dep constraint** preserved unchanged (`prompts@^2.4.2` only, zero new JavaScript deps)
11. **`lib/notebooklm.mjs` MUST NOT be touched in v0.9** — 578 LOC D-03 boundary; all migration orchestration lives in `lib/notebooklm-migrate.mjs`
12. **Phase numbering** continues from v0.8 → starts at Phase 6 (no `--reset-phase-numbers`)

---

## Progress Table

| Phase | Plans Complete | Status | Tests Added (est) | Completed |
|-------|---------------|--------|-------------------|-----------|
| 6. Git-Conventions Skill Ecosystem | 0/3 | Not started | ~40 (264 → ~304) | — |
| 7. NotebookLM Manifest v2 + Per-Project Sync | 0/3 | Planned | ~25 (~304 → ~329) | — |
| 8. NotebookLM Migration Script | 0/2 | Not started | ~20 (~329 → ~349) | — |
| 9. Notion Auto-Import via MCP | 0/2 | Not started | ~20 (~349 → ~369) | — |

**Total plans (estimated)**: 10
**Total tests added (estimated)**: ~105 (264 → ~369, exceeds ~350+ target)

---

*Roadmap generated: 2026-04-12 by `gsd-roadmapper` from REQUIREMENTS.md + research/SUMMARY.md. Phase numbering continues from v0.8 (last phase: 5) → starts at Phase 6. 32/32 v1 requirements mapped, 0 orphaned.*
