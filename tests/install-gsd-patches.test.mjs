// tests/install-gsd-patches.test.mjs
// Structural assertions on patches/execute-phase.md (GSD workflow patch).
// Verifies the patch file is well-formed and contains bypassPermissions.
// Source: Phase 40 Plan 02
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patchPath = path.join(__dirname, '..', 'patches', 'execute-phase.md');

describe('patches/execute-phase.md (GSD bypassPermissions patch)', () => {
  it('patch file exists', () => {
    expect(existsSync(patchPath)).toBe(true);
  });

  const content = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';

  it('contains mode="bypassPermissions" for Task() calls', () => {
    expect(content).toMatch(/mode="bypassPermissions"/);
  });

  it('targets gsd-executor subagent type', () => {
    expect(content).toMatch(/subagent_type="gsd-executor"/);
  });

  it('is a valid GSD workflow file (has <purpose> and <process> tags)', () => {
    expect(content).toMatch(/<purpose>/);
    expect(content).toMatch(/<process>/);
  });

  it('preserves worktree isolation in the Task() block', () => {
    expect(content).toMatch(/isolation="worktree"/);
  });

  it('mentions bypassPermissions for sequential mode too', () => {
    expect(content).toMatch(/Keep `mode="bypassPermissions"`/);
  });

  it('is substantial (>= 1000 lines — full file replacement, not a diff)', () => {
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(1000);
  });
});
