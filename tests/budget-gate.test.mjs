// tests/budget-gate.test.mjs — Phase 25 LIMIT-05 SC#1/SC#2
// Unit tests for hooks/budget-gate.mjs (PreToolUse Skill gate).

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const hookPath = join(projectRoot, 'hooks', 'budget-gate.mjs');

function runHook(stdin, tmpHome) {
  const result = spawnSync('node', [hookPath], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome },
    timeout: 10_000,
  });
  return result;
}

function seedCache(tmpHome, cacheData) {
  const claudeDir = join(tmpHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'budget-usage-cache.json'), JSON.stringify(cacheData));
}

describe('hooks/budget-gate.mjs', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'bg-test-'));
  });

  after(() => {
    // cleanup is per-test via fresh mkdtemp; no global teardown needed
  });

  it('exits silently on non-gated skill', () => {
    // gsd-health is not in FALLBACKS — gate must skip entirely
    seedCache(tmpHome, {
      timestamp: Date.now(),
      data: {
        five_hour: { utilization: 95, resets_at: '2026-04-14T17:59:59.979618+00:00' },
        seven_day: null,
        extra_usage: null,
      },
    });
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-health' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
    // snapshot must NOT be written for non-gated skills
    assert.equal(existsSync(join(tmpHome, '.claude', 'budget-gate-snapshot.json')), false);
  });

  it('exits silently when cache missing', () => {
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });

  it('exits silently when cache stale', () => {
    seedCache(tmpHome, {
      timestamp: Date.now() - 300_000, // 5 min ago — well beyond 2x TTL
      data: {
        five_hour: { utilization: 50, resets_at: '2026-04-14T17:59:59.979618+00:00' },
      },
    });
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });

  it('writes snapshot when under threshold', () => {
    seedCache(tmpHome, {
      timestamp: Date.now(),
      data: {
        five_hour: { utilization: 10, resets_at: '2026-04-14T17:59:59.979618+00:00' },
      },
    });
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-plan-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
    const snapPath = join(tmpHome, '.claude', 'budget-gate-snapshot.json');
    assert.ok(existsSync(snapPath), 'snapshot must exist when under threshold');
    const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
    assert.equal(snap.skill, 'gsd-plan-phase');
    assert.equal(snap.five_hour_pct, 10);
    assert.ok(typeof snap.timestamp === 'number' && snap.timestamp > 0);
  });

  it('emits 3-option prompt when projected > threshold', () => {
    seedCache(tmpHome, {
      timestamp: Date.now(),
      data: {
        five_hour: { utilization: 80, resets_at: '2026-04-14T17:59:59.979618+00:00' },
      },
    });
    // gsd-execute-phase fallback = 15 → 80+15 = 95 > 80
    const res = runHook({ tool_name: 'Skill', tool_input: { skill: 'gsd-execute-phase' } }, tmpHome);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /BUDGET GATE/);
    assert.match(res.stdout, /80%/);
    assert.match(res.stdout, /gsd-execute-phase/);
    assert.match(res.stdout, /\[A\]/);
    assert.match(res.stdout, /\[B\]/);
    assert.match(res.stdout, /\[C\]/);
    // reset-time substring should appear (formatResetInfo emits "reset in Xm at HH:MM")
    assert.match(res.stdout, /reset in|at /);
  });

  it('uses tool_input.skill not tool_input.skill_name', () => {
    // Wrong key — plan calls out this exact guard (D-02 amendment 2026-04-14)
    seedCache(tmpHome, {
      timestamp: Date.now(),
      data: {
        five_hour: { utilization: 80, resets_at: '2026-04-14T17:59:59.979618+00:00' },
      },
    });
    const res = runHook(
      { tool_name: 'Skill', tool_input: { skill_name: 'gsd-execute-phase' } },
      tmpHome,
    );
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '', 'gate must NOT fire when only skill_name (wrong key) is present');
  });
});
