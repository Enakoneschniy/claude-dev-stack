# Phase 12: Sync Automation + install.mjs Refactor — Research

**Researched:** 2026-04-12
**Domain:** Node.js ESM module refactoring + hook-chain verification
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Sync trigger/runner/hook chain already implemented in v0.9 (Phase 9). Phase 12 only needs to **verify** it meets SYNC-01 success criteria — no new implementation expected
- **D-02:** Verification approach: confirm non-blocking behavior, log output to `~/vault/.notebooklm-sync.log`, failure exits 0, no modal prompt. Mark SYNC-01 done if passing
- **D-03:** Create `lib/install/` directory with one module per wizard section: `{prereqs, profile, projects, components, plugins, vault, gsd, skills, notebooklm, git-conventions, claude-md, hooks, summary}.mjs` — each exports its main function
- **D-04:** Keep `bin/install.mjs` as thin orchestrator (~100 lines max) that imports from `lib/install/*.mjs` and calls them in sequence
- **D-05:** No wizard behavior changes — all existing interactive flows, prompts, and defaults preserved exactly
- **D-06:** Remove all duplicated helpers from install.mjs, import `{c, ok, fail, warn, info, prompt, askPath, runCmd, hasCommand, mkdirp, listDirs}` from `lib/shared.mjs`. Extracted modules also import from shared
- **D-07:** Add `step()` function (progress display) to `lib/shared.mjs` — useful utility, belongs in shared
- **D-08:** Unit tests per extracted module in `tests/install/` or `tests/install-*.test.mjs`. Existing `tests/install.test.mjs` updated for new imports. No E2E wizard run needed
- **D-09:** Pass args explicitly — each module function takes what it needs as params and returns results. `main()` in install.mjs threads data through. No shared mutable state object
- **D-10:** `bin/install.mjs` stays as entry point (package.json bin field). npx users see no change. New `lib/install/*.mjs` files are internal-only

### Claude's Discretion
- Exact function signatures for each extracted module
- Which sections group into same module vs separate files (some small sections may combine)
- Test fixture strategy for wizard module testing
- Whether `getDirSuggestions` moves to shared or stays install-specific

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | User's vault auto-syncs to NotebookLM on session end — session-end hook triggers `notebooklm sync` silently in background after session log creation. Failure is non-blocking (warn only). | Sync chain fully implemented in v0.9. Research confirms all 4 SYNC-01 success criteria are met — see SYNC-01 Verification section below. |
| REFACTOR-01 | `bin/install.mjs` split from 1287-line monolith into focused modules — utility duplication with `lib/shared.mjs` removed, each wizard section is a separate importable function | Full function inventory done. 20 functions across 1471 lines. 9 functions are pure duplicates of shared.mjs. 13 wizard-section functions map cleanly to D-03 modules. See install.mjs Inventory section. |
</phase_requirements>

---

## Summary

Phase 12 has two independent workstreams. SYNC-01 is a verification-only task: the hook chain (`session-end-check.sh` → `notebooklm-sync-trigger.mjs` → `notebooklm-sync-runner.mjs`) was fully implemented in Phase 9 (v0.9) and already meets all four SYNC-01 success criteria per code inspection. The planner needs to write a single verification plan that confirms this by reading the three files and checking against the criteria — no new implementation code needed.

REFACTOR-01 is the substantive work. `bin/install.mjs` is 1471 lines with 20 functions — the first 9 functions (lines 27–128) are exact duplicates of utilities already in `lib/shared.mjs`. The remaining 11+ functions are wizard sections that map cleanly to the 13 module names in D-03. One key finding: `step()` was added to `lib/shared.mjs` in a prior phase (it is already there at line 73), so D-07 is already done — the planner should not schedule it as a new task. The `getDirSuggestions` helper is install-specific (closure over `defaultVal` parameter) but its logic is identical to `askPathAutocomplete` in shared — it should move to shared or be deleted in favor of calling `askPath` from shared.

`tests/install.test.mjs` uses structural (grep-based) tests against raw source text and one functional test that imports `installNotebookLM` by name. After the refactor, structural tests that grep for function names must be updated to import from the new module paths. The functional test must update its import path to `lib/install/notebooklm.mjs`.

