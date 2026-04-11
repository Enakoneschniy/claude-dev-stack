# Architecture Research — v0.9 Integration

**Domain:** claude-dev-stack CLI (ESM Node.js, single-dep) — subsequent milestone adding 3 features to v0.8.1
**Researched:** 2026-04-11
**Confidence:** HIGH (all claims grounded in direct reads of existing source — `bin/cli.mjs`, `lib/project-setup.mjs`, `lib/notebooklm*.mjs`, `lib/docs.mjs`, `lib/projects.mjs`, `bin/install.mjs`, `.planning/codebase/STRUCTURE.md`, `.planning/PROJECT.md`)

This document is **not a generic architecture survey**. It is an integration map: where each of the 3 v0.9 features plugs into the existing v0.8.1 codebase, which files are new, which are modified, and in what order the phases should ship to minimize risk.

---

## 1. System Overview — Where v0.9 Lands

```
┌──────────────────────────────────────────────────────────────────┐
│                      bin/cli.mjs (router)                         │
│  35+ case statements — dynamic import(../lib/*.mjs)                │
│  ADD cases: `scopes` (git-conventions), extend `notebooklm`,       │
│             `notion` (import)                                      │
└──────────┬───────────────────┬──────────────────┬────────────────┘
           │                   │                  │
           ▼                   ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ git-conventions  │ │ notebooklm-*.mjs │ │  notion-import   │
│    (NEW module)  │ │   (EXTENDED)     │ │   (NEW module)   │
│                  │ │                  │ │                  │
│ lib/git-         │ │ lib/notebooklm-  │ │ lib/notion-      │
│   conventions.mjs│ │   sync.mjs       │ │   import.mjs     │
│                  │ │   (per-project   │ │                  │
│ lib/git-scopes.  │ │    loop)         │ │ lib/notion-      │
│   mjs (schema +  │ │                  │ │   config.mjs     │
│   detection)     │ │ lib/notebooklm-  │ │   (schema)       │
│                  │ │   manifest.mjs   │ │                  │
│ skills/git-      │ │   (projects key) │ │ skills/notion-   │
│   conventions/   │ │                  │ │   importer/     │
│   SKILL.md       │ │ lib/notebooklm-  │ │   SKILL.md       │
│                  │ │   cli.mjs        │ │   (optional)     │
│ NEW subcommand:  │ │   (+ migrate     │ │                  │
│  scopes          │ │    subcommand)   │ │ NEW subcommand:  │
│                  │ │                  │ │  notion import   │
└─────────┬────────┘ └──────────┬───────┘ └────────┬─────────┘
          │                     │                  │
          ▼                     ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ project-setup.mjs│ │ findVault() +    │ │  docs.mjs        │
│ generateSkills-  │ │ vault/projects/* │ │  (reused as      │
│   Section()      │ │ walk (existing)  │ │   sink — write   │
│  (extended to    │ │                  │ │   into docs/)    │
│   emit git-      │ └──────────────────┘ └──────────────────┘
│   conventions    │
│   skill block)   │
└──────────────────┘
          │
          ▼
  CLAUDE.md marker block
  <!-- @claude-dev-stack:start/end -->
  (idempotent append)
```

**Key observation:** every v0.9 feature fits cleanly into the **existing per-feature-module** pattern from `bin/cli.mjs`. No architectural refactor is required — this is additive work.

---

## 2. Existing Integration Surface (Facts, Not Guesses)

### 2.1 CLI Router (`bin/cli.mjs`, 221 lines)

Single `switch (command)` block, each case dynamically imports a `lib/*.mjs` module and calls its exported `main(args.slice(1))`. Pattern is identical for all 35+ subcommands. Adding a subcommand is **mechanical**: new case + import, ~5 lines per feature (confirmed lines 133–138 for the existing `notebooklm` case).

### 2.2 Skill Generation (`lib/project-setup.mjs`, 196 lines)

Current flow (verified):
- `PROJECT_SKILLS` constant array (lines 20–25) lists the 4 built-in skills (`session-manager`, `project-switcher`, `dev-router`, `dev-research`) each as `{ name, desc, triggers }`.
- `copyProjectSkills(projectPath)` (lines 33–60) iterates the array, copies `skills/{name}/SKILL.md` → `{project}/.claude/skills/{name}/SKILL.md`, only overwriting when content changed.
- `generateSkillsSection()` (lines 66–103) **hard-codes** the per-skill markdown block inside CLAUDE.md between `<!-- @claude-dev-stack:start -->` / `<!-- @claude-dev-stack:end -->` markers.
- `updateProjectClaudeMd(projectPath)` (lines 111–143) is the idempotent marker-replace routine.
- `setupProject(projectPath)` bundles both operations (lines 148–161).
- `setupAllProjects(vaultPath)` walks `project-map.json` (lines 173–196), returning `{projects, results, missing}` — the "loud missing" contract shipped in v0.7.9.

**Implication for git-conventions:** adding a 5th skill to `PROJECT_SKILLS` auto-wires copy + CLAUDE.md generation. Zero plumbing work. **But** git-conventions is **parameterized** (reads `.claude/git-scopes.json`), which means the skill copy is not enough — the wizard also needs to **write the scopes JSON** at setup time. That's the novel piece.

