# Phase 5: CLI Integration, Trigger & Wizard — Research

**Researched:** 2026-04-11
**Domain:** Node.js subprocess management, CLI glue code, bash hook extension, install wizard UX
**Confidence:** HIGH (all key behaviors empirically verified on dev machine)

---

## Summary

Phase 5 is a glue phase. The sync engine (Phase 4), manifest (Phase 3), client wrapper (Phase 2), and session hook (Phase 1) are all shipped and working. This phase wires them into three user-facing surfaces: (1) `claude-dev-stack notebooklm sync|status` CLI commands, (2) a detached background trigger fired from the session-end hook, and (3) an interactive wizard step in `bin/install.mjs` that handles binary detection, `pipx`/`pip` installation, browser OAuth, and a first sync.

All subprocess behaviors (detached spawn, stdio inheritance, auth check semantics) were verified by running commands on the dev machine. The main non-obvious risk is the `case 'status':` collision in `bin/cli.mjs` — an existing analytics case must not be disturbed. The install wizard `installNotebookLM` function already exists at line 816 and does something different from what Phase 5 needs — it must be replaced or extended, not called alongside the new wizard step. The managed gitignore block extension from 3 to 4 entries requires updating one specific test (T3-07 at line 309) in `tests/notebooklm-manifest.test.mjs`.

**Primary recommendation:** Follow CONTEXT.md decisions exactly. All discretion items are resolvable with the empirical findings below. The largest risk is the `installNotebookLM` function collision — read the section on the install wizard carefully before writing the plan task.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `lib/notebooklm-cli.mjs` with `main(args)` handler (NOT added to `lib/notebooklm.mjs`). Dispatches to `runSync` / `runStatus` / `printNotebooklmHelp`.
- **D-02:** `bin/cli.mjs` adds `case 'notebooklm':` branch with lazy import pattern. Extends `printHelp()` with new section.
- **D-03:** `runSync` calls `syncVault` inline. `runStatus` calls `syncVault({ dryRun: true })` and reads `manifest.generated_at`. Unknown subcommand → error + help.
- **D-04:** New `hooks/notebooklm-sync-trigger.mjs` — Node wrapper invoked from bash hook. Does `hasCommand` check, spawns detached runner, exits immediately. Invocation in bash: `2>/dev/null || true`.
- **D-05:** Separate `hooks/notebooklm-sync-runner.mjs` — detached subprocess. Writes log, runs `notebooklm auth check` via Phase 2 spawn, calls `syncVault`, writes result to log. Exit 0 always.
- **D-06:** Env var propagation via `VAULT_PATH=... node $wrapper` idiom. Falls back to `findVault()` if absent.
- **D-07:** Trigger inserted in `session-end-check.sh` AFTER context update (step 2) and BEFORE vault git push (step 3).
- **D-08:** Replace placeholder in `bin/install.mjs:1103-1114`. Real wizard step: binary detect → offer `pipx install notebooklm-py` → fallback `pip install --user` → `notebooklm login` interactive → `notebooklm auth check` verify → first sync prompt.
- **D-09:** `pipx` first, `pip --user` fallback. `uv` deferred.
- **D-10:** `notebooklm login` via `spawnSync('notebooklm', ['login'], { stdio: 'inherit' })`. Blocks wizard.
- **D-11:** First sync inline blocking after auth check passes. User prompted with "Run first sync now? (Y/n)".
- **D-12:** `notebooklm status` uses `syncVault({ dryRun: true })` + `readManifest` for `generated_at`. Prints 3-4 lines. Fresh vault exits 0 with "no sync yet" (TEST-02).
- **D-13:** Doctor 3 lines: binary (`info` not `fail` if absent), auth check, last sync. Binary absence is `info` level.
- **D-14:** Log format: plain text, `{ISO} [level] message key=val`. Location: `~/vault/.notebooklm-sync.log`. No rotation.
- **D-15:** Extend Phase 3 `ensureManifestGitignored` managed block to 4 entries (add `.notebooklm-sync.log`). Phase 5 plan includes the helper change AND the corresponding test updates in the same task.

### Claude's Discretion

- Exact `notebooklm sync` CLI output format (tabular vs line-per-file vs summary-only)
- Wizard step number in `bin/install.mjs` (depends on other optional steps)
- How `runStatus` reports stale files (count only, or truncated list)
- Whether `notebooklm-sync-runner.mjs` imports Phase 4 directly or shells out
- Whether to add `notebooklm help` subcommand or fold into `-h`/`--help`
- Fixture strategy for trigger + runner tests
- Doctor "Last sync" parse logic (regex on log vs manifest `generated_at`)
- Error handling if runner crashes (uncaughtException → write crash line to log)
- Whether install wizard remembers "user skipped NotebookLM" across runs

### Deferred Ideas (OUT OF SCOPE)

- Cron-based periodic sync
- Per-project notebooks
- Sync log rotation / size limits
- Concurrent sync lock
- `uv` as install alternative
- Sync progress streaming
- Notebook name change migration
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-19 | `claude-dev-stack notebooklm sync` CLI command | D-01/D-02/D-03; lazy import pattern in cli.mjs verified at lines 80-203 |
| NBLM-20 | `claude-dev-stack notebooklm status` shows last sync, file count, stale count | D-12; `syncVault({ dryRun: true })` returns `stats.planned[]`; `readManifest` returns `generated_at` |
| NBLM-21 | Session-end triggers background sync only if binary + auth check passes | D-04/D-05; `notebooklm auth check` exits 0 when authenticated (verified) |
| NBLM-22 | Trigger uses detached `spawn` + `.unref()` — session end not blocked | VERIFIED: `spawn({detached:true, stdio:['ignore', fd, fd]}).unref()` works on macOS |
| NBLM-23 | Sync failures logged, never surfaced to terminal; binary absence = info level | D-05 runner exits 0 always; bash invocation `2>/dev/null \|\| true` |
| NBLM-24 | `bin/cli.mjs` routes `notebooklm` subcommand | D-02; insertion after `case 'mcp':` (line 127) is cleanest; `case 'status':` collision documented |
| NBLM-25 | Help text includes `notebooklm sync` and `notebooklm status` | D-02; new section in `printHelp()` function (lines 20-75) |
| NBLM-26 | Install wizard: detect → install → login → auth check | D-08/D-09/D-10/D-11; `installNotebookLM` at line 816 already exists but does something different |
| NBLM-27 | `lib/doctor.mjs` adds 3 NotebookLM lines | D-13; insert after prerequisites section ~line 63; binary absent = `info()` not `fail()` |
| TEST-02 | `tests/project-setup.test.mjs` smoke test for fresh vault `notebooklm status` | D-12; fresh vault exits 0 with "no sync yet"; test pattern from existing file documented |
</phase_requirements>

