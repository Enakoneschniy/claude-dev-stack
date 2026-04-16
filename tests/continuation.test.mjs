import { describe, it, expect } from 'vitest';
import assert from 'node:assert/strict';

// ── lib/continuation.mjs unit tests ─────────────────────────────────────────

describe('lib/continuation.mjs', async () => {
  const mod = await import('../lib/continuation.mjs');

  describe('exports', () => {
    it('exports showContinuationPrompt as a function', () => {
      assert.equal(typeof mod.showContinuationPrompt, 'function');
    });

    it('exports handleRemind as a function', () => {
      assert.equal(typeof mod.handleRemind, 'function');
    });

    it('exports handleLocal as a function', () => {
      assert.equal(typeof mod.handleLocal, 'function');
    });

    it('exports handleCloud as a function', () => {
      assert.equal(typeof mod.handleCloud, 'function');
    });

    it('exports handleNow as a function', () => {
      assert.equal(typeof mod.handleNow, 'function');
    });
  });

  describe('handleNow', () => {
    it('resolves without throwing', async () => {
      await assert.doesNotReject(() => mod.handleNow());
    });
  });

  describe('handleRemind', () => {
    it('resolves without throwing when called with a delay string', async () => {
      await assert.doesNotReject(() => mod.handleRemind('1h'));
    });
  });

  describe('handleLocal', () => {
    it('resolves without throwing when called with a schedule string', async () => {
      await assert.doesNotReject(() => mod.handleLocal('+1h'));
    });
  });

  describe('handleCloud', () => {
    it('resolves without throwing when called with schedule and repoUrl', async () => {
      await assert.doesNotReject(() => mod.handleCloud('+1h', 'https://github.com/example/repo.git'));
    });
  });
});
