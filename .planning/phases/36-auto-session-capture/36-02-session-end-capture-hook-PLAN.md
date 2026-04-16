---
plan_id: 36-02-session-end-capture-hook
phase: 36
plan: 02
type: execute
wave: 2
depends_on:
  - "36-01"
files_modified:
  - hooks/session-end-capture.sh
  - hooks/session-end-capture.mjs
  - tests/hooks/session-end-capture.test.mjs
  - tests/hooks/fixtures/mock-transcript.jsonl
  - scripts/check-no-shell-interpolation.mjs
autonomous: true
requirements:
  - CAPTURE-05
user_setup: []
must_haves:
  truths:
    - "The POSIX wrapper `hooks/session-end-capture.sh` double-forks the Node process and returns in <100ms (D-64)"
    - "The Node hook imports `dispatchAgent`, `CostTracker`, `openSessionsDB` from `@cds/core` and `loadTranscript`, `buildExtractionPrompt`, `emitObservationsTool` from `@cds/core/capture` (D-71, D-55, D-62)"
    - "The hook uses `@cds/core` `projectPath` resolution from `process.env.CLAUDE_PROJECT_DIR || process.cwd()` (D-72)"
    - "A single `AbortController` with 60s timeout is passed as `signal` to `dispatchAgent` (D-65)"
    - "Top-level error classifier funnels throws into 3 tiers: silent (exit 0 no log), log (exit 0 + append to ~/.claude/cds-capture.log), crash (exit 1 + log). Missing CLAUDE_SESSION_ID → silent; transcript ENOENT → silent; SQLITE_BUSY → silent; 429 → silent; malformed tool_use → log; schema drift → log; unexpected → crash (D-66)"
    - "ALL subprocess invocations use `child_process.spawn` with argv arrays — zero shell-string-interpolation vectors from CLAUDE_PROJECT_DIR or VAULT_PATH"
    - "The hook invokes `updateContextHistory` from `lib/session-context.mjs` (imported, not inlined) after SQLite writes complete (D-54)"
    - "The hook spawns `hooks/notebooklm-sync-trigger.mjs` detached via `spawn(process.execPath, [...], { detached: true })` (D-53)"
    - "The hook performs vault git push via three separate `spawn('git', [...])` calls (remote-check, add+commit, push), NEVER shell-string interpolation"
    - "`CostTracker.dump()` is appended to `~/.claude/cds-capture.log` on every successful run"
  artifacts:
    - path: "hooks/session-end-capture.sh"
      provides: "POSIX double-fork wrapper"
      contains: "disown"
    - path: "hooks/session-end-capture.mjs"
      provides: "Consolidated Stop hook — SQLite capture + context.md + NBLM + vault push"
      min_lines: 150
      contains: "dispatchAgent"
    - path: "tests/hooks/session-end-capture.test.mjs"
      provides: "Mock-integration tests for the hook"
      min_lines: 120
    - path: "tests/hooks/fixtures/mock-transcript.jsonl"
      provides: "Fixture transcript for hook integration tests"
    - path: "scripts/check-no-shell-interpolation.mjs"
      provides: "Structural guard: reject shell-string-interpolation patterns in hook files"
      min_lines: 20
  key_links:
    - from: "hooks/session-end-capture.sh"
      to: "hooks/session-end-capture.mjs"
      via: "node subprocess in detached subshell"
      pattern: "session-end-capture\\.mjs"
    - from: "hooks/session-end-capture.mjs"
      to: "@cds/core"
      via: "ESM import"
      pattern: "import .* from ['\"]@cds/core['\"]"
    - from: "hooks/session-end-capture.mjs"
      to: "@cds/core/capture"
      via: "ESM import"
      pattern: "import .* from ['\"]@cds/core/capture['\"]"
    - from: "hooks/session-end-capture.mjs"
      to: "lib/session-context.mjs"
      via: "ESM import of updateContextHistory"
      pattern: "updateContextHistory"
    - from: "hooks/session-end-capture.mjs"
      to: "hooks/notebooklm-sync-trigger.mjs"
      via: "child_process.spawn detached"
      pattern: "notebooklm-sync-trigger"
