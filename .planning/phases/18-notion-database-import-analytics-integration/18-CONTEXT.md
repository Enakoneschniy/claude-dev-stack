# Phase 18: Notion Database Import + Analytics Integration — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two independent features within a single phase:

1. **NOTION-01** — `claude-dev-stack notion import --database <id>` imports all pages from a Notion database into `vault/projects/{name}/docs/notion/` with pagination support (Notion API 100-page limit).
2. **ANALYTICS-01** — The analytics dashboard (`claude-dev-stack analytics`) gains a NotebookLM section showing sync stats (last sync time, source count, sync duration) and query usage (questions asked, artifacts generated).

**What this phase does NOT touch:**
- Two-way sync (NotebookLM → vault) — out of scope per REQUIREMENTS.md
- Notion REST API fallback — MCP-only per REQUIREMENTS.md Out of Scope
- Per-project NotebookLM notebook selection — existing manifest structure is sufficient
- Vault git sync — not changed

**Depends on:** Phase 14 (slug module `lib/project-naming.mjs` must be in place — used for database page file naming).

</domain>

<decisions>
## Implementation Decisions

---

### NOTION-01: Notion Database Import

**D-01: MCP tool vs REST API — MCP-only (skill-first)**

Use Notion MCP tool `notion-fetch` (same pattern as existing per-page import in `lib/notion-import.mjs` and `lib/notion-cli.mjs`). REST API fallback is explicitly ruled out in REQUIREMENTS.md Out of Scope. The CLI prints guidance when no `fetchFn` is provided (same pattern as existing `importPages()` in `lib/notion-cli.mjs` lines 121–128).

**D-02: Pagination — cursor-based loop, max 100 pages per request**

Notion API returns at most 100 results per `query_database` call. The implementation loops with `has_more` + `next_cursor` until all pages are fetched. The `fetchFn` abstraction must accept a `cursor` parameter:

```js
// fetchFn signature for database import
async function fetchFn(databaseId, cursor = null) {
  // returns { pages: [...], has_more: boolean, next_cursor: string|null }
}
```

This keeps the core `importDatabase()` function testable by injecting a mock `fetchFn`.

**D-03: Where to save files — `vault/projects/{name}/docs/notion/`**

Same directory as per-page import: `vault/projects/{name}/docs/notion/`. The project must be selected interactively (same `getProjects()` pattern used in `lib/docs.mjs:19`). Directory is created via `mkdirp()` if absent.

**D-04: File naming — `toSlug()` from `lib/project-naming.mjs` + `.md` extension**

Each database page is named from its `title` property (first rich-text field): `toSlug(pageTitle) + '.md'`. Falls back to `page_id + '.md'` when title is empty. Uses `toSlug` imported from `lib/project-naming.mjs` (Phase 14 dependency).

**D-05: Overwrite protection — reuse existing 3-way hash from `lib/notion-import.mjs`**

Reuse `importPage(vaultDocsDir, pageConfig, fetchedMarkdown)` from `lib/notion-import.mjs`. This gives the same 3-way hash protection (unchanged → skip, no local edits → overwrite, local drift → conflict file) without duplicating the logic.

**D-06: Subcommand syntax — `notion import --database <id>`**

Add `--database <id>` flag handling inside `importPages()` in `lib/notion-cli.mjs`. When `--database` flag is present, route to the new `importDatabase()` path. When absent, use the existing per-page config path. This avoids a new subcommand and keeps `notion import` as the single entry point for all Notion import workflows.

**D-07: Database ID parsing — reuse `parseNotionUrl()` from `lib/notion-config.mjs`**

The `--database` argument may be a raw ID or a full Notion URL. Run it through `parseNotionUrl()` (which handles both 32-char hex and dashed UUID formats). Fail with a clear message if parsing fails.

**D-08: Progress output — per-page `ok()` calls, summary at end**

Print progress per page using `ok()` and `info()` helpers (same pattern as `importAllPages()` in `lib/notion-import.mjs` lines 162–178). Print a summary table at the end: created / updated / unchanged / conflict counts.

**D-09: New function `importDatabase(databaseId, vaultDocsDir, fetchFn)` in `lib/notion-import.mjs`**

