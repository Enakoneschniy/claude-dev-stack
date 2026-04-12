/**
 * lib/notebooklm.mjs — thin wrapper around the `notebooklm-py` Python CLI.
 *
 * Per ADR-0001 (vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md):
 * Google NotebookLM has no public REST API. All programmatic access goes through
 * `notebooklm-py` (pip install notebooklm-py), a Python CLI that uses browser OAuth
 * cookies under the hood. This module shells out to that binary via spawnSync with
 * an args array (never a shell string — prevents command injection).
 *
 * Authentication is delegated ENTIRELY to notebooklm-py. This module never reads
 * API keys, never touches credential storage files, never invokes auth subcommands.
 * All auth lifecycle is the Phase 5 install wizard's concern.
 *
 * System dependency: `notebooklm-py >= 0.3.4` must be installed and available on PATH
 * as `notebooklm`. Importing this module on a machine without the binary does NOT
 * throw — detection is lazy, triggered on the first public function call.
 *
 * Windows caveat: lib/shared.mjs::hasCommand uses POSIX `which` which is not
 * available on Windows. Phase 5 doctor will improve cross-platform detection. For
 * now this module is POSIX-tested (macOS, Linux).
 */

import { spawnSync } from 'child_process';
import { resolve as resolvePath, join } from 'path';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { hasCommand } from './shared.mjs';

// ── Error classes ────────────────────────────────────────────────────────────

/**
 * Generic CLI wrapper failure. Thrown on non-zero exit that does NOT match a
 * rate-limit pattern, on JSON parse failures, and on schema validation failures.
 *
 * Fields:
 *   .command    - the argv array that was passed to spawnSync (for debugging)
 *   .exitCode   - integer exit code from the CLI process (null on ENOENT)
 *   .stderr     - captured stderr text (may be empty string)
 *   .rawOutput  - set to the raw stdout ONLY when JSON parsing failed. Opt-in
 *                 debugging aid — may contain auth-adjacent diagnostic text, so
 *                 default error formatting does not include it.
 */
export class NotebooklmCliError extends Error {
  constructor(message, { command, exitCode, stderr, rawOutput } = {}) {
    super(message);
    this.name = 'NotebooklmCliError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
    if (rawOutput !== undefined) this.rawOutput = rawOutput;
  }
}

/**
 * Thrown when the notebooklm-py CLI signals a rate-limit / quota failure.
 *
 * Two detection paths (per research §Rate-Limit stderr Pattern Catalog):
 *   - JSON mode: parsed stdout has { error: true, code: 'RATE_LIMITED', ... }
 *   - Text mode: stderr matches one of RATE_LIMIT_PATTERNS (delete commands)
 *
 * Subclass of NotebooklmCliError so callers can either catch specifically
 * (instanceof NotebooklmRateLimitError) for retry logic, or generically
 * (instanceof NotebooklmCliError) for generic failure handling.
 */
export class NotebooklmRateLimitError extends NotebooklmCliError {
  constructor(message, { command, exitCode, stderr, matchedPattern } = {}) {
    super(message, { command, exitCode, stderr });
    this.name = 'NotebooklmRateLimitError';
    this.matchedPattern = matchedPattern;
  }
}

/**
 * Thrown on the first function call made when the `notebooklm` binary is absent
 * from PATH. Direct subclass of Error — NOT of NotebooklmCliError — because it
 * is an installation-state problem, not a CLI invocation problem.
 *
 * The message always includes the install hint `pipx install notebooklm-py`
 * with a `pip install --user notebooklm-py` fallback for environments without
 * pipx (per D-06).
 */
export class NotebooklmNotInstalledError extends Error {
  constructor(functionName) {
    super(
      `notebooklm binary not found in PATH (required by ${functionName}). ` +
      `Install with: pipx install notebooklm-py  ` +
      `(fallback: pip install --user notebooklm-py)`
    );
    this.name = 'NotebooklmNotInstalledError';
    this.functionName = functionName;
    this.binaryName = 'notebooklm';
  }
}

