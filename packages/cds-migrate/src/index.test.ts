import { describe, it, expect } from 'vitest';

import {
  estimateCost,
  estimateTokens,
  formatCost,
  formatSize,
  hashFile,
  hashString,
  migrateMarkdownSessions,
} from './index.js';

describe('@cds/migrate public surface', () => {
  it('exports migrateMarkdownSessions as an async function', () => {
    expect(typeof migrateMarkdownSessions).toBe('function');
    expect(migrateMarkdownSessions.constructor.name).toBe('AsyncFunction');
  });

  it('exports hashFile and hashString utilities', () => {
    expect(typeof hashFile).toBe('function');
    expect(typeof hashString).toBe('function');
  });

  it('exports estimateTokens / estimateCost / formatCost / formatSize', () => {
    expect(typeof estimateTokens).toBe('function');
    expect(typeof estimateCost).toBe('function');
    expect(typeof formatCost).toBe('function');
    expect(typeof formatSize).toBe('function');
  });
});
