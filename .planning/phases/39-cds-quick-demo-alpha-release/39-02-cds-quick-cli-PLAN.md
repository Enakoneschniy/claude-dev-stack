---
plan_id: 39-02-cds-quick-cli
phase: 39
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - packages/cds-cli/src/quick.ts
  - packages/cds-cli/src/capture-standalone.ts
  - packages/cds-cli/src/quick.test.ts
  - packages/cds-cli/src/capture-standalone.test.ts
  - packages/cds-cli/src/quick.integration.test.ts
  - packages/cds-cli/tests/helpers/mock-dispatch-agent.ts
  - packages/cds-cli/tests/helpers/temp-home.ts
  - packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl
  - packages/cds-cli/package.json
autonomous: true
requirements:
  - DEMO-01
user_setup: []
must_haves:
  truths:
    - "`packages/cds-cli/src/quick.ts` exports `main(args: string[]): Promise<void>`, `parseFlags(args: string[]): QuickFlags`, and interface `QuickFlags { json: boolean; model: string; maxCost?: number }`"
    - "`main()` with no args prints 'Usage:' to stderr and exits 1"
    - "`main()` with a task arg calls dispatchAgent({ model: 'haiku', prompt: task, session_id })"
    - "`--model sonnet` / `--model opus` overrides the default 'haiku'"
    - "`--json` mode: stdout is exactly `JSON.stringify({ output, cost, sessionId })`"
    - "Text mode: stdout shows result.output then a cost footer matching /── cost: \\$\\d+\\.\\d{4} · session: [0-9a-f-]+$/"
    - "When CLAUDE_SESSION_ID env var is set, captureStandalone is NOT invoked (sessionId inherited)"
    - "When CLAUDE_SESSION_ID is absent, sessionId is crypto.randomUUID() AND captureStandalone({ task, output, sessionId, projectPath }) is invoked"
    - "`captureStandalone` writes `$HOME/.claude/projects/{slug}/{sessionId}.jsonl` with exactly 2 newline-delimited JSON messages (user + assistant) then spawns `~/.claude/hooks/session-end-capture.sh` detached with CLAUDE_SESSION_ID + CLAUDE_PROJECT_DIR env"
    - "dispatchAgent throw: main prints `dispatch error:` prefixed message to stderr + exits 1"
    - "All 10 unit tests in `quick.test.ts` + 3 tests in `capture-standalone.test.ts` pass"
    - "Integration test `quick.integration.test.ts` guarded behind `INTEGRATION=1` env var; validates live Haiku end-to-end"
  artifacts:
    - path: "packages/cds-cli/src/quick.ts"
      provides: "Real /cds-quick CLI body — replaces Plan 01 stub"
      contains: "dispatchAgent"
      min_lines: 40
    - path: "packages/cds-cli/src/capture-standalone.ts"
      provides: "Synthetic transcript writer + detached hook spawner for standalone mode"
      contains: "captureStandalone"
      min_lines: 30
    - path: "packages/cds-cli/src/quick.test.ts"
      provides: "Unit tests: arg parsing, json mode, text mode, claude-code path, standalone path, usage, error"
      contains: "describe('quick"
    - path: "packages/cds-cli/src/capture-standalone.test.ts"
      provides: "Unit tests: writes transcript at correct path, correct shape, spawns detached hook"
      contains: "describe('captureStandalone"
    - path: "packages/cds-cli/src/quick.integration.test.ts"
      provides: "INTEGRATION=1 gated live Haiku smoke test"
      contains: "INTEGRATION"
    - path: "packages/cds-cli/tests/helpers/mock-dispatch-agent.ts"
      provides: "Mock of @cds/core dispatchAgent returning pre-canned responses keyed by prompt sha256"
      contains: "mockDispatchAgent"
    - path: "packages/cds-cli/tests/helpers/temp-home.ts"
      provides: "Per-test mkdtemp HOME setup + teardown"
      contains: "mkdtempSync"
    - path: "packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl"
      provides: "Reference 2-line transcript for bit-exact shape assertion"
      contains: "type"
  key_links:
    - from: "packages/cds-cli/src/quick.ts"
      to: "packages/cds-core/src/agent-dispatcher.ts (dispatchAgent)"
      via: "named import — runtime SDK call"
      pattern: "from '@cds/core'"
    - from: "packages/cds-cli/src/quick.ts"
      to: "packages/cds-core/src/cost-tracker.ts (CostTracker)"
      via: "named import — cost accounting per dispatch"
      pattern: "CostTracker"
    - from: "packages/cds-cli/src/capture-standalone.ts"
      to: "hooks/session-end-capture.sh (Phase 36 detached wrapper)"
      via: "spawn + unref — fire-and-forget"
      pattern: "session-end-capture.sh"
    - from: "packages/cds-cli/src/capture-standalone.ts"
      to: "$HOME/.claude/projects/{slug}/{sessionId}.jsonl"
      via: "writeFile synthetic transcript in Claude Code projects dir"
      pattern: "\\.claude/projects"