// ── Rate-limit pattern catalog ───────────────────────────────────────────────

/**
 * Regex patterns applied to stderr for non-JSON commands (delete, delete-by-title)
 * AND as a secondary check for JSON commands. Tuned from research §Rate-Limit
 * stderr Pattern Catalog — the primary rate-limit signal for JSON commands is
 * parsedOutput.code === 'RATE_LIMITED' (handled in runNotebooklm, Task 2).
 *
 * Order matters only for .matchedPattern reporting — the first matching
 * pattern wins and is carried on the thrown NotebooklmRateLimitError.
 */
export const RATE_LIMIT_PATTERNS = Object.freeze([
  /rate[\s_-]?limit/i,            // "Error: Rate limited."
  /too many requests/i,           // HTTP 429 text leaked from notebooklm-py
  /quota\s+exceeded/i,            // Quota exhaustion
  /No result found for RPC ID/i,  // Legacy upstream behavior (SKILL.md error table)
  /GENERATION_FAILED/,            // Generate commands — kept for safety, not in Phase 2 scope
]);

// ── Lazy binary detection ────────────────────────────────────────────────────

let _binaryChecked = false;
let _binaryAvailable = false;

/**
 * Runs `hasCommand('notebooklm')` exactly once per process and caches the
 * result in module-scoped booleans. Returns the cached value on subsequent
 * calls. NOT exported.
 *
 * Rationale (D-04, D-05): importing lib/notebooklm.mjs on a machine without
 * notebooklm-py installed must not throw. Callers that conditionally use the
 * feature (e.g. Phase 5 session-end trigger) import the module unconditionally
 * and rely on this lazy check at the point of first use.
 */
function _ensureBinary(functionName) {
  if (!_binaryChecked) {
    _binaryAvailable = hasCommand('notebooklm');
    _binaryChecked = true;
  }
  if (!_binaryAvailable) {
    throw new NotebooklmNotInstalledError(functionName);
  }
}

/**
 * Test-only: reset the binary-detection cache so tests can manipulate
 * process.env.PATH between scenarios. Prefixed with _ to signal internal use.
 * Not documented in the user-facing API.
 *
 * @internal
 */
export function _resetBinaryCache() {
  _binaryChecked = false;
  _binaryAvailable = false;
}

// ── Private helper: runNotebooklm ────────────────────────────────────────────

/**
 * Internal: invoke the notebooklm CLI and normalize result/error handling.
 * This is the single invocation point for all 6 public functions (D-01, D-02).
 *
 * @param {string[]} args             argv array passed to spawnSync (NEVER a shell string)
 * @param {object}   [options]
 * @param {boolean}  [options.jsonMode=true]       true for --json commands (parses stdout as JSON);
 *                                                  false for `source delete` / `source delete-by-title`
 *                                                  which have no --json flag (returns raw text).
 * @param {string}   [options.functionName='notebooklm']  name of the caller (for error messages)
 *
 * @returns {object|{stdout:string,stderr:string}}
 *   jsonMode=true  -> parsed JSON object (whatever notebooklm --json emitted on stdout)
 *   jsonMode=false -> { stdout, stderr } with both strings trimmed
 *
 * @throws {NotebooklmNotInstalledError} if binary is not in PATH (lazy detection or ENOENT race)
 * @throws {NotebooklmRateLimitError}    if rate-limit detected via JSON code or stderr regex
 * @throws {NotebooklmCliError}          on any other non-zero exit, JSON parse failure, or structured error JSON
 *
 * @private — not exported. Plan 02's public functions import this via closure.
 */