### 2.3 NotebookLM Stack (4 files, already layered)

| File | Lines | Role in v0.8.1 | v0.9 change scope |
|------|-------|----------------|-------------------|
| `lib/notebooklm.mjs` | 578 | Pure CLI wrapper over `notebooklm-py` (spawnSync + error classes) | **No change** — all 7 functions already support multi-notebook |
| `lib/notebooklm-sync.mjs` | 521 | `syncVault(opts)` walks one vault → syncs to **one** notebook | **Extend** — loop over projects, one notebook per project |
| `lib/notebooklm-manifest.mjs` | 332 | `.notebooklm-sync.json` SHA-256 delta tracking, atomic writes, corrupt recovery | **Schema extend** — add top-level `projects` key, keep v1 shape as fallback during migration |
| `lib/notebooklm-cli.mjs` | 224 | `notebooklm {sync,status,help}` dispatcher | **Extend** — add `notebooklm migrate` subcommand |

**Key confirmed facts:**
- `syncVault()` (lines 381–466) already accepts `{vaultRoot, notebookName, dryRun}`. The notebook name is resolved at **call time** (line 396–399) from `passedNotebookName ?? env ?? 'claude-dev-stack-vault'`. This means per-project iteration can be built as a **caller-level loop** calling `syncVault` N times, each with a per-project `notebookName` and **filtered walk**. No change to `syncVault` internal shape is strictly required — but see §4.2 for a cleaner alternative.
- `ensureNotebook(notebookName)` (lines 193–213) already handles the create-or-lookup path with strict title equality and loud duplicate detection — multi-notebook safe as-is.
- `listNotebooks()` (`notebooklm.mjs` lines 550–577) returns `Array<{id, title, createdAt}>` — the exact primitive needed by the migration script.
- `walkProjectFiles(vaultRoot)` (lines 101–133) already **iterates per-project** (sorted slugs, one subtree per slug). The per-project loop is already there; it just currently flushes all files into one notebook. Splitting by project is a 10-line refactor in the emission loop.
- Filename titles are already prefixed `{project}__` via `buildTitle()` (lines 59–83). For per-project notebooks the prefix becomes **redundant** but safe to keep during migration (it keeps round-tripping simple and helps if a user accidentally merges notebooks).

### 2.4 Docs Module (`lib/docs.mjs`, 287 lines)

Already handles Notion export unzip-and-copy via `importNotion(docsDir)` (lines 158–227). The flow is:
1. User runs `docs add` → picks project → picks `notion` source
2. User points at unzipped Notion export folder
3. Module scans for `.md`/`.csv`, offers multiselect, copies into `vault/projects/{name}/docs/`
4. `cleanNotionFilename()` strips the 32-char UUID suffix Notion adds

**Implication for v0.9 notion-import:** the **sink** (target directory = `vault/projects/{name}/docs/`) and the **filename normalization** already exist. The NEW piece is automating **fetch** via MCP instead of asking the user to manually export+unzip. Architecturally this is "a new source module feeding into the existing copy-to-docs step."

### 2.5 Install Wizard (`bin/install.mjs`, 1381 lines)

Structure (verified via step headers in grep):
- Lines 1–124: helpers (`runCmd`, `hasCommand`, `step(num, total, title)`, `askPath`, `printHeader`)
- Step 1: prerequisites (L175)
- Step 2: language/profile (L244)
- Step 3: projects (L276)
- Step 4: component selection (L400)
- Step 5: plugins (L446)
- Step 6: vault path (L622)
- Installers: vault (L638), GSD (L699), Obsidian skills (L718), custom skills (L746), deep-research (L771), **NotebookLM (L815–928)**, generate CLAUDE.md (L930), session hooks (L1027), summary (L1118)
- `main()` at L1230

Each installer is a **self-contained top-level async function** ~100 lines. The NotebookLM wizard (L815–928) is the cleanest template for v0.9 work: it's a single function `installNotebookLM(pipCmd, stepNum, totalSteps)` that uses `step()`, `info()`, `ok()`, `fail()`, and ends with an **optional first-run** prompt. It already calls into `lib/notebooklm-sync.mjs` via a dynamic import (L910), proving the pattern of "wizard step delegates to feature module."

**Decision (D-I-1): keep `install.mjs` monolithic.** The 1381-line file follows a strict linear top-down script structure that is easier to audit in one pass than split across files. Adding a new `installGitConventions()` function (~80 lines) follows the existing pattern identically. The only extraction that makes sense is **per-feature tiny helpers** (e.g. stack detection), which should live in `lib/git-scopes.mjs` so they're importable from both the wizard and the `scopes` subcommand.

---

## 3. New Files vs Modified Files (Exhaustive)

### 3.1 Git Conventions Skill Ecosystem

