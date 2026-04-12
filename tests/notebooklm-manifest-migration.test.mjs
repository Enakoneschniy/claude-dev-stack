import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readManifest,
  writeManifest,
  _isValidManifestShape,
  _migrateV1ToV2,
} from '../lib/notebooklm-manifest.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const v1manifest = {
  version: 1,
  generated_at: '2026-04-01T00:00:00.000Z',
  files: {
    'projects/alpha/context.md': { hash: 'a'.repeat(64), notebook_source_id: 'src-1', uploaded_at: '2026-04-01T00:00:00.000Z' },
    'projects/alpha/sessions/s1.md': { hash: 'b'.repeat(64), notebook_source_id: 'src-2', uploaded_at: '2026-04-01T00:00:00.000Z' },
    'projects/beta/docs/readme.md': { hash: 'c'.repeat(64), notebook_source_id: 'src-3', uploaded_at: '2026-04-01T00:00:00.000Z' },
  },
};

describe('lib/notebooklm-manifest.mjs — migration', () => {
  const tmpBase = join(tmpdir(), `claude-test-manifest-migration-${process.pid}`);
  const vaultRoot = join(tmpBase, 'vault');

  function resetFixture() {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(vaultRoot, { recursive: true });
  }

  function writeManifestFile(obj) {
    writeFileSync(join(vaultRoot, '.notebooklm-sync.json'), JSON.stringify(obj, null, 2), 'utf8');
  }

  function manifestFilePath() {
    return join(vaultRoot, '.notebooklm-sync.json');
  }

  beforeEach(() => {
    resetFixture();
  });

  after(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  // ── Tests 1-4: _isValidManifestShape returns structured {valid, reason} ─────

  describe('_isValidManifestShape', () => {
    it('returns {valid:true, reason:"ok"} for a valid v1 manifest shape (Test 1)', () => {
      const result = _isValidManifestShape({ version: 1, generated_at: '2026-04-01T00:00:00.000Z', files: {} });
      assert.deepEqual(result, { valid: true, reason: 'ok' });
    });

    it('returns {valid:false, reason:"malformed"} for null (Test 2)', () => {
      const result = _isValidManifestShape(null);
      assert.deepEqual(result, { valid: false, reason: 'malformed' });
    });

    it('returns {valid:false, reason:"unknown-version"} for version:99 (Test 3)', () => {
      const result = _isValidManifestShape({ version: 99, files: {} });
      assert.deepEqual(result, { valid: false, reason: 'unknown-version' });
    });

    it('returns {valid:false, reason:"malformed"} for v1 object without files field (Test 4)', () => {
      const result = _isValidManifestShape({ version: 1 });
      assert.deepEqual(result, { valid: false, reason: 'malformed' });
    });

    it('returns {valid:false, reason:"malformed"} for array input', () => {
      const result = _isValidManifestShape([]);
      assert.deepEqual(result, { valid: false, reason: 'malformed' });
    });
  });

  // ── Tests 5-7, 9: _migrateV1ToV2 migration machinery (D-04 gate) ────────────
  // These tests exercise migrateV1ToV2 directly. readManifest calls it when
  // MANIFEST_VERSION > 1 and parsed.version === 1 (Plan 02 activates this path).
  // Plan 01 validates the machinery exists and works correctly before the bump.

  describe('_migrateV1ToV2 migration machinery', () => {
    it('v1 manifest with 3 entries returns a v2 object with version:2 and all entries preserved (Test 5 — TEST-04)', () => {
      writeManifestFile(v1manifest);
      const mPath = manifestFilePath();
      const result = _migrateV1ToV2(vaultRoot, v1manifest, mPath);

      assert.equal(result.version, 2, 'version must be 2 after migration');
      assert.ok(result.projects, 'result must have a projects field');

      // alpha project: 2 files
      assert.ok(result.projects.alpha, 'alpha project bucket must exist');
      assert.ok(result.projects.alpha.files['projects/alpha/context.md'], 'alpha context.md must be preserved');
      assert.ok(result.projects.alpha.files['projects/alpha/sessions/s1.md'], 'alpha s1.md must be preserved');

      // beta project: 1 file
      assert.ok(result.projects.beta, 'beta project bucket must exist');
      assert.ok(result.projects.beta.files['projects/beta/docs/readme.md'], 'beta readme.md must be preserved');

      // 3 total entries preserved
      const totalFiles = Object.values(result.projects).reduce((sum, p) => sum + Object.keys(p.files).length, 0);
      assert.equal(totalFiles, 3, '3 v1 entries migrated with all entries preserved');
    });

    it('creates .v1.backup.json sibling containing original v1 data (Test 6)', () => {
      writeManifestFile(v1manifest);
      const mPath = manifestFilePath();
      _migrateV1ToV2(vaultRoot, v1manifest, mPath);

      const backupPath = join(vaultRoot, '.notebooklm-sync.v1.backup.json');
      assert.ok(existsSync(backupPath), '.v1.backup.json must exist after migration');

      const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
      assert.equal(backup.version, 1, 'backup must contain v1 data');
      assert.deepEqual(backup.files, v1manifest.files, 'backup files must match original v1 files');
    });

    it('entries outside projects/*/ go to _shared bucket (Test 7 — D-01)', () => {
      const v1withShared = {
        version: 1,
        generated_at: '2026-04-01T00:00:00.000Z',
        files: {
          'projects/alpha/context.md': { hash: 'a'.repeat(64), notebook_source_id: 'src-1', uploaded_at: '2026-04-01T00:00:00.000Z' },
          'meta/registry.md': { hash: 'd'.repeat(64), notebook_source_id: 'src-4', uploaded_at: '2026-04-01T00:00:00.000Z' },
          'shared/patterns.md': { hash: 'e'.repeat(64), notebook_source_id: 'src-5', uploaded_at: '2026-04-01T00:00:00.000Z' },
        },
      };
      writeManifestFile(v1withShared);
      const mPath = manifestFilePath();
      const result = _migrateV1ToV2(vaultRoot, v1withShared, mPath);

      assert.ok(result.projects._shared, '_shared bucket must exist for unmappable entries');
      assert.ok(result.projects._shared.files['meta/registry.md'], 'meta/registry.md must be in _shared');
      assert.ok(result.projects._shared.files['shared/patterns.md'], 'shared/patterns.md must be in _shared');
      assert.ok(result.projects.alpha, 'alpha project must exist separately');
    });

    it('second call does not re-create backup (idempotent backup write — Test 9)', () => {
      writeManifestFile(v1manifest);
      const mPath = manifestFilePath();

      // First call: creates backup
      _migrateV1ToV2(vaultRoot, v1manifest, mPath);
      const backupPath = join(vaultRoot, '.notebooklm-sync.v1.backup.json');
      assert.ok(existsSync(backupPath), 'backup created on first migration');

      // Overwrite backup with a marker to detect re-creation
      const markerContent = JSON.stringify({ marker: 'original-backup' }, null, 2) + '\n';
      writeFileSync(backupPath, markerContent, 'utf8');

      // Re-write the manifest as v1 again so migration can run again
      writeManifestFile(v1manifest);
      _migrateV1ToV2(vaultRoot, v1manifest, mPath);

      // Backup must be unchanged (not re-written)
      const backupAfter = readFileSync(backupPath, 'utf8');
      assert.equal(backupAfter, markerContent, 'backup must not be re-created on second migration call');
    });

    it('writes v2 manifest to disk atomically (no .tmp sibling left)', () => {
      writeManifestFile(v1manifest);
      const mPath = manifestFilePath();
      _migrateV1ToV2(vaultRoot, v1manifest, mPath);

      assert.ok(!existsSync(mPath + '.tmp'), 'no .tmp sibling after migration');
      const written = JSON.parse(readFileSync(mPath, 'utf8'));
      assert.equal(written.version, 2, 'disk file must be v2 after migration');
    });
  });

  // ── Test 8: version:99 manifest triggers corrupt recovery (not migration) ────

  describe('readManifest corrupt recovery for unknown versions', () => {
    it('readManifest on version:99 manifest triggers corrupt recovery (Test 8)', () => {
      writeManifestFile({ version: 99, files: {} });
      const result = readManifest(vaultRoot);

      // Returns empty manifest (v1 shape from emptyManifest)
      assert.equal(result.version, 1, 'corrupt recovery returns empty v1 manifest');
      assert.deepEqual(result.files, {});

      // .json file should be gone (renamed to .corrupt-*)
      assert.ok(!existsSync(join(vaultRoot, '.notebooklm-sync.json')), 'corrupt file must be renamed away');

      // No backup file created (not a migration)
      const backupPath = join(vaultRoot, '.notebooklm-sync.v1.backup.json');
      assert.ok(!existsSync(backupPath), 'no backup should be created for non-v1 unknown-version');
    });
  });

  // ── Test 10: writeManifest accepts v2 shape (projects field) ─────────────────

  describe('writeManifest v2 shape support', () => {
    it('writeManifest accepts v2 shape (projects field) without throwing (Test 10)', () => {
      const v2manifest = {
        version: 2,
        generated_at: new Date().toISOString(),
        projects: {
          alpha: {
            notebook_id: null,
            files: {
              'projects/alpha/context.md': { hash: 'a'.repeat(64), notebook_source_id: 'src-1', uploaded_at: '2026-04-01T00:00:00.000Z' },
            },
          },
        },
      };

      // Must not throw
      assert.doesNotThrow(() => writeManifest(vaultRoot, v2manifest));

      // Written file must be parseable and have the projects field
      const written = JSON.parse(readFileSync(join(vaultRoot, '.notebooklm-sync.json'), 'utf8'));
      assert.ok(written.projects, 'written manifest must have projects field');
      assert.ok(written.projects.alpha, 'alpha project must be present');
    });
  });
});
