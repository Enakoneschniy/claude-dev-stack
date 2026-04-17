---
plan_id: 40-03-doctor-gsd-permissions-and-wizard
phase: 40
plan: 03
type: execute
wave: 2
depends_on: ["02"]
files_modified:
  - lib/doctor.mjs
  - lib/install/permission-config.mjs
  - bin/install.mjs
  - bin/cli.mjs
  - tests/doctor-gsd-permissions.test.mjs
  - tests/install-permission-config.test.mjs
autonomous: true
requirements:
  - GSD-PERMS-DOCTOR
  - GSD-PERMS-WIZARD
user_setup: []
must_haves:
  truths:
    - "Running `claude-dev-stack doctor --gsd-permissions` in a project directory idempotently writes the GSD-required Bash allowlist patterns to `.claude/settings.local.json` in the current working directory"
    - "The doctor flag NEVER writes to global `~/.claude/settings.json` — only project-scoped `.claude/settings.local.json` per D-128"
    - "Patterns written include: `Bash(pnpm:*)`, `Bash(npx:*)`, `Bash(node:*)`, `Bash(node --check *)`, `Bash(git merge-base:*)`, `Bash(git reset:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git rev-parse:*)`, `Bash(tsc:*)`, `Bash(vitest:*)`"
    - "Re-running the command on a project that already has all patterns is a no-op — no patterns duplicated, no file rewritten if no changes"
    - "`lib/install/permission-config.mjs` exports `setupGsdPermissions(projectPath)` — called from both the doctor subcommand AND the install wizard"
    - "Wizard CC 2.x detection: reads `claude --version` at install time; if CC >= 2.0, calls `setupGsdPermissions` for each configured project automatically"
    - "Both new test files pass: doctor-gsd-permissions + install-permission-config"
  artifacts:
    - path: "lib/install/permission-config.mjs"
      provides: "Shared logic for writing GSD permission patterns to .claude/settings.local.json"
      contains: "setupGsdPermissions"
    - path: "lib/doctor.mjs"
      provides: "Extended doctor with --gsd-permissions flag handler"
      contains: "gsd-permissions"
    - path: "bin/cli.mjs"
      provides: "CLI plumbing passing --gsd-permissions flag to doctor main()"
      contains: "gsd-permissions"
    - path: "bin/install.mjs"
      provides: "Wizard calling setupGsdPermissions after GSD install when CC >= 2.x"
      contains: "setupGsdPermissions"
    - path: "tests/doctor-gsd-permissions.test.mjs"
      provides: "Unit tests for the doctor --gsd-permissions flow"
      contains: "gsd-permissions"
    - path: "tests/install-permission-config.test.mjs"
      provides: "Unit tests for setupGsdPermissions isolated behavior"
      contains: "setupGsdPermissions"
  key_links:
    - from: "lib/install/permission-config.mjs::setupGsdPermissions(projectPath)"
      to: ".claude/settings.local.json (per project)"
      via: "readFileSync + JSON.parse + merge + writeFileSync"
      pattern: "settings.local.json"
    - from: "lib/doctor.mjs (--gsd-permissions branch)"
      to: "lib/install/permission-config.mjs::setupGsdPermissions"
      via: "import + call with process.cwd()"
      pattern: "setupGsdPermissions"
    - from: "bin/install.mjs (wizard loop)"
      to: "lib/install/permission-config.mjs::setupGsdPermissions"
      via: "import + conditional call per project when CC >= 2.x"
      pattern: "setupGsdPermissions"
---

<objective>
Implement the `claude-dev-stack doctor --gsd-permissions` subcommand (D-128) and the wizard-time CC 2.x auto-detection + permission-config step (D-129). A single shared module `lib/install/permission-config.mjs` holds the logic used by both entry points.

Purpose: after this plan, a user hitting the CC 2.1.x Bash permission lockout can fix it by running one command, and new installs auto-configure it at wizard time. Combined with Plan 02's bypassPermissions patch, this closes the "silent Bash denial" regression from Phase 39 Wave 2.

Output: 1 new shared module + 2 modified CLI files + 2 new test files.

response_language: ru — все user-facing CLI output на английском (code/commits), общение в чате на русском.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md
@./CLAUDE.md
@./lib/doctor.mjs
@./lib/install/node-check.mjs
@./lib/install/hooks.mjs
@./bin/install.mjs
@./bin/cli.mjs

