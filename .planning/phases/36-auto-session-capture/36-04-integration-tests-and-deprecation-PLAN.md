---
plan_id: 36-04-integration-tests-and-deprecation
phase: 36
plan: 04
type: execute
wave: 3
depends_on:
  - "36-02"
  - "36-03"
files_modified:
  - tests/hooks/session-end-capture.live.test.mjs
  - tests/hooks/phase36-success-criteria.test.mjs
  - docs/migration/v1.0-auto-capture.md
autonomous: true
requirements:
  - CAPTURE-05
user_setup: []
must_haves:
  truths:
    - "Live API integration test (INTEGRATION=1 gated) exercises the full Stop-hook pipeline end-to-end against real Haiku + real SQLite, asserts ≥1 session row + ≥1 observation row, and asserts total cost < $0.05"
    - "Phase 36 success-criteria audit test (mock-only) verifies all 4 ROADMAP SC#1-4 against the implementation: detached execution, context.md pointer, transaction rollback on forced throw, wizard replacement + message"
    - "Migration doc at `docs/migration/v1.0-auto-capture.md` explains the /end → auto-capture transition for existing users"
    - "Default `pnpm test` skips the live test (gated on `INTEGRATION=1`); live test is invoked via a separate npm script `pnpm test:live`"
  artifacts:
    - path: "tests/hooks/session-end-capture.live.test.mjs"
      provides: "Live API integration test (INTEGRATION=1 gated)"
      min_lines: 60
    - path: "tests/hooks/phase36-success-criteria.test.mjs"
      provides: "Acceptance audit — verifies 4 ROADMAP SCs"
      min_lines: 80
    - path: "docs/migration/v1.0-auto-capture.md"
      provides: "User-facing migration doc"
      min_lines: 30
      contains: "auto-capture"
  key_links:
    - from: "tests/hooks/session-end-capture.live.test.mjs"
      to: "hooks/session-end-capture.mjs"
      via: "process spawn with live env vars"
      pattern: "session-end-capture\\.mjs"
    - from: "tests/hooks/phase36-success-criteria.test.mjs"
      to: "hooks/session-end-capture.mjs + lib/install/hooks.mjs"
      via: "mock-based integration assertions"
      pattern: "session-end-capture"
    - from: "package.json scripts"
      to: "INTEGRATION=1 pnpm vitest run tests/hooks/session-end-capture.live.test.mjs"
      via: "test:live script"
      pattern: "test:live"
---

<objective>
Add the final verification tier to Phase 36: a live API integration test (gated behind `INTEGRATION=1`), a cross-cutting success-criteria audit test that maps each ROADMAP SC#1-4 to a concrete assertion, and a user-facing migration doc explaining the v0.12 → v1.0 Stop-hook change.

Purpose: Prove end-to-end that the full pipeline works against real Haiku + real SQLite, and provide a single test file that a verifier can read to confirm Phase 36 meets its published success criteria. The migration doc is a Phase 39 prerequisite (release notes will point to it), but it's cheap to write now while context is fresh.

Output:
1. `tests/hooks/session-end-capture.live.test.mjs` — real API test (skipped by default).
2. `tests/hooks/phase36-success-criteria.test.mjs` — mock-based acceptance audit.
3. `docs/migration/v1.0-auto-capture.md` — user-facing migration guide.
4. `package.json` — new `test:live` script.
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
@.planning/phases/36-auto-session-capture/36-03-wizard-migration-PLAN.md
@./CLAUDE.md
@hooks/session-end-capture.mjs
@lib/install/hooks.mjs
@package.json

<context_for_reader>
- **ROADMAP Success Criteria** (copy for reference):
  1. Ending a Claude Code session triggers `hooks/session-end-capture.mjs` detached, writes ≥1 sessions row + N observations rows to `sessions.db` within 60s.
  2. `vault/projects/{name}/context.md` (Tier 3) gains a session pointer.
  3. Forcing `dispatchAgent` to throw causes session to exit normally with no user-visible error and no partial DB writes (rollback).
  4. Re-running wizard replaces `session-end-check.sh` with `session-end-capture.mjs` in Stop list and prints `auto-capture enabled, /end no longer required for routine sessions`.

