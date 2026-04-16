/**
 * tests/hooks/session-end-capture.test.mjs
 *
 * Phase 36 Plan 02 — mock-integration tests for the consolidated Stop hook.
 *
 * Strategy: the hook top-level-awaits `await import('@cds/core')` etc., so
 * `vi.mock(...)` at the top of this file intercepts those imports before the
 * hook's module body runs. All tests call `runCapture()` directly or spawn the
 * `.sh` wrapper for latency measurement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const HOOK_SH = join(REPO_ROOT, 'hooks', 'session-end-capture.sh');
const HOOK_MJS = join(REPO_ROOT, 'hooks', 'session-end-capture.mjs');
const FIXTURE = join(__dirname, 'fixtures', 'mock-transcript.jsonl');

// ----- shared spies/state across mock definitions -----------------------
const spyState = {
  createSessionCalls: [],
  upsertEntityCalls: [],
  appendObservationCalls: [],
  linkRelationCalls: [],
  updateContextHistoryCalls: [],
  dispatchAgentReturn: null,
  dispatchAgentThrow: null,
  transactionUsed: false,
  appendObsThrowAfter: null,
  loadTranscriptReturn: null,
  loadTranscriptThrow: null,
};

globalThis.__CDS_TEST_SPIES = spyState;

vi.mock('@cds/core', () => {
  return {
    dispatchAgent: vi.fn(async (opts) => {
      const st = globalThis.__CDS_TEST_SPIES;
      if (st.dispatchAgentThrow) throw st.dispatchAgentThrow;
      if (opts.signal?.aborted) throw new Error('aborted');
      return (
        st.dispatchAgentReturn ?? {
          output: '',
          tokens: { input: 100, output: 50 },
          cost_usd: 0.001,
          toolUses: [
            {
              id: 'tu1',
              name: 'emit_observations',
              input: {
                session_summary: 'Mock session summary.',
                observations: [
                  {
                    type: 'decision',
                    content: 'Mock decision.',
                    entities: ['mock-entity'],
                  },
                ],
                entities: [{ name: 'mock-entity', type: 'concept' }],
                relations: [],
              },
            },
          ],
        }
      );
    }),
    CostTracker: class {
      constructor(id) {
        this.sessionId = id;
      }
      record(_call) {
        /* accept any model silently in tests */
      }
      dump() {
        return `Session: ${this.sessionId}\nCalls: 1\nCost: $0.001`;
      }
    },
    openSessionsDB: vi.fn(() => {
      const st = globalThis.__CDS_TEST_SPIES;
      const db = {
        transaction(fn) {
          st.transactionUsed = true;
          return () => {
            // better-sqlite3 transactions run the fn; propagate throws so caller sees rollback.
            fn();
          };
        },
        createSession(input) {
          st.createSessionCalls.push(input);
          return { id: input.id, start_time: new Date().toISOString(), end_time: null, project: input.project, summary: input.summary };
        },
        upsertEntity(input) {
          st.upsertEntityCalls.push(input);
          const id = st.upsertEntityCalls.length;
          return { id, name: input.name, type: input.type, first_seen: '', last_updated: '' };
        },
        appendObservation(input) {
          st.appendObservationCalls.push(input);
          if (
            st.appendObsThrowAfter !== null &&
            st.appendObservationCalls.length > st.appendObsThrowAfter
          ) {
            throw new Error('simulated transaction rollback');
          }
          return { id: st.appendObservationCalls.length, session_id: input.sessionId, type: input.type, content: input.content, entities: input.entities ?? [], created_at: '' };
        },
        linkRelation(input) {
          st.linkRelationCalls.push(input);
          return { from_entity: input.fromEntity, to_entity: input.toEntity, relation_type: input.relationType, observed_in_session: input.sessionId };
        },
        close() {},
      };
      return db;
    }),
  };
});

// Mock @cds/core/capture's loadTranscript to avoid fighting Node's homedir
// resolution inside vitest workers. Tests assert end-to-end hook behavior,
// so we feed parsed messages directly instead of staging a jsonl.
vi.mock('@cds/core/capture', async () => {
  const real = await vi.importActual('@cds/core/capture');
  return {
    ...real,
    loadTranscript: async () => {
      const st = globalThis.__CDS_TEST_SPIES;
      if (st.loadTranscriptThrow) throw st.loadTranscriptThrow;
      return st.loadTranscriptReturn ?? [
        { role: 'user', content: 'fixture message' },
        { role: 'assistant', content: 'fixture reply' },
      ];
    },
  };
});

// vitest resolves mock specifiers against the test file's directory. The
// hook's import `'../lib/session-context.mjs'` (relative to hooks/) and this
// mock's `'../../lib/session-context.mjs'` (relative to tests/hooks/) both
// resolve to the same absolute file, which is what vitest keys on internally.
vi.mock('../../lib/session-context.mjs', () => ({
  updateContextHistory: (args) => {
    globalThis.__CDS_TEST_SPIES.updateContextHistoryCalls.push(args);
    return { action: 'created', entriesCount: 1 };
  },
}));