function runNotebooklm(args, options = {}) {
  const { jsonMode = true, functionName = 'notebooklm' } = options;

  _ensureBinary(functionName);

  const result = spawnSync('notebooklm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // ENOENT race: binary disappeared between lazy check and spawn (or the cache
  // was populated true on a previous process state). Treat as not-installed.
  if (result.error && result.error.code === 'ENOENT') {
    throw new NotebooklmNotInstalledError(functionName);
  }

  // Propagate other spawn-level errors (permission denied, etc.) as CliError.
  if (result.error) {
    throw new NotebooklmCliError(
      `notebooklm spawn failed in ${functionName}: ${result.error.message}`,
      {
        command: args,
        exitCode: result.status,
        stderr: result.stderr || '',
      }
    );
  }

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  const exitCode = result.status;

  if (exitCode === 0) {
    // Success path. jsonMode branches on how to present stdout.
    if (!jsonMode) {
      // Text-mode commands (delete, delete-by-title). stderr on exit 0 is benign.
      return { stdout, stderr };
    }

    // JSON mode: parse stdout. Empty-notebook WARNING on stderr is benign when
    // exit is 0 and the JSON parses (research §listSources).
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (parseErr) {
      throw new NotebooklmCliError(
        `failed to parse notebooklm --json output from '${args.join(' ')}' in ${functionName}: ${parseErr.message}`,
        {
          command: args,
          exitCode,
          stderr,
          rawOutput: stdout,
        }
      );
    }

    // Structured error JSON on stdout (notebooklm-py error_handler.py pattern).
    // This can occur on exit 0 with an error payload in rare cases, but is
    // primarily seen on exit 1 below. We check it here for safety.
    if (parsed && parsed.error === true) {
      const code = parsed.code || 'UNKNOWN';
      const msg = parsed.message || 'unknown error';
      if (code === 'RATE_LIMITED') {
        throw new NotebooklmRateLimitError(
          `notebooklm rate limit in ${functionName}: ${msg}`,
          { command: args, exitCode, stderr: msg, matchedPattern: 'RATE_LIMITED' }
        );
      }
      throw new NotebooklmCliError(
        `notebooklm ${code} in ${functionName}: ${msg}`,
        { command: args, exitCode, stderr: msg }
      );
    }

    return parsed;
  }

  // Non-zero exit. Branch on jsonMode to decide where to look for the error
  // payload.
  //
  // JSON mode: notebooklm --json error_handler.py writes the error as JSON on
  // STDOUT, not stderr, and exit code is 1. Try to parse stdout first.
  // Text mode: errors appear as plain text on STDERR; stdout may be empty.
  if (jsonMode && stdout) {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
    if (parsed && parsed.error === true) {
      const code = parsed.code || 'UNKNOWN';
      const msg = parsed.message || 'unknown error';
      if (code === 'RATE_LIMITED') {
        throw new NotebooklmRateLimitError(
          `notebooklm rate limit in ${functionName}: ${msg}`,
          { command: args, exitCode, stderr: msg, matchedPattern: 'RATE_LIMITED' }
        );
      }
      throw new NotebooklmCliError(
        `notebooklm ${code} in ${functionName}: ${msg}`,
        { command: args, exitCode, stderr: msg }
      );
    }
  }

  // Text-mode (or JSON mode with empty/unparseable stdout): scan stderr for
  // rate-limit patterns.
  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (pattern.test(stderr)) {
      throw new NotebooklmRateLimitError(
        `notebooklm rate limit in ${functionName}: ${stderr.split('\n')[0] || 'rate limited'}`,
        { command: args, exitCode, stderr, matchedPattern: pattern.source }
      );
    }
  }

  // Generic non-zero exit — no rate-limit signal detected.
  throw new NotebooklmCliError(
    `notebooklm exited ${exitCode} in ${functionName}: ${stderr.split('\n')[0] || 'no stderr'}`,
    { command: args, exitCode, stderr }
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new NotebookLM notebook.
 *
 * @param {string} name - Notebook title (passed verbatim to the CLI).
 * @returns {Promise<{id: string, title: string}>}
 *   Extracted from parsed.notebook; created_at is stripped (always null in v0.3.4).
 *
 * @throws {NotebooklmNotInstalledError} if notebooklm binary is missing from PATH
 * @throws {NotebooklmRateLimitError}    if upstream signals rate limit
 * @throws {NotebooklmCliError}          on any other failure (parse error, missing fields, non-zero exit)
 */
export async function createNotebook(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('createNotebook: name must be a non-empty string');
  }

  const parsed = runNotebooklm(['create', name, '--json'], {
    jsonMode: true,
    functionName: 'createNotebook',
  });

  if (!parsed || typeof parsed !== 'object' || !parsed.notebook ||
      typeof parsed.notebook.id !== 'string' || typeof parsed.notebook.title !== 'string') {
    throw new NotebooklmCliError(
      'createNotebook: expected { notebook: { id, title } } in --json output',
      { command: ['create', name, '--json'], exitCode: 0, stderr: '' }
    );
  }

  return { id: parsed.notebook.id, title: parsed.notebook.title };
}

/**
 * List all sources in a notebook. Returns an empty array if the notebook has
 * no sources (valid state — verified against live CLI).
 *
 * @param {string} notebookId
 * @returns {Promise<Array<{id: string, title: string, status: string}>>}
 *   Normalized — index/type/url/status_id/created_at are stripped.
 */
export async function listSources(notebookId) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('listSources: notebookId must be a non-empty string');
  }

  const args = ['source', 'list', '-n', notebookId, '--json'];
  const parsed = runNotebooklm(args, {
    jsonMode: true,
    functionName: 'listSources',
  });

  if (!parsed || !Array.isArray(parsed.sources)) {
    throw new NotebooklmCliError(
      'listSources: expected { sources: [...] } in --json output',
      { command: args, exitCode: 0, stderr: '' }
    );
  }

  return parsed.sources.map((s) => {
    if (typeof s.id !== 'string' || typeof s.title !== 'string') {
      throw new NotebooklmCliError(
        'listSources: source entry missing required id/title fields',
        { command: args, exitCode: 0, stderr: '' }
      );
    }
    return { id: s.id, title: s.title, status: s.status };
  });
}

