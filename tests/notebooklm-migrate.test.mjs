/**
 * tests/notebooklm-migrate.test.mjs — Full fixture matrix for migrateVault().
 *
 * Uses inline PATH-stub pattern (Phase 7) — NOT withStubBinary (synchronous,
 * unsafe for async migrateVault calls per Pitfall 4 in 08-RESEARCH.md).
 *
 * Covers TEST-03: empty notebook, 27-source real shape, dry-run no-mutation,
 * happy-path execute, partial failure, duplicate target, orphan source,
 * resume after interrupt, Phase B CliError swallow.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  rmSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { makeTempVault } from './helpers/fixtures.mjs';
import { _resetBinaryCache as _resetNotebooklmBinary } from '../lib/notebooklm.mjs';
import { migrateVault } from '../lib/notebooklm-migrate.mjs';

// ── Inline stub helper (Phase 7 pattern) ────────────────────────────────────

function makeStub(script) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-migrate-stub-'));
  const stubPath = join(dir, 'notebooklm');
  writeFileSync(stubPath, `#!/bin/sh\n${script}`, 'utf8');
  chmodSync(stubPath, 0o755);
  return dir;
}

// ── Shared notebook ID used across tests ────────────────────────────────────

const SHARED_NB_ID = 'shared-nb-001';
const SHARED_NB_NAME = 'cds-vault-test';

// ── Test suite ───────────────────────────────────────────────────────────────

describe('migrateVault — fixture matrix', () => {
  let stubDir;
  let originalPath;
  let vault;

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

  // ── Test 1: Empty shared notebook ────────────────────────────────────────

  it('Test 1: empty notebook returns empty sources without crashing', async () => {
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        echo '{"sources":[]}'
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: true,
      delayMs: 0,
    });

    assert.equal(result.dryRun, true, 'should be dry-run');
    assert.equal(result.sources.length, 0, 'should have 0 sources');
    assert.equal(result.orphans, 0, 'should have 0 orphans');
    assert.equal(result.phaseAFailures, 0, 'should have 0 Phase A failures');
  });

  // ── Test 2: 27-source real-shape fixture, dry-run grouping ───────────────

  it('Test 2: 27-source fixture grouped correctly by project in dry-run', async () => {
    // 27 sources: 21 for claude-dev-stack, 1 each for 6 others
    const slugs = ['claude-dev-stack', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    const sources = [];
    // 21 for claude-dev-stack
    for (let i = 1; i <= 21; i++) {
      sources.push({ id: `src-cds-${i}`, title: `claude-dev-stack__context-${i}.md`, status: 'active' });
    }
    // 1 each for 6 other slugs
    for (const slug of slugs.slice(1)) {
      sources.push({ id: `src-${slug}-1`, title: `${slug}__context.md`, status: 'active' });
    }

    const sourcesJson = JSON.stringify(sources);

    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        echo '{"sources":${sourcesJson}}'
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: true,
      delayMs: 0,
    });

    assert.equal(result.dryRun, true, 'should be dry-run');
    assert.equal(result.sources.length, 27, 'should list all 27 sources');
    assert.equal(result.orphans, 0, 'no orphans expected');

    const cdsEntries = result.sources.filter((s) => s.slug === 'claude-dev-stack');
    assert.equal(cdsEntries.length, 21, 'should group 21 sources under claude-dev-stack');

    const otherProjects = slugs.slice(1);
    for (const slug of otherProjects) {
      const count = result.sources.filter((s) => s.slug === slug).length;
      assert.equal(count, 1, `should have 1 source for slug ${slug}`);
    }
  });

  // ── Test 3: Dry-run does NOT mutate — no migration log created ────────────

  it('Test 3: dry-run does not create migration log file', async () => {
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        echo '{"sources":[{"id":"src-1","title":"myproject__readme.md","status":"active"}]}'
        ;;
      add)
        echo '{"source":{"id":"new-src","title":"readme.md"}}'
        ;;
      delete-by-title)
        echo "Deleted source: src-1"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-new","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: true,
      delayMs: 0,
    });

    const logPath = join(vault.dir, '.notebooklm-migration.json');
    assert.equal(existsSync(logPath), false, 'migration log must NOT exist after dry-run');
  });

  // ── Test 4: Happy-path execute: 3 sources, 2 projects, all deleted ────────

  it('Test 4: happy-path execute uploads, verifies, and deletes all 3 sources', async () => {
    // Create vault project dirs with matching files so _walkProjectFiles can find them
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'notes.md'), '# Alpha notes');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'context.md'), '# Beta context');

    // Sources in shared notebook match the vault files
    const sharedSources = [
      { id: 'src-a1', title: 'alpha__context.md', status: 'active' },
      { id: 'src-a2', title: 'alpha__notes.md', status: 'active' },
      { id: 'src-b1', title: 'beta__context.md', status: 'active' },
    ];

    let uploadCount = 0;
    let deleteCount = 0;

    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null},{"id":"nb-alpha","title":"cds__alpha","created_at":null},{"id":"nb-beta","title":"cds__beta","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"},{"id":"src-a2","title":"alpha__notes.md","status":"active"},{"id":"src-b1","title":"beta__context.md","status":"active"}]}'
            ;;
          nb-alpha)
            # After upload, source appears in target
            echo '{"sources":[{"id":"new-a1","title":"context.md","status":"active"},{"id":"new-a2","title":"notes.md","status":"active"}]}'
            ;;
          nb-beta)
            echo '{"sources":[{"id":"new-b1","title":"context.md","status":"active"}]}'
            ;;
          *)
            echo '{"sources":[]}'
            ;;
        esac
        ;;
      add)
        # source add <path> -n <notebookId> --json
        echo '{"source":{"id":"new-src-stub","title":"stub"}}'
        ;;
      delete-by-title)
        # source delete-by-title <title> -n <notebookId> -y
        TITLE="$3"
        echo "Deleted source: src-stub-$TITLE"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    NBNAME="$2"
    echo '{"notebook":{"id":"nb-'"$NBNAME"'","title":"'"$NBNAME"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.dryRun, false, 'should not be dry-run');
    assert.equal(result.phaseAFailures, 0, 'should have 0 Phase A failures');
    assert.equal(result.phaseBSkipped, false, 'Phase B should not be skipped');

    // All 3 sources should be marked deleted in the log
    const logPath = join(vault.dir, '.notebooklm-migration.json');
    assert.ok(existsSync(logPath), 'migration log must exist after execute');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const deletedEntries = log.sources.filter((s) => s.status === 'deleted');
    assert.equal(deletedEntries.length, 3, 'all 3 sources should be marked deleted');
  });

  // ── Test 5: Partial failure — Phase B skipped ────────────────────────────

  it('Test 5: partial Phase A failure causes Phase B to be skipped', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'context.md'), '# Beta context');

    // alpha upload fails (non-zero exit), beta succeeds
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"},{"id":"src-b1","title":"beta__context.md","status":"active"}]}'
            ;;
          *)
            echo '{"sources":[]}'
            ;;
        esac
        ;;
      add)
        # Fail for alpha upload (title matches context.md in tmpdir path)
        UPLOADPATH="$3"
        case "$UPLOADPATH" in
          *alpha*)
            echo '{"error":true,"code":"UPLOAD_FAILED","message":"simulated upload failure"}' >&2
            exit 1
            ;;
          *)
            echo '{"source":{"id":"new-src","title":"stub"}}'
            ;;
        esac
        ;;
      delete-by-title)
        echo "Deleted source: stub-id"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.phaseBSkipped, true, 'Phase B must be skipped when Phase A has failures');
    assert.ok(result.phaseAFailures >= 1, 'must have at least 1 Phase A failure');

    const logPath = join(vault.dir, '.notebooklm-migration.json');
    assert.ok(existsSync(logPath), 'migration log must exist');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const failedEntries = log.sources.filter((s) => s.status === 'failed');
    assert.ok(failedEntries.length >= 1, 'at least 1 source must be marked failed');

    // Shared notebook should be untouched — no deleted entries
    const deletedEntries = log.sources.filter((s) => s.status === 'deleted');
    assert.equal(deletedEntries.length, 0, 'no sources should be deleted when Phase B is skipped');
  });

  // ── Test 6: Duplicate target — skip upload, mark verified immediately ─────

  it('Test 6: source already in target notebook is marked verified without re-upload', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');

    // Target notebook already contains the source
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"}]}'
            ;;
          *)
            # Target already has this title
            echo '{"sources":[{"id":"existing-src","title":"context.md","status":"active"}]}'
            ;;
        esac
        ;;
      add)
        # Should NOT be called — duplicate detected before upload
        echo '{"source":{"id":"should-not-be-called","title":"error"}}' >&2
        exit 1
        ;;
      delete-by-title)
        echo "Deleted source: src-a1"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.phaseAFailures, 0, 'duplicate should not count as failure');
    assert.equal(result.phaseBSkipped, false, 'Phase B should proceed when all verified');

    const logPath = join(vault.dir, '.notebooklm-migration.json');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const verifiedOrDeleted = log.sources.filter(
      (s) => s.status === 'verified' || s.status === 'deleted'
    );
    assert.ok(verifiedOrDeleted.length >= 1, 'source should reach verified/deleted state');
  });

  // ── Test 7: Orphan source — no __ prefix, marked skipped_orphan ──────────

  it('Test 7: source without __ prefix gets status skipped_orphan and does not block Phase B', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');

    // Mix: one valid source, one orphan (no __ prefix)
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"},{"id":"src-orphan","title":"readme.md","status":"active"}]}'
            ;;
          *)
            echo '{"sources":[{"id":"uploaded-src","title":"context.md","status":"active"}]}'
            ;;
        esac
        ;;
      add)
        echo '{"source":{"id":"new-src","title":"context.md"}}'
        ;;
      delete-by-title)
        echo "Deleted source: src-a1"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.orphans, 1, 'should count 1 orphan');

    const orphanEntry = result.sources.find((s) => s.title === 'readme.md');
    assert.ok(orphanEntry, 'orphan entry must be in sources list');
    assert.equal(orphanEntry.status, 'skipped_orphan', 'orphan must have skipped_orphan status');

    // Phase B should still run for the valid source
    assert.equal(result.phaseBSkipped, false, 'Phase B should not be skipped due to orphan');
    assert.equal(result.phaseAFailures, 0, 'orphan does not count as Phase A failure');
  });

  // ── Test 8: Resume after interrupt — pre-existing verified entry skipped ──

  it('Test 8: pre-existing verified entry in migration log is skipped on re-run', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    mkdirSync(join(vault.dir, 'projects', 'beta'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');
    writeFileSync(join(vault.dir, 'projects', 'beta', 'context.md'), '# Beta context');

    // Pre-write migration log with src-a1 already verified
    const existingLog = {
      sources: [
        {
          source_id: 'src-a1',
          title: 'alpha__context.md',
          old_notebook_id: SHARED_NB_ID,
          new_notebook_id: 'nb-alpha',
          target_project: 'cds__alpha',
          slug: 'alpha',
          localTitle: 'context.md',
          status: 'verified',
        },
      ],
    };
    writeFileSync(
      join(vault.dir, '.notebooklm-migration.json'),
      JSON.stringify(existingLog, null, 2),
      'utf8'
    );

    let addCallCount = 0;

    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"},{"id":"src-b1","title":"beta__context.md","status":"active"}]}'
            ;;
          *)
            echo '{"sources":[{"id":"uploaded-b1","title":"context.md","status":"active"}]}'
            ;;
        esac
        ;;
      add)
        echo '{"source":{"id":"new-src","title":"context.md"}}'
        ;;
      delete-by-title)
        echo "Deleted source: stub-id"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.phaseAFailures, 0, 'should have 0 failures');
    assert.equal(result.phaseBSkipped, false, 'Phase B should proceed');

    // Check that both sources end up deleted
    const logPath = join(vault.dir, '.notebooklm-migration.json');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const deletedEntries = log.sources.filter((s) => s.status === 'deleted');
    assert.equal(deletedEntries.length, 2, 'both sources should be deleted after resume');
  });

  // ── Test 10: ADR path resolution — slug__ADR-NNNN-slug.md resolves to disk ──

  it('Test 10: ADR-prefixed source title resolves to disk path without file_not_found', async () => {
    // Create vault project dir with a decisions/ file (ADR format: NNNN-slug.md)
    mkdirSync(join(vault.dir, 'projects', 'myproject', 'decisions'), { recursive: true });
    writeFileSync(
      join(vault.dir, 'projects', 'myproject', 'decisions', '0001-auth.md'),
      '# ADR 0001: Auth'
    );

    // Shared notebook has source with ADR-prefixed title (as buildTitle generates).
    // title: 'myproject__ADR-0001-auth.md' — parseSourceTitle yields localTitle='ADR-0001-auth.md'
    // buildFilePathMap must resolve 'myproject/ADR-0001-auth.md' to the disk file.
    //
    // Counter file technique: target notebook returns empty on first list call (duplicate
    // check), then returns the uploaded source on the second call (verify). This forces the
    // code to reach the disk-path lookup (line 307), where FIX-01 is needed.
    const counterFile = join(vault.dir, '.stub-counter');
    writeFileSync(counterFile, '0');

    stubDir = makeStub(`
COUNTER_FILE="${counterFile}"
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-adr1","title":"myproject__ADR-0001-auth.md","status":"active"}]}'
            ;;
          *)
            # First list call on target = duplicate check (returns empty so disk lookup runs).
            # Second list call on target = verify after upload (returns the uploaded source).
            COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
            COUNT=$((COUNT + 1))
            echo "$COUNT" > "$COUNTER_FILE"
            if [ "$COUNT" -le 1 ]; then
              echo '{"sources":[]}'
            else
              echo '{"sources":[{"id":"uploaded-adr1","title":"ADR-0001-auth.md","status":"active"}]}'
            fi
            ;;
        esac
        ;;
      add)
        echo '{"source":{"id":"new-adr","title":"ADR-0001-auth.md"}}'
        ;;
      delete-by-title)
        echo "Deleted source: src-adr1"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    // ADR source must NOT fail with file_not_found — it should resolve and be verified/deleted
    assert.equal(result.phaseAFailures, 0, 'ADR source must resolve to disk path without file_not_found failure');
    assert.equal(result.phaseBSkipped, false, 'Phase B should run after successful Phase A');

    const logPath = join(vault.dir, '.notebooklm-migration.json');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const adrEntry = log.sources.find((s) => s.source_id === 'src-adr1');
    assert.ok(adrEntry, 'ADR source entry must be in migration log');
    assert.notEqual(adrEntry.status, 'failed', `ADR entry must not fail; got status: ${adrEntry.status}`);
    assert.equal(adrEntry.status, 'deleted', `ADR entry must be deleted; got: ${adrEntry.status}`);
  });

  // ── Test 9: Phase B swallows CliError on already-deleted ─────────────────

  it('Test 9: Phase B swallows NotebooklmCliError on delete and marks entry deleted', async () => {
    mkdirSync(join(vault.dir, 'projects', 'alpha'), { recursive: true });
    writeFileSync(join(vault.dir, 'projects', 'alpha', 'context.md'), '# Alpha context');

    // delete-by-title returns unexpected output → triggers NotebooklmCliError
    stubDir = makeStub(`
case "$1" in
  list)
    echo '{"notebooks":[{"id":"${SHARED_NB_ID}","title":"${SHARED_NB_NAME}","created_at":null}]}'
    ;;
  source)
    case "$2" in
      list)
        NB="$4"
        case "$NB" in
          ${SHARED_NB_ID})
            echo '{"sources":[{"id":"src-a1","title":"alpha__context.md","status":"active"}]}'
            ;;
          *)
            echo '{"sources":[{"id":"uploaded-src","title":"context.md","status":"active"}]}'
            ;;
        esac
        ;;
      add)
        echo '{"source":{"id":"new-src","title":"context.md"}}'
        ;;
      delete-by-title)
        # Output does NOT match "Deleted source: <id>" — triggers CliError parse failure
        echo "Source not found or already deleted"
        ;;
      *)
        echo '{}'
        ;;
    esac
    ;;
  create)
    echo '{"notebook":{"id":"nb-'"$2"'","title":"'"$2"'","created_at":null}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`);
    process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

    // Should NOT throw — Phase B swallows CliError
    const result = await migrateVault({
      vaultRoot: vault.dir,
      sharedNotebookName: SHARED_NB_NAME,
      dryRun: false,
      delayMs: 0,
    });

    assert.equal(result.phaseAFailures, 0, 'Phase A should succeed');
    assert.equal(result.phaseBSkipped, false, 'Phase B should run');

    // Entry should be marked deleted even though delete threw CliError
    const logPath = join(vault.dir, '.notebooklm-migration.json');
    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    const deletedEntries = log.sources.filter((s) => s.status === 'deleted');
    assert.equal(deletedEntries.length, 1, 'source should be marked deleted despite CliError swallow');
  });
});
