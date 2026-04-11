import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, chmodSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { syncVault, buildTitle } from '../lib/notebooklm-sync.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const syncStubSource = join(fixturesDir, 'notebooklm-sync-stub.sh');

const tmpBase = join(tmpdir(), `claude-test-notebooklm-sync-${process.pid}`);

describe('lib/notebooklm-sync.mjs — buildTitle (D-01..D-06)', () => {
  it('buildTitle for sessions is pass-through (D-01)', () => {
    const title = buildTitle('session', 'my-proj', '2026-04-10-test.md');
    assert.equal(title, 'my-proj__2026-04-10-test.md');
  });

  it('buildTitle for ADRs parses NNNN regex (D-02)', () => {
    const title = buildTitle('adr', 'my-proj', '0001-use-postgres.md');
    assert.equal(title, 'my-proj__ADR-0001-use-postgres.md');
  });

  it('buildTitle for ADRs returns null on regex mismatch (D-02)', () => {
    assert.equal(buildTitle('adr', 'my-proj', 'README.md'), null);
    assert.equal(buildTitle('adr', 'my-proj', 'notes.md'), null);
    assert.equal(buildTitle('adr', 'my-proj', '123-too-short.md'), null);
  });

  it('buildTitle for docs always prepends doc- (D-03)', () => {
    assert.equal(buildTitle('doc', 'my-proj', 'setup.md'), 'my-proj__doc-setup.md');
    // Double-prefix case from D-03 explicit accept
    assert.equal(buildTitle('doc', 'my-proj', 'doc-setup.md'), 'my-proj__doc-doc-setup.md');
  });

  it('buildTitle for context is fixed (D-04)', () => {
    // Per D-04, output is always project__context.md regardless of the basename we pass in
    assert.equal(buildTitle('context', 'my-proj', 'context.md'), 'my-proj__context.md');
  });

  it('buildTitle trusts projectSlug verbatim (D-05 — no sanitization)', () => {
    // D-05: project slug comes from directory name; no lowercasing or stripping
    assert.equal(buildTitle('session', 'Some_Weird.Name', '2026-01-01-x.md'), 'Some_Weird.Name__2026-01-01-x.md');
  });

  it('buildTitle throws TypeError on non-string input', () => {
    assert.throws(() => buildTitle('session', 42, 'x.md'), TypeError);
    assert.throws(() => buildTitle('session', 'p', null), TypeError);
  });

  it('buildTitle throws Error on unknown category', () => {
    assert.throws(() => buildTitle('nonsense', 'p', 'x.md'), /unknown category/);
  });
});

describe('lib/notebooklm-sync.mjs — syncVault scaffold', () => {
  it('syncVault is exported as an async function', () => {
    assert.equal(typeof syncVault, 'function');
  });

  it('syncVault throws Error(Vault not found) when vaultRoot is non-existent', async () => {
    await assert.rejects(
      () => syncVault({ vaultRoot: '/definitely/does/not/exist/phase4-test' }),
      (err) => err.message.includes('Vault not found'),
    );
  });

  it('syncVault scaffold marker throws orchestration-not-implemented when vault IS valid', async () => {
    // Create a minimal valid vault fixture with meta/ + projects/ so findVault/assertVaultRoot
    // style checks pass, then call syncVault expecting the scaffold throw (Plan 04-02 replaces this).
    const vaultRoot = join(tmpBase, 'vault-scaffold');
    if (existsSync(vaultRoot)) rmSync(vaultRoot, { recursive: true, force: true });
    mkdirSync(join(vaultRoot, 'projects'), { recursive: true });
    mkdirSync(join(vaultRoot, 'meta'), { recursive: true });

    await assert.rejects(
      () => syncVault({ vaultRoot, notebookName: 'stub-vault' }),
      /orchestration not yet implemented — Plan 04-02/,
    );

    rmSync(vaultRoot, { recursive: true, force: true });
  });
});

describe('tests/fixtures/notebooklm-sync-stub.sh — argv-aware modes', () => {
  // Install stub into a dedicated tmp dir and shell out directly (not via PATH)
  // to verify mode branching. Phase 4 integration tests in Plan 04-02 will install
  // the same stub onto PATH the way tests/notebooklm.test.mjs does.
  const stubInstallDir = join(tmpBase, 'stub-dir');
  const stubInstall = join(stubInstallDir, 'notebooklm');

  before(() => {
    if (existsSync(stubInstallDir)) rmSync(stubInstallDir, { recursive: true, force: true });
    mkdirSync(stubInstallDir, { recursive: true });
    copyFileSync(syncStubSource, stubInstall);
    chmodSync(stubInstall, 0o755);
  });

  beforeEach(() => {
    // Clear all per-mode overrides before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NOTEBOOKLM_SYNC_STUB_')) delete process.env[key];
    }
  });

  after(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('list mode returns empty notebooks by default', () => {
    const res = spawnSync(stubInstall, ['list', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.deepEqual(parsed, { notebooks: [], count: 0 });
  });

  it('list mode respects NOTEBOOKLM_SYNC_STUB_LIST_STDOUT override', () => {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[{"id":"nb-1","title":"custom","created_at":"2026-04-11T00:00:00"}],"count":1}';
    const res = spawnSync(stubInstall, ['list', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.notebooks[0].id, 'nb-1');
    assert.equal(parsed.notebooks[0].title, 'custom');
  });

  it('create mode returns canned notebook by default', () => {
    const res = spawnSync(stubInstall, ['create', 'stub-vault', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.ok(parsed.notebook.id);
    assert.ok(parsed.notebook.title);
  });

  it('source add mode returns canned source by default', () => {
    const res = spawnSync(stubInstall, ['source', 'add', '/tmp/x.md', '-n', 'nb-1', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.ok(parsed.source.id);
    assert.ok(parsed.source.title);
  });

  it('source delete-by-title mode returns "Deleted source:" line by default', () => {
    const res = spawnSync(stubInstall, ['source', 'delete-by-title', 'some-title', '-n', 'nb-1', '-y'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /^Deleted source:/);
  });

  it('source add mode respects NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT override for error paths', () => {
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT = '1';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDERR = 'Error: Rate limited.';
    const res = spawnSync(stubInstall, ['source', 'add', '/tmp/x.md', '-n', 'nb-1', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Rate limited/);
  });
});