Add the database import function to the existing `lib/notion-import.mjs` module (not a new file). This module already owns page-level import logic and the 3-way hash. The new function:
1. Loops cursor-based fetching via `fetchFn`
2. Calls `importPage()` for each page
3. Returns `{ created, updated, unchanged, conflict, total }` summary

**D-10: CLI routing update — `lib/notion-cli.mjs` `importPages()` detects `--database` flag**

```js
// In importPages(args, fetchFn):
const dbFlag = args.indexOf('--database');
const databaseId = dbFlag >= 0 ? args[dbFlag + 1] : null;
if (databaseId) {
  // route to importDatabase path
} else {
  // existing per-page config path
}
```

**D-11: Test file — `tests/notion-import-database.test.mjs`**

New test file (not appended to existing test files) covering:
- `importDatabase()` with mock fetchFn returning multiple pages
- Pagination: mock returning `has_more: true` then `has_more: false`
- Empty database: returns `{ created: 0, updated: 0, unchanged: 0, conflict: 0, total: 0 }`
- File naming from title and fallback to page_id

---

### ANALYTICS-01: NotebookLM Stats + Query Usage in Dashboard

**D-12: Sync stats source — read from `~/.notebooklm-sync.json` manifest via `readManifest()`**

The NotebookLM sync manifest at `vault/.notebooklm-sync.json` already contains `generated_at` (last write time) and per-project `files` counts. Read it via `readManifest(vaultRoot)` from `lib/notebooklm-manifest.mjs`. Derive:
- **Last sync time:** `manifest.generated_at` → `formatAge()` (already in `lib/analytics.mjs`)
- **Source count:** sum of `Object.keys(project.files).length` across all projects
- **Sync duration:** not stored in manifest — omit from dashboard (show only if available; not tracked currently)

**D-13: Query usage tracking — separate counter file `vault/.notebooklm-stats.json`**

Query counts are NOT in the manifest. Track them in a separate file `vault/.notebooklm-stats.json`:

```json
{
  "version": 1,
  "questions_asked": 0,
  "artifacts_generated": 0,
  "last_query_at": null
}
```

Written atomically via `atomicWriteJson()` from `lib/shared.mjs`. Updated by `lib/notebooklm-cli.mjs` after each successful `ask` or `generate` call. New exported function `incrementQueryStats(vaultRoot, type)` in a new `lib/notebooklm-stats.mjs` module.

**D-14: `lib/notebooklm-stats.mjs` — new module for stats read/write**

New module (not appended to existing files) to keep separation of concerns:

```js
// Exports:
export function readQueryStats(vaultRoot)          // returns stats object or default
export function incrementQueryStats(vaultRoot, type)  // type: 'question' | 'artifact'
```

`readQueryStats()` returns `{ version: 1, questions_asked: 0, artifacts_generated: 0, last_query_at: null }` when file is absent. Never throws for missing/corrupt files (returns default).

**D-15: Gitignore — add `.notebooklm-stats.json` to vault `.gitignore` managed block**

Add `.notebooklm-stats.json` to the `ensureManifestGitignored()` function in `lib/notebooklm-manifest.mjs` (same managed block pattern). Stats file is machine-local (query counts are per-machine, not synced).

**D-16: Integration point in `lib/notebooklm-cli.mjs` — call `incrementQueryStats()` after ask/generate**

After a successful `notebooklm ask` or `notebooklm generate` call returns, call:
- `incrementQueryStats(vaultRoot, 'question')` for `ask`
- `incrementQueryStats(vaultRoot, 'artifact')` for `generate`

The vault path is already accessible via `findVault()` in the CLI module.

**D-17: Dashboard output format — table section after existing Summary block**

Add a `NotebookLM` section to `showDashboard()` in `lib/analytics.mjs`, placed after the existing `Summary` block and before `Recommendations`. Format:

```
  NotebookLM
  
    Sync:        3h ago  (or "never" if manifest is absent)
    Sources:     42      (total files tracked across all projects)
    Questions:   7       (from .notebooklm-stats.json)
    Artifacts:   2
```

Use existing `c.bold`, `c.dim`, `formatAge()` from the same file.

