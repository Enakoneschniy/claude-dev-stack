// Phase 37 Plan 03 Task 37-03-05 — tests for planning-parsers.

import { describe, expect, it } from 'vitest';

import {
  parseCriticalRisks,
  parseRoadmapMilestone,
  parseRoadmapPhases,
  parseStateCurrentPhase,
  parseStateFrontmatter,
} from './planning-parsers.js';

const FIXTURE_STATE_FULL = `---
milestone: v1.0
milestone_name: CDS-Core Independence
status: in-progress
progress:
  total_phases: 7
  completed_phases: 4
  percent: 57
last_activity: "2026-04-16"
---

# Project state

## Current Position

Phase: **37 - MCP Adapter** (In progress)

## Critical Risks

- MCP SDK lock-in
- Ripgrep may be missing on PATH

## Other notes

Something.
`;

const FIXTURE_STATE_MINIMAL = `---
milestone: v0.5
---

# Just frontmatter
`;

const FIXTURE_STATE_EMPTY = '';

// Deliberately broken YAML (unclosed quote)
const FIXTURE_STATE_MALFORMED = `---
milestone: "v1.0
milestone_name: bogus
---

nothing else
`;

const FIXTURE_ROADMAP_TABLE = `# Milestone v1.0 — CDS Alpha

## Active Milestone Phases

| # | Phase | Reqs | Status |
|---|-------|------|--------|
| 33 | Monorepo | MONO | Complete |
| 34 | SDK core | SDK | Complete |
| 37 | MCP | MCP | In progress |
| 38 | Backfill | BACK | Not started |
| 39 | Alpha | REL | Not started |
`;

const FIXTURE_ROADMAP_BULLETS = `# Milestone v1.0

## Phases

- [x] Phase 33: Monorepo
- [x] Phase 34: SDK
- ◆ Phase 37: MCP adapter
- [ ] Phase 38: Backfill
- [ ] Phase 39: Alpha release
`;

const FIXTURE_ROADMAP_MINIMAL = `# Milestone v1.0

Placeholder — no phase section.
`;

describe('parseStateFrontmatter', () => {
  it('returns milestone, progress, last_activity on full state', () => {
    const out = parseStateFrontmatter(FIXTURE_STATE_FULL);
    expect(out).toBeDefined();
    expect(out?.milestone).toBe('v1.0');
    expect(out?.milestone_name).toBe('CDS-Core Independence');
    expect(out?.status).toBe('in-progress');
    expect(out?.progress?.total_phases).toBe(7);
    expect(out?.progress?.completed_phases).toBe(4);
    expect(out?.progress?.percent).toBe(57);
    expect(out?.last_activity).toBe('2026-04-16');
  });

  it('returns undefined on empty input', () => {
    expect(parseStateFrontmatter(FIXTURE_STATE_EMPTY)).toBeUndefined();
  });

  it('tolerates malformed yaml (never throws)', () => {
    // Broken YAML with unclosed quotes — parser degrades gracefully rather
    // than throwing. Exact output is a best-effort partial object.
    const out = parseStateFrontmatter(FIXTURE_STATE_MALFORMED);
    // Contract: either undefined OR a partial object — but no throw.
    expect(() => parseStateFrontmatter(FIXTURE_STATE_MALFORMED)).not.toThrow();
    if (out) {
      expect(typeof out).toBe('object');
    }
  });

  it('returns partial on minimal state', () => {
    const out = parseStateFrontmatter(FIXTURE_STATE_MINIMAL);
    expect(out?.milestone).toBe('v0.5');
    expect(out?.progress).toBeUndefined();
  });
});

describe('parseRoadmapPhases', () => {
  it('counts from table style', () => {
    const out = parseRoadmapPhases(FIXTURE_ROADMAP_TABLE);
    expect(out).toBeDefined();
    expect(out?.total).toBe(5);
    expect(out?.completed).toBe(2);
    expect(out?.in_progress).toBe(1);
    expect(out?.pending).toBe(2);
  });

  it('counts from bullet style', () => {
    const out = parseRoadmapPhases(FIXTURE_ROADMAP_BULLETS);
    expect(out).toBeDefined();
    expect(out?.total).toBe(5);
    expect(out?.completed).toBe(2);
    expect(out?.in_progress).toBe(1);
    expect(out?.pending).toBe(2);
  });

  it('returns undefined on missing phase section', () => {
    expect(parseRoadmapPhases(FIXTURE_ROADMAP_MINIMAL)).toBeUndefined();
  });
});

describe('parseRoadmapMilestone', () => {
  it('extracts version and name from heading', () => {
    const out = parseRoadmapMilestone(FIXTURE_ROADMAP_TABLE);
    expect(out?.version).toBe('v1.0');
    expect(out?.name).toBe('CDS Alpha');
  });
});

describe('parseStateCurrentPhase', () => {
  it('extracts number and name from Current Position', () => {
    const out = parseStateCurrentPhase(FIXTURE_STATE_FULL);
    expect(out?.number).toBe('37');
    expect(out?.name).toMatch(/MCP Adapter/i);
    expect(out?.disk_status).toBe('In progress');
  });

  it('returns undefined when Current Position missing', () => {
    expect(parseStateCurrentPhase(FIXTURE_STATE_MINIMAL)).toBeUndefined();
  });
});

describe('parseCriticalRisks', () => {
  it('returns bullet list', () => {
    const out = parseCriticalRisks(FIXTURE_STATE_FULL);
    expect(out).toEqual(['MCP SDK lock-in', 'Ripgrep may be missing on PATH']);
  });

  it('returns undefined when section missing', () => {
    expect(parseCriticalRisks(FIXTURE_STATE_MINIMAL)).toBeUndefined();
  });
});

describe('parsers fuzz — no throws on arbitrary strings', () => {
  const RANDOM_STRINGS = [
    '',
    '---',
    '---\nunclosed',
    '\x00\x01\x02',
    'not yaml at all',
    '###',
    '---\n---',
    '# heading\n- item\n- [x] done',
    '---\nkey: "value\n---\n',
    'Phase:',
    '# Milestone vXYZ',
    '| | | |',
    '| Status |\n|---|\n| Complete |',
    '🚧\n✅\n◆',
    '---\nprogress:\n  total_phases: not-a-number\n---',
    '---\nprogress:\n  total_phases: 5\n  completed_phases: 2\n  percent: 40\n---',
    '## Phases\n\n- junk bullet without status\n',
    'Random\nLines\nof\nText\n\n## Phases\n\n- [x] one\n- [ ] two',
    '## Current Position\nPhase: 99\nNo name section',
    '## Critical Risks\n- One\n- Two\n',
  ];

  it('fuzz test: no parser throws on any random input', () => {
    for (const s of RANDOM_STRINGS) {
      expect(() => parseStateFrontmatter(s)).not.toThrow();
      expect(() => parseRoadmapMilestone(s)).not.toThrow();
      expect(() => parseRoadmapPhases(s)).not.toThrow();
      expect(() => parseStateCurrentPhase(s)).not.toThrow();
      expect(() => parseCriticalRisks(s)).not.toThrow();
    }
  });
});
