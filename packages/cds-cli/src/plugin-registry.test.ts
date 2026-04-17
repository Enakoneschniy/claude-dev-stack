import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PluginHookContext } from '@cds/plugin-sdk';
import { isVersionCompatible, readPluginConfig, invokeSessionEndPlugins } from './plugin-registry.js';

// Shared test context
const testContext: PluginHookContext = {
  projectName: 'test-project',
  sessionId: 'test-session-123',
  sessionDurationSec: 120,
  observationCount: 5,
  vaultPath: '/tmp/test-vault/sessions.db',
  timestamp: '2026-04-17T12:00:00.000Z',
};

describe('isVersionCompatible', () => {
  it('returns true when versions are equal', () => {
    expect(isVersionCompatible('0.1.0', '0.1.0')).toBe(true);
  });

  it('returns true when installed is newer minor', () => {
    expect(isVersionCompatible('0.1.0', '0.2.0')).toBe(true);
  });

  it('returns true when installed is newer patch', () => {
    expect(isVersionCompatible('0.1.0', '0.1.1')).toBe(true);
  });

  it('returns false when installed is older', () => {
    expect(isVersionCompatible('0.2.0', '0.1.0')).toBe(false);
  });

  it('returns false when major version differs (installed lower)', () => {
    expect(isVersionCompatible('1.0.0', '0.9.0')).toBe(false);
  });

  it('returns true when major version differs (installed higher)', () => {
    expect(isVersionCompatible('0.1.0', '1.0.0')).toBe(true);
  });
});

describe('readPluginConfig', () => {
  const originalEnv = process.env.CDS_PLUGINS_CONFIG;

  beforeEach(() => {
    process.env.CDS_PLUGINS_CONFIG = '/tmp/nonexistent-plugins.json';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CDS_PLUGINS_CONFIG;
    } else {
      process.env.CDS_PLUGINS_CONFIG = originalEnv;
    }
  });

  it('returns empty array when plugins.json does not exist', () => {
    const result = readPluginConfig();
    expect(result).toEqual([]);
  });
});

describe('invokeSessionEndPlugins', () => {
  const originalEnv = process.env.CDS_PLUGINS_CONFIG;

  beforeEach(() => {
    process.env.CDS_PLUGINS_CONFIG = '/tmp/nonexistent-plugins.json';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CDS_PLUGINS_CONFIG;
    } else {
      process.env.CDS_PLUGINS_CONFIG = originalEnv;
    }
  });

  it('returns empty results when no plugins configured', async () => {
    const results = await invokeSessionEndPlugins(testContext);
    expect(results.total).toBe(0);
    expect(results.succeeded).toBe(0);
    expect(results.failed).toBe(0);
    expect(results.skipped).toBe(0);
    expect(results.results).toEqual([]);
  });

  it('returns correct result structure', async () => {
    const results = await invokeSessionEndPlugins(testContext);
    expect(results).toHaveProperty('total');
    expect(results).toHaveProperty('succeeded');
    expect(results).toHaveProperty('failed');
    expect(results).toHaveProperty('skipped');
    expect(results).toHaveProperty('results');
    expect(Array.isArray(results.results)).toBe(true);
  });
});
