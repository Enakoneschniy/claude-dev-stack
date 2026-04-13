#!/usr/bin/env node
/**
 * hooks/budget-check.mjs — PostToolUse hook: budget detection (LIMIT-01)
 *
 * Reads session_id from Claude Code stdin, then loads usage metrics from
 * the statusline bridge file ($TMPDIR/claude-ctx-{session_id}.json).
 * Prints a warning when usage crosses the configured threshold.
 *
 * Design contract (LIMIT-01):
 *   - Warning fires when usage first crosses threshold in this session.
 *   - Warning fires at most ONCE per session (no spam on subsequent calls).
 *   - Threshold is configurable via ~/.claude/budget-config.json or
 *     BUDGET_THRESHOLD_PERCENT env var.
 *   - Silent on any error — never disrupts normal session flow.
 *   - Always exits 0.
 *
 * State file: ~/.claude/budget-state.json  (persists across hook invocations)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Read and parse stdin payload to get session_id
  let payload;
  try {
    const chunks = [];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
    });

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const sessionId = payload.session_id;
  if (!sessionId || /[/\\]|\.\./.test(sessionId)) return;

  // 2. Read usage metrics from statusline bridge file
  const metricsPath = join(tmpdir(), `claude-ctx-${sessionId}.json`);
  if (!existsSync(metricsPath)) return;

  let metrics;
  try {
    metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  } catch {
    return;
  }

  // Ignore stale metrics (older than 120s)
  const now = Math.floor(Date.now() / 1000);
  if (metrics.timestamp && (now - metrics.timestamp) > 120) return;

  const usedPct = metrics.used_pct;
  if (typeof usedPct !== 'number') return;

  // 3. Import budget utilities
  let budget;
  try {
    budget = await import(join(__dirname, '..', 'lib', 'budget.mjs'));
  } catch {
    try {
      budget = await import(join(__dirname, 'lib', 'budget.mjs'));
    } catch {
      return;
    }
  }

  const { loadThreshold, loadState, saveState, shouldWarn, formatWarning } = budget;

  // 4. Load threshold and state
  const threshold = loadThreshold();
  const state = loadState();

  // 5. Decide whether to warn
  if (!shouldWarn(usedPct, threshold, state, sessionId)) return;

  // 6. Fire warning
  process.stdout.write(formatWarning(usedPct, threshold));

  // 7. Persist state so this warning does not fire again this session
  saveState({ firedForSession: sessionId, firedAtPercent: usedPct });
}

main().catch(() => {}).finally(() => {
  process.exit(0);
});