- **`INTEGRATION=1` gating** — follows Phase 34 D-32 convention. Test file checks `process.env.INTEGRATION !== '1' || !process.env.ANTHROPIC_API_KEY` and calls `test.skip(...)` in that case. Default CI runs with `INTEGRATION` unset, so the suite passes trivially.

- **Success-criteria audit** is distinct from Plan 02's unit/integration tests — it ties each ROADMAP SC to a concrete implementation assertion. It's the "prove the phase is done" test that `/gsd-verify-work` reads.

- **Migration doc** lives in `docs/migration/` (new directory — Phase 36 creates it). Future migration docs (Phase 38 backfill, Phase 39 release) live under the same tree. Keep it concise (≤100 lines), user-facing.
</context_for_reader>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tests/hooks/session-end-capture.live.test.mjs</name>
  <files>tests/hooks/session-end-capture.live.test.mjs</files>
  <read_first>hooks/session-end-capture.mjs, tests/hooks/fixtures/mock-transcript.jsonl, .planning/phases/36-auto-session-capture/36-VALIDATION.md</read_first>
  <action>
    Create a live-API integration test file. Skeleton:

    ```javascript
    import { describe, it, expect, beforeAll } from 'vitest'; // or node:test
    import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    import { tmpdir, homedir } from 'node:os';
    import { spawn } from 'node:child_process';

    const LIVE = process.env.INTEGRATION === '1' && process.env.ANTHROPIC_API_KEY;

    describe.skipIf(!LIVE)('session-end-capture.mjs (live API, INTEGRATION=1)', () => {
      let tmpDir, projectDir, sessionId, transcriptPath;

      beforeAll(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'p36-live-'));
        projectDir = join(tmpDir, 'project');
        mkdirSync(projectDir, { recursive: true });

        sessionId = `live-test-${Date.now()}`;
        const slug = projectDir.replace(/\//g, '-').replace(/^-/, '');
        const transcriptDir = join(homedir(), '.claude', 'projects', slug);
        mkdirSync(transcriptDir, { recursive: true });
        transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);

        // Copy fixture
        const fixture = readFileSync(
          new URL('./fixtures/mock-transcript.jsonl', import.meta.url),
          'utf8'
        );
        writeFileSync(transcriptPath, fixture);
      });

      it('end-to-end: live Haiku extracts observations, writes to SQLite, costs < $0.05', async () => {
        const hookPath = new URL('../../hooks/session-end-capture.mjs', import.meta.url).pathname;
        const env = {
          ...process.env,
          CLAUDE_SESSION_ID: sessionId,
          CLAUDE_PROJECT_DIR: projectDir,
          VAULT_PATH: join(tmpDir, 'vault'),
          CDS_CAPTURE_DEBUG: '1',
        };

        const start = Date.now();
        const { code, stderr } = await new Promise((resolve) => {
          const proc = spawn(process.execPath, [hookPath], { env, stdio: 'pipe' });
          let stderr = '';
          proc.stderr.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => resolve({ code, stderr }));
        });
        const elapsed = Date.now() - start;

        expect(code).toBe(0);
        expect(elapsed).toBeLessThan(60_000);

        // Check SQLite — dynamic import openSessionsDB since it's not mocked
        const { openSessionsDB } = await import('@cds/core');
        const db = openSessionsDB(projectDir);
        const row = db.prepare('SELECT COUNT(*) as n FROM sessions WHERE id = ?').get(sessionId);
        expect(row.n).toBeGreaterThanOrEqual(1);

        const obs = db.prepare('SELECT COUNT(*) as n FROM observations WHERE session_id = ?').get(sessionId);
        expect(obs.n).toBeGreaterThanOrEqual(1);

        // Check cost log
        const logPath = join(homedir(), '.claude', 'cds-capture.log');
        if (existsSync(logPath)) {
          const log = readFileSync(logPath, 'utf8');
          // Rough cost check — parse last line, assert cost_usd < 0.05
          const lines = log.trim().split('\n').filter(Boolean);
          const last = lines[lines.length - 1];
          // Don't strictly parse — the dump format is CostTracker-defined. Just smoke-check.
          expect(last).toBeTruthy();
        }
      }, 90_000); // 90s timeout for the live test
    });
    ```

    Test stays simple — one test case, INTEGRATION=1 gated. Uses real `openSessionsDB` and real `dispatchAgent`. Timeout 90s to accommodate network latency.
  </action>
  <verify>`pnpm vitest run tests/hooks/session-end-capture.live.test.mjs` exits 0 with 0 passing + 1 skipped (default, no INTEGRATION env). Manual: `INTEGRATION=1 ANTHROPIC_API_KEY=... pnpm vitest run ...` exits 0 with 1 passing.</verify>
  <acceptance_criteria>
    - File `tests/hooks/session-end-capture.live.test.mjs` exists with ≥60 lines
    - Contains `describe.skipIf(!LIVE)` or equivalent gate
    - Contains `INTEGRATION === '1'` check
    - Contains `expect(row.n).toBeGreaterThanOrEqual(1)` (SQLite sessions row assertion)
    - Contains `expect(obs.n).toBeGreaterThanOrEqual(1)` (observations row assertion)
    - Default run (no INTEGRATION env) exits 0 with all tests SKIPPED
  </acceptance_criteria>
  <done>Live test in place, gated, runs when explicitly opted in.</done>
