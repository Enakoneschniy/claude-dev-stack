// tests/project-switcher-hook.test.mjs — SKL-03 coverage for hooks/project-switcher.mjs
//
// UserPromptSubmit hook. Reads project names from VAULT_PATH/project-map.json and
// emits a switch hint when the prompt mentions a project DIFFERENT from the current
// cwd-resolved project. Silent on current-project match.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'project-switcher.mjs');

function run(input, { cwd, vaultPath } = {}) {
  return spawnSync('node', [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 3000,
    cwd,
    env: { ...process.env, VAULT_PATH: vaultPath || '' },
  });
}

describe('project-switcher hook (SKL-03)', () => {
  let tmpBase;
  let vaultPath;
  let bikoProjectDir;
  let cdsProjectDir;

  before(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'cds-project-switcher-'));
    vaultPath = join(tmpBase, 'vault');
    bikoProjectDir = join(tmpBase, 'Projects', 'biko-pro');
    cdsProjectDir = join(tmpBase, 'Projects', 'claude-dev-stack');
    const coremindDir = join(tmpBase, 'Projects', 'coremind');
    mkdirSync(vaultPath, { recursive: true });
    mkdirSync(bikoProjectDir, { recursive: true });
    mkdirSync(cdsProjectDir, { recursive: true });
    mkdirSync(coremindDir, { recursive: true });

    const projectMap = {
      projects: {
        [bikoProjectDir]: 'biko-pro',
        [cdsProjectDir]: 'claude-dev-stack',
        [coremindDir]: 'coremind',
      },
    };
    writeFileSync(join(vaultPath, 'project-map.json'), JSON.stringify(projectMap, null, 2));
  });

  after(() => {
    if (tmpBase) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('empty stdin → silent, exit 0', () => {
    const r = run('', { cwd: cdsProjectDir, vaultPath });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('malformed JSON → silent, exit 0', () => {
    const r = run('not-json{{{', { cwd: cdsProjectDir, vaultPath });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('missing vault/project-map.json → silent, exit 0 (D-09)', () => {
    const bogusVault = join(tmpBase, 'does-not-exist');
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: 'switch to biko-pro please' }),
      { cwd: cdsProjectDir, vaultPath: bogusVault }
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('empty prompt → silent, exit 0', () => {
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: '' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('prompt mentions current project → silent (no self-switch hint)', () => {
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: 'let us work on claude-dev-stack today' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('prompt mentions different project → emits switch hint with name + path', () => {
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: 'switch to biko-pro please' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('biko-pro'), `expected name, got: "${r.stdout}"`);
    assert.ok(r.stdout.includes(bikoProjectDir), `expected path, got: "${r.stdout}"`);
    assert.ok(/switch/i.test(r.stdout), `expected switch hint, got: "${r.stdout}"`);
  });

  it('multiple projects mentioned → emits for first non-current match only', () => {
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: 'compare biko-pro with coremind please' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.equal(r.status, 0);
    // Exactly one "PROJECT HINT" emitted
    const matches = (r.stdout.match(/PROJECT HINT/g) || []).length;
    assert.equal(matches, 1, `expected exactly 1 hint, got ${matches}: "${r.stdout}"`);
  });

  it('word-boundary match: "coremind" matches but "scoremind" does not', () => {
    const r1 = run(
      JSON.stringify({ session_id: 'x', prompt: 'switch to coremind for a bit' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.ok(r1.stdout.includes('coremind'), 'coremind as a whole word should match');

    const r2 = run(
      JSON.stringify({ session_id: 'x', prompt: 'I like scoremind and other apps' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.equal(r2.stdout, '', `scoremind should NOT match coremind, got: "${r2.stdout}"`);
  });

  it('emission is ≤ 200 chars', () => {
    const r = run(
      JSON.stringify({ session_id: 'x', prompt: 'switch to biko-pro please' }),
      { cwd: cdsProjectDir, vaultPath }
    );
    assert.ok(r.stdout.length <= 200, `stdout length ${r.stdout.length} > 200`);
  });
});