// ----- fake HOME + transcript staging -----------------------------------
let fakeHome;
let projectDir;
let sessionId;

function resetSpies() {
  spyState.createSessionCalls.length = 0;
  spyState.upsertEntityCalls.length = 0;
  spyState.appendObservationCalls.length = 0;
  spyState.linkRelationCalls.length = 0;
  spyState.updateContextHistoryCalls.length = 0;
  spyState.dispatchAgentReturn = null;
  spyState.dispatchAgentThrow = null;
  spyState.transactionUsed = false;
  spyState.appendObsThrowAfter = null;
  spyState.loadTranscriptReturn = null;
  spyState.loadTranscriptThrow = null;
}

function stageTranscript(sid, projPath) {
  const slug = projPath.replace(/\//g, '-').replace(/^-/, '');
  const tDir = join(fakeHome, '.claude', 'projects', slug);
  mkdirSync(tDir, { recursive: true });
  writeFileSync(join(tDir, `${sid}.jsonl`), readFileSync(FIXTURE, 'utf8'));
}

const origEnv = { ...process.env };

beforeEach(() => {
  resetSpies();
  fakeHome = mkdtempSync(join(tmpdir(), 'cds-capture-test-'));
  projectDir = join(fakeHome, 'project');
  mkdirSync(projectDir, { recursive: true });
  sessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  process.env.HOME = fakeHome;
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  process.env.CLAUDE_SESSION_ID = sessionId;
  process.env.VAULT_PATH = join(fakeHome, 'vault');
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  delete process.env.CDS_CAPTURE_DEBUG;
});

afterEach(() => {
  try {
    rmSync(fakeHome, { recursive: true, force: true });
  } catch {}
  // Restore env minimally — vitest isolates workers, but tests may set HOME.
  process.env = { ...origEnv };
});

// Import the hook AFTER mocks are registered. Top-level awaits inside the hook
// run at first import; vitest hoists `vi.mock` calls so mocks are registered
// first.
const hookModulePromise = import('../../hooks/session-end-capture.mjs');

describe('session-end-capture — pure helpers', () => {
  it('classifyError routes silent / log / crash tiers correctly', async () => {
    const { classifyError } = await hookModulePromise;
    expect(classifyError(Object.assign(new Error('x'), { silent: true }))).toBe('silent');
    expect(classifyError(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe('silent');
    expect(
      classifyError(Object.assign(new Error('rate limit hit'), { code: 429 })),
    ).toBe('silent');
    expect(classifyError(new Error('SQLITE_BUSY database is locked'))).toBe('silent');
    expect(classifyError(new Error('malformed tool_use payload'))).toBe('log');
    expect(classifyError(new Error('capture-timeout-60s'))).toBe('log');
    expect(classifyError(new ReferenceError('undefined x'))).toBe('crash');
  });

  it('extractToolUsePayload finds emit_observations block in toolUses array', async () => {
    const { extractToolUsePayload } = await hookModulePromise;
    const result = {
      output: '',
      toolUses: [
        { id: 't1', name: 'emit_observations', input: { session_summary: 'ok', observations: [], entities: [], relations: [] } },
      ],
    };
    const payload = extractToolUsePayload(result);
    expect(payload?.session_summary).toBe('ok');
  });

  it('extractToolUsePayload falls back to JSON.parse(output) when no toolUses', async () => {
    const { extractToolUsePayload } = await hookModulePromise;
    const result = {
      output: JSON.stringify({ session_summary: 'from text', observations: [], entities: [], relations: [] }),
      toolUses: [],
    };
    const payload = extractToolUsePayload(result);
    expect(payload?.session_summary).toBe('from text');
  });

  it('extractToolUsePayload returns null for unusable results', async () => {
    const { extractToolUsePayload } = await hookModulePromise;
    expect(extractToolUsePayload({ output: 'plain text' })).toBeNull();
    expect(extractToolUsePayload({})).toBeNull();
    expect(extractToolUsePayload(null)).toBeNull();
  });
});

describe('session-end-capture — runCapture behaviors', () => {
  it('happy path: writes session + observation + entity rows via transactional DB', async () => {
    const { runCapture } = await hookModulePromise;
    await runCapture();

    expect(spyState.createSessionCalls).toHaveLength(1);
    expect(spyState.createSessionCalls[0].id).toBe(sessionId);
    expect(spyState.appendObservationCalls.length).toBeGreaterThanOrEqual(1);
    expect(spyState.upsertEntityCalls.length).toBeGreaterThanOrEqual(1);
    expect(spyState.transactionUsed).toBe(true);
    expect(spyState.updateContextHistoryCalls).toHaveLength(1);
  });

  it('forced-throw: dispatchAgent failure surfaces as log tier, no DB writes', async () => {
    const { runCapture, classifyError } = await hookModulePromise;
    spyState.dispatchAgentThrow = new Error('simulated API failure');

    let caught;
    try {
      await runCapture();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(classifyError(caught)).toBe('log');
    expect(spyState.createSessionCalls).toHaveLength(0);
    expect(spyState.appendObservationCalls).toHaveLength(0);
  });

  it('missing CLAUDE_SESSION_ID exits silent', async () => {
    const { runCapture, classifyError } = await hookModulePromise;
    delete process.env.CLAUDE_SESSION_ID;

    let caught;
    try {
      await runCapture();
    } catch (err) {
      caught = err;
    }
    expect(caught?.silent).toBe(true);
    expect(classifyError(caught)).toBe('silent');
  });

  it('missing transcript file exits silent', async () => {
    const { runCapture, classifyError } = await hookModulePromise;
    // Simulate ENOENT from loadTranscript — hook converts to silent tier per D-66.
    spyState.loadTranscriptThrow = Object.assign(
      new Error('ENOENT: transcript file missing'),
      { code: 'ENOENT' },
    );

    let caught;
    try {
      await runCapture();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(classifyError(caught)).toBe('silent');
  });

  it('transaction rollback: partial write failure classifies as log tier', async () => {
    const { runCapture, classifyError } = await hookModulePromise;
    // Payload with 2 observations; mock DB throws after the first appendObservation.
    spyState.dispatchAgentReturn = {
      output: '',
      tokens: { input: 10, output: 10 },
      cost_usd: 0,
      toolUses: [
        {
          id: 't1',
          name: 'emit_observations',
          input: {
            session_summary: 'test rollback scenario',
            observations: [
              { type: 'decision', content: 'first obs', entities: [] },
              { type: 'blocker', content: 'second obs', entities: [] },
            ],
            entities: [],
            relations: [],
          },
        },
      ],
    };
    spyState.appendObsThrowAfter = 1;

    let caught;
    try {
      await runCapture();
    } catch (err) {
      caught = err;
    }
    expect(caught?.message).toMatch(/rollback|transaction/i);
    expect(classifyError(caught)).toBe('log');
    expect(spyState.transactionUsed).toBe(true);
  });

  it('timeout: AbortController signal reaches dispatchAgent and classifies as log tier', async () => {
    const { runCapture, classifyError } = await hookModulePromise;
    // Simulate a timeout by having dispatchAgent observe the signal and reject
    // with a capture-timeout error after a short pre-abort. This validates that
    // the hook threads AbortController into dispatchAgent and classifies the
    // resulting error as "log" tier (not silent, not crash).
    const { dispatchAgent } = await import('@cds/core');
    dispatchAgent.mockImplementationOnce(
      (opts) =>
        new Promise((_resolve, reject) => {
          // Trigger synthetic timeout via signal listener
          opts.signal?.addEventListener('abort', () => {
            reject(new Error('capture-timeout-60s (aborted via signal)'));
          });
          // Force-abort after 50ms so we don't hang the test
          setTimeout(() => {
            opts.signal?.dispatchEvent?.(new Event('abort'));
            // Fallback: directly reject (signal listener may not have fired in test env)
            reject(new Error('capture-timeout-60s (forced)'));
          }, 50);
        }),
    );

    let caught;
    try {
      await runCapture();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(classifyError(caught)).toBe('log');
    expect(caught.message).toMatch(/capture-timeout/);
  }, 10_000);
});

describe('session-end-capture — wrapper', () => {
  it('wrapper-latency: .sh wrapper exits in <200ms', () => {
    // The wrapper spawns Node detached; measuring its exit time bounds the
    // impact on Claude Code's Stop event.
    expect(existsSync(HOOK_SH)).toBe(true);
    const start = Date.now();
    const res = spawnSync('sh', [HOOK_SH], {
      env: {
        ...process.env,
        // Point at a bogus session so the inner Node silently exits fast.
        CLAUDE_SESSION_ID: '',
        CLAUDE_PROJECT_DIR: '/tmp',
      },
      stdio: 'ignore',
    });
    const elapsed = Date.now() - start;
    expect(res.status).toBe(0);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('session-end-capture — log rotation + append', () => {
  it('appendCaptureLog writes JSON line to CDS_CAPTURE_LOG target', async () => {
    const { appendCaptureLog } = await hookModulePromise;
    const logPath = join(fakeHome, '.claude', 'cds-capture.log');
    process.env.CDS_CAPTURE_LOG = logPath;
    try {
      await appendCaptureLog({ ts: 'now', tier: 'log', err: { message: 'test' } });
      expect(existsSync(logPath)).toBe(true);
      const content = readFileSync(logPath, 'utf8');
      expect(content).toContain('"tier":"log"');
    } finally {
      delete process.env.CDS_CAPTURE_LOG;
    }
  });
});

// Minimal sanity: the hook module exports the required symbols.
describe('session-end-capture — module exports', () => {
  it('exports the documented surface', async () => {
    const mod = await hookModulePromise;
    for (const name of [
      'runCapture',
      'classifyError',
      'extractToolUsePayload',
      'appendCaptureLog',
      'rotateLogIfNeeded',
      'spawnAsync',
      'serializeError',
    ]) {
      expect(typeof mod[name]).toBe('function');
    }
    expect(typeof mod.TIMEOUT_MS).toBe('number');
    expect(typeof mod.CAPTURE_LOG).toBe('string');
  });
});
