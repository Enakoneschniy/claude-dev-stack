import { describe, it, beforeAll, beforeEach, afterAll, afterEach, expect } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, chmodSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  syncVault,
  buildTitle,
  _walkProjectFiles,
  _rotateLogIfNeeded,
  MAX_LOG_LINES,
} from '../lib/notebooklm-sync.mjs';
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
  afterAll(() => {
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
    assert.equal(adrEntries[0].title, 'ADR-0001-valid.md'); // projectScoped: true — no slug prefix
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

  beforeAll(() => {
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

  afterAll(() => {
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

  beforeAll(() => {
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

  afterAll(() => {
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

  beforeAll(() => {
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

  afterAll(() => {
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

describe('lib/notebooklm-sync.mjs — syncVault integration (NBLM-07..13, ROADMAP SC1-5)', () => {
  const integrationVaultRoot = join(tmpBase, 'integration-vault');
  const integrationStubDir = join(tmpBase, 'integration-stub-dir');
  const integrationStubInstall = join(integrationStubDir, 'notebooklm');
  let integrationOriginalPath;

  function resetIntegrationVault() {
    if (existsSync(integrationVaultRoot)) rmSync(integrationVaultRoot, { recursive: true, force: true });
    mkdirSync(join(integrationVaultRoot, 'projects'), { recursive: true });
    mkdirSync(join(integrationVaultRoot, 'meta'), { recursive: true });
  }

  function writeIntegrationFile(relPath, content) {
    const abs = join(integrationVaultRoot, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content !== undefined ? content : `# ${relPath}\n`);
    return abs;
  }

  function seedStubsWithExistingNotebook(notebookId = 'nb-integration', notebookName = 'claude-dev-stack-vault') {
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [{ id: notebookId, title: notebookName, created_at: '2026-04-11T00:00:00' }],
      count: 1,
    });
  }

  beforeAll(() => {
    if (existsSync(integrationStubDir)) rmSync(integrationStubDir, { recursive: true, force: true });
    mkdirSync(integrationStubDir, { recursive: true });
    copyFileSync(syncStubSource, integrationStubInstall);
    chmodSync(integrationStubInstall, 0o755);
    integrationOriginalPath = process.env.PATH;
    process.env.PATH = `${integrationStubDir}${delimiter}${integrationOriginalPath}`;
  });

  beforeEach(() => {
    resetIntegrationVault();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NOTEBOOKLM_SYNC_STUB_') || key === 'NOTEBOOKLM_NOTEBOOK_NAME') {
        delete process.env[key];
      }
    }
    _resetNotebooklmBinary();
  });

  afterAll(() => {
    process.env.PATH = integrationOriginalPath;
    if (existsSync(integrationStubDir)) rmSync(integrationStubDir, { recursive: true, force: true });
  });

  it('first run uploads all 6 files across 2 projects (NBLM-07..10, ROADMAP SC1)', async () => {
    writeIntegrationFile('projects/alpha/context.md', 'alpha context');
    writeIntegrationFile('projects/alpha/decisions/0001-a.md', 'adr 1');
    writeIntegrationFile('projects/alpha/docs/setup.md', 'doc 1');
    writeIntegrationFile('projects/alpha/sessions/2026-01-01-s.md', 'session 1');
    writeIntegrationFile('projects/beta/context.md', 'beta context');
    writeIntegrationFile('projects/beta/sessions/2026-01-02-s.md', 'session 2');
    // No existing cds__ notebooks — stub creates them fresh
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });

    // Per-project mode returns { perProject, total, ... }
    assert.equal(stats.total.uploaded, 6);
    assert.equal(stats.total.skipped, 0);
    assert.equal(stats.total.failed, 0);
    assert.equal(stats.rateLimited, false);
    assert.equal(stats.total.errors.length, 0);

    const manifest = readManifest(integrationVaultRoot);
    const allFiles = Object.values(manifest.projects ?? {}).reduce((acc, p) => Object.assign(acc, p.files ?? {}), {});
    assert.equal(Object.keys(allFiles).length, 6);
    assert.ok(allFiles['projects/alpha/context.md']);
    assert.ok(allFiles['projects/alpha/decisions/0001-a.md']);
    assert.ok(allFiles['projects/alpha/docs/setup.md']);
    assert.ok(allFiles['projects/alpha/sessions/2026-01-01-s.md']);
    assert.ok(allFiles['projects/beta/context.md']);
    assert.ok(allFiles['projects/beta/sessions/2026-01-02-s.md']);
  });

  it('second run skips all files (D-12 session presence + hash skip, ROADMAP SC1)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    writeIntegrationFile('projects/p1/sessions/2026-01-01-s.md', 's');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const firstRun = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(firstRun.total.uploaded, 2);

    // Second run: cds__p1 now exists in manifest — seed list with it
    const manifest1 = readManifest(integrationVaultRoot);
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [{ id: manifest1.projects.p1.notebook_id, title: 'cds__p1', created_at: null }],
      count: 1,
    });

    const secondRun = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(secondRun.total.uploaded, 0);
    assert.equal(secondRun.total.skipped, 2);
  });

  it('edited ADR → replace-by-filename on second run (ROADMAP SC2)', async () => {
    const adrPath = writeIntegrationFile('projects/p1/decisions/0001-a.md', 'original');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const firstRun = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(firstRun.total.uploaded, 1);
    const manifest1 = readManifest(integrationVaultRoot);
    const oldHash = manifest1.projects.p1.files['projects/p1/decisions/0001-a.md'].hash;

    writeFileSync(adrPath, 'updated content');
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT = '{"source":{"id":"src-new-after-edit","title":"ADR-0001-a.md"}}';
    process.env.NOTEBOOKLM_SYNC_STUB_DELETE_STDOUT = 'Deleted source: stub-src-1';
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [{ id: manifest1.projects.p1.notebook_id, title: 'cds__p1', created_at: null }],
      count: 1,
    });

    const secondRun = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(secondRun.total.uploaded, 1);
    assert.equal(secondRun.total.skipped, 0);

    const manifest2 = readManifest(integrationVaultRoot);
    const newHash = manifest2.projects.p1.files['projects/p1/decisions/0001-a.md'].hash;
    assert.notEqual(newHash, oldHash);
    assert.equal(manifest2.projects.p1.files['projects/p1/decisions/0001-a.md'].notebook_source_id, 'src-new-after-edit');
  });

  it('shared/ and meta/ files are never uploaded (NBLM-11, ROADMAP SC3)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    writeIntegrationFile('shared/patterns.md', 'shared');
    writeIntegrationFile('meta/project-registry.md', 'meta');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(stats.total.uploaded, 1);

    const manifest = readManifest(integrationVaultRoot);
    const allFiles = Object.values(manifest.projects ?? {}).reduce((acc, p) => Object.assign(acc, p.files ?? {}), {});
    const manifestKeys = Object.keys(allFiles);
    assert.equal(manifestKeys.length, 1);
    assert.equal(manifestKeys.filter((k) => k.startsWith('shared/')).length, 0);
    assert.equal(manifestKeys.filter((k) => k.startsWith('meta/')).length, 0);
  });

  it('cds__{slug} notebook auto-created on first run when absent (NBLM-12, ROADMAP SC4)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';
    process.env.NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT = '{"notebook":{"id":"nb-freshly-created","title":"cds__p1","created_at":null}}';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(stats.total.uploaded, 1);
    // notebookId is per-project now — check manifest instead
    const manifest = readManifest(integrationVaultRoot);
    assert.equal(manifest.projects.p1.notebook_id, 'nb-freshly-created');
  });

  it('second run reuses existing cds__{slug} notebook — no create call (NBLM-12 steady state, ROADMAP SC4)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';
    process.env.NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT = '{"notebook":{"id":"nb-reused","title":"cds__p1","created_at":null}}';

    const firstRun = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(firstRun.total.uploaded, 1);

    // Second run: seed cds__p1 as existing so ensureNotebook returns it without create
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = JSON.stringify({
      notebooks: [{ id: 'nb-reused', title: 'cds__p1', created_at: null }],
      count: 1,
    });
    const secondRun = await syncVault({ vaultRoot: integrationVaultRoot });
    // No upload (context.md unchanged), no create needed
    assert.equal(secondRun.total.uploaded, 0);
    assert.equal(secondRun.total.skipped, 1);
    assert.equal(secondRun.total.failed, 0);
  });

  it('NOTEBOOKLM_NOTEBOOK_NAME env var set — per-project mode ignores it (NBLM-13 deprecated)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_NOTEBOOK_NAME = 'my-custom-vault';
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    // Per-project mode creates cds__p1, not 'my-custom-vault'
    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(stats.total.uploaded, 1);
    const manifest = readManifest(integrationVaultRoot);
    // cds__p1 must be created (not the custom vault name)
    assert.ok(manifest.projects.p1.notebook_id, 'cds__p1 notebook must be created');
  });

  it('rate-limit aborts sync and returns partial stats (D-08)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT = '1';
    process.env.NOTEBOOKLM_SYNC_STUB_UPLOAD_STDERR = 'Error: Rate limited.';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(stats.rateLimited, true);
    assert.equal(stats.total.uploaded, 0);
    const manifest = readManifest(integrationVaultRoot);
    const allFiles = Object.values(manifest.projects ?? {}).reduce((acc, p) => Object.assign(acc, p.files ?? {}), {});
    assert.equal(Object.keys(allFiles).length, 0);
  });

  it('dryRun mode: no API calls, planned array populated, no manifest writes (D-20)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    writeIntegrationFile('projects/p1/sessions/2026-01-01-s.md', 's');
    writeIntegrationFile('projects/p1/decisions/0001-a.md', 'adr');
    // Intentionally NOT seeding stubs — dryRun must not call listNotebooks

    const stats = await syncVault({ vaultRoot: integrationVaultRoot, dryRun: true });
    assert.equal(stats.total.uploaded, 0);
    assert.equal(stats.notebookId, null);
    assert.ok(Array.isArray(stats.planned));
    assert.equal(stats.planned.length, 3);
    for (const entry of stats.planned) {
      assert.ok(['upload', 'replace', 'skip'].includes(entry.action));
      assert.ok(typeof entry.file === 'string');
      assert.ok(typeof entry.title === 'string');
    }
    // Manifest was never written
    const { join: pathJoin } = await import('node:path');
    assert.equal(existsSync(pathJoin(integrationVaultRoot, '.notebooklm-sync.json')), false);
  });

  it('vault not found → throws Error with message "Vault not found"', async () => {
    await assert.rejects(
      () => syncVault({ vaultRoot: '/definitely/not/a/real/path/phase4' }),
      (err) => err.message.includes('Vault not found'),
    );
  });

  it('stats shape matches D-16 contract (per-project mode)', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    // Per-project mode: { perProject, total, durationMs, rateLimited, notebookId }
    assert.ok(stats.perProject, 'must have perProject field');
    assert.ok(stats.total, 'must have total field');
    assert.equal(typeof stats.total.uploaded, 'number');
    assert.equal(typeof stats.total.skipped, 'number');
    assert.equal(typeof stats.total.failed, 'number');
    assert.ok(Array.isArray(stats.total.errors));
    assert.equal(typeof stats.durationMs, 'number');
    assert.ok(stats.durationMs >= 0);
    assert.equal(stats.notebookId, null); // per-project mode — no single notebook
    assert.equal(typeof stats.rateLimited, 'boolean');
  });

  it('durationMs is a non-negative number', async () => {
    writeIntegrationFile('projects/p1/context.md', 'c');
    process.env.NOTEBOOKLM_SYNC_STUB_LIST_STDOUT = '{"notebooks":[],"count":0}';

    const stats = await syncVault({ vaultRoot: integrationVaultRoot });
    assert.equal(typeof stats.durationMs, 'number');
    assert.ok(stats.durationMs >= 0);
  });
});

