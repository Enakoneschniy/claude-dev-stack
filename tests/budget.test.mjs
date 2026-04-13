import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const hooksDir = join(projectRoot, 'hooks');
const libDir = join(projectRoot, 'lib');

// ── lib/budget.mjs unit tests ────────────────────────────────────────────────

describe('lib/budget.mjs', async () => {
  const { parseUsage, shouldWarn, formatWarning,
    currentSessionId, DEFAULT_THRESHOLD } = await import('../lib/budget.mjs');

  describe('parseUsage', () => {
    it('returns null for null input', () => {
      assert.equal(parseUsage(null), null);
    });

    it('returns null when no used_pct field', () => {
      assert.equal(parseUsage({ session_id: 'abc' }), null);
    });

    it('parses statusline bridge metrics correctly', () => {
      const result = parseUsage({
        session_id: 'abc',
        remaining_percentage: 75,
        used_pct: 25,
        timestamp: 1234567890,
      });
      assert.deepEqual(result, { usedPct: 25, remainingPct: 75 });
    });

    it('computes remainingPct when remaining_percentage missing', () => {
      const result = parseUsage({ used_pct: 40 });
      assert.deepEqual(result, { usedPct: 40, remainingPct: 60 });
    });
  });

  describe('shouldWarn', () => {
    const sessionId = 'test-session-123';

    it('returns false when percent < threshold', () => {
      assert.equal(shouldWarn(69, 70, null, sessionId), false);
    });

    it('returns true when percent == threshold and no state', () => {
      assert.equal(shouldWarn(70, 70, null, sessionId), true);
    });

    it('returns true when percent > threshold and no state', () => {
      assert.equal(shouldWarn(85, 70, null, sessionId), true);
    });

    it('returns false when already fired for this session', () => {
      const state = { firedForSession: sessionId, firedAtPercent: 72 };
      assert.equal(shouldWarn(80, 70, state, sessionId), false);
    });

    it('returns true when state is for a different session', () => {
      const state = { firedForSession: 'other-session', firedAtPercent: 72 };
      assert.equal(shouldWarn(80, 70, state, sessionId), true);
    });

    it('returns true when state is null even above threshold', () => {
      assert.equal(shouldWarn(95, 70, null, sessionId), true);
    });
  });

  describe('formatWarning', () => {
    it('includes the percent and threshold', () => {
      const msg = formatWarning(75, 70);
      assert.ok(msg.includes('75%'), 'must include current percent');
      assert.ok(msg.includes('70%'), 'must include threshold');
    });

    it('includes remaining percentage', () => {
      const msg = formatWarning(75, 70);
      assert.ok(msg.includes('25%'), 'must include remaining percentage');
    });

    it('returns a non-empty string', () => {
      const msg = formatWarning(80, 70);
      assert.ok(typeof msg === 'string' && msg.length > 0);
    });

    it('includes continue suggestion line', () => {
      const w = formatWarning(75, 70);
      assert.ok(w.includes('claude-dev-stack budget continue'), 'should include continue suggestion');
    });
  });

  describe('currentSessionId', () => {
    it('returns a YYYY-MM-DD string', () => {
      const id = currentSessionId();
      assert.match(id, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches today UTC date', () => {
      const id = currentSessionId();
      const expected = new Date().toISOString().slice(0, 10);
      assert.equal(id, expected);
    });
  });

  describe('DEFAULT_THRESHOLD', () => {
    it('is 70', () => {
      assert.equal(DEFAULT_THRESHOLD, 70);
    });
  });
});

// ── lib/budget.mjs config/state round-trip (isolated temp HOME) ──────────────

describe('lib/budget.mjs config and state (isolated)', () => {
  let tmpHome;
  let originalHome;
  let originalEnv;

  before(() => {
    tmpHome = join(tmpdir(), `cds-budget-test-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });
    originalHome = process.env.HOME;
    originalEnv = process.env.BUDGET_THRESHOLD_PERCENT;
    process.env.HOME = tmpHome;
    delete process.env.BUDGET_THRESHOLD_PERCENT;
  });

  after(() => {
    process.env.HOME = originalHome;
    if (originalEnv !== undefined) {
      process.env.BUDGET_THRESHOLD_PERCENT = originalEnv;
    } else {
      delete process.env.BUDGET_THRESHOLD_PERCENT;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('loadThreshold returns DEFAULT_THRESHOLD when no config', async () => {
    const { loadThreshold, DEFAULT_THRESHOLD } = await import('../lib/budget.mjs');
    process.env.BUDGET_THRESHOLD_PERCENT = '';
    const t = loadThreshold();
    assert.equal(t, DEFAULT_THRESHOLD);
    delete process.env.BUDGET_THRESHOLD_PERCENT;
  });

  it('BUDGET_THRESHOLD_PERCENT env var overrides default', async () => {
    const { loadThreshold } = await import('../lib/budget.mjs');
    process.env.BUDGET_THRESHOLD_PERCENT = '50';
    assert.equal(loadThreshold(), 50);
    delete process.env.BUDGET_THRESHOLD_PERCENT;
  });

  it('BUDGET_THRESHOLD_PERCENT ignores invalid values', async () => {
    const { loadThreshold, DEFAULT_THRESHOLD } = await import('../lib/budget.mjs');
    process.env.BUDGET_THRESHOLD_PERCENT = 'abc';
    assert.equal(loadThreshold(), DEFAULT_THRESHOLD);
    delete process.env.BUDGET_THRESHOLD_PERCENT;
  });
});

// ── hooks/budget-check.mjs integration ───────────────────────────────────────

describe('hooks/budget-check.mjs', () => {
  const hookPath = join(hooksDir, 'budget-check.mjs');

  it('hook file exists', () => {
    assert.ok(existsSync(hookPath), 'hooks/budget-check.mjs must exist');
  });

  it('exits 0 with empty stdin (no session data)', () => {
    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: '',
      env: { ...process.env },
      timeout: 5000,
    });
    assert.equal(result.status, 0, `exit code must be 0, got ${result.status}, stderr: ${result.stderr}`);
  });

  it('exits 0 with invalid JSON stdin', () => {
    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: 'not-json{{{',
      env: { ...process.env },
      timeout: 5000,
    });
    assert.equal(result.status, 0, `exit code must be 0 on bad JSON`);
  });

  it('exits 0 with no session_id in payload', () => {
    const payload = JSON.stringify({ tool_name: 'Write', tool_input: {} });
    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env },
      timeout: 5000,
    });
    assert.equal(result.status, 0);
  });

  it('prints warning when usage crosses threshold via bridge file, exits 0', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-warn-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    // Create a statusline bridge file
    const sessionId = `test-budget-${process.pid}`;
    const bridgePath = join(tmpdir(), `claude-ctx-${sessionId}.json`);
    writeFileSync(bridgePath, JSON.stringify({
      session_id: sessionId,
      remaining_percentage: 20,
      used_pct: 80,
      timestamp: Math.floor(Date.now() / 1000),
    }));

    const payload = JSON.stringify({ session_id: sessionId, tool_name: 'Bash' });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(bridgePath, { force: true });
    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('BUDGET WARNING'), `stdout must include "BUDGET WARNING", got: ${result.stdout}`);
    assert.ok(result.stdout.includes('80%'), 'warning must include usage percent (80%)');
  });

  it('does NOT print warning when usage below threshold', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-ok-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const sessionId = `test-budget-ok-${process.pid}`;
    const bridgePath = join(tmpdir(), `claude-ctx-${sessionId}.json`);
    writeFileSync(bridgePath, JSON.stringify({
      session_id: sessionId,
      remaining_percentage: 55,
      used_pct: 45,
      timestamp: Math.floor(Date.now() / 1000),
    }));

    const payload = JSON.stringify({ session_id: sessionId, tool_name: 'Bash' });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(bridgePath, { force: true });
    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('BUDGET WARNING'), 'must NOT warn when usage < threshold');
  });

  it('does NOT print warning twice in same session (state file present)', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-once-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const sessionId = `test-budget-once-${process.pid}`;
    const bridgePath = join(tmpdir(), `claude-ctx-${sessionId}.json`);
    writeFileSync(bridgePath, JSON.stringify({
      session_id: sessionId,
      remaining_percentage: 10,
      used_pct: 90,
      timestamp: Math.floor(Date.now() / 1000),
    }));

    // Pre-seed state file indicating warning already fired for this session
    const statePath = join(tmpHome, '.claude', 'budget-state.json');
    writeFileSync(statePath, JSON.stringify({ firedForSession: sessionId, firedAtPercent: 75 }));

    const payload = JSON.stringify({ session_id: sessionId, tool_name: 'Bash' });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(bridgePath, { force: true });
    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('BUDGET WARNING'), 'must NOT warn again when already fired for this session');
  });

  it('saves state file after warning fires', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-state-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const sessionId = `test-budget-state-${process.pid}`;
    const bridgePath = join(tmpdir(), `claude-ctx-${sessionId}.json`);
    writeFileSync(bridgePath, JSON.stringify({
      session_id: sessionId,
      remaining_percentage: 15,
      used_pct: 85,
      timestamp: Math.floor(Date.now() / 1000),
    }));

    const payload = JSON.stringify({ session_id: sessionId, tool_name: 'Bash' });

    spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    const statePath = join(tmpHome, '.claude', 'budget-state.json');
    assert.ok(existsSync(statePath), 'budget-state.json must be created after warning fires');

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.firedForSession, sessionId, 'state must record session_id as firedForSession');
    assert.ok(typeof state.firedAtPercent === 'number', 'state must record firedAtPercent');

    rmSync(bridgePath, { force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });
});

// ── hooks/budget-reset.mjs ───────────────────────────────────────────────────

describe('hooks/budget-reset.mjs', () => {
  const resetPath = join(hooksDir, 'budget-reset.mjs');

  it('hook file exists', () => {
    assert.ok(existsSync(resetPath), 'hooks/budget-reset.mjs must exist');
  });

  it('exits 0 with no state file', () => {
    const tmpHome = join(tmpdir(), `cds-budget-reset-empty-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const result = spawnSync(process.execPath, [resetPath], {
      encoding: 'utf8',
      env: { ...process.env, HOME: tmpHome },
      timeout: 5000,
    });

    rmSync(tmpHome, { recursive: true, force: true });
    assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
  });

  it('clears state file on session start', () => {
    const tmpHome = join(tmpdir(), `cds-budget-reset-clear-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const statePath = join(tmpHome, '.claude', 'budget-state.json');
    writeFileSync(statePath, JSON.stringify({ firedForSession: 'old-session', firedAtPercent: 75 }));

    spawnSync(process.execPath, [resetPath], {
      encoding: 'utf8',
      env: { ...process.env, HOME: tmpHome },
      timeout: 5000,
    });

    // After reset, state should be null/cleared
    const content = readFileSync(statePath, 'utf8').trim();
    const parsed = JSON.parse(content);
    assert.equal(parsed, null, 'state file must contain null after reset');

    rmSync(tmpHome, { recursive: true, force: true });
  });
});
