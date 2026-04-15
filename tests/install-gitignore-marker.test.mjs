import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { addSessionMarkerToGitignore } from '../lib/install/hooks.mjs';

describe('install-gitignore-marker (Phase 28 / SSR-01 SC#4)', () => {
  let fixtureRoot;

  before(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'ssr01-gi-'));
  });

  after(() => {
    if (fixtureRoot && existsSync(fixtureRoot)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  function newProject(name) {
    const p = join(fixtureRoot, name);
    mkdirSync(p, { recursive: true });
    return p;
  }

  it('creates .gitignore with the marker line when the file is missing', () => {
    const p = newProject('no-gitignore');
    const changed = addSessionMarkerToGitignore(p);
    assert.equal(changed, true);
    const contents = readFileSync(join(p, '.gitignore'), 'utf8');
    assert.match(contents, /# claude-dev-stack: session marker \(Phase 28\)/);
    assert.match(contents, /^\.claude\/\.session-loaded$/m);
  });

  it('appends the marker when .gitignore exists but does not contain it', () => {
    const p = newProject('existing-gitignore');
    writeFileSync(join(p, '.gitignore'), 'node_modules/\ndist/\n');
    const changed = addSessionMarkerToGitignore(p);
    assert.equal(changed, true);
    const contents = readFileSync(join(p, '.gitignore'), 'utf8');
    assert.match(contents, /node_modules\//);
    assert.match(contents, /# claude-dev-stack: session marker \(Phase 28\)/);
    assert.match(contents, /^\.claude\/\.session-loaded$/m);
  });

  it('is a no-op when the marker line is already present', () => {
    const p = newProject('already-present');
    const original = 'node_modules/\n.claude/.session-loaded\n';
    writeFileSync(join(p, '.gitignore'), original);
    const changed = addSessionMarkerToGitignore(p);
    assert.equal(changed, false);
    const contents = readFileSync(join(p, '.gitignore'), 'utf8');
    assert.equal(contents, original, 'file was rewritten despite idempotency contract');
  });

  it('is idempotent across two consecutive calls', () => {
    const p = newProject('double-call');
    const first = addSessionMarkerToGitignore(p);
    const second = addSessionMarkerToGitignore(p);
    assert.equal(first, true);
    assert.equal(second, false);
    const contents = readFileSync(join(p, '.gitignore'), 'utf8');
    const matches = contents.match(/^\.claude\/\.session-loaded$/gm);
    assert.ok(matches, 'marker line missing after idempotent run');
    assert.equal(matches.length, 1, `marker line appears ${matches.length} times, expected 1`);
  });

  it('handles gitignore without trailing newline correctly', () => {
    const p = newProject('no-trailing-newline');
    writeFileSync(join(p, '.gitignore'), 'node_modules'); // no \n
    const changed = addSessionMarkerToGitignore(p);
    assert.equal(changed, true);
    const contents = readFileSync(join(p, '.gitignore'), 'utf8');
    // Original content still present
    assert.match(contents, /^node_modules$/m);
    // Marker appended on its own line
    assert.match(contents, /^\.claude\/\.session-loaded$/m);
    // No two adjacent non-empty lines without a separating newline
    assert.ok(!/node_modules# /.test(contents), 'comment header ran into prior line');
  });
});
