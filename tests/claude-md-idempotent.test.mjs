/**
 * Phase 30 — BUG-07: CLAUDE.md idempotent merge tests.
 *
 * Covers the `updateManagedSection` contract in lib/project-setup.mjs:
 * the wizard must preserve user-written CLAUDE.md content across re-runs
 * and only touch content between our claude-dev-stack markers.
 *
 * TDD RED phase (Task 1): `updateManagedSection` is not yet exported —
 * scenarios A–F must fail with a "does not provide an export named
 * 'updateManagedSection'" error until Task 2 implements the function.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  updateManagedSection,
  updateProjectClaudeMd,
} from '../lib/project-setup.mjs';

const MARKER_START = '<!-- @claude-dev-stack:start -->';
const MARKER_END = '<!-- @claude-dev-stack:end -->';

function makeTmpProject() {
  return mkdtempSync(join(tmpdir(), 'claude-md-idem-'));
}

function cleanup(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

describe('updateManagedSection (BUG-07)', () => {
  it('Scenario A — no CLAUDE.md → created', () => {
    const projectDir = makeTmpProject();
    try {
      const status = updateManagedSection(projectDir, '## Test Section\nhello');
      assert.equal(status, 'created');

      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      assert.ok(existsSync(claudeMdPath));
      const content = readFileSync(claudeMdPath, 'utf8');
      assert.ok(content.includes(MARKER_START));
      assert.ok(content.includes(MARKER_END));
      assert.ok(content.includes('hello'));
    } finally {
      cleanup(projectDir);
    }
  });

  it('Scenario B — existing CLAUDE.md with markers → updated in place', () => {
    const projectDir = makeTmpProject();
    try {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      writeFileSync(
        claudeMdPath,
        `# My Header\n\n${MARKER_START}\nold\n${MARKER_END}\n\n## My User Section\nuser stuff\n`
      );

      const status = updateManagedSection(projectDir, '## New Managed\nnew content');
      assert.equal(status, 'updated');

      const updated = readFileSync(claudeMdPath, 'utf8');
      assert.ok(updated.includes('# My Header'));
      assert.ok(updated.includes('## My User Section'));
      assert.ok(updated.includes('user stuff'));
      assert.ok(updated.includes('new content'));
      assert.ok(!updated.includes('\nold\n'));
    } finally {
      cleanup(projectDir);
    }
  });

  it('Scenario C — existing CLAUDE.md without markers → appended at end', () => {
    const projectDir = makeTmpProject();
    try {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      const originalUserContent = '# Hand-written\n\nUser wrote this themselves.\n';
      writeFileSync(claudeMdPath, originalUserContent);

      const status = updateManagedSection(projectDir, '## Managed\nnew');
      assert.equal(status, 'appended');

      const updated = readFileSync(claudeMdPath, 'utf8');
      // Original user content preserved at the top byte-for-byte
      assert.ok(updated.startsWith(originalUserContent));
      // Managed section appended at the end
      assert.ok(updated.includes(MARKER_START));
      assert.ok(updated.includes(MARKER_END));
      assert.ok(updated.includes('## Managed'));
      assert.ok(updated.includes('new'));
      assert.ok(updated.lastIndexOf(MARKER_END) > updated.indexOf('User wrote this themselves.'));
    } finally {
      cleanup(projectDir);
    }
  });

  it('Scenario D — user content outside markers preserved across update', () => {
    const projectDir = makeTmpProject();
    try {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      const originalBefore = '# Top\n\nBefore markers — must survive.\n\n';
      const originalAfter = '\n\n## After Section\n\nAfter markers — must survive.\n';
      const original = `${originalBefore}${MARKER_START}\nold managed\n${MARKER_END}${originalAfter}`;
      writeFileSync(claudeMdPath, original);

      const status = updateManagedSection(projectDir, '## v2 managed');
      assert.equal(status, 'updated');

      const updated = readFileSync(claudeMdPath, 'utf8');
      assert.ok(updated.startsWith(originalBefore), 'content before markers preserved');
      assert.ok(updated.endsWith(originalAfter), 'content after markers preserved');
      assert.ok(updated.includes('## v2 managed'));
      assert.ok(!updated.includes('old managed'));
    } finally {
      cleanup(projectDir);
    }
  });

  it('Scenario E — idempotent re-run (run wizard twice = no diff)', () => {
    const projectDir = makeTmpProject();
    try {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');

      const firstStatus = updateManagedSection(projectDir, '## Managed\nstable content');
      assert.equal(firstStatus, 'created');
      const afterFirst = readFileSync(claudeMdPath, 'utf8');

      const secondStatus = updateManagedSection(projectDir, '## Managed\nstable content');
      assert.equal(secondStatus, 'unchanged');
      const afterSecond = readFileSync(claudeMdPath, 'utf8');

      assert.equal(afterFirst, afterSecond, 'file content byte-identical between runs');
    } finally {
      cleanup(projectDir);
    }
  });

  it('Scenario F — user content with literal markers (THREAT T-30-01)', () => {
    // Accepted behavior per threat model T-30-01: if a user copy-pastes our
    // marker tokens into their own content, we will treat that span as
    // managed. Markdown-aware parsing is YAGNI (see 30-CONTEXT.md deferred
    // ideas). This test locks the accepted behavior.
    const projectDir = makeTmpProject();
    try {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      writeFileSync(
        claudeMdPath,
        `# User Doc\n\n${MARKER_START}\nuser accidentally pasted these tokens\n${MARKER_END}\n`
      );

      const firstStatus = updateManagedSection(projectDir, '## Managed\nv1');
      assert.equal(firstStatus, 'updated');

      const secondStatus = updateManagedSection(projectDir, '## Managed\nv2');
      assert.equal(secondStatus, 'updated');

      const updated = readFileSync(claudeMdPath, 'utf8');
      assert.ok(updated.includes('## Managed'));
      assert.ok(updated.includes('v2'));
      assert.ok(!updated.includes('user accidentally pasted these tokens'));
    } finally {
      cleanup(projectDir);
    }
  });
});

describe('updateManagedSection race conditions (BUG-07)', () => {
  // T-30-02 — concurrent wizard runs. ASVS L1 has no locking requirement and
  // this is a single-user dev tool; risk is accepted and documented here.
  // Implementation guard (proper-lockfile) deferred per 30-CONTEXT.md.
  it.skip('concurrent wizard runs — documented as accepted risk (T-30-02)', () => {});
});

describe('updateProjectClaudeMd backward-compat (D-03)', () => {
  it('still creates CLAUDE.md with our skills section on a fresh project', () => {
    const projectDir = makeTmpProject();
    try {
      const status = updateProjectClaudeMd(projectDir);
      assert.ok(['created', 'updated', 'appended', 'unchanged'].includes(status));

      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      assert.ok(existsSync(claudeMdPath));
      const content = readFileSync(claudeMdPath, 'utf8');
      assert.ok(content.includes(MARKER_START));
      assert.ok(content.includes(MARKER_END));
      assert.ok(content.includes('Claude Dev Stack Skills'));
    } finally {
      cleanup(projectDir);
    }
  });
});

describe('generateClaudeMD wiring (BUG-07 integration)', () => {
  it('Scenario H — updateManagedSection preserves user content end-to-end', async () => {
    const tmpVault = mkdtempSync(join(tmpdir(), 'cds-vault-'));
    const tmpProject = mkdtempSync(join(tmpdir(), 'cds-proj-'));
    try {
      // Pre-seed CLAUDE.md with user content, no markers
      const userContent = '# My Project\n\nUser-written notes that MUST survive.\n';
      writeFileSync(join(tmpProject, 'CLAUDE.md'), userContent);

      const { updateManagedSection: ums } = await import('../lib/project-setup.mjs');
      const status = ums(tmpProject, '## Test\nmanaged content');

      assert.equal(status, 'appended');
      const result = readFileSync(join(tmpProject, 'CLAUDE.md'), 'utf8');
      assert.ok(result.includes('User-written notes that MUST survive.'));
      assert.ok(result.includes('## Test'));
      assert.ok(result.includes(MARKER_END));
    } finally {
      cleanup(tmpVault);
      cleanup(tmpProject);
    }
  });
});
