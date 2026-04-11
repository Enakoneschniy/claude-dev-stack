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

import { existsSync, readdirSync, statSync } from 'node:fs';
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

// -- Private helpers — implemented in Plan 04-02 --------------------------------

/**
 * Walk vault/projects/* and emit a deterministic ordered list of files to sync.
 * Implemented in Plan 04-02. Per D-11: context.md -> decisions -> docs -> sessions,
 * projects sorted alphabetically, files sorted alphabetically within each category.
 * Per D-17: inline readdirSync, trust directory name as project slug.
 * Per D-19: hard-skip shared/ and meta/ -- walker never descends there.
 *
 * @param {string} vaultRoot
 * @returns {Array<{absPath:string, vaultRelativePath:string, category:'session'|'adr'|'doc'|'context', projectSlug:string, basename:string, title:string|null}>}
 */
// eslint-disable-next-line no-unused-vars
async function walkProjectFiles(vaultRoot) {
  throw new Error('walkProjectFiles: not yet implemented — Plan 04-02');
}

/**
 * Ensure the target notebook exists. Calls listNotebooks() + find-by-title, creates
 * if missing, throws if multiple matches (per research finding #3 + resolution).
 * Implemented in Plan 04-02.
 *
 * @param {string} notebookName
 * @returns {Promise<string>} notebookId
 */
// eslint-disable-next-line no-unused-vars
async function ensureNotebook(notebookName) {
  throw new Error('ensureNotebook: not yet implemented — Plan 04-02');
}

/**
 * Sync a single file per D-12 (sessions = upload-once) / D-13 (non-sessions =
 * hash delta + delete-then-upload). Swallows NotebooklmCliError from
 * deleteSourceByTitle per research finding #2. Implemented in Plan 04-02.
 *
 * @returns {Promise<'uploaded'|'skipped'|'failed'>}
 */
// eslint-disable-next-line no-unused-vars
async function syncOneFile(opts) {
  throw new Error('syncOneFile: not yet implemented — Plan 04-02');
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

  // Scaffold only -- Plan 04-02 replaces the body below with the real orchestration loop.
  // We intentionally throw here so any accidental consumer of the scaffold fails loudly.
  const _scaffoldMarker = {
    vaultRoot,
    notebookName,
    dryRun,
    NotebooklmCliError,
    NotebooklmRateLimitError,
    readManifest,
    writeManifest,
    hashFile,
    createNotebook,
    uploadSource,
    deleteSourceByTitle,
    listNotebooks,
    warn,
    join,
    relative,
    sep,
    readdirSync,
    statSync,
    walkProjectFiles,
    ensureNotebook,
    syncOneFile,
  };
  // Silence lint for unused scaffold imports -- Plan 04-02 consumes them.
  void _scaffoldMarker;

  throw new Error('syncVault: orchestration not yet implemented — Plan 04-02');
}
