/**
 * lib/budget.mjs — Budget detection utilities for Phase 20 (LIMIT-01)
 *
 * Reads session token usage from hook input, compares against a configurable
 * threshold, and tracks whether the warning has already fired for the current
 * threshold crossing (no-spam guarantee).
 *
 * State file: ~/.claude/budget-state.json
 * Config:     ~/.claude/budget-config.json  (or env BUDGET_THRESHOLD_PERCENT)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_THRESHOLD = 70; // percent

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * Load the configured threshold (0–100).
 * Priority: env BUDGET_THRESHOLD_PERCENT > config file > default (70)
 */
export function loadThreshold() {
  const fromEnv = parseInt(process.env.BUDGET_THRESHOLD_PERCENT, 10);
  if (!isNaN(fromEnv) && fromEnv >= 0 && fromEnv <= 100) {
    return fromEnv;
  }

  const configPath = join(homedir(), '.claude', 'budget-config.json');
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      const val = parseInt(cfg.threshold, 10);
      if (!isNaN(val) && val >= 0 && val <= 100) return val;
    } catch {
      // corrupt config — fall through to default
    }
  }

  return DEFAULT_THRESHOLD;
}

/**
 * Write budget config file with the given threshold.
 */
export function saveThreshold(threshold) {
  const configPath = join(homedir(), '.claude', 'budget-config.json');
  writeFileSync(configPath, JSON.stringify({ threshold }, null, 2) + '\n', 'utf8');
}

// ── State ────────────────────────────────────────────────────────────────────

const STATE_PATH = join(homedir(), '.claude', 'budget-state.json');

/**
 * Load warning state.
 * Returns { firedForSession, firedAtPercent } or null if no state file.
 *
 * firedForSession: string — session identifier (date or session ID)
 * firedAtPercent:  number — percentage at which the warning last fired
 */
export function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Persist warning state so subsequent hook invocations skip the warning.
 */
export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/**
 * Clear warning state (call on SessionStart to reset per-session tracking).
 */
export function clearState() {
  if (existsSync(STATE_PATH)) {
    writeFileSync(STATE_PATH, JSON.stringify(null, null, 2) + '\n', 'utf8');
  }
}

// ── Usage parsing ────────────────────────────────────────────────────────────

/**
 * Parse usage from statusline bridge metrics.
 *
 * The statusline bridge file ($TMPDIR/claude-ctx-{session_id}.json) contains:
 *   { session_id, remaining_percentage, used_pct, timestamp }
 *
 * @param {object} metrics — parsed statusline bridge JSON
 * @returns {{ usedPct: number, remainingPct: number } | null}
 */
export function parseUsage(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  const usedPct = metrics.used_pct;
  if (typeof usedPct !== 'number') return null;
  return { usedPct, remainingPct: metrics.remaining_percentage ?? (100 - usedPct) };
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Determine whether the budget warning should fire.
 *
 * Rules (LIMIT-01):
 *   1. percent >= threshold           → candidate for warning
 *   2. state.firedAtPercent < percent → percent has grown since last fire, warn again only if
 *      usage jumped to a new 10-point band above threshold (prevents re-fire on same crossing)
 *
 * Simplified "fire once per crossing" implementation:
 *   - Warning fires when percent first crosses threshold in this session.
 *   - If it already fired this session (firedForSession == sessionId), skip.
 *   - sessionId is the current UTC date string (YYYY-MM-DD) — resets daily.
 *
 * @param {number} percent
 * @param {number} threshold
 * @param {object|null} state — result of loadState()
 * @param {string} sessionId
 * @returns {boolean}
 */
export function shouldWarn(percent, threshold, state, sessionId) {
  if (percent < threshold) return false;
  if (!state) return true;
  // If warning already fired for this session, suppress
  if (state.firedForSession === sessionId) return false;
  return true;
}

/**
 * Format the budget warning message.
 *
 * @param {number} usedPct — current usage percent (0-100)
 * @param {number} threshold — configured threshold
 * @returns {string}
 */
export function formatWarning(usedPct, threshold) {
  const remaining = 100 - usedPct;
  return [
    ``,
    `  ⚠  BUDGET WARNING: Session context is ${usedPct}% used (threshold: ${threshold}%)`,
    `     Remaining: ~${remaining}% of context window`,
    `     Consider wrapping up or starting a new session soon.`,
    `     Run: claude-dev-stack budget continue  -- to choose your next step.`,
    ``,
  ].join('\n');
}

/**
 * Current session ID — UTC date string (YYYY-MM-DD).
 * Resets the "already fired" state daily without needing explicit session tracking.
 */
export function currentSessionId() {
  return new Date().toISOString().slice(0, 10);
}