**Primary recommendation:** Split in topological order (utilities first → wizard sections → orchestrator last). Each extracted module imports from `lib/shared.mjs`. `bin/install.mjs` becomes ~80 lines of imports + sequential calls. Update `tests/install.test.mjs` paths at the end.

---

## SYNC-01 Verification

### Four success criteria from REQUIREMENTS.md

| Criterion | Location | Code Evidence | Status |
|-----------|----------|---------------|--------|
| Session-end hook triggers sync | `hooks/session-end-check.sh` lines 43–49 | `TRIGGER="$SCRIPT_DIR/notebooklm-sync-trigger.mjs"` + `node "$TRIGGER" 2>/dev/null \|\| true` | VERIFIED [VERIFIED: codebase read] |
| Sync runs silently in background | `hooks/notebooklm-sync-trigger.mjs` lines 74–81 | `spawn(..., {detached: true}); child.unref(); process.exit(0)` — parent exits immediately | VERIFIED [VERIFIED: codebase read] |
| Failure is non-blocking (exits 0) | `notebooklm-sync-trigger.mjs` line 87–88 and `notebooklm-sync-runner.mjs` lines 69–77 | Outer `try/catch { process.exit(0) }` in trigger; `uncaughtException`+`unhandledRejection` handlers in runner both call `process.exit(0)` | VERIFIED [VERIFIED: codebase read] |
| Log output to `~/vault/.notebooklm-sync.log` | `notebooklm-sync-runner.mjs` lines 37, 54–64 | `LOG_PATH = join(VAULT_ROOT, '.notebooklm-sync.log')` + `appendFileSync(LOG_PATH, line)` with D-14 format `{ISO} [level] message key=val` | VERIFIED [VERIFIED: codebase read] |

**Finding:** All four SYNC-01 success criteria are satisfied by existing code. No new implementation needed. The planner should schedule a single verification task (read the three hook files, confirm against criteria, mark SYNC-01 done).

**Additional coverage in runner:**
- Auth check (`notebooklm auth check`) before sync — safe against unauthenticated runs [VERIFIED: codebase read]
- Rate limit handling (`NotebooklmRateLimitError`) — logs at `info` not `error` [VERIFIED: codebase read]
- Log rotation via `_rotateLogIfNeeded(LOG_PATH)` before each run [VERIFIED: codebase read]

---

## install.mjs Inventory

### File facts [VERIFIED: codebase read]

- **Path:** `bin/install.mjs`
- **Total lines:** 1471
- **Exports:** `installNotebookLM` (named), `default` (main function)
- **Only external import:** `lib/git-scopes.mjs` — `{ detectStack, detectMainBranch, writeScopes, installSkill, createDefaultConfig, printCommitlintInstructions }`
- **Does NOT import:** `lib/shared.mjs` (this is the core problem)
- **Called from:** `bin/cli.mjs` line 237 — `import('./install.mjs')` then `setup()` (the default export)
- **Tested by:** `tests/install.test.mjs`

### Functions — complete inventory