---

## Runtime-Verified CLI Findings

### R1 — `notebooklm auth check` exit semantics [VERIFIED: dev machine, 2026-04-11]

**Exit 0 (authenticated):** Command prints a rich Rich-library table to stdout showing storage_exists, json_valid, cookies_present, sid_cookie checks, followed by "Authentication is valid." text. Exit code: `0`.

**`--json` flag:** Supported. Output is a JSON object with shape:
```json
{
  "status": "ok",
  "checks": {
    "storage_exists": true,
    "json_valid": true,
    "cookies_present": true,
    "sid_cookie": true,
    "token_fetch": null
  },
  "details": {
    "storage_path": "/Users/.../.notebooklm/storage_state.json",
    "auth_source": "file (...)",
    "cookies_found": ["NID", "SID", ...],
    "cookie_domains": [".google.com", ...],
    "error": null
  }
}
```

**For Phase 5 purposes:** The `--json` flag enables machine-readable detection. Exit code 0 = authenticated. The runner should use plain `spawnSync('notebooklm', ['auth', 'check'], { stdio: ['ignore', 'pipe', 'pipe'] })` and check `result.status === 0` — no JSON parsing needed in the trigger. The wizard verification step can optionally parse `--json` to provide better error messaging.

**Unauthenticated exit code:** [ASSUMED] Exit code will be non-zero (1 or 2) based on `--help` documentation that describes checking storage file, JSON validity, cookies. A missing or expired storage state would fail the "Storage exists" or "Cookies present" checks, and the tool would exit non-zero with "Authentication failed" or similar. Phase 5 does not need to distinguish the specific failure mode — any non-zero exit code means "skip the sync".

**`--test` flag:** Performs a network request to verify token fetch. The runner should NOT use `--test` — it adds network latency to the auth check, and the actual sync call will catch auth failures anyway.

### R2 — `notebooklm login` subprocess behavior [VERIFIED: --help output, 2026-04-11]

From `notebooklm login --help`:
```
Usage: notebooklm login [OPTIONS]

  Log in to NotebookLM via browser.

  Opens a browser window for Google login. After logging in, press ENTER in
  the terminal to save authentication.

  Note: Cannot be used when NOTEBOOKLM_AUTH_JSON is set

Options:
  --storage PATH  Where to save storage_state.json
  --help          Show this message and exit.
```

**Key behavior:** Opens a browser window, then waits for the user to press ENTER in the terminal. This is NOT a URL-print-and-wait pattern — it opens the browser programmatically (Playwright-based). The user must switch to the browser, complete Google OAuth, then return to the terminal and press ENTER.

**D-10 is confirmed correct:** `spawnSync('notebooklm', ['login'], { stdio: 'inherit' })` allows:
- The browser open instruction to be displayed
- The ENTER keypress to be captured from the terminal
- The wizard to block until login completes

**No `--headless` or `--device-code` flag exists.** Browser OAuth is the only supported login method. `NOTEBOOKLM_AUTH_JSON` env var is a possible alternative (env-injected credentials) but is explicitly excluded from Phase 5 scope (ADR-0001).

**Ctrl+C behavior:** If user presses Ctrl+C during `spawnSync`, `prompts` `onCancel` is already set in `lib/shared.mjs` to call `process.exit(0)`. However, the wizard is NOT using `prompts` here — it's using `spawnSync` directly. Ctrl+C during `spawnSync` with `stdio: 'inherit'` sends SIGINT to the child process, which terminates the `notebooklm login` subprocess. The wizard should check `result.signal === 'SIGINT'` and handle gracefully (treat as "user cancelled login, skip").

### R3 — `pipx` and `pip --user` detection reliability [VERIFIED: dev machine, 2026-04-11]

```
which pipx      → /opt/homebrew/bin/pipx    (in PATH)
pipx --version  → 1.7.1

python3 -m pip --version → pip 24.2 (python 3.12)
```

**`lib/shared.mjs::hasCommand` semantics** [VERIFIED: lib/shared.mjs line 48-50]:
```javascript
export function hasCommand(name) {
  return runCmd(`which ${name}`) !== null;
}
```
Uses `which` via `execSync`. Returns `true` if `which pipx` succeeds (exit 0), `false` otherwise. Pure PATH-based check — no version validation, no filesystem validation beyond what `which` does. Works cross-platform for macOS/Linux. Windows: `which` may not be available — but the existing `installNotebookLM` at line 820 already uses `${pipCmd} install ...` suggesting Windows compatibility is not a tested concern in this codebase.

**Note:** `hasCommand('pipx')` will return `true` on this dev machine. The fallback `python3 -m pip` is NOT detectable via `hasCommand` since `hasCommand` only checks for a binary name, not a module. The wizard needs to use `runCmd('python3 -m pip --version')` to detect `pip --user` availability as a fallback.

### R4 — `spawnSync` with `stdio: 'inherit'` for interactive login [VERIFIED: Node docs + behavior reasoning]

`spawnSync` is synchronous by definition — it blocks the calling process until the child exits. With `stdio: 'inherit'`, the child inherits the parent's stdin/stdout/stderr file descriptors. The browser opens in the OS, user interacts with it, returns to terminal, presses ENTER on the inherited stdin. This is the standard interactive-subprocess-in-wizard pattern.

**The wizard hangs during OAuth:** This is expected and correct behavior. The user could take 10 minutes on OAuth. There is no reasonable timeout to add — the call must block until the user completes login or Ctrl+C. D-10 accepts this blocking behavior explicitly.

