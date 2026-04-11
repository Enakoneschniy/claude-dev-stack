/**
 * tests/doctor.test.mjs — NotebookLM section in lib/doctor.mjs (NBLM-27 + ADR-0012)
 *
 * Strategy: run `node bin/cli.mjs doctor` in a subprocess with a custom PATH that
 * points to a fake `notebooklm` binary (the existing sync stub). Capture stdout and
 * assert on the presence/absence of expected lines. Also set VAULT_PATH to a
 * controlled temp directory so doctor reads a known manifest state.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const cliPath = join(projectRoot, 'bin', 'cli.mjs');
const stubSh = join(projectRoot, 'tests', 'fixtures', 'notebooklm-sync-stub.sh');

// Build a PATH string that excludes any segment containing the real `notebooklm` binary.
// This allows us to simulate "notebooklm not installed" in tests.
function buildPathWithoutNblm() {
  const segments = (process.env.PATH || '').split(':');
  return segments.filter(seg => !existsSync(join(seg, 'notebooklm'))).join(':');
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Run `node bin/cli.mjs doctor` with a controlled environment.
 * @param {object} opts
 * @param {string|null} opts.stubBinDir   - Prepend to PATH so fake `notebooklm` is found.
 * @param {boolean}     opts.excludeNblm  - If true, strip the real notebooklm from PATH.
 * @param {string|null} opts.vaultPath    - Passed as VAULT_PATH env var (overrides findVault).
 * @param {object}      opts.extraEnv     - Additional env vars to pass to the subprocess.
 */
function runDoctor({ stubBinDir = null, excludeNblm = false, vaultPath = null, extraEnv = {} } = {}) {
  let pathValue = excludeNblm ? buildPathWithoutNblm() : process.env.PATH;

  const env = {
    PATH: pathValue,
    HOME: process.env.HOME,
    ...extraEnv,
  };

  if (stubBinDir) {
    env.PATH = `${stubBinDir}:${env.PATH}`;
  }
  if (vaultPath) {
    env.VAULT_PATH = vaultPath;
  }

  const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
    encoding: 'utf8',
    env,
    timeout: 15000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/**
 * Create a temp vault dir with meta/ and projects/ so findVault() picks it up.
 * Optionally write a .notebooklm-sync.json manifest.
 */
function makeTempVault({ manifest = null } = {}) {
  const vaultRoot = mkdtempSync(join(tmpdir(), 'doctor-test-vault-'));
  mkdirSync(join(vaultRoot, 'meta'), { recursive: true });
  mkdirSync(join(vaultRoot, 'projects'), { recursive: true });
  if (manifest !== null) {
    writeFileSync(
      join(vaultRoot, '.notebooklm-sync.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
  }
  return vaultRoot;
}

/**
 * Create a temp bin directory with a `notebooklm` wrapper that delegates
 * to the existing sync stub with configurable env vars.
 */
function makeStubBinDir({ authExit = 0 } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'doctor-test-bin-'));
  const wrapperPath = join(binDir, 'notebooklm');

  writeFileSync(
    wrapperPath,
    `#!/bin/bash\nexport NOTEBOOKLM_SYNC_STUB_AUTH_EXIT=${authExit}\nexec "${stubSh}" "$@"\n`,
    'utf8',
  );
  chmodSync(wrapperPath, 0o755);
  return binDir;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('doctor — NotebookLM section (NBLM-27 + ADR-0012)', () => {
  let tmpVault = null;
  let tmpBinDir = null;

  afterEach(() => {
    if (tmpVault && existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
    if (tmpBinDir && existsSync(tmpBinDir)) rmSync(tmpBinDir, { recursive: true, force: true });
    tmpVault = null;
    tmpBinDir = null;
  });

  it('missing notebooklm binary — prints info line, no fail line for notebooklm', () => {
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    // Must see the info "not installed (optional" line.
    assert.ok(
      result.stdout.includes('not installed (optional'),
      `Expected "not installed (optional" in stdout.\nGot: ${result.stdout}`,
    );

    // Must NOT see a red ✘ on a line containing "notebooklm" (fail() would produce that).
    const lines = result.stdout.split('\n');
    const nblmFailLine = lines.find(l => l.includes('\x1b[31m\u2718') && l.toLowerCase().includes('notebooklm'));
    assert.equal(
      nblmFailLine,
      undefined,
      `notebooklm must not appear on a fail (✘) line. Found: ${nblmFailLine}`,
    );
  });

  it('binary present + auth ok — prints ok lines for binary and auth', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    // Should see notebooklm binary ok line.
    assert.ok(
      result.stdout.includes('notebooklm'),
      `Expected notebooklm mention in stdout.\nGot: ${result.stdout}`,
    );
    // Should see auth ok line.
    assert.ok(
      result.stdout.includes('notebooklm auth — ok'),
      `Expected "notebooklm auth — ok".\nGot: ${result.stdout}`,
    );
  });

  it('binary present + auth check fails — prints warn line and login hint', () => {
    tmpBinDir = makeStubBinDir({ authExit: 1 });
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('login required'),
      `Expected "login required" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('fresh vault (no manifest) — prints "last sync: never"', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    tmpVault = makeTempVault(); // no manifest written

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('last sync: never'),
      `Expected "last sync: never".\nGot: ${result.stdout}`,
    );
  });

  it('manifest with generated_at = today — prints ok last sync', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    const recentDate = new Date().toISOString();
    tmpVault = makeTempVault({
      manifest: {
        version: 1,
        generated_at: recentDate,
        files: {
          'sessions/2026-01-01.md': { hash: 'abc123', notebook_source_id: 'src1', uploaded_at: recentDate },
          'sessions/2026-01-02.md': { hash: 'def456', notebook_source_id: 'src2', uploaded_at: recentDate },
        },
      },
    });

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('last sync: today') || result.stdout.includes('last sync: 0 day'),
      `Expected recent sync in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('manifest with generated_at = 5 days ago — prints stale sync warn', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    const staleDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    tmpVault = makeTempVault({
      manifest: {
        version: 1,
        generated_at: staleDate,
        files: {
          'sessions/old.md': { hash: 'aaa', notebook_source_id: 'src1', uploaded_at: staleDate },
        },
      },
    });

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('consider running manually'),
      `Expected stale sync warning.\nGot: ${result.stdout}`,
    );
  });

  it('doctor exits 0 regardless of notebooklm state', () => {
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
  });
});
