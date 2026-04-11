# Milestone v0.9 Requirements — Git Conventions & NotebookLM Per-Project

**Goal**: Make per-project workflow first-class — every claude-dev-stack project gets its own git policy enforcement (commits/branches/scopes), its own dedicated NotebookLM notebook with migration of existing 27 sources, and automated Notion imports for selected pages.

**Phase numbering**: continues from v0.8 — first phase is **Phase 6**.
**Test baseline**: 264 (v0.8.1 + cleanup PRs #17–20).
**Total requirements**: 31 v1 requirements + 5 future + explicit out-of-scope.

---

## v1 Requirements

### Cross-cutting Infrastructure (INFRA)

- [ ] **INFRA-01**: User can rely on shared test fixtures via `tests/helpers/fixtures.mjs` exporting `makeTempVault`, `makeTempGitRepo`, `makeTempMonorepo(stackType)`, `withStubBinary` so test files do not duplicate setup boilerplate
- [ ] **INFRA-02**: User can call `atomicWriteJson(path, obj)` from `lib/shared.mjs` to write JSON files atomically (temp + rename) instead of duplicating the pattern across `git-scopes`, `notion-config`, `notebooklm-manifest`, etc.

### Git Conventions Skill Ecosystem (GIT)

- [ ] **GIT-01**: User can configure project-specific git policy via `.claude/git-scopes.json` v1 schema with fields: `ticket_prefix`, `ticket_regex`, `base_branch`, `branch_format`, `commit_format`, `scopes` map, `co_authored_by` (default `false`), `auto_detect.enabled`, `auto_detect.sources`. Schema is read/written via `lib/git-scopes.mjs` with validation
- [ ] **GIT-02**: User gets accurate auto-detection of project scopes for at least 7 stack types: pnpm-workspace.yaml, npm/yarn workspaces in `package.json`, Nx workspace, Turborepo, Lerna, Cargo workspace, Go multi-module, Python `uv` workspace — using sentinel-file regex (no parser dependencies)
- [ ] **GIT-03**: User can run `claude-dev-stack scopes` subcommands: `list`, `refresh`, `add <name> [--path] [--description]`, `remove <name>`, `init` to manage scopes after initial setup
- [ ] **GIT-04**: User can run `claude-dev-stack scopes init` in two modes: `--quick` (4 default questions: project name, auto-detected stack confirm, main branch confirm, install commitlint y/N) and `--full` (extended wizard touching all config fields)
- [ ] **GIT-05**: User gets a parameterized `git-conventions` skill installed at `{project}/.claude/skills/git-conventions/SKILL.md` that reads `.claude/git-scopes.json` at invoke time and auto-triggers via skill description on git intents (commit, branch, PR)
- [ ] **GIT-06**: User can opt out of `Co-Authored-By` lines in commits via `co_authored_by: false` in git-scopes.json — default is `false` for claude-dev-stack itself per MEMORY.md feedback rule
- [ ] **GIT-07**: User gets correct main-branch detection via `git symbolic-ref refs/remotes/origin/HEAD` with confirmable wizard fallback
- [ ] **GIT-08**: User triggers git-conventions installation as part of the main `bin/install.mjs` setup wizard via new `installGitConventions()` step that runs per mapped project
- [ ] **GIT-09**: User sees git-scopes status in `claude-dev-stack doctor` output: WARN if `.claude/git-scopes.json` missing for an existing project, ERROR if missing for a new install post-wizard
- [ ] **GIT-10**: User can opt-in to commitlint enforcement via wizard prompt (default OFF) — wizard prints `npm install --save-dev @commitlint/cli@^19 @commitlint/config-conventional@^19 husky@^9` and generates `commitlint.config.mjs` template, but never `spawnSync('npm install')`. Only offered when target project has `package.json` with `devDependencies`

### NotebookLM Per-Project Notebooks (NBLM-V2)

- [ ] **NBLM-V2-01**: User retains all manifest history when `lib/notebooklm-manifest.mjs` schema bumps from v1 to v2 — `isValidManifestShape()` is split into `{valid, reason: 'unknown-version' | 'malformed'}` and `migrateV1ToV2()` runs in-place at first read. Backup `.v1.backup.json` is written automatically on first v2 upgrade (kept for one milestone). **CRITICAL: this fix MUST land in the FIRST commit of Phase 7, before `MANIFEST_VERSION` bump.**
- [ ] **NBLM-V2-02**: User gets per-project sync via `lib/notebooklm-sync.mjs::syncVault()` looping over discovered projects and calling `ensureNotebook('cds__${slug}')` per project. `syncOneFile()` works unchanged when passed `manifest.projects[slug]` as scoped sub-object. Per-project stats aggregated as `{perProject: {...}, total: {...}}`
- [ ] **NBLM-V2-03**: User gets per-project notebook naming `cds__{slug}` (namespaced prefix) — prevents collision with user's pre-existing notebooks; trivial to filter via `listNotebooks()`. Pre-flight conflict scan during migration aborts with actionable message if `cds__{slug}` already exists (unless `--force-adopt`)
- [ ] **NBLM-V2-04**: User sees correct source titles inside per-project notebooks — `buildTitle(..., { projectScoped: true })` branch drops `{project}__` prefix when notebook is already project-scoped. Original `buildTitle` signature preserved (D-06 single-source-of-truth)
- [ ] **NBLM-V2-05**: User can run `claude-dev-stack notebooklm migrate` to relocate existing 27 sources from shared `claude-dev-stack-vault` notebook into per-project `cds__{slug}` notebooks. Default mode is `--dry-run`; `--execute` is explicit opt-in. Migration script lives in `lib/notebooklm-migrate.mjs` and only orchestrates existing `lib/notebooklm.mjs` primitives (no new primitives)
- [ ] **NBLM-V2-06**: User gets safe two-phase migration: Phase A uploads all sources to per-project notebooks AND verifies round-trip via `listSources()` title match; Phase B deletes shared sources only if Phase A reported zero failures. Shared notebook itself is never auto-deleted. Idempotent resume on re-run (skips already-migrated)
- [ ] **NBLM-V2-07**: User can audit migration progress via `~/vault/.notebooklm-migration.json` log with per-source status entries (`{source_id, old_notebook_id, new_notebook_id, target_project, status: pending|uploaded|verified|deleted}`)
- [ ] **NBLM-V2-08**: User gets deprecation warning in `claude-dev-stack doctor` if `NOTEBOOKLM_NOTEBOOK_NAME` env var is set after upgrading to v0.9 (legacy single-notebook mode is on the way out — drop in v1.0)
- [ ] **NBLM-V2-09**: User sees per-project NotebookLM stats in `claude-dev-stack doctor` output: notebook count, total sources, per-project breakdown

### Notion Auto-Import via MCP (NOTION)

- [ ] **NOTION-01**: User can declare which Notion pages to auto-import via `.claude/notion_pages.json` v1 schema (per-project list of `{page_id, page_url, vault_path, refresh_strategy}`). Validation lives in `lib/notion-config.mjs`
- [ ] **NOTION-02**: User can run `claude-dev-stack notion` subcommands: `list`, `add <url> [--vault-path]`, `import [--page <id>]` to manage Notion imports
- [ ] **NOTION-03**: User triggers Notion imports via `notion-importer` skill installed at `{project}/.claude/skills/notion-importer/SKILL.md`. Skill calls `claude.ai Notion` MCP tools (`notion-fetch`, `notion-search`) directly inside the live Claude session — **skill-first invocation strategy locked**, NOT subprocess-based `claude mcp call`
- [ ] **NOTION-04**: User can paste Notion page URLs (`https://www.notion.so/...`) into `notion add` and the URL→page-ID extraction handles the canonical formats (page IDs with and without dashes)
- [ ] **NOTION-05**: User's Notion imports land in `vault/projects/{slug}/docs/notion/` subdirectory (NOT flat `docs/`) to prevent collisions with manually-added docs. Filename derived via reused `cleanNotionFilename()` from `lib/docs.mjs` (extracted as named export)
- [ ] **NOTION-06**: User's local edits to imported Notion files are NEVER overwritten on re-import — every imported file ships with frontmatter provenance stamp (`notion_page_id`, `notion_last_synced`, `notion_content_hash`). Three-way hash check on re-import: if local content differs from stamped hash, write new version to `<filename>.notion-update.md` sibling and emit `warn()`. **Frontmatter stamp ships in the FIRST version, never retrofitted.**
- [ ] **NOTION-07**: User sees Notion MCP availability in `claude-dev-stack doctor` output: hard ERROR if `claude.ai Notion` MCP server not detected (NOT silent skip). Doctor reuses existing `claude mcp list --json` pattern

### Continuous Testing (TEST)

- [ ] **TEST-01**: All `npm test` runs are green at every PR — continuous gate. Test count grows from baseline 264 toward ~350+ by end of v0.9
- [ ] **TEST-02**: Every new `lib/*.mjs` module ships with a matching `tests/*.test.mjs` file using `node:test` + `node:assert/strict` only — no external test frameworks (per CLAUDE.md constraint)
- [ ] **TEST-03**: Migration script (`lib/notebooklm-migrate.mjs`) ships with full fixture matrix: empty notebook, 27-source real-shape fixture, partial-failure mid-project, duplicate target slug, orphan source. Real-notebook smoke test on burner notebook required before Phase 8 PR merge — round-trip verification (uploaded → listed in target → matches title) is the primary gate
- [ ] **TEST-04**: Manifest schema migration test (`tests/notebooklm-manifest-migration.test.mjs`) writing a v1 manifest with 3 entries and asserting v2 reads them as 3 migrated entries lands in the SAME first commit as the `isValidManifestShape()` split

---

## Future Requirements (deferred to v0.10+)

- **GIT-FUT-01**: Migration helper from prose `CLAUDE.md` git rules → structured `git-scopes.json` (read existing CLAUDE.md, propose extracted scopes/format/etc.)
- **GIT-FUT-02**: Gitmoji extension for `git-conventions` skill template (opt-in)
- **GIT-FUT-03**: GitHub Action generation that enforces commitlint rules in CI
- **NBLM-FUT-01**: Cross-notebook search aggregation in `dev-research` skill (currently per-notebook)
- **NOTION-FUT-01**: Whole-database import (currently page-list only)
- **NOTION-FUT-02**: Notion API REST fallback when MCP server unavailable (currently MCP-only)
- **NOTION-FUT-03**: Subprocess-based MCP invocation via `spawnSync('claude', ['mcp', 'call', ...])` — Option A from architecture research, deferred until `claude mcp call` subcommand support is verified

---

## Out of Scope (explicit exclusions for v0.9)

- **`.planning/` structural split** (team contract vs execution state) — deferred to v0.10
- **Analytics dashboard NotebookLM integration** — deferred to v0.10
- **`dev-research` skill standalone improvements** — deferred to v0.10 (per-project notebooks in v0.9 already improve `{project}__` filter automatically)
- **vault/decisions vs `.planning/decisions/` policy unification** — orthogonal cleanup, not blocking
- **Cron-based periodic NotebookLM sync** — rejected; intent + session-end is sufficient
- **Cron-based periodic Notion import** — rejected; intent-based only
- **Hybrid NotebookLM mode** (some projects shared, some per-project) — rejected; strict per-project from v0.9 onwards
- **Per-session notebook granularity** (one notebook per coding session) — rejected; per-project is correct level
- **Two-way Notion sync** (vault → Notion) — rejected; vault is canonical source of truth
- **Two-way NotebookLM sync** (NotebookLM → vault) — already rejected since v0.8, still applies
- **Whole-workspace Notion imports** — rejected; page-specific only per `notion_pages.json`
- **Auto-download of Notion media** (images, embedded files) — rejected; signed URLs expire
- **Real-time commit linting via Claude hook** — rejected; commitlint pre-commit hook is the enforcement layer
- **Auto-push / auto-PR creation by `git-conventions` skill** — rejected; user always reviews before push
- **Two-way sync between `git-scopes.json` and `commitlint.config.js`** — rejected; one-way generation only
- **Scope validation against remote repo** (e.g. via GitHub API) — rejected; local sentinel-file detection is enough
- **Adding new JavaScript dependencies** — single-dep constraint preserved (only `prompts@^2.4.2`)
- **Auto-deletion of shared `claude-dev-stack-vault` notebook after migration** — user manually deletes after verifying

---

## Traceability

(Filled by `gsd-roadmapper` in Step 10. Every requirement maps to exactly one owning phase. 32/32 coverage, 0 orphaned.)

| REQ-ID | Phase | Status |
|---|---|---|
| INFRA-01 | 6 | pending |
| INFRA-02 | 6 | pending |
| GIT-01 | 6 | pending |
| GIT-02 | 6 | pending |
| GIT-03 | 6 | pending |
| GIT-04 | 6 | pending |
| GIT-05 | 6 | pending |
| GIT-06 | 6 | pending |
| GIT-07 | 6 | pending |
| GIT-08 | 6 | pending |
| GIT-09 | 6 | pending |
| GIT-10 | 6 | pending |
| NBLM-V2-01 | 7 (first commit gate) | pending |
| NBLM-V2-02 | 7 | pending |
| NBLM-V2-03 | 7 | pending |
| NBLM-V2-04 | 7 | pending |
| NBLM-V2-05 | 8 | pending |
| NBLM-V2-06 | 8 | pending |
| NBLM-V2-07 | 8 | pending |
| NBLM-V2-08 | 7 | pending |
| NBLM-V2-09 | 7 | pending |
| NOTION-01 | 9 | pending |
| NOTION-02 | 9 | pending |
| NOTION-03 | 9 | pending |
| NOTION-04 | 9 | pending |
| NOTION-05 | 9 | pending |
| NOTION-06 | 9 | pending |
| NOTION-07 | 9 | pending |
| TEST-01 | continuous | pending |
| TEST-02 | continuous | pending |
| TEST-03 | 8 | pending |
| TEST-04 | 7 (first commit gate, alongside NBLM-V2-01) | pending |

---

## Open Questions Resolved (during research synthesis)

1. ✅ `notebooklm source list --notebook <id> --json` shape verification — **command works**, returns 27 sources with `{index, id, title, type, url, status, status_id, created_at}`. Title format `{project}__filename.md` ready for `groupSourcesByPrefix()`. Phase 8 design unblocked.
2. ✅ `syncVault()` replace vs coexist — **modify in place**, deprecate `NOTEBOOKLM_NOTEBOOK_NAME` env override with doctor warning, drop legacy mode in v1.0
3. ✅ `scopes init --quick` default questions — 4 questions: project name, stack auto-detected confirm, main branch confirm, install commitlint y/N
4. ✅ ADR-0012 severity for missing `.claude/git-scopes.json` — `WARN` for existing projects, `ERROR` for new installs post-wizard
5. ✅ Fallback for projects with no detectable stack — single `core` scope with clear wizard message
6. ✅ `tests/helpers/fixtures.mjs` extraction — in-scope for v0.9 Phase 6 (covered by INFRA-01)
7. ✅ commitlint installer behaviour — **print-only**, never spawn `npm install` (matches v0.8 `pipx install notebooklm-py` posture)
8. ✅ Current state of user's NotebookLM notebook — **27 sources** in shared `claude-dev-stack-vault` notebook, distributed across 7 projects (claude-dev-stack: 21 sources, 6 other projects: 1 source each)

---

*Generated: 2026-04-12 from research SUMMARY.md*
*Phase numbering: continues from v0.8 — first phase is Phase 6*
