// Phase 37 Plan 03 Task 37-03-07 — tests for planning.status.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidFilterError, NotAGsdProjectError } from './shared.js';
import { planningStatus } from './planning-status.js';
import { buildFixtureVault, type VaultFixture } from './__fixtures__/vault-tree.js';

const ROADMAP_FULL = `# Milestone v1.0 — CDS Alpha

## Active Milestone Phases

| # | Phase | Reqs | Status |
|---|-------|------|--------|
| 33 | Monorepo | MONO | Complete |
| 37 | MCP | MCP | In progress |
| 38 | Backfill | BACK | Not started |
`;

const STATE_FULL = `---
milestone: v1.0
milestone_name: CDS Alpha
status: in-progress
progress:
  total_phases: 3
  completed_phases: 1
  percent: 33
last_activity: "2026-04-16"
---

# State

## Current Position

Phase: **37 - MCP Adapter** (In progress)

## Critical Risks

- MCP SDK lock-in
`;

const ROADMAP_ONLY = `# Milestone v0.5

## Phases

- [x] Phase 1
- [ ] Phase 2
`;

const ROADMAP_BROKEN = `# junk

No phase section at all.
`;

describe('planning.status', () => {
  let fixture: VaultFixture;

  beforeEach(() => {
    fixture = buildFixtureVault({
      projects: [
        {
          name: 'alpha',
          planning: { roadmap: ROADMAP_FULL, state: STATE_FULL },
        },
        {
          name: 'beta',
          planning: { roadmap: ROADMAP_ONLY },
        },
        {
          name: 'gamma',
          // Empty .planning with NO files
          planning: {},
        },
      ],
    });
    // Ensure gamma's .planning dir exists but contains no ROADMAP.md.
    mkdirSync(join(fixture.vaultPath, 'projects', 'gamma', '.planning'), {
      recursive: true,
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('returns full shape for well-formed project', async () => {
    const result = await planningStatus(
      { project: 'alpha' },
      { vaultPath: fixture.vaultPath },
    );
    expect(result.project).toBe('alpha');
    expect(result.milestone?.version).toBe('v1.0');
    expect(result.milestone?.name).toBe('CDS Alpha');
    expect(result.milestone?.status).toBe('in-progress');
    expect(result.phases?.total).toBe(3);
    expect(result.phases?.completed).toBe(1);
    expect(result.phases?.in_progress).toBe(1);
    expect(result.phases?.pending).toBe(1);
    expect(result.progress_percent).toBe(33);
    expect(result.current_phase?.number).toBe('37');
    expect(result.current_phase?.name).toMatch(/MCP Adapter/i);
    expect(result.last_activity).toBe('2026-04-16');
    expect(result.critical_risks).toEqual(['MCP SDK lock-in']);
  });

  it('returns partial shape when state.md missing', async () => {
    const result = await planningStatus(
      { project: 'beta' },
      { vaultPath: fixture.vaultPath },
    );
    expect(result.project).toBe('beta');
    expect(result.phases?.total).toBe(2);
    expect(result.current_phase).toBeUndefined();
    expect(result.last_activity).toBeUndefined();
  });

  it('throws NotAGsdProjectError for missing ROADMAP.md', async () => {
    await expect(
      planningStatus({ project: 'gamma' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(NotAGsdProjectError);
  });

  it('throws NotAGsdProjectError for unknown project', async () => {
    await expect(
      planningStatus({ project: 'unknown' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(NotAGsdProjectError);
  });

  it('uses cwd basename when project arg omitted', async () => {
    const cwd = join(fixture.vaultPath, 'projects', 'alpha');
    const result = await planningStatus(
      {},
      { vaultPath: fixture.vaultPath, cwd },
    );
    expect(result.project).toBe('alpha');
    expect(result.current_phase?.number).toBe('37');
  });

  it('rejects invalid project basename', async () => {
    await expect(
      planningStatus({ project: '../etc' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('lenient parser: malformed ROADMAP section still returns object', async () => {
    const brokenFixture = buildFixtureVault({
      projects: [
        {
          name: 'broken',
          planning: { roadmap: ROADMAP_BROKEN },
        },
      ],
    });
    try {
      const result = await planningStatus(
        { project: 'broken' },
        { vaultPath: brokenFixture.vaultPath },
      );
      expect(result.project).toBe('broken');
      // No throws; phases omitted since parser couldn't find a section.
      expect(result.phases).toBeUndefined();
    } finally {
      brokenFixture.cleanup();
    }
  });

  it('plan_count reflects number of PLAN.md files in current phase dir', async () => {
    const fx = buildFixtureVault({
      projects: [
        {
          name: 'delta',
          planning: { roadmap: ROADMAP_FULL, state: STATE_FULL },
        },
      ],
    });
    try {
      const phasesDir = join(
        fx.vaultPath,
        'projects',
        'delta',
        '.planning',
        'phases',
        '37-mcp',
      );
      mkdirSync(phasesDir, { recursive: true });
      writeFileSync(join(phasesDir, '37-01-PLAN.md'), '');
      writeFileSync(join(phasesDir, '37-02-PLAN.md'), '');
      writeFileSync(join(phasesDir, 'notes.md'), '');

      const result = await planningStatus(
        { project: 'delta' },
        { vaultPath: fx.vaultPath },
      );
      expect(result.current_phase?.plan_count).toBe(2);
    } finally {
      fx.cleanup();
    }
  });

  it('progress_percent matches formula', async () => {
    const result = await planningStatus(
      { project: 'alpha' },
      { vaultPath: fixture.vaultPath },
    );
    // phases: completed=1, total=3 → 33% (rounded)
    expect(result.progress_percent).toBe(33);
  });
});