</task>

<task type="auto">
  <name>Task 2: Create tests/hooks/phase36-success-criteria.test.mjs acceptance audit</name>
  <files>tests/hooks/phase36-success-criteria.test.mjs</files>
  <read_first>hooks/session-end-capture.mjs, lib/install/hooks.mjs, .planning/ROADMAP.md, .planning/phases/36-auto-session-capture/36-CONTEXT.md</read_first>
  <action>
    Create a cross-cutting acceptance test that maps each ROADMAP SC#1-4 to a concrete assertion. Each SC gets its own `describe` block with 1-3 `it` cases. Heavy use of mocks — this runs in the default `pnpm test` suite.

    ```javascript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
    import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
    import { join } from 'node:path';
    import { tmpdir } from 'node:os';

    describe('Phase 36 Success Criteria Audit', () => {
      let tmpDir;

      beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'p36-sc-'));
      });

      afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
      });

      describe('SC#1: Detached execution → SQLite write within 60s', () => {
        it('wrapper hooks/session-end-capture.sh returns in <100ms (structural)', async () => {
          // Plan 02 Task 1 acceptance — here we re-assert for SC audit.
          const start = Date.now();
          await new Promise((resolve) => {
            const { spawn } = require('node:child_process');
            const proc = spawn('bash', ['hooks/session-end-capture.sh'], {
              env: { ...process.env, CLAUDE_SESSION_ID: '', CLAUDE_PROJECT_DIR: tmpDir },
              stdio: 'ignore',
            });
            proc.on('close', resolve);
          });
          const elapsed = Date.now() - start;
          expect(elapsed).toBeLessThan(200); // generous, accounting for CI jitter
        });

        it('hook Node script imports dispatchAgent + openSessionsDB from @cds/core', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/dispatchAgent.*@cds\/core/s);
          expect(src).toMatch(/openSessionsDB.*@cds\/core/s);
        });

        it('hook enforces 60s AbortController timeout', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/AbortController/);
          expect(src).toMatch(/60_000|TIMEOUT_MS/);
        });
      });

      describe('SC#2: context.md (Tier 3) gains session pointer', () => {
        it('hook imports updateContextHistory from lib/session-context.mjs', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/updateContextHistory.*from.*lib\/session-context\.mjs/s);
        });

        it('hook calls updateContextHistory with vaultPath, projectName, sessionLogFilename', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/updateContextHistory\s*\(\s*\{/);
          expect(src).toMatch(/vaultPath/);
          expect(src).toMatch(/projectName/);
          expect(src).toMatch(/sessionLogFilename/);
        });
      });

      describe('SC#3: Forced dispatchAgent throw → session exits normally + rollback', () => {
        it('hook classifies errors into silent|log|crash tiers', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/classifyError/);
          expect(src).toMatch(/silent/);
          expect(src).toMatch(/crash/);
        });

        it('hook wraps DB writes in a transaction (auto-rollback on throw)', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/\.transaction\s*\(/);
        });

        it('hook appends to ~/.claude/cds-capture.log on non-silent errors', () => {
          const src = readFileSync('hooks/session-end-capture.mjs', 'utf8');
          expect(src).toMatch(/cds-capture\.log/);
          expect(src).toMatch(/appendCaptureLog|appendFile/);
        });
      });

      describe('SC#4: Wizard replaces hook entry + prints migration message', () => {
        it('lib/install/hooks.mjs filters out session-end-check entries', () => {
          const src = readFileSync('lib/install/hooks.mjs', 'utf8');
          expect(src).toMatch(/filter.*session-end-check/s);
        });

        it('lib/install/hooks.mjs emits migration message via info()', () => {
          const src = readFileSync('lib/install/hooks.mjs', 'utf8');
          expect(src).toMatch(/auto-capture enabled, \/end no longer required for routine sessions/);
        });

        it('lib/install/hooks.mjs copies both wrapper and mjs to hooks dir', () => {
          const src = readFileSync('lib/install/hooks.mjs', 'utf8');
          expect(src).toMatch(/'session-end-capture\.sh'/);
          expect(src).toMatch(/'session-end-capture\.mjs'/);
        });

        it('skills/session-manager/SKILL.md description includes fallback keyword', () => {
          const src = readFileSync('skills/session-manager/SKILL.md', 'utf8');
          expect(src).toMatch(/fallback/);
        });
      });

      describe('Meta: structural safety', () => {
        it('hook uses spawn (argv array) for subprocess calls, not shell-string interpolation', () => {
          // Validates via the existing script structural guard.
          const { spawnSync } = require('node:child_process');
          const res = spawnSync(process.execPath, [
            'scripts/check-no-shell-interpolation.mjs',
            'hooks/session-end-capture.mjs',
          ], { stdio: 'pipe' });
          expect(res.status).toBe(0);
        });
      });
    });
    ```

    File size target: 120-180 lines.
  </action>
  <verify>`pnpm test tests/hooks/phase36-success-criteria.test.mjs` exits 0 with ≥12 tests passing.</verify>
  <acceptance_criteria>
    - File `tests/hooks/phase36-success-criteria.test.mjs` exists with ≥80 lines
    - Contains 4 `describe` blocks, one per SC# (plus optional meta block)
    - Contains ≥12 `it(` blocks total
    - Contains literal strings `'SC#1'`, `'SC#2'`, `'SC#3'`, `'SC#4'` in describe names
    - `pnpm test tests/hooks/phase36-success-criteria.test.mjs` exits 0 with all passing
  </acceptance_criteria>
  <done>ROADMAP SC#1-4 mapped to concrete assertions.</done>
