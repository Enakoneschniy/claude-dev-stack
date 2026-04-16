---
plan_id: 36-03-wizard-migration
phase: 36
plan: 03
type: execute
wave: 3
depends_on:
  - "36-02"
files_modified:
  - lib/install/hooks.mjs
  - skills/session-manager/SKILL.md
  - tests/install/hooks-migration.test.mjs
autonomous: true
requirements:
  - CAPTURE-06
user_setup: []
must_haves:
  truths:
    - "Running the install wizard on a configured project replaces `session-end-check.sh` entry in `.claude/settings.json` Stop hook list with `session-end-capture.sh` (D-68)"
    - "Both `session-end-capture.sh` (wrapper) and `session-end-capture.mjs` (Node logic) are copied to `~/.claude/hooks/` with executable bit 0o755 on the wrapper (D-68)"
    - "Wizard is idempotent: re-running on a project already migrated produces zero diff to settings.json and emits no redundant log output (D-69)"
    - "Wizard detects custom Stop hooks (third-party user-added) and preserves them with a warning; auto-capture is added alongside — NEVER overwriting user config (D-69)"
    - "Wizard prints `auto-capture enabled, /end no longer required for routine sessions` exactly once per project on first migration (CAPTURE-06 SC#4)"
    - "`skills/session-manager/SKILL.md` `description` field is narrowed to reference fallback-only usage; file remains installed (D-70)"
    - "After wizard run, `grep 'session-end-check' ~/.claude/projects/*/.claude/settings.json` returns ZERO matches across all configured projects"
  artifacts:
    - path: "lib/install/hooks.mjs"
      provides: "Wizard hook-registration module — extended with Phase 36 migration"
      contains: "session-end-capture"
    - path: "skills/session-manager/SKILL.md"
      provides: "Session-manager skill with narrowed fallback-only description"
      contains: "fallback"
    - path: "tests/install/hooks-migration.test.mjs"
      provides: "Wizard migration regression tests"
      min_lines: 150
  key_links:
    - from: "lib/install/hooks.mjs"
      to: "hooks/session-end-capture.sh"
      via: "cpSync copy + chmodSync 0o755"
      pattern: "session-end-capture\\.sh"
    - from: "lib/install/hooks.mjs"
      to: "hooks/session-end-capture.mjs"
      via: "cpSync copy"
      pattern: "session-end-capture\\.mjs"
    - from: "lib/install/hooks.mjs"
      to: ".claude/settings.json Stop hook list"
      via: "settings.hooks.Stop.push + filter-out session-end-check entries"
      pattern: "Stop\\.(?:push|filter)"
---

<objective>
Update the install wizard (`lib/install/hooks.mjs`) to register the Phase 36 Stop hook in place of the legacy `session-end-check.sh`, and narrow the `session-manager` skill description to reflect its new fallback-only role. This is the final user-facing migration step — once this plan ships, re-running `npx claude-dev-stack` on an existing project auto-migrates them.

Purpose: Satisfy CAPTURE-06 (wizard installs + registers capture hook, deprecates `/end`) and ROADMAP SC#4 (re-running wizard replaces hook + prints migration message).

Output:
1. `lib/install/hooks.mjs` — extended with capture-hook migration logic per D-68/D-69.
2. `skills/session-manager/SKILL.md` — `description` narrowed per D-70.
3. `tests/install/hooks-migration.test.mjs` — 5 regression tests covering replace, idempotency, custom-hook preservation, executable-bit, and migration message.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/36-auto-session-capture/36-CONTEXT.md
@.planning/phases/36-auto-session-capture/36-RESEARCH.md
@.planning/phases/36-auto-session-capture/36-VALIDATION.md
@.planning/phases/36-auto-session-capture/36-02-session-end-capture-hook-PLAN.md
@./CLAUDE.md
@lib/install/hooks.mjs
@lib/shared.mjs
@skills/session-manager/SKILL.md
@hooks/session-end-check.sh
@package.json

<interfaces>
The wizard function signature stays unchanged:

```typescript
export function installSessionHook(
  stepNum: number,
  totalSteps: number,
  pkgRoot: string,
  vaultPath: string,
  projectsData: { projects: Array<{ name: string; path: string }> },
): void;
```

Internal helper `_writeSettingsFile(settingsPath, startDest, endDest, pushDest, vaultPath)` — MUST be updated to:
- Accept a new `endCaptureDest` param (or replace `endDest` entirely)
- Remove legacy `session-end-check.sh` entries from `settings.hooks.Stop` before adding the new entry
- Detect non-CDS Stop entries (custom) and emit a warning, preserving them

