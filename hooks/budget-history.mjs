#!/usr/bin/env node
/**
 * hooks/budget-history.mjs — PostToolUse Skill history recorder (Phase 25 LIMIT-05 SC#2)
 *
 * Pairs with hooks/budget-gate.mjs. After a gated GSD Skill finishes:
 *   1. Read snapshot written by budget-gate.mjs (five_hour_pct BEFORE the skill).
 *   2. Read current budget-usage-cache.json (five_hour_pct AFTER the skill).
 *   3. Compute delta, clamp small negatives to 0, discard implausibly large
 *      negatives (< -5, likely API window shifted).
 *   4. Append delta to history[skill].samples (cap 20 most-recent).
 *   5. Write atomically (.tmp + renameSync) and unlink the snapshot.
 *
 * Fail-open guarantee: any error → exit 0 silently, never disrupts the session.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = join(homedir(), '.claude');
const CACHE_PATH = join(CLAUDE_DIR, 'budget-usage-cache.json');
const HISTORY_PATH = join(CLAUDE_DIR, 'budget-history.json');
const SNAPSHOT_PATH = join(CLAUDE_DIR, 'budget-gate-snapshot.json');

const CACHE_TTL_MS = 60_000;
const HISTORY_CACHE_STALE_MS = 2 * CACHE_TTL_MS; // tolerate 2 min stale cache when reading the "after" utilization
const SNAPSHOT_STALE_MS = 10 * 60 * 1000; // 10 min — skill took too long, data unreliable
const MAX_SAMPLES = 20;
const MIN_DELTA_THRESHOLD = -5; // discard sample if rawDelta < this (API window shift)

// Keep in sync with budget-gate.mjs FALLBACKS.
const FALLBACKS = {
  'gsd-execute-phase': 15,
  'gsd-plan-phase': 8,
  'gsd-discuss-phase': 5,
  'gsd-research-phase': 3,
  'gsd-manager': 25,
  'gsd-autonomous': 30,
  'gsd-ship': 20,
  'gsd-audit-milestone': 10,
  'gsd-code-review': 12,
  'gsd-code-review-fix': 12,
  'gsd-secure-phase': 12,
  'gsd-ui-phase': 12,
  'gsd-new-milestone': 5,
  'gsd-complete-milestone': 5,
};
const GATED_SKILLS = new Set(Object.keys(FALLBACKS));

// ── Helpers ──────────────────────────────────────────────────────────────────

function readStdin(timeoutMs = 500) {
  return new Promise((resolve) => {
    const chunks = [];
    const timer = setTimeout(() => resolve(''), timeoutMs);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8')); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

function safeUnlink(path) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* swallow */ }
}

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch {
    // Corrupt snapshot — unlink so it doesn't pollute future runs
    safeUnlink(SNAPSHOT_PATH);
    return null;
  }
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  const tmp = HISTORY_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(history, null, 2) + '\n');
  renameSync(tmp, HISTORY_PATH);
}

function ensureEntry(history, skillName) {
  if (!history[skillName]) {
    history[skillName] = {
      operation_type: skillName.replace(/^gsd-/, ''),
      baseline_pct: FALLBACKS[skillName] ?? 10,
      samples: [],
      updated_at: null,
    };
  }
  // Defensive: ensure samples is an array (corrupt file recovery)
  if (!Array.isArray(history[skillName].samples)) {
    history[skillName].samples = [];
  }
  return history[skillName];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await readStdin();
  if (!raw) return;

  let data;
  try { data = JSON.parse(raw); } catch { return; }
  const skillName = data?.tool_input?.skill;
  if (!skillName || !GATED_SKILLS.has(skillName)) return;

  const snapshot = loadSnapshot();
  if (!snapshot) return;

  if (snapshot.skill !== skillName) {
    // Interleaved skills — unlink snapshot to prevent pollution, but don't record
    safeUnlink(SNAPSHOT_PATH);
    return;
  }

  if (typeof snapshot.timestamp !== 'number' || Date.now() - snapshot.timestamp > SNAPSHOT_STALE_MS) {
    safeUnlink(SNAPSHOT_PATH);
    return;
  }

  if (!existsSync(CACHE_PATH)) return;
  let cache;
  try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { return; }
  if (!cache || typeof cache.timestamp !== 'number') return;
  if (Date.now() - cache.timestamp >= HISTORY_CACHE_STALE_MS) return;

  const fiveHour = cache.data?.five_hour;
  if (!fiveHour || typeof fiveHour.utilization !== 'number') return;
  if (typeof snapshot.five_hour_pct !== 'number') return;

  const rawDelta = fiveHour.utilization - snapshot.five_hour_pct;
  if (rawDelta < MIN_DELTA_THRESHOLD) {
    // Likely API window shifted — discard sample
    safeUnlink(SNAPSHOT_PATH);
    return;
  }

  const delta = Math.max(0, rawDelta);

  const history = loadHistory();
  const entry = ensureEntry(history, skillName);
  entry.samples.push(delta);
  while (entry.samples.length > MAX_SAMPLES) entry.samples.shift();
  entry.updated_at = new Date().toISOString();

  saveHistory(history);
  safeUnlink(SNAPSHOT_PATH);
}

main().catch(() => {}).finally(() => process.exit(0));
