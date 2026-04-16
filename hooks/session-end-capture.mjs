#!/usr/bin/env node
/**
 * hooks/session-end-capture.mjs — Phase 36 consolidated Stop hook.
 *
 * Runs detached via `hooks/session-end-capture.sh` (double-fork wrapper).
 * Responsibilities (D-51..D-54):
 *   1. Extract structured observations from the Claude Code session
 *      transcript via Haiku + `emit_observations` tool_use.
 *   2. Write observations/entities/relations into the Phase 35 SQLite vault
 *      (transactional; rolls back on any failure).
 *   3. Update `vault/projects/{project}/context.md` Session History pointer.
 *   4. Spawn the NotebookLM sync trigger detached.
 *   5. Push the vault git repo (if a remote is configured).
 *
 * Never blocks Claude Code's Stop event. 3-tier error handling (D-66):
 *   - silent  → exit 0, no log  (missing key, missing transcript, rate limit,
 *                                 SQLite busy, opt-out, schema mismatch at SDK edge)
 *   - log     → exit 0, append to ~/.claude/cds-capture.log (malformed tool_use,
 *                                                             transaction rollback)
 *   - crash   → exit 1, append to the log (unexpected)
 *
 * Env vars:
 *   CLAUDE_SESSION_ID      — required; silent skip if absent
 *   CLAUDE_PROJECT_DIR     — project path (fallback: process.cwd())
 *   VAULT_PATH             — vault root (fallback: ~/vault)
 *   CDS_CAPTURE_TIMEOUT_MS — override the 60s default (tests)
 *   CDS_CAPTURE_DEBUG      — 1 → include stack traces in log entries
 */

import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Dynamic imports with silent-tier fallback (D-66)
// ---------------------------------------------------------------------------
// If @cds/core is not installed (early-alpha users, bundler-skipped dev),
// fall back to silent exit. Installed hook resolves via pnpm workspace
// symlinks during dev; Phase 39 bundler will inline @cds/core for releases.

let dispatchAgent;
let CostTracker;
let openSessionsDB;
let loadTranscript;
let buildExtractionPromptFromMessages;
let emitObservationsTool;
let updateContextHistory;

try {
  ({ dispatchAgent, CostTracker, openSessionsDB } = await import('@cds/core'));
  ({
    loadTranscript,
    // Phase 38 rename: Phase 36's message-shaped builder is now
    // buildExtractionPromptFromMessages; flat-string callers use
    // buildExtractionPrompt from @cds/core/capture instead.
    buildExtractionPromptFromMessages,
    emitObservationsTool,
  } = await import('@cds/core/capture'));
  // Relative specifier resolves against this module's URL both in-repo
  // (hooks/ → ../lib/session-context.mjs) and after wizard install
  // (~/.claude/hooks/ → ~/.claude/lib/session-context.mjs). Vitest mocks
  // this specifier by string match, which is why we avoid absolute joins.
  ({ updateContextHistory } = await import('../lib/session-context.mjs'));
} catch {
  // Silent tier — dependencies not resolvable (fresh install, missing lib).
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Paths resolved from HOME at module-load. Tests that need a different log
// target set CDS_CAPTURE_LOG in env before import (or call appendCaptureLog
// with an explicit path via the exported helper).
const CAPTURE_LOG = process.env.CDS_CAPTURE_LOG || join(homedir(), '.claude', 'cds-capture.log');
const CONFIG_PATH = process.env.CDS_CAPTURE_CONFIG || join(homedir(), '.claude', 'cds-capture-config.json');
const TIMEOUT_MS = Number(process.env.CDS_CAPTURE_TIMEOUT_MS) || 60_000;
const LOG_ROTATE_BYTES = 1_048_576; // 1 MB
const LOG_ROTATE_KEEP = 3;
const DEBUG = process.env.CDS_CAPTURE_DEBUG === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Subprocess wrapper that NEVER interprets shell metachars — argv array only.
 * Mandatory per Phase 36 structural guard (scripts/check-no-shell-interpolation.mjs).
 */
function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { ...options, stdio: options.stdio ?? 'pipe' });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

/**
 * Classify an error into a log tier (D-66). Silent: missing key, missing
 * transcript, rate limit, SQLite busy, opt-out. Log: malformed output,
 * rollback, schema drift. Crash: anything else (ReferenceError, bug).
 */
function classifyError(err) {
  if (err?.silent === true) return 'silent';
  if (err?.code === 'ENOENT') return 'silent';
  if (err?.name === 'LicenseKeyError') return 'silent';
  const msg = String(err?.message ?? '');
  if (/rate.?limit/i.test(msg)) return 'silent';
  if (/SQLITE_BUSY/i.test(msg)) return 'silent';
  if (err?.code === 'SQLITE_BUSY') return 'silent';
  if (/capture-timeout/i.test(msg)) return 'log';
  if (/malformed|schema|transaction|rollback|tool_use/i.test(msg)) return 'log';
  if (/AbortError|aborted/i.test(msg)) return 'log';
  // Programmer error / unknown — crash tier.
  if (err instanceof ReferenceError || err instanceof TypeError) return 'crash';
  return 'log';
}

