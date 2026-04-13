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
 * Parse token usage from a Claude Code PostToolUse hook stdin payload.
 *
 * Claude Code delivers a JSON object on stdin to PostToolUse hooks.
 * The top-level `usage` key (when present) contains:
 *   { input_tokens, output_tokens, cache_read_input_tokens,
 *     cache_creation_input_tokens, context_window_tokens }
 *
 * @param {object} hookPayload — parsed stdin JSON from Claude Code
 * @returns {{ usedTokens: number, totalTokens: number } | null}
 */
export function parseUsage(hookPayload) {
  if (!hookPayload || typeof hookPayload !== 'object') return null;

  const usage = hookPayload.usage;
  if (!usage || typeof usage !== 'object') return null;

  const contextWindowTokens = usage.context_window_tokens;
  if (typeof contextWindowTokens !== 'number' || contextWindowTokens <= 0) return null;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  const usedTokens = inputTokens + outputTokens + cacheRead + cacheCreate;

  return { usedTokens, totalTokens: contextWindowTokens };
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Compute usage percentage (0–100). Returns null if usage cannot be determined.
 */
export function computePercent(usedTokens, totalTokens) {
  if (typeof usedTokens !== 'number' || typeof totalTokens !== 'number') return null;
  if (totalTokens <= 0) return null;
  return Math.round((usedTokens / totalTokens) * 100);
}

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
 * @param {number} percent — current usage percent
 * @param {number} threshold — configured threshold
 * @param {number} usedTokens
 * @param {number} totalTokens
 * @returns {string}
 */
export function formatWarning(percent, threshold, usedTokens, totalTokens) {
  const remaining = totalTokens - usedTokens;
  const remainingK = Math.round(remaining / 1000);
  return [
    ``,
    `  ⚠  BUDGET WARNING: Session context is ${percent}% full (threshold: ${threshold}%)`,
    `     Used: ${usedTokens.toLocaleString()} tokens of ${totalTokens.toLocaleString()} total`,
    `     Remaining: ~${remainingK}k tokens`,
    `     Consider wrapping up or starting a new session soon.`,
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