/**
 * Upload a local file as a new source in a notebook.
 *
 * The filepath is resolved via path.resolve() before being passed as an argv
 * element — this mitigates path-traversal concerns by materializing the full
 * absolute path before the CLI sees it, and ensures tilde/relative paths
 * resolve in the caller's cwd rather than the notebooklm-py working directory.
 *
 * Return shape corrects SKILL.md documentation: the actual v0.3.4 response
 * nests under .source and does NOT include a status field (research-verified).
 *
 * @param {string} notebookId
 * @param {string} filepath
 * @returns {Promise<{sourceId: string, title: string}>}
 */
export async function uploadSource(notebookId, filepath, options = {}) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('uploadSource: notebookId must be a non-empty string');
  }
  if (typeof filepath !== 'string' || filepath.length === 0) {
    throw new TypeError('uploadSource: filepath must be a non-empty string');
  }
  if (options.title !== undefined &&
      (typeof options.title !== 'string' || options.title.length === 0)) {
    throw new TypeError('uploadSource: options.title must be a non-empty string when provided');
  }

  const absolutePath = resolvePath(filepath);
  let uploadPath = absolutePath;
  let tmpDir = null;

  // cp-to-tmp workaround: notebooklm-py v0.3.4 ignores --title for file uploads
  // and uses the basename of the uploaded file as the source title. To control
  // the title we copy the source into a temp dir whose basename equals the
  // desired title, then upload from there.
  if (options.title) {
    tmpDir = mkdtempSync(join(tmpdir(), 'cds-nblm-'));
    uploadPath = join(tmpDir, options.title);
    copyFileSync(absolutePath, uploadPath);
  }

  try {
    const args = ['source', 'add', uploadPath, '-n', notebookId, '--json'];

    const parsed = runNotebooklm(args, {
      jsonMode: true,
      functionName: 'uploadSource',
    });

    if (!parsed || typeof parsed !== 'object' || !parsed.source ||
        typeof parsed.source.id !== 'string' || typeof parsed.source.title !== 'string') {
      throw new NotebooklmCliError(
        'uploadSource: expected { source: { id, title } } in --json output',
        { command: args, exitCode: 0, stderr: '' }
      );
    }

    return { sourceId: parsed.source.id, title: parsed.source.title };
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

/**
 * Delete a source by ID. This command does NOT support --json, so the wrapper
 * runs in text mode and parses the "Deleted source: <id>" line from stdout.
 *
 * @param {string} notebookId
 * @param {string} sourceId
 * @returns {Promise<{deleted: true, sourceId: string}>}
 */
export async function deleteSource(notebookId, sourceId) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('deleteSource: notebookId must be a non-empty string');
  }
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    throw new TypeError('deleteSource: sourceId must be a non-empty string');
  }

  const args = ['source', 'delete', sourceId, '-n', notebookId, '-y'];
  const { stdout } = runNotebooklm(args, {
    jsonMode: false,
    functionName: 'deleteSource',
  });

  const match = stdout.match(/^Deleted source:\s*(\S+)/m);
  if (!match) {
    throw new NotebooklmCliError(
      `deleteSource: unexpected output format from notebooklm source delete — got: ${stdout.slice(0, 200)}`,
      { command: args, exitCode: 0, stderr: '' }
    );
  }

  return { deleted: true, sourceId: match[1] };
}

