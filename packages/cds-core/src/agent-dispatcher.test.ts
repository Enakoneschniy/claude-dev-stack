/**
 * agent-dispatcher.test.ts
 *
 * Default suite: mock-based — runs on `pnpm test` WITHOUT ANTHROPIC_API_KEY (D-32).
 * Integration suite: gated behind INTEGRATION=1 env — runs on `INTEGRATION=1 pnpm --filter @cds/core vitest run`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SDK BEFORE importing dispatchAgent (so the import resolves to the mock).
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { dispatchAgent } from './agent-dispatcher.js';
import { LicenseKeyError, DispatchError } from './errors.js';

const API_KEY_BACKUP: string | undefined = process.env.ANTHROPIC_API_KEY;

describe('dispatchAgent (mocked SDK)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test-mock';
  });
  afterEach(() => {
    // Restore to pre-suite state
    if (API_KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = API_KEY_BACKUP;
  });

  it('aggregates assistant text across multiple messages and reports tokens + cost', async () => {
    const mockIter = (async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello ' }] } };
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] } };
      yield {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 5, output_tokens: 3 },
        total_cost_usd: 0.00001,
      };
    })();
    (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

    const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });

    expect(result.output).toBe('Hello world');
    expect(result.tokens).toEqual({ input: 5, output: 3 });
    expect(result.cost_usd).toBe(0.00001);
  });

  it('throws LicenseKeyError when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(LicenseKeyError);
    await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws DispatchError on non-success result subtype (error_max_turns)', async () => {
    // Use mockImplementation to produce a FRESH iterator per call — async
    // generators are single-use, so the two `await expect(...).rejects` calls
    // below would exhaust the same iterator if we used mockReturnValue.
    (query as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(
      () =>
        (async function* () {
          yield {
            type: 'result',
            subtype: 'error_max_turns',
            usage: { input_tokens: 10, output_tokens: 0 },
            total_cost_usd: 0.00001,
          };
        })(),
    );

    await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(DispatchError);
    await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/error_max_turns/);
  });

  it('resolves model aliases haiku/sonnet/opus via models.ts before calling SDK', async () => {
    const mockIter = (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 1, output_tokens: 1 },
        total_cost_usd: 0,
      };
    })();
    (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

    await dispatchAgent({ model: 'haiku', prompt: 'hi' });

    const call = (query as unknown as { mock: { calls: Array<[{ options?: { model?: string } }]> } }).mock.calls[0];
    expect(call[0].options?.model).toBe('claude-haiku-4-5');
  });

  it('passes full model IDs through unchanged', async () => {
    const mockIter = (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 1, output_tokens: 1 },
        total_cost_usd: 0,
      };
    })();
    (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

    await dispatchAgent({ model: 'claude-haiku-4-5-20260301', prompt: 'hi' });

    const call = (query as unknown as { mock: { calls: Array<[{ options?: { model?: string } }]> } }).mock.calls[0];
    expect(call[0].options?.model).toBe('claude-haiku-4-5-20260301');
  });

  it('bridges AbortSignal to SDK AbortController (pre-aborted signal propagates immediately)', async () => {
    let capturedController: AbortController | undefined;
    (query as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
      (args: unknown) => {
        const a = args as { options?: { abortController?: AbortController } };
        capturedController = a.options?.abortController;
        return (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            usage: { input_tokens: 1, output_tokens: 1 },
            total_cost_usd: 0,
          };
        })();
      },
    );

    const ctrl = new AbortController();
    ctrl.abort('pre-abort');

    await dispatchAgent({ model: 'haiku', prompt: 'hi', signal: ctrl.signal });

    expect(capturedController).toBeInstanceOf(AbortController);
    expect(capturedController?.signal.aborted).toBe(true);
  });

  it('passes through system prompt as preset-append per SDK shape', async () => {
    let capturedSystem: unknown;
    (query as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
      (args: unknown) => {
        const a = args as { options?: { systemPrompt?: unknown } };
        capturedSystem = a.options?.systemPrompt;
        return (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            usage: { input_tokens: 1, output_tokens: 1 },
            total_cost_usd: 0,
          };
        })();
      },
    );

    await dispatchAgent({ model: 'haiku', prompt: 'hi', system: 'Be terse.' });

    expect(capturedSystem).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Be terse.',
    });
  });

  it('does NOT short-circuit the iterator with break (Pitfall 2)', async () => {
    // This is tested indirectly: if dispatchAgent used `break`, later assistant
    // messages would be lost. Assert that text from the LAST assistant message
    // (emitted just before the result event) is included in output.
    const mockIter = (async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'first ' }] } };
      yield { type: 'tool_use', ref: 'irrelevant' };  // noise
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'middle ' }] } };
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'last' }] } };
      yield {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 3, output_tokens: 3 },
        total_cost_usd: 0,
      };
    })();
    (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

    const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });

    expect(result.output).toBe('first middle last');
  });
});

describe.skipIf(!process.env.INTEGRATION)('dispatchAgent (live SDK)', () => {
  it('returns non-zero input and output tokens for Haiku hello-world (SDK-02 SC#2)', async () => {
    // This test requires ANTHROPIC_API_KEY to be set in the environment and network
    // access to api.anthropic.com. It is skipped unless INTEGRATION=1.
    const result = await dispatchAgent({
      model: 'haiku',
      prompt: 'Reply with exactly the word: pong',
    });
    expect(result.tokens.input).toBeGreaterThan(0);
    expect(result.tokens.output).toBeGreaterThan(0);
    expect(result.output.toLowerCase()).toContain('pong');
    expect(result.cost_usd).toBeGreaterThan(0);
  }, 30_000);
});