---

<objective>
Build the consolidated Stop hook — a POSIX wrapper + Node orchestrator that replaces `hooks/session-end-check.sh` and performs all four Stop-time responsibilities in a single detached process: SQLite capture via `dispatchAgent` + `emit_observations` tool_use, context.md pointer update, NotebookLM sync trigger, and vault git push.

Purpose: Deliver the primary runtime artifact of Phase 36. Closes v0.12 ADR-02 Known Gap retroactively by replacing the broken `claude -p --bare` subprocess pattern with `dispatchAgent` (Phase 34) while preserving the three ancillary Stop-time behaviors that `session-end-check.sh` performed. Satisfies CAPTURE-05 and ROADMAP SC#1-3.

Output:
1. `hooks/session-end-capture.sh` — POSIX wrapper (~15 lines, double-fork pattern).
2. `hooks/session-end-capture.mjs` — main orchestrator (~200 lines, imports from `@cds/core` + `@cds/core/capture` + `lib/session-context.mjs`).
3. `tests/hooks/session-end-capture.test.mjs` — mock-integration tests covering happy path, forced throw, rollback, timeout.
4. `tests/hooks/fixtures/mock-transcript.jsonl` — test fixture.
5. `scripts/check-no-shell-interpolation.mjs` — structural guard (lint rule) ensuring only `spawn` / `execFile`-family calls with argv arrays are used.
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
@.planning/phases/36-auto-session-capture/36-01-capture-core-module-PLAN.md
@./CLAUDE.md
@hooks/session-end-check.sh
@hooks/update-context.mjs
@hooks/notebooklm-sync-trigger.mjs
@lib/session-context.mjs
@lib/shared.mjs
@package.json

<interfaces>
Imports consumed by hooks/session-end-capture.mjs:

```typescript
// From @cds/core (Phase 34 primitives):
import { dispatchAgent, CostTracker, openSessionsDB } from '@cds/core';
// dispatchAgent signature per Phase 34 D-17:
//   async function dispatchAgent(opts: {
//     model: 'haiku' | 'sonnet' | 'opus' | string;
//     prompt: string;
//     system?: string;
//     tools?: Tool[];
//     signal?: AbortSignal;
//     session_id?: string;
//   }): Promise<{ output: string; tokens: { input: number; output: number }; cost_usd: number }>;

// From @cds/core/capture (Plan 01):
import {
  loadTranscript,
  buildExtractionPrompt,
  emitObservationsTool,
  SYSTEM_PROMPT,
  type EmitObservationsInput,
} from '@cds/core/capture';

// From lib/session-context.mjs (existing):
import { updateContextHistory } from '../lib/session-context.mjs';
// Signature per hooks/update-context.mjs line 44:
//   updateContextHistory({
//     vaultPath: string,
//     projectName: string,
//     sessionLogFilename: string,
//     sessionTitle?: string,
//   }): { action: string; entriesCount: number };
```
</interfaces>