**NEW files:**
| File | Size est. | Purpose |
|------|-----------|---------|
| `lib/git-conventions.mjs` | ~150 L | `main(args)` for `scopes` subcommand: render skill template with detected stack, write `.claude/git-scopes.json`, optionally install `commitlint` |
| `lib/git-scopes.mjs` | ~200 L | Pure module — JSON schema constants, `detectStack(projectPath)` (returns `{stack, scopes[]}` from 7+ signature files: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `composer.json`, `pom.xml`), `readScopes(projectPath)`, `writeScopes(projectPath, data)`, `mergeWithExisting(...)`. Importable from both CLI and wizard. |
| `skills/git-conventions/SKILL.md` | ~200 L | Skill definition with YAML frontmatter triggers ("commit", "push", "branch", "коммит", "ветка"), reads `.claude/git-scopes.json`, enforces conventional commits format |
| `templates/git-scopes/nextjs.json` + 6 more | ~20 L each | Per-stack default scope dictionaries (baked in as source of truth for `detectStack()`) |
| `tests/git-conventions.test.mjs` | ~100 L | Unit tests for `detectStack()` fixture matrix, `readScopes`/`writeScopes` round-trip, idempotent merge |
| `tests/git-scopes.test.mjs` | ~100 L | Schema validation edge cases, corrupt JSON recovery |

**MODIFIED files:**
| File | Change | Line count |
|------|--------|------------|
| `bin/cli.mjs` | Add case `'scopes':` → dynamic import `../lib/git-conventions.mjs` | +6 lines |
| `bin/cli.mjs` | Add `scopes` help block in `printHelp()` | +3 lines |
| `lib/project-setup.mjs` | Add 5th entry to `PROJECT_SKILLS` array (git-conventions triggers + desc); no change to `copyProjectSkills` or `generateSkillsSection` (they iterate the array) | +1 entry (~1 line) |
| `bin/install.mjs` | New `installGitConventions(stepNum, totalSteps)` function ~80 lines after `installNotebookLM`; called from `main()` step loop; writes `.claude/git-scopes.json` via `lib/git-scopes.mjs::writeScopes` and calls `detectStack()` per mapped project | +100 lines |
| `lib/doctor.mjs` | Add 3-line section: "git-conventions: N/M projects have `.claude/git-scopes.json`" (matching v0.8 ADR-0012 severity discipline) | +15 lines |

### 3.2 NotebookLM Per-Project Notebooks

**NEW files:**
| File | Size est. | Purpose |
|------|-----------|---------|
| `lib/notebooklm-migrate.mjs` | ~250 L | `migrateToPerProject({vaultRoot, dryRun})` — detects shared `claude-dev-stack-vault` notebook via `listNotebooks()`, calls `listSources(sharedId)` to get current 27 sources, groups by `{project}__` prefix via regex, creates per-project notebooks via `createNotebook()`, re-uploads each source from the local vault file (not from NotebookLM — NotebookLM is upload-only), writes new manifest atomically, **then** deletes the shared notebook sources only after all uploads succeed |
| `tests/notebooklm-migrate.test.mjs` | ~150 L | Stubs `listNotebooks`, `listSources`, `createNotebook`, `uploadSource`, verifies grouping logic, rollback-on-midway-failure, and idempotent resume |

**MODIFIED files:**
| File | Change |
|------|--------|
| `lib/notebooklm-sync.mjs::syncVault` | Convert single-notebook body into a per-project loop. Iterate `walkProjectFiles()` grouped by `projectSlug`, call `ensureNotebook(${projectSlug})` per group, pass `notebookId` into `syncOneFile`. **Stats aggregation becomes `{perProject: {[slug]: {uploaded,skipped,failed,...}}, total: {...}}`** |
| `lib/notebooklm-sync.mjs::ensureNotebook` | No internal change — already handles per-name lookup/create |
| `lib/notebooklm-manifest.mjs` | Bump `MANIFEST_VERSION` to **2**. New shape: `{version: 2, generated_at, projects: {[slug]: {notebook_id, files: {...}}}}` — nests file hash tables under each project slug. The `files` key at top level is removed. Corrupt-recovery path and atomic rename unchanged. |
| `lib/notebooklm-manifest.mjs` | Add `migrateV1ToV2(manifest)` pure function — when `readManifest()` encounters `version === 1`, auto-migrate in memory (group existing files by project extracted from path), then write back v2. Preserves hash history across upgrade → avoids re-uploading everything. |
| `lib/notebooklm-cli.mjs::main` | Add case `'migrate':` → dynamic import `lib/notebooklm-migrate.mjs`. Also add `--dry-run` flag plumbing |
| `bin/install.mjs::installNotebookLM` | **Small change**: the "offer first sync" block (L900–921) already calls `syncVault()`. No change needed — it now automatically does per-project sync once the underlying module changes. |
| `lib/doctor.mjs` | Extend the 3-line NotebookLM section to show per-project notebook status |

### 3.3 Notion Auto-Import via MCP

