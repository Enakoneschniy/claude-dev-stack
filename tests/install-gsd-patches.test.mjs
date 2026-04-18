// tests/install-gsd-patches.test.mjs
// Structural assertions for the gsd-execute-phase-bypassperms.patch file
// and the applyShippedPatches() helper in lib/install/gsd.mjs.
//
// Phase 40 Plan 02 — does NOT mutate ~/.claude/get-shit-done/.
//
// Phase 50: patches mechanism dissolved — structural tests no longer applicable.
// Structural tests are skipped; applyShippedPatches export tests still pass
// because the no-op returns the same shape.
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const patchPath = join(repoRoot, 'patches', 'gsd-execute-phase-bypassperms.patch');

describe('patches/gsd-execute-phase-bypassperms.patch — structural', () => {
  // Phase 50: patches mechanism dissolved, structural tests no longer applicable
  it.skip('exists and is within expected size bounds', () => {});
  it.skip('has unified-diff header pointing at workflows/execute-phase.md', () => {});
  it.skip('contains bypassPermissions addition on a + line', () => {});
  it.skip('anchors on subagent_type="gsd-executor" context', () => {});
  it.skip('has at least one hunk', () => {});
  it.skip('hunks include adequate context (>= 3 unchanged lines)', () => {});
});

describe('lib/install/gsd.mjs — applyShippedPatches export', () => {
  it('exports applyShippedPatches', async () => {
    const mod = await import('../lib/install/gsd.mjs');
    assert.equal(typeof mod.applyShippedPatches, 'function', 'must export applyShippedPatches');
  });

  it('returns shape { applied, skipped, failed }', async () => {
    const { applyShippedPatches } = await import('../lib/install/gsd.mjs');
    // Pass a nonexistent pkgRoot so it returns empty arrays without side effects.
    const result = applyShippedPatches('/nonexistent-pkg-root-' + process.pid);
    assert.deepStrictEqual(Object.keys(result).sort(), ['applied', 'failed', 'skipped']);
    assert.ok(Array.isArray(result.applied));
    assert.ok(Array.isArray(result.skipped));
    assert.ok(Array.isArray(result.failed));
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.failed.length, 0);
  });
});