/**
 * Delete a source by its exact title. No --json support — text-mode parse.
 *
 * @param {string} notebookId
 * @param {string} title - exact title match (case-sensitive)
 * @returns {Promise<{deleted: true, sourceId: string}>}
 */
export async function deleteSourceByTitle(notebookId, title) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('deleteSourceByTitle: notebookId must be a non-empty string');
  }
  if (typeof title !== 'string' || title.length === 0) {
    throw new TypeError('deleteSourceByTitle: title must be a non-empty string');
  }

  const args = ['source', 'delete-by-title', title, '-n', notebookId, '-y'];
  const { stdout } = runNotebooklm(args, {
    jsonMode: false,
    functionName: 'deleteSourceByTitle',
  });

  const match = stdout.match(/^Deleted source:\s*(\S+)/m);
  if (!match) {
    throw new NotebooklmCliError(
      `deleteSourceByTitle: unexpected output format from notebooklm source delete-by-title — got: ${stdout.slice(0, 200)}`,
      { command: args, exitCode: 0, stderr: '' }
    );
  }

  return { deleted: true, sourceId: match[1] };
}

/**
 * Replace an existing source with a new file: delete-then-upload.
 *
 * NOT atomic. Failure modes (per research §updateSource Strategy Analysis):
 *   - Delete succeeds, upload fails → old source is GONE, new not uploaded.
 *     Phase 4 manifest retains "not synced" state and re-attempts next sync.
 *   - Delete fails (not found, rate limit, etc.) → upload is NOT attempted.
 *     Safe — no data loss.
 *
 * Callers that need atomicity should implement their own upload-first-then-delete
 * pattern externally. Phase 2 scope is the simpler delete-first orchestration.
 *
 * @param {string} notebookId
 * @param {string} sourceId - ID of source to delete
 * @param {string} filepath - path to replacement file
 * @returns {Promise<{sourceId: string, title: string}>}
 *   Shape from uploadSource — the NEW sourceId, not the deleted one.
 */
export async function updateSource(notebookId, sourceId, filepath) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('updateSource: notebookId must be a non-empty string');
  }
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    throw new TypeError('updateSource: sourceId must be a non-empty string');
  }
  if (typeof filepath !== 'string' || filepath.length === 0) {
    throw new TypeError('updateSource: filepath must be a non-empty string');
  }

  await deleteSource(notebookId, sourceId);
  return await uploadSource(notebookId, filepath);
}

