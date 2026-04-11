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

describe('lib/notebooklm-sync.mjs — ensureNotebook (D-09)', () => {
  const ensureStubDir = join(tmpBase, 'ensure-notebook-stub-dir');
  const ensureStubInstall = join(ensureStubDir, 'notebooklm');
  let ensureOriginalPath;

  before(() => {
    if (existsSync(ensureStubDir)) rmSync(ensureStubDir, { recursive: true, force: true });
    mkdirSync(ensureStubDir, { recursive: true });
    copyFileSync(syncStubSource, ensureStubInstall);
    chmodSync(ensureStubInstall, 0o755);
    ensureOriginalPath = process.env.PATH;
    process.env.PATH = `${ensureStubDir}${delimiter}${ensureOriginalPath}`;
  });

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NOTEBOOKLM_SYNC_STUB_')) delete process.env[key];
    }
    _resetNotebooklmBinary();
  });

  after(() => {
    process.env.PATH = ensureOriginalPath;
    if (existsSync(ensureStubDir)) rmSync(ensureStubDir, { recursive: true, force: true });
  });

  it('returns existing notebook id when one match found (D-09)', async () => {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT =
      '{"notebooks":[{"id":"nb-existing","title":"claude-dev-stack-vault","created_at":"2026-04-11T00:00:00"}],"count":1}';
    const { _ensureNotebook } = await import('../lib/notebooklm-sync.mjs');
    const id = await _ensureNotebook('claude-dev-stack-vault');
    assert.equal(id, 'nb-existing');
  });

  it('creates a new notebook when zero matches found (D-09 + NBLM-12)', async () => {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';
    process.env.NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT =
      '{"notebook":{"id":"nb-created","title":"new-vault","created_at":null}}';
    const { _ensureNotebook } = await import('../lib/notebooklm-sync.mjs');
    const id = await _ensureNotebook('new-vault');
    assert.equal(id, 'nb-created');
  });

  it('throws NotebooklmCliError when multiple notebooks share the same title (research finding #3)', async () => {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [
        { id: 'nb-1', title: 'dup', created_at: null },
        { id: 'nb-2', title: 'dup', created_at: null },
      ],
      count: 2,
    });
    const { _ensureNotebook } = await import('../lib/notebooklm-sync.mjs');
    const { NotebooklmCliError } = await import('../lib/notebooklm.mjs');
    await assert.rejects(
      () => _ensureNotebook('dup'),
      (err) => err instanceof NotebooklmCliError && err.message.includes('multiple notebooks found') && err.message.includes('dup'),
    );
  });

  it('uses strict title equality — not prefix match (D-09)', async () => {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [{ id: 'nb-close', title: 'claude-dev-stack-vault-2', created_at: null }],
      count: 1,
    });
    process.env.NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT =
      '{"notebook":{"id":"nb-created","title":"claude-dev-stack-vault","created_at":null}}';
    const { _ensureNotebook } = await import('../lib/notebooklm-sync.mjs');
    const id = await _ensureNotebook('claude-dev-stack-vault');
    // Strict equality: the -2 variant is NOT a match -> create path taken
    assert.equal(id, 'nb-created');
  });
});