| Function | Lines (approx) | Type | Action |
|----------|---------------|------|--------|
| `c` (color object) | 28–38 | **DUPLICATE** of `lib/shared.mjs` | Delete — import `{c}` from shared |
| `ok/fail/warn/info` | 41–44 | **DUPLICATE** of `lib/shared.mjs` | Delete — import from shared |
| `onCancel` + `prompt()` | 47–55 | **DUPLICATE** of `lib/shared.mjs` | Delete — import `{prompt}` from shared |
| `runCmd()` | 58–62 | **DUPLICATE** of `lib/shared.mjs` | Delete — import from shared |
| `hasCommand()` | 64–66 | **DUPLICATE** but uses `runCmd` shell interpolation | Delete — import fixed version from shared (shared uses `spawnSync`) |
| `mkdirp()` | 68–70 | **DUPLICATE** of `lib/shared.mjs` | Delete — import from shared |
| `mkdirpKeep()` | 73–77 | **DUPLICATE** of `lib/shared.mjs` | Delete — import from shared |
| `step()` | 79–83 | **DUPLICATE** of `lib/shared.mjs` (step() is already in shared.mjs line 73) | Delete — import from shared. D-07 is already done. |
| `getDirSuggestions()` | 86–104 | **Near-duplicate** of `askPathAutocomplete` internals in shared.mjs | See note below |
| `askPath()` | 106–116 | **DUPLICATE** (different signature — takes `defaultVal` as closure) | Delete — import `{askPath}` from shared |
| `listDirs()` | 119–128 | **DUPLICATE** of `lib/shared.mjs` | Delete — import from shared |
| `printHeader()` | 131–144 | Install-specific | → `lib/install/prereqs.mjs` or separate `header.mjs` |
| `INSTALL_HINTS` + `getInstallHint()` | 147–177 | Install-specific | → `lib/install/prereqs.mjs` |
| `checkPrerequisites()` | 180–246 | Wizard step 1 | → `lib/install/prereqs.mjs` |
| `collectProfile()` | 249–278 | Wizard step 2 | → `lib/install/profile.mjs` |
| `collectProjects()` + `addProjectsManually()` | 281–402 | Wizard step 3 | → `lib/install/projects.mjs` |
| `selectComponents()` | 405–448 | Wizard step 4 | → `lib/install/components.mjs` |
| `loadPluginData()` + `selectAndInstallPlugins()` | 452–624 | Wizard step 5 | → `lib/install/plugins.mjs` |
| `getVaultPath()` | 627–640 | Vault path collection | → `lib/install/vault.mjs` |
| `installVault()` | 643–701 | Install: vault | → `lib/install/vault.mjs` (combine with getVaultPath) |
| `installGSD()` | 704–720 | Install: GSD | → `lib/install/gsd.mjs` |
| `installObsidianSkills()` | 723–747 | Install: obsidian | → `lib/install/skills.mjs` |
| `installCustomSkills()` | 751–773 | Install: custom skills | → `lib/install/skills.mjs` (combine with obsidian) |
| `installDeepResearch()` | 776–817 | Install: deep research | → `lib/install/skills.mjs` (combine all 3 skill installers) |
| `installNotebookLM()` | 822–929 + export | Install: notebooklm | → `lib/install/notebooklm.mjs` |
| `installGitConventions()` | 935–1013 | Install: git conventions | → `lib/install/git-conventions.mjs` |
| `generateClaudeMD()` | 1016–1110 | Install: CLAUDE.md | → `lib/install/claude-md.mjs` |
| `installSessionHook()` | 1113–1204 | Install: hooks | → `lib/install/hooks.mjs` |
| `printSummary()` | 1207–1316 | Summary output | → `lib/install/summary.mjs` |
| `main()` | 1319–1460 | Orchestrator | Stays in `bin/install.mjs` (~80 lines) |

**Note on `getDirSuggestions`:** The function in install.mjs has a slightly different signature `(input, defaultVal)` vs shared's `askPathAutocomplete` which captures `defaultVal` via closure. The logic is identical. After the refactor, `askPath(message, defaultVal)` in shared already wraps the same behavior — `lib/install/*.mjs` modules should simply call `import { askPath } from '../shared.mjs'`. `getDirSuggestions` does not need to move anywhere — it disappears.

### Data flow through main() [VERIFIED: codebase read]

```
main()
  ├── checkPrerequisites()       → { pythonCmd, pipCmd }
  ├── collectProfile()           → profile { lang, codeLang }
  ├── collectProjects()          → projectsData { baseDir, projects[] }
  ├── selectComponents()         → components { vault, gsd, obsidianSkills, ... }
  ├── selectAndInstallPlugins()  → pluginResults { installed[], failed[] }
  ├── getVaultPath()             → vaultPath (string)
  ├── installVault()             ← (vaultPath, projectsData, stepNum, totalSteps)
  ├── installGSD()               ← (stepNum, totalSteps)
  ├── installObsidianSkills()    ← (skillsDir, stepNum, totalSteps)
  ├── installCustomSkills()      ← (skillsDir, stepNum, totalSteps)
  ├── installDeepResearch()      ← (skillsDir, agentsDir, stepNum, totalSteps)
  ├── installNotebookLM()        ← (pipCmd, stepNum, totalSteps)
  ├── installGitConventions()    ← (projectsData, stepNum, totalSteps)
  ├── generateClaudeMD()         ← (vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps)
  ├── installSessionHook()       ← ()
  └── printSummary()             ← (installed[], failed[], vaultPath, projectsData, components)
```

