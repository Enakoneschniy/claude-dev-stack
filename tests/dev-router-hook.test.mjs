// tests/dev-router-hook.test.mjs — SKL-01 coverage for hooks/dev-router.mjs
//
// UserPromptSubmit hook. Reads JSON from stdin, regex-matches dev/research/session/end
// keywords against payload.prompt, emits ≤200-char routing hint as stdout (which Claude
// Code prepends as additionalContext). Fail-silent on all error paths.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'dev-router.mjs');

function run(input) {
  return spawnSync('node', [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 3000,
  });
}

describe('dev-router hook (SKL-01)', () => {
  it('empty stdin → silent, exit 0', () => {
    const r = run('');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('malformed JSON → silent, exit 0', () => {
    const r = run('not-json{{{');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('JSON without prompt key → silent, exit 0', () => {
    const r = run(JSON.stringify({ session_id: 'x' }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('dev keyword (ASCII: "build me a login form") → GSD hint, exit 0', () => {
    const r = run(JSON.stringify({ session_id: 'x', prompt: 'build me a login form' }));
    assert.equal(r.status, 0);
    assert.ok(/GSD|\/gsd[-:]/i.test(r.stdout), `expected GSD hint, got: "${r.stdout}"`);
  });

  it('dev keyword (Cyrillic: "сделай фикс бага в auth") → GSD hint, exit 0', () => {
    const r = run(JSON.stringify({ session_id: 'x', prompt: 'сделай фикс бага в auth' }));
    assert.equal(r.status, 0);
    assert.ok(/GSD|\/gsd[-:]/i.test(r.stdout), `expected GSD hint, got: "${r.stdout}"`);
  });

  it('research keyword ("research how OAuth refresh tokens work") → research hint, exit 0', () => {
    const r = run(JSON.stringify({ session_id: 'x', prompt: 'research how OAuth refresh tokens work' }));
    assert.equal(r.status, 0);
    assert.ok(/research/i.test(r.stdout), `expected research hint, got: "${r.stdout}"`);
  });

  it('no keyword match ("what time is it") → silent, exit 0', () => {
    const r = run(JSON.stringify({ session_id: 'x', prompt: 'what time is it' }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('routing hint emission is ≤ 200 chars', () => {
    const r = run(JSON.stringify({ session_id: 'x', prompt: 'build me a login form' }));
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length <= 200, `stdout length ${r.stdout.length} > 200`);
  });

  // ReDoS guard (threat T-31-04): pathological input must complete quickly
  it('pathological 10KB input → completes < 1000ms, exit 0', () => {
    const bigPrompt = 'a'.repeat(10000);
    const start = Date.now();
    const r = run(JSON.stringify({ session_id: 'x', prompt: bigPrompt }));
    const elapsed = Date.now() - start;
    assert.equal(r.status, 0);
    assert.ok(elapsed < 1000, `must exit < 1000ms, took ${elapsed}ms`);
  });
});