// ── _rotateLogIfNeeded (P2-#5 backlog) ───────────────────────────────────────

describe('lib/notebooklm-sync.mjs — _rotateLogIfNeeded (P2-#5)', () => {
  let rotateTmpDir;
  let logPath;

  beforeEach(() => {
    rotateTmpDir = join(tmpBase, `rotate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rotateTmpDir, { recursive: true });
    logPath = join(rotateTmpDir, '.notebooklm-sync.log');
  });

  afterEach(() => {
    if (existsSync(rotateTmpDir)) {
      try {
        chmodSync(rotateTmpDir, 0o755);
      } catch {
        // best-effort
      }
      rmSync(rotateTmpDir, { recursive: true, force: true });
    }
  });

  it('exports MAX_LOG_LINES = 100', () => {
    assert.equal(MAX_LOG_LINES, 100);
  });

  it('returns {rotated:false} when file does not exist', () => {
    const result = _rotateLogIfNeeded(logPath);
    assert.deepEqual(result, { rotated: false });
    assert.equal(existsSync(logPath), false);
  });

  it('returns {rotated:false} when file has fewer lines than maxLines', () => {
    const lines = ['a', 'b', 'c'].join('\n') + '\n';
    writeFileSync(logPath, lines, 'utf8');
    const result = _rotateLogIfNeeded(logPath, 10);
    assert.deepEqual(result, { rotated: false });
    assert.equal(readFileSync(logPath, 'utf8'), lines);
  });

  it('returns {rotated:false} when file has exactly maxLines lines', () => {
    const lines = ['a', 'b', 'c'].join('\n') + '\n';
    writeFileSync(logPath, lines, 'utf8');
    const result = _rotateLogIfNeeded(logPath, 3);
    assert.deepEqual(result, { rotated: false });
    assert.equal(readFileSync(logPath, 'utf8'), lines);
  });

  it('trims to last maxLines when file exceeds threshold (with trailing newline)', () => {
    const input = ['1', '2', '3', '4', '5'].join('\n') + '\n';
    writeFileSync(logPath, input, 'utf8');
    const result = _rotateLogIfNeeded(logPath, 2);
    assert.deepEqual(result, { rotated: true, before: 5, after: 2 });
    assert.equal(readFileSync(logPath, 'utf8'), '4\n5\n');
  });

  it('trims to last maxLines when file exceeds threshold (no trailing newline)', () => {
    const input = ['1', '2', '3', '4', '5'].join('\n');
    writeFileSync(logPath, input, 'utf8');
    const result = _rotateLogIfNeeded(logPath, 3);
    assert.deepEqual(result, { rotated: true, before: 5, after: 3 });
    assert.equal(readFileSync(logPath, 'utf8'), '3\n4\n5');
  });

  it('preserves trailing newline character after rotation', () => {
    const lines = [];
    for (let i = 1; i <= 150; i++) lines.push(`line ${i}`);
    writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
    const result = _rotateLogIfNeeded(logPath);
    assert.equal(result.rotated, true);
    assert.equal(result.before, 150);
    assert.equal(result.after, MAX_LOG_LINES);
    const out = readFileSync(logPath, 'utf8');
    assert.ok(out.endsWith('\n'));
    const outLines = out.slice(0, -1).split('\n');
    assert.equal(outLines.length, MAX_LOG_LINES);
    assert.equal(outLines[0], 'line 51');
    assert.equal(outLines[outLines.length - 1], 'line 150');
  });

  it('uses default MAX_LOG_LINES when maxLines arg omitted', () => {
    const lines = [];
    for (let i = 1; i <= 101; i++) lines.push(`L${i}`);
    writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
    const result = _rotateLogIfNeeded(logPath);
    assert.deepEqual(result, { rotated: true, before: 101, after: 100 });
  });

  it('never throws on read error (returns {rotated:false})', () => {
    // Create a directory at logPath so readFileSync throws EISDIR.
    mkdirSync(logPath);
    const result = _rotateLogIfNeeded(logPath);
    assert.deepEqual(result, { rotated: false });
  });

  it('treats empty file as zero lines (no rotation)', () => {
    writeFileSync(logPath, '', 'utf8');
    const result = _rotateLogIfNeeded(logPath, 5);
    assert.deepEqual(result, { rotated: false });
    assert.equal(readFileSync(logPath, 'utf8'), '');
  });
});
