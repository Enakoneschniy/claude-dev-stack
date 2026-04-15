/**
 * tests/workflow-enforcer.test.mjs — WF-01 PostToolUse Skill hook tests
 *
 * Covers gsd-workflow-enforcer.mjs must-have truths from 29-01-PLAN.md:
 *   SC#1..SC#5 runtime behavior (SC#6 wizard install is Plan 02).
 *
 * Pattern: isolated tmpDir cwd via mkdtempSync, seed ROADMAP.md + phases/*
 * fixtures, invoke hook via execFileSync with stdin payload, assert on stdout.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const hookPath = join(repoRoot, 'hooks', 'gsd-workflow-enforcer.mjs');

function setupTmpDir(prefix = 'wfe-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function seedRoadmap(tmpDir, roadmapContent) {
  const planningDir = join(tmpDir, '.planning');
  mkdirSync(planningDir, { recursive: true });
  writeFileSync(join(planningDir, 'ROADMAP.md'), roadmapContent);
}

function seedPhaseDir(tmpDir, phaseNum, slug, withContext = false) {
  const dirName = `${phaseNum}-${slug}`;
  const phaseDir = join(tmpDir, '.planning', 'phases', dirName);
  mkdirSync(phaseDir, { recursive: true });
  if (withContext) {
    writeFileSync(join(phaseDir, `${phaseNum}-CONTEXT.md`), `# Phase ${phaseNum}\n`);
  }
}

function runHook(tmpDir, stdinPayload) {
  return execFileSync('node', [hookPath], {
    cwd: tmpDir,
    input: JSON.stringify(stdinPayload),
    encoding: 'utf8',
  });
}

describe('gsd-workflow-enforcer.mjs', () => {
  it('exits silently on non-Skill tool_name', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(tmpDir, `## Phases\n- [ ] **Phase 30:** Foo\n- [ ] **Phase 31:** Bar\n`);
      const out = runHook(tmpDir, {
        tool_name: 'Bash',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits silently when skill is not gsd-plan-phase', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(
        tmpDir,
        `## Phases\n- [ ] **Phase 30:** Foo\n- [ ] **Phase 31:** Bar\n- [ ] **Phase 32:** Baz\n`
      );
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-discuss-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('ignores tool_input.skill_name field (wrong key)', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(tmpDir, `## Phases\n- [ ] **Phase 30:** Foo\n- [ ] **Phase 31:** Bar\n`);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill_name: 'gsd-plan-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits silently when ROADMAP.md is missing', () => {
    const tmpDir = setupTmpDir();
    try {
      // No .planning/ created — non-GSD project.
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('emits discuss-next when 2+ unplanned phases pending', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(tmpDir, `## Phases\n- [ ] **Phase 30:** Foo\n- [ ] **Phase 31:** Bar\n`);
      seedPhaseDir(tmpDir, '30', 'foo', false);
      seedPhaseDir(tmpDir, '31', 'bar', false);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.ok(
        out.startsWith('NEXT: /gsd-discuss-phase 30 — do NOT run /gsd-execute-phase'),
        `expected discuss-next directive with phase 30, got: ${JSON.stringify(out)}`
      );
      assert.ok(out.endsWith('\n'), 'output must end with newline');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('picks the FIRST unplanned phase as M', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(
        tmpDir,
        `## Phases\n- [ ] **Phase 22:** Planned\n- [ ] **Phase 30:** Unplanned-a\n- [ ] **Phase 31:** Unplanned-b\n`
      );
      seedPhaseDir(tmpDir, '22', 'planned', true); // has CONTEXT.md
      seedPhaseDir(tmpDir, '30', 'unplanned-a', false);
      seedPhaseDir(tmpDir, '31', 'unplanned-b', false);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.ok(out.includes('discuss-phase 30'), `expected phase 30, got: ${out}`);
      assert.ok(!out.includes('discuss-phase 22'), 'must not pick planned phase 22');
      assert.ok(!out.includes('discuss-phase 31'), 'must pick first unplanned, not 31');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('emits manager directive when all pending phases are planned', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(
        tmpDir,
        `## Phases\n- [ ] **Phase 25:** A\n- [ ] **Phase 26:** B\n- [ ] **Phase 27:** C\n`
      );
      seedPhaseDir(tmpDir, '25', 'a', true);
      seedPhaseDir(tmpDir, '26', 'b', true);
      seedPhaseDir(tmpDir, '27', 'c', true);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.ok(
        out.startsWith('NEXT: /gsd-manager — all 3 pending phases have plans'),
        `expected manager directive, got: ${JSON.stringify(out)}`
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits silently when only 1 pending phase remains', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(tmpDir, `## Phases\n- [ ] **Phase 30:** Only one\n`);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits silently when 0 pending phases remain', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(
        tmpDir,
        `## Phases\n- [x] **Phase 28:** Done\n- [x] **Phase 29:** Done\n`
      );
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.equal(out, '');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles decimal phase numbers like 28.1', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(
        tmpDir,
        `## Phases\n- [ ] **Phase 28.1:** Decimal\n- [ ] **Phase 29:** Next\n`
      );
      seedPhaseDir(tmpDir, '28.1', 'decimal', false);
      seedPhaseDir(tmpDir, '29', 'next', false);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.ok(out.includes('discuss-phase 28.1'), `expected decimal phase, got: ${out}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects malformed phase numbers (regex-DoS guard)', () => {
    const tmpDir = setupTmpDir();
    try {
      const roadmap =
        `## Phases\n` +
        `- [ ] **Phase 9999999999999999999999:** overflow\n` +
        `- [ ] **Phase 30:** valid-a\n` +
        `- [ ] **Phase 31:** valid-b\n`;
      seedRoadmap(tmpDir, roadmap);
      seedPhaseDir(tmpDir, '30', 'valid-a', false);
      seedPhaseDir(tmpDir, '31', 'valid-b', false);
      const t0 = Date.now();
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 1500, `must complete under 1500ms, took ${elapsed}ms`);
      assert.ok(out.includes('discuss-phase 30'), `must reference valid phase 30, got: ${out}`);
      assert.ok(!out.includes('9999999999999999999999'), 'must not leak overflow number');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('bounds scan to MAX_LINES', () => {
    const tmpDir = setupTmpDir();
    try {
      const header =
        `## Phases\n- [ ] **Phase 30:** valid-a\n- [ ] **Phase 31:** valid-b\n`;
      const junk = Array(20_000).fill('noise line').join('\n') + '\n';
      seedRoadmap(tmpDir, header + junk);
      seedPhaseDir(tmpDir, '30', 'valid-a', false);
      seedPhaseDir(tmpDir, '31', 'valid-b', false);
      const t0 = Date.now();
      runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 1500, `must complete under 1500ms even with 20k lines, took ${elapsed}ms`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('outputs single line terminated by newline', () => {
    const tmpDir = setupTmpDir();
    try {
      seedRoadmap(tmpDir, `## Phases\n- [ ] **Phase 30:** A\n- [ ] **Phase 31:** B\n`);
      seedPhaseDir(tmpDir, '30', 'a', false);
      seedPhaseDir(tmpDir, '31', 'b', false);
      const out = runHook(tmpDir, {
        tool_name: 'Skill',
        tool_input: { skill: 'gsd-plan-phase' },
      });
      assert.ok(out.endsWith('\n'), 'must end with \\n');
      const newlineCount = (out.match(/\n/g) || []).length;
      assert.equal(newlineCount, 1, `must contain exactly one newline, got ${newlineCount}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
