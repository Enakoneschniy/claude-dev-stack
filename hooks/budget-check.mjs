#!/usr/bin/env node
/**
 * hooks/budget-check.mjs — UserPromptSubmit hook: plan usage detection
 *
 * Queries Anthropic's OAuth usage API to get real plan utilization
 * (5-hour, 7-day, extra usage). Shows warning when any metric crosses
 * the configured threshold.
 *
 * OAuth token: macOS Keychain "Claude Code-credentials" entry.
 * API: GET https://api.anthropic.com/api/oauth/usage
 *
 * Design:
 *   - Fires at most ONCE per session per threshold crossing.
 *   - Threshold configurable via ~/.claude/budget-config.json (default 70%).
 *   - Silent on any error — never disrupts session flow.
 *   - Always exits 0.
 *   - API call cached for 60s to avoid hammering the endpoint.
 *
 * State: ~/.claude/budget-state.json
 * Cache: ~/.claude/budget-usage-cache.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';

const CLAUDE_DIR = join(homedir(), '.claude');
const STATE_PATH = join(CLAUDE_DIR, 'budget-state.json');
const CONFIG_PATH = join(CLAUDE_DIR, 'budget-config.json');
const CACHE_PATH = join(CLAUDE_DIR, 'budget-usage-cache.json');
const CACHE_TTL_MS = 60_000; // 60s between API calls
const DEFAULT_THRESHOLD = 70;

async function main() {
  // 1. Read stdin for session_id
  let sessionId;
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
    const payload = JSON.parse(raw);
    sessionId = payload.session_id;
  } catch {
    return;
  }
  if (!sessionId) return;

  // 2. Check state — skip if already warned this session
  const threshold = loadThreshold();
  const state = loadState();
  if (state?.firedForSession === sessionId) return;

  // 3. Get usage data (from cache or API)
  const usage = await getUsage();
  if (!usage) return;

  // 4. Find utilizations that cross threshold
  const alerts = [];
  if (usage.five_hour?.utilization >= threshold) {
    alerts.push(`5h: ${usage.five_hour.utilization}%`);
  }
  if (usage.seven_day?.utilization >= threshold) {
    alerts.push(`7d: ${usage.seven_day.utilization}%`);
  }
  if (usage.extra_usage?.utilization >= threshold) {
    alerts.push(`extra: ${Math.round(usage.extra_usage.utilization)}% ($${usage.extra_usage.used_credits} of $${usage.extra_usage.monthly_limit})`);
  }

  if (alerts.length === 0) return;

  // 5. Output warning
  const warning = `⚠ BUDGET WARNING: ${alerts.join(', ')} (threshold: ${threshold}%)`;
  process.stdout.write(warning);

  // 6. Save state
  saveState({ firedForSession: sessionId, alerts });
}

function loadThreshold() {
  const fromEnv = parseInt(process.env.BUDGET_THRESHOLD_PERCENT, 10);
  if (!isNaN(fromEnv) && fromEnv >= 0 && fromEnv <= 100) return fromEnv;
  if (existsSync(CONFIG_PATH)) {
    try {
      const val = parseInt(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).threshold, 10);
      if (!isNaN(val) && val >= 0 && val <= 100) return val;
    } catch {}
  }
  return DEFAULT_THRESHOLD;
}

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return null; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function getUsage() {
  // Check cache first
  if (existsSync(CACHE_PATH)) {
    try {
      const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      if (Date.now() - cache.timestamp < CACHE_TTL_MS) return cache.data;
    } catch {}
  }

  // Get OAuth token
  const token = getOAuthToken();
  if (!token) return null;

  // Query API using execFileSync (no shell — safe from injection)
  try {
    const resp = execFileSync('curl', [
      '-s',
      '-H', `Authorization: Bearer ${token}`,
      '-H', 'anthropic-beta: oauth-2025-04-20',
      'https://api.anthropic.com/api/oauth/usage',
    ], { encoding: 'utf8', timeout: 5000 });

    const data = JSON.parse(resp);
    if (data.type === 'error') return null;

    // Cache result
    writeFileSync(CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data }, null, 2), 'utf8');
    return data;
  } catch {
    return null;
  }
}

function getOAuthToken() {
  if (platform() !== 'darwin') {
    // Linux: check ~/.claude/.credentials.json
    const credPath = join(CLAUDE_DIR, '.credentials.json');
    if (!existsSync(credPath)) return null;
    try {
      const creds = JSON.parse(readFileSync(credPath, 'utf8'));
      return creds.claudeAiOauth?.accessToken || null;
    } catch { return null; }
  }

  // macOS: read from Keychain using execFileSync (no shell)
  try {
    const raw = execFileSync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w',
    ], { encoding: 'utf8', timeout: 3000 }).trim();
    const creds = JSON.parse(raw);
    return creds.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

main().catch(() => {}).finally(() => process.exit(0));