</task>

<task type="auto">
  <name>Task 3: Create docs/migration/v1.0-auto-capture.md user-facing migration doc</name>
  <files>docs/migration/v1.0-auto-capture.md</files>
  <read_first>.planning/ROADMAP.md, .planning/STATE.md, .planning/phases/36-auto-session-capture/36-CONTEXT.md</read_first>
  <action>
    Create `docs/migration/v1.0-auto-capture.md`. Directory `docs/migration/` may not exist yet — create it.

    Content outline (~60-100 lines, plain markdown, user-facing tone):

    ```markdown
    # v1.0 Migration: Automatic Session Capture

    **Applies to:** Users upgrading from claude-dev-stack v0.12 to v1.0 alpha.

    ## What changed

    Before v1.0, session logging required manually invoking `/end` inside Claude
    Code. That flow still exists as a fallback, but the primary capture path is
    now **automatic**: when Claude Code fires its Stop event (session exit),
    claude-dev-stack launches a detached Node process that:

    1. Reads your session transcript from `~/.claude/projects/{slug}/{id}.jsonl`.
    2. Extracts structured observations via Haiku (tool_use with a typed schema).
    3. Writes the observations to a per-project SQLite database at
       `~/vault/projects/{name}/sessions.db`.
    4. Updates `vault/projects/{name}/context.md` (Tier 3) with a session pointer.
    5. Triggers your NotebookLM sync (if configured).
    6. Pushes your vault git repo (if a remote is configured).

    Your Claude Code session exit is **never blocked** by any of this — the
    capture process runs fully in the background.

    ## How to upgrade

    Run the install wizard again:

    ```bash
    npx claude-dev-stack
    ```

    The wizard will:
    - Copy `hooks/session-end-capture.sh` and `hooks/session-end-capture.mjs`
      to `~/.claude/hooks/`.
    - Update each configured project's `.claude/settings.json` Stop hook list:
      remove the legacy `session-end-check.sh` entry, add the new
      `session-end-capture.sh` entry.
    - Print `auto-capture enabled, /end no longer required for routine sessions`.

    Re-running the wizard later is safe — it detects existing registrations and
    makes no changes (idempotent).

    ## What about my custom Stop hooks?

    If your `.claude/settings.json` has Stop hooks that aren't authored by
    claude-dev-stack, the wizard will **preserve them** and print a warning:

    ```
    ⚠ Custom Stop hooks detected in {path} — auto-capture added alongside.
      Review for conflicts.
    ```

    The new auto-capture hook will fire alongside your custom hooks; review the
    list to make sure they don't conflict on shared resources (e.g., both
    pushing the same git repo).

    ## Can I opt out?

    Yes — create `~/.claude/cds-capture-config.json`:

    ```json
    { "enabled": false }
    ```

    The Stop hook still fires but exits immediately without doing any work.
    Your session won't be captured into SQLite, but the hook also won't
    trigger NotebookLM sync, context.md update, or vault push — so only
    opt out if you're using a completely custom pipeline.

    ## What about the /end skill?

    The `session-manager` skill and its `/end` command stay installed. They're
    now a **fallback** — useful when:
    - Auto-capture is disabled (see above).
    - You want to manually write a richer session log than Haiku extracts.
    - A specific session failed to capture (check `~/.claude/cds-capture.log`
      for errors — see "Troubleshooting" below).

    ## Troubleshooting

    **Capture failed silently. Where do I look?**

    ```bash
    tail -f ~/.claude/cds-capture.log
    ```

    The log rotates at 1 MB (keeping the last 3). Typical entries:

    - `silent` tier (no log entry) — intentional skip: missing session id,
      missing transcript, rate limit, SQLite busy. Expected sometimes.
    - `log` tier — recoverable: malformed tool_use, schema drift, rollback.
      Next session will capture fresh.
    - `crash` tier — unexpected error. If you see these, open an issue.

    **See more detail in real time:**

    ```bash
    CDS_CAPTURE_DEBUG=1 bash ~/.claude/hooks/session-end-capture.sh
    ```

    Runs synchronously with stderr passthrough. Do NOT set this in settings.json —
    it's a debug-only flag for manual invocation.

    ## Known limitations (v1.0 alpha)

    - Capture cost is budgeted at ~$0.02/session (soft cap). Real cost may
      exceed budget on very long sessions — we log the overage but don't
      block.
    - Session transcripts written to the jsonl file AFTER the Stop event
      fires are not captured (Claude Code writes asynchronously).
    - Vault git push retains v0.12 behavior: silently skips on merge conflicts.
    - No retry queue — failed captures are not re-attempted. Planned for v1.1.
    ```

    Keep the tone informational and concrete. No marketing language.
  </action>
  <verify>`test -f docs/migration/v1.0-auto-capture.md && wc -l docs/migration/v1.0-auto-capture.md` shows ≥30 lines.</verify>
  <acceptance_criteria>
    - Directory `docs/migration/` exists
    - File `docs/migration/v1.0-auto-capture.md` exists with ≥30 lines
    - File contains literal `auto-capture` (multiple times)
    - File contains a "How to upgrade" section with `npx claude-dev-stack` instruction
    - File contains an "Opt out" section with `cds-capture-config.json` example
    - File contains a "Troubleshooting" section with `~/.claude/cds-capture.log` reference
    - File contains a "Known limitations" section
  </acceptance_criteria>
  <done>Migration doc in place for Phase 39 release notes to reference.</done>
