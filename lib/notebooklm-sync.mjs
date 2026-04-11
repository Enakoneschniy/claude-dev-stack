/**
 * lib/notebooklm-sync.mjs — Vault -> NotebookLM sync pipeline.
 *
 * Walks ~/vault/projects/{project}/ content (sessions, decisions/ADRs, docs, context.md),
 * compares SHA-256 hashes against the Phase 3 manifest, and uploads changed files
 * to a shared NotebookLM notebook via the Phase 2 CLI wrapper.
 *
 * Single public export: syncVault(opts). All helpers are module-private.
 *
 * Per 04-CONTEXT.md (20 locked decisions D-01..D-20). See decisions for the
 * full rationale and canonical_refs for the files this module consumes.
 *
 * Scope note: this file is created by Plan 04-01 as a scaffold (exports + signatures +
 * buildTitle helper). Plan 04-02 implements walkProjectFiles, ensureNotebook,
 * syncOneFile, and the syncVault orchestration loop.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  createNotebook,
  uploadSource,
  deleteSourceByTitle,
  listNotebooks,
  NotebooklmCliError,
  NotebooklmRateLimitError,
} from './notebooklm.mjs';
import {
  readManifest,
  writeManifest,
  hashFile,
} from './notebooklm-manifest.mjs';
import { findVault } from './projects.mjs';
import { warn } from './shared.mjs';

// -- Filename builder (D-01..D-06) — single source of truth for round-tripping --

/**
 * Build a deterministic NotebookLM source title for a vault file.
 *
 * This function is the single source of truth for filename generation (D-06).
 * The same string MUST be used for both uploadSource() and deleteSourceByTitle()
 * -- any drift between upload title and delete title silently creates duplicate
 * sources in the notebook.
 *
 * Per 04-CONTEXT.md §A:
 *   D-01 sessions:  pass-through prefix          -> `${project}__${basename}`
 *   D-02 ADRs:      regex ^(\d{4})-(.+)\.md$     -> `${project}__ADR-${NNNN}-${slug}.md`
 *                   on mismatch: returns null (caller emits warn + skip)
 *   D-03 docs:      always prepend 'doc-'        -> `${project}__doc-${basename}`
 *   D-04 context:   fixed path                   -> `${project}__context.md`
 *
 * @param {'session'|'adr'|'doc'|'context'} category
 * @param {string} projectSlug  Trusted directory name (per D-05 -- no sanitization)
 * @param {string} basename     Filename only (no path), e.g. '2026-04-10-test.md'
 * @returns {string | null}     Returns null ONLY for ADR regex mismatch.
 */
export function buildTitle(category, projectSlug, basename) {
  if (typeof category !== 'string' || typeof projectSlug !== 'string' || typeof basename !== 'string') {
    throw new TypeError('buildTitle: category, projectSlug, basename must all be strings');
  }
  switch (category) {
    case 'session':
      // D-01 pass-through
      return `${projectSlug}__${basename}`;
    case 'adr': {
      // D-02 regex parse -- literal format from NBLM-08
      const match = basename.match(/^(\d{4})-(.+)\.md$/);
      if (!match) return null;
      const [, nnnn, slug] = match;
      return `${projectSlug}__ADR-${nnnn}-${slug}.md`;
    }
    case 'doc':
      // D-03 always-prefix
      return `${projectSlug}__doc-${basename}`;
    case 'context':
      // D-04 fixed
      return `${projectSlug}__context.md`;
    default:
      throw new Error(`buildTitle: unknown category '${category}'`);
  }
}

// -- Private helpers (implemented in Plan 04-02) --------------------------------

/**
 * Walk vault/projects/* and emit a deterministic ordered list of files to sync.
 *
 * Per D-11: context.md first, then decisions sorted, then docs sorted, then sessions sorted.
 * Projects sorted alphabetically across the vault.
 * Per D-17: inline readdirSync, trust directory name as project slug, exclude _template.
 * Per D-19: NEVER descend into vault/shared/ or vault/meta/; only .md files are emitted.
 * Per D-02: ADR files that don't match the NNNN- regex are skipped with a warn() call.
 *
 * @param {string} vaultRoot
 * @returns {Array<{absPath, vaultRelativePath, category, projectSlug, basename, title}>}
 *   category is one of 'context'|'adr'|'doc'|'session'.
 *   vaultRelativePath uses POSIX forward slashes on all platforms (research Option B).
 */
