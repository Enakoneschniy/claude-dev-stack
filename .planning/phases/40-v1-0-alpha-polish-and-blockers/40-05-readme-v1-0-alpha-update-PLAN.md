---
plan_id: 40-05-readme-v1-0-alpha-update
phase: 40
plan: 05
type: execute
wave: 3
depends_on: ["01", "02", "03", "04"]
files_modified:
  - README.md
autonomous: true
requirements:
  - README-V1-UPDATE
user_setup: []
must_haves:
  truths:
    - "README.md has a new top section '### v1.0.0-alpha.1 (Pre-release)' placed ABOVE the existing '## Quick Start' section"
    - "The v1.0 section includes the install command `npm install -g claude-dev-stack@alpha`"
    - "The v1.0 section links to `docs/migration-v0-to-v1-alpha.md`"
    - "The v1.0 section links to `CHANGELOG.md`"
    - "Existing v0.12 content is NOT removed — alpha has not replaced latest yet per D-130"
    - "The v1.0 section mentions the key new features: auto session capture, SQLite memory, MCP adapter, `/cds-quick`"
  artifacts:
    - path: "README.md"
      provides: "Updated README with v1.0.0-alpha.1 pre-release section at the top"
      contains: "v1.0.0-alpha.1"
  key_links:
    - from: "README.md v1.0 section"
      to: "docs/migration-v0-to-v1-alpha.md"
      via: "relative markdown link"
      pattern: "migration-v0-to-v1-alpha"
    - from: "README.md v1.0 section"
      to: "CHANGELOG.md"
      via: "relative markdown link"
      pattern: "CHANGELOG.md"
---

<objective>
Add a v1.0.0-alpha.1 pre-release section to the top of README.md per D-130. The section is ADDITIVE — existing v0.12 content stays intact because the alpha has not replaced `@latest` on npm yet. The section gives early adopters the install command, links to the migration guide and CHANGELOG, and highlights the key features.

Purpose: satisfy Phase 40 SC#4 ("README front-matter mentions v1.0.0-alpha.1 install instructions").

Output: 1 modified file (README.md).

response_language: ru — README content on English, общение в чате на русском.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md
@./CLAUDE.md
@./README.md
@./CHANGELOG.md
@./docs/migration-v0-to-v1-alpha.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Insert v1.0.0-alpha.1 pre-release section into README.md</name>
  <read_first>
    - README.md (full current file — need to identify exact insertion point)
    - CHANGELOG.md (cross-reference for consistency)
    - docs/migration-v0-to-v1-alpha.md (first 10 lines — cross-link target)
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md §D-130
  </read_first>
  <files>
    - README.md (modify)
  </files>
  <action>
  Read README.md to find the exact line of `---` (horizontal rule) that appears after the badges block. Insert the new section BETWEEN the badges block and the `---` separator (or between `---` and `## The Problem` — whichever placement makes the v1.0 section the first content users see after badges).

  Insert this block:

  ```markdown
  ## v1.0.0-alpha.1 (Pre-release)

  > **Alpha channel** — install via `npm install -g claude-dev-stack@alpha`. The stable `@latest` tag (v0.12.x) is unchanged.

  v1.0 introduces the **CDS-Core** architecture: a pnpm monorepo with Claude Agent SDK integration, SQLite session memory, and automatic session capture.

  **What's new in alpha:**

  - **Auto session capture** — sessions are automatically saved to a per-project SQLite database. No more `/end` required.
  - **SQLite memory layer** — FTS5 full-text search over session observations, entities, and relations.
  - **MCP adapter** — `sessions.search`, `docs.search`, `planning.status` tools available directly inside Claude Code.
  - **`/cds-quick`** — one-shot agent dispatch with cost reporting.
  - **Backfill migration** — `claude-dev-stack migrate sessions` ports historical markdown sessions into SQLite.
  - **CC 2.x permission hardening** — `claude-dev-stack doctor --gsd-permissions` configures the GSD executor allowlist.

  **Links:**
  - [Migration guide](./docs/migration-v0-to-v1-alpha.md) — breaking changes + rollback instructions
  - [Changelog](./CHANGELOG.md) — full list of additions, changes, deprecations

  **Requirements:** Node 20+ (Node 18 no longer supported). See the [migration guide](./docs/migration-v0-to-v1-alpha.md#node-18--node-20) for details.

  ---
  ```

  Place this AFTER the badges row and the first `---` separator, and BEFORE `## The Problem`. The section serves as a forward-looking banner that early adopters see first; the existing v0.12 Quick Start documentation remains below for `@latest` users.

  Do NOT remove, rewrite, or reorder any existing sections. The only change is the insertion of the block above.
  </action>
  <verify>
    <automated>grep -q "v1.0.0-alpha.1" README.md && grep -q "migration-v0-to-v1-alpha" README.md && grep -q "CHANGELOG.md" README.md && grep -q "claude-dev-stack@alpha" README.md && grep -q "## The Problem" README.md && grep -q "## Quick Start" README.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "v1.0.0-alpha.1" README.md` -> >= 1
    - `grep -c "claude-dev-stack@alpha" README.md` -> >= 1
    - `grep -c "migration-v0-to-v1-alpha" README.md` -> >= 1
    - `grep -c "CHANGELOG.md" README.md` -> >= 1
    - `grep -c "## The Problem" README.md` -> 1 (existing section preserved)
    - `grep -c "## Quick Start" README.md` -> 1 (existing section preserved)
    - `grep -c "gsd-permissions" README.md` -> >= 1 (doctor flag mentioned)
    - `grep -c "Auto session capture" README.md` -> >= 1
    - `grep -c "SQLite" README.md` -> >= 1
    - `wc -l README.md | awk '{print $1}'` -> (original line count + ~25)
  </acceptance_criteria>
  <done>
  README.md has v1.0.0-alpha.1 section at top with install command, migration guide link, CHANGELOG link, and key features. All existing sections are unchanged.
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. All cross-references resolve
test -f docs/migration-v0-to-v1-alpha.md
test -f CHANGELOG.md

# 2. v1.0 section is present
grep "v1.0.0-alpha.1" README.md

# 3. No existing sections removed
grep "## The Problem" README.md
grep "## Quick Start" README.md
grep "## Use Cases" README.md

# 4. Links are valid relative paths
grep "migration-v0-to-v1-alpha.md" README.md
grep "CHANGELOG.md" README.md
```
</verification>
</content>
</invoke>