**Post-`spawnSync` result shape:**
```javascript
const result = spawnSync('notebooklm', ['login'], { stdio: 'inherit' });
// result.status  — exit code (0 = success)
// result.signal  — 'SIGINT' if Ctrl+C was pressed
// result.error   — Error object if spawn failed (ENOENT = binary missing)
```

### R5 — `spawn` with `detached: true` + `.unref()` [VERIFIED: live test on dev machine, 2026-04-11]

**Test run (empirically verified):**
- Wrote a Node script that calls `spawn(process.execPath, [...], { detached: true, stdio: ['ignore', logFd, logFd] })` and `.unref()`
- Parent exited immediately
- Child process (pid 11206) continued running and successfully appended to the log file
- Log file contained the expected ISO timestamp line after parent exit

**Exact pattern that works:**
```javascript
import { spawn } from 'child_process';
import { openSync } from 'fs';

const logFd = openSync(logPath, 'a');  // open for append
const child = spawn(process.execPath, [runnerPath], {
  detached: true,
  stdio: ['ignore', logFd, logFd],  // stdout + stderr both go to log file
  env: { ...process.env }
});
child.unref();  // release parent event loop — parent can exit
```

**Key finding:** The `logFd` must be an open file descriptor (integer), not a filename string. `openSync(path, 'a')` returns the fd. Node automatically inherits this fd to the child process.

