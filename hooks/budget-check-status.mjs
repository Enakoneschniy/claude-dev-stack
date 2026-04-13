#!/usr/bin/env node
/**
 * budget-check-status.mjs — Print plan usage summary (for SessionStart hook)
 * No stdin needed. Reads OAuth token, queries API, prints one-line summary.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';

const CLAUDE_DIR = join(homedir(), '.claude');
const CACHE_PATH = join(CLAUDE_DIR, 'budget-usage-cache.json');
const CONFIG_PATH = join(CLAUDE_DIR, 'budget-config.json');
const CACHE_TTL_MS = 60_000;

try {
  // Check cache
  let data;
  if (existsSync(CACHE_PATH)) {
    try {
      const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      if (Date.now() - cache.timestamp < CACHE_TTL_MS) data = cache.data;
    } catch {}
  }

  if (!data) {
    const token = getToken();
    if (!token) process.exit(0);

    const resp = execFileSync('curl', [
      '-s', '-H', `Authorization: Bearer ${token}`,
      '-H', 'anthropic-beta: oauth-2025-04-20',
      'https://api.anthropic.com/api/oauth/usage',
    ], { encoding: 'utf8', timeout: 5000 });

    data = JSON.parse(resp);
    if (data.type === 'error') process.exit(0);
    writeFileSync(CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data }, null, 2), 'utf8');
  }

  // Build summary
  const parts = [];
  if (data.five_hour) parts.push(`5h: ${data.five_hour.utilization}%`);
  if (data.seven_day) parts.push(`7d: ${data.seven_day.utilization}%`);
  if (data.extra_usage) parts.push(`extra: ${Math.round(data.extra_usage.utilization)}%`);

  if (parts.length === 0) process.exit(0);

  // Load threshold
  let threshold = 70;
  if (existsSync(CONFIG_PATH)) {
    try { threshold = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).threshold || 70; } catch {}
  }

  const hasWarning = (data.five_hour?.utilization >= threshold) ||
    (data.seven_day?.utilization >= threshold) ||
    (data.extra_usage?.utilization >= threshold);

  const icon = hasWarning ? '⚠' : '📊';
  const resetTime = data.five_hour?.resets_at
    ? ` | 5h resets: ${new Date(data.five_hour.resets_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  console.log(`${icon} Budget: ${parts.join(' | ')}${resetTime}`);

} catch {
  process.exit(0);
}

function getToken() {
  if (platform() !== 'darwin') {
    const credPath = join(CLAUDE_DIR, '.credentials.json');
    if (!existsSync(credPath)) return null;
    try { return JSON.parse(readFileSync(credPath, 'utf8')).claudeAiOauth?.accessToken || null; }
    catch { return null; }
  }
  try {
    const raw = execFileSync('security', [
      'find-generic-password', '-s', 'Claude Code-credentials', '-w',
    ], { encoding: 'utf8', timeout: 3000 }).trim();
    return JSON.parse(raw).claudeAiOauth?.accessToken || null;
  } catch { return null; }
}