async function walkProjectFiles(vaultRoot) {
  const projectsRoot = join(vaultRoot, 'projects');
  if (!existsSync(projectsRoot)) return [];

  const entries = readdirSync(projectsRoot, { withFileTypes: true });
  const projectSlugs = entries
    .filter((e) => e.isDirectory() && e.name !== '_template')
    .map((e) => e.name)
    .sort(); // D-11 alphabetical across projects

  const results = [];

  for (const slug of projectSlugs) {
    const projectDir = join(projectsRoot, slug);

    // 1. context.md (D-11 first, D-18 optional)
    const contextAbs = join(projectDir, 'context.md');
    if (existsSync(contextAbs)) {
      results.push(makeEntry({ vaultRoot, absPath: contextAbs, category: 'context', projectSlug: slug, basename: 'context.md' }));
    }

    // 2. decisions/*.md (D-11 second, D-18 optional)
    collectCategoryFiles({ results, vaultRoot, projectDir, projectSlug: slug, subdir: 'decisions', category: 'adr' });

    // 3. docs/*.md (D-11 third, D-18 optional)
    collectCategoryFiles({ results, vaultRoot, projectDir, projectSlug: slug, subdir: 'docs', category: 'doc' });

    // 4. sessions/*.md (D-11 fourth, D-18 optional)
    collectCategoryFiles({ results, vaultRoot, projectDir, projectSlug: slug, subdir: 'sessions', category: 'session' });
  }

  return results;
}

/**
 * Read a category subdirectory, filter to .md files, sort alphabetically,
 * emit one result entry per file (skipping ADR regex mismatches with warn()).
 * Mutates the passed-in results array.
 */
function collectCategoryFiles({ results, vaultRoot, projectDir, projectSlug, subdir, category }) {
  const dirAbs = join(projectDir, subdir);
  if (!existsSync(dirAbs)) return; // D-18 optional category

  const names = readdirSync(dirAbs)
    .filter((name) => name.endsWith('.md')) // D-19 .md filter
    .sort();                                // D-11 sorted within category

  for (const basename of names) {
    const absPath = join(dirAbs, basename);
    const entry = makeEntry({ vaultRoot, absPath, category, projectSlug, basename });
    if (entry.title === null) {
      // D-02 — ADR regex mismatch: warn and skip.
      warn(`notebooklm-sync: skipping ${entry.vaultRelativePath} — filename does not match ADR NNNN-slug.md format`);
      continue;
    }
    results.push(entry);
  }
}

/**
 * Build a result entry with the POSIX-relative vault path and the title from buildTitle.
 * Title may be null for ADR regex mismatch — caller skips and warns.
 */
function makeEntry({ vaultRoot, absPath, category, projectSlug, basename }) {
  // Research Option B: path.relative + sep.join('/') is cross-platform safe.
  const vaultRelativePath = relative(vaultRoot, absPath).split(sep).join('/');
  const title = buildTitle(category, projectSlug, basename);
  return { absPath, vaultRelativePath, category, projectSlug, basename, title };
}

/**
 * Test-only: expose walkProjectFiles for unit testing.
 * Not part of the public API; do NOT call from production code.
 * @internal
 */
export async function _walkProjectFiles(vaultRoot) {
  return walkProjectFiles(vaultRoot);
}

/**
 * Ensure the target notebook exists. Returns its ID for the rest of the sync run.
 *
 * Per D-09: list existing notebooks, find by strict `title === notebookName` equality,
 * create if 0 matches, throw loudly if >=2 matches (research finding #3 resolution).
 *
 * @param {string} notebookName
 * @returns {Promise<string>} notebookId
 *
 * @throws {NotebooklmCliError} if multiple notebooks share the same title
 * @throws {NotebooklmRateLimitError} propagated from listNotebooks / createNotebook
 * @throws {NotebooklmNotInstalledError} propagated from Phase 2 binary check
 */
