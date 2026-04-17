// tests/install-gsd-patches.test.mjs
// Structural assertions for the gsd-execute-phase-bypassperms.patch file
// and the applyShippedPatches() helper in lib/install/gsd.mjs.
//
// Phase 40 Plan 02 — does NOT mutate ~/.claude/get-shit-done/.
//
// Assertion note: plan originally expected >= 2 hunks and >= 2 subagent_type
// anchor matches (worktree + sequential Task() blocks). Inspection of
// ~/.claude/get-shit-done/workflows/execute-phase.md confirmed only ONE
// Task(subagent_type="gsd-executor", ...) invocation exists (the sequential
// mode is described textually, not as a separate Task() call). Assertions
// adjusted to >= 1 accordingly (Rule 1 auto-fix — wrong assumption in plan).
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const patchPath = join(repoRoot, 'patches', 'gsd-execute-phase-bypassperms.patch');

describe('patches/gsd-execute-phase-bypassperms.patch — structural', () => {
  it('exists and is within expected size bounds', () => {
    const stat = statSync(patchPath);
    assert.ok(stat.isFile(), 'patch file must exist');
    assert.ok(stat.size > 200, 'patch file must be > 200 bytes (avoid empty stub)');
    assert.ok(stat.size < 8192, 'patch file must be < 8 KB (sanity bound — too large suggests drift)');
  });

  const body = readFileSync(patchPath, 'utf8');

  it('has unified-diff header pointing at workflows/execute-phase.md', () => {
    assert.match(body, /^--- a\/workflows\/execute-phase\.md$/m, 'must have --- a/ header');
    assert.match(body, /^\+\+\+ b\/workflows\/execute-phase\.md$/m, 'must have +++ b/ header');
  });

  it('contains bypassPermissions addition on a + line', () => {
    const additions = body.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    assert.ok(additions.some((l) => l.includes('bypassPermissions')), 'at least one + line must contain bypassPermissions');
  });

  it('anchors on subagent_type="gsd-executor" context', () => {
    // Only one Task(subagent_type="gsd-executor", ...) block exists in execute-phase.md
    // (the sequential mode is described textually, not as a second Task() call).
    const matches = body.match(/subagent_type="gsd-executor"/g) || [];
    assert.ok(matches.length >= 1, `expected >=1 anchor match, got ${matches.length}`);
  });

  it('has at least one hunk', () => {
    // Only one Task(subagent_type="gsd-executor") block exists in the target file.
    const hunks = body.match(/^@@ /gm) || [];
    assert.ok(hunks.length >= 1, `expected >=1 hunk, got ${hunks.length}`);
  });

  it('hunks include adequate context (>= 3 unchanged lines)', () => {
    // Each unchanged line in unified diff starts with a single space followed by content.
    const contextLines = body.split(/\r?\n/).filter((l) => /^ \S/.test(l));
    assert.ok(contextLines.length >= 3, `unified diff must have >= 3 context lines total, got ${contextLines.length}`);
  });
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
