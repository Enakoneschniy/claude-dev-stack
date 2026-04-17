import { describe, it, expect } from 'vitest';
import { buildObjectKey, DEFAULT_PREFIX } from './config.js';
import type { S3BackendConfig } from './config.js';

function makeConfig(overrides: Partial<S3BackendConfig> = {}): S3BackendConfig {
  return {
    bucket: 'test-bucket',
    region: 'us-east-1',
    prefix: DEFAULT_PREFIX,
    ...overrides,
  };
}

describe('config', () => {
  describe('DEFAULT_PREFIX', () => {
    it('equals vault/projects/', () => {
      expect(DEFAULT_PREFIX).toBe('vault/projects/');
    });
  });

  describe('buildObjectKey', () => {
    it('builds key with default prefix', () => {
      const config = makeConfig();
      expect(buildObjectKey(config, 'my-project')).toBe('vault/projects/my-project/sessions.db');
    });

    it('builds key with custom prefix', () => {
      const config = makeConfig({ prefix: 'custom/' });
      expect(buildObjectKey(config, 'proj')).toBe('custom/proj/sessions.db');
    });

    it('adds trailing slash if prefix lacks one', () => {
      const config = makeConfig({ prefix: 'no-slash' });
      expect(buildObjectKey(config, 'proj')).toBe('no-slash/proj/sessions.db');
    });

    it('handles empty prefix', () => {
      const config = makeConfig({ prefix: '' });
      // Empty prefix + '/' prepended = '/proj/sessions.db'
      expect(buildObjectKey(config, 'proj')).toBe('/proj/sessions.db');
    });

    it('preserves prefix with trailing slash', () => {
      const config = makeConfig({ prefix: 'data/vault/' });
      expect(buildObjectKey(config, 'test')).toBe('data/vault/test/sessions.db');
    });
  });
});