async function ensureNotebook(notebookName) {
  const existing = await listNotebooks();
  const matches = existing.filter((nb) => nb.title === notebookName);

  if (matches.length === 1) {
    return matches[0].id;
  }

  if (matches.length === 0) {
    const created = await createNotebook(notebookName);
    return created.id;
  }

  // matches.length >= 2 — silent duplicate creation by notebooklm-py (research finding #3).
  // Per research resolution: throw loudly, do NOT silently pick first or newest.
  throw new NotebooklmCliError(
    `ensureNotebook: multiple notebooks found with title "${notebookName}" (found ${matches.length}). ` +
    `Delete duplicate notebooks and retry.`,
    { command: ['list', '--json'], exitCode: 0, stderr: '' }
  );
}

/**
 * Test-only: expose ensureNotebook for unit testing.
 * @internal
 */
export async function _ensureNotebook(notebookName) {
  return ensureNotebook(notebookName);
}

/**
 * Sync a single file per D-12 (sessions = upload-once) / D-13 (non-sessions =
 * hash delta + delete-then-upload). Swallows NotebooklmCliError from
 * deleteSourceByTitle per research finding #2.
 *
 * Error handling per D-07/D-08:
 *   - NotebooklmRateLimitError  -> rethrow (syncVault loop catches and aborts)
 *   - NotebooklmCliError (from deleteSourceByTitle) -> swallow, continue to upload (D-13 step 5)
 *   - NotebooklmCliError (from uploadSource) -> append to stats.errors[], increment stats.failed,
 *     do NOT write manifest; return 'failed'
 *
 * @param {object}  params
 * @param {object}  params.fileEntry      Result from walkProjectFiles
 * @param {string}  params.vaultRoot
 * @param {string}  params.notebookId
 * @param {object}  params.manifest       Phase 3 manifest object (mutated in place)
 * @param {object}  params.stats          Stats accumulator (mutated in place)
 * @param {boolean} params.dryRun
 * @returns {Promise<'uploaded'|'skipped'|'failed'>}
 */
async function syncOneFile({ fileEntry, vaultRoot, notebookId, manifest, stats, dryRun }) {
  const { absPath, vaultRelativePath, category, title } = fileEntry;

  // title===null already filtered by walker (ADR regex mismatch -> warn+skip), but defensive.
  if (title === null) {
    stats.skipped++;
    return 'skipped';
  }

  const existingEntry = manifest.files[vaultRelativePath];

  // D-12: sessions are upload-once. Presence check, not hash check.
  if (category === 'session') {
    if (existingEntry !== undefined) {
      stats.skipped++;
      return 'skipped';
    }

    if (dryRun) {
      stats.planned.push({ action: 'upload', file: vaultRelativePath, title });
      return 'skipped';
    }

    try {
      const { sourceId } = await uploadSource(notebookId, absPath, { title });
      manifest.files[vaultRelativePath] = {
        hash: hashFile(absPath),
        notebook_source_id: sourceId,
        uploaded_at: new Date().toISOString(),
      };
      writeManifest(vaultRoot, manifest); // D-14 per-file atomic write
      stats.uploaded++;
      return 'uploaded';
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError) throw err; // D-08 propagate
      if (err instanceof NotebooklmCliError) {
        stats.errors.push({
          file: vaultRelativePath,
          title,
          reason: (err.message || '').slice(0, 200),
          error: err,
        });
        stats.failed++;
        return 'failed';
      }
      throw err; // unknown error class — propagate
    }
  }

  // D-13: non-sessions — hash compare, delete-then-upload on change.
  const currentHash = hashFile(absPath);
  if (existingEntry !== undefined && existingEntry.hash === currentHash) {
    stats.skipped++;
    return 'skipped';
  }

  // Either new file (no manifest entry) or hash changed (stale entry).
  if (dryRun) {
    const action = existingEntry === undefined ? 'upload' : 'replace';
    stats.planned.push({ action, file: vaultRelativePath, title });
    return 'skipped';
  }

  // D-13 step 4 + 5: delete prior source (if any) — swallow CliError (not rate limit).
  if (existingEntry !== undefined) {
    try {
      await deleteSourceByTitle(notebookId, title);
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError) throw err; // D-08 propagate
      if (err instanceof NotebooklmCliError) {
        // Research finding #2: swallow. The title was either absent or the
        // upstream CLI reported a benign error. Continue to upload.
      } else {
        throw err; // unknown class — propagate
      }
    }
  }

  // D-13 step 5 + 6: upload and update manifest.
  try {
    const { sourceId } = await uploadSource(notebookId, absPath, { title });
    manifest.files[vaultRelativePath] = {
      hash: currentHash,
      notebook_source_id: sourceId,
      uploaded_at: new Date().toISOString(),
    };
    writeManifest(vaultRoot, manifest); // D-14 per-file atomic write
    stats.uploaded++;
    return 'uploaded';
  } catch (err) {
    if (err instanceof NotebooklmRateLimitError) throw err; // D-08 propagate
    if (err instanceof NotebooklmCliError) {
      // D-07: per-file failure -> collect, increment failed, DO NOT update manifest.
      stats.errors.push({
        file: vaultRelativePath,
        title,
        reason: (err.message || '').slice(0, 200),
        error: err,
      });
      stats.failed++;
      return 'failed';
    }
    throw err;
  }
}

