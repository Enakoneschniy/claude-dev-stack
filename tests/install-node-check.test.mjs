// tests/install-node-check.test.mjs
// Unit tests for lib/install/node-check.mjs.
// Source: Phase 39 VALIDATION §Task 39-04-03
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertNodeVersion, currentNodeMajor } from '../lib/install/node-check.mjs';

describe('currentNodeMajor', () => {
  it('returns an integer >= 20 on the test runner (Plan 01 bumps engines.node >=20)', () => {
    const v = currentNodeMajor();
    expect(v).toBeGreaterThanOrEqual(20);
  });
});

describe('assertNodeVersion', () => {
  let stderrSpy;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('does not throw when runtime Node >= minMajor', () => {
    expect(() => assertNodeVersion(20)).not.toThrow();
  });

  it('does not throw when minMajor equals runtime', () => {
    expect(() => assertNodeVersion(currentNodeMajor())).not.toThrow();
  });

  it('throws with actionable message when minMajor > runtime', () => {
    expect(() => assertNodeVersion(99)).toThrow(/Node 99\+ required/);
  });

  it('prints actionable message with nvm install + @latest fallback', () => {
    try {
      assertNodeVersion(99);
    } catch {
      // expected
    }
    const msg = stderrSpy.mock.calls.flat().join('');
    expect(msg).toMatch(/nvm install/);
    expect(msg).toMatch(/claude-dev-stack@latest/);
    expect(msg).toMatch(/migration-v0-to-v1-alpha/);
  });
});
