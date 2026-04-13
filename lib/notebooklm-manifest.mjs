/**
 * lib/notebooklm-manifest.mjs — Local sync manifest at ~/vault/.notebooklm-sync.json.
 *
 * Tracks SHA-256 content hashes of vault files and their NotebookLM source IDs so
 * Phase 4's sync pipeline can skip unchanged files without any API calls. Also
 * provides the corrupt-recovery policy (rename to .corrupt-<timestamp> + return
 * empty manifest) and the idempotent .gitignore migration that keeps the manifest
 * out of the vault git repo.
 *
 * Per 03-CONTEXT.md (22 locked decisions D-01..D-22):
 *   - Manifest shape is a versioned wrapper: { version: 1, generated_at, files: {...} }
 *   - Filepath keys are vault-relative, POSIX forward slashes (deterministic cross-platform)
 *   - Atomic write via `.tmp + renameSync` — POSIX-atomic on same filesystem (research-verified)
 *   - Corrupt recovery: rename + warn + return empty in-memory manifest (does NOT write)
 *   - Missing manifest (fresh vault) is NOT corrupt — silent empty return
 *
 * Per 03-RESEARCH.md (runtime-verified on Node 20.12.2):
 *   - `fs.renameSync` is atomic for same-fs same-dir renames (POSIX rename(2) wrapper)
 *   - Empty file SHA-256 is the well-known constant e3b0c44298fc1c149af... (used in tests)
 *   - .corrupt-<timestamp> format uses hyphens not colons (Windows-safe filenames)
 *
 * This module imports ONLY Node builtins and lib/shared.mjs. No npm dependencies added.
 * The `notebooklm-py` system dependency from Phase 2 is not relevant here — Phase 3 is
 * pure filesystem/crypto code with zero CLI wrapping.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { warn, atomicWriteJson } from './shared.mjs';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Hard schema version per D-02. When a future milestone bumps the manifest shape,
 * this becomes 2 and readers gain a migration branch. For v0.8 MVP it is `1` and
 * any other value in a read manifest triggers the corrupt-recovery path (D-11).
 */
export const MANIFEST_VERSION = 2;

/**
 * Basename of the manifest file inside the vault root.
 * Kept as a module constant so tests and .gitignore migration share the same source.
 */
const MANIFEST_FILENAME = '.notebooklm-sync.json';

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute the absolute manifest path for a given vault root.
 * Internal only — callers use readManifest/writeManifest, which handle the path.
 *
 * @param {string} vaultRoot
 * @returns {string}
 */
function manifestPath(vaultRoot) {
  return join(vaultRoot, MANIFEST_FILENAME);
}

/**
 * Throw a descriptive plain Error when vaultRoot is null, undefined, or does not
 * exist on disk. Called at the top of every exported function that operates on
 * the vault root (readManifest, writeManifest, ensureManifestGitignored).
 *
 * Rationale (per 03-RESEARCH.md §Integration with findVault()):
 *   - Phase 1's updateContextHistory returns { action: 'skipped' } for missing
 *     vault/project because it is invoked defensively from a hook with partial info.
 *   - Phase 3 primitives are called deliberately by Phase 4/5 which have already
 *     resolved the vault via findVault(). A missing vault at this point is a
 *     caller bug, not a recoverable edge case → throw loudly.
 *   - Plain Error (not a custom class) — no instanceof branching benefit vs
 *     Phase 2's NotebooklmNotInstalledError where the install wizard needs to detect it.
 *
 * @param {string} vaultRoot
 */