function serializeError(err) {
  if (!err) return { message: String(err) };
  const out = {
    message: String(err.message ?? err),
    code: err.code,
    name: err.name,
  };
  if (DEBUG && err.stack) out.stack = err.stack;
  return out;
}

/**
 * Rotate ~/.claude/cds-capture.log if it has grown past LOG_ROTATE_BYTES.
 * Keeps the last LOG_ROTATE_KEEP (.log.1, .log.2, .log.3). Best-effort —
 * any filesystem error is swallowed (this runs in a detached log path).
 */
async function rotateLogIfNeeded(logPath) {
  const target = logPath ?? currentCaptureLog();
  try {
    const st = await stat(target);
    if (st.size < LOG_ROTATE_BYTES) return;
  } catch {
    return; // file doesn't exist yet — nothing to rotate
  }
  try {
    // Drop oldest, shift the chain.
    for (let i = LOG_ROTATE_KEEP; i >= 1; i--) {
      const from = i === 1 ? target : `${target}.${i - 1}`;
      const to = `${target}.${i}`;
      try {
        await rename(from, to);
      } catch {
        /* missing intermediate file → skip */
      }
    }
  } catch {
    /* rotation failure is non-fatal */
  }
}

/** Resolve the log target at call time so tests can override via env. */
function currentCaptureLog() {
  return process.env.CDS_CAPTURE_LOG || join(homedir(), '.claude', 'cds-capture.log');
}

async function appendCaptureLog(entry) {
  try {
    const target = currentCaptureLog();
    await mkdir(dirname(target), { recursive: true });
    await rotateLogIfNeeded(target);
    const line =
      typeof entry === 'string'
        ? entry.replace(/\n$/, '') + '\n'
        : JSON.stringify(entry) + '\n';
    await appendFile(target, line);
  } catch {
    /* log failure stays silent — never surface */
  }
}

/**
 * Extract the `emit_observations` tool_use payload from a dispatchAgent result.
 * Tries (in order):
 *   1. result.toolUses[*]  (Phase 36 canonical shape — see agent-dispatcher.ts)
 *   2. result.tool_uses[*] (legacy snake_case shape, defensive)
 *   3. JSON.parse(result.output) when the model emits raw JSON as text
 *      (some Haiku variants bypass tool_use under certain system prompts)
 * Returns null when no valid payload can be recovered.
 */