describe('lib/notebooklm-sync.mjs — syncOneFile (D-07, D-08, D-12, D-13, D-14)', () => {
  const syncOneVaultRoot = join(tmpBase, 'syncOneFile-vault');
  const syncOneStubDir = join(tmpBase, 'syncOneFile-stub-dir');
  const syncOneStubInstall = join(syncOneStubDir, 'notebooklm');
  let syncOneOriginalPath;

  function resetSyncOneVault() {
    if (existsSync(syncOneVaultRoot)) rmSync(syncOneVaultRoot, { recursive: true, force: true });
    mkdirSync(join(syncOneVaultRoot, 'projects'), { recursive: true });
    mkdirSync(join(syncOneVaultRoot, 'meta'), { recursive: true });
  }

  function makeFileEntry({ category, projectSlug, basename, content = 'hello world\n' }) {
    const subdir = { session: 'sessions', adr: 'decisions', doc: 'docs', context: '' }[category];
    const projectDir = join(syncOneVaultRoot, 'projects', projectSlug);
    const categoryDir = subdir ? join(projectDir, subdir) : projectDir;
    mkdirSync(categoryDir, { recursive: true });
    const absPath = join(categoryDir, basename);
    writeFileSync(absPath, content);
    const vaultRelativePath = relative(syncOneVaultRoot, absPath).split(sep).join('/');
    return { absPath, vaultRelativePath, category, projectSlug, basename, title: buildTitle(category, projectSlug, basename) };
  }

  function freshManifest() {
    return { version: 1, generated_at: new Date().toISOString(), files: {} };
  }

  function freshStats() {
    return { uploaded: 0, skipped: 0, failed: 0, errors: [], planned: [] };
  }

  before(() => {
    if (existsSync(syncOneStubDir)) rmSync(syncOneStubDir, { recursive: true, force: true });
    mkdirSync(syncOneStubDir, { recursive: true });
    copyFileSync(syncStubSource, syncOneStubInstall);
    chmodSync(syncOneStubInstall, 0o755);
    syncOneOriginalPath = process.env.PATH;
    process.env.PATH = `${syncOneStubDir}${delimiter}${syncOneOriginalPath}`;
  });

  beforeEach(() => {
    resetSyncOneVault();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NOTEBOOKLM_SYNC_STUB_')) delete process.env[key];
    }
    _resetNotebooklmBinary();
  });

  after(() => {
    process.env.PATH = syncOneOriginalPath;
    if (existsSync(syncOneStubDir)) rmSync(syncOneStubDir, { recursive: true, force: true });
  });

  it('session not in manifest → upload and record (D-12 first-time path)', async () => {
    const entry = makeFileEntry({ category: 'session', projectSlug: 'p1', basename: '2026-04-10-a.md' });
    const manifest = freshManifest();
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT = '{"source":{"id":"src-session-1","title":"p1__2026-04-10-a.md"}}';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'uploaded');
    assert.equal(stats.uploaded, 1);
    assert.ok(manifest.files[entry.vaultRelativePath]);
    assert.equal(manifest.files[entry.vaultRelativePath].notebook_source_id, 'src-session-1');
  });

  it('session already in manifest → skip regardless of hash (D-12 append-only)', async () => {
    const entry = makeFileEntry({ category: 'session', projectSlug: 'p1', basename: '2026-04-10-b.md', content: 'original' });
    const manifest = freshManifest();
    manifest.files[entry.vaultRelativePath] = { hash: 'stale-hash-that-does-not-match', notebook_source_id: 'src-old', uploaded_at: '2026-01-01T00:00:00.000Z' };
    writeFileSync(entry.absPath, 'modified content');
    const stats = freshStats();
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'skipped');
    assert.equal(stats.skipped, 1);
    assert.equal(manifest.files[entry.vaultRelativePath].notebook_source_id, 'src-old');
  });

  it('non-session unchanged hash → skip (D-13 step 3)', async () => {
    const entry = makeFileEntry({ category: 'context', projectSlug: 'p1', basename: 'context.md', content: 'fixed-content' });
    const currentHash = hashFile(entry.absPath);
    const manifest = freshManifest();
    manifest.files[entry.vaultRelativePath] = { hash: currentHash, notebook_source_id: 'src-ctx', uploaded_at: '2026-01-01T00:00:00.000Z' };
    const stats = freshStats();
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'skipped');
    assert.equal(stats.skipped, 1);
  });

  it('non-session changed hash → delete + upload + update manifest (D-13 steps 4-6)', async () => {
    const entry = makeFileEntry({ category: 'adr', projectSlug: 'p1', basename: '0001-a.md', content: 'new' });
    const manifest = freshManifest();
    manifest.files[entry.vaultRelativePath] = { hash: 'old-hash', notebook_source_id: 'src-old', uploaded_at: '2026-01-01T00:00:00.000Z' };
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_STDOUT = 'Deleted source: src-old';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT = '{"source":{"id":"src-new","title":"p1__ADR-0001-a.md"}}';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'uploaded');
    assert.equal(stats.uploaded, 1);
    assert.equal(manifest.files[entry.vaultRelativePath].notebook_source_id, 'src-new');
    assert.notEqual(manifest.files[entry.vaultRelativePath].hash, 'old-hash');
  });

  it('non-session new file (no manifest entry) → upload only, no delete (D-13 absent-path)', async () => {
    const entry = makeFileEntry({ category: 'doc', projectSlug: 'p1', basename: 'fresh.md' });
    const manifest = freshManifest();
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT = '{"source":{"id":"src-fresh","title":"p1__doc-fresh.md"}}';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'uploaded');
    assert.equal(stats.uploaded, 1);
    assert.equal(manifest.files[entry.vaultRelativePath].notebook_source_id, 'src-fresh');
  });

  it('deleteSourceByTitle throws generic CliError → swallow, upload proceeds (research finding #2)', async () => {
    const entry = makeFileEntry({ category: 'adr', projectSlug: 'p1', basename: '0002-b.md' });
    const manifest = freshManifest();
    manifest.files[entry.vaultRelativePath] = { hash: 'old-hash-differs', notebook_source_id: 'src-old', uploaded_at: '2026-01-01T00:00:00.000Z' };
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_EXIT = '1';
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_STDERR = 'WARNING [notebooklm._sources] Sources data is NoneType';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT = '{"source":{"id":"src-after-swallow","title":"p1__ADR-0002-b.md"}}';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'uploaded');
    assert.equal(stats.failed, 0);
    assert.equal(manifest.files[entry.vaultRelativePath].notebook_source_id, 'src-after-swallow');
  });

  it('deleteSourceByTitle throws rate-limit → propagate (D-08)', async () => {
    const entry = makeFileEntry({ category: 'doc', projectSlug: 'p1', basename: 'x.md' });
    const manifest = freshManifest();
    manifest.files[entry.vaultRelativePath] = { hash: 'stale', notebook_source_id: 'src-old', uploaded_at: '2026-01-01T00:00:00.000Z' };
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_EXIT = '1';
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_STDERR = 'Error: Rate limited.';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');
    const { NotebooklmRateLimitError } = await import('../lib/notebooklm.mjs');

    await assert.rejects(
      () => _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false }),
      NotebooklmRateLimitError,
    );
  });

  it('uploadSource throws generic CliError → stats.failed, stats.errors, no manifest write (D-07)', async () => {
    const entry = makeFileEntry({ category: 'context', projectSlug: 'p1', basename: 'context.md' });
    const manifest = freshManifest();
    const stats = freshStats();
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT = '1';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDERR = 'Error: Upload failed for some reason';
    const { _syncOneFile } = await import('../lib/notebooklm-sync.mjs');

    const result = await _syncOneFile({ fileEntry: entry, vaultRoot: syncOneVaultRoot, notebookId: 'nb-1', manifest, stats, dryRun: false });

    assert.equal(result, 'failed');
    assert.equal(stats.failed, 1);
    assert.equal(stats.errors.length, 1);
    assert.equal(stats.errors[0].file, entry.vaultRelativePath);
    assert.equal(stats.errors[0].title, 'p1__context.md');
    assert.ok(stats.errors[0].reason.length > 0);
    assert.ok(stats.errors[0].error);
    assert.equal(manifest.files[entry.vaultRelativePath], undefined);
  });
});