**NEW files:**
| File | Size est. | Purpose |
|------|-----------|---------|
| `lib/notion-import.mjs` | ~200 L | `main(args)` for `notion` subcommand (`notion import`, `notion list`, `notion configure`). `importPages(projectSlug, opts)` reads `.claude/notion_pages.json`, invokes MCP tool via either (a) `spawnSync('claude', ['mcp', 'call', 'notion', ...])` if Claude CLI supports scripted MCP calls, or (b) emits structured markdown instructions for the Skill tool to execute the actual MCP calls (decision pending — see §5). Normalizes results via existing `cleanNotionFilename()` from `lib/docs.mjs`, writes to `vault/projects/{slug}/docs/`. |
| `lib/notion-config.mjs` | ~80 L | Pure schema module — validates `.claude/notion_pages.json` shape `{pages: [{page_id, title?, filename?}]}`, handles missing/corrupt cases |
| `skills/notion-importer/SKILL.md` | ~150 L | Intent-triggered skill: "import notion", "импортируй notion", "sync docs from notion". Reads `.claude/notion_pages.json`, calls into Notion MCP server, delegates write to `notion-import.mjs` |
| `tests/notion-import.test.mjs` | ~100 L | Stub MCP call layer, verify pages→files mapping, config-missing case |
| `tests/notion-config.test.mjs` | ~60 L | Schema edge cases |

**MODIFIED files:**
| File | Change |
|------|--------|
| `bin/cli.mjs` | Add case `'notion':` → dynamic import `../lib/notion-import.mjs`; + help block | +6 lines |
| `lib/docs.mjs` | **Extract** `cleanNotionFilename()` and `scanDir()` into exportable helpers so `notion-import.mjs` can reuse them without duplicating. Existing `importNotion()` stays as the manual-fallback path. | +2 exports, ~10 lines |
| `lib/project-setup.mjs::PROJECT_SKILLS` | Optionally add 6th entry for `notion-importer` if we ship the intent-triggered skill variant | +1 line |
| `bin/install.mjs` | Optional `configureNotionImport(stepNum, totalSteps)` wizard step. Skippable by default — only runs if user selects it in the component selector at step 4. | +60 lines |
| `lib/doctor.mjs` | Add 3-line section "notion-import: N/M projects have `.claude/notion_pages.json`" | +12 lines |

### 3.4 Total Surface Area

| Area | NEW files | NEW LOC | MODIFIED files | MODIFIED LOC |
|------|-----------|---------|----------------|--------------|
| git-conventions | 7 | ~790 | 4 | ~125 |
| nblm per-project | 2 | ~400 | 5 | ~180 |
| notion import | 5 | ~590 | 5 | ~90 |
| **TOTAL** | **14** | **~1780** | **~10** | **~395** |

Roughly **+2200 LOC net** across v0.9. The modified-file count is bounded because the layered architecture (router → feature module → shared helpers) prevents ripple edits.

---

## 4. Component-Level Integration Details

### 4.1 git-conventions — Where the Pieces Wire

**Data shape for `.claude/git-scopes.json` (locked in `lib/git-scopes.mjs`):**
```jsonc
{
  "version": 1,
  "stack": "nextjs",           // from detectStack() or user override
  "scopes": ["ui", "api", "db", "auth", "cli"],
  "commit_types": ["feat", "fix", "chore", "docs", "refactor", "test"],
  "branch_prefix": "feat/",     // used when skill creates a branch
  "requires_issue_link": false
}
```

**Detection order (`detectStack(projectPath)` in `lib/git-scopes.mjs`):**
1. `package.json` present → inspect `dependencies` for `next` / `react` / `vue` / `@sveltejs/kit` / `express` / `fastify`
2. `pyproject.toml` → check for `django` / `fastapi` / `flask`
3. `Cargo.toml` → rust
4. `go.mod` → go
5. `Gemfile` → rails
6. `composer.json` → laravel
7. `pom.xml` / `build.gradle` → jvm
8. Fallback → `blank` template (scopes = `["core"]`)

**Renderer flow inside `bin/install.mjs::installGitConventions`:**
```
for each mapped project in project-map.json:
  stackInfo = detectStack(projectPath)
  existing = readScopes(projectPath)  // may be null
  merged = mergeWithExisting(existing, stackInfo)  // preserves user edits
  writeScopes(projectPath, merged)
  // copyProjectSkills already handled by existing project-setup.mjs loop
```

The **wizard and the `scopes` subcommand share `lib/git-scopes.mjs`** — no duplication. The `scopes` subcommand itself handles the manual re-run path: `claude-dev-stack scopes detect`, `claude-dev-stack scopes edit`, `claude-dev-stack scopes list`.

**Integration with `lib/project-setup.mjs::generateSkillsSection`:** adding to `PROJECT_SKILLS` auto-emits the skill block in CLAUDE.md. **No change to `generateSkillsSection` itself.** This is the single most important architectural observation for this feature: the skills catalog is already data-driven.

### 4.2 NotebookLM Per-Project — The `syncVault` Loop Transform

**Current `syncVault` shape (lines 381–466, simplified):**
```
notebookId = ensureNotebook(notebookName)  // ONE call
files = walkProjectFiles(vaultRoot)        // flat list
manifest = readManifest(vaultRoot)
for fileEntry of files:
  syncOneFile({fileEntry, notebookId, manifest, stats, dryRun})
return stats
```