/**
 * Test-only: expose syncOneFile for unit testing.
 * @internal
 */
export async function _syncOneFile(params) {
  return syncOneFile(params);
}

// -- Public export: syncVault --------------------------------------------------

/**
 * Walk the vault, sync changed/new files to NotebookLM, return stats.
 *
 * @param {object} [opts]
 * @param {string} [opts.vaultRoot]    Defaults to findVault() from lib/projects.mjs.
 * @param {string} [opts.notebookName] Defaults to env NOTEBOOKLM_NOTEBOOK_NAME or 'claude-dev-stack-vault'.
 * @param {boolean} [opts.dryRun]      If true, skip all API and manifest writes; return planned actions.
 *
 * @returns {Promise<{
 *   uploaded: number,
 *   skipped: number,
 *   failed: number,
 *   errors: Array<{file:string, title:string, reason:string, error:Error}>,
 *   durationMs: number,
 *   notebookId: string | null,
 *   rateLimited: boolean,
 *   planned?: Array<{action:'upload'|'replace'|'skip', file:string, title:string|null}>
 * }>}
 *
 * @throws {Error} 'Vault not found' when vaultRoot is missing/non-existent.
 * @throws {NotebooklmNotInstalledError} propagated from Phase 2 if binary absent.
 */
export async function syncVault(opts = {}) {
  const {
    vaultRoot: passedVaultRoot,
    notebookName: passedNotebookName,
    dryRun = false,
  } = opts;

  // D-15 default: findVault() -> lib/projects.mjs when vaultRoot not passed.
  const vaultRoot = passedVaultRoot ?? findVault();
  if (!vaultRoot || !existsSync(vaultRoot)) {
    throw new Error(`Vault not found at: ${vaultRoot ?? '(findVault returned null)'}`);
  }

  // D-13/D-15 default: env var override -> default name.
  // Resolved at call time, not module load time, so tests can mutate env.
  const notebookName =
    passedNotebookName ??
    process.env.NOTEBOOKLM_NOTEBOOK_NAME ??
    'claude-dev-stack-vault';

  const startedAt = Date.now();

  // D-16 stats shape. `planned` only populated when dryRun===true.
  const stats = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
    notebookId: null,
    rateLimited: false,
    planned: [],
  };

  // D-20: dryRun bypasses ALL API calls including listNotebooks/ensureNotebook.
  // notebookId stays null; the `planned` array communicates what would happen.
  let notebookId = null;
  if (!dryRun) {
    try {
      notebookId = await ensureNotebook(notebookName);
      stats.notebookId = notebookId;
    } catch (err) {
      // Rate-limit on ensureNotebook aborts before any files sync.
      if (err instanceof NotebooklmRateLimitError) {
        stats.rateLimited = true;
        stats.durationMs = Date.now() - startedAt;
        return stats;
      }
      // Other errors propagate upward (not a per-file failure — the whole run fails).
      throw err;
    }
  }

  // Walk files deterministically per D-11.
  const files = await walkProjectFiles(vaultRoot);

  // Load manifest once; syncOneFile mutates and writes after each success.
  const manifest = readManifest(vaultRoot);

  // Main loop — per-file sync with rate-limit abort.
  for (const fileEntry of files) {
    try {
      await syncOneFile({ fileEntry, vaultRoot, notebookId, manifest, stats, dryRun });
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError) {
        // D-08: rate limit aborts the sync run. Manifest entries for prior successful
        // files were persisted per-file (D-14); no cleanup needed.
        stats.rateLimited = true;
        break;
      }
      // syncOneFile handles NotebooklmCliError internally (D-07). Anything else
      // reaching here is unexpected — propagate so users see the stack trace.
      throw err;
    }
  }

  stats.durationMs = Date.now() - startedAt;

  // Hide the `planned` field unless dryRun was used — keeps the stats shape tight
  // for the 99% case per D-16.
  if (!dryRun) {
    delete stats.planned;
  }

  return stats;
}

