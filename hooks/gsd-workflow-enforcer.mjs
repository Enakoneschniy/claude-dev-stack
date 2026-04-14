#!/usr/bin/env node
/**
 * hooks/gsd-workflow-enforcer.mjs — PostToolUse Skill hook: GSD batching enforcement
 *
 * Fires after `/gsd-plan-phase` completes. Reads .planning/ROADMAP.md to count
 * pending phases; emits a NEXT directive preventing premature /gsd-execute-phase
 * suggestion when 2+ pending phases still need planning.
 *
 * WF-01: Phase 29. Fail-silent on non-GSD projects (no .planning/ROADMAP.md).
 *
 * Output paths:
 *   1. ≥1 unplanned AND ≥2 total pending → "NEXT: /gsd-discuss-phase M — ..."
 *   2. 0 unplanned AND ≥2 total pending   → "NEXT: /gsd-manager — all N ..."
 *   3. ≤1 total pending                   → silent (no stdout)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROADMAP_PATH = join(process.cwd(), '.planning', 'ROADMAP.md');
const PHASES_DIR = join(process.cwd(), '.planning', 'phases');
const MAX_LINES = 10_000;
const PHASE_NUM_REGEX = /^- \[ \] \*\*Phase (\d{1,4}(?:\.\d{1,2})?):/;
const VALID_PHASE_NUM = /^\d{1,4}(\.\d{1,2})?$/;

async function readStdin(timeoutMs = 500) {
  const chunks = [];
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
  });
  return Buffer.concat(chunks).toString('utf8').trim();
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPhasePlanned(phaseNum) {
  try {
    const entries = readdirSync(PHASES_DIR, { withFileTypes: true });
    const prefixRegex = new RegExp('^' + escapeForRegex(phaseNum) + '-');
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!prefixRegex.test(entry.name)) continue;
      const contextFile = join(PHASES_DIR, entry.name, `${phaseNum}-CONTEXT.md`);
      if (existsSync(contextFile)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parsePendingPhases(roadmapText) {
  const lines = roadmapText.split('\n').slice(0, MAX_LINES);
  const pending = [];
  for (const line of lines) {
    const match = line.match(PHASE_NUM_REGEX);
    if (!match) continue;
    const phaseNum = match[1];
    if (!VALID_PHASE_NUM.test(phaseNum)) continue;
    pending.push(phaseNum);
  }
  return pending;
}

async function main() {
  const raw = await readStdin();
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  if (data?.tool_name !== 'Skill') return;
  if (data?.tool_input?.skill !== 'gsd-plan-phase') return;
  if (!existsSync(ROADMAP_PATH)) return;

  let roadmapText;
  try {
    roadmapText = readFileSync(ROADMAP_PATH, 'utf8');
  } catch {
    return;
  }

  const pending = parsePendingPhases(roadmapText);
  if (pending.length <= 1) return;

  const unplanned = pending.filter((n) => !isPhasePlanned(n));
  const plannedButPending = pending.length - unplanned.length;

  if (unplanned.length >= 1 && pending.length >= 2) {
    process.stdout.write(
      `NEXT: /gsd-discuss-phase ${unplanned[0]} — do NOT run /gsd-execute-phase; use /gsd-manager only after all pending phases are planned\n`
    );
  } else if (unplanned.length === 0 && plannedButPending >= 2) {
    process.stdout.write(
      `NEXT: /gsd-manager — all ${plannedButPending} pending phases have plans; spawn parallel execute team\n`
    );
  }
}

main().catch(() => {}).finally(() => process.exit(0));