Public export `addSessionMarkerToGitignore` stays unchanged.

New semantics — when `session-end-capture.sh` is not yet registered:
1. Filter `settings.hooks.Stop` to drop entries whose command contains `session-end-check` (substring match).
2. Detect remaining entries whose command contains neither `session-end-capture` nor `session-end-check` → emit warning.
3. Push new entry `{ hooks: [{ type: 'command', command: \`bash ${endCaptureDest}\`, timeout: 5 }] }`.
4. `info('auto-capture enabled, /end no longer required for routine sessions')`.

When `session-end-capture.sh` is already registered (idempotent run):
1. No mutation to `settings.hooks.Stop`.
2. No `info(...)` message emitted.
</interfaces>

<context_for_reader>
- **`lib/install/hooks.mjs` line 54 loop** — the current file-copy loop enumerates hook filenames. Add `'session-end-capture.sh'` and `'session-end-capture.mjs'` to this loop. The `chmodSync(dest, 0o755)` call inside the loop will apply to both, but `chmod` on a `.mjs` file is harmless.
- **`lib/install/hooks.mjs` line 64** — the `for (const file of ['notebooklm-sync-trigger.mjs', ...])` loop copies supporting scripts WITHOUT chmod. The Node-logic `session-end-capture.mjs` SHOULD be in this loop, NOT the chmod loop — it doesn't need to be directly executable (wrapper invokes it via `node`). The `.sh` wrapper MUST be in the chmod loop.
- **Order of operations in `_writeSettingsFile`** — the existing function has a sequence: SessionStart (line 121) → Stop (line 133) → PostToolUse (line 145) → budget-reset (line 159) → budget-check (line 173) → workflow-enforcer (line 189) → dev-router (line 207) → project-switcher (line 222) → idea-capture (line 237) → git-conventions (line 252) → permissions.allow (line 274). The Phase 36 Stop-hook replacement goes at the same location as the existing Stop handling (line 133). Do NOT reorder other hooks.
- **The legacy Stop hook entry** is created at line 139: `settings.hooks.Stop.push({ hooks: [{ type: 'command', command: \`bash ${endDest}\`, timeout: 5 }] })` where `endDest = join(hooksDir, 'session-end-check.sh')`. Phase 36 replaces THIS entire block. The `endDest` variable can either be renamed or a new `endCaptureDest` variable introduced. Recommended: introduce `endCaptureDest` and retire `endDest` (rename to `legacyEndDest` if needed for a one-time removal pass, then delete after a release).
- **Existing `hasEnd` check** uses `.includes('session-end-check')` — Plan 03 extends this logic to also check `'session-end-capture'` (either substring qualifies as "already registered in some form"), then decides whether to migrate, keep, or no-op.
- **`skills/session-manager/SKILL.md` description** — read current file first. The `description` field lives in YAML frontmatter. Existing: something like "Automatically manage development session lifecycle. Load context at start, log sessions at end. ALWAYS trigger on first message..." — Plan 03 rewrites it to be ≤2 sentences focused on fallback use. Keep frontmatter valid YAML.
- **Test file location** — `tests/install/hooks-migration.test.mjs` is new. Phase 33 test.projects registers root tests via `tests/**/*.test.mjs` glob (verify during execution). If not picked up, add `tests/install/` to the root vitest config include list.
- **Temp project simulation** — tests use `mkdtempSync` to create a throwaway project dir, write a synthetic `.claude/settings.json`, run `installSessionHook`, then inspect the resulting file. Clean up in `afterEach`.
</context_for_reader>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update lib/install/hooks.mjs to copy new hook files</name>
  <files>lib/install/hooks.mjs</files>
  <read_first>lib/install/hooks.mjs, hooks/session-end-capture.sh, hooks/session-end-capture.mjs</read_first>
  <action>
    Locate the two copy loops in `lib/install/hooks.mjs`:

    **Loop 1 (line ~54) — executable shell hooks:**
    ```javascript
    for (const name of ['session-start-context.sh', 'session-end-check.sh', 'vault-auto-push.sh', 'gsd-auto-reapply-patches.sh', 'budget-check.mjs', 'budget-reset.mjs', 'budget-check-status.mjs', 'gsd-workflow-enforcer.mjs', 'dev-router.mjs', 'project-switcher.mjs', 'git-conventions-check.mjs', 'idea-capture-trigger.mjs']) {
    ```
    Add `'session-end-capture.sh'` to this array (keep `'session-end-check.sh'` present — users on older settings.json may still reference it during migration window; the wizard removes the SETTINGS entry but keeping the file on disk is harmless).

    **Loop 2 (line ~64) — supporting scripts (no chmod needed):**
    ```javascript
    for (const file of ['notebooklm-sync-trigger.mjs', 'notebooklm-sync-runner.mjs', 'update-context.mjs', 'idea-capture-triggers.json']) {
    ```
    Add `'session-end-capture.mjs'` to this array.

    Add a new variable near other dest declarations (line ~49-51):
    ```javascript
    const endCaptureDest = join(hooksDir, 'session-end-capture.sh');
    ```

    Pass `endCaptureDest` to `_writeSettingsFile` — update both call sites (line 84 fallback, line 92 per-project). The signature becomes:
    ```javascript
    function _writeSettingsFile(settingsPath, startDest, endDest, endCaptureDest, pushDest, vaultPath) { ... }
    ```
    (Inserting `endCaptureDest` between `endDest` and `pushDest`. Keeping `endDest` available for the removal logic.)
  </action>
  <verify>`node --check lib/install/hooks.mjs` exits 0. `grep -c "session-end-capture.sh" lib/install/hooks.mjs` ≥ 3 (array entry, endCaptureDest declaration, _writeSettingsFile usage).</verify>
  <acceptance_criteria>
    - `lib/install/hooks.mjs` contains literal `'session-end-capture.sh'` in the executable-hooks copy loop
    - `lib/install/hooks.mjs` contains literal `'session-end-capture.mjs'` in the supporting-scripts copy loop
    - `lib/install/hooks.mjs` declares `const endCaptureDest = join(hooksDir, 'session-end-capture.sh')`
    - `_writeSettingsFile` signature accepts `endCaptureDest` parameter
    - Both call sites (line ~84 fallback, line ~92 per-project) pass `endCaptureDest`
    - `node --check lib/install/hooks.mjs` exits 0
  </acceptance_criteria>
  <done>Wizard now copies new hook files and has endCaptureDest threaded through _writeSettingsFile.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite Stop-hook block inside _writeSettingsFile for migration + idempotency</name>
  <files>lib/install/hooks.mjs</files>
  <read_first>lib/install/hooks.mjs, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Locate the existing Stop-hook registration block (approximately lines 133-143 in current code):
    ```javascript
    // Hook 2: Stop — remind to log session
    if (!settings.hooks.Stop) settings.hooks.Stop = [];
    const hasEnd = settings.hooks.Stop.some(entry =>
      entry.hooks?.some(h => h.command?.includes('session-end-check'))
    );
    if (!hasEnd) {
      settings.hooks.Stop.push({
        hooks: [{ type: 'command', command: `bash ${endDest}`, timeout: 5 }],
      });
      changed = true;
    }
    ```

    Replace ENTIRELY with the Phase 36 migration logic from 36-RESEARCH.md §"Wizard migration (D-68/D-69)":
    ```javascript
    // Hook 2: Stop — Phase 36 auto-capture (replaces legacy session-end-check.sh)
    if (!settings.hooks.Stop) settings.hooks.Stop = [];

    const captureAlready = settings.hooks.Stop.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes('session-end-capture.sh'))
    );

    if (!captureAlready) {
      // D-68: Remove any legacy session-end-check entries
      const beforeCount = settings.hooks.Stop.length;
      settings.hooks.Stop = settings.hooks.Stop.filter((entry) =>
        !entry.hooks?.some((h) => h.command?.includes('session-end-check'))
      );
      if (settings.hooks.Stop.length < beforeCount) changed = true;

      // D-69: Detect custom Stop hooks (not CDS-authored) — warn but preserve
      const customStop = settings.hooks.Stop.filter((entry) =>
        entry.hooks?.every((h) =>
          !h.command?.includes('session-end-capture') &&
          !h.command?.includes('session-end-check')
        )
      );
      if (customStop.length > 0) {
        warn(`Custom Stop hooks detected in ${settingsPath.replace(homedir(), '~')} — ` +
             `auto-capture added alongside. Review for conflicts.`);
      }

      settings.hooks.Stop.push({
        hooks: [{ type: 'command', command: `bash ${endCaptureDest}`, timeout: 5 }],
      });
      changed = true;
      info('auto-capture enabled, /end no longer required for routine sessions');
    }
    ```

    If `info` is not already imported at the top of `lib/install/hooks.mjs`, add it: check `lib/shared.mjs` for the export (it should be there — line 5 of hooks.mjs already imports `c, ok, warn, info, step, mkdirp`).

    Do NOT change any other hook registration blocks (SessionStart, PostToolUse, budget-*, dev-router, project-switcher, idea-capture, git-conventions, permissions.allow).
  </action>
  <verify>`node --check lib/install/hooks.mjs` exits 0. Behavior verified by Task 5 tests.</verify>
  <acceptance_criteria>
    - Stop-hook block in `_writeSettingsFile` no longer checks for 'session-end-check' as the `hasEnd` gate
    - Stop-hook block now checks for 'session-end-capture.sh' via `captureAlready`
    - Stop-hook block filters out 'session-end-check' entries BEFORE pushing new entry
    - Stop-hook block emits `warn(...)` when custom Stop hooks detected
    - Stop-hook block emits `info('auto-capture enabled, /end no longer required for routine sessions')` on first migration
    - `node --check lib/install/hooks.mjs` exits 0
  </acceptance_criteria>
  <done>Migration logic in place; idempotency + custom-hook preservation + migration message wired.</done>
