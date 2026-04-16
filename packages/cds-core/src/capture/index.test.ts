import { describe, it, expect } from 'vitest';
import * as capture from './index.js';

describe('@cds/core/capture barrel', () => {
  it('exports loadTranscript function', () => {
    expect(typeof capture.loadTranscript).toBe('function');
  });
  it('exports buildExtractionPrompt function', () => {
    expect(typeof capture.buildExtractionPrompt).toBe('function');
  });
  it('exports emitObservationsTool with name emit_observations', () => {
    expect(capture.emitObservationsTool.name).toBe('emit_observations');
  });
  it('exports SYSTEM_PROMPT string', () => {
    expect(typeof capture.SYSTEM_PROMPT).toBe('string');
    expect(capture.SYSTEM_PROMPT.length).toBeGreaterThan(500);
  });
  it('exports OBSERVATION_TYPES tuple of 6', () => {
    expect(capture.OBSERVATION_TYPES).toHaveLength(6);
  });
  it('exports buildSystemPrompt function', () => {
    expect(typeof capture.buildSystemPrompt).toBe('function');
  });
  it('exports tier-2 truncation constants', () => {
    expect(capture.TIER_2_HEAD).toBe(20);
    expect(capture.TIER_2_TAIL).toBe(30);
    expect(capture.TIER_2_MAX_TOKENS).toBe(40_000);
    expect(capture.TOOL_TRUNCATE_CAP).toBe(200);
  });
  it('does not leak type-only exports at runtime', () => {
    // Type aliases don't exist after TS erasure — barrel should not expose them as values.
    expect((capture as unknown as Record<string, unknown>).ParsedMessage).toBeUndefined();
    expect((capture as unknown as Record<string, unknown>).EmitObservationsInput).toBeUndefined();
  });
});
