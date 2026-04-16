// Phase 38 Plan 02 Task 38-02-00 — deterministic mock for @cds/core dispatchAgent.
//
// The real dispatchAgent returns:
//   { output: string, tokens: { input, output }, cost_usd: number, toolUses: ToolUseBlock[] }
// where a Haiku extraction invocation of emit_observations populates
// `toolUses[0].input` with the structured payload. The migrator reads
// toolUses[0].input (not output) for structured fields — see
// src/sessions-md-to-sqlite.ts.

import { createHash } from 'node:crypto';

export interface MockObservation {
  type: 'decision' | 'blocker' | 'todo' | 'file-touch' | 'user-intent' | 'pattern-learned';
  content: string;
  entities: string[];
}

export interface MockEntity {
  name: string;
  type: string;
}

export interface MockResponse {
  session_summary?: string;
  observations: MockObservation[];
  entities: MockEntity[];
  relations?: Array<{ from: string; to: string; type: string }>;
  tokens?: { input: number; output: number };
  cost_usd?: number;
}

export type DispatchFn = (opts: {
  model: string;
  system?: string;
  prompt: string;
  tools?: unknown[];
  signal?: AbortSignal;
  session_id?: string;
}) => Promise<{
  output: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
}>;

/**
 * Build a deterministic mock dispatchAgent keyed by sha256(prompt). Fixtures
 * not present fall back to a synthetic single-observation response so tests
 * without explicit fixture maps still get a well-formed tool_use payload.
 */
export function createMockDispatchAgent(
  fixtures: Record<string, MockResponse> = {},
): DispatchFn {
  return async function mockDispatchAgent(opts) {
    const key = createHash('sha256').update(opts.prompt).digest('hex');
    const fixture = fixtures[key];
    if (fixture) {
      return buildResult(fixture);
    }
    // Fallback deterministic synthetic fixture keyed by first 8 hex chars.
    return buildResult({
      session_summary: 'mock session summary ' + key.slice(0, 8),
      observations: [
        {
          type: 'decision',
          content: 'synthetic-decision-' + key.slice(0, 8),
          entities: ['Synthetic'],
        },
      ],
      entities: [{ name: 'Synthetic', type: 'tool' }],
      relations: [],
      tokens: { input: 100, output: 30 },
      cost_usd: 0.00025,
    });
  };
}

/** Mock that always throws — forces the error branch in the migrator. */
export function createThrowingMockDispatchAgent(
  error: Error = new Error('mock dispatch failure'),
): DispatchFn {
  return async function throwingMockDispatchAgent() {
    throw error;
  };
}

/** Counter-wrapped mock — exposes `.callCount()` for assertion. */
export function createCountingMockDispatchAgent(): DispatchFn & { callCount: () => number } {
  let count = 0;
  const fn: DispatchFn = async () => {
    count++;
    return buildResult({
      session_summary: 'counting mock',
      observations: [{ type: 'user-intent', content: 'call-' + count, entities: [] }],
      entities: [],
      relations: [],
      tokens: { input: 50, output: 20 },
      cost_usd: 0.00015,
    });
  };
  (fn as DispatchFn & { callCount: () => number }).callCount = () => count;
  return fn as DispatchFn & { callCount: () => number };
}

function buildResult(fixture: MockResponse) {
  const toolInput = {
    session_summary: fixture.session_summary ?? 'mock summary',
    observations: fixture.observations,
    entities: fixture.entities,
    relations: fixture.relations ?? [],
  };
  return {
    output: '',
    tokens: fixture.tokens ?? { input: 100, output: 30 },
    cost_usd: fixture.cost_usd ?? 0.00025,
    toolUses: [
      {
        id: 'mock-tool-use-1',
        name: 'emit_observations',
        input: toolInput,
      },
    ],
  };
}
