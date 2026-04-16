/**
 * Script-level tests for the SKILL.md /end bash block that invokes
 * lib/adr-bridge-session.mjs. Uses a mock bridge fixture so tests
 * never hit the real `claude` CLI.
 *
 * Plan 26-03 Task 2.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const MOCK_BRIDGE = new URL('./fixtures/mock-adr-bridge.mjs', import.meta.url).pathname;

// This is the EXACT bash block from SKILL.md (ADR-bridge section). If SKILL.md
// drifts, update this here — the test file is the contract.
const SKILL_BASH = `
ADR_BRIDGE="$ADR_BRIDGE_PATH"
if [ -f "$ADR_BRIDGE" ]; then
  ADR_RESULT=$(VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME" \\
    node "$ADR_BRIDGE" \\
    --session-log "$(basename "$SESSION_FILE")" \\
    --cwd "$REPO_ROOT" \\
    \${SESSION_ID:+--session-id "$SESSION_ID"} \\
    2>/dev/null) || ADR_RESULT='{"newAdrs":[],"superseded":[],"error":"bridge failed"}'
  echo "$ADR_RESULT"
fi
`;

function mkEnv(t, overrides = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    VAULT: t.vault,
    PROJECT_NAME: 'test-proj',
    SESSION_FILE: join(t.vault, 'projects', 'test-proj', 'sessions', '2026-04-15-x.md'),
    REPO_ROOT: t.dir,
    ADR_BRIDGE_PATH: MOCK_BRIDGE,
    MOCK_MODE: 'success',
    ...overrides,
  };
}

function runSkillBash(env) {
  return execFileSync('bash', ['-c', SKILL_BASH], { env, encoding: 'utf8' });
}

describe('SKILL.md /end ADR-bridge block', () => {
  let t;
  beforeEach(() => {
    t = {
      dir: mkdtempSync(join(tmpdir(), 'skill-end-flow-')),
    };
    t.vault = join(t.dir, 'vault');
  });
  afterEach(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('test 1: bridge present, success mode — ADR_RESULT is valid JSON with newAdrs', () => {
    const env = mkEnv(t);
    const stdout = runSkillBash(env);
    const lines = stdout.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const parsed = JSON.parse(jsonLine);
    assert.equal(parsed.newAdrs[0].number, 13);
    assert.equal(parsed.newAdrs[0].topic, 'x');
    assert.equal(parsed.error, null);
  });

  it('test 2: bridge absent — block skipped, no JSON emitted', () => {
    const env = mkEnv(t, { ADR_BRIDGE_PATH: '/tmp/no-such-bridge-path.mjs' });
    const stdout = runSkillBash(env);
    assert.equal(stdout.trim(), '', 'no output expected when bridge file is absent');
  });

  it('test 3: bridge fails — fallback JSON used', () => {
    const env = mkEnv(t, { MOCK_MODE: 'fail' });
    const stdout = runSkillBash(env);
    const lines = stdout.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const parsed = JSON.parse(jsonLine);
    assert.deepEqual(parsed.newAdrs, []);
    assert.deepEqual(parsed.superseded, []);
    assert.equal(parsed.error, 'bridge failed');
  });

  it('test 4: SESSION_ID unset — --session-id flag omitted from argv', () => {
    const argvFile = join(t.dir, 'argv-no-sid.json');
    const env = mkEnv(t, { MOCK_ARGV_FILE: argvFile });
    delete env.SESSION_ID;
    runSkillBash(env);
    const argv = JSON.parse(readFileSync(argvFile, 'utf8'));
    assert.ok(!argv.includes('--session-id'), `argv should NOT have --session-id; got ${JSON.stringify(argv)}`);
    assert.ok(argv.includes('--session-log'));
    assert.ok(argv.includes('--cwd'));
  });

  it('test 5: SESSION_ID set — --session-id flag passed through', () => {
    const argvFile = join(t.dir, 'argv-with-sid.json');
    const env = mkEnv(t, { MOCK_ARGV_FILE: argvFile, SESSION_ID: 'abc-123' });
    runSkillBash(env);
    const argv = JSON.parse(readFileSync(argvFile, 'utf8'));
    const idx = argv.indexOf('--session-id');
    assert.ok(idx >= 0, `argv should include --session-id; got ${JSON.stringify(argv)}`);
    assert.equal(argv[idx + 1], 'abc-123');
  });
});