function extractToolUsePayload(result) {
  const uses = result?.toolUses ?? result?.tool_uses;
  if (Array.isArray(uses)) {
    for (const u of uses) {
      if (u?.name === 'emit_observations' && u?.input && typeof u.input === 'object') {
        return u.input;
      }
    }
  }
  // Fallback: try to interpret the raw output as JSON.
  const text = typeof result?.output === 'string' ? result.output.trim() : '';
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'session_summary' in parsed) {
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function runCapture() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    throw Object.assign(new Error('CLAUDE_SESSION_ID missing'), { silent: true });
  }

  const projectPath = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Opt-out (D-66 silent)
  if (existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg?.enabled === false) {
        throw Object.assign(new Error('cds-capture disabled via config'), { silent: true });
      }
    } catch (err) {
      if (err?.silent) throw err;
      // Malformed config → proceed (we already tested `.silent`; parse errors fall through).
    }
  }

  // Transcript load (silent tier if missing per D-66)
  const slug = projectPath.replace(/\//g, '-').replace(/^-/, '');
  let messages;
  try {
    messages = await loadTranscript(sessionId, slug);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw Object.assign(new Error('transcript not found'), { silent: true });
    }
    throw err;
  }
  if (!messages || messages.length === 0) {
    throw Object.assign(new Error('transcript empty'), { silent: true });
  }

  const { systemPrompt, userPrompt } = buildExtractionPromptFromMessages(messages);

  // 60s budget (D-65)
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('capture-timeout-60s')),
    TIMEOUT_MS,
  );

  const costTracker = new CostTracker(sessionId);
  let payload;
  try {
    const result = await dispatchAgent({
      model: 'haiku',
      system: systemPrompt,
      prompt: userPrompt,
      tools: [emitObservationsTool],
      signal: controller.signal,
      session_id: sessionId,
    });

    // CostTracker uses pricing table keyed by resolved model ID. Haiku alias
    // resolves to `claude-haiku-4-5`. `record()` throws UnknownModelError if
    // the model isn't priced — catch and skip (we still persist observations).
    try {
      costTracker.record({ model: 'claude-haiku-4-5', tokens: result.tokens });
    } catch {
      /* unpriced model — cost dump will show 0 for this call */
    }

    payload = extractToolUsePayload(result);
    if (!payload) {
      throw new Error('malformed tool_use payload — no emit_observations block');
    }
  } finally {
    clearTimeout(timer);
  }

  // SQLite writes inside a transaction (auto-rollback on throw per D-66 log tier).
  const db = openSessionsDB(projectPath);
  const projectName = basename(projectPath);

  const transactionFn = db.transaction?.bind(db);
  const doWrite = () => {
    if (controller.signal.aborted) {
      throw new Error('capture-timeout-60s before DB writes');
    }
    db.createSession({
      id: sessionId,
      project: projectName,
      summary: String(payload.session_summary ?? '').slice(0, 1000),
    });
    const entityIds = new Map();
    for (const e of payload.entities ?? []) {
      if (!e || typeof e.name !== 'string' || typeof e.type !== 'string') continue;
      const row = db.upsertEntity({ name: e.name, type: e.type });
      entityIds.set(e.name, row.id);
    }
    for (const o of payload.observations ?? []) {
      if (!o || typeof o.type !== 'string' || typeof o.content !== 'string') continue;
      const ids = Array.isArray(o.entities)
        ? o.entities
            .map((n) => entityIds.get(n))
            .filter((x) => typeof x === 'number')
        : [];
      db.appendObservation({
        sessionId,
        type: o.type,
        content: o.content,
        entities: ids,
      });
    }
    for (const r of payload.relations ?? []) {
      if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') continue;
      const fromId = entityIds.get(r.from);
      const toId = entityIds.get(r.to);
      if (typeof fromId === 'number' && typeof toId === 'number') {
        db.linkRelation({
          fromEntity: fromId,
          toEntity: toId,
          relationType: String(r.type ?? 'related_to'),
          sessionId,
        });
      }
    }
  };

  // Prefer the transaction API when available (better-sqlite3 rolls back on throw).
  // In tests that mock the DB without a `transaction` builder, fall back to a
  // direct call — the test harness can still assert rollback via spy ordering.
  if (typeof transactionFn === 'function') {
    const txn = db.transaction(doWrite);
    txn();
  } else {
    doWrite();
  }

  // context.md pointer update (D-54). Never fatal.
  try {
    const date = new Date().toISOString().slice(0, 10);
    const sessionLogFilename = `${date}-${sessionId.slice(0, 8)}.md`;
    updateContextHistory({
      vaultPath: process.env.VAULT_PATH || join(homedir(), 'vault'),
      projectName,
      sessionLogFilename,
      sessionTitle: String(payload.session_summary ?? '').slice(0, 80),
    });
  } catch (err) {
    if (DEBUG) process.stderr.write(`context.md update failed: ${err?.message}\n`);
    /* logged at log-tier upstream via the main try/catch if needed */
  }

  // NotebookLM sync trigger — fire-and-forget detached (D-53).
  const nblmTrigger = join(homedir(), '.claude', 'hooks', 'notebooklm-sync-trigger.mjs');
  if (existsSync(nblmTrigger)) {
    try {
      const child = spawn(process.execPath, [nblmTrigger], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          VAULT_PATH: process.env.VAULT_PATH || join(homedir(), 'vault'),
        },
      });
      child.unref();
    } catch {
      /* spawn failure is non-fatal */
    }
  }

  // Vault git push — argv spawn only, NEVER shell interpolation.
  const vaultPath = process.env.VAULT_PATH || join(homedir(), 'vault');
  if (existsSync(join(vaultPath, '.git'))) {
    try {
      const remoteCheck = await spawnAsync('git', ['remote'], { cwd: vaultPath });
      if (remoteCheck.code === 0 && remoteCheck.stdout.trim()) {
        await spawnAsync('git', ['add', '-A'], { cwd: vaultPath });
        await spawnAsync(
          'git',
          ['commit', '-m', `Session: ${projectName} ${new Date().toISOString().slice(0, 10)}`, '--quiet'],
          { cwd: vaultPath },
        );
        await spawnAsync('git', ['push', '--quiet'], { cwd: vaultPath });
      }
    } catch {
      /* vault push is best-effort — silent skip on any failure */
    }
  }

  // Cost log (D-58 post-flight).
  await appendCaptureLog(costTracker.dump());
}

// ---------------------------------------------------------------------------
// Entrypoint (guarded so tests can import runCapture without side-effects)
// ---------------------------------------------------------------------------

const IS_ENTRYPOINT =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file://${process.argv[1]}`;

async function main() {
  try {
    await runCapture();
    process.exit(0);
  } catch (err) {
    const tier = classifyError(err);
    try {
      await mkdir(dirname(currentCaptureLog()), { recursive: true });
      if (tier !== 'silent') {
        await appendCaptureLog({
          ts: new Date().toISOString(),
          tier,
          err: serializeError(err),
        });
      }
    } catch {
      /* log failure stays silent */
    }
    process.exit(tier === 'crash' ? 1 : 0);
  }
}

if (IS_ENTRYPOINT) {
  // Fire the main flow; top-level await above has already resolved dynamic imports.
  main();
}

export {
  runCapture,
  classifyError,
  extractToolUsePayload,
  appendCaptureLog,
  rotateLogIfNeeded,
  spawnAsync,
  serializeError,
  TIMEOUT_MS,
  CAPTURE_LOG,
};
