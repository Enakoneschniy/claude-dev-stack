// packages/cds-cli/src/quick.test.ts
// Unit tests for /cds-quick CLI body. Mocks @cds/core dispatchAgent.
// Source: Phase 39 VALIDATION §Task 39-02-01..07
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';

// vi.hoisted lifts this above the import statements so the mock factory below
// has access to the spy at module-load time. vi is the only valid identifier
// to reference inside vi.hoisted (it is auto-bound by the hoist transform).
const { mockDispatchFn } = vi.hoisted(() => ({
  mockDispatchFn: vi.fn(async (_opts: { model: string; prompt: string; session_id: string }) => ({
    output: 'mock agent output',
    tokens: { input: 50, output: 25 },
    stop_reason: 'end_turn',
  })),
}));

vi.mock('@cds/core', () => ({
  dispatchAgent: mockDispatchFn,
  resolveModel: (alias: string) => alias,
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
      // Haiku-ish: $0.80/M input, $4.00/M output — approximate
      const cost_usd = tokens.input * 0.0000008 + tokens.output * 0.000004;
      return { cost_usd, tokens };
    }
    dump() {
      return `session ${this.sessionId}: ${JSON.stringify(this.total())}`;
    }
  },
}));

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn(async () => {}) }));
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
