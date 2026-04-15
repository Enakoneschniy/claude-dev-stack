// tests/budget-history.test.mjs — Phase 25 LIMIT-05 SC#2 cost-estimation tracking
// Unit tests for hooks/budget-history.mjs (PostToolUse Skill history recorder).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const hookPath = join(projectRoot, 'hooks', 'budget-history.mjs');
const gatePath = join(projectRoot, 'hooks', 'budget-gate.mjs');

function runHook(stdin, tmpHome) {
  return spawnSync('node', [hookPath], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome },
    timeout: 10_000,
  });
}

function seedSnapshot(tmpHome, snapshot) {
  const claudeDir = join(tmpHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'budget-gate-snapshot.json'), JSON.stringify(snapshot));
}

function seedCache(tmpHome, utilization) {
  const claudeDir = join(tmpHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'budget-usage-cache.json'),
    JSON.stringify({
      timestamp: Date.now(),
      data: { five_hour: { utilization, resets_at: '2026-04-14T17:59:59Z' } },
    }),
  );
}

function seedHistory(tmpHome, history) {
  const claudeDir = join(tmpHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'budget-history.json'), JSON.stringify(history));
}

function readHistory(tmpHome) {
  const p = join(tmpHome, '.claude', 'budget-history.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

describe('hooks/budget-history.mjs', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'bh-test-'));
  });

  it('exits silently on non-gated skill', () => {
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-health' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(readHistory(tmpHome), null);
  });

  it('exits silently when snapshot missing', () => {
    seedCache(tmpHome, 80);
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(readHistory(tmpHome), null);
  });

  it('records delta when snapshot + cache fresh', () => {
    seedSnapshot(tmpHome, { skill: 'gsd-plan-phase', five_hour_pct: 70, timestamp: Date.now() });
    seedCache(tmpHome, 78);
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    const history = readHistory(tmpHome);
    assert.ok(history, 'history file must exist');
    assert.ok(history['gsd-plan-phase'], 'gsd-plan-phase entry must exist');
    assert.deepEqual(history['gsd-plan-phase'].samples, [8]);
    // Snapshot must be deleted after successful processing
    assert.equal(
      existsSync(join(tmpHome, '.claude', 'budget-gate-snapshot.json')),
      false,
      'snapshot must be consumed',
    );
  });

  it('discards sample when rawDelta < -5', () => {
    seedSnapshot(tmpHome, { skill: 'gsd-plan-phase', five_hour_pct: 80, timestamp: Date.now() });
    seedCache(tmpHome, 70); // rawDelta = -10, below threshold
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    const history = readHistory(tmpHome);
    if (history?.['gsd-plan-phase']) {
      assert.equal(
        history['gsd-plan-phase'].samples.length,
        0,
        'no samples added when rawDelta < -5',
      );
    }
  });

  it('clamps small negative delta to 0', () => {
    seedSnapshot(tmpHome, { skill: 'gsd-plan-phase', five_hour_pct: 50, timestamp: Date.now() });
    seedCache(tmpHome, 48); // rawDelta = -2, within tolerance, clamp to 0
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    const history = readHistory(tmpHome);
    assert.ok(history?.['gsd-plan-phase']?.samples.includes(0), 'samples must contain 0 for small negative delta');
  });

  it('caps samples at 20', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1); // [1..20]
    seedHistory(tmpHome, {
      'gsd-plan-phase': {
        operation_type: 'plan-phase',
        baseline_pct: 8,
        samples: twenty,
        updated_at: null,
      },
    });
    seedSnapshot(tmpHome, { skill: 'gsd-plan-phase', five_hour_pct: 50, timestamp: Date.now() });
    seedCache(tmpHome, 55); // delta = 5
    runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    const history = readHistory(tmpHome);
    assert.equal(history['gsd-plan-phase'].samples.length, 20);
    // oldest (1) shifted out; newest (5) appended at the end
    assert.equal(history['gsd-plan-phase'].samples[0], 2);
    assert.equal(history['gsd-plan-phase'].samples[19], 5);
  });

  it('ignores snapshot when skill mismatches', () => {
    seedSnapshot(tmpHome, { skill: 'gsd-plan-phase', five_hour_pct: 70, timestamp: Date.now() });
    seedCache(tmpHome, 78);
    const res = runHook(
      { tool_name: 'Skill', tool_input: { skill: 'gsd-execute-phase' } },
      tmpHome,
    );
    assert.equal(res.status, 0);
    const history = readHistory(tmpHome);
    // Neither skill should have a recorded sample
    if (history) {
      assert.ok(
        !history['gsd-plan-phase'] || history['gsd-plan-phase'].samples.length === 0,
        'plan-phase should not be recorded',
      );
      assert.ok(
        !history['gsd-execute-phase'] || history['gsd-execute-phase'].samples.length === 0,
        'execute-phase should not be recorded',
      );
    }
    // Snapshot should be unlinked (prevents pollution)
    assert.equal(
      existsSync(join(tmpHome, '.claude', 'budget-gate-snapshot.json')),
      false,
      'snapshot must be unlinked on mismatch',
    );
  });

  it('keeps FALLBACKS in sync with budget-gate.mjs', () => {
    const gateSrc = readFileSync(gatePath, 'utf8');
    const histSrc = readFileSync(hookPath, 'utf8');
    function extractKeys(src) {
      const match = src.match(/const FALLBACKS = \{([\s\S]*?)\};/);
      if (!match) return [];
      return Array.from(match[1].matchAll(/'([^']+)'/g)).map(m => m[1]).sort();
    }
    const gateKeys = extractKeys(gateSrc);
    const histKeys = extractKeys(histSrc);
    assert.ok(gateKeys.length > 0, 'gate FALLBACKS must have entries');
    assert.deepEqual(histKeys, gateKeys, 'budget-history FALLBACKS must match budget-gate');
  });
});
