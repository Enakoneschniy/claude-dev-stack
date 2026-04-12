/**
 * lib/notebooklm-migrate.mjs — Two-phase-commit migration orchestrator.
 *
 * Relocates sources from the shared `claude-dev-stack-vault` notebook into
 * per-project `cds__{slug}` notebooks. Dry-run by default (D-07). Uses
 * per-source granularity (D-01), verification by title match (D-02), and
 * Phase B gate requiring zero Phase A failures (D-03).
 *
 * Migration log at ~/vault/.notebooklm-migration.json written atomically
 * after every state transition (D-06) via atomicWriteJson from shared.mjs.
 *
 * Security: T-08-01 atomic writes, T-08-02 title truncation, T-08-03 rate
 * limit handling, T-08-04 explicit --execute opt-in, T-08-05 Phase B gate.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { c, ok, fail, warn, info, atomicWriteJson } from './shared.mjs';
import { findVault } from './projects.mjs';
import {
  listNotebooks,
  listSources,
  uploadSource,
  deleteSourceByTitle,
  NotebooklmCliError,
  NotebooklmRateLimitError,
} from './notebooklm.mjs';
import { _ensureNotebook, _walkProjectFiles } from './notebooklm-sync.mjs';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SHARED_NOTEBOOK = 'claude-dev-stack-vault';
const DEFAULT_DELAY_MS = 1500;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a source title like `myproject__context.md` into { slug, localTitle }.
 * Returns null if no `__` separator is found (orphan source).
 *
 * @param {string} title
 * @returns {{ slug: string, localTitle: string } | null}
 */
function parseSourceTitle(title) {
  const idx = title.indexOf('__');
  if (idx === -1) return null;
  return {
    slug: title.slice(0, idx),
    localTitle: title.slice(idx + 2),
  };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} vaultRoot
 * @returns {string}
 */
function migrationLogPath(vaultRoot) {
  return join(vaultRoot, '.notebooklm-migration.json');
}

/**
 * Read existing migration log or return an empty one.
 *
 * @param {string} vaultRoot
 * @returns {{ sources: object[] }}
 */
function readMigrationLog(vaultRoot) {
  const logPath = migrationLogPath(vaultRoot);
  if (!existsSync(logPath)) return { sources: [] };
  try {
    return JSON.parse(readFileSync(logPath, 'utf8'));
  } catch {
    return { sources: [] };
  }
}

/**
 * Write migration log atomically.
 *
 * @param {string} vaultRoot
 * @param {{ sources: object[] }} log
 */
function writeMigrationLog(vaultRoot, log) {
  atomicWriteJson(migrationLogPath(vaultRoot), log);
}

/**
 * Build a Map<'{slug}/{basename}', absPath> from vault files for disk-path resolution.
 *
 * @param {string} vaultRoot
 * @returns {Promise<Map<string, string>>}
 */
async function buildFilePathMap(vaultRoot) {
  const files = await _walkProjectFiles(vaultRoot);
  const map = new Map();
  for (const f of files) {
    // Key matches how the title is structured: slug__localTitle → slug/localTitle
    // localTitle is the basename portion after the __ separator in the source title.
    // For session/context/doc categories, buildTitle produces slug__<basename>.
    // We key by slug/basename so we can look up by parseSourceTitle result.
    map.set(`${f.projectSlug}/${f.basename}`, f.absPath);
    // Also store with the full title localTitle in case category prefixes are used
    // (e.g. doc- prefix). Use the title field minus the slug__ prefix.
    const titleIdx = (f.title || '').indexOf('__');
    if (titleIdx !== -1) {
      const localTitle = f.title.slice(titleIdx + 2);
      map.set(`${f.projectSlug}/${localTitle}`, f.absPath);
    }
  }
  return map;
}

/**
 * Truncate a title for safe display (T-08-02).
 *
 * @param {string} title
 * @returns {string}
 */