// -- Log rotation (P2-#5, 2026-04-11) -----------------------------------------

/**
 * Default cap for `_rotateLogIfNeeded`. Sized for the runner contract:
 * each sync run appends 2-4 lines via `appendLogLine` in
 * hooks/notebooklm-sync-runner.mjs, so 100 lines retains ~25-50 runs of
 * history while bounding the file at ~10 KB.
 */
export const MAX_LOG_LINES = 100;

/**
 * Trim a line-oriented log file in place when it exceeds maxLines.
 *
 * Single-writer assumption: hooks/notebooklm-sync-runner.mjs is the only
 * writer of `~/vault/.notebooklm-sync.log`, spawned at most once per
 * session-end via the trigger gate. Therefore no temp-file dance or
 * file lock is required; a plain read-modify-write is safe.
 *
 * Best-effort contract (NBLM-23): MUST NEVER throw. Any I/O failure
 * (missing file, permission error, malformed content) returns
 * `{ rotated: false }` and leaves the log untouched.
 *
 * @param {string} logPath  absolute path to the log file
 * @param {number} [maxLines=MAX_LOG_LINES]  retain at most this many trailing lines
 * @returns {{ rotated: boolean, before?: number, after?: number }}
 *
 * Behavioural matrix (see PLAN.md 260411-trq):
 *   - file does not exist            -> { rotated: false }
 *   - file has <= maxLines lines     -> { rotated: false }
 *   - file has > maxLines lines      -> { rotated: true, before, after }
 *   - file is unreadable / write fail-> { rotated: false } (silently swallowed)
 *   - trailing newline must be preserved when present
 */
export function _rotateLogIfNeeded(logPath, maxLines = MAX_LOG_LINES) {
  if (!existsSync(logPath)) return { rotated: false };

  try {
    const text = readFileSync(logPath, 'utf8');
    const hadTrailingNewline = text.endsWith('\n');
    // Drop the trailing empty element produced by split when the file ends in '\n'.
    const lines = hadTrailingNewline ? text.slice(0, -1).split('\n') : text.split('\n');
    // An empty file (text === '') yields [''] which we treat as zero lines.
    const before = text === '' ? 0 : lines.length;
    if (before <= maxLines) return { rotated: false };

    const kept = lines.slice(-maxLines);
    const next = kept.join('\n') + (hadTrailingNewline ? '\n' : '');
    writeFileSync(logPath, next, 'utf8');
    return { rotated: true, before, after: maxLines };
  } catch {
    // Best-effort: log rotation must never propagate (NBLM-23).
    return { rotated: false };
  }
}