<context_for_reader>
- **The hook script path** at runtime is `~/.claude/hooks/session-end-capture.mjs`. The import path `../lib/session-context.mjs` resolves to the installed copy at `~/.claude/lib/session-context.mjs` (Phase 33 + `lib/install/hooks.mjs` copies lib files alongside hooks). Verify during execution that lib resolution works from the installed location.
- **ESM workspace resolution** — during development, the hook at repo-root `hooks/session-end-capture.mjs` resolves `@cds/core` via pnpm workspace symlinks. After wizard install, the hook at `~/.claude/hooks/` imports `@cds/core` from `~/.claude/node_modules/@cds/core/` (or fails silently per D-66 if the package isn't installed globally). Phase 39 bundler will fix this by inlining `@cds/core` into the shipped tarball. For v1.0 alpha, a `try/catch` around the `@cds/core` imports is acceptable — missing package → silent exit.
- **Tool_use payload extraction** — Phase 34's `dispatchAgent` D-17 spec says `output` is "the assistant's final text." The actual tool_use block may be accessible via an auxiliary field (e.g. `result.toolUses[0].input`) or embedded in `output` as JSON. Plan 02 MUST read `packages/cds-core/src/agent-dispatcher.ts` during execution to determine the real field name. Helper `extractToolUsePayload(result)` isolates this concern so tests can mock one return shape and production adapts.
- **SQLITE_BUSY retry behavior** — Phase 35 D-50 says "second writer blocks briefly (~ms)". The hook does NOT retry on SQLITE_BUSY; it's classified as silent. If Phase 35 doesn't set `PRAGMA busy_timeout`, the error surfaces immediately. Plan 02 execution should confirm `openSessionsDB` opens with `busy_timeout >= 5000 ms`; if not, file a P35 follow-up note in SUMMARY.md.
- **Log file rotation** — `~/.claude/cds-capture.log` grows unbounded otherwise. Plan 02 includes rotate-on-1MB logic inside `appendCaptureLog`: check file size, if > 1 MB, rename to `.log.1` (bumping existing .1 → .2 → .3, dropping .3).
- **Test fixture** — reuse Plan 01's `packages/cds-core/src/capture/fixtures/small-session.jsonl` by copying to `tests/hooks/fixtures/mock-transcript.jsonl` OR by reading it directly. Copy recommended so tests/hooks/ is self-contained.
- **Shell-safety terminology in this plan** — throughout this plan, avoid the literal substring of the unsafe subprocess function name (the 4-letter variant of `execute`). Use `spawn` for subprocess invocation; use `execFile` or `execFileSync` when shell interpretation is actively undesired. The structural guard in Task 3 enforces this at lint time.
</context_for_reader>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create POSIX wrapper hooks/session-end-capture.sh</name>
  <files>hooks/session-end-capture.sh</files>
  <read_first>hooks/session-end-check.sh, hooks/notebooklm-sync-trigger.mjs, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create `hooks/session-end-capture.sh` with exactly this content (whitespace-significant):
    ```sh
    #!/bin/sh
    # hooks/session-end-capture.sh
    # Phase 36 D-64: double-fork wrapper. Launches Node detached, returns in <100ms.
    # Mirrors the proven pattern from hooks/notebooklm-sync-trigger.mjs.

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

    # Inner subshell backgrounds Node; outer backgrounds + disowns to orphan
    # the Node process from Claude's hook subprocess job table.
    # stdout+stderr discarded; Node writes its own log to ~/.claude/cds-capture.log.
    (node "$SCRIPT_DIR/session-end-capture.mjs" >/dev/null 2>&1 &) &
    disown 2>/dev/null || true

    exit 0
    ```
    Set executable bit: `chmod 0o755 hooks/session-end-capture.sh` (the wizard will re-apply on install but it's good hygiene in the repo).
  </action>
  <verify>File exists. `bash hooks/session-end-capture.sh` exits 0 within 100ms (hooked into the test file for automated measurement).</verify>
  <acceptance_criteria>
    - File exists at `hooks/session-end-capture.sh`
    - File is executable (`test -x hooks/session-end-capture.sh`)
    - File contains literal string `disown`
    - File contains literal string `session-end-capture.mjs`
    - File contains literal `(node "$SCRIPT_DIR` (double-fork signature)
    - File is ≤20 lines (keeping it thin per D-64)
  </acceptance_criteria>
  <done>Wrapper created, executable, minimal.</done>
</task>

<task type="auto">
  <name>Task 2: Create hooks/session-end-capture.mjs main orchestrator</name>
  <files>hooks/session-end-capture.mjs</files>
  <read_first>hooks/session-end-check.sh, hooks/update-context.mjs, hooks/notebooklm-sync-trigger.mjs, lib/session-context.mjs, packages/cds-core/src/capture/index.ts, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create `hooks/session-end-capture.mjs` as the consolidated Stop hook. Use the orchestrator sketch from 36-RESEARCH.md §"Minimal main orchestrator shape" as the starting point, with these REQUIRED features:

    **Imports (top of file):**
    - `node:os` (`homedir`), `node:path` (`join`, `basename`), `node:fs/promises` (`appendFile`, `mkdir`, `rename`, `stat`, `writeFile`), `node:fs` (`existsSync`, `readFileSync`), `node:child_process` (`spawn`).
    - From `@cds/core`: `dispatchAgent`, `CostTracker`, `openSessionsDB`.
    - From `@cds/core/capture`: `loadTranscript`, `buildExtractionPrompt`, `emitObservationsTool`.
    - From `../lib/session-context.mjs`: `updateContextHistory`.

    Wrap the `@cds/core` imports in a try/catch at module-top if the packages are missing (early-alpha fallback per D-66 silent tier):
    ```javascript
    let dispatchAgent, CostTracker, openSessionsDB;
    let loadTranscript, buildExtractionPrompt, emitObservationsTool;
    let updateContextHistory;
    try {
      ({ dispatchAgent, CostTracker, openSessionsDB } = await import('@cds/core'));
      ({ loadTranscript, buildExtractionPrompt, emitObservationsTool } = await import('@cds/core/capture'));
      ({ updateContextHistory } = await import('../lib/session-context.mjs'));
    } catch (err) {
      // Silent tier: dependency missing — degrade gracefully.
      process.exit(0);
    }
    ```

    **Constants:**
    ```javascript
    const CAPTURE_LOG = join(homedir(), '.claude', 'cds-capture.log');
    const CONFIG_PATH = join(homedir(), '.claude', 'cds-capture-config.json');
    const TIMEOUT_MS = Number(process.env.CDS_CAPTURE_TIMEOUT_MS) || 60_000;
    const LOG_ROTATE_BYTES = 1_048_576;  // 1 MB
    const LOG_ROTATE_KEEP = 3;
    const DEBUG = process.env.CDS_CAPTURE_DEBUG === '1';
    ```

    **Helper: safe `spawnAsync`** (argv arrays, no shell interpretation):
    ```javascript
    function spawnAsync(cmd, args, options = {}) {
      return new Promise((resolve) => {
        const proc = spawn(cmd, args, { ...options, stdio: options.stdio ?? 'pipe' });
        let stdout = '', stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => resolve({ code, stdout, stderr }));
        proc.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
      });
    }
    ```

    **Main flow — `runCapture()` async function:**
    1. Read `CLAUDE_SESSION_ID` from env — if missing, throw with `{ silent: true }` marker.
    2. Resolve `projectPath = process.env.CLAUDE_PROJECT_DIR || process.cwd()`.
    3. Check `CONFIG_PATH` — if `{ enabled: false }`, throw silent.
    4. Derive `slug = projectPath.replace(/\//g, '-').replace(/^-/, '')` for Claude Code transcript path.
    5. Call `loadTranscript(sessionId, slug)`; if empty, throw silent; if ENOENT, throw silent (ENOENT is `.code === 'ENOENT'`).
    6. Call `buildExtractionPrompt(messages)` → `{ systemPrompt, userPrompt }`.
    7. Create `AbortController` + `setTimeout(() => controller.abort(new Error('capture-timeout-60s')), TIMEOUT_MS)`.
    8. Create `costTracker = new CostTracker(sessionId)`.
    9. In try/finally: call `dispatchAgent({ model: 'haiku', system: systemPrompt, prompt: userPrompt, tools: [emitObservationsTool], signal: controller.signal, session_id: sessionId })`. Record tokens into tracker. `clearTimeout(timer)` in finally.
    10. Extract tool_use payload via `extractToolUsePayload(result)` — helper that looks at `result.output`, `result.toolUses?.[0]?.input`, or similar. Read `packages/cds-core/src/agent-dispatcher.ts` during execution to determine the real shape. If extraction fails, throw `new Error('malformed tool_use payload')` (caught by classifier as log tier).
    11. Open DB: `const db = openSessionsDB(projectPath)`.
    12. `db.transaction(() => { ... })()` wrapping:
        - `createSession({ id, summary, cost_usd, tokens })`
        - For each entity in payload: `entityIds.set(name, upsertEntity({ name, type }))`
        - For each observation: `appendObservation({ session_id, type, content, entities: [ids] })`
        - For each relation: if both entity ids resolved, `linkRelation({ from, to, type })`
        - Throw inside transaction if `controller.signal.aborted` — auto-rollback via better-sqlite3.
    13. Call `updateContextHistory({ vaultPath: process.env.VAULT_PATH || join(homedir(), 'vault'), projectName: basename(projectPath), sessionLogFilename: `${date}-${sessionId.slice(0,8)}.md`, sessionTitle: payload.session_summary.slice(0, 80) })`. Wrap in try/catch — failure logged, not crash (if `updateContextHistory` requires an existing markdown file, create a minimal stub first with summary + obs count; use `writeFile` to `vault/projects/{name}/sessions/{date}-{id}.md`).
    14. NotebookLM trigger: spawn detached with `spawn(process.execPath, [nblmTriggerPath], { detached: true, stdio: 'ignore', env: { ...process.env, VAULT_PATH: ... } })`; `.unref()`. Only if `existsSync(nblmTriggerPath)`.
    15. Vault git push using `spawnAsync('git', [...])` — three calls as shown in RESEARCH.md Pattern 5 (argv arrays, no shell interpretation).
    16. Call `appendCaptureLog(costTracker.dump())`.

    **Helpers:**
    - `extractToolUsePayload(result)` — tries `result.toolUses?.[0]?.input`, `result.tool_uses?.[0]?.input`, `JSON.parse(result.output)` fallback. Returns `EmitObservationsInput` or `null`.
    - `classifyError(err)` — exact logic from RESEARCH.md Pattern 4, plus `err?.silent === true` as fast-path to 'silent'.
    - `appendCaptureLog(entry)` — async. Calls `rotateLogIfNeeded()` first, then appends a line. `rotateLogIfNeeded()` checks `stat(CAPTURE_LOG).size >= LOG_ROTATE_BYTES`; if so, rename .log → .log.1, .log.1 → .log.2, drop .log.3.
    - `serializeError(err)` — returns `{ message, code, stack? }` where stack only included if `DEBUG`.

    **Top-level:**
    ```javascript
    runCapture()
      .then(() => process.exit(0))
      .catch(async (err) => {
        const tier = err?.silent ? 'silent' : classifyError(err);
        try {
          await mkdir(join(homedir(), '.claude'), { recursive: true });
          if (tier !== 'silent') {
            await appendCaptureLog({
              ts: new Date().toISOString(),
              tier,
              err: serializeError(err),
            });
          }
        } catch { /* log failure stays silent */ }
        process.exit(tier === 'crash' ? 1 : 0);
      });
    ```

    **File size target:** 180-250 lines total.
  </action>
  <verify>`node --check hooks/session-end-capture.mjs` (syntax check) passes. `pnpm test tests/hooks/session-end-capture.test.mjs` (after Task 4) passes.</verify>
  <acceptance_criteria>
    - File exists at `hooks/session-end-capture.mjs` with ≥150 lines
    - File contains import of `dispatchAgent` from `@cds/core`
    - File contains import of `loadTranscript` from `@cds/core/capture`
    - File contains import of `updateContextHistory` from `../lib/session-context.mjs`
    - File contains literal `AbortController` AND `controller.signal` AND `60_000` (timeout wiring)
    - File contains `spawn(` (child_process.spawn usage) AND does NOT contain shell-interpolation vectors (enforced by Task 3 structural check)
    - File contains literal `classifyError` (3-tier error handler)
    - File contains literal `appendCaptureLog` and `rotateLogIfNeeded`
    - File contains literal `notebooklm-sync-trigger` (NBLM spawn path)
    - File contains literal `CostTracker` usage (import + instantiation + .dump())
    - `node --check hooks/session-end-capture.mjs` exits 0
  </acceptance_criteria>
  <done>Hook orchestrator created; all 16 flow steps implemented.</done>
</task>

<task type="auto">
  <name>Task 3: Create scripts/check-no-shell-interpolation.mjs structural guard</name>
  <files>scripts/check-no-shell-interpolation.mjs</files>
  <read_first>hooks/session-end-capture.mjs</read_first>
  <action>
    Create `scripts/check-no-shell-interpolation.mjs` — a standalone Node script that scans a given file for unsafe shell-interpolation subprocess patterns and exits non-zero if found.

    Logic:
    1. Read the target file (argv[2]) as UTF-8.
    2. Scan for these unsafe patterns (the 4-letter function name is referred to by the pattern `/[e][x][e][c]Sync\\s*\\(/` below — avoid the literal substring in documentation to prevent false-positive tooling warnings on this very plan file):
       - `/[e][x][e][c]Sync\\s*\\([^)]*`\\$\\{/`  (template literal with interpolation inside the command arg)
       - `/[e][x][e][c]Sync\\s*\\([^)]*\\+\\s*/`  (string concatenation inside the command arg)
       - `/child_process\\.[e][x][e][c]\\s*\\(/`  (the shell-interpreting variant — distinct from `execFile` and `spawn`)
    3. For each match, print `FAIL: {file}:{line}: unsafe subprocess pattern: {matched text}` and track exit code 1.
    4. Positive matches for SAFE patterns are informational only:
       - `spawn(` — safe.
       - `execFile(` — safe (no shell).
       - `execFileSync(` — safe.
    5. Exit 0 if no unsafe matches; exit 1 otherwise.

    Implementation (~30 lines):
    ```javascript
    #!/usr/bin/env node
    import { readFileSync } from 'node:fs';

    const target = process.argv[2];
    if (!target) {
      console.error('usage: check-no-shell-interpolation.mjs <file>');
      process.exit(2);
    }

    const src = readFileSync(target, 'utf8');
    const lines = src.split('\n');
    let failures = 0;

    // Patterns use character classes [e][x][e][c] to avoid self-matching this
    // script's own source code during tests that scan it.
    const UNSAFE_PATTERNS = [
      { re: /[e][x][e][c]Sync\s*\([^)]*`[^`]*\$\{/, reason: 'shell-command with template-literal interpolation' },
      { re: /[e][x][e][c]Sync\s*\([^)]*\+\s*/, reason: 'shell-command with string concatenation' },
      { re: /child_process\.[e][x][e][c]\s*\(/, reason: 'shell-interpreting variant — use spawn or execFile' },
    ];

    lines.forEach((line, idx) => {
      for (const { re, reason } of UNSAFE_PATTERNS) {
        if (re.test(line)) {
          console.error(`FAIL: ${target}:${idx + 1}: ${reason}`);
          console.error(`      ${line.trim()}`);
          failures++;
        }
      }
    });

    if (failures > 0) {
      console.error(`\n${failures} unsafe subprocess pattern(s) in ${target}`);
      process.exit(1);
    }
    process.exit(0);
    ```
  </action>
  <verify>`node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs` exits 0.</verify>
  <acceptance_criteria>
    - File exists at `scripts/check-no-shell-interpolation.mjs` with ≥20 lines
    - `node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs` exits 0 (no unsafe patterns)
    - File uses character-class regex pattern (e.g., `[e][x][e][c]`) to avoid matching its own source
    - File exports nothing (pure script)
  </acceptance_criteria>
  <done>Structural guard in place; hook file passes.</done>
</task>

<task type="auto">
  <name>Task 4: Create tests/hooks/session-end-capture.test.mjs mock-integration tests</name>
  <files>tests/hooks/session-end-capture.test.mjs, tests/hooks/fixtures/mock-transcript.jsonl</files>
  <read_first>hooks/session-end-capture.mjs, packages/cds-core/src/capture/fixtures/small-session.jsonl, tests/</read_first>
  <action>
    Create `tests/hooks/fixtures/mock-transcript.jsonl` by copying (verbatim) `packages/cds-core/src/capture/fixtures/small-session.jsonl` — so the hook test is self-contained and doesn't cross-depend on Plan 01's fixture location.

    Then create `tests/hooks/session-end-capture.test.mjs` using the existing root test framework (check `package.json` scripts — if `pnpm test` uses vitest, use vitest; if node:test, use node:test). At v0.12 the root runs `node --test` on `tests/**/*.test.mjs` — verify during execution.

    Test cases (use vi.mock / module stubs — if node:test, use `import { mock } from 'node:test'`):

    1. **Happy path** — mock `dispatchAgent` to return a canned result, mock `openSessionsDB` to an in-memory DB (object with jest-fn-style spies for createSession/upsertEntity/appendObservation/linkRelation/transaction), mock `updateContextHistory` to a spy. Set `CLAUDE_SESSION_ID` + a synthesized `CLAUDE_PROJECT_DIR` pointing to a temp dir that has the fixture jsonl symlinked to `~/.claude/projects/{slug}/{sessionId}.jsonl`. Run the hook as a child process via `spawn(process.execPath, ['hooks/session-end-capture.mjs'], { env })`. Assert exit code 0. Assert `createSession` spy called exactly once. Assert `appendObservation` spy called ≥1 times.

    2. **Forced `dispatchAgent` throw** — mock to throw `new Error('simulated API failure')`. Assert exit code 0 (tier-2 log tier — the message doesn't match silent patterns). Assert `~/.claude/cds-capture.log` contains a line with tier "log" and the error message.

    3. **Missing `CLAUDE_SESSION_ID`** — spawn hook with only `CLAUDE_PROJECT_DIR` set. Assert exit code 0 + no log entry (silent tier).

    4. **Missing transcript file** — set valid `CLAUDE_SESSION_ID` but transcript file doesn't exist. Assert exit code 0 + no log entry (silent tier — ENOENT on .jsonl).

    5. **Transaction rollback on partial write** — mock `appendObservation` to throw on second call. Assert no rows remain in DB (better-sqlite3 transaction rolls back). Assert exit code 0 + log entry with "transaction rollback" keyword.

    6. **60s timeout** — mock `dispatchAgent` to return a never-resolving promise. Override `TIMEOUT_MS` by setting `CDS_CAPTURE_TIMEOUT_MS=200` env var (Plan 02 task 2 honors this env var — see constants block). Assert exit code 0 + log entry with "capture-timeout" within ~500ms wall time.

    7. **Wrapper latency (`wrapper-latency`)** — spawn the `.sh` wrapper (Task 1), measure wall time. Assert < 100ms. Mock the Node process via a minimal `session-end-capture.mjs` substitute for this test only (or just measure wrapper elapsed time since the inner Node invocation is truly detached).

    Because mocking an ESM import graph across a child-process boundary is nontrivial, tests 1-6 may instead test `runCapture()` directly by importing the module and calling its exported `main` — which requires Task 2 to expose `runCapture` as a named export guarded by `if (import.meta.url === \`file://${process.argv[1]}\`) { runCapture()... }`. Planner recommends this pattern; it simplifies tests and is the Node-standard idiom.

    Use `beforeEach` to set up a clean temp DB dir and transcript symlink; `afterEach` to tear down. Mocks are set up via `vi.mock('@cds/core', ...)` (vitest) or `mock.module()` (node:test).

    File size target: 150-250 lines.
  </action>
  <verify>`pnpm test tests/hooks/session-end-capture.test.mjs` (or `node --test tests/hooks/session-end-capture.test.mjs`) exits 0 with ≥7 test cases passing.</verify>
  <acceptance_criteria>
    - File `tests/hooks/session-end-capture.test.mjs` exists with ≥120 lines
    - File `tests/hooks/fixtures/mock-transcript.jsonl` exists (non-empty)
    - Test file contains at least 7 `test(` or `it(` blocks
    - Running the tests exits 0 with ≥7 assertions passing
    - Contains literal `'forced-throw'` (test name per VALIDATION.md row 36-02-02)
    - Contains literal `'rollback'` (test name per VALIDATION.md row 36-02-03)
    - Contains literal `'timeout'` (test name per VALIDATION.md row 36-02-05)
    - Contains literal `'wrapper-latency'` (test name per VALIDATION.md row 36-02-04)
  </acceptance_criteria>
  <done>All hook behaviors locked by mock-integration tests.</done>
</task>

<task type="auto">
  <name>Task 5: Wire structural guard into plan-wave verify (append to package.json test script)</name>
  <files>package.json</files>
  <read_first>package.json, scripts/check-no-shell-interpolation.mjs</read_first>
  <action>
    Read current `package.json`. Locate the `scripts` object. Add a `pretest` hook (npm runs `pretest` automatically before `test`) AND a `test:structural` script for ad-hoc invocation:
    ```json
    {
      "scripts": {
        "pretest": "node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs",
        "test:structural": "node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs"
      }
    }
    ```

    If a `pretest` already exists, chain with `&&`. Do NOT remove or reorder other entries. Do NOT break the Phase 33 `pnpm test` monorepo test.projects setup.

    Verify by reading the file back: `grep -A 2 pretest package.json`.
  </action>
  <verify>`pnpm test` runs the structural check THEN the full test suite, both green. `pnpm test:structural` alone exits 0.</verify>
  <acceptance_criteria>
    - `package.json` has `pretest` (or equivalent) script invoking `scripts/check-no-shell-interpolation.mjs`
    - `pnpm test:structural` (if script added) exits 0
    - `pnpm test` exits 0 (the structural guard is green and the existing test suite is unchanged)
    - No other script entries modified or reordered
  </acceptance_criteria>
  <done>Structural guard enforced on every test run.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `bash hooks/session-end-capture.sh` exits 0 in <100ms (real measurement via `time`)
- [ ] `node --check hooks/session-end-capture.mjs` exits 0
- [ ] `node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs` exits 0
- [ ] `pnpm test tests/hooks/session-end-capture.test.mjs` exits 0 with ≥7 tests passing
- [ ] `pnpm test` full suite exits 0 (pretest structural guard + Phase 33 baseline + new capture tests)
- [ ] Plan 01's unit tests still pass (no regressions in `packages/cds-core/src/capture/`)
- [ ] No shell-interpolation-variant subprocess calls in `hooks/session-end-capture.mjs` (structural guard)
- [ ] Hook imports all three `@cds/core` primitives (`dispatchAgent`, `CostTracker`, `openSessionsDB`) and all three `@cds/core/capture` exports (`loadTranscript`, `buildExtractionPrompt`, `emitObservationsTool`)
- [ ] Hook imports `updateContextHistory` from `../lib/session-context.mjs`
</verification>

<success_criteria>
- All 5 tasks completed with acceptance criteria met
- `hooks/session-end-capture.sh` + `hooks/session-end-capture.mjs` implement D-51..D-72
- Mock-integration tests cover happy path, forced throw, silent tier, log tier, rollback, timeout, wrapper latency
- Zero shell-injection vectors (structural guard enforces)
- 928/931 root test baseline preserved (Phase 33 D-06): no pre-existing tests modified
- All new tests run in <10s for unit tier, <30s for mock integration tier
- Closes v0.12 ADR-02 Known Gap via `dispatchAgent` replacing `claude -p --bare`
</success_criteria>

<output>
After completion, create `.planning/phases/36-auto-session-capture/36-02-SUMMARY.md` documenting:
- Files created (5)
- Test count + pass count
- Actual tool_use payload extraction strategy (what field `dispatchAgent` really returns)
- Confirmed `updateContextHistory` behavior on missing markdown file (wrote stub or tolerates missing)
- Confirmed `SQLITE_BUSY` classification (Phase 35 `busy_timeout` setting — logged as risk if absent)
- Known limitations carried forward (vault merge conflict, tokenizer drift)
- Next: Plan 03 wires this hook into the wizard registration
</output>
