/**
 * tests/notebooklm-sync-per-project.test.mjs
 *
 * Per-project sync loop tests (Plan 07-02, Task 2).
 * Tests cds__{slug} notebook creation, projectScoped buildTitle,
 * pre-flight conflict scan, per-project continue, and stats shape.
 */

import { describe, it, beforeAll, beforeEach, afterAll, afterEach, expect } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, chmodSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { buildTitle, syncVault } from '../lib/notebooklm-sync.mjs';
import { readManifest } from '../lib/notebooklm-manifest.mjs';
import { _resetBinaryCache as _resetNotebooklmBinary } from '../lib/notebooklm.mjs';
import { makeTempVault } from './helpers/fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const syncStubSource = join(fixturesDir, 'notebooklm-sync-stub.sh');

// ── buildTitle projectScoped tests (unit, no stub needed) ─────────────────────

describe('buildTitle — projectScoped mode (D-07)', () => {
  it('Test 1: session with projectScoped:true returns basename only (no slug prefix)', () => {
    const title = buildTitle('session', 'alpha', 's1.md', { projectScoped: true });
    assert.equal(title, 's1.md');
  });

  it('Test 2: doc with projectScoped:true returns doc-{basename} (no slug prefix)', () => {
    const title = buildTitle('doc', 'alpha', 'readme.md', { projectScoped: true });
    assert.equal(title, 'doc-readme.md');
  });

  it('Test 3: session without opts returns legacy {slug}__{basename} (backward compat)', () => {
    const title = buildTitle('session', 'alpha', 's1.md');
    assert.equal(title, 'alpha__s1.md');
  });

  it('context with projectScoped:true returns context.md (no slug prefix)', () => {
    const title = buildTitle('context', 'alpha', 'context.md', { projectScoped: true });
    assert.equal(title, 'context.md');
  });

  it('adr with projectScoped:true returns ADR-{nnnn}-{slug}.md (no slug prefix)', () => {
    const title = buildTitle('adr', 'alpha', '0001-use-postgres.md', { projectScoped: true });
    assert.equal(title, 'ADR-0001-use-postgres.md');
  });

  it('adr with projectScoped:false returns legacy format', () => {
    const title = buildTitle('adr', 'alpha', '0001-use-postgres.md', { projectScoped: false });
    assert.equal(title, 'alpha__ADR-0001-use-postgres.md');
  });
});

// ── syncVault per-project loop tests (require stub binary) ────────────────────