function assertVaultRoot(vaultRoot) {
  if (!vaultRoot || !existsSync(vaultRoot)) {
    throw new Error(`Vault not found at: ${vaultRoot}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hex digest of a file's raw bytes.
 *
 * Per D-06: 64-char lowercase hex, no truncation, no base64.
 * Per D-08: raw bytes, no line-ending normalization, no whitespace stripping.
 * Per D-09: readFileSync + full-buffer hash (not streaming — vault files are <100KB).
 *
 * @param {string} absolutePath - Absolute path to any file
 * @returns {string} 64-char lowercase hex SHA-256 digest
 */
export function hashFile(absolutePath) {
  const bytes = readFileSync(absolutePath); // no encoding → returns Buffer
  return createHash('sha256').update(bytes).digest('hex');
}

// ── readManifest, writeManifest, ensureManifestGitignored: added in Tasks 2-3 ──

/**
 * Produce a filesystem-safe timestamp for .corrupt-<timestamp> filenames.
 * Format: YYYY-MM-DDTHH-mm-ss (colons replaced by hyphens, milliseconds dropped).
 *
 * Windows forbids colons in filenames, so we replace them with hyphens. The
 * resulting filename is lexicographically sortable and human-readable, which is
 * useful when multiple corrupt files accumulate on a problematic vault.
 *
 * Example: new Date('2026-04-10T16:30:00.000Z') → '2026-04-10T16-30-00'
 */
function filesystemSafeTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
}

/**
 * Build an empty manifest object in the canonical shape (D-01 + D-17).
 * Used by readManifest on fresh vault and on corrupt-recovery.
 */
function emptyManifest() {
  return {
    version: MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    projects: {},
  };
}

/**
 * Validate the shape of a parsed manifest object.
 * Returns { valid: bool, reason: 'ok' | 'unknown-version' | 'malformed' }.
 *
 * Per D-03 (Phase 7 context): split into structured result so readManifest can
 * distinguish 'unknown-version' (potential v1→v2 migration candidate) from
 * 'malformed' (genuinely corrupt — always trigger recovery).
 *
 * Per D-11: the version field doubles as a magic number — any other value
 * means the schema is wrong (or from a future version we don't speak yet)
 * and the recovery path should kick in. No separate CRC field.
 *
 * A valid v2 manifest must have a `projects` plain object field.
 * v1 manifests (files field) are not valid at v2 — readManifest migrates them.
 */
function isValidManifestShape(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (parsed.version !== MANIFEST_VERSION) {
    return { valid: false, reason: 'unknown-version' };
  }
  if (parsed.projects === null || typeof parsed.projects !== 'object' || Array.isArray(parsed.projects)) {
    return { valid: false, reason: 'malformed' };
  }
  return { valid: true, reason: 'ok' };
}

/**
 * Corrupt-recovery helper — rename the offending file to .corrupt-<timestamp>,
 * warn, and return an empty in-memory manifest. If rename fails (e.g. permission
 * denied or file already gone), silently unlink the corrupt file as a fallback
 * per D-14 "delete if rename fails — don't block the sync".
 *
 * Does NOT write a new manifest file — the caller gets an in-memory empty
 * manifest and Phase 4 will persist the new state after its first successful
 * sync run. This avoids a double-write race during recovery.
 *
 * NOTE: corrupt sibling basename strips .json so it matches the .gitignore glob
 * `.notebooklm-sync.corrupt-*` (D-22), not `.notebooklm-sync.json.corrupt-*`.
 */
function recoverCorruptManifest(path, reason) {
  // Strip .json suffix so sibling is `.notebooklm-sync.corrupt-<ts>` (D-22)
  const basePath = path.replace(/\.json$/, '');
  const corruptPath = `${basePath}.corrupt-${filesystemSafeTimestamp()}`;
  try {
    renameSync(path, corruptPath);
    warn(`notebooklm-manifest: corrupt manifest (${reason}) recovered at ${corruptPath}`);
  } catch {
    try {
      unlinkSync(path);
    } catch {
      // Ignore — if we can't even delete it, there's nothing more to do.
      // The next successful writeManifest will overwrite it via atomic rename.
    }
    warn(`notebooklm-manifest: corrupt manifest (${reason}) could not be renamed; deleted instead`);
  }
  return emptyManifest();
}

/**
 * Migrate a v1 manifest (flat files dict) to v2 (per-project structure).
 *
 * Per D-01 (Phase 7): entries not matching `projects/<slug>/...` go to `_shared` bucket.
 * Per D-02: backup written immediately to .v1.backup.json before any mutation.
 * Per D-04: this function must exist and be tested BEFORE MANIFEST_VERSION is bumped to 2.
 *
 * @param {string} vaultRoot
 * @param {object} v1manifest  The parsed v1 manifest object
 * @param {string} mPath       Absolute path to .notebooklm-sync.json
 * @returns {{ version: 2, generated_at: string, projects: object }}
 */
function migrateV1ToV2(vaultRoot, v1manifest, mPath) {
  // D-02: write backup immediately — if sync crashes after read, manifest is already v2
  const backupPath = mPath.replace(/\.json$/, '.v1.backup.json');
  if (!existsSync(backupPath)) {
    atomicWriteJson(backupPath, v1manifest);
  }

  // D-01: group v1 files by project slug
  const projects = {};
  for (const [key, entry] of Object.entries(v1manifest.files || {})) {
    const parts = key.split('/');
    // Must match projects/<slug>/... (at least 3 path components with projects/ prefix)
    const slug = (parts[0] === 'projects' && parts.length >= 3) ? parts[1] : '_shared';
    if (!projects[slug]) {
      projects[slug] = { notebook_id: null, files: {} };
    }
    projects[slug].files[key] = entry;
  }

  // Build v2 manifest — preserve original generated_at from v1 (do not reset to now).
  const v2 = {
    version: 2,
    generated_at: v1manifest.generated_at ?? new Date().toISOString(),
    projects,
  };

  // Write v2 atomically
  const tmpPath = mPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(v2, null, 2), 'utf8');
  renameSync(tmpPath, mPath);

  return v2;
}

/**
 * Read and validate the manifest at ${vaultRoot}/.notebooklm-sync.json.
 *
 * Contract (D-14..D-17):
 *   - Missing manifest → return empty manifest silently (fresh vault, not corrupt).
 *   - Parse error OR shape validation failure → rename to .corrupt-<timestamp>,
 *     warn(), return empty manifest. If rename itself fails, silently unlinkSync
 *     the corrupt file; never block the caller.
 *   - Never writes a new manifest during recovery (Phase 4 will write after first
 *     successful sync — avoids double-write race per research recommendation).
 *   - NEVER throws for corrupt/missing manifests. Only throws when vaultRoot is
 *     missing/non-existent (caller-side programming error).
 *
 * @param {string} vaultRoot
 * @returns {{ version: 1, generated_at: string, files: object }}
 */
export function readManifest(vaultRoot) {
  assertVaultRoot(vaultRoot);

  const path = manifestPath(vaultRoot);

  // D-17: missing manifest is expected initial state, not corrupt.
  if (!existsSync(path)) {
    return emptyManifest();
  }

  // Try to read and parse; any failure drops into the recovery branch.
  let parsed;
  try {
    const raw = readFileSync(path, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    return recoverCorruptManifest(path, 'JSON parse failed');
  }

  const shapeResult = isValidManifestShape(parsed);
  if (!shapeResult.valid) {
    if (shapeResult.reason === 'unknown-version' && parsed.version === 1) {
      // MANIFEST_VERSION has been bumped past 1 — migrate in-place.
      return migrateV1ToV2(vaultRoot, parsed, path);
    }
    return recoverCorruptManifest(path, `manifest shape invalid (${shapeResult.reason})`);
  }

  return parsed;
}

/**
 * Atomically write the manifest to ${vaultRoot}/.notebooklm-sync.json.
 *
 * Per D-10: serialize → writeFileSync to .tmp sibling → renameSync to target.
 * POSIX rename(2) is atomic for same-filesystem renames (research-verified).
 *
 * Sets manifest.version = MANIFEST_VERSION and updates manifest.generated_at
 * to the current ISO timestamp before serialization (D-03). The caller's
 * manifest object IS mutated by this — matches the existing Node idiom and
 * keeps the single-write contract simple.
 *
 * @param {string} vaultRoot
 * @param {object} manifest  Must have a `files` object; version/generated_at are set here.
 */
export function writeManifest(vaultRoot, manifest) {
  assertVaultRoot(vaultRoot);

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('writeManifest: manifest must be a plain object with a projects field');
  }
  if (manifest.projects === null || typeof manifest.projects !== 'object' || Array.isArray(manifest.projects)) {
    throw new Error('writeManifest: manifest.projects must be a plain object');
  }

  // D-03: update generated_at on every write; D-02: enforce version constant.
  manifest.version = MANIFEST_VERSION;
  manifest.generated_at = new Date().toISOString();

  const path = manifestPath(vaultRoot);
  const tmpPath = `${path}.tmp`;

  // D-10: atomic rename pattern — write to .tmp then rename to target.
  // D-12: 2-space indentation for human-readable diffs.
  const json = JSON.stringify(manifest, null, 2);
  writeFileSync(tmpPath, json, 'utf8');
  renameSync(tmpPath, path);
}

/**
 * Ensure `${vaultRoot}/.gitignore` contains the NotebookLM managed block (D-18..D-22).
 * Idempotent: calling N times produces exactly one occurrence of the entries.
 *
 * Block format (appended to the end of .gitignore):
 *
 *     <blank line>
 *     # Claude Dev Stack — NotebookLM sync state (do not commit)
 *     .notebooklm-sync.json
 *     .notebooklm-sync.json.tmp
 *     .notebooklm-sync.corrupt-*
 *
 * Algorithm:
 *   1. assertVaultRoot(vaultRoot)
 *   2. Read `${vaultRoot}/.gitignore` if it exists; else treat content as ''
 *   3. Split on /\r?\n/ (CRLF safety — research §gitignore Line Ending)
 *   4. If any trimmed line exactly equals '.notebooklm-sync.json' → no-op, return early (D-19)
 *   5. Otherwise build output:
 *      - If .gitignore did not exist (or was empty): output = blockWithoutLeadingBlank + '\n'
 *      - If existing content does not end with '\n': output = existing + '\n' + blockWithLeadingBlank + '\n'
 *      - Otherwise: output = existing + blockWithLeadingBlank + '\n'
 *   6. writeFileSync(gitignorePath, output, 'utf8')
 *
 * @param {string} vaultRoot - Absolute path to vault root
 */
export function ensureManifestGitignored(vaultRoot) {
  assertVaultRoot(vaultRoot);

  const gitignorePath = join(vaultRoot, '.gitignore');

  const blockWithoutLeadingBlank =
    '# Claude Dev Stack \u2014 NotebookLM sync state (do not commit)\n' +
    '.notebooklm-sync.json\n' +
    '.notebooklm-sync.json.tmp\n' +
    '.notebooklm-sync.corrupt-*\n' +
    '.notebooklm-sync.log\n' +
    '.notebooklm-stats.json';

  const blockWithLeadingBlank = '\n' + blockWithoutLeadingBlank;

  // Read existing content or treat as empty string if file doesn't exist.
  const fileExists = existsSync(gitignorePath);
  const existing = fileExists ? readFileSync(gitignorePath, 'utf8') : '';

  // D-19: line-exact match — split on CRLF or LF for cross-platform safety.
  const lines = existing.split(/\r?\n/);
  const hasJsonEntry = lines.some(line => line.trim() === '.notebooklm-sync.json');
  const hasLogEntry = lines.some(line => line.trim() === '.notebooklm-sync.log');

  if (hasJsonEntry && hasLogEntry) {
    return; // Fully-present block (4 entries already there) — idempotent no-op.
  }

  if (hasJsonEntry && !hasLogEntry) {
    // Migration path: existing Phase 3 vault has the 3-entry block.
    // Append only the new .notebooklm-sync.log entry, preserving existing content.
    const needsLeadingNewline = !existing.endsWith('\n');
    const migration = (needsLeadingNewline ? '\n' : '') + '.notebooklm-sync.log\n';
    writeFileSync(gitignorePath, existing + migration, 'utf8');
    return;
  }

  // Otherwise: no block yet. Fall through to existing block-write logic.

  // Build the new file content based on trailing-newline state.
  let output;
  if (!fileExists || existing === '') {
    // New or empty file: no leading blank line (D-18 step 4)
    output = blockWithoutLeadingBlank + '\n';
  } else if (!existing.endsWith('\n')) {
    // Existing file missing trailing newline (research-verified vault state): prepend \n
    output = existing + '\n' + blockWithLeadingBlank + '\n';
  } else {
    // Normal case: existing file already ends with \n
    output = existing + blockWithLeadingBlank + '\n';
  }

  writeFileSync(gitignorePath, output, 'utf8');
}

// ── Test-only exports ─────────────────────────────────────────────────────────
// These are internal functions exposed solely for unit testing.
// Prefixed with _ to signal test-only intent (matches _walkProjectFiles pattern).
export { isValidManifestShape as _isValidManifestShape };
export { migrateV1ToV2 as _migrateV1ToV2 };