**v0.9 transform (minimal diff):**
```
files = walkProjectFiles(vaultRoot)
byProject = groupBy(files, f => f.projectSlug)  // new helper
manifest = readManifest(vaultRoot)  // now v2 with {projects: {slug: {notebook_id, files}}}
statsPerProject = {}
for [slug, projectFiles] of byProject:
  notebookId = ensureNotebook(`claude-dev-stack-${slug}`)  // one per project
  manifest.projects[slug] ??= {notebook_id: notebookId, files: {}}
  manifest.projects[slug].notebook_id = notebookId  // refresh in case recreated
  projectStats = {uploaded:0, skipped:0, failed:0, errors:[], ...}
  for fileEntry of projectFiles:
    syncOneFile({fileEntry, notebookId,
                 manifest: manifest.projects[slug],  // scoped view
                 stats: projectStats, dryRun})
  statsPerProject[slug] = projectStats
return {perProject: statsPerProject, total: aggregate(statsPerProject), ...}
```

**Why this works without touching `syncOneFile`:** `syncOneFile` reads `manifest.files[vaultRelativePath]` and writes back to the same key. If we pass `manifest.projects[slug]` as `manifest` to `syncOneFile`, its `files` subobject is directly the delta table for that project. **Zero change to `syncOneFile` line 243+.** The manifest save must happen at the top-level object though — `syncOneFile` currently calls `writeManifest(vaultRoot, manifest)` on line 273 where `manifest` is the top-level object. This needs one tweak: pass the top-level `rootManifest` separately and persist the whole tree atomically after each file.

**Why the `{project}__` filename prefix stays:** round-trip safety during the migration window. Once all users complete migration, v1.0 can drop the prefix. Keeping it in v0.9 is zero risk.

**Migration script anatomy (`lib/notebooklm-migrate.mjs`):**
```
async function migrateToPerProject({vaultRoot, dryRun}) {
  1. listNotebooks() → find matches for 'claude-dev-stack-vault' (shared name)
  2. if zero matches: info("no shared notebook to migrate"); return stats
  3. sharedId = matches[0].id
  4. sources = listSources(sharedId)  // e.g. 27 items
  5. groups = groupSourcesByPrefix(sources, /^([a-z0-9_-]+)__/)
  6. if dryRun: return {projects: groups, totalSources: sources.length}
  7. vaultManifest = readManifest(vaultRoot)  // v1 or v2
  8. for [slug, sourceList] of groups:
       - newId = ensureNotebook(`claude-dev-stack-${slug}`)  // create if absent
       - for each source in sourceList:
           absPath = reconstructVaultPath(slug, source.title)  // uses inverse of buildTitle
           if absPath doesn't exist → warn + skip (orphan)
           uploadSource(newId, absPath, {title: source.title})
           update vaultManifest.projects[slug].files[...] with hash + new sourceId
         writeManifest(vaultRoot, vaultManifest)  // atomic after each project
  9. rollback guard: if step 8 raises for any project, STOP — do NOT touch shared notebook
 10. after all projects succeed: for each sourceId in original shared, deleteSource(sharedId, sid)
 11. keep shared notebook itself (user can delete manually) — safer than auto-delete
}
```

**Rollback strategy:**
- Per-project uploads are **additive** — each successfully uploaded file writes to `vaultManifest.projects[slug].files[...]` immediately, via the existing atomic rename pattern in `writeManifest` (line 250–252).
- If migration fails mid-project, the partial manifest is persisted; re-running `migrate` **resumes** by skipping files whose hash already matches.
- The **shared notebook sources are untouched until step 10**, so even a catastrophic crash leaves the source-of-truth shared notebook intact. User can re-run.
- **Hard rule:** never delete shared-notebook sources before all uploads succeed. Never delete the shared notebook itself automatically. Log the shared notebook ID and print a manual cleanup instruction at the end.

**Integration with existing manifest v1:** `readManifest()` detects `version === 1`, calls `migrateV1ToV2()` **before** returning. Callers see v2 unconditionally. This means `syncVault` doesn't need a branch for "old manifest" — the shape is normalized at read time. The first `writeManifest` call after upgrade persists v2 permanently.

### 4.3 Notion Auto-Import — MCP Invocation Strategy

**Decision D-I-3 (unresolved, needs roadmapper call):** two viable paths for calling the Notion MCP server from Node code:

**Option A — shell-out via `claude mcp call`:**
```js
const result = spawnSync('claude', ['mcp', 'call', 'notion', 'get_page',
  '--input', JSON.stringify({page_id: '...'})], {encoding: 'utf8'});
```
- Pro: zero new deps, matches the `lib/mcp.mjs` pattern, works from plain CLI context
- Con: **depends on Claude CLI supporting `mcp call` subcommand** — unverified in current Claude CLI (as of 2026-04 the CLI ships `claude mcp list/add/remove` but `call` is new/uncertain). Needs verification before Phase 9.
- Con: output parsing brittle

**Option B — skill-driven via `notion-importer` SKILL.md:**
- The skill (not the CLI) calls the Notion MCP tool directly via the Skill/Tool invocation graph
- CLI command `notion import` writes a `.claude/notion_import_queue.json` file and instructs the user to run the import through Claude in a session (where MCP tools are live)
- Pro: uses the MCP layer that's already wired into Claude Code
- Con: no pure-CLI path; requires Claude session context to complete