**Race condition with vault git push (D-07):** The trigger exits in <100ms (just spawns + unref + exit). The vault auto-push happens AFTER the trigger call in the hook. The runner writes append-only single-line entries to the log. Even if the runner is mid-write when vault push tries to commit, the log is NOT tracked by vault git (it's in `.gitignore` per D-15). No race condition.

### R6 — Log parsing strategy for doctor "last sync" line

**Option A: Parse `~/vault/.notebooklm-sync.log` tail for last `sync done` line**
- Read entire file, split on `\n`, find last line matching `\[info\] sync done`
- Risk: log grows unboundedly (no rotation in Phase 5). For a large log (1000 sessions = ~200 lines avg per day × 365 days = 73K lines max), reading the entire file is still fast on modern hardware (<5ms for 1MB). Acceptable for doctor which is not performance-sensitive.
- Implementation: `readFileSync(logPath, 'utf8').split('\n').reverse().find(l => l.includes('[info] sync done'))`

**Option B: Read `manifest.generated_at` directly from `readManifest(vaultRoot)`**
- Clean, fast, no file parsing
- `manifest.generated_at` is updated on every `writeManifest` call (line 243 of notebooklm-manifest.mjs: `manifest.generated_at = new Date().toISOString()`)
- **However:** `generated_at` is updated by the manifest write on EACH successful upload, not at the end of a sync run. If sync was partially completed, `generated_at` reflects the last successful file upload, not the completion of the sync run.
- The log's `sync done` line is written by the runner at the END of a successful full sync run, which is a more accurate "last sync completed" timestamp.

**Recommendation for Claude's Discretion item:** Use `manifest.generated_at` for doctor Line 3 (simpler, no log parsing, represents the last time ANY file was synced). For the "stale days" warning threshold, compare against `Date.now()`. If the manifest does not exist (fresh vault), doctor prints `info('last sync: never')`. This approach is cleaner and avoids optional log file dependency. The log file should remain an opaque diagnostic artifact, not a parsed data source.

### R7 — `ensureManifestGitignored` managed block extension [VERIFIED: source read, 2026-04-11]

Current managed block in `lib/notebooklm-manifest.mjs` (lines 285-289):
```javascript
const blockWithoutLeadingBlank =
  '# Claude Dev Stack — NotebookLM sync state (do not commit)\n' +
  '.notebooklm-sync.json\n' +
  '.notebooklm-sync.json.tmp\n' +
  '.notebooklm-sync.corrupt-*';
```

**Extension adds 4th line:** `.notebooklm-sync.log` inserted after `.notebooklm-sync.corrupt-*`.

**Idempotency invariant preserved:** The function checks for presence of `.notebooklm-sync.json` (the sentinel line, line 299). Since that line is not changing, the idempotency guard is still correct — existing vaults already have the managed block and won't have `.notebooklm-sync.log` added a second time on re-run. The guard only fires based on `.notebooklm-sync.json` presence, not on complete block equality. This means: existing vaults that already have `.notebooklm-sync.json` in their `.gitignore` will NOT get `.notebooklm-sync.log` added on next run — the guard returns early at line 300. This is an existing design choice (D-19).

**CRITICAL IMPLICATION:** The log file gitignore entry will only be added to vaults that have never been through Phase 3's `ensureManifestGitignored` before. Vaults that went through Phase 3 already have `.notebooklm-sync.json` → the guard fires → `.notebooklm-sync.log` is never added. Phase 5 must check if an existing vault already has the 3-entry block and add only the log entry. This requires either:
1. Change the sentinel check to also verify `.notebooklm-sync.log` is present, OR
2. Add a separate gitignore check for `.notebooklm-sync.log` that runs regardless of block presence

**Recommended approach (resolving Claude's Discretion):** Extend the idempotency check to check for `.notebooklm-sync.log` presence separately. If `.notebooklm-sync.json` is present (existing block) but `.notebooklm-sync.log` is absent, append just the `.notebooklm-sync.log` line to the file. This handles the migration case for existing Phase 3 vaults.

**Tests that MUST be updated:**
- `tests/notebooklm-manifest.test.mjs` line 309: `it('managed block contains all three entries (T3-07 — D-22)'` → must become "all four entries"
- Line 312-314: add `assert.ok(content.includes('.notebooklm-sync.log'))` to the assertion
- Idempotency test at line 279 (T3-04) and line 287 (T3-05) still valid — they just check `.notebooklm-sync.json` count

---

## Node Subprocess API Deep Dive

### `spawnSync` with `stdio: 'inherit'` (D-10 — wizard login)

```javascript
import { spawnSync } from 'child_process';

// Blocks until notebooklm login completes
const result = spawnSync('notebooklm', ['login'], { stdio: 'inherit' });

if (result.error) {
  // ENOENT: binary not found (shouldn't happen — already checked with hasCommand)
  warn(`Login failed: ${result.error.message}`);
} else if (result.signal === 'SIGINT') {
  // User pressed Ctrl+C
  info('Login cancelled. You can run "notebooklm login" manually later.');
} else if (result.status !== 0) {
  // Login returned non-zero (unusual — notebooklm login always exits 0 on completion)
  warn(`Login may not have completed. Run "notebooklm login" manually if needed.`);
}
```

`lib/shared.mjs` exports `spawnSync` at line 133: `export { spawnSync, existsSync, homedir }`. The wizard can import it from shared rather than re-importing from `child_process`.

### `spawn` with `detached: true` + `.unref()` (D-04 — trigger)

```javascript
import { spawn } from 'child_process';
import { openSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Open log for append (creates file if absent)
const logPath = join(process.env.VAULT_PATH || `${homedir()}/vault`, '.notebooklm-sync.log');
const logFd = openSync(logPath, 'a');

const runnerPath = new URL('./notebooklm-sync-runner.mjs', import.meta.url).pathname;

const child = spawn(process.execPath, [runnerPath], {
  detached: true,
  stdio: ['ignore', logFd, logFd],
  env: { ...process.env }   // Pass VAULT_PATH, NOTEBOOKLM_NOTEBOOK_NAME
});

child.unref();
process.exit(0);
```

**Note on `import.meta.url`:** The trigger and runner are both in `hooks/`. Using `new URL('./notebooklm-sync-runner.mjs', import.meta.url).pathname` gives the absolute path to the runner sibling file. This matches the `hooks/update-context.mjs` pattern (Phase 1) which uses `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"` from bash, but at the Node level `import.meta.url` is cleaner.

### Runner subprocess structure (D-05)

The runner runs as a detached process. Its imports create a clean module boundary for testing. Key behaviors:
1. Any unhandled exception must NOT reach the OS unhandled-rejection handler (which would print to stderr despite `stdio: 'ignore'`). The runner must wrap everything in `try/catch` + `process.on('uncaughtException')`.
2. The `process.on('uncaughtException')` handler writes a `[error]` line to the log before exiting 0.
3. The runner should NOT call `process.exit()` except at the end — early exits skip the "sync done" log line.

---

## Phase 3 Gitignore Block Extension Analysis

### Files to modify

**`lib/notebooklm-manifest.mjs`** — `ensureManifestGitignored` function (lines 280-318):
- Change `blockWithoutLeadingBlank` to include 4th line `.notebooklm-sync.log`
- Update idempotency sentinel to check for `.notebooklm-sync.log` separately (see R7 analysis above)

**`tests/notebooklm-manifest.test.mjs`** — single test to update:
- Line 309: `it('managed block contains all three entries (T3-07 — D-22)'` → rename to "all four entries"
- Lines 312-314: add `assert.ok(content.includes('.notebooklm-sync.log'))` assertion
- All other gitignore tests (T3-01 through T3-06, T3-08) remain valid without modification — they don't check the specific entries in the block, only presence of `.notebooklm-sync.json`

**Migration consideration:** Existing Phase 3 vaults already have the 3-entry block. The current sentinel check (`.notebooklm-sync.json` presence) will fire and return early — the 4th log line will never be added. Phase 5 plan must include the migration logic change to handle this (see R7 above).

---

## Install Wizard Insertion Points

### Critical finding: `installNotebookLM` already exists at line 816

The existing `installNotebookLM(pipCmd, stepNum, totalSteps)` function (lines 816-832) does:
1. Calls `pip install "notebooklm-py[browser]"` (synchronously via `runCmd`)
2. Runs `playwright install chromium`
3. Runs `notebooklm skill install`
4. Prints `warn('Run "notebooklm login" to authenticate with Google')` — instructs user to login manually
5. Returns boolean

This function is called at line 1215:
```javascript
if (components.notebooklm) {
  installNotebookLM(pipCmd, stepNum++, totalSteps)
    ? installed.push('NotebookLM') : failed.push('NotebookLM');
}
```

**D-08 says:** "Replace the placeholder at lines 1103-1114." The placeholder (lines 1103-1114) is in the FINAL SUMMARY section (the `showInstructions` function called to display post-install guidance). The ACTUAL wizard step calling `installNotebookLM` is at line 1214.

**The Phase 5 task must:**
1. Replace the `installNotebookLM` function body (lines 816-832) with the full D-08/D-09/D-10/D-11 flow (binary detection, pipx/pip install, `notebooklm login` interactive, auth check, first sync prompt)
2. Update the caller at line 1215 if the function signature changes
3. Replace the placeholder in `showInstructions` (lines 1103-1114) with better summary text about the sync feature (not install instructions anymore — those already ran)

**Note on package name:** Existing `installNotebookLM` uses `"notebooklm-py[browser]"` (with the `[browser]` extra). The D-09 specification says `pipx install notebooklm-py` and `pip install --user notebooklm-py` without `[browser]`. Verify which is correct — `[browser]` extra installs Playwright which is needed for OAuth login. The package name with `[browser]` is almost certainly correct and should be used in Phase 5 as well.

### Step numbering analysis

From `bin/install.mjs` main() at lines 1165-1175:
```javascript
const setupSteps = 6; // prereqs, profile, projects, components, plugins, vault
const installCount = [
  components.vault,
  components.gsd,
  components.obsidianSkills,
  components.customSkills,
  components.deepResearch,
  components.notebooklm,
].filter(Boolean).length;
const totalSteps = setupSteps + installCount + 1; // +1 for CLAUDE.md
```

The `components.notebooklm` flag is already in the `installCount` calculation. The step counter `stepNum++` is managed sequentially through the install block (line 1184: `let stepNum = setupSteps + 1`). Phase 5 does NOT need to change the step counting logic — the `installNotebookLM` call at line 1215 already gets the right step number. The wizard step number is computed correctly for the user.

### Correct insertion point summary

| Location | Action | What to change |
|----------|--------|---------------|
| `bin/install.mjs:816-832` | Replace function body | Full D-08..D-11 wizard flow |
| `bin/install.mjs:1103-1114` | Replace placeholder | Summary text about sync (not install instructions) |
| `bin/install.mjs:1214-1216` | Keep as-is | Caller already correct |

---

## CLI Routing & Name Collision Analysis

### Verified collision: `case 'status':` at line 158

`bin/cli.mjs` line 158 (VERIFIED):
```javascript
case 'analytics':
case 'stats':
case 'status': {
  const { main } = await import('../lib/analytics.mjs');
  await main(args.slice(1));
  break;
}
```

`claude-dev-stack status` routes to `lib/analytics.mjs`. Phase 5 must NOT create a top-level `case 'status':` or add `'status'` as an alias to any other case. The `notebooklm status` subcommand lives INSIDE `lib/notebooklm-cli.mjs`'s dispatch and is only reachable via `claude-dev-stack notebooklm status` — never at top level.

### Cleanest insertion point for `case 'notebooklm':`

After `case 'mcp':` (line 123) and before `case 'template':` (line 130). Fits the logical grouping: mcp/plugins/skills are infrastructure commands; notebooklm is a new infrastructure command. Suggested insertion:

```javascript
// ── NotebookLM ──
case 'notebooklm': {
  const { main } = await import('../lib/notebooklm-cli.mjs');
  await main(args.slice(1));
  break;
}
```

No existing `case 'notebooklm':` exists in the file [VERIFIED: grep found no match].

### `printHelp()` extension

The help function (lines 20-75) has a section structure: Setup, Projects, Documents, Skills, Plugins, MCP Servers, Templates, Import & Export, Analytics, Maintenance, Other. Insert a new "NotebookLM Sync" section after Analytics and before Maintenance:

```javascript
console.log(`  ${c.cyan}${c.bold}NotebookLM Sync${c.reset}`);
console.log(`    ${c.white}claude-dev-stack notebooklm sync${c.reset}     ${c.dim}Sync vault to NotebookLM notebook${c.reset}`);
console.log(`    ${c.white}claude-dev-stack notebooklm status${c.reset}   ${c.dim}Show last sync, file count, stale files${c.reset}`);
console.log('');
```

---

## Session-End-Check.sh Integration

### Current hook structure [VERIFIED: hooks/session-end-check.sh, 59 lines]

Inside the `if ls "$SESSION_DIR/$TODAY"*.md` branch (line 29-52):
1. Lines 31-39: `update-context.mjs` invocation (Phase 1 context update)
2. Lines 42-50: vault auto-push (`git add -A`, `git commit`, `git push`)

### Phase 5 insertion point (D-07)

Insert trigger call AFTER `update-context.mjs` invocation (after line 39) and BEFORE the vault auto-push block (before line 42). Pattern mirrors Phase 1's `update-context.mjs` invocation exactly:

```bash
# Trigger NotebookLM background sync (D-04 fire-and-forget)
TRIGGER="$SCRIPT_DIR/notebooklm-sync-trigger.mjs"
if [ -f "$TRIGGER" ]; then
  VAULT_PATH="$VAULT" node "$TRIGGER" 2>/dev/null || true
fi
```

**Why 3-5 lines only:** The trigger does its own `hasCommand` check and exits immediately — no need for the hook to replicate detection logic. Bash `2>/dev/null || true` provides the double-safety that Phase 1 already uses for `update-context.mjs`.

**Ordering guarantee (D-07 verified):** Context update runs at hook execution lines ~37-39. Trigger runs at new lines ~40-44. Vault git push runs at lines ~43-50 (will shift by ~5 lines). Context.md is committed in the same vault push because it's updated BEFORE the push, and trigger exits before push starts.

---

## Log Parsing Strategy Recommendation

**Resolution for Claude's Discretion item: Use `manifest.generated_at`**

The `manifest.generated_at` field is updated by `writeManifest` on every write (line 243 of `notebooklm-manifest.mjs`). It represents the last time the manifest was successfully modified (i.e., a file was uploaded or the manifest was initialized).

For doctor Line 3:
```javascript
const manifest = readManifest(vaultRoot);
const lastSync = manifest.generated_at;  // ISO string or undefined (fresh manifest)

if (!lastSync || Object.keys(manifest.files).length === 0) {
  info('last sync: never');
} else {
  const ageMs = Date.now() - new Date(lastSync).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const fileCount = Object.keys(manifest.files).length;
  if (ageDays > 3) {
    warn(`last sync: ${ageDays} day(s) ago, ${fileCount} files tracked`);
  } else {
    ok(`last sync: ${ageDays === 0 ? 'today' : ageDays + ' day(s) ago'}, ${fileCount} files tracked`);
  }
}
```

The log file is a diagnostic tool, not a metadata source. Keeping doctor independent of the log reduces coupling.

---

## Fresh Vault Smoke Test Pattern (TEST-02)

### Existing `tests/project-setup.test.mjs` pattern [VERIFIED: file read]

The file uses:
- `before()` / `after()` lifecycle hooks
- `join(tmpdir(), 'claude-test-setup-${process.pid}')` as temp base
- `mkdirSync`, `rmSync`, `writeFileSync` for fixture setup
- Tests call library functions directly (not CLI subprocess calls)

**TEST-02 requires running the CLI command** (`claude-dev-stack notebooklm status`), not calling a library function directly. The correct pattern is:

```javascript
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.mjs');

// Run: node bin/cli.mjs notebooklm status
const result = execFileSync(process.execPath, [cliPath, 'notebooklm', 'status'], {
  env: { ...process.env, VAULT_PATH: freshVaultPath },
  encoding: 'utf8',
  stdio: 'pipe',
});
// Assert: exits 0 (no exception thrown by execFileSync), output contains "never" or "no sync"
```

`execFileSync` throws on non-zero exit. TEST-02 passes if it does NOT throw.

**Fresh vault setup** for TEST-02:
1. `mkdtempSync(join(tmpdir(), 'claude-test-nb-status-'))` — fresh temp dir
2. `mkdirSync(join(freshVault, 'projects'))` — minimal vault structure (so `findVault` or explicitly passing `VAULT_PATH` works)
3. No manifest file (first-time state)
4. Run `node cli.mjs notebooklm status` with `VAULT_PATH=freshVault`
5. Assert exits 0

**Note on `syncVault({ dryRun: true })` in `runStatus`:** On a fresh vault, `walkProjectFiles` will return an empty array (no projects folder content), `readManifest` will return an empty manifest. `syncVault({ dryRun: true })` will succeed with `stats.planned = []`. `runStatus` should handle `planned.length === 0` and `manifest.generated_at = undefined` gracefully with "never" output.

**Risk:** `syncVault({ dryRun: true })` calls `findVault()` if `vaultRoot` is not passed. For TEST-02, the test must pass `VAULT_PATH` env var so `syncVault` uses the temp dir rather than the real vault. The `NOTEBOOKLM_NOTEBOOK_NAME` env var may also need to be set or `notebooklm-cli.mjs::runStatus` must extract `vaultRoot` from the environment and pass it explicitly to `syncVault`.

---

## Pitfalls Identified

### Pitfall 1: `installNotebookLM` function already exists with different semantics

**What goes wrong:** A planner who reads only the placeholder at lines 1103-1114 (the final summary section) thinks "replace this" and creates a new function. But `installNotebookLM` at line 816 already runs during the ACTIVE wizard steps at line 1215. Phase 5 needs to replace the FUNCTION BODY at line 816, not just the final-summary text at lines 1103-1114.

**Why it happens:** The CONTEXT.md D-08 says "Replace placeholder at lines 1103-1114" but those lines are in the summary display function (`showInstructions`), not in the wizard installation logic. The real wizard step is `installNotebookLM` at 816.

**How to avoid:** Plan task must modify BOTH `installNotebookLM` body (lines 816-832) AND the `showInstructions` block (lines 1103-1114). Treating them as one change in one commit.

### Pitfall 2: `case 'status':` top-level collision in `bin/cli.mjs`

**What goes wrong:** Developer accidentally adds `case 'status':` routing in `bin/cli.mjs` thinking "notebooklm status needs a case" or a reviewer sees the analytics alias and adds another. `claude-dev-stack status` breaks and routes to wrong handler.

**Why it happens:** `notebooklm status` is a SUBCOMMAND of `notebooklm`, not a top-level command. The routing happens inside `lib/notebooklm-cli.mjs::main(args)` where `args[0] === 'status'`. The top-level `case 'notebooklm':` passes `args.slice(1)` to the lib module.

**How to avoid:** Test task must include: `node bin/cli.mjs status` must still route to analytics (not notebooklm). Add this as an acceptance criterion.

### Pitfall 3: `ensureManifestGitignored` migration for existing Phase 3 vaults

**What goes wrong:** Phase 5 adds `.notebooklm-sync.log` to the managed block string, runs `ensureManifestGitignored` in the trigger/runner startup, but existing vaults that ran through Phase 3 already have `.notebooklm-sync.json` in their `.gitignore`. The idempotency guard at line 299 returns early and `.notebooklm-sync.log` is NEVER added to existing vaults.

**Why it happens:** The current sentinel (`any line trim-equals .notebooklm-sync.json`) is designed to prevent re-adding the entire block. It doesn't know about individual new entries.

**How to avoid:** Phase 5 changes `ensureManifestGitignored` to have a two-phase check: (1) check for `.notebooklm-sync.json` (block presence), (2) also check for `.notebooklm-sync.log` (new entry presence). If block is present but log entry is absent, append just the log line. Test T3-07 must be updated to assert 4 entries. A new test should cover "vault with existing 3-entry block gets 4th entry added."

### Pitfall 4: `syncVault({ dryRun: true })` in `runStatus` throws on fresh vault with no binary

**What goes wrong:** `runStatus` calls `syncVault({ dryRun: true })`. In `syncVault`, `dryRun = true` bypasses API calls but still calls `walkProjectFiles`, which uses `lib/notebooklm-sync.mjs` which imports from `lib/notebooklm.mjs` (Phase 2). At module load time, Phase 2 calls `hasCommand('notebooklm')` lazily (on first function call, not at import). For `dryRun: true`, no Phase 2 functions are called — so the binary check never runs.

[VERIFIED: `lib/notebooklm-sync.mjs` line 415 shows `if (!dryRun) { notebookId = await ensureNotebook(notebookName); }` — API calls including binary-requiring calls are skipped in dryRun mode.] The `runStatus` / `dryRun: true` path is safe even on machines without `notebooklm-py` installed — the walking and manifest reading are pure filesystem operations.

**Confirmed safe path for TEST-02:** `notebooklm status` on a machine without `notebooklm-py` installed will still exit 0. The `hasCommand` check in `notebooklm-cli.mjs::runStatus` is optional and NOT required — dryRun mode bypasses the binary entirely.

### Pitfall 5 (Anti-pattern R — from CONTEXT.md): Doctor outputs `fail` for missing binary

**What goes wrong:** Developer looks at existing doctor pattern (lines 40-47, `fail()` for missing git/node/npm) and follows it for the `notebooklm` binary check. The binary's absence gets a red ✘ icon. Users who never opted into NotebookLM see a failing health check every time they run `doctor`.

**How to avoid:** D-13 explicitly mandates `info()` (blue ℹ) for binary absence, not `fail()` or `warn()`. The doctor `issues++` counter must NOT increment on binary absence. The `warnings++` counter should also NOT increment — this is an optional feature that is "not configured", not a "warning".

---

## Test Strategy Recommendations

### New test files needed

1. **`tests/notebooklm-cli.test.mjs`** — unit tests for `lib/notebooklm-cli.mjs`:
   - `runStatus` on fresh vault (no manifest) → exits 0, prints "never"
   - `runStatus` on vault with manifest → prints correct counts
   - Unknown subcommand → non-zero exit + help text
   - `runSync` error handling: binary missing → error printed, exits 1
   - Use `notebooklm-sync-stub.sh` with `NOTEBOOKLM_SYNC_STUB_LIST_STDOUT` to avoid real API calls

2. **`tests/hooks.test.mjs` extension** — trigger + runner integration:
   - Trigger exits immediately (parent process exits before some timeout)
   - Runner appends to log file (use temp log path + read after delay)
   - Runner with `auth check` exit 1 → logs `sync skipped reason=auth-check-failed`, exits 0
   - Runner with `syncVault` throw → logs `[error]`, exits 0
   - New fixture needed: `tests/fixtures/notebooklm-auth-stub.sh` with `NOTEBOOKLM_AUTH_STUB_EXIT` env var

3. **`tests/project-setup.test.mjs` extension** — TEST-02 smoke test:
   - Fresh vault smoke test: `node bin/cli.mjs notebooklm status` exits 0 with `VAULT_PATH=freshVault`

### Fixture additions

**`tests/fixtures/notebooklm-auth-stub.sh`** — new fixture for auth check testing:
```bash
#!/bin/bash
# Fake notebooklm binary for auth check tests
CMD="$1"
SUB="$2"
if [ "$CMD" = "auth" ] && [ "$SUB" = "check" ]; then
  EXIT="${NOTEBOOKLM_AUTH_STUB_EXIT:-0}"
  if [ "$EXIT" = "0" ]; then
    echo '{"status": "ok", "checks": {}}' 
  else
    echo "Authentication failed" >&2
  fi
  exit "$EXIT"
fi
# Fall through to sync stub behavior for other commands
```

**Extend `tests/fixtures/notebooklm-sync-stub.sh`** — add auth check case to the existing argv-aware stub:
```bash
  auth)
    if [ "$SUB" = "check" ]; then
      EXIT="${NOTEBOOKLM_SYNC_STUB_AUTH_EXIT:-0}"
      if [ "$EXIT" = "0" ]; then
        echo '{"status":"ok"}'
      else
        echo "Authentication failed" >&2
      fi
      exit "$EXIT"
    fi
    ;;
```

This avoids creating a separate stub file and keeps all auth-related test behavior in the argv-aware stub.

### What to mock vs what to use real

| Component | Approach | Rationale |
|-----------|----------|-----------|
| `notebooklm auth check` | Fake binary via PATH prefix | Avoids real network; tests all exit codes including failure |
| `notebooklm login` | Cannot test interactively; test by asserting the `spawnSync` call is made with correct args | Browser OAuth requires real user interaction |
| `spawn` + `.unref()` (trigger) | Use REAL spawn + `.unref()` — not mocked | VERIFIED to work; mock would defeat NBLM-22 verification |
| `syncVault` in runner tests | Import real `syncVault` with fake binary at PATH front | Real import graph is tested; fake binary controls behavior |
| `readManifest` in status tests | Use real `readManifest` with temp vault | Zero benefit from mocking — it's pure filesystem |

**Anti-sampling note:** If trigger tests mock `spawn` instead of using the real subprocess mechanism, detach behavior (parent exits, child continues) is never verified. NBLM-22 requires empirical evidence of non-blocking behavior. Use real `spawn` with a stub runner that writes a sentinel file, then assert the sentinel exists after the test asserts parent exited.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node.js 18+ built-in) |
| Config file | none — `npm test` → `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm-cli.test.mjs tests/hooks.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| NBLM-19 | `notebooklm sync` runs full sync, prints stats, exits 0 | integration | `node --test tests/notebooklm-cli.test.mjs` | ❌ Wave 0 |
| NBLM-20 | `notebooklm status` prints last sync, file count, stale count | unit + smoke | `node --test tests/notebooklm-cli.test.mjs tests/project-setup.test.mjs` | ❌ Wave 0 (cli test) / ✅ (project-setup) |
| NBLM-21 | Session-end triggers sync when binary + auth pass; skips when absent | integration | `node --test tests/hooks.test.mjs` | ✅ (extend) |
| NBLM-22 | Trigger is non-blocking (detached subprocess) | integration | `node --test tests/hooks.test.mjs` | ✅ (extend) |
| NBLM-23 | Failures logged, never surfaced; binary absence = info | integration | `node --test tests/hooks.test.mjs` | ✅ (extend) |
| NBLM-24 | `bin/cli.mjs` routes `notebooklm` subcommand | smoke | `node bin/cli.mjs notebooklm help` | ✅ (extend cli.mjs) |
| NBLM-25 | Help text includes both commands | smoke | `node bin/cli.mjs help` | ✅ (modify cli.mjs) |
| NBLM-26 | Wizard detects binary, offers install, runs login, verifies auth | unit (wizard flow) | `node --test tests/install.test.mjs` (if exists) | [ASSUMED] may not exist |
| NBLM-27 | Doctor reports 3 NotebookLM lines | unit | `node --test tests/doctor.test.mjs` (if exists) | [ASSUMED] may not exist |
| TEST-02 | `notebooklm status` exits 0 on fresh vault | smoke | `node --test tests/project-setup.test.mjs` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `node --test tests/notebooklm-cli.test.mjs tests/hooks.test.mjs tests/notebooklm-manifest.test.mjs`
- **Per wave merge:** `npm test` (full suite, currently 183 tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/notebooklm-cli.test.mjs` — covers NBLM-19, NBLM-20
- [ ] `tests/fixtures/notebooklm-auth-stub.sh` (or extension of `notebooklm-sync-stub.sh`) — covers NBLM-21, NBLM-22, NBLM-23

### What would invalidate the test suite

1. **If trigger tests mock `spawn`:** NBLM-22 (non-blocking) is never actually verified. The test would pass even if `.unref()` was missing. Use real subprocess + sentinel file pattern.
2. **If `runStatus` tests mock `readManifest`:** The fresh vault behavior of `readManifest` (returns empty manifest silently, no throws) is assumed not verified. Use real `readManifest` against a temp vault.
3. **If runner tests run synchronously:** NBLM-22 verifies the trigger exits before the runner finishes. Synchronous test setup cannot verify this. Use `setTimeout` in the test to allow the child process to write its sentinel file.

---

## Claude's Discretion Resolutions

| Item | Resolution | Rationale |
|------|-----------|-----------|
| `notebooklm sync` output format | Line-per-file progress + summary line at end: `Uploading project__context.md ... ✔` then `Sync complete: 3 uploaded, 44 skipped, 0 failed (3.5s)` | Matches `lib/export.mjs` pattern; users running manual sync want to see what's happening |
| Wizard step number | No change needed — step counting code at line 1165-1175 already includes `components.notebooklm` in `installCount`; the step number is computed automatically | Already handled |
| How `runStatus` reports stale files | Count only + breakdown in parens: `Files stale: 3 (2 changed, 1 new)` | Paths would be too verbose; count with breakdown gives actionable info |
| Runner imports Phase 4 directly | Direct import: `import { syncVault } from '../lib/notebooklm-sync.mjs'` | Avoids PATH dependency on CLI being globally installed; faster; cleaner error propagation |
| `notebooklm help` subcommand | Add explicit `case 'help':` in `notebooklm-cli.mjs::main()` along with `-h`/`--help` aliases | Matches `lib/projects.mjs` convention which has explicit help handling |
| Fixture strategy for trigger/runner | Extend `tests/fixtures/notebooklm-sync-stub.sh` with `auth` case | Keeps fixture count low; argv-aware stub already handles branching |
| Doctor "Last sync" parse | Use `manifest.generated_at` — see R6 analysis | Cleaner than log parsing; no optional file dependency |
| Runner crash handling | Add `process.on('uncaughtException', (err) => { appendLogLine('[error] crash: ' + err.message); process.exit(0); })` at top of runner | Prevents silent loss of crash information; stays with exit 0 contract |
| Remember "user skipped NotebookLM" | Deferred — existing component selection flow (`selectComponents`) already lets user uncheck; re-running wizard with same answer is idempotent | Adds config complexity for zero user benefit |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `notebooklm` binary | NBLM-21, NBLM-27, wizard D-08 | ✓ | 0.3.4 (at `/opt/anaconda3/bin/notebooklm`) | Silent skip (all Phase 5 code paths handle absence gracefully) |
| `pipx` | NBLM-26 wizard install | ✓ | 1.7.1 (at `/opt/homebrew/bin/pipx`) | `python3 -m pip install --user` fallback |
| `python3 -m pip` | NBLM-26 fallback | ✓ | pip 24.2 | Manual install instructions shown |
| Node.js | All hooks/triggers | ✓ | 20.12.2 | — |

No missing dependencies with no fallback. All Phase 5 features gracefully degrade when optional dependencies are absent.

---

## Standard Stack

### Core (no new dependencies)
| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| `node:child_process` | built-in | `spawn` (trigger), `spawnSync` (wizard login, auth check) | Already used in project |
| `node:fs` | built-in | `openSync` for log fd, `appendFileSync` for runner | Already used in project |
| `lib/shared.mjs::spawnSync` | re-export | Already exported at line 133 | Available |
| `lib/notebooklm-sync.mjs::syncVault` | Phase 4 | Primary consumer in cli.mjs, wizard, runner | Shipped |
| `lib/notebooklm-manifest.mjs::readManifest, ensureManifestGitignored` | Phase 3 | Status + gitignore extension | Shipped |
| `lib/notebooklm.mjs::NotebooklmNotInstalledError` | Phase 2 | instanceof check in runner | Shipped |

`package.json` dependencies remain `{"prompts": "^2.4.2"}` after Phase 5 — confirmed by design.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notebooklm auth check` exits non-zero (1 or 2) when unauthenticated | R1 Runtime Findings | Runner treats any non-zero as "skip" — even unexpected non-zero from binary errors would cause safe skip, not incorrect sync |
| A2 | `notebooklm-py[browser]` is the correct package name (not `notebooklm-py` alone) | Install wizard section | Planner must verify against current PyPI; existing `installNotebookLM` at line 820 uses `[browser]` which is the current practice |
| A3 | `tests/install.test.mjs` and `tests/doctor.test.mjs` do not exist (wizard + doctor are not currently unit-tested) | Validation Architecture | If they exist, NBLM-26 and NBLM-27 testing strategy may need adjustment |

---

## Sources

### Primary (HIGH confidence)
- `lib/shared.mjs::hasCommand` — VERIFIED: uses `which` via `execSync`, lines 48-50
- `lib/notebooklm-manifest.mjs::ensureManifestGitignored` — VERIFIED: lines 280-318, sentinel check at line 299
- `lib/notebooklm-sync.mjs::syncVault` — VERIFIED: dryRun bypass at line 415, stats shape at lines 403-413
- `bin/cli.mjs` — VERIFIED: `case 'status':` at line 158, routing pattern at lines 77-203
- `bin/install.mjs` — VERIFIED: `installNotebookLM` at line 816, step counting at lines 1165-1175, placeholder at lines 1103-1114
- `hooks/session-end-check.sh` — VERIFIED: all 59 lines; insertion point between lines 39-42
- `hooks/update-context.mjs` — VERIFIED: architectural template for trigger/runner pattern
- `tests/notebooklm-manifest.test.mjs` — VERIFIED: T3-07 "three entries" test at line 309
- `tests/project-setup.test.mjs` — VERIFIED: test fixture pattern using `tmpdir()` + `execFileSync`

### Secondary (HIGH confidence — runtime verified)
- `notebooklm auth check` exit code 0 when authenticated — LIVE RUN on dev machine
- `notebooklm auth check --json` output shape — LIVE RUN; full JSON shape captured
- `notebooklm auth check --help` — LIVE RUN; confirmed `--json` and `--test` flags exist
- `notebooklm login --help` — LIVE RUN; browser opens + ENTER to save; no --headless flag
- `notebooklm --version` → `NotebookLM CLI, version 0.3.4` — LIVE RUN
- `pipx --version` → `1.7.1` at `/opt/homebrew/bin/pipx` — LIVE RUN
- `python3 -m pip --version` → `pip 24.2` — LIVE RUN
- `spawn({detached:true, stdio:['ignore',fd,fd]}).unref()` — LIVE TEST; detached child wrote to log after parent exited

### Tertiary (ASSUMED — flagged)
- `notebooklm auth check` exit code when unauthenticated — not tested (safe to assume non-zero based on docs)
- `tests/install.test.mjs` and `tests/doctor.test.mjs` non-existence — not verified with glob

---

## Metadata

**Confidence breakdown:**
- Runtime-verified behaviors: HIGH — all key subprocess patterns tested on dev machine
- Phase 3 gitignore migration analysis: HIGH — source code fully read
- Install wizard analysis: HIGH — all relevant lines read; collision identified
- CLI routing analysis: HIGH — bin/cli.mjs fully read
- Auth check failure semantics: MEDIUM — untested exit code assumed non-zero based on docs

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable Node.js subprocess APIs; `notebooklm-py` CLI flags may change with new versions)
