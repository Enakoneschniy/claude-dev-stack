// tests/git-conventions-check-hook.test.mjs — SKL-04 coverage for hooks/git-conventions-check.mjs
//
// PreToolUse hook (matcher: Bash, if: Bash(git commit*)). Reads JSON payload from
// stdin, extracts commit message from tool_input.command via -m "..." regex,
// validates against conventional commits regex. Warn-only by default; strict mode
// (exit 2) when .planning/config.json has workflow.commit_validation: "strict".

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'git-conventions-check.mjs');

function run(input, { cwd } = {}) {
  return spawnSync('node', [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 3000,
    cwd,
  });
}

function buildPayload(command, toolName = 'Bash') {
  return JSON.stringify({
    session_id: 'x',
    tool_name: toolName,
    tool_input: { command, description: 'test' },
  });
}

describe('git-conventions-check hook (SKL-04)', () => {
  let warnDir;   // cwd with no .planning/config.json → default warn mode
  let strictDir; // cwd with strict config
  let badCfgDir; // cwd with malformed config.json

  before(() => {
    const base = mkdtempSync(join(tmpdir(), 'cds-git-conv-'));
    warnDir = join(base, 'warn');
    strictDir = join(base, 'strict');
    badCfgDir = join(base, 'bad');
    mkdirSync(warnDir, { recursive: true });
    mkdirSync(join(strictDir, '.planning'), { recursive: true });
    mkdirSync(join(badCfgDir, '.planning'), { recursive: true });
    writeFileSync(
      join(strictDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { commit_validation: 'strict' } }, null, 2)
    );
    writeFileSync(
      join(badCfgDir, '.planning', 'config.json'),
      '{ not valid json'
    );
  });

  after(() => {
    // Leave tmpdir to be cleaned by OS; avoid aggressive rm in case of cwd collision
    try { rmSync(dirname(warnDir), { recursive: true, force: true }); } catch {}
  });

  // Case 1
  it('empty stdin → silent, exit 0', () => {
    const r = run('', { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });

  // Case 2
  it('tool_name ≠ "Bash" → silent, exit 0', () => {
    const r = run(buildPayload('git commit -m "fix stuff"', 'Write'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 3
  it('command does not contain "git commit" → silent, exit 0', () => {
    const r = run(buildPayload('git status'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 4-6: valid conventional commits (silent)
  it('valid: "feat: add login" → silent, exit 0', () => {
    const r = run(buildPayload('git commit -m "feat: add login"'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('valid with scope: "fix(auth): handle null" → silent, exit 0', () => {
    const r = run(buildPayload('git commit -m "fix(auth): handle null"'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('valid breaking: "feat!: breaking change" → silent, exit 0', () => {
    const r = run(buildPayload('git commit -m "feat!: breaking change"'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 7
  it('invalid: "fix stuff" → warn (stdout), exit 0 (D-12)', () => {
    const r = run(buildPayload('git commit -m "fix stuff"'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('fix stuff'), `expected bad msg in output: "${r.stdout}"`);
    assert.ok(/fix:/.test(r.stdout), `expected suggestion containing "fix:": "${r.stdout}"`);
  });

  // Case 8
  it('invalid: "wip" → warn (stdout), exit 0', () => {
    const r = run(buildPayload('git commit -m "wip"'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length > 0, 'expected a warning');
  });

  // Case 9
  it('git commit (no -m) → silent, exit 0', () => {
    const r = run(buildPayload('git commit'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 10
  it('git commit --amend → silent, exit 0', () => {
    const r = run(buildPayload('git commit --amend'), { cwd: warnDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 11 — STRICT mode with invalid message
  it('STRICT mode + invalid message → exit 2 (blocking)', () => {
    const r = run(buildPayload('git commit -m "fix stuff"'), { cwd: strictDir });
    assert.equal(r.status, 2, `expected exit 2 in strict mode, got ${r.status}`);
    const explain = (r.stdout + r.stderr).toLowerCase();
    assert.ok(explain.length > 0, 'expected some explanation on blocking');
  });

  // Case 12 — STRICT mode with valid message
  it('STRICT mode + valid message → silent, exit 0', () => {
    const r = run(buildPayload('git commit -m "feat: add login"'), { cwd: strictDir });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  // Case 13
  it('malformed config.json → falls back to warn mode, exit 0', () => {
    const r = run(buildPayload('git commit -m "fix stuff"'), { cwd: badCfgDir });
    assert.equal(r.status, 0, 'must not block on malformed config');
    assert.ok(r.stdout.length > 0, 'should still warn');
  });

  // Case 14 — heredoc: skip (can't reliably extract)
  it('heredoc commit → silent (cannot reliably validate)', () => {
    const cmd = `git commit -m "$(cat <<'EOF'\nfeat: x\nEOF\n)"`;
    const r = run(buildPayload(cmd), { cwd: warnDir });
    assert.equal(r.status, 0);
    // Either silent or valid match (both acceptable) — we only require NOT erroring
    // and NOT producing a false-positive warning about the literal "$(cat..." command
    assert.ok(!r.stdout.includes('$(cat'), 'must not echo raw shell syntax as "bad message"');
  });

  // Case 15 — length cap on output
  it('warn output is ≤ 500 chars (warn or block)', () => {
    const r = run(buildPayload('git commit -m "fix stuff"'), { cwd: warnDir });
    assert.ok((r.stdout + r.stderr).length <= 500, 'output under 500 chars');
  });
});
