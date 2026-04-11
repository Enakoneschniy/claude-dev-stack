#!/usr/bin/env node
/**
 * hooks/notebooklm-sync-runner.mjs — Detached subprocess: auth check + syncVault + log.
 *
 * Spawned by hooks/notebooklm-sync-trigger.mjs with detached:true + .unref().
 * Runs after parent trigger has already exited. Never blocks session-end UI.
 *
 * Contract (ADR-0011, NBLM-21/22/23):
 *   1. Appends start-line to ~/vault/.notebooklm-sync.log
 *   2. Runs `notebooklm auth check` — skips sync if auth fails
 *   3. Calls syncVault({ vaultRoot }) — catches ALL errors
 *   4. Writes result line to log
 *   5. Exits 0 ALWAYS — never throws, never propagates
 *
 * Log format (D-14): {ISO} [level] message key=val ...
 *
 * Environment:
 *   VAULT_PATH — vault root (default: $HOME/vault)
 *   NOTEBOOKLM_NOTEBOOK_NAME — optional notebook name override
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

import { syncVault } from '../lib/notebooklm-sync.mjs';
import {
  NotebooklmNotInstalledError,
  NotebooklmRateLimitError,
  NotebooklmCliError,
} from '../lib/notebooklm.mjs';

// ── Module-scope constants (accessible in uncaughtException handler) ──────────

const VAULT_ROOT = process.env.VAULT_PATH || join(homedir(), 'vault');
const LOG_PATH = join(VAULT_ROOT, '.notebooklm-sync.log');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clip a string to max chars — prevents vault content in stderr from flooding log.
 * T-05-10 mitigation.
 */
function truncate(s, max = 200) {
  const str = String(s ?? '');
  return str.length <= max ? str : str.slice(0, max) + '...';
}

/**
 * Append one D-14 log line: "{ISO} [level] message key=val ..."
 * Wrapped in try/catch — log-write failure must never propagate.
 */
function appendLogLine(level, message, kv = {}) {
  try {
    const ts = new Date().toISOString();
    const kvStr = Object.entries(kv)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    const line = kvStr ? `${ts} [${level}] ${message} ${kvStr}\n` : `${ts} [${level}] ${message}\n`;
    appendFileSync(LOG_PATH, line, 'utf8');
  } catch {
    // Best-effort — log failures drop silently (NBLM-23).
  }
}

// ── Crash handlers (installed BEFORE main() runs) ─────────────────────────────

process.on('uncaughtException', (err) => {
  appendLogLine('error', 'crash:', { reason: truncate(err && err.message ? err.message : String(err)) });
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  appendLogLine('error', 'crash:', { reason: truncate(String(reason)) });
  process.exit(0);
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // a. Log sync start.
  appendLogLine('info', 'sync start', { project: basename(VAULT_ROOT) });

  // b. Vault existence guard.
  if (!existsSync(VAULT_ROOT)) {
    appendLogLine('info', 'sync skipped', { reason: 'vault-not-found' });
    process.exit(0);
  }

  // c. Auth check — never use 'inherit' stdio in detached context.
  const authResult = spawnSync('notebooklm', ['auth', 'check'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  // d. Skip if auth fails.
  if (authResult.error || authResult.status !== 0) {
    appendLogLine('info', 'sync skipped', { reason: 'auth-check-failed' });
    process.exit(0);
  }

  // e. Run syncVault — catch ALL errors (NBLM-23).
  let stats;
  try {
    const notebookName = process.env.NOTEBOOKLM_NOTEBOOK_NAME || undefined;
    stats = await syncVault({ vaultRoot: VAULT_ROOT, notebookName });
  } catch (err) {
    // g. Classify error and log at appropriate level.
    if (err instanceof NotebooklmNotInstalledError) {
      // Defense-in-depth: trigger should have filtered this, but be safe.
      appendLogLine('info', 'sync skipped', { reason: 'binary-missing' });
    } else if (err instanceof NotebooklmRateLimitError) {
      appendLogLine('info', 'sync rate-limited', { reason: truncate(err.message) });
    } else if (err instanceof NotebooklmCliError) {
      appendLogLine('error', 'sync failed', {
        reason: truncate(err.message),
        exitCode: err.exitCode ?? 'unknown',
      });
    } else {
      appendLogLine('error', 'sync failed', { reason: truncate(err && err.message ? err.message : String(err)) });
    }
    process.exit(0);
  }

  // f. Log result.
  if (stats.rateLimited) {
    appendLogLine('info', 'sync rate-limited', {});
  } else {
    appendLogLine('info', 'sync done', {
      uploaded: stats.uploaded,
      skipped: stats.skipped,
      failed: stats.failed,
      duration: `${stats.durationMs}ms`,
    });
    if (stats.errors && stats.errors.length > 0) {
      appendLogLine('warn', 'sync partial', { errorCount: stats.errors.length });
    }
  }

  // h. Always exit 0.
  process.exit(0);
}

// Last line of defense — .catch ensures async errors are caught before handlers fire.
main().catch(() => process.exit(0));
