import { describe, it, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, chmodSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { syncVault, buildTitle, _walkProjectFiles } from '../lib/notebooklm-sync.mjs';
import { _resetBinaryCache as _resetNotebooklmBinary } from '../lib/notebooklm.mjs';
import { hashFile, readManifest } from '../lib/notebooklm-manifest.mjs';

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

  it('syncVault is an async function (replaced scaffold, now real implementation)', () => {
    // Plan 04-01 scaffold test updated: syncVault is now fully implemented in Plan 04-02.
    assert.equal(typeof syncVault, 'function');
    // The constructor.name for async functions is 'AsyncFunction'
    assert.equal(syncVault.constructor.name, 'AsyncFunction');
  });
});

describe('lib/notebooklm-sync.mjs — walkProjectFiles (D-11, D-17, D-18, D-19)', () => {
  const walkTmpBase = join(tmpdir(), `claude-test-notebooklm-sync-walk-${process.pid}`);
  const walkVaultRoot = join(walkTmpBase, 'vault');

  function resetWalkVault() {
    if (existsSync(walkVaultRoot)) rmSync(walkVaultRoot, { recursive: true, force: true });
    mkdirSync(join(walkVaultRoot, 'projects'), { recursive: true });
    mkdirSync(join(walkVaultRoot, 'meta'), { recursive: true });
  }

  function writeWalkFile(relativePath, content = '# test\n') {
    const abs = join(walkVaultRoot, relativePath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  }

  beforeEach(() => resetWalkVault());
  after(() => {
    if (existsSync(walkTmpBase)) rmSync(walkTmpBase, { recursive: true, force: true });
  });

  it('emits files in D-11 order: context → decisions → docs → sessions (single project)', async () => {
    writeWalkFile('projects/proj-a/context.md');
    writeWalkFile('projects/proj-a/decisions/0001-a.md');
    writeWalkFile('projects/proj-a/decisions/0002-b.md');
    writeWalkFile('projects/proj-a/docs/x.md');
    writeWalkFile('projects/proj-a/docs/y.md');
    writeWalkFile('projects/proj-a/sessions/2026-01-01-s.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    const categories = result.map((r) => r.category);
    const paths = result.map((r) => r.vaultRelativePath);

    assert.deepEqual(categories, ['context', 'adr', 'adr', 'doc', 'doc', 'session']);
    assert.deepEqual(paths, [
      'projects/proj-a/context.md',
      'projects/proj-a/decisions/0001-a.md',
      'projects/proj-a/decisions/0002-b.md',
      'projects/proj-a/docs/x.md',
      'projects/proj-a/docs/y.md',
      'projects/proj-a/sessions/2026-01-01-s.md',
    ]);
  });

  it('emits projects alphabetically (D-11 cross-project)', async () => {
    writeWalkFile('projects/beta/context.md');
    writeWalkFile('projects/alpha/context.md');
    writeWalkFile('projects/gamma/context.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    assert.deepEqual(
      result.map((r) => r.projectSlug),
      ['alpha', 'beta', 'gamma'],
    );
  });

  it('NEVER descends into shared/ or meta/ (NBLM-11 / D-19)', async () => {
    writeWalkFile('projects/p1/context.md');
    writeWalkFile('shared/patterns.md');
    writeWalkFile('meta/project-registry.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    assert.equal(result.length, 1);
    assert.equal(result[0].vaultRelativePath, 'projects/p1/context.md');

    const sharedCount = result.filter((r) => r.vaultRelativePath.startsWith('shared/')).length;
    const metaCount = result.filter((r) => r.vaultRelativePath.startsWith('meta/')).length;
    assert.equal(sharedCount, 0);
    assert.equal(metaCount, 0);
  });

  it('ignores non-.md files (D-19)', async () => {
    writeWalkFile('projects/p1/sessions/2026-01-01-s.md');
    writeWalkFile('projects/p1/sessions/notes.txt', 'plain text');
    writeWalkFile('projects/p1/sessions/image.png', 'fake png');

    const result = await _walkProjectFiles(walkVaultRoot);
    const sessionEntries = result.filter((r) => r.category === 'session');
    assert.equal(sessionEntries.length, 1);
    assert.equal(sessionEntries[0].basename, '2026-01-01-s.md');
  });

  it('skips ADRs that do not match NNNN- regex (D-02, T4-01-02 for NBLM-08)', async () => {
    writeWalkFile('projects/p1/decisions/0001-valid.md');
    writeWalkFile('projects/p1/decisions/README.md');
    writeWalkFile('projects/p1/decisions/notes.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    const adrEntries = result.filter((r) => r.category === 'adr');
    assert.equal(adrEntries.length, 1);
    assert.equal(adrEntries[0].basename, '0001-valid.md');
    assert.equal(adrEntries[0].title, 'p1__ADR-0001-valid.md');
  });

  it('excludes _template directory (D-17)', async () => {
    writeWalkFile('projects/real-proj/context.md');
    writeWalkFile('projects/_template/context.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    assert.equal(result.length, 1);
    assert.equal(result[0].projectSlug, 'real-proj');
  });

  it('silently skips missing category directories (D-18 optional)', async () => {
    writeWalkFile('projects/p1/context.md');
    // No decisions/, docs/, or sessions/ directories

    const result = await _walkProjectFiles(walkVaultRoot);
    assert.equal(result.length, 1);
    assert.equal(result[0].category, 'context');
  });

  it('emits POSIX-slashed vaultRelativePath on all platforms (research Option B)', async () => {
    writeWalkFile('projects/p1/decisions/0001-first.md');
    writeWalkFile('projects/p1/docs/some-doc.md');

    const result = await _walkProjectFiles(walkVaultRoot);
    for (const entry of result) {
      assert.ok(entry.vaultRelativePath.includes('/'));
      assert.ok(!entry.vaultRelativePath.includes('\\'), `backslash found in ${entry.vaultRelativePath}`);
    }
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
