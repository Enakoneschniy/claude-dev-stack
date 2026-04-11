# Project Research Summary — claude-dev-stack v0.9

**Project:** claude-dev-stack v0.9 — Git Conventions & NotebookLM Per-Project
**Domain:** CLI tool (Node.js ESM, single-dep) — subsequent milestone adding 3 features to v0.8.1
**Researched:** 2026-04-11
**Confidence:** HIGH (stack), MEDIUM-HIGH (features), HIGH (architecture), HIGH (pitfalls)

## Executive Summary

v0.9 adds three orthogonal, additive features to the existing v0.8.1 codebase: (1) a **parameterized git-conventions skill** ecosystem with 7+ stack auto-detection and opt-in commitlint, (2) **per-project NotebookLM notebooks** with a one-shot migration of the existing 27 sources from the shared `claude-dev-stack-vault` notebook, and (3) **Notion auto-import via the hosted `claude.ai Notion` MCP server**, writing markdown into `vault/projects/{slug}/docs/` for the existing NotebookLM sync to pick up. All three features ship **without adding a single JavaScript dependency** — the single-dep constraint (`prompts` only) is preserved unchanged. The only new system dep is **opt-in** commitlint installed into the user's own project, not into claude-dev-stack itself.

The recommended build order is Phase 6 (git-conventions, independent and lowest risk) → Phase 7 (NotebookLM manifest v1→v2 + per-project sync loop, medium risk but on the hottest code path) → Phase 8 (`notebooklm migrate` one-shot script, medium-high risk, touches production notebooks) → Phase 9 (Notion auto-import, low-medium risk, gated on a locked skill-first invocation strategy). Every feature maps cleanly onto the existing per-feature-module pattern in `bin/cli.mjs` — no architectural refactor needed. Total surface area is roughly **+2200 LOC net**: ~14 new files and ~10 modified, with `lib/notebooklm.mjs` (the 578-line primitives wrapper) **explicitly untouched**.

