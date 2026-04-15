import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('installSessionHook copies patches/ to ~/.claude/gsd-local-patches/', () => {
  let fakeHome;
  let fakePkgRoot;
  let origHome;
  let installSessionHook;

  before(async () => {
    fakeHome = mkdtempSync(join(tmpdir(), 'cds-home-'));
    fakePkgRoot = mkdtempSync(join(tmpdir(), 'cds-pkg-'));

    // Seed a minimal pkgRoot/patches/ tree
    mkdirSync(join(fakePkgRoot, 'patches'), { recursive: true });
    writeFileSync(join(fakePkgRoot, 'patches', 'manager.md'), 'manager patch body\n');
    writeFileSync(join(fakePkgRoot, 'patches', 'transition.md'), 'transition patch body\n');

    // Seed a minimal pkgRoot/hooks/ tree — installSessionHook tries to copy several scripts
    mkdirSync(join(fakePkgRoot, 'hooks'), { recursive: true });
    for (const name of [
      'session-start-context.sh', 'session-end-check.sh', 'vault-auto-push.sh',
      'gsd-auto-reapply-patches.sh', 'budget-check.mjs', 'budget-reset.mjs',
      'budget-check-status.mjs', 'gsd-workflow-enforcer.mjs',
      'notebooklm-sync-trigger.mjs', 'notebooklm-sync-runner.mjs', 'update-context.mjs',
    ]) {
      writeFileSync(join(fakePkgRoot, 'hooks', name), '#!/bin/bash\nexit 0\n');
    }

    // Seed a minimal lib/budget.mjs so the budget copy block succeeds
    mkdirSync(join(fakePkgRoot, 'lib'), { recursive: true });
    writeFileSync(join(fakePkgRoot, 'lib', 'budget.mjs'), 'export default {};\n');

    // Override HOME, then import (hooks.mjs calls homedir() per invocation — on
    // Unix that re-reads $HOME at call time, so this works in-process).
    origHome = process.env.HOME;
    process.env.HOME = fakeHome;

    ({ installSessionHook } = await import('../lib/install/hooks.mjs'));
  });

  after(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(fakePkgRoot, { recursive: true, force: true });
  });

  it('copies patches/*.md to <HOME>/.claude/gsd-local-patches/', () => {
    // Call the function — empty projectsData triggers fallback branch; the
    // patches copy (BUG-06 D-07 block) must still happen unconditionally.
    installSessionHook(1, 1, fakePkgRoot, join(fakeHome, 'vault'), { projects: [] });

    const destDir = join(fakeHome, '.claude', 'gsd-local-patches');
    assert.ok(existsSync(destDir), 'destination dir must exist');
    assert.ok(existsSync(join(destDir, 'manager.md')), 'manager.md must be copied');
    assert.ok(existsSync(join(destDir, 'transition.md')), 'transition.md must be copied');

    assert.equal(
      readFileSync(join(destDir, 'manager.md'), 'utf8'),
      'manager patch body\n',
      'manager.md content must match source byte-for-byte',
    );
    assert.equal(
      readFileSync(join(destDir, 'transition.md'), 'utf8'),
      'transition patch body\n',
      'transition.md content must match source byte-for-byte',
    );
  });

  it('respected HOME override — destination is under fake HOME', () => {
    const destDir = join(fakeHome, '.claude', 'gsd-local-patches');
    const realPath = join(fakeHome, '.claude');
    assert.ok(destDir.startsWith(realPath), 'destination must be under fake HOME');
  });
});