---

<objective>
Implement the real `/cds-quick` CLI body in `packages/cds-cli/src/quick.ts` (replacing Plan 01's stub), plus its sibling `capture-standalone.ts` helper that writes a synthetic transcript and fires the Phase 36 capture hook. This is the DEMO-01 deliverable — the one-shot agent dispatch with cost reporting + standalone capture path.

Purpose: satisfy DEMO-01 (single-dispatch agent run with result summary + cost + session capture).

Output: 2 production TypeScript modules + 3 test files + 2 test helpers + 1 fixture under `packages/cds-cli/`. Real `quick.ts` overwrites Plan 01's stub.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md
@./CLAUDE.md
@./packages/cds-cli/package.json

<interfaces>
Upstream (MUST exist at plan-start — from Phase 34 + Phase 36):

```ts
// @cds/core exports (Phase 34 D-17):
export async function dispatchAgent(opts: {
  model: string;                           // 'haiku' | 'sonnet' | 'opus' | full model id
  prompt: string;
  system?: string;
  tools?: Array<{ name: string; input_schema: object; handler: (args: any) => Promise<any> }>;
  signal?: AbortSignal;
  session_id: string;
  max_tokens?: number;
}): Promise<{
  output: string;
  tokens: { input: number; output: number };
  stop_reason: string;
  tool_calls?: Array<{ name: string; input: any }>;
}>;

// @cds/core CostTracker (Phase 34 D-??):
export class CostTracker {
  constructor(sessionId: string);
  record(event: { model: string; tokens: { input: number; output: number } }): void;
  total(): { cost_usd: number; tokens: { input: number; output: number } };
  dump(): string;
}
```

Phase 36 Stop hook (MUST exist at plan-start):
- `hooks/session-end-capture.sh` — POSIX shell, double-fork detached wrapper
- `hooks/session-end-capture.mjs` — Node implementation; reads transcript via `@cds/core/capture/transcript.ts`

Phase 36 transcript location (D-60):
- `$HOME/.claude/projects/{slug}/{sessionId}.jsonl`
- slug derivation: `projectPath.replaceAll(path.sep, '-').replace(/^-/, '')`

If any of these are absent at Task 1 start — HARD STOP, write STATE.md blocker entry.

packages/cds-cli/package.json adds one new dep (if not already present from Phase 37):
```json
{
  "dependencies": {
    "@cds/core": "workspace:*"
  },
  "devDependencies": {
    "vitest": "4.1.4"
  }
}
```
If already present, no change.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write real packages/cds-cli/src/quick.ts (overwrites Plan 01 stub)</name>
  <read_first>
    - ./packages/cds-cli/src/quick.ts (current — Plan 01 stub, overwrite)
    - ./packages/cds-core/src/agent-dispatcher.ts (verify dispatchAgent export — fail if absent)
    - ./packages/cds-core/src/cost-tracker.ts (verify CostTracker export — fail if absent)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"packages/cds-cli/src/quick.ts"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-112"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 4
  </read_first>
  <files>
    - packages/cds-cli/src/quick.ts (overwrite stub)
  </files>
  <action>
  Overwrite `packages/cds-cli/src/quick.ts` with EXACTLY the following content:

  ```ts
  // packages/cds-cli/src/quick.ts
  // /cds-quick CLI body — one-shot agent dispatch with cost reporting + standalone capture.
  // Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-112
  import { dispatchAgent, CostTracker } from '@cds/core';
  import crypto from 'node:crypto';
  import { captureStandalone } from './capture-standalone.js';

  export interface QuickFlags {
    json: boolean;
    model: string;
    maxCost?: number;
  }

  function extractValue(args: string[], name: string): string | undefined {
    const idx = args.indexOf(name);
    if (idx < 0 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
  }

  export function parseFlags(args: string[]): QuickFlags {
    const maxCostRaw = extractValue(args, '--max-cost');
    return {
      json: args.includes('--json'),
      model: extractValue(args, '--model') ?? 'haiku',
      maxCost: maxCostRaw !== undefined ? Number(maxCostRaw) : undefined,
    };
  }

  function printUsage(): void {
    const lines = [
      'Usage: claude-dev-stack quick "<task>" [flags]',
      '',
      'Flags:',
      '  --json              Emit machine-readable JSON { output, cost, sessionId }',
      '  --model <name>      Override model (haiku, sonnet, opus); default: haiku',
      '  --max-cost <usd>    Soft cap in USD (warning only, not enforced)',
      '',
      'Example: claude-dev-stack quick "summarize current planning state"',
    ];
    console.error(lines.join('\n'));
  }

  export async function main(args: string[]): Promise<void> {
    const task = args[0];
    if (!task || task.startsWith('-')) {
      printUsage();
      process.exit(1);
    }

    const opts = parseFlags(args.slice(1));
    const sessionId = process.env.CLAUDE_SESSION_ID ?? crypto.randomUUID();
    const tracker = new CostTracker(sessionId);

    let result: { output: string; tokens: { input: number; output: number }; stop_reason: string };
    try {
      result = await dispatchAgent({
        model: opts.model,
        prompt: task,
        session_id: sessionId,
      });
      tracker.record({ model: opts.model, tokens: result.tokens });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`dispatch error: ${msg}`);
      process.exit(1);
    }

    // Standalone mode: no Claude Code Stop hook will fire. Trigger capture manually.
    if (!process.env.CLAUDE_SESSION_ID) {
      try {
        await captureStandalone({
          task,
          output: result.output,
          sessionId,
          projectPath: process.cwd(),
        });
      } catch {
        // Fail-silent (matches Phase 36 D-66 behavior)
      }
    }

    const cost = tracker.total();
    if (opts.json) {
      console.log(JSON.stringify({ output: result.output, cost, sessionId }));
    } else {
      console.log(result.output);
      console.log(`\n── cost: $${cost.cost_usd.toFixed(4)} · session: ${sessionId}`);
    }
  }
  ```
  </action>
  <verify>
    <automated>grep -q "export async function main" packages/cds-cli/src/quick.ts && grep -q "export function parseFlags" packages/cds-cli/src/quick.ts && grep -q "export interface QuickFlags" packages/cds-cli/src/quick.ts && grep -q "from '@cds/core'" packages/cds-cli/src/quick.ts && grep -q "captureStandalone" packages/cds-cli/src/quick.ts && grep -q "crypto.randomUUID" packages/cds-cli/src/quick.ts && grep -q "── cost: \\\$" packages/cds-cli/src/quick.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/quick.ts` -> exits 0
    - `grep -c "export async function main" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "export function parseFlags" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "export interface QuickFlags" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "from '@cds/core'" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "dispatchAgent" packages/cds-cli/src/quick.ts` -> >= 1
    - `grep -c "CostTracker" packages/cds-cli/src/quick.ts` -> >= 1
    - `grep -c "captureStandalone" packages/cds-cli/src/quick.ts` -> >= 2 (import + call)
    - `grep -c "crypto.randomUUID" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "process.env.CLAUDE_SESSION_ID" packages/cds-cli/src/quick.ts` -> >= 2 (session id + standalone check)
    - `grep -c "dispatch error:" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "Usage:" packages/cds-cli/src/quick.ts` -> 1
    - `grep -c "── cost:" packages/cds-cli/src/quick.ts` -> 1
    - `pnpm --filter @cds/cli exec tsc --noEmit` -> exits 0 (type-checks clean)
  </acceptance_criteria>
  <done>
  Real quick.ts written. Plan 01 stub replaced. Imports @cds/core primitives + local capture-standalone helper. Type-checks clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write packages/cds-cli/src/capture-standalone.ts</name>
  <read_first>
    - ./hooks/session-end-capture.sh (verify exists — Phase 36 artifact, fail loud if absent)
    - ./hooks/session-end-capture.mjs (verify exists — Phase 36 artifact)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"packages/cds-cli/src/capture-standalone.ts"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-113"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 5
    - .planning/phases/36-auto-session-capture/36-CONTEXT.md §"D-60" (transcript location + slug derivation)
  </read_first>
  <files>
    - packages/cds-cli/src/capture-standalone.ts (new)
  </files>
  <action>
  Create `packages/cds-cli/src/capture-standalone.ts` with EXACTLY:

  ```ts
  // packages/cds-cli/src/capture-standalone.ts
  // Standalone-mode session capture: writes a synthetic Claude-Code-style transcript
  // then spawns the Phase 36 session-end-capture.sh detached so it can extract observations
  // into SQLite via the normal capture pathway.
  // Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-113
  //         .planning/phases/36-auto-session-capture/36-CONTEXT.md §D-60 (transcript format)
  import { spawn } from 'node:child_process';
  import { writeFile, mkdir } from 'node:fs/promises';
  import { homedir } from 'node:os';
  import path from 'node:path';

  export interface StandaloneParams {
    task: string;
    output: string;
    sessionId: string;
    projectPath: string;
  }

  /**
   * Derive Claude Code's project slug from an absolute project path.
   * Matches Phase 36 D-60: dashes-for-slashes, strip leading dash.
   */
  export function deriveSlug(projectPath: string): string {
    return projectPath.split(path.sep).filter(Boolean).join('-');
  }

  /**
   * Write synthetic 2-message transcript + spawn session-end-capture.sh detached.
   * Fail-silent: if the hook wrapper is missing, writes the transcript anyway and returns.
   */
  export async function captureStandalone(p: StandaloneParams): Promise<void> {
    const slug = deriveSlug(p.projectPath);
    const transcriptDir = path.join(homedir(), '.claude', 'projects', slug);
    const transcriptPath = path.join(transcriptDir, `${p.sessionId}.jsonl`);

    await mkdir(transcriptDir, { recursive: true });

    const userMsg = {
      type: 'user',
      uuid: 'u1',
      session_id: p.sessionId,
      content: { role: 'user', content: [{ type: 'text', text: p.task }] },
    };
    const assistantMsg = {
      type: 'assistant',
      uuid: 'a1',
      session_id: p.sessionId,
      content: { role: 'assistant', content: [{ type: 'text', text: p.output }] },
    };

    const lines = [JSON.stringify(userMsg), JSON.stringify(assistantMsg)];
    await writeFile(transcriptPath, lines.join('\n') + '\n', 'utf8');

    // Spawn session-end-capture.sh detached; fail-silent per Phase 36 D-66
    const hookScript = path.join(homedir(), '.claude', 'hooks', 'session-end-capture.sh');
    try {
      const child = spawn(hookScript, [], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: p.sessionId,
          CLAUDE_PROJECT_DIR: p.projectPath,
        },
      });
      child.unref();
    } catch {
      // Hook wrapper missing or not executable — transcript is written, capture is best-effort.
    }
  }
  ```
  </action>
  <verify>
    <automated>grep -q "export async function captureStandalone" packages/cds-cli/src/capture-standalone.ts && grep -q "export function deriveSlug" packages/cds-cli/src/capture-standalone.ts && grep -q "session-end-capture.sh" packages/cds-cli/src/capture-standalone.ts && grep -q "detached: true" packages/cds-cli/src/capture-standalone.ts && grep -q "CLAUDE_SESSION_ID" packages/cds-cli/src/capture-standalone.ts && grep -q "CLAUDE_PROJECT_DIR" packages/cds-cli/src/capture-standalone.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/capture-standalone.ts` -> exits 0
    - `grep -c "export async function captureStandalone" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "export function deriveSlug" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "session-end-capture.sh" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "detached: true" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "stdio: 'ignore'" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "child.unref()" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "CLAUDE_SESSION_ID" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `grep -c "CLAUDE_PROJECT_DIR" packages/cds-cli/src/capture-standalone.ts` -> 1
    - `pnpm --filter @cds/cli exec tsc --noEmit` -> exits 0
  </acceptance_criteria>
  <done>
  capture-standalone.ts written. Writes synthetic transcript to Claude-Code-style path + fires detached capture hook with env.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create test helpers — mock-dispatch-agent + temp-home</name>
  <read_first>
    - ./packages/cds-migrate/tests/helpers/mock-dispatch-agent.ts (Phase 38 analog — if exists)
    - ./packages/cds-migrate/tests/helpers/temp-vault.ts (Phase 38 analog — if exists)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Wave 0
  </read_first>
  <files>
    - packages/cds-cli/tests/helpers/mock-dispatch-agent.ts (new)
    - packages/cds-cli/tests/helpers/temp-home.ts (new)
    - packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl (new)
  </files>
  <action>
  Create three helper/fixture files.

  **1. `packages/cds-cli/tests/helpers/mock-dispatch-agent.ts`:**

  ```ts
  // packages/cds-cli/tests/helpers/mock-dispatch-agent.ts
  // Shared mock for @cds/core dispatchAgent. Returns pre-canned responses
  // keyed by sha256 of the prompt string, or a default shape.
  import crypto from 'node:crypto';
  import { vi } from 'vitest';

  export interface MockResponse {
    output: string;
    tokens?: { input: number; output: number };
    stop_reason?: string;
  }

  export interface MockDispatchOpts {
    responses?: Record<string, MockResponse>;  // keyed by sha256(prompt)
    default?: MockResponse;
    throwOn?: string;  // sha256 of prompt to throw on
  }

  export function mockDispatchAgent(opts: MockDispatchOpts = {}) {
    const defaultResp: MockResponse = opts.default ?? {
      output: 'mock agent output',
      tokens: { input: 50, output: 25 },
      stop_reason: 'end_turn',
    };

    return vi.fn(async (callOpts: { model: string; prompt: string; session_id: string }) => {
      const key = crypto.createHash('sha256').update(callOpts.prompt).digest('hex');
      if (opts.throwOn && key === opts.throwOn) {
        throw new Error(`mock dispatch: configured to throw on prompt ${key.slice(0, 8)}`);
      }
      const resp = opts.responses?.[key] ?? defaultResp;
      return {
        output: resp.output,
        tokens: resp.tokens ?? { input: 50, output: 25 },
        stop_reason: resp.stop_reason ?? 'end_turn',
      };
    });
  }
  ```

  **2. `packages/cds-cli/tests/helpers/temp-home.ts`:**

  ```ts
  // packages/cds-cli/tests/helpers/temp-home.ts
  // Per-test HOME override via mkdtempSync. Returns { tempHome, restore }.
  import { mkdtempSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import path from 'node:path';

  export interface TempHome {
    tempHome: string;
    restore: () => void;
  }

  export function setupTempHome(): TempHome {
    const tempHome = mkdtempSync(path.join(tmpdir(), 'cds-quick-home-'));
    const originalHome = process.env.HOME;
    const originalUserprofile = process.env.USERPROFILE;
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome; // Windows compat

    return {
      tempHome,
      restore: () => {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        else delete process.env.HOME;
        if (originalUserprofile !== undefined) process.env.USERPROFILE = originalUserprofile;
        else delete process.env.USERPROFILE;
        try {
          rmSync(tempHome, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup; don't fail the test if rm fails on Windows.
        }
      },
    };
  }
  ```

  **3. `packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl`:**

  ```jsonl
  {"type":"user","uuid":"u1","session_id":"FIXTURE-SESSION-ID","content":{"role":"user","content":[{"type":"text","text":"FIXTURE_TASK"}]}}
  {"type":"assistant","uuid":"a1","session_id":"FIXTURE-SESSION-ID","content":{"role":"assistant","content":[{"type":"text","text":"FIXTURE_OUTPUT"}]}}
  ```

  (Two lines + trailing newline. Used by capture-standalone.test.ts to byte-compare the shape.)
  </action>
  <verify>
    <automated>test -f packages/cds-cli/tests/helpers/mock-dispatch-agent.ts && test -f packages/cds-cli/tests/helpers/temp-home.ts && test -f packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl && grep -q "mockDispatchAgent" packages/cds-cli/tests/helpers/mock-dispatch-agent.ts && grep -q "setupTempHome" packages/cds-cli/tests/helpers/temp-home.ts && [ $(wc -l < packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl) -ge 2 ]</automated>
  </verify>
  <acceptance_criteria>
    - 3 files exist at listed paths
    - `grep -c "export function mockDispatchAgent" packages/cds-cli/tests/helpers/mock-dispatch-agent.ts` -> 1
    - `grep -c "export function setupTempHome" packages/cds-cli/tests/helpers/temp-home.ts` -> 1
    - `wc -l packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl | awk '{print $1}'` -> 2 (plus trailing newline)
    - `pnpm --filter @cds/cli exec tsc --noEmit` -> exits 0
  </acceptance_criteria>
  <done>
  Test helpers + fixture written. Reusable by Plan 04/05 if needed.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create packages/cds-cli/src/quick.test.ts (unit tests)</name>
  <read_first>
    - ./packages/cds-cli/src/quick.ts (created in Task 1)
    - ./packages/cds-cli/tests/helpers/mock-dispatch-agent.ts (created in Task 3)
    - ./packages/cds-cli/tests/helpers/temp-home.ts (created in Task 3)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-02-01..07
  </read_first>
  <files>
    - packages/cds-cli/src/quick.test.ts (new)
  </files>
  <action>
  ```ts
  // packages/cds-cli/src/quick.test.ts
  // Unit tests for /cds-quick CLI body. Mocks @cds/core dispatchAgent.
  // Source: Phase 39 VALIDATION §Task 39-02-01..07
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import { mockDispatchAgent } from '../tests/helpers/mock-dispatch-agent.js';
  import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';

  // Mock @cds/core before importing quick.ts. We use vi.hoisted so the mock
  // is in place before ES module hoisting resolves quick.ts's imports.
  const { mockDispatchFn } = vi.hoisted(() => ({ mockDispatchFn: mockDispatchAgent() }));

  vi.mock('@cds/core', () => ({
    dispatchAgent: mockDispatchFn,
    CostTracker: class {
      private sessionId: string;
      private events: Array<{ model: string; tokens: { input: number; output: number } }> = [];
      constructor(sessionId: string) {
        this.sessionId = sessionId;
      }
      record(e: { model: string; tokens: { input: number; output: number } }) {
        this.events.push(e);
      }
      total() {
        const tokens = this.events.reduce(
          (a, e) => ({ input: a.input + e.tokens.input, output: a.output + e.tokens.output }),
          { input: 0, output: 0 },
        );
        // Haiku: $0.80/M input, $4.00/M output — approximate
        const cost_usd = (tokens.input * 0.0000008) + (tokens.output * 0.000004);
        return { cost_usd, tokens };
      }
      dump() {
        return `session ${this.sessionId}: ${JSON.stringify(this.total())}`;
      }
    },
  }));

  // Mock capture-standalone so tests don't write real files / spawn real hooks.
  const mockCapture = vi.fn(async () => {});
  vi.mock('./capture-standalone.js', () => ({
    captureStandalone: mockCapture,
  }));

  import { main, parseFlags } from './quick.js';

  describe('quick.ts parseFlags', () => {
    it('arg parsing: defaults', () => {
      const flags = parseFlags([]);
      expect(flags.json).toBe(false);
      expect(flags.model).toBe('haiku');
      expect(flags.maxCost).toBeUndefined();
    });

    it('arg parsing: --json', () => {
      expect(parseFlags(['--json']).json).toBe(true);
    });

    it('arg parsing: --model override', () => {
      expect(parseFlags(['--model', 'sonnet']).model).toBe('sonnet');
      expect(parseFlags(['--model', 'opus']).model).toBe('opus');
    });

    it('arg parsing: --max-cost', () => {
      expect(parseFlags(['--max-cost', '0.05']).maxCost).toBe(0.05);
    });
  });

  describe('quick.ts main', () => {
    let tempHome: TempHome;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      tempHome = setupTempHome();
      mockDispatchFn.mockClear();
      mockCapture.mockClear();
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      tempHome.restore();
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
      delete process.env.CLAUDE_SESSION_ID;
    });

    it('usage: no args -> stderr + exit 1', async () => {
      await expect(main([])).rejects.toThrow('exit:1');
      expect(errSpy).toHaveBeenCalled();
      const errOutput = errSpy.mock.calls.flat().join('\n');
      expect(errOutput).toMatch(/Usage:/);
    });

    it('usage: only flags, no task -> exit 1', async () => {
      await expect(main(['--json'])).rejects.toThrow('exit:1');
    });

    it('dispatch called with haiku default', async () => {
      await main(['summarize this']);
      expect(mockDispatchFn).toHaveBeenCalledOnce();
      const callArgs = mockDispatchFn.mock.calls[0][0];
      expect(callArgs.model).toBe('haiku');
      expect(callArgs.prompt).toBe('summarize this');
      expect(callArgs.session_id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('--model override passed through', async () => {
      await main(['some task', '--model', 'sonnet']);
      expect(mockDispatchFn.mock.calls[0][0].model).toBe('sonnet');
    });

    it('json output: stdout is valid JSON with output, cost, sessionId', async () => {
      await main(['some task', '--json']);
      const stdout = logSpy.mock.calls.flat().join('');
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('output');
      expect(parsed).toHaveProperty('cost');
      expect(parsed).toHaveProperty('sessionId');
      expect(parsed.cost.cost_usd).toBeTypeOf('number');
      expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('text output: result + cost footer', async () => {
      await main(['some task']);
      const stdout = logSpy.mock.calls.flat().join('\n');
      expect(stdout).toContain('mock agent output');
      expect(stdout).toMatch(/── cost: \$\d+\.\d{4} · session: [0-9a-f-]+/);
    });

    it('claude-code path: CLAUDE_SESSION_ID set -> captureStandalone NOT invoked', async () => {
      process.env.CLAUDE_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      await main(['task in claude code']);
      expect(mockCapture).not.toHaveBeenCalled();
      // sessionId in output should be the inherited env var
      const stdout = logSpy.mock.calls.flat().join('\n');
      expect(stdout).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('standalone path: no CLAUDE_SESSION_ID -> captureStandalone invoked', async () => {
      await main(['task standalone']);
      expect(mockCapture).toHaveBeenCalledOnce();
      const captureArgs = mockCapture.mock.calls[0][0] as {
        task: string;
        output: string;
        sessionId: string;
        projectPath: string;
      };
      expect(captureArgs.task).toBe('task standalone');
      expect(captureArgs.output).toBe('mock agent output');
      expect(captureArgs.projectPath).toBe(process.cwd());
      expect(captureArgs.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('error handling: dispatchAgent throws -> stderr + exit 1', async () => {
      mockDispatchFn.mockRejectedValueOnce(new Error('API rate limited'));
      await expect(main(['task that fails'])).rejects.toThrow('exit:1');
      const errOutput = errSpy.mock.calls.flat().join('\n');
      expect(errOutput).toMatch(/dispatch error:.*API rate limited/);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-cli/src/quick.test.ts && pnpm --filter @cds/cli vitest run src/quick.test.ts --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/quick.test.ts` -> exits 0
    - `pnpm --filter @cds/cli vitest run src/quick.test.ts` -> exits 0 + all 10+ tests pass (4 parseFlags + 7+ main)
    - `grep -c "describe.*parseFlags" packages/cds-cli/src/quick.test.ts` -> 1
    - `grep -c "describe.*main" packages/cds-cli/src/quick.test.ts` -> 1
    - `grep -c "usage:" packages/cds-cli/src/quick.test.ts` -> >= 2
    - `grep -c "standalone" packages/cds-cli/src/quick.test.ts` -> >= 2
    - `grep -c "CLAUDE_SESSION_ID" packages/cds-cli/src/quick.test.ts` -> >= 2
  </acceptance_criteria>
  <done>
  quick.test.ts passes all 11+ tests covering: parseFlags (4), usage (2), dispatch (2), output modes (2), path branching (2), error (1).
  </done>
</task>

<task type="auto">
  <name>Task 5: Create packages/cds-cli/src/capture-standalone.test.ts</name>
  <read_first>
    - ./packages/cds-cli/src/capture-standalone.ts (created in Task 2)
    - ./packages/cds-cli/tests/helpers/temp-home.ts (Task 3)
    - ./packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl (Task 3)
  </read_first>
  <files>
    - packages/cds-cli/src/capture-standalone.test.ts (new)
  </files>
  <action>
  ```ts
  // packages/cds-cli/src/capture-standalone.test.ts
  // Unit tests for captureStandalone: writes synthetic transcript, spawns hook.
  // Source: Phase 39 VALIDATION §Task 39-02-05
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import path from 'node:path';
  import { homedir } from 'node:os';
  import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';
  import { captureStandalone, deriveSlug } from './capture-standalone.js';

  describe('captureStandalone', () => {
    let tempHome: TempHome;

    beforeEach(() => {
      tempHome = setupTempHome();
    });

    afterEach(() => {
      tempHome.restore();
    });

    it('deriveSlug: strips leading separator, joins with dashes', () => {
      expect(deriveSlug('/Users/foo/Projects/my-app')).toBe('Users-foo-Projects-my-app');
      expect(deriveSlug('/tmp/x')).toBe('tmp-x');
    });

    it('writes synthetic transcript at $HOME/.claude/projects/{slug}/{sessionId}.jsonl', async () => {
      const sessionId = '00000000-0000-0000-0000-000000000001';
      const projectPath = path.join(tempHome.tempHome, 'projects', 'demo-app');
      await captureStandalone({
        task: 'demo task',
        output: 'demo output',
        sessionId,
        projectPath,
      });

      const slug = deriveSlug(projectPath);
      const expectedPath = path.join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
      expect(existsSync(expectedPath)).toBe(true);

      const content = readFileSync(expectedPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);

      const userMsg = JSON.parse(lines[0]);
      expect(userMsg.type).toBe('user');
      expect(userMsg.session_id).toBe(sessionId);
      expect(userMsg.content.role).toBe('user');
      expect(userMsg.content.content[0].text).toBe('demo task');

      const assistantMsg = JSON.parse(lines[1]);
      expect(assistantMsg.type).toBe('assistant');
      expect(assistantMsg.session_id).toBe(sessionId);
      expect(assistantMsg.content.role).toBe('assistant');
      expect(assistantMsg.content.content[0].text).toBe('demo output');
    });

    it('does not throw if session-end-capture.sh missing (fail-silent)', async () => {
      // tempHome has no ~/.claude/hooks/ directory — spawn will fail internally; should swallow.
      await expect(
        captureStandalone({
          task: 't',
          output: 'o',
          sessionId: '00000000-0000-0000-0000-000000000002',
          projectPath: path.join(tempHome.tempHome, 'p'),
        }),
      ).resolves.toBeUndefined();
    });
  });
  ```

  Note: we do NOT assert the spawn actually launches a real hook (would require a fake wrapper script). The assertion is the fail-silent behavior — no throw.
  </action>
  <verify>
    <automated>test -f packages/cds-cli/src/capture-standalone.test.ts && pnpm --filter @cds/cli vitest run src/capture-standalone.test.ts --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/capture-standalone.test.ts` -> exits 0
    - `pnpm --filter @cds/cli vitest run src/capture-standalone.test.ts` -> exits 0 + all 3 tests pass
    - `grep -c "describe.*captureStandalone" packages/cds-cli/src/capture-standalone.test.ts` -> 1
    - `grep -c "deriveSlug" packages/cds-cli/src/capture-standalone.test.ts` -> >= 2
  </acceptance_criteria>
  <done>
  3 tests pass: slug derivation, transcript write + shape, fail-silent when hook missing.
  </done>
</task>

<task type="auto">
  <name>Task 6: Create packages/cds-cli/src/quick.integration.test.ts (INTEGRATION=1 gated)</name>
  <read_first>
    - ./packages/cds-cli/src/quick.ts
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-05-06 (integration gate pattern)
    - ./packages/cds-migrate/src/sessions-md-to-sqlite.integration.test.ts (Phase 38 analog — if exists)
  </read_first>
  <files>
    - packages/cds-cli/src/quick.integration.test.ts (new)
  </files>
  <action>
  ```ts
  // packages/cds-cli/src/quick.integration.test.ts
  // Live-Haiku end-to-end test. Gated behind INTEGRATION=1.
  // Writes a real transcript + (if wiring is complete) triggers a real capture.
  // Source: Phase 39 VALIDATION §Task 39-05-06
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';

  const SHOULD_RUN = process.env.INTEGRATION === '1' && process.env.ANTHROPIC_API_KEY;

  describe.skipIf(!SHOULD_RUN)('quick.ts integration (live Haiku)', () => {
    let tempHome: TempHome;

    beforeEach(() => {
      tempHome = setupTempHome();
    });

    afterEach(() => {
      tempHome.restore();
    });

    it('dispatches a real one-shot call, captures cost, writes transcript', async () => {
      // Dynamic import after env is set so real @cds/core resolves (no mocks this time)
      const { main } = await import('./quick.js');

      const originalLog = console.log;
      const originalErr = console.error;
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      console.log = (...args: unknown[]) => stdoutChunks.push(args.map(String).join(' '));
      console.error = (...args: unknown[]) => stderrChunks.push(args.map(String).join(' '));

      try {
        await main(['say hello in exactly 3 words', '--json']);
      } finally {
        console.log = originalLog;
        console.error = originalErr;
      }

      const stdout = stdoutChunks.join('\n');
      const parsed = JSON.parse(stdout);
      expect(parsed.output).toBeTruthy();
      expect(parsed.cost.cost_usd).toBeGreaterThan(0);
      expect(parsed.cost.cost_usd).toBeLessThan(0.01); // Haiku is cheap
      expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

      // Verify the synthetic transcript was written
      const { readFileSync, existsSync } = await import('node:fs');
      const { homedir } = await import('node:os');
      const path = await import('node:path');
      const { deriveSlug } = await import('./capture-standalone.js');

      const slug = deriveSlug(process.cwd());
      const transcriptPath = path.join(homedir(), '.claude', 'projects', slug, `${parsed.sessionId}.jsonl`);
      expect(existsSync(transcriptPath)).toBe(true);

      const content = readFileSync(transcriptPath, 'utf8').trim().split('\n');
      expect(content.length).toBe(2);
      const user = JSON.parse(content[0]);
      expect(user.content.content[0].text).toBe('say hello in exactly 3 words');
    }, 30_000);
  });
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-cli/src/quick.integration.test.ts && pnpm --filter @cds/cli vitest run src/quick.integration.test.ts --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/quick.integration.test.ts` -> exits 0
    - `pnpm --filter @cds/cli vitest run src/quick.integration.test.ts` -> exits 0 (tests auto-skip when INTEGRATION!=1, that counts as pass)
    - `grep -c "INTEGRATION" packages/cds-cli/src/quick.integration.test.ts` -> >= 1
    - `grep -c "describe.skipIf" packages/cds-cli/src/quick.integration.test.ts` -> 1
  </acceptance_criteria>
  <done>
  Integration test auto-skips without INTEGRATION=1. Runs live when invoked manually pre-release.
  </done>
</task>

<task type="auto">
  <name>Task 7: Verify tsup rebuild + full cli test suite passes</name>
  <read_first>
    - All 5 files from Tasks 1-6
    - .planning/phases/39-cds-quick-demo-alpha-release/39-01-bundler-and-distribution-PLAN.md §Task 6 (tsup-build.test.mjs regression)
  </read_first>
  <files>
    - (none — verification task)
  </files>
  <action>
  Full regression sweep:

  1. Run `pnpm --filter @cds/cli exec tsc --noEmit` — assert type-check clean.
  2. Run `pnpm --filter @cds/cli vitest run` — assert ALL cds-cli tests pass (Plan 02's + any Phase 37 mcp-server tests).
  3. Run `pnpm tsup` — rebuild dist/ with the real quick.ts body.
  4. Run `pnpm -w vitest run --project root tests/tsup-build.test.mjs` — assert the Plan 01 integration test STILL passes with the real quick.ts body (not just the stub).
  5. Spot-check `dist/cli/quick.js` for the expected imports:
     - `grep -c "dispatchAgent" dist/cli/quick.js` -> >= 1
     - `grep -c "CostTracker" dist/cli/quick.js` -> >= 1
     - `grep -c "captureStandalone" dist/cli/quick.js` -> >= 1
  6. Run `node bin/cli.mjs quick --help 2>&1 || true` — should produce usage output (exit 1 is OK since no task arg).
  </action>
  <verify>
    <automated>pnpm --filter @cds/cli exec tsc --noEmit && pnpm --filter @cds/cli vitest run --reporter=default && pnpm tsup 2>&1 | tail -3 && grep -q "dispatchAgent" dist/cli/quick.js && grep -q "captureStandalone" dist/cli/quick.js && pnpm -w vitest run --project root tests/tsup-build.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @cds/cli exec tsc --noEmit` -> exits 0
    - `pnpm --filter @cds/cli vitest run` -> exits 0 all tests pass
    - `pnpm tsup` -> exits 0
    - `grep -q "dispatchAgent" dist/cli/quick.js` -> exits 0 (real body bundled)
    - `grep -q "captureStandalone" dist/cli/quick.js` -> exits 0 (helper bundled)
    - `pnpm -w vitest run --project root tests/tsup-build.test.mjs` -> exits 0 (Plan 01 regression still green)
  </acceptance_criteria>
  <done>
  Plan 02 complete: real quick.ts is bundled; all cds-cli tests pass; Plan 01 integration test still green.
  </done>
</task>

</tasks>

<verification>
Before marking this plan complete, executor MUST pass:

```sh
pnpm --filter @cds/cli exec tsc --noEmit
pnpm --filter @cds/cli vitest run
pnpm tsup
pnpm -w vitest run --project root tests/tsup-build.test.mjs     # regression for Plan 01 Task 6
pnpm -w vitest run --project root tests/cli-dispatch.test.mjs   # now validates runtime quick-usage
```

Manual spot-check:
- `node bin/cli.mjs quick` -> stderr has "Usage:"
- `ANTHROPIC_API_KEY=xxx INTEGRATION=1 pnpm --filter @cds/cli vitest run src/quick.integration.test.ts` (optional) -> runs live Haiku
</verification>