After extraction, `main()` becomes a sequential call chain with explicit param passing (D-09). `PKG_ROOT` and `skillsDir`/`agentsDir` constants must be available — these can be module-level constants in each extracted file via `import.meta.url` or passed as params.

**PKG_ROOT resolution:** Currently `const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')` — this works in `bin/install.mjs`. After extraction, `lib/install/*.mjs` are one directory deeper. Each module needing `PKG_ROOT` must compute: `resolve(dirname(fileURLToPath(import.meta.url)), '../..')`. Alternatively, pass `pkgRoot` as a parameter from the orchestrator — cleaner for testing.

---

## Standard Stack

No new libraries. Project constraint: `prompts@^2.4.2` only production dependency. [VERIFIED: package.json]

### Shared utilities already available in `lib/shared.mjs` [VERIFIED: codebase read]

| Export | Purpose | Notes |
|--------|---------|-------|
| `c` | ANSI color object | Identical definition |
| `ok, fail, warn, info` | Log helpers | Identical |
| `prompt()` | prompts wrapper with Ctrl+C | Identical |
| `runCmd()` | execSync wrapper | Identical |
| `hasCommand()` | spawnSync-based (correct, no shell injection) | install.mjs has broken version using `runCmd('which ${name}')` — import fixes this |
| `mkdirp()` | mkdir -p | Identical |
| `mkdirpKeep()` | mkdir + .gitkeep | Identical |
| `step()` | Step display | **Already in shared.mjs line 73** — D-07 is already done |
| `askPath()` | Autocomplete path input | Identical behavior |
| `listDirs()` | List subdirectories | Identical |
| `SKILLS_DIR, AGENTS_DIR, CLAUDE_DIR` | ~/.claude paths | Can replace hardcoded `join(homedir(), '.claude', ...)` in main() |
| `atomicWriteJson()` | Atomic JSON write | Available but install.mjs uses plain writeFileSync (fine to keep) |
| `spawnSync, existsSync, homedir` | Re-exported Node builtins | Available |

---

## Architecture Patterns

### Recommended module structure for `lib/install/`

```
lib/install/
├── prereqs.mjs        # printHeader, INSTALL_HINTS, getInstallHint, checkPrerequisites
├── profile.mjs        # collectProfile
├── projects.mjs       # collectProjects, addProjectsManually
├── components.mjs     # selectComponents
├── plugins.mjs        # loadPluginData, selectAndInstallPlugins
├── vault.mjs          # getVaultPath, installVault
├── gsd.mjs            # installGSD
├── skills.mjs         # installObsidianSkills, installCustomSkills, installDeepResearch
├── notebooklm.mjs     # installNotebookLM (currently exported from bin/install.mjs)
├── git-conventions.mjs # installGitConventions
├── claude-md.mjs      # generateClaudeMD
├── hooks.mjs          # installSessionHook
└── summary.mjs        # printSummary
```

**Rationale for combining skills:** `installObsidianSkills`, `installCustomSkills`, `installDeepResearch` are all skill/agent installers that share the same `skillsDir`/`agentsDir` parameters — grouping them in `skills.mjs` keeps the interface clean and reduces module count from 13 to 11.

**Rationale for combining vault:** `getVaultPath` (collection) and `installVault` (installation) are tightly coupled — `getVaultPath` returns the path that `installVault` immediately consumes. Same module.

### Thin orchestrator pattern for `bin/install.mjs` (~80 lines)