Three categories of risk dominate the milestone. **Data loss risk** concentrates in Phase 7/8: the manifest v1→v2 bump is a loaded gun because the current `isValidManifestShape` treats any non-1 version as corrupt and silently empties the file (`lib/notebooklm-manifest.mjs:136-141`); the fix MUST land in the first commit of Phase 7 before any `MANIFEST_VERSION` bump. **Cross-feature contract risk** centers on commitlint × claude-dev-stack's own commit discipline: NMP's reference skill includes Co-Authored-By but claude-dev-stack forbids it, so the skill template must expose this as a config toggle defaulting to OFF. **Operational risk** carries over from v0.8: `gsd-tools commit` branch-hijack (PR #20) is only patched for `/gsd-quick`, and v0.9 phase work uses `/gsd-execute-phase` — mitigation is always using the `--files` flag explicitly. Every critical risk has a named prevention gate tied to a specific phase.

## Key Findings

### Stack Additions

Full detail: `STACK.md`. No new JavaScript dependencies. Single-dep (`prompts@^2.4.2`) preserved unchanged.

| Library / Tech | Version | Purpose | Single-dep Status |
|---|---|---|---|
| Node.js builtins (`fs`, `path`, `crypto`, `child_process`) | Node 18+ | Scope detection, config read/write, SHA-256 change tracking, atomic writes, external command invocation | Unchanged (builtins) |
| `prompts@^2.4.2` | pinned | `scopes` wizard interactive prompts | Already present |
| `notebooklm-py` (system) | `>= 0.3.4` | Per-project notebook creation + migration — **no newer release on PyPI as of 2026-04-11**; every primitive needed already exists in `lib/notebooklm.mjs` | Already required since v0.8 |
| `claude.ai Notion` (hosted MCP) | — | `notion-fetch` / `notion-search` invocation — returns Notion-flavored markdown natively (no HTML→md converter needed) | Zero code dep — invoked by Claude Code, not by our CLI |
| `@commitlint/cli` + `config-conventional` | `^19.x` | Opt-in enforcement layer | **Installed into target repo only — NOT a claude-dev-stack dep.** Wizard prints commands; user runs them. Mirrors v0.8 `notebooklm-py` posture. |
| `husky@^9.x` (or raw `.git/hooks/commit-msg`) | `^9.x` | Wire commitlint to `commit-msg` | Same — opt-in, installed by user if commitlint is picked |

**What we explicitly do NOT add:** YAML/TOML/XML parsers (regex on sentinel files), `turndown` (MCP returns markdown), `@notionhq/client` (MCP-only per scope), template engines (string replace on `.tmpl`), `glob`, `yaml`, `write-file-atomic`, `node-cron`.

### Feature Table Stakes

Full detail: `FEATURES.md`. Three features are orthogonal; each has its own must-have / differentiator / anti-feature split.

**Feature 1 — git-conventions skill ecosystem**

| Category | Items |
|---|---|
| **Must-haves (P1)** | Parameterized SKILL.md template reading `.claude/git-scopes.json`; 7+ stack auto-detection (pnpm, npm/yarn workspaces, Nx, Turborepo, Lerna, Cargo, Go multi-module, Python uv); `scopes` CLI subcommand; `bin/install.mjs` wizard integration; Co-Authored-By toggle **default OFF** for this project; main-branch auto-detect via `git symbolic-ref`; doctor check |
| **Differentiators** | Config read at invoke time by Claude (unique among skill ecosystems); 7+ stacks beats commitlint-config-monorepo's pnpm-only coverage; DDD layer detection (`src/domain`, `src/app`, etc.); one-command opt-in commitlint installer with inline-generated config; wizard merges detection with pre-existing `git-scopes.json` (idempotent) |
| **Anti-features (rejected)** | Bundle commitlint/husky as CDS deps; real-time commit linting via Claude hook; auto-push/PR creation; two-way sync between `git-scopes.json` and `commitlint.config.js`; gitmoji (defer v0.10); force CI enforcement via GitHub Action generation; scope validation against remote repo |

**Feature 2 — NotebookLM per-project notebooks (with migration)**

| Category | Items |
|---|---|
| **Must-haves (P1)** | One notebook per project, titled `cds__{slug}` (namespaced prefix — see C-3); automatic migration of existing 27 sources via `lib/notebooklm-migrate.mjs`; dry-run default; migration idempotency (resume on failure); manifest schema v2 with `projects: {[slug]: {notebook_id, files}}`; backward-compatible v1→v2 in-place upgrade path; title scheme drops `{project}__` prefix when notebook is already project-scoped (via new `buildTitle(..., { projectScoped: true })` flag); doctor per-project stats |
| **Differentiators** | Zero-downtime migration (shared notebook untouched until all per-project uploads verified); migration report with per-project counts; skip-unchanged optimization (reuse v1 hashes during migration); `dev-research` skill auto-scopes queries to current-project notebook; one-command `notebooklm migrate` with dry-run by default + `--execute` |
| **Anti-features (rejected)** | Hybrid mode (some projects shared); auto-delete old shared notebook; per-session notebook granularity; rename-on-slug-change; cross-notebook search via CLI |

**Feature 3 — Notion auto-import via MCP**

| Category | Items |
|---|---|
| **Must-haves (P1)** | `.claude/notion_pages.json` schema v1 (per-project, page-list with URL + destination); `notion import` CLI command; URL→page-ID extraction; MCP-based fetch (skill-first strategy — see locked decisions); write to `vault/projects/{slug}/docs/notion/` subdirectory (prevents collision with manually-added docs); doctor check for Notion MCP presence; hard-error when MCP unavailable (NOT silent skip); reuse `cleanNotionFilename()` from `lib/docs.mjs` |
| **Differentiators** | Config-first declarative approach (git-trackable, no hidden state); selective page-specific imports (no whole-workspace); subdirectory isolation protects hand-authored content; frontmatter provenance stamp (`notion_page_id`, `notion_last_synced`, `notion_content_hash`) enables conflict detection; integration with NotebookLM sync is zero-code |
| **Anti-features (rejected)** | Whole-workspace import; two-way sync (vault→Notion); Notion REST API fallback; cron-based periodic import; auto-download of Notion media (signed URLs expire); parallel fetching |

### Architecture Integration

Full detail: `ARCHITECTURE.md`. Every feature slots into the existing per-feature-module pattern in `bin/cli.mjs`. Additive-only.

**File map (NEW vs MODIFIED with LOC estimates):**

| File | Type | LOC est. | Purpose |
|---|---|---|---|
| `lib/git-conventions.mjs` | **NEW** | ~150 | `main(args)` for `scopes` subcommand |
| `lib/git-scopes.mjs` | **NEW** | ~200 | Pure schema module — `detectStack()`, `readScopes()`, `writeScopes()`, `mergeWithExisting()` |
| `skills/git-conventions/SKILL.md` | **NEW** | ~200 | Skill template, reads `.claude/git-scopes.json` at invoke time |
| `templates/git-scopes/{7 stacks}.json` | **NEW** | ~20 each | Default scope dictionaries per detected stack |
| `tests/git-scopes.test.mjs` + `tests/git-conventions.test.mjs` | **NEW** | ~200 | Schema + detection fixture matrix |
| `lib/notebooklm-migrate.mjs` | **NEW** | ~250 | Orchestrates 27-source migration via existing `lib/notebooklm.mjs` primitives; two-phase commit |
| `tests/notebooklm-migrate.test.mjs` | **NEW** | ~150 | Stubbed primitives; resume-on-failure verification |
| `lib/notion-import.mjs` | **NEW** | ~200 | `notion` subcommand — reads config, delegates to skill-driven MCP, writes via extracted helpers |
| `lib/notion-config.mjs` | **NEW** | ~80 | Schema validation for `.claude/notion_pages.json` |
| `skills/notion-importer/SKILL.md` | **NEW** | ~150 | Intent-triggered skill calling Notion MCP tools inside live Claude session |
| `tests/notion-import.test.mjs` + `tests/notion-config.test.mjs` | **NEW** | ~160 | Stub MCP layer + schema edge cases |
| `tests/helpers/fixtures.mjs` | **NEW** (M-5) | ~120 | Shared `makeTempVault`, `makeTempGitRepo`, `makeTempMonorepo`, `withStubBinary` — Phase 6 prereq |
| `bin/cli.mjs` | MODIFIED | +15 | Three new cases: `scopes`, `notion`, extend `notebooklm` with `migrate` |
| `lib/project-setup.mjs` | MODIFIED | +2 | Add 5th (+optional 6th) entry to `PROJECT_SKILLS` — `generateSkillsSection()` is data-driven, **zero change** to that function |
| `bin/install.mjs` | MODIFIED | +160 | New `installGitConventions()` (~80L) + optional `configureNotionImport()` (~60L); existing `installNotebookLM` is **unchanged** (transitively picks up new per-project syncVault) |
| `lib/notebooklm-sync.mjs` | MODIFIED | ~60 | `syncVault()` per-project loop; `buildTitle(..., { projectScoped })`; `syncOneFile()` **unchanged** if manifest sub-object is passed correctly |
| `lib/notebooklm-manifest.mjs` | MODIFIED | ~80 | Bump `MANIFEST_VERSION` to 2; add `migrateV1ToV2()`; split `isValidManifestShape()` to distinguish `unknown-version` from `malformed` |
| `lib/notebooklm-cli.mjs` | MODIFIED | +30 | Add `migrate` subcommand dispatch |
| `lib/docs.mjs` | MODIFIED | +10 | Extract `cleanNotionFilename()` and `scanDir()` as named exports |
| `lib/doctor.mjs` | MODIFIED | +40 | 3-line sections per feature |
| `lib/shared.mjs` | MODIFIED | +15 | Optional `atomicWriteJson(path, obj)` helper (Phase 6 prereq per A-4) |

**Totals:** ~14 new files (~1780 LOC), ~10 modified files (~395 LOC). Net ~2200 LOC across v0.9.

**Critical architectural insight:** The per-project NotebookLM transformation is a **smaller diff than feared**. `walkProjectFiles()` (lines 101–133) already iterates per-project; the existing `syncOneFile()` reads and writes to `manifest.files[vaultRelativePath]`, so passing `manifest.projects[slug]` as its scoped sub-object makes `syncOneFile()` work **without any changes**. The actual Phase 7 work is (a) manifest v1→v2 bump with proper migration, (b) a `groupBy(files, f => f.projectSlug)` loop in `syncVault()`, and (c) per-project stats aggregation.

**Files that MUST NOT be touched in v0.9** (per §7.2 of ARCHITECTURE.md):
- `lib/notebooklm.mjs` — pure primitives, 578 lines of battle-tested error handling (D-03 boundary)
- `hooks/notebooklm-sync-runner.mjs` — background runner
- `lib/notebooklm-manifest.mjs::writeManifest` atomic-rename block (lines 245–252)
- `lib/shared.mjs` existing exports (only additions allowed)

### Watch Out For — Top 5 Critical Pitfalls

Full detail: `PITFALLS.md`. Five critical pitfalls require explicit prevention gates before the relevant phase merges.

1. **C-2 — Manifest schema v1→v2 unsafe migration (HIGHEST PRIORITY, Phase 7).** `lib/notebooklm-manifest.mjs:136-141` currently treats any non-1 version as corrupt and silently empties the file via `recoverCorruptManifest`. Bumping `MANIFEST_VERSION` without first updating `isValidManifestShape` to distinguish "unknown-version" from "malformed" will **delete all 27 tracked file entries** on the user's first post-upgrade sync. **Prevention gate:** the fix (split validation + add `migrateV1ToV2` branch in `readManifest`) MUST land in the **first commit** of Phase 7, before any `MANIFEST_VERSION` bump. A failing test `tests/notebooklm-manifest-migration.test.mjs` writing a v1 manifest with 3 entries and asserting v2 reads them as 3 migrated entries MUST be added in the same commit.

2. **C-1 — NotebookLM migration partial-run data loss (Phase 7/8).** Migration script's "move" is (a) create per-project notebook, (b) upload, (c) delete from shared. Crash/rate-limit between (b) and (c) leaves sources in both notebooks or in neither. **Prevention gate:** two-phase commit with explicit `~/vault/.notebooklm-migration.json` log recording `{source_id, old_notebook_id, new_notebook_id, target_project, status}`; dry-run required by default; NEVER delete from shared before verifying round-trip via `listSources(newNotebookId)` title match; backup `~/vault/.notebooklm-sync.v1.backup.json` for one milestone. Needs its own discuss-phase on atomicity + rollback before plan-phase. Real history: v0.8.1 `uploadSource` title bug (`8f5a46e`) was a round-trip-only bug — unit tests passed but production had 7× `context.md` title collisions.

3. **C-3 — NotebookLM notebook name collision (Phase 7).** v0.8 had ONE notebook with a unique name; v0.9 creates 7+ notebooks with names that look like ordinary project titles. `ensureNotebook` throws on ≥2 matches — a latent bomb for per-project mode. **Prevention gate:** namespace with a constant prefix (`cds__{slug}`); pre-migration conflict scan that aborts with message `"Notebook 'cds__biko-pro' already exists. Delete it first or use --force-adopt."`; record `target_notebook_name` in the migration log. Naming ADR MUST be merged before migration script is written.

4. **C-4 — Notion auto-import overwrites user vault edits (Phase 9).** Naive re-import stomps on local edits in `vault/projects/{slug}/docs/notion/*.md`, violating PROJECT.md's "vault is canonical source of truth." **Prevention gate:** frontmatter stamp (`notion_page_id`, `notion_last_synced`, `notion_content_hash`) in every imported file; three-way hash check on re-import — if local content differs from stamped hash, write new version to `page-x.notion-update.md` sibling and `warn()` instead of overwriting; frontmatter stamp MUST ship in the FIRST version (never retrofitted).

5. **C-5 — git-conventions commitlint blocks NotebookLM migration commits (Phase 6 + cross-cutting).** NMP's reference skill includes Co-Authored-By but claude-dev-stack forbids it (per MEMORY.md). If commitlint is installed default-on, CDS's own phase commits must satisfy its rules. **Prevention gate:** commitlint install is **opt-in** via explicit wizard prompt defaulting to OFF; Co-Authored-By is a config field in `git-scopes.json` defaulting to **OFF** for claude-dev-stack; commitlint only installed when `package.json + devDependencies` exists (skip for Python-only projects); integration test runs full `npm test + node bin/cli.mjs notebooklm migrate --dry-run` chain on a machine with `git-conventions-full` installed; before merging Phase 6, rebase main onto branch and verify no historical commit trips commitlint.

**Moderate pitfalls requiring cross-cutting attention:**
- **M-5** — Test infrastructure can't scale to 350+ tests without a shared `tests/helpers/fixtures.mjs`. Must ship **alongside the first Phase 6 test that needs it**. `/tmp/cds-*` cleanup assertion as CI canary.
- **M-6** — Node 18 compat regression. CI runs Node 18 FIRST in the matrix. No `import.meta.dirname`; use `fileURLToPath(import.meta.url) + dirname()`.
- **m-4 (cross-cutting)** — `gsd-tools commit` branch hijack (PR #20 workaround) only fires for `/gsd-quick`. v0.9 phase work uses `/gsd-execute-phase` — different code path, may re-trigger. Mitigation: always use `gsd-tools commit --files <list>` explicitly; verify HEAD branch pre- and post-commit.

## Implications for Roadmap

Phase numbering starts at **Phase 6** (v0.8 ended at Phase 5). Researchers proposed 5–7 phases; the synthesis is **4 core phases (6/7/8/9) with optional 6b/7b/9b sub-phases** if scope grows.

### Phase 6 — git-conventions skill ecosystem (core + wizard)

**Risk:** LOW
**Rationale:** Independent of NotebookLM and Notion work. Ships value fast. Gives the team practice touching the `install.mjs` wizard-step pattern before doing it for NotebookLM migration. Also the natural home for cross-cutting infra prerequisites — `tests/helpers/fixtures.mjs` and `lib/shared.mjs::atomicWriteJson()` both land here before Phase 7 needs them.
**Delivers:**
- `lib/git-scopes.mjs` (pure schema + 7+ stack detection)
- `lib/git-conventions.mjs` (`scopes` subcommand with `--quick` vs `--full` — quick is default, asks 3 questions)
- `skills/git-conventions/SKILL.md` + `<!-- @claude-dev-stack:start -->` template tokens
- `.claude/git-scopes.json` schema v1 with `coAuthoredBy` field **default false**
- `bin/install.mjs::installGitConventions()` (~80 lines) auto-called per mapped project
- `lib/doctor.mjs` git-scopes section
- Cross-cutting: `tests/helpers/fixtures.mjs`, `lib/shared.mjs::atomicWriteJson`
**Avoids:** C-5, M-1, M-2, M-5, M-6
**Dependencies:** None — starts fresh on a feature branch off main.

### Phase 7 — NotebookLM manifest v2 + per-project sync loop

**Risk:** MEDIUM
**Rationale:** Must ship **before** Phase 8 (migration uses v2 writer). Does NOT force existing users to migrate — v1→v2 in-place upgrade on first read preserves hash history. Actual code change in `syncVault()` is small (~60 LOC) because `walkProjectFiles()` already iterates per-project and `syncOneFile()` works unchanged with a scoped manifest sub-object.
**Delivers:**
- `lib/notebooklm-manifest.mjs` v1→v2 schema (new shape: `{version: 2, projects: {[slug]: {notebook_id, files}}}`)
- **In the FIRST commit:** split `isValidManifestShape()` into `malformed` vs `unknown-version`; add `migrateV1ToV2()`; add `tests/notebooklm-manifest-migration.test.mjs`; backup `.v1.backup.json` on first upgrade (per C-2 gate)
- `lib/notebooklm-sync.mjs::syncVault()` per-project loop with `ensureNotebook('cds__${slug}')`
- `buildTitle(..., { projectScoped: true })` branch that drops `{project}__` prefix
- Per-project stats aggregation (`{perProject: {[slug]: {...}}, total: {...}}`)
- `lib/notebooklm-cli.mjs` updated reports; `lib/doctor.mjs` per-project notebook stats
**Avoids:** C-2 (first commit), C-3, M-5, M-6, m-1, m-2
**Dependencies:** Phase 6 ships `tests/helpers/fixtures.mjs`. Needs its own **discuss-phase** for atomicity + rollback before `/gsd-plan-phase` (ADR-0001 precedent).

### Phase 8 — NotebookLM migration script (`notebooklm migrate`)

**Risk:** MEDIUM-HIGH
**Rationale:** Touches real production notebooks (27 sources). Must be reversible. Ships as explicit `migrate` subcommand — **never auto-run**. Dry-run default; `--execute` to actually run. Validation gate: confirms `notebooklm source list --json` returns sufficient source enumeration (see Open Questions #1). Depends on Phase 7 v2 manifest writer existing.
**Delivers:**
- `lib/notebooklm-migrate.mjs` — orchestrates existing `lib/notebooklm.mjs` primitives
- `~/vault/.notebooklm-migration.json` migration log with per-source status tracking (`pending` → `uploaded` → `verified` → `deleted`)
- Two-phase commit: upload ALL sources to new per-project notebooks first, verify round-trip, ONLY THEN delete shared-notebook sources; shared notebook itself left intact for user
- Idempotent resume: re-run skips sources whose title already exists in target notebook
- `notebooklm migrate --dry-run` default + `--execute`; migration report (uploaded / failed / duration / per-project counts)
- Test matrix: no shared notebook, 0 sources, partial failure mid-project, duplicate slug, orphan source
**Avoids:** C-1, C-3, m-1 (real-notebook smoke test on burner before PR merge), m-2 (version pin pre-flight)
**Dependencies:** Phase 7 manifest v2 writer + per-project syncVault must be green.

### Phase 9 — Notion auto-import via MCP (skill-first)

**Risk:** LOW-MEDIUM
**Rationale:** New module, new subcommand, new skill. Zero touch on NotebookLM or git-conventions code. Ships last so imported docs flow into v0.9 per-project notebooks. Can be deferred to v0.10 if Phase 7/8 take longer than expected. The locked skill-first decision avoids dependency on the unverified `claude mcp call` subcommand.
**Delivers:**
- `lib/notion-config.mjs` — schema for `.claude/notion_pages.json` v1
- `lib/notion-import.mjs` — reads config, writes to `vault/projects/{slug}/docs/notion/`
- `skills/notion-importer/SKILL.md` — intent-triggered skill invoking Notion MCP tools from live Claude session
- `notion import` / `notion add` / `notion list` CLI subcommands
- **Frontmatter provenance stamp** from the first version (per C-4): `notion_page_id`, `notion_last_synced`, `notion_content_hash` — three-way hash check refusing to overwrite, writing `.notion-update.md` sibling
- `lib/doctor.mjs` Notion MCP presence check (reuses `claude mcp list --json` pattern) — hard error if MCP missing
- `lib/docs.mjs::cleanNotionFilename()` and `scanDir()` extracted as named exports
**Avoids:** C-4, M-3, M-4, m-3
**Dependencies:** Phase 7 per-project sync must be live. Optional dependency on Phase 6 (shares `.claude/` config convention + `atomicWriteJson`).

### Phase Ordering Rationale

- **Dependency graph forces Phase 7 before Phase 8** — migration uses v2 manifest writer. Phase 9 prefers Phase 7 before it (imported docs should flow into per-project notebooks).
- **Phase 6 first because it's LOW risk and ships fixture infra** — `tests/helpers/fixtures.mjs` and `lib/shared.mjs::atomicWriteJson` are cross-cutting prerequisites.
- **Critical schema gate in Phase 7 first commit** — C-2 (manifest v1→v2) is the highest-stakes pitfall; the fix lands before anything else.
- **Phase 8 gated on Phase 7** with its own **discuss-phase** before plan-phase (ADR-0001 precedent).
- **Phase 9 last** because it's the only feature that could be deferred to v0.10 without blocking the core milestone value.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-research-phase`):
- **Phase 7 (NotebookLM per-project + manifest v2)** — needs discuss-phase first. Verification of `notebooklm source list --json` shape against real notebook is a plan-01 gate. Pre-flight `notebooklm --version` range check.
- **Phase 8 (migration)** — needs dedicated discuss-phase for atomicity + rollback semantics. Fixture suite for edge cases.
- **Phase 9 (Notion MCP)** — needs edge-case research on markdown conversion fidelity (databases, synced blocks, mentions) and MCP error-response shapes (429 passthrough, auth expiry).

Phases with standard patterns (skip research-phase):
- **Phase 6 (git-conventions)** — NMP reference implementation provides template shape; sentinel-file detection is mechanical; no upstream API uncertainty. Straight to `/gsd-plan-phase`.

## Locked Decisions

The research process already settled these — they do **not** need re-litigation during the requirements step.

1. **Notion MCP invocation strategy = Option B (skill-driven from live Claude session).** Option A (`spawnSync('claude', ['mcp', 'call', ...])`) is **deferred to v1.0**. The Notion MCP server is only accessible inside Claude sessions; forcing the import inside a session matches reality. Source: ARCHITECTURE.md §4.3.

2. **Per-project notebook naming = `cds__{slug}` namespaced prefix.** E.g., `cds__biko-pro`. Prevents collision with user's pre-existing notebooks; trivial `listNotebooks()` filtering. Source: PITFALLS C-3.

3. **Title scheme inside per-project notebooks drops `{project}__` prefix.** Implemented via new `buildTitle(..., { projectScoped: true })` branch — not renaming the existing function (preserves D-06). Source: STACK.md §2.

4. **Commitlint install is opt-in, defaulting to OFF.** Wizard prints install commands; never `spawnSync npm install`. Only offered when `package.json + devDependencies` exists. Source: PITFALLS C-5.

5. **Co-Authored-By is a config field in `git-scopes.json`, defaulting to `false` for claude-dev-stack.** NMP includes it, CDS forbids it (per MEMORY.md). Template must expose it explicitly. Source: FEATURES.md.

6. **Manifest schema v2 auto-migrates in place from v1.** `readManifest()` normalizes at read time; callers see v2 unconditionally. `isValidManifestShape()` split returns `{valid, reason: 'unknown-version' | 'malformed'}`. `.v1.backup.json` kept for one milestone. Source: PITFALLS C-2.

7. **Migration is two-phase with explicit migration log.** Phase A: upload all, verify round-trip. Phase B: delete shared sources only if Phase A reports zero failures. Shared notebook itself never auto-deleted. Source: PITFALLS C-1.

8. **Notion imports land in `vault/projects/{slug}/docs/notion/` subdirectory**, NOT flat `docs/`. Prevents collision with hand-added docs. Source: FEATURES.md.

9. **Frontmatter provenance stamp ships in the FIRST version of the Notion importer**, never retrofitted. Three-way hash check prevents silent overwrite. Source: PITFALLS C-4.

10. **Branching strategy stays `none`** with feature branches + PR + CI → squash merge (matching v0.8.1's cleanup PRs #17–#20). Phase branches use `feat/{slug}`. Admin-merge with `gh pr merge --admin --squash` is the accepted single-dev pattern. Source: ARCHITECTURE.md §5.

11. **Single-dep constraint preserved unchanged.** Zero new JavaScript dependencies. Source: STACK.md.

12. **`lib/notebooklm.mjs` MUST NOT be touched in v0.9.** 578 lines of battle-tested primitives; D-03 boundary. All migration orchestration lives in `lib/notebooklm-migrate.mjs`. Source: ARCHITECTURE.md §7.2 and Anti-Pattern A-3.

## Open Questions for the Requirements Step

These need explicit confirmation or decision from the user before `/gsd-requirements` can produce a locked requirements doc.

1. **HIGHEST PRIORITY — `notebooklm source list --notebook <id> --json` shape verification.** STACK.md says the flag works in production (`lib/notebooklm.mjs:346`). FEATURES.md flags it as the #1 validation gate for migration. Before Phase 8 plan-phase, run `notebooklm source list --notebook <shared-id> --json` against the real `claude-dev-stack-vault` notebook and confirm: (a) command works, (b) output enumerates all 27 sources, (c) shape includes `{id, title}` for `groupSourcesByPrefix`. Fallback: `notebooklm metadata --notebook <id> --json`.

2. **Should `syncVaultPerProject()` replace `syncVault()` or coexist?** ARCHITECTURE.md recommends modifying in place (~60 LOC diff). FEATURES.md leaves it open. Impacts backward-compat and whether `NOTEBOOKLM_NOTEBOOK_NAME` env override keeps working (legacy mode) or gets forced into migration. **Recommended:** modify in place, deprecate `NOTEBOOKLM_NOTEBOOK_NAME` with doctor warning, drop legacy mode in v1.0.

3. **`scopes init --quick` default 3 questions — which 3?** Draft: "project name", "stack auto-detected = [X]. Correct? y/N", "Install commitlint? y/N". Include main-branch name (auto-detected but confirmable) as a 4th?

4. **ADR-0012 severity for missing `.claude/git-scopes.json`.** `ERROR` / `WARN` / `INFO`? Likely `WARN` for existing projects, `ERROR` for new installs post-wizard. Confirm.

5. **Fallback for projects with no detectable stack.** STACK.md: `['core']` with `confidence: 'low'`. FEATURES.md: top-level dir names. **Recommended:** single `core` scope with clear wizard message.

6. **Scope of `tests/helpers/fixtures.mjs` extraction.** In-scope for v0.9 Phase 6 or pushed to pre-v0.9 cleanup PR? **Recommended:** in-scope for Phase 6.

7. **commitlint installer behaviour when user says "yes" — print-commands vs execute.** STACK.md says print-only. FEATURES.md says spawn-execute. Contradictory. **Recommended:** print-only (matches v0.8 `pipx install notebooklm-py` posture). Confirm.

8. **Does the primary user (Yevhenii) already have a NotebookLM notebook at migration time?** PROJECT.md said "no existing notebook yet" but that was pre-v0.8.1 ship. Current state (0 sources vs 27 sources) changes Phase 8 test matrix. Need confirmation.

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | **HIGH** | No new JS deps; existing system deps sufficient; no upstream blockers; every pattern has prior art in production. MEDIUM only on `source list --json` docs gap — but the flag works in production since v0.8. |
| Features | **MEDIUM-HIGH** | NMP reference implementation read directly; Co-Authored-By contradiction identified; 7-stack scope detection sound for Node/Rust/Go/Python. Notion markdown edge cases need real-content verification during Phase 9. NotebookLM notebook limits confirmed (100 free-tier). |
| Architecture | **HIGH** | All structural claims grounded in direct source reads (`bin/cli.mjs` 221L, `lib/project-setup.mjs` 196L, `lib/notebooklm.mjs` 578L, `lib/notebooklm-sync.mjs` 521L, `lib/notebooklm-manifest.mjs` 332L, `lib/docs.mjs` 287L, `bin/install.mjs` 1381L). MEDIUM only on §4.3 Notion MCP invocation — which is why Option B is locked. |
| Pitfalls | **HIGH** | Every critical pitfall grounded in a specific line of existing code, a specific PR (#16–#20), a specific ADR (0001/0012), or an explicit PROJECT.md scope decision. No generic advice. |

**Overall confidence:** HIGH on buildability, MEDIUM on user-experience edge cases (Notion markdown fidelity, partial migration resume), HIGH on risk identification and mitigation.

### Gaps to Address During Planning

- **`notebooklm source list --json` return shape on real notebook** — verify during Phase 7 plan-01 or pre-Phase-8 research (Open Question #1).
- **Current state of user's NotebookLM notebook** — 0 sources vs 27 sources changes migration test matrix (Open Question #8).
- **Notion markdown conversion fidelity for real user content** — flag for Phase 9 real-content smoke test.
- **MCP error response shapes** (429 passthrough, auth expiry) — need real MCP invocation during Phase 9 research.
- **Notebook rate-limit pacing during migration** — STACK.md suggests 60s sleep with 3-retry abort; tune during Phase 8.

## Sources

### Primary (HIGH confidence)
- `STACK.md` (v0.9 research, 2026-04-11) — verified against PyPI `notebooklm-py` 0.3.4 (no newer release), Notion MCP docs, commitlint 19.x ecosystem, NMP reference implementation
- `ARCHITECTURE.md` (v0.9 research, 2026-04-11) — grounded in direct source reads of `bin/cli.mjs`, `lib/project-setup.mjs`, `lib/notebooklm.mjs`, `lib/notebooklm-sync.mjs`, `lib/notebooklm-manifest.mjs`, `lib/notebooklm-cli.mjs`, `lib/docs.mjs`, `lib/projects.mjs`, `bin/install.mjs`
- `PITFALLS.md` (v0.9 research, 2026-04-11) — grounded in PROJECT.md + STATE.md, ADR-0001, v0.8.1 hotfix session log, PRs #16/#17/#18/#19/#20, `lib/notebooklm-manifest.mjs:40-214`, `lib/notebooklm-sync.mjs:193-347`
- `.planning/PROJECT.md` — Current Milestone v0.9 goal, target features, Out of Scope, Key Decisions, Constraints

### Secondary (MEDIUM confidence)
- `FEATURES.md` (v0.9 research, 2026-04-11) — ecosystem conventions, Obsidian/NocoDB/n8n Notion comparisons, NotebookLM 2026 capabilities research
- NotebookLM platform capabilities (100 free-tier notebooks, 50 sources/notebook Standard)
- Notion hosted MCP markdown-first response format

### Tertiary (LOW confidence)
- Notion MCP rate-limit passthrough behavior (3 req/s from underlying Notion API documented; exact 429 shape from hosted MCP server not)
- Exact sleep duration for NotebookLM migration rate-limit recovery (60s initial estimate)

---
*Research synthesized: 2026-04-11*
*Phase numbering: continues from Phase 5 (v0.8) — new phases start at Phase 6*
*Ready for roadmap: yes*
