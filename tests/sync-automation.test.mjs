/**
 * tests/sync-automation.test.mjs — SYNC-01 structural verification tests.
 *
 * Strategy: grep-based source assertions verify the hook chain meets all four
 * SYNC-01 success criteria without executing any external processes.
 *
 * SYNC-01 criteria:
 *   1. session-end-check.sh triggers notebooklm-sync-trigger.mjs (|| true)
 *   2. notebooklm-sync-trigger.mjs spawns detached background process + unref
 *   3. Failure non-blocking: try/catch exits 0 in trigger; uncaughtException +
 *      unhandledRejection handlers in runner
 *   4. Log output goes to ~/vault/.notebooklm-sync.log
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', 'hooks');

// Read all three hook-chain files once.
const shellHook = readFileSync(join(hooksDir, 'session-end-check.sh'), 'utf8');
const triggerSrc = readFileSync(join(hooksDir, 'notebooklm-sync-trigger.mjs'), 'utf8');
const runnerSrc = readFileSync(join(hooksDir, 'notebooklm-sync-runner.mjs'), 'utf8');

// ── SYNC-01 Criterion 1: session-end hook invokes the trigger ─────────────────

describe('SYNC-01: session-end sync automation', () => {

  it('session-end-check.sh references notebooklm-sync-trigger.mjs', () => {
    assert.ok(
      shellHook.includes('notebooklm-sync-trigger.mjs'),
      'session-end-check.sh must reference notebooklm-sync-trigger.mjs',
    );
  });

  it('session-end-check.sh invokes trigger with || true (non-blocking)', () => {
    // The trigger invocation line must end with || true so session end never fails.
    assert.ok(
      /node\s+"?\$TRIGGER"?\s+.*\|\|\s+true/.test(shellHook) ||
      /node\s+"\$TRIGGER"\s+2>\/dev\/null\s+\|\|\s+true/.test(shellHook),
      'session-end-check.sh trigger invocation must use || true',
    );
  });

  // ── SYNC-01 Criterion 2: background detached spawn ───────────────────────────

  it('notebooklm-sync-trigger.mjs uses detached: true in spawn options', () => {
    assert.ok(
      /detached:\s*true/.test(triggerSrc),
      'notebooklm-sync-trigger.mjs must spawn with detached: true',
    );
  });

  it('notebooklm-sync-trigger.mjs calls child.unref() to release parent', () => {
    assert.ok(
      triggerSrc.includes('child.unref()'),
      'notebooklm-sync-trigger.mjs must call child.unref()',
    );
  });

  it('notebooklm-sync-trigger.mjs calls process.exit(0) after spawn', () => {
    // Parent must exit immediately after unref so session-end UI is unblocked.
    const unrefIdx = triggerSrc.indexOf('child.unref()');
    const exitAfter = triggerSrc.indexOf('process.exit(0)', unrefIdx);
    assert.ok(
      unrefIdx !== -1 && exitAfter !== -1,
      'notebooklm-sync-trigger.mjs must call process.exit(0) after child.unref()',
    );
  });

  // ── SYNC-01 Criterion 3: failure non-blocking ────────────────────────────────

  it('notebooklm-sync-trigger.mjs wraps main() in try/catch with process.exit(0)', () => {
    // The outer try/catch ensures any error still exits 0 (NBLM-23).
    assert.ok(
      /try\s*\{[\s\S]*?main\(\)[\s\S]*?\}\s*catch/.test(triggerSrc),
      'notebooklm-sync-trigger.mjs must wrap main() call in try/catch',
    );
    // Catch block must call process.exit(0).
    const catchIdx = triggerSrc.lastIndexOf('} catch');
    const exitInCatch = triggerSrc.indexOf('process.exit(0)', catchIdx);
    assert.ok(
      exitInCatch !== -1,
      'notebooklm-sync-trigger.mjs catch block must call process.exit(0)',
    );
  });

  it('notebooklm-sync-runner.mjs has uncaughtException handler', () => {
    assert.ok(
      triggerSrc.includes('uncaughtException') ||
      runnerSrc.includes('uncaughtException'),
      'notebooklm-sync-runner.mjs must have uncaughtException handler',
    );
    assert.ok(
      runnerSrc.includes('uncaughtException'),
      'notebooklm-sync-runner.mjs must register process.on("uncaughtException")',
    );
  });

  it('notebooklm-sync-runner.mjs has unhandledRejection handler', () => {
    assert.ok(
      runnerSrc.includes('unhandledRejection'),
      'notebooklm-sync-runner.mjs must register process.on("unhandledRejection")',
    );
  });

  // ── SYNC-01 Criterion 4: log path ─────────────────────────────────────────────

  it('notebooklm-sync-runner.mjs references .notebooklm-sync.log path', () => {
    assert.ok(
      runnerSrc.includes('.notebooklm-sync.log'),
      'notebooklm-sync-runner.mjs must reference .notebooklm-sync.log',
    );
  });

  it('notebooklm-sync-runner.mjs uses appendFileSync for logging', () => {
    assert.ok(
      runnerSrc.includes('appendFileSync'),
      'notebooklm-sync-runner.mjs must use appendFileSync for log writes',
    );
  });

});