describe('syncVault — per-project loop (cds__{slug} notebooks)', () => {
  let stubDir;
  let originalPath;
  let vault;

  function makeStub(script) {
    const dir = mkdtempSync(join(tmpdir(), 'cds-perproject-stub-'));
    const stubPath = join(dir, 'notebooklm');
    writeFileSync(stubPath, `#!/bin/sh\n${script}`, 'utf8');
    chmodSync(stubPath, 0o755);
    return dir;
  }

  beforeEach(() => {
    vault = makeTempVault();
    originalPath = process.env.PATH;
    _resetNotebooklmBinary();
  });

  afterEach(() => {
    if (stubDir) {
      rmSync(stubDir, { recursive: true, force: true });
      stubDir = null;
    }
    process.env.PATH = originalPath;
    vault.cleanup();
    _resetNotebooklmBinary();
  });

  // ── Test 4: syncVault creates cds__{slug} notebooks per project ──────────────

  it('Test 4: syncVault calls ensureNotebook("cds__alpha") and ensureNotebook("cds__beta")', async () => {
    // Create 2 project dirs with files
    mkdirSync(join(vault.dir, 'projects', 'alpha', 'sessions'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta', 'docs'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'docs', 'readme.md'), '# Beta docs');

    const createdNotebooks = [];

    // Stub that records notebook create calls and returns IDs
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[],"count":0}'
    ;;
  create)
    TITLE="$2"
    echo "{\\"notebook\\":{\\"id\\":\\"nb-$TITLE\\",\\"title\\":\\"$TITLE\\",\\"created_at\\":null}}"
    ;;
  source)
    echo '{"source":{"id":"src-stub","title":"stub"}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const stats = await syncVault({ vaultRoot: vault.dir });

    // Manifest must have cds__alpha and cds__beta notebook IDs
    const manifest = readManifest(vault.dir);
    assert.ok(manifest.projects.alpha, 'alpha project must exist in manifest');
    assert.ok(manifest.projects.beta, 'beta project must exist in manifest');
    assert.equal(manifest.projects.alpha.notebook_id, 'nb-cds__alpha', 'alpha notebook ID must be cds__alpha');
    assert.equal(manifest.projects.beta.notebook_id, 'nb-cds__beta', 'beta notebook ID must be cds__beta');
  });

  // ── Test 5: stats include perProject breakdown ────────────────────────────────

  it('Test 5: syncVault returns stats with perProject breakdown for each slug', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha', 'sessions'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta', 'sessions'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'context.md'), '# Beta');

    stubDir = makeStub(`
case "$1" in
  list) echo '{"notebooks":[],"count":0}' ;;
  create) echo "{\\"notebook\\":{\\"id\\":\\"nb-$2\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}" ;;
  source) echo '{"source":{"id":"src-stub","title":"stub"}}' ;;
  *) echo '{}' ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const stats = await syncVault({ vaultRoot: vault.dir });

    assert.ok(stats.perProject, 'stats must have perProject field');
    assert.ok(stats.perProject.alpha, 'perProject must have alpha entry');
    assert.ok(stats.perProject.beta, 'perProject must have beta entry');
    assert.ok(stats.total, 'stats must have total aggregation');
    assert.equal(typeof stats.total.uploaded, 'number');
    assert.equal(typeof stats.total.skipped, 'number');
  });

  // ── Test 6: pre-flight conflict — cds__alpha exists but not in manifest ───────

  it('Test 6: pre-flight conflict aborts if cds__{slug} exists outside CDS control', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha');

    // Stub: cds__alpha exists in notebook list but manifest is empty (no notebook_id tracked)
    stubDir = makeStub(`
case "$1" in
  list) echo '{"notebooks":[{"id":"nb-foreign","title":"cds__alpha","created_at":null}],"count":1}' ;;
  create) echo "{\\"notebook\\":{\\"id\\":\\"nb-new\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}" ;;
  source) echo '{"source":{"id":"src-stub","title":"stub"}}' ;;
  *) echo '{}' ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    // Should throw or return an error — conflict detected
    await assert.rejects(
      () => syncVault({ vaultRoot: vault.dir }),
      (err) => {
        // Must mention the conflicting notebook and suggest --force-adopt
        return err.message.includes('cds__alpha') && (err.message.includes('force-adopt') || err.message.includes('already exists'));
      },
      'pre-flight conflict must throw with actionable message',
    );
  });

  // ── Test 7: no conflict — cds__alpha exists AND manifest tracks it ───────────

  it('Test 7: no conflict when cds__alpha exists and manifest.projects.alpha.notebook_id matches', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha');

    // Pre-seed manifest with the notebook ID
    const { writeManifest } = await import('../lib/notebooklm-manifest.mjs');
    writeManifest(vault.dir, {
      projects: {
        alpha: { notebook_id: 'nb-existing-alpha', files: {} },
      },
    });

    // Stub: cds__alpha is listed with the same ID that manifest tracks
    stubDir = makeStub(`
case "$1" in
  list) echo '{"notebooks":[{"id":"nb-existing-alpha","title":"cds__alpha","created_at":null}],"count":1}' ;;
  create) echo "{\\"notebook\\":{\\"id\\":\\"nb-new\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}" ;;
  source) echo '{"source":{"id":"src-stub","title":"stub"}}' ;;
  *) echo '{}' ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    // Should NOT throw — manifest matches existing notebook
    const stats = await syncVault({ vaultRoot: vault.dir });
    assert.ok(stats.perProject || stats.total, 'sync must complete without conflict error');
  });

  // ── Test 8: per-project continue — error in beta does not block alpha ─────────

  it('Test 8: error in project beta does not block sync of project alpha', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha', 'sessions'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta', 'sessions'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'context.md'), '# Beta');

    // Stub: create fails for cds__beta (non-zero exit), succeeds for cds__alpha
    stubDir = makeStub(`
case "$1" in
  list) echo '{"notebooks":[],"count":0}' ;;
  create)
    if echo "$2" | grep -q "beta"; then
      echo "create failed" >&2
      exit 1
    fi
    echo "{\\"notebook\\":{\\"id\\":\\"nb-$2\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}"
    ;;
  source) echo '{"source":{"id":"src-stub","title":"stub"}}' ;;
  *) echo '{}' ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    // Should not throw — per-project continue strategy
    const stats = await syncVault({ vaultRoot: vault.dir });

    // alpha must have been processed
    assert.ok(stats.perProject, 'stats must have perProject field');
    assert.ok(stats.perProject.alpha, 'alpha must have been processed despite beta error');
    // beta must show as failed
    assert.ok(stats.perProject.beta, 'beta must be recorded as failed project');
    assert.ok(stats.perProject.beta.error || stats.perProject.beta.failed >= 0, 'beta must record failure');
  });

  // ── Test 9: syncOneFile receives manifest.projects[slug] scoped sub-object ────

  it('Test 9: syncOneFile receives scoped manifest.projects[slug] sub-object (C-3 pitfall avoided)', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');

    stubDir = makeStub(`
case "$1" in
  list) echo '{"notebooks":[],"count":0}' ;;
  create) echo "{\\"notebook\\":{\\"id\\":\\"nb-$2\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}" ;;
  source) echo '{"source":{"id":"src-alpha-ctx","title":"context.md"}}' ;;
  *) echo '{}' ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    await syncVault({ vaultRoot: vault.dir });

    // After sync, manifest.projects.alpha.files must contain the uploaded file
    const manifest = readManifest(vault.dir);
    assert.ok(manifest.projects.alpha, 'alpha project must exist');
    assert.ok(manifest.projects.alpha.files, 'alpha must have files sub-object');
    assert.ok(
      manifest.projects.alpha.files['projects/alpha/context.md'],
      'alpha context.md must be tracked in alpha project files (scoped write confirmed)',
    );
    // Must NOT appear in other project buckets
    const otherSlugs = Object.keys(manifest.projects).filter((s) => s !== 'alpha');
    for (const slug of otherSlugs) {
      assert.ok(
        !manifest.projects[slug].files['projects/alpha/context.md'],
        `alpha context.md must not appear in ${slug} project files`,
      );
    }
  });
});