**D-18: "Not configured" graceful handling**

When `~/.notebooklm-sync.json` does not exist (manifest absent):
- Show `Sync: never` and `Sources: 0`

When `~/.notebooklm-stats.json` does not exist:
- Show `Questions: 0` and `Artifacts: 0`

When notebooklm-py is not installed (detected by checking if the manifest has ever been written):
- Show `  ${c.dim}NotebookLM not configured — run: claude-dev-stack notebooklm sync${c.reset}`

**D-19: "Not configured" detection logic**

If `manifest.generated_at` equals the value produced by `emptyManifest()` call at the same timestamp (i.e., `projects` is `{}`), treat as not configured. Simpler check: if `Object.keys(manifest.projects).length === 0` AND `!existsSync(manifestPath)`, show "not configured". If manifest file exists but is empty, show the zero-state stats.

**D-20: Test file — `tests/notebooklm-stats.test.mjs`**

New test file covering:
- `readQueryStats()` returns defaults when file absent
- `incrementQueryStats()` creates file when absent, increments correct counter
- `incrementQueryStats()` is idempotent on concurrent-safe writes (atomicWriteJson)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Notion Import (per-page)
- `lib/notion-cli.mjs` — CLI dispatcher; `importPages()` pattern for skill-first guidance
- `lib/notion-import.mjs` — `importPage()` (3-way hash), `importAllPages()`, `contentHash()`, `stampFrontmatter()`, `parseFrontmatter()`
- `lib/notion-config.mjs` — `parseNotionUrl()`, `readNotionConfig()`, `writeNotionConfig()`

### NotebookLM Manifest (sync stats source)
- `lib/notebooklm-manifest.mjs` — `readManifest(vaultRoot)`, `writeManifest()`, `ensureManifestGitignored()`; manifest shape: `{ version: 2, generated_at, projects: { [slug]: { notebook_id, files: {} } } }`

### Shared Utilities
- `lib/shared.mjs` — `atomicWriteJson()`, `mkdirp()`, `ok()`, `fail()`, `warn()`, `info()`, `c` colors
- `lib/project-naming.mjs` (Phase 14) — `toSlug(name)`, `fromSlug(slug)`
- `lib/projects.mjs` — `findVault()`

### Analytics Dashboard (existing)
- `lib/analytics.mjs` — `showDashboard()`, `getSessionStats()`, `formatAge()`, `scoreBar()`

### CLI Router
- `bin/cli.mjs` lines 153–157 — `notion` subcommand routes to `lib/notion-cli.mjs`
- `bin/cli.mjs` lines 194–200 — `analytics`/`stats`/`status` routes to `lib/analytics.mjs`
- `bin/cli.mjs` lines 146–150 — `notebooklm` routes to `lib/notebooklm-cli.mjs`

### Phase 18 Requirements
- `.planning/REQUIREMENTS.md` NOTION-01, ANALYTICS-01
- `.planning/ROADMAP.md` Phase 18 success criteria (lines 115–120)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

**`importPage(vaultDocsDir, pageConfig, fetchedMarkdown)`** (`lib/notion-import.mjs:102`)
- Handles file creation, 3-way hash check, conflict file on local drift
- Accepts `pageConfig = { page_id, page_url }` — for database pages, `page_url` can be derived from database ID + page ID or left as empty string

**`cleanNotionFilename(name)`** (`lib/docs.mjs:230`)
- Already handles UUID stripping and kebab-case normalization
- Database page filenames should use `toSlug()` from `lib/project-naming.mjs` instead — more predictable output without UUID stripping edge cases

**`formatAge(dateStr)`** (`lib/analytics.mjs:110`)
- Already returns "never" for null dates — works for "never synced" case
- Used as-is for `manifest.generated_at` → sync age display

**`atomicWriteJson(filePath, obj)`** (`lib/shared.mjs:139`)
- Atomic write via .tmp + rename
- Used by `lib/notion-config.mjs`, `lib/notebooklm-manifest.mjs`, `lib/git-scopes.mjs` — established pattern for all JSON state files

**`scoreBar(score)`** (`lib/analytics.mjs:124`)
- Not relevant for NotebookLM section — use plain numbers instead

