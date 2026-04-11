/**
 * tests/notebooklm-cli.test.mjs — unit tests for lib/notebooklm-cli.mjs dispatcher.
 *
 * Covers: main() dispatch, runStatus (fresh vault, populated vault), runSync error paths.
 * Validation rows: 5-01-01 (NBLM-19 + NBLM-20).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../lib/notebooklm-cli.mjs';
import { writeManifest } from '../lib/notebooklm-manifest.mjs';

// ── Test fixtures ────────────────────────────────────────────────────────────

/**
 * Capture lines emitted by console.log and info/ok/warn/fail helpers
 * (all use console.log internally).
 *
 * @returns {{ lines: string[], restore: () => void }}
 */
function captureConsole() {
  const lines = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push('[stderr] ' + args.join(' '));
  return {
    lines,
    restore() {
      console.log = origLog;
      console.error = origError;
    },
  };
}

/**
 * Create a minimal valid vault directory with meta/ and projects/ subdirs.
 */
function mkTempVault() {
  const root = mkdtempSync(join(tmpdir(), 'nb-cli-test-'));
  mkdirSync(join(root, 'meta'), { recursive: true });
  mkdirSync(join(root, 'projects'), { recursive: true });
  return root;
}

// ── main() dispatch ──────────────────────────────────────────────────────────

describe('notebooklm-cli: main() dispatch', () => {
  let vaultRoot;
  let cap;
  let origVaultPath;

  beforeEach(() => {
    vaultRoot = mkTempVault();
    origVaultPath = process.env.VAULT_PATH;
    process.env.VAULT_PATH = vaultRoot;
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
    if (origVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = origVaultPath;
    }
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('main([]) prints NotebookLM help and does not throw', async () => {
    await main([]);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('NotebookLM Sync'), `Expected "NotebookLM Sync" in output, got:\n${joined}`);
    assert.ok(joined.includes('notebooklm sync'), `Expected "notebooklm sync" in output`);
    assert.ok(joined.includes('notebooklm status'), `Expected "notebooklm status" in output`);
  });

  it('main([\'help\']) prints help and does not throw', async () => {
    await main(['help']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('NotebookLM Sync'));
    assert.ok(joined.includes('notebooklm sync'));
  });

  it('main([\'-h\']) prints help and does not throw', async () => {
    await main(['-h']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('NotebookLM Sync'));
  });

  it('main([\'--help\']) prints help and does not throw', async () => {
    await main(['--help']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('NotebookLM Sync'));
  });

  it('main([\'bogus\']) throws Error with "Unknown notebooklm subcommand"', async () => {
    await assert.rejects(
      () => main(['bogus']),
      (err) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        assert.ok(
          err.message.includes('Unknown notebooklm subcommand'),
          `Expected "Unknown notebooklm subcommand" in message, got: ${err.message}`
        );
        return true;
      }
    );
  });
});

// ── runStatus — fresh vault (no manifest file) ───────────────────────────────

describe('notebooklm-cli: runStatus — fresh vault (no manifest)', () => {
  let vaultRoot;
  let cap;
  let origVaultPath;

  beforeEach(() => {
    vaultRoot = mkTempVault();
    origVaultPath = process.env.VAULT_PATH;
    process.env.VAULT_PATH = vaultRoot;
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
    if (origVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = origVaultPath;
    }
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('fresh vault → prints "Last sync: never" and does not throw', async () => {
    await main(['status']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('Last sync: never'), `Expected "Last sync: never" in:\n${joined}`);
  });

  it('fresh vault → prints "Files tracked: 0"', async () => {
    await main(['status']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('Files tracked: 0'), `Expected "Files tracked: 0" in:\n${joined}`);
  });

  it('fresh vault → exits 0 (no throw)', async () => {
    // Simply must not throw
    await main(['status']);
  });

  it('non-existent VAULT_PATH → prints info message and does not throw', async () => {
    process.env.VAULT_PATH = '/tmp/does-not-exist-nb-cli-test';
    await main(['status']);
    const joined = cap.lines.join('\n');
    // Should print some guidance, not crash
    assert.ok(joined.length > 0, 'Expected some output for missing vault');
  });
});

// ── runStatus — populated vault with manifest ────────────────────────────────

describe('notebooklm-cli: runStatus — populated vault with manifest', () => {
  let vaultRoot;
  let cap;
  let origVaultPath;

  beforeEach(() => {
    vaultRoot = mkTempVault();
    origVaultPath = process.env.VAULT_PATH;
    process.env.VAULT_PATH = vaultRoot;
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
    if (origVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = origVaultPath;
    }
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('manifest with 1 file and recent generated_at → prints file count and last sync', async () => {
    const now = new Date().toISOString();
    writeManifest(vaultRoot, {
      version: 1,
      generated_at: now,
      files: {
        'projects/x/context.md': { hash: 'abc123', notebook_source_id: 'src1', uploaded_at: now },
      },
    });
    await main(['status']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('Files tracked: 1'), `Expected "Files tracked: 1" in:\n${joined}`);
    // Should show some sync time info (not "never")
    assert.ok(!joined.includes('Last sync: never'), `Should not show "Last sync: never" with a manifest`);
  });

  it('manifest with old generated_at (7 days ago) → prints "days ago"', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    writeManifest(vaultRoot, {
      version: 1,
      generated_at: sevenDaysAgo,
      files: {
        'projects/x/context.md': { hash: 'abc123', notebook_source_id: 'src1', uploaded_at: sevenDaysAgo },
      },
    });
    await main(['status']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('day'), `Expected "day" age label in:\n${joined}`);
  });

  it('manifest with 2 files → displays "Files tracked: 2"', async () => {
    const now = new Date().toISOString();
    writeManifest(vaultRoot, {
      version: 1,
      generated_at: now,
      files: {
        'projects/a/context.md': { hash: 'aaa', notebook_source_id: 'sa', uploaded_at: now },
        'projects/b/context.md': { hash: 'bbb', notebook_source_id: 'sb', uploaded_at: now },
      },
    });
    await main(['status']);
    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('Files tracked: 2'), `Expected "Files tracked: 2" in:\n${joined}`);
  });
});

// ── runSync — error paths (binary missing / NotebooklmNotInstalledError) ─────

describe('notebooklm-cli: runSync — NotebooklmNotInstalledError path', () => {
  let vaultRoot;
  let cap;
  let origVaultPath;
  let origPath;

  beforeEach(() => {
    vaultRoot = mkTempVault();
    origVaultPath = process.env.VAULT_PATH;
    origPath = process.env.PATH;
    process.env.VAULT_PATH = vaultRoot;
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
    process.env.PATH = origPath;
    if (origVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = origVaultPath;
    }
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('notebooklm binary absent → throws (so CLI exits non-zero)', async () => {
    // Point PATH to an empty dir so notebooklm binary is not found
    const emptyDir = mkdtempSync(join(tmpdir(), 'empty-path-'));
    process.env.PATH = emptyDir;
    await assert.rejects(
      () => main(['sync']),
      (err) => {
        assert.ok(err instanceof Error, 'Expected Error instance');
        return true;
      }
    );
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('notebooklm binary absent → outputs install hint before throwing', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'empty-path2-'));
    process.env.PATH = emptyDir;
    try {
      await main(['sync']);
    } catch {
      // expected to throw
    }
    const joined = cap.lines.join('\n');
    assert.ok(
      joined.includes('pipx') || joined.includes('notebooklm'),
      `Expected install hint in output, got:\n${joined}`
    );
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