/**
 * List all NotebookLM notebooks owned by the authenticated user.
 *
 * The notebooklm-py v0.3.4 API returns extra fields `index` (1-based position)
 * and `is_owner` (boolean) and a top-level `count` — research finding #1 on live CLI
 * run 2026-04-11. SKILL.md documentation is outdated. This function strips `index`,
 * `is_owner`, and `count` during normalization (per Phase 2 D-08 convention).
 *
 * @returns {Promise<Array<{id: string, title: string, createdAt: string | null}>>}
 *   Normalized — index/is_owner/count stripped. createdAt is a string on list output
 *   but nullable per research finding (null on fresh create results).
 *
 * @throws {NotebooklmNotInstalledError} if notebooklm binary is missing from PATH
 * @throws {NotebooklmRateLimitError}    if upstream signals rate limit
 * @throws {NotebooklmCliError}          on parse error, missing `notebooks` key,
 *                                        or entries lacking id/title
 */
export async function listNotebooks() {
  const args = ['list', '--json'];
  const parsed = runNotebooklm(args, {
    jsonMode: true,
    functionName: 'listNotebooks',
  });

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.notebooks)) {
    throw new NotebooklmCliError(
      'listNotebooks: expected { notebooks: [...] } in --json output',
      { command: args, exitCode: 0, stderr: '' }
    );
  }

  return parsed.notebooks.map((nb) => {
    if (typeof nb.id !== 'string' || typeof nb.title !== 'string') {
      throw new NotebooklmCliError(
        'listNotebooks: notebook entry missing required id/title fields',
        { command: args, exitCode: 0, stderr: '' }
      );
    }
    return {
      id: nb.id,
      title: nb.title,
      createdAt: nb.created_at ?? null,
    };
  });
}

/**
 * Ask a question to a NotebookLM notebook and return the answer with citations.
 *
 * Always starts a best-effort fresh conversation — does not pass --conversation-id.
 * notebooklm-py may reuse cached context internally (context.json), but this wrapper
 * makes no attempt to continue prior conversations. No conversation continuation
 * support in v1.
 *
 * Retries up to 2 times with exponential backoff (1s → 2s) on rate-limit errors.
 * Non-rate-limit errors are thrown immediately without retry.
 *
 * @param {string} notebookId - ID of the target notebook
 * @param {string} question   - The question to ask (passed as last positional arg per CLI spec)
 * @param {object} [options]
 * @param {string[]} [options.sourceIds] - Optional array of source IDs to filter the answer
 * @returns {Promise<{answer: string, citations: Array<{index: number|null, sourceId: string, sourceTitle: null, snippet: string|null}>}>}
 *
 * @throws {TypeError}                    if notebookId or question are missing/invalid
 * @throws {NotebooklmNotInstalledError}  if notebooklm binary is missing from PATH
 * @throws {NotebooklmRateLimitError}     if rate limit is hit after all retries exhausted
 * @throws {NotebooklmCliError}           on any other failure
 */
export async function askNotebook(notebookId, question, options = {}) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('askNotebook: notebookId must be a non-empty string');
  }
  if (typeof question !== 'string' || question.length === 0) {
    throw new TypeError('askNotebook: question must be a non-empty string');
  }

  // Build args array — question MUST come last (after all flags), per CLI spec (Pitfall 6).
  const args = ['ask', '-n', notebookId, '--json'];
  if (options.sourceIds && options.sourceIds.length > 0) {
    for (const sid of options.sourceIds) {
      args.push('--source', sid);
    }
  }
  args.push(question);

  // Retry loop: max 2 retries (3 total attempts) on rate-limit only.
  // Delays: 1000ms (attempt 0), 2000ms (attempt 1).
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const parsed = runNotebooklm(args, { jsonMode: true, functionName: 'askNotebook' });

      if (!parsed || typeof parsed.answer !== 'string') {
        throw new NotebooklmCliError(
          'askNotebook: expected {answer, references} in --json output',
          { command: args, exitCode: 0, stderr: '' }
        );
      }

      const citations = (parsed.references || []).map((ref) => ({
        index: ref.citation_number ?? null,
        sourceId: ref.source_id,
        sourceTitle: null, // NOT in ask output — v1 omits per RESEARCH.md
        snippet: ref.cited_text ?? null,
      }));

      return { answer: parsed.answer, citations };
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError && attempt < 2) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