```javascript
#!/usr/bin/env node
// bin/install.mjs — Setup wizard orchestrator

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { prompt } from '../lib/shared.mjs';

import { printHeader, checkPrerequisites } from '../lib/install/prereqs.mjs';
import { collectProfile }                  from '../lib/install/profile.mjs';
import { collectProjects }                 from '../lib/install/projects.mjs';
import { selectComponents }                from '../lib/install/components.mjs';
import { selectAndInstallPlugins }         from '../lib/install/plugins.mjs';
import { getVaultPath, installVault }      from '../lib/install/vault.mjs';
import { installGSD }                      from '../lib/install/gsd.mjs';
import { installObsidianSkills, installCustomSkills, installDeepResearch } from '../lib/install/skills.mjs';
import { installNotebookLM }               from '../lib/install/notebooklm.mjs';
import { installGitConventions }           from '../lib/install/git-conventions.mjs';
import { generateClaudeMD }                from '../lib/install/claude-md.mjs';
import { installSessionHook }              from '../lib/install/hooks.mjs';
import { printSummary }                    from '../lib/install/summary.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

async function main() {
  const skillsDir = join(homedir(), '.claude', 'skills');
  const agentsDir = join(homedir(), '.claude', 'agents');

  printHeader();

  const { ready } = await prompt({ type: 'confirm', name: 'ready', message: 'Ready to start?', initial: true });
  if (!ready) { console.log('  No changes made.\n'); return; }

  const earlyTotal = '...';
  const { pythonCmd, pipCmd } = checkPrerequisites(earlyTotal);
  const profile          = await collectProfile(earlyTotal);
  const projectsData     = await collectProjects(earlyTotal);
  projectsData._profileName = profile.name;
  const components       = await selectComponents(earlyTotal, !!pipCmd);

  // ... step counting, sequential calls ...
}

export { installNotebookLM };  // preserve for tests/install.test.mjs compatibility
export default main;
```

**IMPORTANT:** `export { installNotebookLM }` must remain in `bin/install.mjs` OR `tests/install.test.mjs` must update its import path. Since tests import from `bin/install.mjs` by path string (line 24 + 250), updating the test is the cleanest approach: change import to `lib/install/notebooklm.mjs`. Re-exporting from bin is also valid to avoid touching the test during refactor.

### PKG_ROOT propagation

Two options:

1. **Pass as parameter:** `installVault(vaultPath, projectsData, stepNum, totalSteps, pkgRoot)` — clean for testing, slightly verbose
2. **Module-level constant in each lib/install/*.mjs:** `const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')` — self-contained modules, no parameter threading

Recommended: option 2 (module-level constant) for modules that need it (`vault.mjs`, `skills.mjs`, `hooks.mjs`). Functions that don't need `PKG_ROOT` don't need the import.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Path autocomplete | Custom readline | `askPath` from `lib/shared.mjs` (already exists) |
| hasCommand binary check | Shell interpolation (`which ${name}`) | `hasCommand` from `lib/shared.mjs` (uses safe `spawnSync`) |
| Directory creation | Manual existsSync + mkdirSync | `mkdirp` / `mkdirpKeep` from shared |
| Step display | Inline console.log template | `step(num, total, title)` from shared (already there) |

---

## Common Pitfalls

### Pitfall 1: `hasCommand` regression
**What goes wrong:** install.mjs currently defines `hasCommand` as `runCmd('which ${name}')` — this uses shell interpolation (potential injection if name were user-supplied). `lib/shared.mjs` has the correct `spawnSync`-based version. After deletion of the local definition, the imported version is safer and matches what was fixed in Phase 10 (WR-01).
**How to avoid:** Delete local `hasCommand`, import from shared. Tests verify `spawnSync`-based pattern in shared.

### Pitfall 2: `onCancel` behavior difference
**What goes wrong:** install.mjs `onCancel` prints `"Aborted. No changes made."` while shared.mjs `onCancel` prints `"Aborted."`. They behave identically (both `process.exit(0)`) but the message differs.
**How to avoid:** Use shared's `prompt()` which brings its own `onCancel`. The slight message difference is acceptable (no user-visible behavior change per D-05 — it is still an abort). Alternatively, keep local override. Decision left to Claude's discretion.

### Pitfall 3: Structural tests grep for function names in `bin/install.mjs` source
**What goes wrong:** `tests/install.test.mjs` does `readFileSync(installMjsPath, 'utf8')` and then greps the source text for patterns like `async function installNotebookLM`, `'package.json'`, `printCommitlintInstructions`, etc. After extraction, these patterns won't be in the orchestrator file.
**How to avoid:** Update the structural tests to either: (a) read from the new module file paths, or (b) change to import-based tests. The functional test that imports `installNotebookLM` from `bin/install.mjs` must update its import path to `lib/install/notebooklm.mjs` (or keep re-export in bin).

### Pitfall 4: `package.json` files field does not include `lib/install/`
**What goes wrong:** `package.json` files field is `["bin/", "lib/", "hooks/", "skills/", "templates/", "README.md", "LICENSE"]`. Since `lib/install/` is a subdirectory of `lib/`, it is already included. No change needed.
**Confirmation:** [VERIFIED: package.json] — `"lib/"` covers all subdirectories.

### Pitfall 5: `generateClaudeMD` uses dynamic import
**What goes wrong:** `generateClaudeMD` (line 1103) does `const { updateProjectMap } = await import('../lib/add-project.mjs')` — a dynamic import with a relative path relative to `bin/`. After moving to `lib/install/claude-md.mjs`, this path becomes `'../add-project.mjs'` (one level up, same `lib/` dir).
**How to avoid:** Update the dynamic import path in `claude-md.mjs` to `'../add-project.mjs'`. Better: convert to static import at module top.

### Pitfall 6: `main()` vault git sync section uses dynamic import
**What goes wrong:** Line 1418 in `main()` does `const { spawnSync: spawn } = await import('child_process')` — pointless dynamic import of a Node builtin. This is in the vault git sync block that stays in `bin/install.mjs`.
**How to avoid:** Convert to static `import { spawnSync } from 'child_process'` at top of orchestrator.

---

## Testing Strategy

### Current test baseline [VERIFIED: npm test output]
- **Total passing:** 445 tests, 0 failures
- **Test command:** `npm test` → `node --test tests/*.test.mjs`

### What `tests/install.test.mjs` currently tests [VERIFIED: codebase read]

| Test suite | Strategy | What changes after refactor |
|------------|----------|-----------------------------|
| `bin/install.mjs — structural integrity (NBLM-26 + ADR-0001)` | Grep source text of `bin/install.mjs` | Functions move to `lib/install/notebooklm.mjs` — update `installSource` path |
| `bin/install.mjs — git-conventions structural (GIT-08/09/10)` | Grep source text of `bin/install.mjs` | Functions move to `lib/install/git-conventions.mjs` — update source path |
| `bin/install.mjs — installSessionHook corrupt settings.json (WR-04)` | Grep source text of `bin/install.mjs` | Function moves to `lib/install/hooks.mjs` — update source path |
| `bin/install.mjs — installNotebookLM functional (no-python path)` | Spawns subprocess that imports `installNotebookLM` from bin path | Update to import from `lib/install/notebooklm.mjs` |

### New test files per D-08

Per decision D-08, unit tests per extracted module go in `tests/install/` directory or as `tests/install-*.test.mjs` files. Given existing pattern (flat `tests/` directory), `tests/install-*.test.mjs` naming is consistent with project conventions.

Key modules to test:
- `lib/install/prereqs.mjs` — `checkPrerequisites` (stub hasCommand/runCmd)
- `lib/install/notebooklm.mjs` — `installNotebookLM` (existing functional test migrates here)
- `lib/install/hooks.mjs` — `installSessionHook` (existing WR-04 test migrates here)
- `lib/install/git-conventions.mjs` — structural tests from existing suite migrate here

Note: `npm test` glob is `tests/*.test.mjs` — subdirectory `tests/install/` will NOT be picked up. Use flat naming (`tests/install-prereqs.test.mjs`, etc.) or update the test script to `node --test 'tests/**/*.test.mjs'`.

**Recommendation:** Use flat naming to avoid changing `package.json` test script.

---

## Key Finding: D-07 Already Done

`step()` is already exported from `lib/shared.mjs` at line 73:

