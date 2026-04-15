#!/usr/bin/env node
/**
 * hooks/budget-gate.mjs — PreToolUse Skill gate (Phase 25 LIMIT-05 SC#1, SC#2)
 *
 * Reads stdin JSON, filters gated GSD skill invocations, estimates operation
 * cost from rolling-average history (bootstrap fallback on first run), and
 * surfaces a 3-option prompt to stdout when projected 5h utilization exceeds
 * the configured gate threshold (default 80%).
 *
 * Fail-open guarantee: every error path exits 0 with empty stdout — never
 * blocks a Skill invocation.
 *
 * Inputs:
 *   - stdin JSON: { tool_name: "Skill", tool_input: { skill: "<name>" }, ... }
 *   - ~/.claude/budget-usage-cache.json  (written by Phase 20 hooks/budget-check.mjs)
 *   - ~/.claude/budget-history.json      (written by Phase 25 hooks/budget-history.mjs)
 *   - ~/.claude/budget-config.json       (optional; { gateThreshold: 80 })
 *
 * Outputs:
 *   - ~/.claude/budget-gate-snapshot.json  (consumed by budget-history.mjs)
 *   - stdout: multi-line prompt (Execute / Schedule after reset / Cancel) when projected > threshold
 *
 * Exit: always 0.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = join(homedir(), '.claude');
const CACHE_PATH = join(CLAUDE_DIR, 'budget-usage-cache.json');
const HISTORY_PATH = join(CLAUDE_DIR, 'budget-history.json');
const SNAPSHOT_PATH = join(CLAUDE_DIR, 'budget-gate-snapshot.json');
const CONFIG_PATH = join(CLAUDE_DIR, 'budget-config.json');

const CACHE_TTL_MS = 60_000;
const GATE_CACHE_TTL_MS = 2 * CACHE_TTL_MS; // 2-minute tolerance
const DEFAULT_GATE_THRESHOLD = 80;

// Bootstrap fallback costs (D-08). Keep in sync with budget-history.mjs FALLBACKS.
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

function loadGateThreshold() {
  try {
    if (!existsSync(CONFIG_PATH)) return DEFAULT_GATE_THRESHOLD;
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const val = Number(cfg.gateThreshold);
    if (!Number.isFinite(val) || val < 0 || val > 100) return DEFAULT_GATE_THRESHOLD;
    return val;
  } catch {
    return DEFAULT_GATE_THRESHOLD;
  }
}

function loadHistory() {
  try {
    if (!existsSync(HISTORY_PATH)) return {};
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function estimateCost(skillName, history) {
  const entry = history?.[skillName];
  if (entry && Array.isArray(entry.samples) && entry.samples.length > 0) {
    const sum = entry.samples.reduce((a, b) => a + b, 0);
    return sum / entry.samples.length;
  }
  return FALLBACKS[skillName] ?? 10;
}

function formatResetInfo(resets_at) {
  if (!resets_at) return '';
  try {
    const resetDate = new Date(resets_at);
    if (isNaN(resetDate.getTime())) return '';
    const diffMs = resetDate.getTime() - Date.now();
    const diffMin = Math.max(0, Math.round(diffMs / 60_000));
    const hh = String(resetDate.getHours()).padStart(2, '0');
    const mm = String(resetDate.getMinutes()).padStart(2, '0');
    return ` (est. reset in ${diffMin}m at ${hh}:${mm})`;
  } catch {
    return '';
  }
}

function buildPrompt({ skillName, currentPct, estimate, sampleCount, projectedPct, gateThreshold, resetInfo }) {
  const estimateSource = sampleCount > 0 ? `from ${sampleCount} sample(s)` : 'bootstrap fallback';
  const lines = [
    '',
    '⚠ BUDGET GATE — plan usage is tight',
    '',
    `   current: ${currentPct}% (5h window)`,
    `   operation: ${skillName}`,
    `   estimate: +${Math.round(estimate)}% (${estimateSource})`,
    `   projected: ${Math.round(projectedPct)}% (threshold ${gateThreshold}%)${resetInfo}`,
    '',
    '   [A] Execute now — accept extra usage',
    '   [B] Schedule after reset — defer until 5h window resets',
    '   [C] Cancel — abort this operation',
    '',
  ];
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await readStdin();
  if (!raw) return;

  let data;
  try { data = JSON.parse(raw); } catch { return; }
  if (!data || typeof data !== 'object') return;

  const skillName = data.tool_input?.skill;
  if (!skillName || !GATED_SKILLS.has(skillName)) return;

  // Double-check tool_name (matcher is "Skill" but defensive)
  if (data.tool_name !== 'Skill') return;

  // Read cache
  if (!existsSync(CACHE_PATH)) return;
  let cache;
  try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { return; }
  if (!cache || typeof cache.timestamp !== 'number') return;
  if (Date.now() - cache.timestamp >= GATE_CACHE_TTL_MS) return;

  const fiveHour = cache.data?.five_hour;
  if (!fiveHour || typeof fiveHour.utilization !== 'number') return;

  // Write snapshot (best-effort; snapshot failure must not abort the gate)
  try {
    writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ skill: skillName, five_hour_pct: fiveHour.utilization, timestamp: Date.now() }),
    );
  } catch { /* snapshot best-effort only */ }

  const history = loadHistory();
  const estimate = estimateCost(skillName, history);
  const sampleCount = history?.[skillName]?.samples?.length ?? 0;
  const projected = fiveHour.utilization + estimate;
  const gateThreshold = loadGateThreshold();

  if (projected <= gateThreshold) return;

  const resetInfo = formatResetInfo(fiveHour.resets_at);
  const prompt = buildPrompt({
    skillName,
    currentPct: fiveHour.utilization,
    estimate,
    sampleCount,
    projectedPct: projected,
    gateThreshold,
    resetInfo,
  });
  process.stdout.write(prompt);
}

main().catch(() => {}).finally(() => process.exit(0));