</task>

<task type="auto">
  <name>Task 3: Narrow skills/session-manager/SKILL.md description to fallback-only</name>
  <files>skills/session-manager/SKILL.md</files>
  <read_first>skills/session-manager/SKILL.md</read_first>
  <action>
    Read current `skills/session-manager/SKILL.md`. The YAML frontmatter has a `description` field whose current value is verbose and triggers auto-invocation on many patterns.

    Replace ONLY the `description` field with:
    ```yaml
    description: "Fallback for manual session logging when auto-capture is disabled or fails. Also handles explicit handoff requests (\"resume\", \"handoff\", \"what did we do\"). Auto-capture via hooks/session-end-capture.mjs is the primary path — this skill is a safety net."
    ```

    Preserve:
    - All other frontmatter fields (`name`, any skill-specific config).
    - The skill body below the frontmatter (the actual `/end` implementation stays — it's the fallback).
    - File permissions.

    Do NOT change `name`, `allowed-tools`, or any other non-description field. Do NOT delete the skill file — D-70 mandates it stays for fallback.
  </action>
  <verify>`grep -A 1 'description:' skills/session-manager/SKILL.md | head -2` shows the new description. YAML frontmatter still parseable.</verify>
  <acceptance_criteria>
    - `skills/session-manager/SKILL.md` exists
    - File contains literal string `fallback` in the description field
    - File contains literal string `auto-capture` in the description field
    - YAML frontmatter still starts with `---` and closes with `---`
    - No other frontmatter fields were altered (verified by `diff` against pre-change snapshot — planner keeps a copy in git history via the commit)
    - Skill body below frontmatter is unchanged
  </acceptance_criteria>
  <done>Description narrowed; skill stays as fallback.</done>
</task>

<task type="auto">
  <name>Task 4: Create tests/install/hooks-migration.test.mjs regression tests</name>
  <files>tests/install/hooks-migration.test.mjs</files>
  <read_first>lib/install/hooks.mjs, tests/, package.json</read_first>
  <action>
    Create `tests/install/hooks-migration.test.mjs` using the repo's existing test framework (check `package.json` — likely `node --test` at v0.12, or vitest post-Phase 33).

    Test scaffolding:
    ```javascript
    import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
    import { join } from 'node:path';
    import { tmpdir, homedir } from 'node:os';
    import { installSessionHook } from '../../lib/install/hooks.mjs';
    import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // or node:test

    let tmpDir, projectDir, pkgRoot;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'p36-wizard-'));
      projectDir = join(tmpDir, 'project');
      mkdirSync(join(projectDir, '.claude'), { recursive: true });
      // Synthesize pkgRoot with required files
      pkgRoot = join(tmpDir, 'pkg');
      mkdirSync(join(pkgRoot, 'hooks'), { recursive: true });
      mkdirSync(join(pkgRoot, 'lib'), { recursive: true });
      mkdirSync(join(pkgRoot, 'patches'), { recursive: true });
      // Copy real hook files into pkgRoot so installSessionHook's cpSync finds them
      writeFileSync(join(pkgRoot, 'hooks', 'session-end-capture.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });
      writeFileSync(join(pkgRoot, 'hooks', 'session-end-capture.mjs'), '// stub\n');
      writeFileSync(join(pkgRoot, 'hooks', 'session-start-context.sh'), '#!/bin/sh\nexit 0\n');
      writeFileSync(join(pkgRoot, 'hooks', 'session-end-check.sh'), '#!/bin/sh\nexit 0\n');  // legacy (so copy loop doesn't fail)
      writeFileSync(join(pkgRoot, 'hooks', 'vault-auto-push.sh'), '#!/bin/sh\nexit 0\n');
      // ... stubs for all other files in the copy loops ...
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });
    ```

    Test cases:

    1. **`replaces` — wizard removes old entry and adds new** — Pre-write settings.json with `{ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bash ~/.claude/hooks/session-end-check.sh', timeout: 5 }] }] } }`. Run `installSessionHook(1, 1, pkgRoot, '/fake/vault', { projects: [{ name: 'p', path: projectDir }] })`. Read settings.json. Assert: exactly one Stop entry, command contains 'session-end-capture.sh', command does NOT contain 'session-end-check'.

    2. **`idempotent` — second run produces no diff** — Run wizard once, read settings.json as `first`. Run wizard second time, read as `second`. Assert `first === second` (JSON-string-equal). Assert no duplicate entries in `Stop`.

    3. **`custom-preserved` — wizard preserves user-added Stop hooks** — Pre-write settings.json with `{ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bash ~/my-custom-hook.sh', timeout: 5 }] }, { hooks: [{ type: 'command', command: 'bash ~/.claude/hooks/session-end-check.sh', timeout: 5 }] }] } }`. Run wizard. Assert: Stop list has exactly 2 entries — the custom one (unchanged) + the new session-end-capture.sh. Legacy session-end-check.sh entry is gone.

    4. **`executable-bit` — wrapper is chmod 0o755 after wizard** — Run wizard. Assert `statSync(join(homedir(), '.claude', 'hooks', 'session-end-capture.sh')).mode & 0o111 !== 0` (any execute bit set). (Note: this test may need to mock `homedir()` or the hook-install path — if not feasible in the test env, simulate by injecting HOOKS_DIR via an env var; if the current wizard hardcodes `homedir()`, extend it to honor `CDS_HOOKS_DIR` env var for testability — this is a small, safe addition.)

    5. **`migration-message` — wizard prints the migration info message** — Capture stdout during wizard run (use `vi.spyOn(console, 'log')` or `node:test mock`). Assert output contains `'auto-capture enabled, /end no longer required for routine sessions'` exactly once.

    Each test is an independent scenario. File size target: 150-250 lines.
  </action>
  <verify>`pnpm test tests/install/hooks-migration.test.mjs` (or `node --test`) exits 0 with 5 passing.</verify>
  <acceptance_criteria>
    - File `tests/install/hooks-migration.test.mjs` exists with ≥150 lines
    - Contains at least 5 `test(` or `it(` blocks
    - Running the tests exits 0 with ≥5 passing
    - Contains literal `'replaces'` (test name per VALIDATION.md row 36-03-01)
    - Contains literal `'idempotent'` (test name per VALIDATION.md row 36-03-02)
    - Contains literal `'custom-preserved'` (test name per VALIDATION.md row 36-03-03)
    - Contains literal `'executable-bit'` (test name per VALIDATION.md row 36-03-04)
    - Contains literal `'migration-message'` OR verifies migration message output in at least one assertion
  </acceptance_criteria>
  <done>Wizard migration behavior fully regression-tested.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `node --check lib/install/hooks.mjs` exits 0
- [ ] `pnpm test tests/install/hooks-migration.test.mjs` exits 0 with 5 tests passing
- [ ] `pnpm test` full suite exits 0 (no regressions in Phase 33 baseline, Plan 01 + Plan 02 tests, new wizard tests)
- [ ] `grep -q "fallback" skills/session-manager/SKILL.md` exits 0
- [ ] YAML frontmatter in `skills/session-manager/SKILL.md` parses valid (via `node -e "import('js-yaml').then(...)"` or grep-based spot check for `---` delimiters)
- [ ] Manual smoke test (optional): run `npx ./` on a synthetic project dir with legacy settings; assert output + file contents match expectations
</verification>

<success_criteria>
- All 4 tasks completed with acceptance criteria met
- Wizard migrates existing projects idempotently + preserves custom hooks + prints migration message
- `session-manager` skill description narrowed; skill remains installed for fallback
- 928/931 root test baseline preserved (Phase 33 D-06)
- All new tests run in <15 s
- CAPTURE-06 satisfied; ROADMAP SC#4 satisfied
</success_criteria>

<output>
After completion, create `.planning/phases/36-auto-session-capture/36-03-SUMMARY.md` documenting:
- Files modified (3)
- Test count + pass count
- Any wizard signature changes (if `_writeSettingsFile` signature evolved)
- Whether `CDS_HOOKS_DIR` env var was added for testability (surface as new test-only env var if so)
- Whether any legacy cleanup was done on `session-end-check.sh` (file stays in `hooks/` repo dir and in `~/.claude/hooks/` on user machines — cleanup deferred)
- Next: Plan 04 adds end-to-end integration tests + deprecation README entry
</output>