```javascript
export function step(num, total, title) {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Step ${num} of ${total} —${c.reset} ${c.bold}${title}${c.reset}`);
  console.log('');
}
```

The planner must NOT create a task to add `step()` to shared.mjs — it is already there. install.mjs just needs to import it.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code refactoring with no external dependencies. No new tools, services, or CLIs are required.

---

## Validation Architecture

### Test Framework [VERIFIED: package.json, tests/]

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node.js native, no external dependency) |
| Config file | None — test command in `package.json` scripts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SYNC-01 | Verification: sync chain meets all 4 criteria | Manual review (code inspection) | — | N/A (verification, not new code) |
| REFACTOR-01 | Structural tests pass after extraction | unit | `npm test` | `tests/install.test.mjs` exists, needs path updates |
| REFACTOR-01 | New modules importable | unit | `npm test` (new install-*.test.mjs files) | No — Wave 0 gap |
| REFACTOR-01 | Orchestrator ≤ 100 lines | structural | `wc -l bin/install.mjs` | N/A |

### Wave 0 Gaps
- [ ] `tests/install-prereqs.test.mjs` — covers checkPrerequisites extraction
- [ ] `tests/install-notebooklm.test.mjs` — migrated functional test from install.test.mjs
- [ ] `tests/install-hooks.test.mjs` — migrated WR-04 test from install.test.mjs
- [ ] `tests/install-git-conventions.test.mjs` — migrated GIT-08/09/10 structural tests

*(Alternatively: update `tests/install.test.mjs` in-place to point to new module paths — fewer files, simpler)*

---

## Security Domain

No new security surface. The refactor moves existing code into modules — behavior is preserved (D-05). The `hasCommand` import from shared.mjs improves security (removes shell interpolation) but this was already fixed in Phase 10 (WR-01) in shared.mjs; the local duplicate in install.mjs was just never removed.

| ASVS Category | Applies | Note |
|---------------|---------|------|
| V5 Input Validation | No new input | Refactor only |
| V6 Cryptography | No | Not applicable |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `step()` being already in shared.mjs means D-07 requires no implementation | Key Finding | Low — code was read directly from lib/shared.mjs line 73 |

All other claims were verified by reading source files directly.

---

## Open Questions

1. **`onCancel` message difference**
   - What we know: install.mjs says "Aborted. No changes made." / shared.mjs says "Aborted."
   - What's unclear: Whether D-05 ("no wizard behavior changes") covers abort messages
   - Recommendation: Use shared's `prompt()` as-is; the abort message difference is cosmetic. If preserving exact message matters, pass a custom `onCancel` override.

2. **`getDirSuggestions` signature mismatch**
   - What we know: install.mjs `askPath(message, defaultVal)` passes `defaultVal` to `getDirSuggestions`. shared.mjs `askPath` delegates to `askPathAutocomplete` which captures `defaultVal` via closure.
   - What's unclear: Are they functionally identical for all callers? Yes — all callers pass a string `defaultVal` and both implementations behave the same.
   - Recommendation: Delete local `askPath`/`getDirSuggestions`, import `{askPath}` from shared. No behavior change.

---

## Sources

### Primary (HIGH confidence)
- `bin/install.mjs` — read directly (1471 lines, full function inventory)
- `lib/shared.mjs` — read directly (147 lines, confirmed all exports including step())
- `hooks/session-end-check.sh` — read directly (68 lines)
- `hooks/notebooklm-sync-trigger.mjs` — read directly (89 lines)
- `hooks/notebooklm-sync-runner.mjs` — read directly (150 lines)
- `tests/install.test.mjs` — read directly (282 lines)
- `package.json` — files field, bin field, version confirmed
- `npm test` output — 445 tests, 0 failures (current baseline)

### Secondary (MEDIUM confidence)
- None needed — all findings from direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- SYNC-01 verification: HIGH — all four criteria confirmed by reading source
- install.mjs function inventory: HIGH — full file read and annotated
- Module boundary proposals: HIGH — follows locked decisions D-03/D-04/D-09
- Test impact: HIGH — tests/install.test.mjs fully read and analyzed

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable codebase, no external dependencies)
