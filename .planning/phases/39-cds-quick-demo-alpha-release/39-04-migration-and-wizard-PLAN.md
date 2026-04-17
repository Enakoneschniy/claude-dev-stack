---
plan_id: 39-04-migration-and-wizard
phase: 39
plan: 04
type: execute
wave: 3
depends_on: ["01"]
files_modified:
  - docs/migration-v0-to-v1-alpha.md
  - CHANGELOG.md
  - lib/install/node-check.mjs
  - lib/install/hooks.mjs
  - bin/install.mjs
  - tests/migration-guide.test.mjs
  - tests/changelog.test.mjs
  - tests/install-node-check.test.mjs
  - tests/install-hook-migration.test.mjs
autonomous: true
requirements:
  - RELEASE-01
user_setup: []
must_haves:
  truths:
    - "`docs/migration-v0-to-v1-alpha.md` exists with top-level sections `## Quick checklist`, `## Breaking Changes`, `## Rollback`"
    - "Migration guide documents Node 18 -> 20+ break, session-end-check -> session-end-capture hook rename, new mcp.servers.cds entry, new runtime deps, /end skill fallback-only"
    - "`CHANGELOG.md` has `## [1.0.0-alpha.1]` section with subsections Added, Changed, Deprecated, Removed, Security"
    - "`lib/install/node-check.mjs` exports `assertNodeVersion(minMajor: number): void` — throws if `process.versions.node` major < minMajor; wired into `bin/install.mjs` as the first step"
    - "`lib/install/hooks.mjs` detects existing `session-end-check.sh` Stop hook registration and prompts user to replace (via prompts lib), preserving user-added custom entries with a warning"
    - "Phase 36 D-69 idempotency preserved: re-running wizard on a project with session-end-capture.sh already registered makes no changes"
    - "Wizard is idempotent in both directions: new project (adds capture hook) + already-migrated project (no-op)"
    - "All 4 new test files pass: migration-guide, changelog, install-node-check, install-hook-migration"
  artifacts:
    - path: "docs/migration-v0-to-v1-alpha.md"
      provides: "Tiered migration guide per D-120"
      contains: "Quick checklist"
      min_lines: 80
    - path: "CHANGELOG.md"
      provides: "Versioned changelog with 1.0.0-alpha.1 entry per Keep-a-Changelog"
      contains: "1.0.0-alpha.1"
      min_lines: 40
    - path: "lib/install/node-check.mjs"
      provides: "assertNodeVersion helper for wizard startup guard"
      contains: "assertNodeVersion"
      min_lines: 25
    - path: "lib/install/hooks.mjs"
      provides: "Updated hook-registration logic with session-end-check -> session-end-capture migration"
      contains: "session-end-capture"
    - path: "bin/install.mjs"
      provides: "Wizard pipeline with Node check as first step + hook migration call"
      contains: "assertNodeVersion"
    - path: "tests/migration-guide.test.mjs"
      provides: "Structural assertions on migration guide headings + content"
      contains: "Quick checklist"
    - path: "tests/changelog.test.mjs"
      provides: "Asserts CHANGELOG.md has 1.0.0-alpha.1 entry with Keep-a-Changelog sections"
      contains: "1.0.0-alpha.1"
    - path: "tests/install-node-check.test.mjs"
      provides: "Unit test: assertNodeVersion throws on Node 18, passes on Node 20+"
      contains: "assertNodeVersion"
    - path: "tests/install-hook-migration.test.mjs"
      provides: "Unit test: hooks.mjs replaces session-end-check.sh; idempotent on capture.sh; warns on custom entries"
      contains: "session-end-check"
  key_links:
    - from: "lib/install/node-check.mjs assertNodeVersion"
      to: "bin/install.mjs (first wizard step)"
      via: "named import — throws before any side effects"
      pattern: "assertNodeVersion"
    - from: "lib/install/hooks.mjs"
      to: ".claude/settings.json each project's Stop hooks list"
      via: "merge/replace session-end-check.sh entry with session-end-capture.sh"
      pattern: "session-end-capture.sh"
    - from: "docs/migration-v0-to-v1-alpha.md"
      to: "README.md + CHANGELOG.md"
      via: "cross-link from release notes"
      pattern: "migration-v0-to-v1-alpha"
---

<objective>
Ship the tiered migration guide (D-120), CHANGELOG.md initial entry, and two wizard hardenings: (1) Node version assertion at install start (D-121), (2) Stop-hook migration from `session-end-check.sh` to `session-end-capture.sh` with user confirmation + preservation of custom entries (D-121 + Phase 36 D-69 integration).

