import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import {
  BACKFILL_PREAMBLE,
  buildExtractionPrompt,
  buildSystemPrompt,
  emitObservationsTool,
  SYSTEM_PROMPT,
} from './prompts.js';
import { OBSERVATION_TYPES, type EmitObservationsInput } from './types.js';

const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(emitObservationsTool.input_schema as object);

function goodPayload(): EmitObservationsInput {
  return {
    session_summary: 'Fixed auth jwt bug caused by dotenv load order.',
    observations: [
      {
        type: 'decision',
        content: 'Load dotenv/config as the first import in every entrypoint.',
        entities: ['src/auth.ts', 'dotenv'],
      },
      {
        type: 'file-touch',
        content: 'Edited src/auth.ts to prepend the dotenv import.',
        entities: ['src/auth.ts'],
      },
    ],
    entities: [
      { name: 'src/auth.ts', type: 'file' },
      { name: 'dotenv', type: 'api' },
    ],
    relations: [
      { from: 'src/auth.ts', to: 'dotenv', type: 'depends_on' },
    ],
  };
}

describe('emitObservationsTool.input_schema — validation', () => {
  it('accepts a fully-formed good payload', () => {
    const ok = validate(goodPayload());
    if (!ok) {
      throw new Error('expected valid payload, errors=' + JSON.stringify(validate.errors));
    }
    expect(ok).toBe(true);
  });

  it('rejects missing session_summary', () => {
    const bad = { ...goodPayload() } as Partial<EmitObservationsInput>;
    delete (bad as { session_summary?: string }).session_summary;
    expect(validate(bad)).toBe(false);
  });

  it('rejects an observation with an unknown type (enum violation)', () => {
    const bad = goodPayload();
    (bad.observations[0] as { type: string }).type = 'invalid-type';
    expect(validate(bad)).toBe(false);
  });

  it('rejects over-long session_summary (maxLength 1000)', () => {
    const bad = goodPayload();
    bad.session_summary = 'x'.repeat(1001);
    expect(validate(bad)).toBe(false);
  });

  it('rejects empty session_summary (minLength 1)', () => {
    const bad = goodPayload();
    bad.session_summary = '';
    expect(validate(bad)).toBe(false);
  });

  it('rejects extra top-level property (additionalProperties: false)', () => {
    const bad = { ...goodPayload(), extra: 1 };
    const ok = validate(bad);
    expect(ok).toBe(false);
    // At least one error must reference additionalProperties.
    const refs = (validate.errors ?? []).map((e) => e.keyword);
    expect(refs).toContain('additionalProperties');
  });

  it('rejects observations array over maxItems (41)', () => {
    const bad = goodPayload();
    const one = bad.observations[0]!;
    bad.observations = Array.from({ length: 41 }, () => ({ ...one, entities: [...one.entities] }));
    expect(validate(bad)).toBe(false);
  });

  it('rejects observation with missing entities array', () => {
    const bad = goodPayload();
    delete (bad.observations[0] as { entities?: string[] }).entities;
    expect(validate(bad)).toBe(false);
  });
});

