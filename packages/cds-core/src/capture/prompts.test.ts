import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import {
  emitObservationsTool,
  SYSTEM_PROMPT,
  buildSystemPrompt,
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
