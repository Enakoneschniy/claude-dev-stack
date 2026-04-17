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
  responses?: Record<string, MockResponse>;
  default?: MockResponse;
  throwOn?: string;
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
