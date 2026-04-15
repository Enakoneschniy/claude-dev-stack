import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'gsd-auto-reapply-patches.sh');

function runHook(env) {
  return execFileSync('bash', [hookPath], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: '/tmp',
  });
}

describe('gsd-auto-reapply-patches', () => {
  let workdir;
  let patchesDir;
  let gsdDir;
  let homeDir;

  before(() => {
    workdir = mkdtempSync(join(tmpdir(), 'gsd-patches-'));
    patchesDir = join(workdir, 'patches');
    gsdDir = join(workdir, 'gsd');
    homeDir = join(workdir, 'home');
    mkdirSync(patchesDir, { recursive: true });
    mkdirSync(join(gsdDir, 'workflows'), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
  });

  after(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('applies patch when target SHA differs', () => {
    writeFileSync(join(patchesDir, 'manager.md'), 'patched content v1\n');
    writeFileSync(join(gsdDir, 'workflows', 'manager.md'), 'stock content\n');

    const out = runHook({ PATCHES_DIR: patchesDir, GSD_DIR: gsdDir, HOME: homeDir });

    assert.match(out, /GSD patches auto-reapplied \(1 file\(s\) updated\)/);
    assert.equal(
      readFileSync(join(gsdDir, 'workflows', 'manager.md'), 'utf8'),
      'patched content v1\n',
    );
  });

  it('is silent and does not copy when SHAs match (idempotent)', () => {
    // After the previous test, target already matches patch. Run again.
    const before = readFileSync(join(gsdDir, 'workflows', 'manager.md'), 'utf8');
    const out = runHook({ PATCHES_DIR: patchesDir, GSD_DIR: gsdDir, HOME: homeDir });
    const after = readFileSync(join(gsdDir, 'workflows', 'manager.md'), 'utf8');

    assert.equal(out, '', 'hook should be silent when no change needed');
    assert.equal(before, after, 'target file must be unchanged');
  });

  it('prefers ~/.claude/gsd-local-patches/ over other resolution paths when PATCHES_DIR unset', () => {
    // Seed the wizard-pinned path under our fake HOME
    const pinned = join(homeDir, '.claude', 'gsd-local-patches');
    mkdirSync(pinned, { recursive: true });
    writeFileSync(join(pinned, 'transition.md'), 'pinned content\n');

    // Seed a "dev checkout" style path that would be found later — the hook's
    // well-known candidates include $HOME/Projects/claude-dev-stack/patches.
    // Put DIFFERENT content there so we can assert which source won.
    const devPath = join(homeDir, 'Projects', 'claude-dev-stack', 'patches');
    mkdirSync(devPath, { recursive: true });
    writeFileSync(join(devPath, 'transition.md'), 'dev content\n');

    // Target file must exist for hook to act
    writeFileSync(join(gsdDir, 'workflows', 'transition.md'), 'stock transition\n');

    const out = runHook({
      // Do NOT set PATCHES_DIR — force the hook's own resolver
      GSD_DIR: gsdDir,
      HOME: homeDir,
    });

    assert.match(out, /GSD patches auto-reapplied/);
    assert.equal(
      readFileSync(join(gsdDir, 'workflows', 'transition.md'), 'utf8'),
      'pinned content\n',
      'wizard-pinned ~/.claude/gsd-local-patches/ must win over dev checkout path',
    );
  });

  it('exits 0 silently when GSD_DIR does not exist', () => {
    const missing = join(workdir, 'does-not-exist');
    const out = runHook({ PATCHES_DIR: patchesDir, GSD_DIR: missing, HOME: homeDir });
    assert.equal(out, '');
  });

  it('exits 0 silently when no patches source resolves', () => {
    // Fresh empty HOME, no PATCHES_DIR, target exists but no source.
    // Also suppress PATH so `npm root -g` lookup returns empty — otherwise a
    // globally-installed claude-dev-stack would satisfy the resolver.
    const freshHome = mkdtempSync(join(tmpdir(), 'gsd-no-src-'));
    const freshGsd = mkdtempSync(join(tmpdir(), 'gsd-tgt-'));
    mkdirSync(join(freshGsd, 'workflows'), { recursive: true });
    writeFileSync(join(freshGsd, 'workflows', 'manager.md'), 'stock\n');
    try {
      // Minimal PATH so bash runs but `npm root -g` is not found — suppresses
      // the npm-global lookup that would otherwise resolve an installed
      // claude-dev-stack package.
      const out = execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { PATH: '/bin:/usr/bin', GSD_DIR: freshGsd, HOME: freshHome },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp',
      });
      assert.equal(out, '');
    } finally {
      rmSync(freshHome, { recursive: true, force: true });
      rmSync(freshGsd, { recursive: true, force: true });
    }
  });
});