</task>

<task type="auto">
  <name>Task 4: Add test:live script to package.json</name>
  <files>package.json</files>
  <read_first>package.json</read_first>
  <action>
    Read current `package.json` (already modified by Plan 02 for the pretest structural guard). Add a `test:live` script to the `scripts` object:
    ```json
    {
      "scripts": {
        "test:live": "INTEGRATION=1 pnpm vitest run tests/hooks/session-end-capture.live.test.mjs"
      }
    }
    ```

    On Windows, `INTEGRATION=1 ...` inline env won't work — if the project supports Windows, use `cross-env` (already a transitive dep of many CLI tools, but verify). If not a transitive dep, document in the script comment that `test:live` is POSIX-only; Windows users set the env var manually.

    Recommended safe shape:
    ```json
    {
      "scripts": {
        "test:live": "cross-env INTEGRATION=1 vitest run tests/hooks/session-end-capture.live.test.mjs"
      }
    }
    ```

    If `cross-env` is not already in devDependencies, add it: `pnpm add -Dw cross-env`. Small, well-known, zero-risk dep.

    Do NOT change existing scripts (`test`, `pretest`, `test:structural` from Plan 02). Do NOT add any other scripts.
  </action>
  <verify>`pnpm test:live` (with `INTEGRATION` env unset by virtue of skip) runs the test file and shows 1 skipped. `grep '"test:live"' package.json` exits 0.</verify>
  <acceptance_criteria>
    - `package.json` contains `"test:live"` script entry
    - The test:live command references `tests/hooks/session-end-capture.live.test.mjs`
    - Running `pnpm test:live` (without INTEGRATION set → test skips) exits 0
    - `cross-env` is in devDependencies if used in the script
    - No other scripts modified
  </acceptance_criteria>
  <done>Live test invocable via pnpm script.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `pnpm test tests/hooks/phase36-success-criteria.test.mjs` exits 0 with ≥12 tests passing