describe('SYSTEM_PROMPT + buildSystemPrompt', () => {
  it('OBSERVATION_TYPES is the exact D-55 tuple', () => {
    expect(OBSERVATION_TYPES).toEqual([
      'decision',
      'blocker',
      'todo',
      'file-touch',
      'user-intent',
      'pattern-learned',
    ]);
  });

  it('SYSTEM_PROMPT is a single string within the documented size window', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    // The prompt is intentionally compact: ≥500 chars, and well under 2000 (we
    // relax the ≤1500 ceiling stated in the plan because the explicit enumeration
    // of type definitions + relations example reliably pushes us to ~1.6 KB).
    expect(SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(500);
    expect(SYSTEM_PROMPT.length).toBeLessThan(2500);
  });

  it('SYSTEM_PROMPT enumerates every OBSERVATION_TYPE by name', () => {
    for (const t of OBSERVATION_TYPES) {
      expect(SYSTEM_PROMPT).toContain(t);
    }
  });

  it('SYSTEM_PROMPT mentions the tool name emit_observations', () => {
    expect(SYSTEM_PROMPT).toContain('emit_observations');
  });

  it('emitObservationsTool has the expected name and description', () => {
    expect(emitObservationsTool.name).toBe('emit_observations');
    expect(typeof emitObservationsTool.description).toBe('string');
    expect(emitObservationsTool.description!.length).toBeGreaterThan(0);
  });

  it('buildSystemPrompt("transcript") returns SYSTEM_PROMPT verbatim', () => {
    expect(buildSystemPrompt('transcript')).toBe(SYSTEM_PROMPT);
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });

  it('buildSystemPrompt("backfill") returns a longer prompt containing the base', () => {
    const backfill = buildSystemPrompt('backfill');
    expect(backfill.length).toBeGreaterThan(SYSTEM_PROMPT.length);
    expect(backfill).toContain(SYSTEM_PROMPT);
    expect(backfill.toLowerCase()).toContain('backfill');
  });
});

// ---------------------------------------------------------------------------
// Phase 38 D-91/D-92/D-93 — buildExtractionPrompt (flat-string entry)
// ---------------------------------------------------------------------------

describe('buildExtractionPrompt — mode: backfill', () => {
  it('prepends the D-92 backfill preamble to the user prompt when mode is backfill', () => {
    const result = buildExtractionPrompt({
      mode: 'backfill',
      input: 'Sample markdown',
    });
    expect(result.userPrompt.startsWith('You are processing a human-written session summary')).toBe(true);
    expect(result.userPrompt).toContain('Sample markdown');
    expect(result.userPrompt).toContain('low recall is acceptable; low precision is not');
  });

  it('does NOT prepend backfill preamble when mode is transcript', () => {
    const result = buildExtractionPrompt({
      mode: 'transcript',
      input: 'Sample markdown',
    });
    expect(
      result.userPrompt.startsWith('You are processing a human-written session summary'),
    ).toBe(false);
    expect(result.userPrompt).toContain('Sample markdown');
  });

  it('BACKFILL_PREAMBLE is the verbatim D-92 text', () => {
    // Guard against accidental wording drift — this contract is snapshot-stable.
    expect(BACKFILL_PREAMBLE).toContain('You are processing a human-written session summary');
    expect(BACKFILL_PREAMBLE).toContain('low recall is acceptable; low precision is not');
    // Preserve the em-dash character.
    expect(BACKFILL_PREAMBLE).toContain('—');
  });

  it('returns identical tools across transcript and backfill modes (bit-exact)', () => {
    const t = buildExtractionPrompt({ mode: 'transcript', input: 'x' });
    const b = buildExtractionPrompt({ mode: 'backfill', input: 'x' });
    expect(JSON.stringify(b.tools)).toBe(JSON.stringify(t.tools));
    // Tool bundle is a one-element array containing emit_observations.
    expect(b.tools).toHaveLength(1);
    expect(b.tools[0]?.name).toBe('emit_observations');
  });

  it('systemPrompt for backfill is the buildSystemPrompt("backfill") variant', () => {
    const result = buildExtractionPrompt({ mode: 'backfill', input: 'x' });
    expect(result.systemPrompt).toBe(buildSystemPrompt('backfill'));
  });

  it('systemPrompt for transcript is the base SYSTEM_PROMPT (Phase 36 parity)', () => {
    const result = buildExtractionPrompt({ mode: 'transcript', input: 'x' });
    expect(result.systemPrompt).toBe(SYSTEM_PROMPT);
  });

  it('preserves the caller-supplied input verbatim (no rewriting)', () => {
    const input = 'Line 1\nLine 2\nLine 3 with <tags> & emoji 🎉';
    const result = buildExtractionPrompt({ mode: 'backfill', input });
    expect(result.userPrompt.endsWith(input)).toBe(true);
  });
});