Purpose: satisfy RELEASE-01 documentation deliverable (SC#3) + install-time user safety net.

Output: 2 docs + 1 new wizard module + modifications to 2 existing wizard files + 4 test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md
@./lib/install/hooks.mjs
@./bin/install.mjs

<interfaces>
Existing wizard structure (post Phase 36 + Phase 37):
- `bin/install.mjs` — top-level entry, orchestrates steps
- `lib/install/hooks.mjs` — registers Stop + SessionStart hooks in each project's .claude/settings.json (Phase 36 added session-end-capture.sh replacement logic; Phase 37 added mcp.servers.cds entry via `lib/install/mcp.mjs`)
- `lib/install/mcp.mjs` — Phase 37 artifact, registers MCP servers

Plan 04 adds:
- `lib/install/node-check.mjs` — NEW module with the single function `assertNodeVersion(minMajor: number): void`
- Modifies `bin/install.mjs` to call `assertNodeVersion(20)` as the very first step, before any file I/O or prompts

The Node check is a hard abort — it throws, which bubbles up and terminates the wizard with exit 1. This is intentional: users on Node 18 SHOULD fail loud, not install a broken setup.

Stop hook migration logic (in lib/install/hooks.mjs — builds on Phase 36 D-69):
```
For each project's .claude/settings.json:
  if hooks.Stop contains session-end-check.sh AND does NOT contain session-end-capture.sh:
    Prompt user (prompts lib): "Detected old Stop hook in {project}. Replace with auto-capture? (Y/n)"
    If accepted:
      Remove session-end-check.sh entry
      Add session-end-capture.sh entry
      Write back settings.json (preserve all other fields)
    If declined: skip this project, continue to next
  Else if hooks.Stop contains session-end-capture.sh: no-op (idempotent)
  Else if hooks.Stop contains custom user-added entries (other .sh files):
    Print warning: "⚠ Custom Stop hooks detected in {project} — auto-capture added alongside. Review for conflicts."
    Add session-end-capture.sh as additional entry (don't replace)
```

User prompt library: `prompts` (existing Phase 1+ dep).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create docs/migration-v0-to-v1-alpha.md</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"docs/migration-v0-to-v1-alpha.md"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-120"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 7 (referenced structure)
  </read_first>
  <files>
    - docs/migration-v0-to-v1-alpha.md (new)
  </files>
  <action>
  Create `docs/migration-v0-to-v1-alpha.md` with the content from PATTERNS.md §"docs/migration-v0-to-v1-alpha.md" (full text). The guide must have three top-level sections in order:

  1. `## Quick checklist` — 6 bullets, <2 min read
  2. `## Breaking Changes` — 6 sub-sections: Node 18 -> 20, Stop hook rename, MCP server registration, new runtime deps, /end fallback-only, native compile note
  3. `## Rollback` — `npm install -g claude-dev-stack@latest` + notes

  Plus a short `## Feedback` section at the end mentioning the GitHub issues link.

  Copy the full content from PATTERNS.md §"docs/migration-v0-to-v1-alpha.md" verbatim. No paraphrasing — the structure and wording is specified there.
  </action>
  <verify>
    <automated>test -f docs/migration-v0-to-v1-alpha.md && grep -q "^## Quick checklist$" docs/migration-v0-to-v1-alpha.md && grep -q "^## Breaking Changes$" docs/migration-v0-to-v1-alpha.md && grep -q "^## Rollback$" docs/migration-v0-to-v1-alpha.md && grep -q "Node 18" docs/migration-v0-to-v1-alpha.md && grep -q "session-end-capture" docs/migration-v0-to-v1-alpha.md && grep -q "better-sqlite3" docs/migration-v0-to-v1-alpha.md && grep -q "mcp.servers.cds" docs/migration-v0-to-v1-alpha.md && grep -q '@latest' docs/migration-v0-to-v1-alpha.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f docs/migration-v0-to-v1-alpha.md` -> exits 0
    - `grep -c "^## Quick checklist" docs/migration-v0-to-v1-alpha.md` -> 1
    - `grep -c "^## Breaking Changes" docs/migration-v0-to-v1-alpha.md` -> 1
    - `grep -c "^## Rollback" docs/migration-v0-to-v1-alpha.md` -> 1
    - `grep -c "Node 18" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "Node 20" docs/migration-v0-to-v1-alpha.md` -> >= 2
    - `grep -c "session-end-capture" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "session-end-check" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "better-sqlite3" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "mcp.servers.cds" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "@latest" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `grep -c "@alpha" docs/migration-v0-to-v1-alpha.md` -> >= 1
    - `wc -l docs/migration-v0-to-v1-alpha.md | awk '{print $1}'` -> >= 80
  </acceptance_criteria>
  <done>
  Migration guide exists with 3 required sections + covers all 6 breaking changes + rollback instructions.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create CHANGELOG.md</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 7
  </read_first>
  <files>
    - CHANGELOG.md (new)
  </files>
  <action>
  Create `CHANGELOG.md` at repo root with EXACTLY the following content:

  ```markdown
  # Changelog

  All notable changes to `claude-dev-stack` are documented in this file.

  The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
  and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

  ## [1.0.0-alpha.1] — 2026-04-16

  First alpha release of v1.0 — "CDS-Core Independence." Installable via
  `npm install claude-dev-stack@alpha`. Does not disturb existing v0.12.x users on `@latest`.

  See [migration guide](./docs/migration-v0-to-v1-alpha.md) for full breaking-change details.

  ### Added

  - pnpm monorepo scaffolding: `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`
    (SEED-002, Phase 33)
  - Claude Agent SDK integration via `dispatchAgent` primitive — replaces the `claude -p --bare`
    subprocess pattern (CAPTURE-05 closure of v0.12 ADR-02 Known Gap, Phase 34)
  - Tiered vault: SQLite Tier 2 with FTS5 full-text search on observations (SEED-004, Phase 35)
  - Auto session capture — `hooks/session-end-capture.mjs` Stop hook consolidates 4 prior behaviors
    (log-check, context.md update, NotebookLM sync, vault auto-push) into a single Node hook
    (Phase 36)
  - MCP adapter exposing `sessions.search`, `sessions.timeline`, `sessions.get_observations`,
    `docs.search`, `planning.status` tools to Claude Code (MCP-01/02, Phase 37)
  - `claude-dev-stack migrate sessions` CLI subcommand — ports historical markdown sessions to
    SQLite via Haiku extraction (MIGRATE-01/02, Phase 38)
  - `/cds-quick "<task>"` Claude Code skill + `claude-dev-stack quick` CLI subcommand — one-shot
    agent dispatch with cost reporting (DEMO-01, Phase 39)
  - tsup bundler producing `dist/` from `packages/cds-*/src/*.ts` with three externals:
    `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` (Phase 39)
  - GitHub Actions publish workflow with automatic dist-tag selection: prerelease -> `alpha`,
    stable -> `latest`. OIDC Trusted Publishing preserved (Phase 39)

  ### Changed

  - **BREAKING:** Minimum Node version bumped from 18 to 20 (Node 18 EOL + `better-sqlite3` 12.x
    N-API 9 requirement)
  - **BREAKING:** `session-end-check.sh` Stop hook replaced by `session-end-capture.sh` (new
    consolidated auto-capture wrapper; wizard prompts for migration on existing projects)
  - `/end` skill description narrowed: "fallback only (auto-capture replaces routine use)"
  - Install wizard now writes `mcp.servers.cds` entry to each configured project's
    `.claude/settings.json`
  - Root `package.json` single-dep constraint relaxed: adds `better-sqlite3`,
    `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` as runtime deps
  - Root `package.json` `"files"` array ships `dist/` (bundled output) — `packages/` is NOT in
    the tarball
  - Root `package.json` `scripts.build` is now `tsup` (was `tsc --build`); `scripts.typecheck`
    is the new home for `tsc --build`

  ### Deprecated

  - None. v0.12.x remains `@latest` on npm until 1.0.0 GA graduates.

  ### Removed

  - None in this release. Legacy `session-end-check.sh` is still available for rollback users
    but is no longer installed by the wizard.

  ### Security

  - Migration preserves markdown sessions as the source of truth. SQLite (`sessions.db`) is
    derived and can be rebuilt from markdown via `claude-dev-stack migrate sessions`.
  - No secret storage introduced. `ANTHROPIC_API_KEY` continues to be read from env only
    (Claude Agent SDK handles it internally).
  - GitHub Actions `publish.yml` preserves OIDC Trusted Publishing (`id-token: write` +
    `--provenance`); no long-lived npm tokens stored.

  ---

  [1.0.0-alpha.1]: https://github.com/Enakoneschniy/claude-dev-stack/releases/tag/v1.0.0-alpha.1
  ```
  </action>
  <verify>
    <automated>test -f CHANGELOG.md && grep -q "^## \[1.0.0-alpha.1\]" CHANGELOG.md && grep -q "^### Added$" CHANGELOG.md && grep -q "^### Changed$" CHANGELOG.md && grep -q "^### Deprecated$" CHANGELOG.md && grep -q "^### Removed$" CHANGELOG.md && grep -q "^### Security$" CHANGELOG.md && grep -q "Keep a Changelog" CHANGELOG.md && grep -q "migration-v0-to-v1-alpha" CHANGELOG.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f CHANGELOG.md` -> exits 0
    - `grep -c "^## \[1.0.0-alpha.1\]" CHANGELOG.md` -> 1
    - `grep -c "^### Added" CHANGELOG.md` -> 1
    - `grep -c "^### Changed" CHANGELOG.md` -> 1
    - `grep -c "^### Deprecated" CHANGELOG.md` -> 1
    - `grep -c "^### Removed" CHANGELOG.md` -> 1
    - `grep -c "^### Security" CHANGELOG.md` -> 1
    - `grep -c "Keep a Changelog" CHANGELOG.md` -> 1
    - `grep -c "migration-v0-to-v1-alpha" CHANGELOG.md` -> >= 1
    - `wc -l CHANGELOG.md | awk '{print $1}'` -> >= 40
  </acceptance_criteria>
  <done>
  CHANGELOG.md exists with Keep-a-Changelog format + 1.0.0-alpha.1 entry with all 5 required sections.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create lib/install/node-check.mjs</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-121"
    - ./lib/install/ (existing directory layout)
  </read_first>
  <files>
    - lib/install/node-check.mjs (new)
  </files>
  <action>
  Create `lib/install/node-check.mjs`:

  ```js
  // lib/install/node-check.mjs
  // Wizard startup guard — assert runtime Node major version >= minMajor.
  // Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-121
  //
  // Throws a descriptive error if the runtime is too old, routing users to either upgrade
  // Node or install the legacy @latest (v0.12.x) which still supports Node 18.

  /**
   * Parse the current Node runtime's major version.
   * @returns {number} major version integer, e.g. 20
   */
  export function currentNodeMajor() {
    const full = process.versions.node; // e.g. '20.11.0'
    const major = Number(full.split('.')[0]);
    if (!Number.isFinite(major)) {
      throw new Error(`Unable to parse Node version: ${full}`);
    }
    return major;
  }

  /**
   * Assert that the runtime Node major version is at least `minMajor`.
   * Prints a help-text error message to stderr and throws so the wizard aborts cleanly.
   *
   * @param {number} minMajor - e.g. 20
   * @throws {Error} if runtime major < minMajor
   */
  export function assertNodeVersion(minMajor) {
    const current = currentNodeMajor();
    if (current >= minMajor) return;

    const msg = [
      '',
      `  \x1b[31m⚠ Node ${process.versions.node} is too old for claude-dev-stack@1.0.0-alpha.1\x1b[0m`,
      `  Required: Node ${minMajor}+`,
      '',
      '  Options:',
      `    1. Upgrade Node: \x1b[36mnvm install ${minMajor}\x1b[0m`,
      `    2. Install legacy: \x1b[36mnpm install -g claude-dev-stack@latest\x1b[0m (v0.12.x, supports Node 18)`,
      '',
      '  See: docs/migration-v0-to-v1-alpha.md#node-18--node-20',
      '',
    ].join('\n');

    process.stderr.write(msg);
    throw new Error(`Node ${minMajor}+ required, got ${process.versions.node}`);
  }
  ```
  </action>
  <verify>
    <automated>test -f lib/install/node-check.mjs && grep -q "export function assertNodeVersion" lib/install/node-check.mjs && grep -q "export function currentNodeMajor" lib/install/node-check.mjs && grep -q "nvm install" lib/install/node-check.mjs && grep -q "claude-dev-stack@latest" lib/install/node-check.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `test -f lib/install/node-check.mjs` -> exits 0
    - `grep -c "export function assertNodeVersion" lib/install/node-check.mjs` -> 1
    - `grep -c "export function currentNodeMajor" lib/install/node-check.mjs` -> 1
    - `grep -c "process.versions.node" lib/install/node-check.mjs` -> >= 1
    - `grep -c "nvm install" lib/install/node-check.mjs` -> 1
    - `grep -c "claude-dev-stack@latest" lib/install/node-check.mjs` -> 1
    - `node --check lib/install/node-check.mjs` -> exits 0
  </acceptance_criteria>
  <done>
  node-check.mjs exports assertNodeVersion + currentNodeMajor helpers. Throws with actionable error on too-old Node.
  </done>
</task>

<task type="auto">
  <name>Task 4: Wire assertNodeVersion into bin/install.mjs</name>
  <read_first>
    - ./bin/install.mjs (current — main wizard entry)
    - ./lib/install/node-check.mjs (created in Task 3)
  </read_first>
  <files>
    - bin/install.mjs (modified in-place)
  </files>
  <action>
  Modify `bin/install.mjs` to call `assertNodeVersion(20)` as the first executable step of the wizard — BEFORE any file reads, prompts, or network calls.

  Precise edit: find the default export / main function (likely `async function main()` or `export default async function`) and add at the very top of its body:

  ```js
  import { assertNodeVersion } from '../lib/install/node-check.mjs';
  ```
  at the top of the file if not already there, then inside the main function:

  ```js
  // Node 20+ required for claude-dev-stack@1.0.0-alpha.1 (better-sqlite3 12.x requirement).
  // Throws with actionable error + rollback path if too old.
  assertNodeVersion(20);
  ```

  This MUST be the first statement inside the main entry. No side effects before this check.

  If the existing code has `const prompts = require('prompts')` or similar at the top of main, move the Node check ABOVE it so we don't waste time loading prompts on Node 18.

  The check is synchronous and throws; the existing error-handling path in `bin/cli.mjs` (the `.catch()` at the bottom) prints the error message and exits 1.
  </action>
  <verify>
    <automated>grep -q "assertNodeVersion" bin/install.mjs && grep -q "from '../lib/install/node-check.mjs'" bin/install.mjs && node --check bin/install.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "assertNodeVersion" bin/install.mjs` -> >= 2 (import + call)
    - `grep -c "from '../lib/install/node-check.mjs'" bin/install.mjs` -> 1
    - `grep -c "assertNodeVersion(20)" bin/install.mjs` -> 1
    - `node --check bin/install.mjs` -> exits 0
    - The `assertNodeVersion(20)` call appears BEFORE any `await prompts(...)` or file-I/O call in the main function body
  </acceptance_criteria>
  <done>
  Wizard now aborts with actionable error message on Node < 20 before any side effects.
  </done>
</task>

<task type="auto">
  <name>Task 5: Update lib/install/hooks.mjs with session-end-check -> session-end-capture migration</name>
  <read_first>
    - ./lib/install/hooks.mjs (current)
    - .planning/phases/36-auto-session-capture/36-CONTEXT.md §"D-69" (idempotency + custom-entry preservation)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-121"
  </read_first>
  <files>
    - lib/install/hooks.mjs (modified)
  </files>
  <action>
  Ensure `lib/install/hooks.mjs` has the Phase 36 D-69 logic hardened for Phase 39 alpha migration. If Phase 36 already added the full logic, Task 5 adds ONLY the Phase 39 delta: confirmation prompt + warning when old-hook removal would destroy custom entries.

  Exact modification intent (the file may already have the migration code from Phase 36 — this task hardens it):

  Read `lib/install/hooks.mjs`. Find the Stop hook registration function. Ensure it contains the following pseudo-logic:

  ```js
  import prompts from 'prompts';

  async function registerCaptureHook(projectPath, settings) {
    const stopHooks = settings?.hooks?.Stop ?? [];
    const hasOldHook = stopHooks.some((h) => /session-end-check\.sh/.test(h.command || ''));
    const hasNewHook = stopHooks.some((h) => /session-end-capture\.sh/.test(h.command || ''));
    const customHooks = stopHooks.filter((h) => {
      const cmd = h.command || '';
      return !/session-end-(check|capture)\.sh/.test(cmd);
    });

    if (hasNewHook && !hasOldHook) {
      // Already migrated — no-op (idempotent)
      return { action: 'noop', project: projectPath };
    }

    if (customHooks.length > 0) {
      console.warn(
        `  \x1b[33mℹ Custom Stop hooks detected in ${projectPath}/.claude/settings.json — auto-capture will be added alongside. Review for conflicts.\x1b[0m`,
      );
    }

    if (hasOldHook) {
      // Phase 39 D-121 user confirmation
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: `Replace legacy session-end-check.sh with auto-capture in ${projectPath}?`,
        initial: true,
      });
      if (!proceed) {
        return { action: 'skipped', project: projectPath };
      }
    }

    // Add session-end-capture.sh entry + remove session-end-check.sh (if present); preserve customHooks
    const newStopList = [
      ...customHooks,
      { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-capture.sh' }] },
    ];
    settings.hooks = { ...(settings.hooks ?? {}), Stop: newStopList };
    return { action: hasOldHook ? 'migrated' : 'added', project: projectPath };
  }
  ```

  **Key operational points:**

  1. **Idempotency (Phase 36 D-69):** if capture.sh already registered AND check.sh absent, return `noop`.
  2. **Custom-entry preservation:** collect user-added Stop hooks into `customHooks`, append them to the new list so nothing is destroyed.
  3. **Confirmation (Phase 39 D-121):** only prompt when check.sh is present (first-migration). Subsequent runs skip the prompt.
  4. **Warning on custom entries:** non-fatal stderr line visible to user.

  Do NOT change function signatures that other wizard code calls. If the current `lib/install/hooks.mjs` exports a different-shaped function, wrap the new logic inside it.

  If the file doesn't exist, create it with the same shape as shown above + wire it into whatever function `bin/install.mjs` currently uses to loop over projects.
  </action>
  <verify>
    <automated>grep -q "session-end-capture" lib/install/hooks.mjs && grep -q "session-end-check" lib/install/hooks.mjs && grep -q "custom" lib/install/hooks.mjs && grep -q "prompts" lib/install/hooks.mjs && node --check lib/install/hooks.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "session-end-capture" lib/install/hooks.mjs` -> >= 2
    - `grep -c "session-end-check" lib/install/hooks.mjs` -> >= 1
    - `grep -c "prompts" lib/install/hooks.mjs` -> >= 1 (import)
    - `grep -c "customHooks" lib/install/hooks.mjs` -> >= 1 (or equivalent variable name)
    - `grep -c "Replace legacy" lib/install/hooks.mjs` -> 1 (confirmation prompt text)
    - `node --check lib/install/hooks.mjs` -> exits 0
  </acceptance_criteria>
  <done>
  Hooks wizard handles all 4 scenarios: old->new migration (with confirmation), already-migrated (no-op), custom-entries (warn + add alongside), fresh install (add new hook).
  </done>
</task>

<task type="auto">
  <name>Task 6: Create tests/migration-guide.test.mjs</name>
  <read_first>
    - ./docs/migration-v0-to-v1-alpha.md (created in Task 1)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-04-01, 39-04-02
  </read_first>
  <files>
    - tests/migration-guide.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/migration-guide.test.mjs
  // Structural assertions on docs/migration-v0-to-v1-alpha.md.
  // Source: Phase 39 VALIDATION §Task 39-04-01, 39-04-02
  import { describe, it, expect } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const guidePath = path.join(__dirname, '..', 'docs', 'migration-v0-to-v1-alpha.md');

  describe('docs/migration-v0-to-v1-alpha.md', () => {
    it('file exists', () => {
      expect(existsSync(guidePath)).toBe(true);
    });

    const content = existsSync(guidePath) ? readFileSync(guidePath, 'utf8') : '';

    describe('required sections', () => {
      it('has "## Quick checklist" top-level section', () => {
        expect(content).toMatch(/^## Quick checklist$/m);
      });

      it('has "## Breaking Changes" top-level section', () => {
        expect(content).toMatch(/^## Breaking Changes$/m);
      });

      it('has "## Rollback" top-level section', () => {
        expect(content).toMatch(/^## Rollback$/m);
      });

      it('sections appear in the correct order', () => {
        const quickIdx = content.indexOf('## Quick checklist');
        const breakingIdx = content.indexOf('## Breaking Changes');
        const rollbackIdx = content.indexOf('## Rollback');
        expect(quickIdx).toBeGreaterThan(0);
        expect(breakingIdx).toBeGreaterThan(quickIdx);
        expect(rollbackIdx).toBeGreaterThan(breakingIdx);
      });
    });

    describe('breaking changes content', () => {
      it('mentions Node 18 -> Node 20 upgrade', () => {
        expect(content).toMatch(/Node 18/);
        expect(content).toMatch(/Node 20/);
      });

      it('mentions session-end-capture hook rename', () => {
        expect(content).toMatch(/session-end-check/);
        expect(content).toMatch(/session-end-capture/);
      });

      it('mentions the new SQLite dependency (better-sqlite3)', () => {
        expect(content).toMatch(/better-sqlite3/);
      });

      it('mentions the new MCP server entry mcp.servers.cds', () => {
        expect(content).toMatch(/mcp\.servers\.cds/);
      });

      it('mentions /end skill is fallback-only now', () => {
        expect(content).toMatch(/\/end/);
        expect(content.toLowerCase()).toMatch(/fallback/);
      });
    });

    describe('rollback content', () => {
      it('references npm install claude-dev-stack@latest for rollback', () => {
        expect(content).toMatch(/npm install\s+-g\s+claude-dev-stack@latest/);
      });

      it('preserves markdown sessions as source of truth', () => {
        expect(content.toLowerCase()).toMatch(/markdown/);
        expect(content.toLowerCase()).toMatch(/source of truth/);
      });
    });

    describe('quick checklist content', () => {
      it('contains at least 5 checkbox items', () => {
        const checkboxCount = (content.match(/^- \[ \]/gm) ?? []).length;
        expect(checkboxCount).toBeGreaterThanOrEqual(5);
      });
    });

    it('is substantial (>= 80 lines)', () => {
      const lineCount = content.split('\n').length;
      expect(lineCount).toBeGreaterThanOrEqual(80);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/migration-guide.test.mjs && pnpm -w vitest run --project root tests/migration-guide.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/migration-guide.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/migration-guide.test.mjs` -> exits 0 + all tests pass (~12 tests)
  </acceptance_criteria>
  <done>
  Migration guide structural + content tests pass: 3 sections, 5 breaking changes, rollback, checklist present.
  </done>
</task>

<task type="auto">
  <name>Task 7: Create tests/changelog.test.mjs</name>
  <read_first>
    - ./CHANGELOG.md (created in Task 2)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-04-05
  </read_first>
  <files>
    - tests/changelog.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/changelog.test.mjs
  // Asserts CHANGELOG.md has the 1.0.0-alpha.1 entry per Keep-a-Changelog.
  // Source: Phase 39 VALIDATION §Task 39-04-05
  import { describe, it, expect } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

  describe('CHANGELOG.md', () => {
    it('file exists', () => {
      expect(existsSync(changelogPath)).toBe(true);
    });

    const content = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';

    it('declares Keep-a-Changelog format', () => {
      expect(content).toMatch(/Keep a Changelog/);
    });

    it('has 1.0.0-alpha.1 section header', () => {
      expect(content).toMatch(/^## \[1\.0\.0-alpha\.1\]/m);
    });

    it('has all 5 Keep-a-Changelog subsections for 1.0.0-alpha.1', () => {
      expect(content).toMatch(/^### Added$/m);
      expect(content).toMatch(/^### Changed$/m);
      expect(content).toMatch(/^### Deprecated$/m);
      expect(content).toMatch(/^### Removed$/m);
      expect(content).toMatch(/^### Security$/m);
    });

    it('Added section references the major features', () => {
      expect(content).toMatch(/pnpm monorepo/);
      expect(content).toMatch(/Claude Agent SDK/);
      expect(content).toMatch(/SQLite/);
      expect(content).toMatch(/session-end-capture/);
      expect(content).toMatch(/MCP adapter/);
      expect(content).toMatch(/\/cds-quick/);
    });

    it('Changed section documents breaking changes', () => {
      expect(content).toMatch(/BREAKING/);
      expect(content).toMatch(/Node/);
    });

    it('links migration guide', () => {
      expect(content).toMatch(/migration-v0-to-v1-alpha/);
    });

    it('has a footer link for 1.0.0-alpha.1', () => {
      expect(content).toMatch(/\[1\.0\.0-alpha\.1\]:\s+https:\/\/github\.com/);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/changelog.test.mjs && pnpm -w vitest run --project root tests/changelog.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/changelog.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/changelog.test.mjs` -> exits 0 + all 8 tests pass
  </acceptance_criteria>
  <done>
  CHANGELOG tests pass — Keep-a-Changelog format + 1.0.0-alpha.1 entry + all 5 subsections + content spot-checks.
  </done>
</task>

<task type="auto">
  <name>Task 8: Create tests/install-node-check.test.mjs</name>
  <read_first>
    - ./lib/install/node-check.mjs (Task 3)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-04-03
  </read_first>
  <files>
    - tests/install-node-check.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/install-node-check.test.mjs
  // Unit tests for lib/install/node-check.mjs.
  // Source: Phase 39 VALIDATION §Task 39-04-03
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import { assertNodeVersion, currentNodeMajor } from '../lib/install/node-check.mjs';

  describe('currentNodeMajor', () => {
    it('returns an integer >= 20 on the test runner (since Plan 01 bumps engines.node >=20)', () => {
      const v = currentNodeMajor();
      expect(v).toBeGreaterThanOrEqual(20);
    });
  });

  describe('assertNodeVersion', () => {
    let stderrSpy;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('does not throw when runtime Node >= minMajor', () => {
      expect(() => assertNodeVersion(20)).not.toThrow();
    });

    it('does not throw when minMajor equals runtime', () => {
      expect(() => assertNodeVersion(currentNodeMajor())).not.toThrow();
    });

    it('throws with actionable message when minMajor > runtime', () => {
      // Request 99 — runtime can never be that high in practice.
      expect(() => assertNodeVersion(99)).toThrow(/Node 99\+ required/);
    });

    it('prints actionable message with nvm install + @latest fallback', () => {
      try {
        assertNodeVersion(99);
      } catch {
        // expected
      }
      const msg = stderrSpy.mock.calls.flat().join('');
      expect(msg).toMatch(/nvm install/);
      expect(msg).toMatch(/claude-dev-stack@latest/);
      expect(msg).toMatch(/migration-v0-to-v1-alpha/);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/install-node-check.test.mjs && pnpm -w vitest run --project root tests/install-node-check.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/install-node-check.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/install-node-check.test.mjs` -> exits 0 + all 5 tests pass
  </acceptance_criteria>
  <done>
  Node-check tests pass: happy path + error path + message contents (nvm, @latest, migration link).
  </done>
</task>

<task type="auto">
  <name>Task 9: Create tests/install-hook-migration.test.mjs</name>
  <read_first>
    - ./lib/install/hooks.mjs (updated in Task 5)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-04-04
    - .planning/phases/36-auto-session-capture/36-CONTEXT.md §"D-69" (idempotency contract)
  </read_first>
  <files>
    - tests/install-hook-migration.test.mjs (new)
  </files>
  <action>
  Test the idempotency + custom-entry preservation + migration-with-confirmation logic by calling the exported function from `lib/install/hooks.mjs` with mocked `prompts` responses and in-memory `settings.json` objects.

  ```js
  // tests/install-hook-migration.test.mjs
  // Tests for Stop hook migration in lib/install/hooks.mjs.
  // Source: Phase 39 VALIDATION §Task 39-04-04
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

  // Mock prompts BEFORE importing the module under test.
  const promptMock = vi.fn();
  vi.mock('prompts', () => ({
    default: promptMock,
  }));

  // The actual exported name may differ. Discovery step: import the module and check available exports.
  // Assume `registerCaptureHook` is exported. If not, the real name should be grep'd from lib/install/hooks.mjs.
  let registerCaptureHook;
  beforeAll(async () => {
    const mod = await import('../lib/install/hooks.mjs');
    registerCaptureHook = mod.registerCaptureHook || mod.migrateCaptureHook || mod.default;
    if (typeof registerCaptureHook !== 'function') {
      throw new Error(`Expected registerCaptureHook export in lib/install/hooks.mjs. Available: ${Object.keys(mod).join(', ')}`);
    }
  });

  describe('Stop hook migration (Phase 36 D-69 + Phase 39 D-121)', () => {
    beforeEach(() => {
      promptMock.mockReset();
    });

    it('fresh install (no existing Stop hooks): adds capture.sh without prompt', async () => {
      const settings = { hooks: {} };
      const result = await registerCaptureHook('/tmp/freshproj', settings);

      expect(result.action).toMatch(/added|migrated/);
      expect(promptMock).not.toHaveBeenCalled();
      const stopList = settings.hooks.Stop || [];
      const hasCapture = stopList.some((entry) => {
        const hooksArr = entry.hooks || [];
        return hooksArr.some((h) => (h.command || '').includes('session-end-capture.sh'));
      });
      expect(hasCapture).toBe(true);
    });

    it('idempotent: already-migrated settings produce no changes + no prompt', async () => {
      const settings = {
        hooks: {
          Stop: [
            { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-capture.sh' }] },
          ],
        },
      };
      const result = await registerCaptureHook('/tmp/alreadyproj', settings);

      expect(result.action).toBe('noop');
      expect(promptMock).not.toHaveBeenCalled();
    });

    it('legacy check.sh present: prompts for confirmation, replaces on accept', async () => {
      promptMock.mockResolvedValueOnce({ proceed: true });
      const settings = {
        hooks: {
          Stop: [
            { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-check.sh' }] },
          ],
        },
      };
      const result = await registerCaptureHook('/tmp/legacyproj', settings);

      expect(promptMock).toHaveBeenCalledOnce();
      expect(result.action).toBe('migrated');

      const stopList = settings.hooks.Stop;
      const hasOld = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-check.sh')));
      const hasNew = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-capture.sh')));
      expect(hasOld).toBe(false);
      expect(hasNew).toBe(true);
    });

    it('legacy check.sh present but user declines: no change + result skipped', async () => {
      promptMock.mockResolvedValueOnce({ proceed: false });
      const settings = {
        hooks: {
          Stop: [
            { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-check.sh' }] },
          ],
        },
      };
      const result = await registerCaptureHook('/tmp/declineproj', settings);

      expect(result.action).toBe('skipped');
      // Old hook still in place because user declined
      const stopList = settings.hooks.Stop;
      const hasOld = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-check.sh')));
      expect(hasOld).toBe(true);
    });

    it('custom user hooks preserved alongside capture.sh', async () => {
      const settings = {
        hooks: {
          Stop: [
            { matcher: '*', hooks: [{ type: 'command', command: '~/custom/my-hook.sh' }] },
          ],
        },
      };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await registerCaptureHook('/tmp/customproj', settings);
      } finally {
        warnSpy.mockRestore();
      }

      const stopList = settings.hooks.Stop;
      const hasCustom = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('my-hook.sh')));
      const hasCapture = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-capture.sh')));
      expect(hasCustom).toBe(true);
      expect(hasCapture).toBe(true);
    });
  });
  ```

  Note: if the actual `lib/install/hooks.mjs` exports different function names, update the import / beforeAll lookup. Fail loudly — the test file's top-level `beforeAll` throws with the available exports if the signature doesn't match.
  </action>
  <verify>
    <automated>test -f tests/install-hook-migration.test.mjs && pnpm -w vitest run --project root tests/install-hook-migration.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/install-hook-migration.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/install-hook-migration.test.mjs` -> exits 0 + all 5 scenario tests pass
  </acceptance_criteria>
  <done>
  Hook migration logic tested across all 5 scenarios: fresh / already-migrated / accept / decline / custom-preserved.
  </done>
</task>

</tasks>

<verification>
Before marking this plan complete, executor MUST pass:

```sh
pnpm -w vitest run --project root tests/migration-guide.test.mjs
pnpm -w vitest run --project root tests/changelog.test.mjs
pnpm -w vitest run --project root tests/install-node-check.test.mjs
pnpm -w vitest run --project root tests/install-hook-migration.test.mjs
pnpm -w vitest run --project root tests/node-version-scan.test.mjs   # Plan 01 regression: CHANGELOG is allowlisted
node --check bin/install.mjs
node --check lib/install/node-check.mjs
node --check lib/install/hooks.mjs
```

Manual spot-check:
- `cat docs/migration-v0-to-v1-alpha.md | head -50` — readable, well-structured
- `cat CHANGELOG.md | head -40` — valid markdown, Keep-a-Changelog compliant
</verification>
