import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estimateCost,
  estimateTokens,
  formatCost,
  formatSize,
} from './token-estimate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE =
  join(__dirname, '..', 'tests', 'fixtures', 'backfill', 'large.md');

describe('token-estimate', () => {
  it('estimateTokens returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimateTokens for pure Latin scales by 4 chars/token', () => {
    // 'hello world' = 11 chars → ceil(11/4) = 3
    expect(estimateTokens('hello world')).toBe(3);
  });

  it('estimateTokens for pure Cyrillic scales by 2.5 chars/token', () => {
    // 'привет мир' = 10 total chars: 9 Cyrillic + 1 Latin space.
    // 9/2.5 + 1/4 = 3.6 + 0.25 = 3.85 → ceil = 4
    expect(estimateTokens('привет мир')).toBe(4);
  });

  it('estimateTokens for mixed-language scales weighted correctly', () => {
    // 'Привет world' = 12 chars: 6 Cyrillic + 6 Latin (incl. space).
    // 6/2.5 + 6/4 = 2.4 + 1.5 = 3.9 → ceil = 4
    expect(estimateTokens('Привет world')).toBe(4);
  });

  it('estimateTokens for large fixture stays within reasonable bounds', () => {
    const large = readFileSync(FIXTURE, 'utf8');
    const estimated = estimateTokens(large);
    expect(estimated).toBeGreaterThan(500);
    expect(estimated).toBeLessThan(3000);
  });

  it('estimateCost is monotonically increasing in inputTokens', () => {
    expect(estimateCost(1000)).toBeGreaterThan(estimateCost(500));
  });

  it('estimateCost for 1000 input tokens is approximately $0.002', () => {
    // 1000 * 0.000001 + 200 * 0.000005 = 0.001 + 0.001 = 0.002
    const cost = estimateCost(1000);
    expect(cost).toBeGreaterThanOrEqual(0.002);
    expect(cost).toBeLessThanOrEqual(0.003);
  });

  it('formatCost rounds UP to 3 decimals', () => {
    expect(formatCost(0.01234)).toBe('$0.013');
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(0.5)).toBe('$0.500');
  });

  it('formatSize returns B for <1024, KB otherwise', () => {
    expect(formatSize(100)).toBe('100 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(2900)).toBe('2.8 KB');
  });
});
