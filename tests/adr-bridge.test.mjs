import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { bridgeDecisions, extractDecisions } from '../lib/adr-bridge.mjs';

// ── Fixtures ─────────────────────────────────────────────────────

const CONTEXT_WITH_DECISIONS = `# Phase 13: GSD Infrastructure - Context

**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers ADR bridge and parallel execution.

</domain>

<decisions>
## Implementation Decisions

### ADR Bridge (INFRA-03)

- **D-01:** Bridge fires during phase transition — after verification passes.
- **D-02:** ADR format matches existing vault convention — NNNN-slug.md with YAML frontmatter.
- **D-03:** ADR numbering auto-increments from highest existing NNNN.

### Parallel Execution (INFRA-04)

- **D-04:** Detection parses ROADMAP.md depends_on fields.

</decisions>

<code_context>
## Existing Code Insights

Not a D-05 decision — this is just body text containing D-05 pattern outside tag.

</code_context>
`;

const CONTEXT_WITHOUT_DECISIONS = `# Phase 99: No Decisions

<domain>Some domain content</domain>

<decisions>
## Implementation Decisions

No locked decisions yet.

</decisions>
`;

const CONTEXT_NO_DECISIONS_TAG = `# Phase 99: No Tag

Some content without decisions block.
`;

// ── describe: extractDecisions() ─────────────────────────────────

