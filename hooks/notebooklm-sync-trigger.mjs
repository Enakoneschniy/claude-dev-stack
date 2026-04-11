#!/usr/bin/env node
/**
 * hooks/notebooklm-sync-trigger.mjs — Fire-and-forget NotebookLM sync launcher.
 *
 * Invoked from hooks/session-end-check.sh after context.md update and before
 * vault git push (D-07 ordering).
 *
 * Contract (ADR-0011, NBLM-21/22/23):
 *   - Checks `notebooklm` binary presence synchronously.
 *   - If absent -> exit 0 silently (feature not configured).
 *   - If present -> spawn detached runner process, unref, exit 0 immediately.
 *   - Must complete in <100ms (verified by test). Parent event loop never blocked.
 *   - All errors caught -> exit 0. No terminal noise on any code path.
 *
 * No lib/*.mjs imports — trigger must be fast and self-contained.
 *
 * Environment:
 *   VAULT_PATH — vault root (default: $HOME/vault)
 */

import { existsSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Inline hasCommand — avoids importing lib/shared.mjs to keep trigger fast.
 * Uses only a hardcoded command name (no user input concatenated).
 * The `name` arg is always the literal string 'notebooklm' — no injection risk.
 */
function hasCommandInline(name) {
  try {
    execSync(`which ${name}`, { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  // 1. Check binary presence — silent skip if not installed (NBLM-21).
  if (!hasCommandInline('notebooklm')) {
    process.exit(0);
  }

  // 2. Resolve vault root — skip if not found.
  const vaultRoot = process.env.VAULT_PATH || join(homedir(), 'vault');
  if (!existsSync(vaultRoot)) {
    process.exit(0);
  }

  // 3. Open log file fd for append (integer fd required by spawn stdio — R5).
  const logPath = join(vaultRoot, '.notebooklm-sync.log');
  let logFd;
  try {
    logFd = openSync(logPath, 'a');
  } catch {
    // Cannot open log — still attempt spawn with ignore stdio.
    logFd = null;
  }

  // 4. Resolve runner path — sibling file.
  const runnerPath = fileURLToPath(new URL('./notebooklm-sync-runner.mjs', import.meta.url));
  if (!existsSync(runnerPath)) {
    process.exit(0);
  }

  // 5. Spawn detached runner (R5 exact pattern).
  // stdio: ['ignore', logFd, logFd] — stdin ignored, stdout+stderr go to log fd.
  // Fall back to 'ignore' for all if log fd could not be opened.
  const outFd = (typeof logFd === 'number') ? logFd : 'ignore';

  const child = spawn(process.execPath, [runnerPath], {
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: { ...process.env, VAULT_PATH: vaultRoot },
  });

  child.unref();
  process.exit(0);
}

try {
  main();
} catch {
  // NBLM-23: any unhandled error still exits 0 — no terminal noise.
  process.exit(0);
}