**Recommendation:** **Phase 9 starts with Option B** (skill-first), and verifies Option A during research as a v1.0 improvement. The `claude.ai Notion` MCP server is only accessible inside Claude sessions anyway — forcing the import to happen inside a session matches reality and avoids depending on unverified `claude mcp call` subcommand shape.

**Where `.claude/notion_pages.json` lives:** **project-level** (i.e. `{project}/.claude/notion_pages.json`), mirroring `.claude/git-scopes.json`. Rationale: Notion pages are **per-project concerns** — this project's docs source, that project's architecture doc. A user-level file would force cross-project collisions on `page_id`. Matches existing pattern of per-project `.claude/` config.

**Schema (`lib/notion-config.mjs`):**
```jsonc
{
  "version": 1,
  "pages": [
    {
      "page_id": "abc123...",
      "title": "Architecture Notes",        // optional — fetched if missing
      "filename": "architecture.md",         // optional — derived from title if missing
      "last_imported_at": "2026-04-11T..."   // updated by importer
    }
  ]
}
```

**Integration with `lib/docs.mjs`:**
1. Import fetches markdown content via MCP call
2. Writes via existing `cleanNotionFilename()` + `cpSync` pattern (extract those into exportable helpers, do NOT duplicate)
3. Files land in `vault/projects/{slug}/docs/`
4. **Existing NotebookLM sync automatically picks them up** on next sync run — this is the beauty of the chain: notion → vault → NotebookLM without any new sync logic. The v0.9 per-project sync means each project's Notion docs only go to that project's notebook.

---

## 5. Build Order and Phase Sequencing

**Dependency graph:**
```
Phase 6: git-conventions skill ecosystem
  ├─ depends on: existing lib/project-setup.mjs (read-only)
  ├─ depends on: existing bin/cli.mjs (add case)
  └─ NO downstream dependencies ← INDEPENDENT, ship first

Phase 7: NotebookLM manifest v2 + per-project sync
  ├─ depends on: existing lib/notebooklm-*.mjs (4 files, extend)
  ├─ blocks:     Phase 8 migration script (migration needs v2 writer)
  └─ technically independent of Phase 6 but DEEP in the hottest code path

Phase 8: NotebookLM migration script
  ├─ depends on: Phase 7 manifest v2 writer
  ├─ depends on: stable syncVault loop from Phase 7
  └─ must ship before v0.9 tag — otherwise users on v0.8.1 are stuck on shared notebook

Phase 9: Notion MCP auto-import
  ├─ depends on: existing lib/docs.mjs (extract helpers)
  ├─ depends on: Phase 7 per-project sync (so imported docs land in correct project notebook)
  └─ optional dependency on Phase 6 (shares .claude/ config pattern)
```

**Recommended ordering (LOW risk → HIGH risk):**