function truncateTitle(title) {
  if (!title) return '';
  return title.length > 200 ? `${title.slice(0, 200)}\u2026` : title;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Two-phase-commit vault migration.
 *
 * Phase A: For each non-orphan source in the shared notebook, upload to the
 *          target per-project notebook and verify by title match.
 * Phase B: Only if zero Phase A failures — delete all verified sources from
 *          the shared notebook.
 *
 * @param {object} opts
 * @param {string}  [opts.vaultRoot]           - defaults to findVault()
 * @param {string}  [opts.sharedNotebookName]  - defaults to 'claude-dev-stack-vault'
 * @param {boolean} [opts.dryRun]              - defaults to true (D-07)
 * @param {number}  [opts.delayMs]             - defaults to 1500 (D-08)
 * @returns {Promise<{
 *   dryRun: boolean,
 *   sources: object[],
 *   phaseAFailures: number,
 *   phaseBSkipped: boolean,
 *   orphans: number,
 * }>}
 */
export async function migrateVault(opts = {}) {
  const vaultRoot = opts.vaultRoot ?? findVault();
  const sharedNotebookName = opts.sharedNotebookName ?? DEFAULT_SHARED_NOTEBOOK;
  const dryRun = opts.dryRun !== false; // default true (D-07)
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  if (!vaultRoot) {
    fail('Vault not found — cannot migrate');
    throw new Error('Vault not found');
  }

  // Step 1: Resolve shared notebook ID
  const allNotebooks = await listNotebooks();
  const sharedNotebook = allNotebooks.find((nb) => nb.title === sharedNotebookName);
  if (!sharedNotebook) {
    fail(`Shared notebook "${sharedNotebookName}" not found`);
    throw new Error(`Shared notebook "${sharedNotebookName}" not found`);
  }
  const sharedNotebookId = sharedNotebook.id;

  // Step 2: List sources from shared notebook
  const rawSources = await listSources(sharedNotebookId);

  // Step 3: Parse and classify sources
  const classified = rawSources.map((s) => {
    const parsed = parseSourceTitle(s.title);
    return {
      source_id: s.id,
      title: s.title,
      old_notebook_id: sharedNotebookId,
      new_notebook_id: null,
      target_project: parsed ? `cds__${parsed.slug}` : null,
      slug: parsed ? parsed.slug : null,
      localTitle: parsed ? parsed.localTitle : null,
      status: parsed ? 'pending' : 'skipped_orphan',
    };
  });

  const orphans = classified.filter((s) => s.status === 'skipped_orphan');
  const toMigrate = classified.filter((s) => s.status !== 'skipped_orphan');

  // ── Dry-run mode (D-07) ──────────────────────────────────────────────────

  if (dryRun) {
    // Group by target project for display
    const byProject = new Map();
    for (const s of toMigrate) {
      const key = s.target_project;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(s.localTitle);
    }

    console.log('');
    console.log(`  ${c.bold}NotebookLM Migration — Dry Run${c.reset}`);
    console.log('');

    for (const [project, titles] of byProject) {
      const displayTitles = titles.map(truncateTitle).join(', ');
      info(`${project} (${titles.length} source${titles.length === 1 ? '' : 's'}): ${displayTitles}`);
    }

    if (orphans.length > 0) {
      warn(`Orphans (no project prefix, will be skipped): ${orphans.length}`);
    }

    const totalProjects = byProject.size;
    info(`Total: ${toMigrate.length} sources -> ${totalProjects} project${totalProjects === 1 ? '' : 's'}, ${orphans.length} orphan${orphans.length === 1 ? '' : 's'}`);
    info('Run with --execute to migrate');
    console.log('');

    return {
      dryRun: true,
      sources: classified,
      phaseAFailures: 0,
      phaseBSkipped: false,
      orphans: orphans.length,
    };
  }

  // ── Execute mode ────────────────────────────────────────────────────────

  // Step 4: Build disk-path lookup map
  const filePathMap = await buildFilePathMap(vaultRoot);

  // Step 6: Load/create migration log and build resume map
  const log = readMigrationLog(vaultRoot);
  const logMap = new Map();
  for (const entry of log.sources) {
    logMap.set(entry.source_id, entry);
  }

  // Merge classified into log — add new entries, preserve existing state
  for (const s of classified) {
    if (!logMap.has(s.source_id)) {
      logMap.set(s.source_id, { ...s });
      log.sources.push(logMap.get(s.source_id));
    }
  }
  // Reconcile: update orphan entries that are new in this run
  for (const entry of log.sources) {
    const classified_ = classified.find((c_) => c_.source_id === entry.source_id);
    if (classified_ && entry.status === 'pending' && classified_.status === 'skipped_orphan') {
      entry.status = 'skipped_orphan';
    }
  }
  writeMigrationLog(vaultRoot, log);

  // Per-slug notebook ID cache (call _ensureNotebook once per project)
  const notebookIdCache = new Map();

  // Step 7: Phase A — per-source upload+verify
  console.log('');
  console.log(`  ${c.bold}Phase A: Upload & verify${c.reset}`);
  console.log('');

  const nonOrphanEntries = log.sources.filter((e) => e.status !== 'skipped_orphan');
  const phaseATotal = nonOrphanEntries.length;
  let phaseADone = 0;

  for (const entry of nonOrphanEntries) {
    phaseADone++;

    // Step 7a: Resume check
    if (entry.status === 'verified' || entry.status === 'deleted') {
      info(`[${phaseADone}/${phaseATotal}] skip (${entry.status}): ${truncateTitle(entry.title)}`);
      continue;
    }

    const { slug, localTitle } = entry;

    // Ensure target notebook ID (cached per slug)
    if (!notebookIdCache.has(slug)) {
      const targetId = await _ensureNotebook(`cds__${slug}`);
      notebookIdCache.set(slug, targetId);
      entry.new_notebook_id = targetId;
    }
    const targetNotebookId = notebookIdCache.get(slug);
    entry.new_notebook_id = targetNotebookId;

    // Step 7c: Duplicate check (D-05)
    const targetSources = await listSources(targetNotebookId);
    const alreadyExists = targetSources.find((s) => s.title === localTitle);
    if (alreadyExists) {
      info(`[${phaseADone}/${phaseATotal}] already in target (verified): ${truncateTitle(entry.title)}`);
      entry.status = 'verified';
      writeMigrationLog(vaultRoot, log);
      await sleep(delayMs);
      continue;
    }

    // Step 7d: Resolve disk path
    const diskPath = filePathMap.get(`${slug}/${localTitle}`);
    if (!diskPath) {
      warn(`[${phaseADone}/${phaseATotal}] file not found on disk: ${truncateTitle(entry.title)}`);
      entry.status = 'failed';
      entry.failReason = 'file_not_found_on_disk';
      writeMigrationLog(vaultRoot, log);
      await sleep(delayMs);
      continue;
    }

    // Step 7d: Upload
    info(`[${phaseADone}/${phaseATotal}] uploading: ${truncateTitle(entry.title)}`);
    try {
      await uploadSource(targetNotebookId, diskPath, { title: localTitle });
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError) throw err;
      warn(`[${phaseADone}/${phaseATotal}] upload failed: ${truncateTitle(String(err.message))}`);
      entry.status = 'failed';
      entry.failReason = String(err.message).slice(0, 200);
      writeMigrationLog(vaultRoot, log);
      await sleep(delayMs);
      continue;
    }

    // Step 7e: Verify by title match (D-02)
    await sleep(delayMs);
    const verifiedSources = await listSources(targetNotebookId);
    const found = verifiedSources.find((s) => s.title === localTitle);
    if (found) {
      ok(`[${phaseADone}/${phaseATotal}] verified: ${truncateTitle(entry.title)}`);
      entry.status = 'verified';
    } else {
      warn(`[${phaseADone}/${phaseATotal}] verify failed (title not found after upload): ${truncateTitle(entry.title)}`);
      entry.status = 'failed';
      entry.failReason = 'title_not_found_after_upload';
    }

    // Step 7f: Write log after each state transition (D-06)
    writeMigrationLog(vaultRoot, log);
    await sleep(delayMs);
  }

  // Step 8: Phase B gate (D-03)
  const phaseAFailures = log.sources.filter((e) => e.status === 'failed').length;
  // skipped_orphan does NOT count as failure
  let phaseBSkipped = false;

  if (phaseAFailures > 0) {
    warn(`Phase A had ${phaseAFailures} failure(s) — Phase B skipped, shared notebook untouched`);
    phaseBSkipped = true;

    return {
      dryRun: false,
      sources: log.sources,
      phaseAFailures,
      phaseBSkipped: true,
      orphans: orphans.length,
    };
  }

  // Step 9: Phase B — delete from shared notebook (D-03)
  const verifiedEntries = log.sources.filter((e) => e.status === 'verified');

  if (verifiedEntries.length === 0) {
    ok('No verified sources to delete from shared notebook');
    return {
      dryRun: false,
      sources: log.sources,
      phaseAFailures: 0,
      phaseBSkipped: false,
      orphans: orphans.length,
    };
  }

  console.log('');
  console.log(`  ${c.bold}Phase B: Delete from shared notebook${c.reset}`);
  console.log('');

  const phaseBTotal = verifiedEntries.length;
  let phaseBDone = 0;

  for (const entry of verifiedEntries) {
    phaseBDone++;
    info(`[${phaseBDone}/${phaseBTotal}] deleting: ${truncateTitle(entry.title)}`);

    try {
      await deleteSourceByTitle(sharedNotebookId, entry.title);
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError) throw err;
      // Swallow NotebooklmCliError — source may already be gone (Pitfall 5)
      if (err instanceof NotebooklmCliError) {
        info(`[${phaseBDone}/${phaseBTotal}] already deleted or not found: ${truncateTitle(entry.title)}`);
      } else {
        throw err;
      }
    }

    // Step 9b: Update status to deleted and write log
    entry.status = 'deleted';
    writeMigrationLog(vaultRoot, log);
    await sleep(delayMs);
  }

  ok(`Migration complete: ${phaseBDone} source${phaseBDone === 1 ? '' : 's'} migrated`);
  console.log('');

  return {
    dryRun: false,
    sources: log.sources,
    phaseAFailures: 0,
    phaseBSkipped: false,
    orphans: orphans.length,
  };
}
