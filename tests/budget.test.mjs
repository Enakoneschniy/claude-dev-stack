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
  const { parseUsage, computePercent, shouldWarn, formatWarning,
    currentSessionId, DEFAULT_THRESHOLD } = await import('../lib/budget.mjs');

  describe('parseUsage', () => {
    it('returns null for null input', () => {
      assert.equal(parseUsage(null), null);
    });

    it('returns null when no usage field', () => {
      assert.equal(parseUsage({ tool: 'Write' }), null);
    });

    it('returns null when context_window_tokens is zero', () => {
      assert.equal(parseUsage({ usage: { context_window_tokens: 0 } }), null);
    });

    it('returns null when context_window_tokens is missing', () => {
      assert.equal(parseUsage({ usage: { input_tokens: 100 } }), null);
    });

    it('parses basic usage correctly', () => {
      const result = parseUsage({
        usage: {
          input_tokens: 5000,
          output_tokens: 1000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          context_window_tokens: 10000,
        },
      });
      assert.deepEqual(result, { usedTokens: 6000, totalTokens: 10000 });
    });

    it('sums all token fields', () => {
      const result = parseUsage({
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 300,
          context_window_tokens: 20000,
        },
      });
      assert.deepEqual(result, { usedTokens: 2000, totalTokens: 20000 });
    });

    it('treats missing token fields as 0', () => {
      const result = parseUsage({
        usage: { context_window_tokens: 10000 },
      });
      assert.deepEqual(result, { usedTokens: 0, totalTokens: 10000 });
    });
  });

  describe('computePercent', () => {
    it('returns null for non-numbers', () => {
      assert.equal(computePercent('a', 100), null);
      assert.equal(computePercent(50, 'b'), null);
    });

    it('returns null for zero totalTokens', () => {
      assert.equal(computePercent(50, 0), null);
    });

    it('computes 70% correctly', () => {
      assert.equal(computePercent(7000, 10000), 70);
    });

    it('rounds to nearest integer', () => {
      assert.equal(computePercent(7001, 10000), 70);
      assert.equal(computePercent(7500, 10000), 75);
    });

    it('returns 0 for zero usage', () => {
      assert.equal(computePercent(0, 10000), 0);
    });

    it('returns 100 when fully used', () => {
      assert.equal(computePercent(10000, 10000), 100);
    });
  });

  describe('shouldWarn', () => {
    const sessionId = '2026-04-13';

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
      const state = { firedForSession: '2026-04-12', firedAtPercent: 72 };
      assert.equal(shouldWarn(80, 70, state, sessionId), true);
    });

    it('returns true when state is null even above threshold', () => {
      assert.equal(shouldWarn(95, 70, null, sessionId), true);
    });
  });

  describe('formatWarning', () => {
    it('includes the percent and threshold', () => {
      const msg = formatWarning(75, 70, 7500, 10000);
      assert.ok(msg.includes('75%'), 'must include current percent');
      assert.ok(msg.includes('70%'), 'must include threshold');
    });

    it('includes token counts', () => {
      const msg = formatWarning(75, 70, 7500, 10000);
      assert.ok(msg.includes('7,500') || msg.includes('7500'), 'must include used tokens');
      assert.ok(msg.includes('10,000') || msg.includes('10000'), 'must include total tokens');
    });

    it('includes remaining estimate', () => {
      const msg = formatWarning(75, 70, 7500, 10000);
      assert.ok(msg.includes('2k') || msg.includes('2,500') || msg.includes('Remaining'), 'must mention remaining');
    });

    it('returns a non-empty string', () => {
      const msg = formatWarning(80, 70, 8000, 10000);
      assert.ok(typeof msg === 'string' && msg.length > 0);
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
    // Force re-import to get fresh homedir resolution
    const { loadThreshold, DEFAULT_THRESHOLD } = await import('../lib/budget.mjs');
    // Can't easily re-resolve homedir in ESM — test via env var override
    process.env.BUDGET_THRESHOLD_PERCENT = '';
    const t = loadThreshold();
    // Without config file and with empty env, should return DEFAULT_THRESHOLD
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

  it('exits 0 with empty stdin (no usage data)', () => {
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

  it('exits 0 with no usage field in payload', () => {
    const payload = JSON.stringify({ tool_name: 'Write', tool_input: {} });
    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env },
      timeout: 5000,
    });
    assert.equal(result.status, 0);
  });

  it('prints warning when usage crosses threshold, exits 0', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-warn-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const payload = JSON.stringify({
      usage: {
        input_tokens: 7500,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        context_window_tokens: 10000,
      },
    });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('BUDGET WARNING'), `stdout must include "BUDGET WARNING", got: ${result.stdout}`);
    assert.ok(result.stdout.includes('80%'), 'warning must include computed percent (80%)');
  });

  it('does NOT print warning when usage below threshold', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-ok-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const payload = JSON.stringify({
      usage: {
        input_tokens: 5000,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        context_window_tokens: 10000,
      },
    });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('BUDGET WARNING'), 'must NOT warn when usage < threshold');
  });

  it('does NOT print warning twice in same session (state file present)', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-once-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    // Pre-seed state file indicating warning already fired today
    const statePath = join(tmpHome, '.claude', 'budget-state.json');
    writeFileSync(statePath, JSON.stringify({ firedForSession: today, firedAtPercent: 75 }));

    const payload = JSON.stringify({
      usage: {
        input_tokens: 8500,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        context_window_tokens: 10000,
      },
    });

    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    rmSync(tmpHome, { recursive: true, force: true });

    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('BUDGET WARNING'), 'must NOT warn again when already fired today');
  });

  it('saves state file after warning fires', () => {
    const tmpHome = join(tmpdir(), `cds-budget-hook-state-${process.pid}`);
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });

    const payload = JSON.stringify({
      usage: {
        input_tokens: 7500,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        context_window_tokens: 10000,
      },
    });

    spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input: payload,
      env: { ...process.env, HOME: tmpHome, BUDGET_THRESHOLD_PERCENT: '70' },
      timeout: 5000,
    });

    const statePath = join(tmpHome, '.claude', 'budget-state.json');
    assert.ok(existsSync(statePath), 'budget-state.json must be created after warning fires');

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(state.firedForSession, today, 'state must record today as firedForSession');
    assert.ok(typeof state.firedAtPercent === 'number', 'state must record firedAtPercent');

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
    writeFileSync(statePath, JSON.stringify({ firedForSession: '2026-04-13', firedAtPercent: 75 }));

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
