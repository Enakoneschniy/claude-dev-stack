# Phase 9: Notion Auto-Import via MCP (Skill-First) - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Notion page import system: `.claude/notion_pages.json` config per project, `notion` CLI subcommands (list/add/import), `notion-importer` skill for live Claude sessions via MCP, frontmatter provenance stamps, 3-way hash overwrite protection, doctor MCP detection. `lib/notebooklm.mjs` untouched (D-03).

</domain>

<decisions>
## Implementation Decisions

### Config Schema
- **D-01:** `.claude/notion_pages.json` v1 schema: `{ version: 1, pages: [{ page_id, page_url, vault_path, refresh_strategy }] }`. Validation in `lib/notion-config.mjs`. Written via `atomicWriteJson`.
- **D-02:** URL parsing: extract page_id from `https://www.notion.so/workspace/Page-Name-{id}` — handle both dashed (8-4-4-4-12) and undashed (32 hex chars) formats. Regex extraction from last URL path segment.

### Import Mechanism
- **D-03:** Skill-first invocation: `notion-importer` skill calls `claude.ai Notion` MCP tools (`notion-fetch`) directly from live Claude session. NOT subprocess `claude mcp call`. Skill installed at `{project}/.claude/skills/notion-importer/SKILL.md`.
- **D-04:** Import target: `vault/projects/{slug}/docs/notion/{cleanNotionFilename}.md`. Reuse `cleanNotionFilename()` from `lib/docs.mjs` (extract as named export if not already).

### Overwrite Protection
- **D-05:** Every imported file gets frontmatter provenance stamp: `notion_page_id`, `notion_last_synced` (ISO), `notion_content_hash` (SHA-256 of content below frontmatter). Ships in FIRST version — never retrofitted.
- **D-06:** 3-way hash check on re-import: if local content hash ≠ stored `notion_content_hash`, write new version to `{filename}.notion-update.md` sibling + `warn()`. If hashes match (no local edits), overwrite in place. If Notion content unchanged (`notion_content_hash` matches new fetch), skip entirely (no-op).

### CLI Subcommands
- **D-07:** `claude-dev-stack notion list` — show configured pages from notion_pages.json
- **D-08:** `claude-dev-stack notion add <url> [--vault-path]` — parse URL, add to config
- **D-09:** `claude-dev-stack notion import [--page <id>]` — import all or specific page

### Doctor Integration
- **D-10:** `claude.ai Notion` MCP detection via `claude mcp list --json` → hard ERROR if missing (not silent skip). Reuse existing MCP list parsing pattern from doctor.

### Claude's Discretion
- Notion markdown fidelity edge cases (databases rendered as tables, synced blocks, mentions)
- MCP error response handling (429, auth expiry)
- `refresh_strategy` field semantics (manual/on-sync) — can be placeholder for v0.9
- Notion skill trigger description wording

</decisions>

<canonical_refs>
## Canonical References

### Existing docs module
- `lib/docs.mjs` — `cleanNotionFilename()` and `scanDir()` — extract as named exports if not already

### MCP Integration
- `lib/doctor.mjs` — existing `claude mcp list --json` pattern for MCP detection

### Config pattern
- `lib/git-scopes.mjs` — Phase 6 config read/write/validate pattern to follow for notion_pages.json

### Skill template
- `templates/skills/git-conventions/SKILL.md.tmpl` — Phase 6 parameterized skill template pattern
- `lib/project-setup.mjs` — `PROJECT_SKILLS` array for skill installation

### Test infrastructure
- `tests/helpers/fixtures.mjs` — makeTempVault, withStubBinary

### Research
- `.planning/research/FEATURES.md` — Notion MCP integration details
- `.planning/research/ARCHITECTURE.md` — Notion invocation strategy (Option B skill-driven)
- `.planning/research/PITFALLS.md` — C-4 (Notion overwrites local edits)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `atomicWriteJson()` from `lib/shared.mjs`
- `validateScopes()` pattern from `lib/git-scopes.mjs` — reuse for notion config validation
- `installSkill()` from `lib/git-scopes.mjs` — pattern for notion-importer skill install
- `cleanNotionFilename()` from `lib/docs.mjs` — already exists, may need export

### Integration Points
- `bin/cli.mjs` — add `notion` subcommand routing
- `lib/project-setup.mjs` — add `notion-importer` to PROJECT_SKILLS
- `lib/doctor.mjs` — add Notion MCP section

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond ROADMAP locked decisions.

</specifics>

<deferred>
## Deferred Ideas

None — all Phase 9 scope from ROADMAP.

</deferred>

---

*Phase: 09-notion-auto-import-via-mcp-skill-first*
*Context gathered: 2026-04-12 (recommended defaults accepted)*
