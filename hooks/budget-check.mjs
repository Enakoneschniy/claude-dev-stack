#!/usr/bin/env node
/**
 * hooks/budget-check.mjs — PostToolUse hook: budget detection (LIMIT-01)
 *
 * Claude Code delivers a JSON payload on stdin for PostToolUse hooks.
 * This hook reads that payload, extracts token usage, and prints a warning
 * when usage crosses the configured threshold (default 70%).
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
 *
 * No lib/*.mjs imports allowed in hooks — self-contained only.
 * The lib/budget.mjs module is imported via relative path because this hook
 * ships inside the same package and the relative path is stable.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Read and parse stdin payload (non-blocking read with timeout guard)
  let payload;
  try {
    const chunks = [];
    // stdin may or may not have data — read with a short timeout
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      process.stdin.on('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return; // no stdin data — nothing to check
    payload = JSON.parse(raw);
  } catch {
    return; // unparseable stdin — silent exit
  }

  // 2. Import budget utilities — try source location first (../lib/), then installed (./lib/)
  let budget;
  try {
    budget = await import(join(__dirname, '..', 'lib', 'budget.mjs'));
  } catch {
    try {
      budget = await import(join(__dirname, 'lib', 'budget.mjs'));
    } catch {
      return; // lib not available — silent exit
    }
  }

  const { parseUsage, computePercent, loadThreshold, loadState, saveState,
    shouldWarn, formatWarning, currentSessionId } = budget;

  // 3. Extract token usage from the hook payload
  const usage = parseUsage(payload);
  if (!usage) return; // no usage data — skip

  const { usedTokens, totalTokens } = usage;

  // 4. Compute usage percentage
  const percent = computePercent(usedTokens, totalTokens);
  if (percent === null) return;

  // 5. Load threshold and state
  const threshold = loadThreshold();
  const state = loadState();
  const sessionId = currentSessionId();

  // 6. Decide whether to warn
  if (!shouldWarn(percent, threshold, state, sessionId)) return;

  // 7. Fire warning — print to stdout (Claude Code renders hook stdout to user)
  process.stdout.write(formatWarning(percent, threshold, usedTokens, totalTokens));

  // 8. Persist state so this warning does not fire again today
  saveState({ firedForSession: sessionId, firedAtPercent: percent });
}

main().catch(() => {
  // Always exit 0 — never disrupt the session on error
}).finally(() => {
  process.exit(0);
});