### Established Patterns

- **Skill-first import:** `importPages()` in `lib/notion-cli.mjs:121–128` — print guidance when `fetchFn` is null; pass `fetchFn` override for testing. Database import follows the identical pattern.
- **Counter files:** No existing counter file pattern in the codebase — `lib/notebooklm-stats.mjs` establishes the first one. Shape modeled after `lib/notion-config.mjs` (versioned JSON, atomic write, silent default on absent).
- **Manifest for stats:** `manifest.generated_at` is updated on every `writeManifest()` call — reliable last-sync timestamp.
- **`projects` shape in manifest:** `manifest.projects[slug].files` is a dict of vault-relative path → `{ hash, notebook_source_id, uploaded_at }`. Source count = sum of `Object.values(manifest.projects).flatMap(p => Object.keys(p.files)).length`.

### Integration Points

- `lib/notion-cli.mjs` `importPages()` — add `--database` flag detection (D-10)
- `lib/notion-import.mjs` — add `importDatabase(databaseId, vaultDocsDir, fetchFn)` export (D-09)
- `lib/notebooklm-cli.mjs` — call `incrementQueryStats()` after `ask` and `generate` (D-16)
- `lib/analytics.mjs` `showDashboard()` — add NotebookLM section after Summary block (D-17)
- `lib/notebooklm-manifest.mjs` `ensureManifestGitignored()` — add `.notebooklm-stats.json` to managed block (D-15)

### Files to Create

| File | Purpose |
|------|---------|
| `lib/notebooklm-stats.mjs` | Query usage counter read/write (D-13, D-14) |
| `tests/notion-import-database.test.mjs` | Tests for `importDatabase()` (D-11) |
| `tests/notebooklm-stats.test.mjs` | Tests for `readQueryStats()`, `incrementQueryStats()` (D-20) |

### Files to Modify

| File | Change |
|------|--------|
| `lib/notion-import.mjs` | Add `importDatabase()` export (D-09) |
| `lib/notion-cli.mjs` | Add `--database` flag routing in `importPages()` (D-10) |
| `lib/analytics.mjs` | Add NotebookLM section to `showDashboard()` (D-17, D-18, D-19) |
| `lib/notebooklm-cli.mjs` | Call `incrementQueryStats()` after ask/generate (D-16) |
| `lib/notebooklm-manifest.mjs` | Add `.notebooklm-stats.json` to gitignore block (D-15) |

</code_context>

<specifics>
## Specific Ideas

**Suggested plan split (2 plans, independent):**
- `18-01-PLAN.md` — NOTION-01: database import (D-01..D-11)
- `18-02-PLAN.md` — ANALYTICS-01: NotebookLM stats in dashboard (D-12..D-20)

The two plans can execute in any order — no shared files except `lib/shared.mjs` (read-only).

**Success criteria checklist (from ROADMAP.md):**
1. `claude-dev-stack notion import --database <id>` saves all pages to `vault/projects/{name}/docs/notion/` with pagination
2. `claude-dev-stack analytics` shows NotebookLM sync stats (last sync, source count)
3. `claude-dev-stack analytics` shows query usage (questions, artifacts) — updated after each ask/generate
4. `claude-dev-stack analytics` shows "not configured" when NotebookLM has never been set up — no crash

</specifics>

<deferred>
## Deferred Ideas

- **Sync duration tracking** — `syncVault()` returns `durationMs` but it is not persisted to the manifest. Would require a separate stats field in the manifest or the new stats file. Deferred: not in ANALYTICS-01 success criteria.
- **Per-project query breakdown** — analytics shows total query count, not per-project. Deferred to ANALYTICS-FUT-01.
- **Analytics export to JSON/CSV** — ANALYTICS-FUT-01, explicitly out of scope for v0.11.
- **`notion-fetch` database query API shape** — actual MCP tool parameter names may differ from the generic `fetchFn` signature used here. The skill-first pattern handles this: the CLI prints guidance, the actual MCP call happens inside a Claude session where the notebooklm-importer skill has access to the real MCP tools.

</deferred>

---

*Phase: 18-notion-database-import-analytics-integration*
*Context gathered: 2026-04-13*
