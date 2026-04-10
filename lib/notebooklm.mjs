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