describe('extractDecisions()', () => {
  it('extracts D-XX entries from decisions block only', () => {
    const result = extractDecisions(CONTEXT_WITH_DECISIONS);
    assert.ok(Array.isArray(result), 'should return array');
    assert.equal(result.length, 4, 'should find exactly 4 decisions');
    assert.equal(result[0].id, 'D-01');
    assert.ok(result[0].text.includes('Bridge fires during phase transition'));
    assert.equal(result[1].id, 'D-02');
    assert.equal(result[2].id, 'D-03');
    assert.equal(result[3].id, 'D-04');
  });

  it('returns empty array when no decisions block tag exists', () => {
    const result = extractDecisions(CONTEXT_NO_DECISIONS_TAG);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('returns empty array when decisions block has no D-XX entries', () => {
    const result = extractDecisions(CONTEXT_WITHOUT_DECISIONS);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('ignores D-XX patterns outside decisions tags', () => {
    // The CONTEXT_WITH_DECISIONS has "D-05" pattern outside decisions tag
    const result = extractDecisions(CONTEXT_WITH_DECISIONS);
    const ids = result.map((d) => d.id);
    assert.ok(!ids.includes('D-05'), 'D-05 outside decisions block must be ignored');
  });
});

// ── describe: bridgeDecisions() ──────────────────────────────────

describe('bridgeDecisions()', () => {
  const tmpBase = join(tmpdir(), `claude-test-adr-bridge-${process.pid}`);
  const vaultPath = join(tmpBase, 'vault');
  const projectName = 'test-project';
  const decisionsDir = join(vaultPath, 'projects', projectName, 'decisions');
  const contextPath = join(tmpBase, '13-CONTEXT.md');

  function resetFixture() {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(decisionsDir, { recursive: true });
    mkdirSync(join(vaultPath, 'meta'), { recursive: true });
    mkdirSync(join(vaultPath, 'projects'), { recursive: true });
    writeFileSync(contextPath, CONTEXT_WITH_DECISIONS);
  }

  beforeEach(() => {
    resetFixture();
  });

  afterAll(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('creates ADR file with correct format and provenance', () => {
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'created');
    assert.ok(result.adrPath, 'must return adrPath');
    assert.equal(result.decisionCount, 4);

    const content = readFileSync(result.adrPath, 'utf8');
    // Provenance frontmatter
    assert.ok(content.includes('source: gsd-bridge'), 'must include source provenance');
    assert.ok(content.includes('phase: 13'), 'must include phase number');
    assert.ok(content.includes('decision_ids:'), 'must include decision_ids');
    assert.ok(content.includes('D-01'), 'must list D-01 in provenance');
    assert.ok(content.includes('D-04'), 'must list D-04 in provenance');
    // Status
    assert.ok(content.includes('Status: accepted') || content.includes('**Status**: accepted'));
    // Decisions section
    assert.ok(content.includes('## Decisions') || content.includes('# '), 'must have content');
    assert.ok(content.includes('D-01'), 'must include D-01 decision text');
    assert.ok(content.includes('Bridge fires during phase transition'));
  });

  it('uses NNNN-slug.md naming starting at 0001 when directory is empty', () => {
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'created');
    const filename = result.adrPath.split('/').pop();
    assert.ok(filename.startsWith('0001-'), `Expected 0001- prefix, got: ${filename}`);
    assert.ok(filename.endsWith('.md'));
  });

  it('increments from highest existing ADR number', () => {
    // Pre-create ADRs 0001 through 0005
    writeFileSync(join(decisionsDir, '0001-first.md'), '# first');
    writeFileSync(join(decisionsDir, '0003-third.md'), '# third');
    writeFileSync(join(decisionsDir, '0005-fifth.md'), '# fifth');

    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'created');
    const filename = result.adrPath.split('/').pop();
    assert.ok(filename.startsWith('0006-'), `Expected 0006- prefix, got: ${filename}`);
  });

  it('is idempotent - returns noop on second call', () => {
    const opts = {
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    };

    const first = bridgeDecisions(opts);
    assert.equal(first.action, 'created');

    const second = bridgeDecisions(opts);
    assert.equal(second.action, 'noop', 'second call must return noop');

    // Verify no duplicate file was written
    const files = readdirSync(decisionsDir).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, 1, 'must have exactly 1 ADR file');
  });

  it('skips when vault path is null', () => {
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath: null,
      projectName,
    });

    assert.equal(result.action, 'skipped');
    assert.ok(result.reason.includes('vault'));
  });

  it('skips when vault path does not exist', () => {
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath: join(tmpBase, 'nonexistent-vault'),
      projectName,
    });

    assert.equal(result.action, 'skipped');
    assert.ok(result.reason.includes('vault'));
  });

  it('skips when no D-XX decisions found in CONTEXT.md', () => {
    writeFileSync(contextPath, CONTEXT_WITHOUT_DECISIONS);

    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'skipped');
    assert.ok(result.reason.includes('decision'));
  });

  it('rejects projectName with path traversal chars /', () => {
    assert.throws(
      () => bridgeDecisions({
        phaseNumber: 13,
        phaseName: 'GSD Infrastructure',
        phaseSlug: 'gsd-infrastructure',
        contextPath,
        vaultPath,
        projectName: 'evil/hack',
      }),
      /path separator/i,
    );
  });

  it('rejects projectName with path traversal chars ..', () => {
    assert.throws(
      () => bridgeDecisions({
        phaseNumber: 13,
        phaseName: 'GSD Infrastructure',
        phaseSlug: 'gsd-infrastructure',
        contextPath,
        vaultPath,
        projectName: '../etc',
      }),
      /path separator/i,
    );
  });

  it('ADR file is written atomically (tmp + rename)', () => {
    // We verify no .tmp file remains after successful write
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'created');
    // No .tmp file should remain
    const files = readdirSync(decisionsDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'no .tmp files should remain after write');
  });

  it('ADR file contains all D-XX decision texts', () => {
    const result = bridgeDecisions({
      phaseNumber: 13,
      phaseName: 'GSD Infrastructure',
      phaseSlug: 'gsd-infrastructure',
      contextPath,
      vaultPath,
      projectName,
    });

    assert.equal(result.action, 'created');
    const content = readFileSync(result.adrPath, 'utf8');
    assert.ok(content.includes('Bridge fires during phase transition'));
    assert.ok(content.includes('ADR format matches existing vault convention'));
    assert.ok(content.includes('ADR numbering auto-increments'));
    assert.ok(content.includes('Detection parses ROADMAP.md'));
  });
});