| Phase | Feature | Risk | Why this order |
|-------|---------|------|----------------|
| **6** | git-conventions skill + scopes CLI + wizard integration | **LOW** — touches `project-setup.mjs` with 1 new array entry, adds isolated `lib/git-conventions.mjs` + `lib/git-scopes.mjs`, new skill file, new subcommand case. Zero impact on shipped NotebookLM code paths. | Independent; ships value fast; gives the team practice touching `install.mjs` wizard step pattern before they do it for NotebookLM migration. |
| **7** | NotebookLM manifest v2 + syncVault per-project loop | **MEDIUM** — modifies the manifest schema that 247 tests cover, changes stats shape callers depend on (`notebooklm-cli.mjs::runSync`, `bin/install.mjs::installNotebookLM` first-sync block, `hooks/notebooklm-sync-runner.mjs`). Mitigation: v1→v2 auto-migration in `readManifest` keeps existing vaults working on first read. | Must ship before Phase 8 (migration uses v2 writer). Does NOT require production users to migrate — if they never ran sync before, they just start on v2. |
| **8** | `notebooklm migrate` subcommand + rollback-safe script | **MEDIUM-HIGH** — touches real production NotebookLM notebooks (27 sources for the primary user). Must be reversible. Ships as explicit `migrate` subcommand, not auto-run. | Gated behind explicit user invocation. Test matrix must cover: no shared notebook, 0 sources, partial upload failure mid-project, duplicate project slug, orphan source (title doesn't match vault file). |
| **9** | Notion MCP auto-import + skill + config | **LOW-MEDIUM** — new module, new subcommand, new skill. The riskiest piece is the MCP invocation strategy (Option A vs B above), which is research-gated. Zero touch on NotebookLM code. | Ship last so imported docs flow into v0.9 per-project notebooks, not the v0.8 shared one. Can be deferred to v0.10 if Phase 7/8 take longer than expected — Notion import is value-add, not core. |

**Merge-to-main policy (inherited from v0.8):** each phase = feature branch + PR + CI green + squash merge. Matches the 4 post-v0.8 cleanup PRs (#17–#20) from recent history. Branching strategy in `.planning` is `none`, but `quick_branch_template: chore/{slug}` — phases use `feat/{slug}` instead.

---

## 6. Architectural Anti-Patterns to Avoid in v0.9

### Anti-Pattern A-1: Inlining scope data into the skill file
**What people do:** Write `git-conventions/SKILL.md` with a hardcoded scope list for Next.js.
**Why wrong:** Every project gets the same scopes. Scopes are per-project data, not per-skill metadata.
**Do instead:** Skill file references `.claude/git-scopes.json`; `lib/git-scopes.mjs` is the single source of truth for detection + merging. The skill is a **reader**, the CLI is the **writer**.

### Anti-Pattern A-2: Deleting shared notebook before verifying per-project uploads
**What people do:** `migrateToPerProject` calls `deleteSource` inline after each upload.
**Why wrong:** Rate limit mid-batch → you have an incomplete per-project notebook **and** a half-destroyed shared one. No rollback path.
**Do instead:** **Two-phase commit.** Phase A uploads every source to every new notebook, writes the manifest atomically. Phase B deletes shared sources only if Phase A reports zero failures. Even then, prefer warning the user to manually delete the shared notebook rather than auto-deleting.

### Anti-Pattern A-3: Writing new NotebookLM wrapper functions in `lib/notebooklm.mjs`
**What people do:** Add a `migrate` or `groupedSync` function to the pure CLI wrapper.
**Why wrong:** Violates Phase 2 D-03 ("no UI, no orchestration in `lib/notebooklm.mjs`"). That file is 7 primitives only. Orchestration lives in `sync`, `migrate`, `cli` modules.
**Do instead:** Orchestration in `lib/notebooklm-migrate.mjs`; it imports `listNotebooks`, `listSources`, `createNotebook`, `uploadSource`, `deleteSource` from `notebooklm.mjs` and composes them. Matches the existing pattern where `notebooklm-sync.mjs` is the consumer.

### Anti-Pattern A-4: Scattering `.claude/` config readers
**What people do:** Every new feature writes its own `readJsonConfig(path)` helper.
**Why wrong:** Corrupt-recovery logic duplicated 3×; no shared contract.
**Do instead:** Follow `lib/notebooklm-manifest.mjs` pattern of dedicated schema module per config type. `lib/git-scopes.mjs` and `lib/notion-config.mjs` both have their own `read/write/validate` trio. Shared atomic-write helper could be extracted to `lib/shared.mjs` as `atomicWriteJson(path, obj)` — **small cleanup win, worth doing in Phase 6 as a prerequisite**.

### Anti-Pattern A-5: Adding a new top-level directory
**What people do:** `config/`, `schemas/`, `catalogs/` — thinking it makes things "cleaner".
**Why wrong:** The project has **zero** top-level dirs beyond `bin/ lib/ hooks/ skills/ templates/ tests/ .planning/ .github/`. Every add is a cognitive tax. Tests look for `lib/*.mjs`, not `lib/**/*.mjs`.
**Do instead:** Stay inside `lib/` for all schema and detection modules. Use filename prefixing (`notebooklm-*.mjs`, `git-*.mjs`, `notion-*.mjs`) — already the convention.

---

## 7. Integration Points Matrix (Quick Reference)

### 7.1 New vs modified integration points

| Integration | Direction | New or Modified? | Risk |
|-------------|-----------|------------------|------|
| `bin/cli.mjs` → `lib/git-conventions.mjs` | router → feature | NEW case | LOW |
| `bin/cli.mjs` → `lib/notion-import.mjs` | router → feature | NEW case | LOW |
| `bin/cli.mjs` → `lib/notebooklm-cli.mjs` (`migrate` subcommand) | router → feature | MODIFIED case | LOW |
| `lib/project-setup.mjs::PROJECT_SKILLS` | data | MODIFIED (+1 or +2 entries) | LOW |
| `lib/project-setup.mjs::generateSkillsSection` | code | **UNCHANGED** (data-driven from PROJECT_SKILLS) | N/A |
| `bin/install.mjs` → new `installGitConventions` function | wizard step | NEW function | LOW |
| `bin/install.mjs::installNotebookLM` first-sync block | delegate | **UNCHANGED** (transitively picks up new syncVault behavior) | MEDIUM (implicit coupling) |
| `lib/notebooklm-sync.mjs::syncVault` | core loop | MODIFIED (per-project loop) | MEDIUM-HIGH |
| `lib/notebooklm-sync.mjs::syncOneFile` | per-file op | **UNCHANGED** if manifest sub-object is passed correctly | LOW |
| `lib/notebooklm-manifest.mjs` schema | persistence | MODIFIED (v1 → v2 shape) | MEDIUM — 20+ tests affected |
| `lib/notebooklm-migrate.mjs` → `lib/notebooklm.mjs` primitives | orchestration | NEW (read-only use of 5 existing functions) | MEDIUM (real API calls to prod data) |
| `lib/notion-import.mjs` → `lib/docs.mjs` helpers | reuse | NEW import of `cleanNotionFilename`, `scanDir` (after extracting) | LOW |
| `lib/notion-import.mjs` → Notion MCP server | external | NEW (strategy TBD — A or B from §4.3) | MEDIUM (depends on Claude CLI feature support) |
| `lib/doctor.mjs` health checks | diagnostic | MODIFIED (+3 sections) | LOW |

### 7.2 Files that **must not** be touched in v0.9

- `lib/notebooklm.mjs` — pure primitives, D-03 boundary; 578 lines of battle-tested error handling
- `hooks/notebooklm-sync-runner.mjs` — background runner, already rotates logs, already trigger-gated
- `lib/notebooklm-manifest.mjs::writeManifest` atomic rename code (lines 245–252) — POSIX-verified atomic, don't refactor
- `lib/shared.mjs` existing exports — only ADDITIONS (e.g. optional `atomicWriteJson`), no signature changes

---

## 8. Data Flow — v0.9 End-to-End

### 8.1 Notion → Vault → NotebookLM chain

```
User: "import notion pages for claude-dev-stack"
    ↓
notion-importer SKILL.md (intent match)
    ↓
notion-import.mjs::importPages('claude-dev-stack')
    ↓
reads .claude/notion_pages.json → [page_id list]
    ↓
MCP call: claude.ai/notion get_page(page_id)  ×N
    ↓
normalize via cleanNotionFilename() (reused from docs.mjs)
    ↓
write to ~/vault/projects/claude-dev-stack/docs/architecture.md
    ↓
(session ends)
    ↓
hooks/notebooklm-sync-trigger.mjs → notebooklm-sync-runner.mjs
    ↓
syncVault({vaultRoot})  // v0.9 per-project loop
    ↓
ensureNotebook('claude-dev-stack-claude-dev-stack')
    ↓
uploadSource(notebookId, docs/architecture.md, {title: 'claude-dev-stack__doc-architecture.md'})
    ↓
NotebookLM notebook for claude-dev-stack has the new page
    ↓
User asks dev-research skill → queries claude-dev-stack notebook → grounded answer
```

### 8.2 git-conventions at commit time

```
User: "commit these changes"
    ↓
git-conventions SKILL.md (intent match)
    ↓
reads {project}/.claude/git-scopes.json
    ↓
formats candidate commit message: "feat(ui): add ..."
    ↓
validates against scopes + commit_types
    ↓
executes: git commit -m "feat(ui): ..."
```

Note: the skill **reads** the config, the `scopes` CLI **writes** it. Clean separation.

### 8.3 NotebookLM migration

```
User: claude-dev-stack notebooklm migrate --dry-run
    ↓
lib/notebooklm-cli.mjs::main('migrate')
    ↓
lib/notebooklm-migrate.mjs::migrateToPerProject({dryRun: true})
    ↓
listNotebooks() → find 'claude-dev-stack-vault'
    ↓
listSources(sharedId) → 27 sources
    ↓
groupByPrefix → {slug1: [...], slug2: [...], ...}
    ↓
return {projects: 3, sources: 27, willCreate: ['slug1','slug2','slug3'], ...}
    ↓
User: claude-dev-stack notebooklm migrate  (no dry-run)
    ↓
for each slug:
  ensureNotebook → new ID
  for each source: uploadSource → manifest write
    ↓
(all uploads succeed)
    ↓
print "migration complete. Delete 'claude-dev-stack-vault' manually at notebooklm.google.com"
```

---

## 9. Scaling Considerations

| Scale | Impact on v0.9 design |
|-------|----------------------|
| 1 user, 5 projects (current) | Per-project sync adds ~5× `ensureNotebook` calls per run. Negligible (~100ms cost). |
| 1 user, 20 projects | Manifest v2 tree stays small (<10KB). 20 `ensureNotebook` calls acceptable. Consider parallelizing but **do not** in v0.9 — single-dep constraint, keep it serial. |
| 1 user, 50+ projects | Rate limit concerns from `notebooklm-py`. Add `--only {slug}` flag to `sync` in v1.0. Not in v0.9 scope. |
| Multiple users (shared machine) | Not a target — `claude-dev-stack` is per-user. No change needed. |

**First bottleneck:** `ensureNotebook` is called 1× per project per sync. For large vaults, this dominates. **Mitigation in v0.9:** cache the `{slug: notebookId}` map in the manifest (`manifest.projects[slug].notebook_id`) and only call `listNotebooks` once per sync run. Current code already does this implicitly because `ensureNotebook` does its own `listNotebooks` fetch — **we should optimize** by calling `listNotebooks` once at the top of `syncVault`'s per-project loop and passing the cached map into each iteration. Saves N−1 list calls.

**Second bottleneck:** migration script fetch-27-sources-and-group. Bounded; not a concern.

---

## 10. Sources

- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/bin/cli.mjs` (221 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/project-setup.mjs` (196 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm.mjs` (578 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm-sync.mjs` (521 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm-manifest.mjs` (332 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm-cli.mjs` (224 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/docs.mjs` (287 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/projects.mjs` (476 L, read in full)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/bin/install.mjs` (1381 L, grepped for function/step boundaries; NotebookLM installer examined at L815–928)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.planning/PROJECT.md` (current milestone v0.9 context)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.planning/codebase/STRUCTURE.md` (directory conventions)
- Referenced but not re-verified in this session: `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` (ADR-0001, Phase 2 D-03 "no UI in lib/notebooklm.mjs")

---

*Architecture research for: claude-dev-stack v0.9 integration*
*Researched: 2026-04-11*
*Confidence: HIGH — all structural claims verified against source reads; MEDIUM on §4.3 (Notion MCP invocation strategy depends on unverified Claude CLI `mcp call` support)*