<interfaces>
**Existing doctor.mjs entry point (bin/cli.mjs lines 297-301):**
```js
case 'doctor':
case 'check': {
  const { main } = await import('../lib/doctor.mjs');
  await main();
  break;
}
```
The `main()` function currently accepts no arguments. Plan 03 changes it to accept an optional `{ gsdPermissions: boolean }` options object (backward compatible — calling with no args still works).

**lib/shared.mjs helpers** already imported by doctor.mjs: `c, ok, fail, warn, info, hasCommand, runCmd, SKILLS_DIR, CLAUDE_DIR`.

**CC version detection pattern (D-129):**
```bash
which claude && claude --version
# Output: "Claude Code vX.Y.Z" or similar
```
Parse major version from `claude --version` stdout. If CC major >= 2, call `setupGsdPermissions`. If CC not found or < 2, skip.

**GSD permission patterns (D-128, exact list):**
```js
const GSD_BASH_PATTERNS = [
  'Bash(pnpm:*)',
  'Bash(npx:*)',
  'Bash(node:*)',
  'Bash(node --check *)',
  'Bash(git merge-base:*)',
  'Bash(git reset:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git rev-parse:*)',
  'Bash(tsc:*)',
  'Bash(vitest:*)',
];
```

**Target file: `.claude/settings.local.json` (PROJECT-scope per D-128):**
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      ...
    ]
  }
}
```
This is DIFFERENT from `.claude/settings.json` (used by hooks.mjs). `settings.local.json` is CC 2.x's user-local override file that is NOT committed to git.

**lib/install/permission-config.mjs (new — Plan 03 creates it):**
```js
export function setupGsdPermissions(projectPath) -> { added: string[], existing: string[] }
```
Reads/creates `{projectPath}/.claude/settings.local.json`, merges `GSD_BASH_PATTERNS` into `permissions.allow`, writes back if any patterns added. Returns counts. No prompts — pure write-or-skip.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create lib/install/permission-config.mjs — shared GSD permissions writer</name>
  <read_first>
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md §D-128, §D-129
    - lib/install/node-check.mjs (pattern reference for wizard helper module shape)
    - lib/install/hooks.mjs lines 309-337 (existing permissions.allow merge pattern — hooks writes to .claude/settings.json, this writes to .claude/settings.local.json)
  </read_first>
  <files>
    - lib/install/permission-config.mjs (new)
  </files>
  <action>
  Create `lib/install/permission-config.mjs` with the following content:

  ```js
  // lib/install/permission-config.mjs — GSD permission allowlist helper
  // Source: Phase 40 CONTEXT.md D-128 (doctor), D-129 (wizard)
  //
  // Writes GSD-required Bash patterns to {projectPath}/.claude/settings.local.json
  // (project-scoped — NEVER global ~/.claude/settings.json).
  //
  // Idempotent: re-running on a project that already has all patterns is a no-op.
  // No prompts — pure write-or-skip.

  import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
  import { join } from 'path';
  import { spawnSync } from 'child_process';
  import { info, ok, warn } from '../shared.mjs';

  /**
   * Bash patterns required by GSD executor agents under CC 2.1.x.
   * Each pattern grants claude-code permission for a specific family
   * of Bash commands that executors run when implementing plan tasks.
   *
   * @type {readonly string[]}
   */
  export const GSD_BASH_PATTERNS = Object.freeze([
    'Bash(pnpm:*)',
    'Bash(npx:*)',
    'Bash(node:*)',
    'Bash(node --check *)',
    'Bash(git merge-base:*)',
    'Bash(git reset:*)',
    'Bash(git status:*)',
    'Bash(git diff:*)',
    'Bash(git log:*)',
    'Bash(git rev-parse:*)',
    'Bash(tsc:*)',
    'Bash(vitest:*)',
  ]);

  /**
   * Idempotently write GSD-required Bash permission patterns to the project's
   * `.claude/settings.local.json`. Creates the file + dir if absent.
   * Returns a summary of what was added vs already present.
   *
   * @param {string} projectPath — absolute path to the project root
   * @returns {{ added: string[], existing: string[] }}
   */
  export function setupGsdPermissions(projectPath) {
    const claudeDir = join(projectPath, '.claude');
    const settingsPath = join(claudeDir, 'settings.local.json');
    const result = { added: [], existing: [] };

    // Read existing settings.local.json (or start from scratch)
    let settings = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch {
        warn(`${settingsPath} is corrupt JSON — will be overwritten with valid config`);
        settings = {};
      }
    }

    if (!settings.permissions) settings.permissions = {};
    if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

    const existing = new Set(settings.permissions.allow);

    for (const pattern of GSD_BASH_PATTERNS) {
      if (existing.has(pattern)) {
        result.existing.push(pattern);
      } else {
        settings.permissions.allow.push(pattern);
        result.added.push(pattern);
      }
    }

    if (result.added.length > 0) {
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }

    return result;
  }

  /**
   * Detect Claude Code version via `claude --version`.
   * Returns the major version as an integer, or null if CC is not found or
   * version cannot be parsed.
   *
   * @returns {number | null}
   */
  export function detectCCMajorVersion() {
    try {
      const r = spawnSync('claude', ['--version'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 5000,
      });
      if (r.status !== 0) return null;
      // CC outputs something like "Claude Code v2.1.3" or "2.1.3"
      const match = (r.stdout || '').match(/(\d+)\.\d+/);
      return match ? Number(match[1]) : null;
    } catch {
      return null;
    }
  }
  ```
  </action>
  <verify>
    <automated>node --check lib/install/permission-config.mjs && grep -c "export function setupGsdPermissions" lib/install/permission-config.mjs && grep -c "export function detectCCMajorVersion" lib/install/permission-config.mjs && grep -c "settings.local.json" lib/install/permission-config.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `test -f lib/install/permission-config.mjs` -> exits 0
    - `node --check lib/install/permission-config.mjs` -> exits 0
    - `grep -c "export function setupGsdPermissions" lib/install/permission-config.mjs` -> 1
    - `grep -c "export function detectCCMajorVersion" lib/install/permission-config.mjs` -> 1
    - `grep -c "settings.local.json" lib/install/permission-config.mjs` -> >= 2
    - `grep -c "GSD_BASH_PATTERNS" lib/install/permission-config.mjs` -> >= 2
    - Module lists all 12 GSD patterns from D-128: `grep -c "Bash(" lib/install/permission-config.mjs` -> 12
  </acceptance_criteria>
  <done>
  Shared permission-config module exists with both exports + 12 GSD patterns.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend lib/doctor.mjs with --gsd-permissions flag</name>
  <read_first>
    - lib/doctor.mjs (full current file)
    - bin/cli.mjs lines 297-301 (doctor case in switch)
    - lib/install/permission-config.mjs (post-Task-1)
  </read_first>
  <files>
    - lib/doctor.mjs (modify)
    - bin/cli.mjs (modify)
  </files>
  <action>
  **In lib/doctor.mjs:**

  1. Change `main()` to accept an options parameter:

  ```js
  export async function main({ gsdPermissions = false } = {}) {
  ```

  2. At the VERY TOP of `main()` (before the "Claude Dev Stack — Health Check" header), add an early-return branch for the `--gsd-permissions` flag:

  ```js
  if (gsdPermissions) {
    const { setupGsdPermissions, GSD_BASH_PATTERNS } = await import('./install/permission-config.mjs');
    const projectPath = process.cwd();
    const result = setupGsdPermissions(projectPath);
    if (result.added.length > 0) {
      ok(`GSD permissions: ${result.added.length} pattern(s) added to .claude/settings.local.json`);
      for (const p of result.added) info(`  + ${p}`);
    }
    if (result.existing.length > 0) {
      info(`${result.existing.length} pattern(s) already present`);
    }
    if (result.added.length === 0) {
      ok('GSD permissions: all patterns already configured — no changes');
    }
    return;
  }
  ```

  This ensures `claude-dev-stack doctor --gsd-permissions` is a focused command that ONLY does the permission write and exits (no vault checks, no plugin lists, etc.).

  **In bin/cli.mjs:**

  Replace the doctor case (lines 297-301):

  ```js
  case 'doctor':
  case 'check': {
    const flags = args.slice(1);
    const gsdPermissions = flags.includes('--gsd-permissions');
    const { main } = await import('../lib/doctor.mjs');
    await main({ gsdPermissions });
    break;
  }
  ```

  Also update the help text (printHelp function) to mention the new flag. Find the doctor help line and append:

  ```js
  console.log(`    ${c.white}claude-dev-stack doctor --gsd-permissions${c.reset}  ${c.dim}Write GSD executor allowlist to .claude/settings.local.json${c.reset}`);
  ```

  Place this BELOW the existing `claude-dev-stack doctor` help line.
  </action>
  <verify>
    <automated>node --check lib/doctor.mjs && node --check bin/cli.mjs && grep -c "gsd-permissions" lib/doctor.mjs && grep -c "gsd-permissions" bin/cli.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --check lib/doctor.mjs` -> exits 0
    - `node --check bin/cli.mjs` -> exits 0
    - `grep -c "gsdPermissions" lib/doctor.mjs` -> >= 2 (param + usage)
    - `grep -c "gsd-permissions" bin/cli.mjs` -> >= 2 (flag detection + help)
    - `grep -c "setupGsdPermissions" lib/doctor.mjs` -> >= 1
    - `grep -c "settings.local.json" lib/doctor.mjs` -> >= 1 (in the ok() message)
  </acceptance_criteria>
  <done>
  Doctor accepts --gsd-permissions flag, CLI plumbs it, help text updated.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire setupGsdPermissions into install wizard (CC 2.x auto-detection)</name>
  <read_first>
    - bin/install.mjs (full current file)
    - lib/install/permission-config.mjs (post-Task-1)
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md §D-129
  </read_first>
  <files>
    - bin/install.mjs (modify)
  </files>
  <action>
  In `bin/install.mjs`, add a new import at the top (alongside the existing node-check import):

  ```js
  import { setupGsdPermissions, detectCCMajorVersion } from '../lib/install/permission-config.mjs';
  ```

  Add a new step to the steps array, AFTER the GSD step and BEFORE the git-conventions step. Conceptually: GSD installs → patches apply (via Plan 02 wiring) → permissions auto-configure. Insert around line 185 (after the loop.md step and before the git-conventions step):

  ```js
  // Phase 40 D-129: auto-configure GSD executor permissions for CC 2.x
  // Only fires when GSD is selected/installed AND Claude Code >= 2.0 is detected.
  if (components.gsd || installState.gsdInstalled) {
    steps.push({ label: 'GSD permissions (CC 2.x)', run: async (n, t) => {
      const ccMajor = detectCCMajorVersion();
      if (ccMajor === null || ccMajor < 2) {
        info('CC version < 2 or not detected — GSD permission auto-config skipped');
        return;
      }
      const configProjects = (projectsData?.projects || []).filter(p => p.path && existsSync(p.path));
      let totalAdded = 0;
      for (const project of configProjects) {
        const result = setupGsdPermissions(project.path);
        totalAdded += result.added.length;
        if (result.added.length > 0) {
          ok(`GSD permissions: ${result.added.length} patterns → ${project.name}`);
        }
      }
      if (totalAdded === 0 && configProjects.length > 0) {
        ok('GSD permissions: already configured for all projects');
      }
    }});
  }
  ```

  Ensure `existsSync` is already imported (it is — used elsewhere in install.mjs).
  </action>
  <verify>
    <automated>node --check bin/install.mjs && grep -c "setupGsdPermissions" bin/install.mjs && grep -c "detectCCMajorVersion" bin/install.mjs && grep -c "D-129" bin/install.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --check bin/install.mjs` -> exits 0
    - `grep -c "setupGsdPermissions" bin/install.mjs` -> >= 2 (import + call)
    - `grep -c "detectCCMajorVersion" bin/install.mjs` -> >= 2 (import + call)
    - `grep -c "GSD permissions" bin/install.mjs` -> >= 2 (ok messages)
    - `grep -c "D-129" bin/install.mjs` -> >= 1 (traceability comment)
    - `grep -c "settings.local.json" bin/install.mjs` -> 0 (the module handles the path internally — wizard doesn't reference it directly)
  </acceptance_criteria>
  <done>
  Wizard auto-detects CC 2.x and configures GSD permissions for each project during install.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create tests/install-permission-config.test.mjs</name>
  <read_first>
    - lib/install/permission-config.mjs (post-Task-1)
    - tests/install-node-check.test.mjs (pattern reference for vitest unit test of wizard helper)
    - packages/cds-cli/tests/helpers/temp-home.ts (mkdtempSync + cleanup pattern)
  </read_first>
  <files>
    - tests/install-permission-config.test.mjs (new)
  </files>
  <action>
  Create unit test that exercises `setupGsdPermissions` in an isolated temp project dir. Tests:

  1. **Fresh project (no .claude/ dir)**: `setupGsdPermissions(tempDir)` creates `.claude/settings.local.json` with all 12 patterns.
  2. **Idempotent re-run**: call twice → second call adds 0 patterns, existing 12.
  3. **Pre-existing partial allowlist**: write a `settings.local.json` with 3 of the 12 patterns → call → assert only 9 added.
  4. **Corrupt JSON**: write `{ invalid }` to `settings.local.json` → call → file overwritten with valid JSON containing all 12 patterns.
  5. **GSD_BASH_PATTERNS export**: assert it has exactly 12 entries and is frozen.
  6. **detectCCMajorVersion export**: assert typeof is function (no side effects in test — just existence check).

  Use `mkdtempSync` + `rmSync` for isolation, `beforeAll`/`afterAll` per suite.
  </action>
  <verify>
    <automated>pnpm vitest run tests/install-permission-config.test.mjs --reporter=basic</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/install-permission-config.test.mjs` -> exits 0
    - `pnpm vitest run tests/install-permission-config.test.mjs` -> exits 0
    - `grep -c 'describe' tests/install-permission-config.test.mjs` -> >= 2
    - `grep -c 'setupGsdPermissions' tests/install-permission-config.test.mjs` -> >= 4
    - `grep -c 'settings.local.json' tests/install-permission-config.test.mjs` -> >= 2
  </acceptance_criteria>
  <done>
  Unit tests cover fresh, idempotent, partial, and corrupt JSON cases — all pass.
  </done>
</task>

<task type="auto">
  <name>Task 5: Create tests/doctor-gsd-permissions.test.mjs</name>
  <read_first>
    - lib/doctor.mjs (post-Task-2)
    - tests/install-permission-config.test.mjs (post-Task-4)
  </read_first>
  <files>
    - tests/doctor-gsd-permissions.test.mjs (new)
  </files>
  <action>
  Create test file that exercises the `--gsd-permissions` branch of doctor.mjs. Since doctor.main({ gsdPermissions: true }) writes to `${process.cwd()}/.claude/settings.local.json`, use a child-process approach (change CWD to a temp dir) or temporarily override `process.cwd()` via `vi.spyOn`.

  Tests:
  1. **doctor main with gsdPermissions=true**: writes patterns to CWD's .claude/settings.local.json.
  2. **doctor main with gsdPermissions=false** (default): does NOT write .claude/settings.local.json (runs normal health check path — just verify it doesn't throw).
  3. **Idempotency**: calling doctor main({ gsdPermissions: true }) twice → second call is no-op.

  Use `vi.spyOn(process, 'cwd').mockReturnValue(tempDir)` to control CWD for the test without spawning child processes.
  </action>
  <verify>
    <automated>pnpm vitest run tests/doctor-gsd-permissions.test.mjs --reporter=basic</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/doctor-gsd-permissions.test.mjs` -> exits 0
    - `pnpm vitest run tests/doctor-gsd-permissions.test.mjs` -> exits 0
    - `grep -c 'gsdPermissions' tests/doctor-gsd-permissions.test.mjs` -> >= 3
    - `grep -c 'settings.local.json' tests/doctor-gsd-permissions.test.mjs` -> >= 1
  </acceptance_criteria>
  <done>
  Doctor --gsd-permissions integration tests pass (fresh write, default mode, idempotency).
  </done>
</task>

<task type="auto">
  <name>Task 6: Verify full test suite remains green</name>
  <files>
    - (no source changes — verification only)
  </files>
  <action>
  Run full test suite to confirm no regressions from the doctor + wizard + permission-config additions:

  ```bash
  pnpm test 2>&1 | tail -20
  ```

  Watch for:
  - Any sibling test that imports doctor.mjs and now fails due to changed signature (should be backward compatible due to default params).
  - Any CI-relevant check (`node --check bin/cli.mjs`, `pnpm -r run build` if it exists).
  </action>
  <verify>
    <automated>pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test` exits 0
    - Zero new failures
  </acceptance_criteria>
  <done>
  Full test suite green after Plan 03 changes.
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. Syntax check all modified/new files
node --check lib/install/permission-config.mjs
node --check lib/doctor.mjs
node --check bin/cli.mjs
node --check bin/install.mjs

# 2. New tests green
pnpm vitest run tests/install-permission-config.test.mjs tests/doctor-gsd-permissions.test.mjs

# 3. Full suite green
pnpm test

# 4. Doctor --gsd-permissions smoke (manual)
# cd /tmp && mkdir -p test-project && cd test-project && node /path/to/bin/cli.mjs doctor --gsd-permissions
# (only run if time permits — the unit tests cover the logic)
```
</verification>
</content>
</invoke>