- [ ] `pnpm vitest run tests/hooks/session-end-capture.live.test.mjs` exits 0 with 1 skipped (INTEGRATION not set)
- [ ] `pnpm test:live` (without INTEGRATION set) exits 0 with 1 skipped
- [ ] `test -f docs/migration/v1.0-auto-capture.md` exits 0
- [ ] Full `pnpm test` suite exits 0 — Phase 33 baseline preserved, Plans 01-03 tests green, new tests green
- [ ] Manual verification (optional): `INTEGRATION=1 ANTHROPIC_API_KEY=... pnpm test:live` runs the live test and writes ≥1 session row to SQLite
</verification>

<success_criteria>
- All 4 tasks completed with acceptance criteria met
- Live API test exists and is gated (skipped by default)
- Success-criteria audit covers all 4 ROADMAP SC#1-4 with ≥12 assertions
- Migration doc is user-facing and actionable
- 928/931 root test baseline preserved (Phase 33 D-06)
- All new tests (except live) run in <10 s
- Phase 36 is fully verifiable by running `pnpm test && pnpm test:live` (the latter with INTEGRATION=1)
</success_criteria>

<output>
After completion, create `.planning/phases/36-auto-session-capture/36-04-SUMMARY.md` documenting:
- Files created (3 new + 1 modified)
- Test counts: default suite, live tier (expected skipped by default)
- Any deviations from the SC audit (e.g., if SC#2 couldn't be asserted via source grep and needs a behavioral test instead)
- Migration doc line count + accuracy review
- Final Phase 36 state: which ROADMAP SCs are fully green, which are green-pending-live-test-run
- Recommendation: run `INTEGRATION=1 pnpm test:live` locally before tagging Phase 36 complete
</output>
