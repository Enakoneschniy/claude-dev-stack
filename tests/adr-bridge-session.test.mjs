import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  bridgeSession,
  extractTranscriptText,
  parseHaikuResponse,
  topicMatchesExistingAdr,
} from '../lib/adr-bridge-session.mjs';

const FIXTURE_JSONL = new URL('./fixtures/session-transcript-sample.jsonl', import.meta.url)
  .pathname;

function makeTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'adr-bridge-session-'));
  const vault = join(dir, 'vault');
  const decisionsDir = join(vault, 'projects', 'test-proj', 'decisions');
  mkdirSync(decisionsDir, { recursive: true });
  const sessionLogPath = join(vault, 'projects', 'test-proj', 'sessions', '2026-04-15-test.md');
  mkdirSync(join(vault, 'projects', 'test-proj', 'sessions'), { recursive: true });
  writeFileSync(sessionLogPath, '# Session\n');
  return { dir, vault, decisionsDir, sessionLogPath };
}

function haiku(payload) {
  return async () => `<decisions>${JSON.stringify(payload)}</decisions>`;
}

// ─── Test 1: happy path new ADR ─────────────────────────────────────
describe('bridgeSession() — happy path (SC#1 + SC#4)', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('creates ADR with YAML frontmatter and Context/Decision/Consequences sections', async () => {
    const callHaiku = haiku({
      decisions: [
        { topic: 'logging-strategy', title: 'Use pino for structured logging',
          context: 'We need structured JSON logs', decision: 'Pick pino over winston',
          consequences: 'Faster, better TS types', confidence: 'high' },
      ],
    });
    const result = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.equal(result.error, null, `error: ${result.error}`);
    assert.equal(result.superseded.length, 0);
    assert.equal(result.newAdrs.length, 1);
    const created = result.newAdrs[0];
    assert.equal(created.topic, 'logging-strategy');
    assert.equal(created.number, 1);
    assert.ok(existsSync(created.path));
    const content = readFileSync(created.path, 'utf8');
    assert.ok(content.startsWith('---\n'), 'must start with YAML frontmatter');
    assert.match(content, /\nid: 0001\n/);
    assert.match(content, /\ntopic: logging-strategy\n/);
    assert.match(content, /\nstatus: accepted\n/);
    assert.match(content, /\ndate: 2026-04-15\n/);
    assert.match(content, /\nsource:\n/);
    assert.match(content, /session_log:/);
    assert.match(content, /## Context\n/);
    assert.match(content, /## Decision\n/);
    assert.match(content, /## Consequences\n/);
    assert.ok(content.includes('We need structured JSON logs'));
    assert.ok(content.includes('Pick pino over winston'));
    assert.ok(content.includes('Faster, better TS types'));
  });
});

// ─── Test 3: medium confidence => proposed; low => discarded ────────
describe('bridgeSession() — confidence gating (D-03)', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('writes status: proposed for confidence=medium; discards confidence=low', async () => {
    const callHaiku = haiku({
      decisions: [
        { topic: 'caching', title: 'Maybe use redis', context: 'c', decision: 'd',
          consequences: 'cons', confidence: 'medium' },
        { topic: 'throwaway', title: 'idk', context: 'c', decision: 'd',
          consequences: 'cons', confidence: 'low' },
      ],
    });
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.equal(res.error, null);
    assert.equal(res.newAdrs.length, 1, 'only medium kept; low discarded');
    assert.equal(res.newAdrs[0].topic, 'caching');
    const content = readFileSync(res.newAdrs[0].path, 'utf8');
    assert.match(content, /\nstatus: proposed\n/);
  });
});

// ─── Test 4: duplicate via new-format frontmatter (D-08) ───────────
describe('bridgeSession() — duplicate via frontmatter', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('updates the existing ADR and appends Superseded note', async () => {
    const existingPath = join(t.decisionsDir, '0013-logging-strategy.md');
    writeFileSync(existingPath, `---
id: 0013
topic: logging-strategy
status: accepted
date: 2026-04-01
source:
  session_log: old.md
---

# ADR 0013: Use winston

## Context
old context

## Decision
old decision

## Consequences
old consequences
`);
    const callHaiku = haiku({
      decisions: [
        { topic: 'logging-strategy', title: 'Switch to pino',
          context: 'winston is slow', decision: 'use pino',
          consequences: 'json logs everywhere', confidence: 'high' },
      ],
    });
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.equal(res.error, null);
    assert.equal(res.newAdrs.length, 0);
    assert.equal(res.superseded.length, 1);
    assert.equal(res.superseded[0].number, 13);
    assert.equal(res.superseded[0].topic, 'logging-strategy');
    const content = readFileSync(existingPath, 'utf8');
    assert.match(content, /Superseded by revision on 2026-04-15/);
    assert.ok(content.includes('json logs everywhere'));
  });
});

// ─── Test 5: duplicate via filename for old-format ADR ──────────────
describe('bridgeSession() — old-format filename match (D-07)', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('matches by filename and promotes old format to new format', async () => {
    const existingPath = join(t.decisionsDir, '0005-logging-strategy.md');
    writeFileSync(existingPath, `# ADR-0005: Use winston

**Дата**: 2026-03-01
**Статус**: accepted

## Контекст
old
`);
    const callHaiku = haiku({
      decisions: [
        { topic: 'logging-strategy', title: 'Switch to pino',
          context: 'winston is slow', decision: 'use pino',
          consequences: 'json logs', confidence: 'high' },
      ],
    });
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.equal(res.error, null);
    assert.equal(res.newAdrs.length, 0);
    assert.equal(res.superseded.length, 1);
    assert.equal(res.superseded[0].number, 5);
    const content = readFileSync(existingPath, 'utf8');
    assert.ok(content.startsWith('---\n'), 'old format promoted to new (frontmatter)');
    assert.match(content, /\nid: 0005\n/);
    assert.match(content, /\ntopic: logging-strategy\n/);
    assert.match(content, /Superseded by revision on 2026-04-15/);
  });
});

// ─── Test 6: numbering (D-09) ───────────────────────────────────────
describe('bridgeSession() — numbering', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('new unrelated ADR gets max+1 (zero-padded)', async () => {
    writeFileSync(join(t.decisionsDir, '0001-a.md'), '# x');
    writeFileSync(join(t.decisionsDir, '0005-b.md'), '# x');
    writeFileSync(join(t.decisionsDir, '0012-c.md'), '# x');
    const callHaiku = haiku({
      decisions: [
        { topic: 'new-topic', title: 'T', context: 'c', decision: 'd',
          consequences: 'cons', confidence: 'high' },
      ],
    });
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.equal(res.error, null);
    assert.equal(res.newAdrs[0].number, 13);
    assert.ok(res.newAdrs[0].path.endsWith('0013-new-topic.md'));
  });
});

// ─── Test 7: Haiku throws (D-06 fail-open) ──────────────────────────
describe('bridgeSession() — Haiku error fail-open (D-06)', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('returns error string and writes no files', async () => {
    const before = readdirSync(t.decisionsDir);
    const callHaiku = async () => { throw new Error('boom'); };
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.ok(res.error, 'error must be set');
    assert.match(res.error, /boom/);
    assert.deepEqual(res.newAdrs, []);
    assert.deepEqual(res.superseded, []);
    const after = readdirSync(t.decisionsDir);
    assert.deepEqual(before, after);
  });
});

// ─── Test 8: malformed Haiku JSON (D-06) ────────────────────────────
describe('bridgeSession() — malformed Haiku response', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('returns error and writes no files when response has no <decisions> block', async () => {
    const callHaiku = async () => 'sorry I cannot help with that';
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.ok(res.error, 'error must be set for malformed output');
    assert.deepEqual(res.newAdrs, []);
    assert.deepEqual(res.superseded, []);
    assert.equal(readdirSync(t.decisionsDir).length, 0);
  });
});

// ─── Test 9: extractTranscriptText ──────────────────────────────────
describe('extractTranscriptText()', () => {
  it('includes user+assistant text, filters isSidechain, truncates to tail', () => {
    const text = extractTranscriptText(FIXTURE_JSONL);
    assert.ok(text.includes('pino for structured logging'), 'user line included');
    assert.ok(text.includes('remove winston'), 'assistant array text included');
    assert.ok(!text.includes('sidechain subagent'), 'isSidechain filtered');
    assert.ok(!text.includes('system message that must be skipped'), 'system type skipped');
    // truncation tail: request tiny maxChars, expect tail content retained
    const small = extractTranscriptText(FIXTURE_JSONL, 50);
    assert.ok(small.length <= 50);
  });
});

// ─── Test 10: topic slug sanitization (T-26-03) ─────────────────────
describe('bridgeSession() — topic path traversal', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('sanitizes topic; no file outside decisionsDir', async () => {
    const callHaiku = haiku({
      decisions: [
        { topic: '../../../etc/passwd', title: 'evil', context: 'c', decision: 'd',
          consequences: 'cons', confidence: 'high' },
      ],
    });
    const res = await bridgeSession({
      transcriptPath: FIXTURE_JSONL,
      cwd: process.cwd(),
      vaultPath: t.vault,
      projectName: 'test-proj',
      sessionLogPath: t.sessionLogPath,
      callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    // Either sanitized to non-empty (then written in decisionsDir) or discarded
    for (const adr of res.newAdrs) {
      assert.ok(adr.path.startsWith(t.decisionsDir), `ADR escaped decisionsDir: ${adr.path}`);
      assert.doesNotMatch(adr.topic, /[^a-z0-9-]/);
    }
    // No file written outside decisionsDir or the session log's directory.
    // Walk t.dir recursively — every file found must live under one of
    // the two legitimate locations. This catches any traversal escape
    // without depending on absolute system paths.
    const allowedPrefixes = [t.decisionsDir, dirname(t.sessionLogPath)];
    const entries = readdirSync(t.dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath ?? entry.path, entry.name);
      const ok = allowedPrefixes.some((p) => full === p || full.startsWith(p + '/'));
      assert.ok(ok, `file written outside allowed dirs: ${full}`);
    }
  });
});

// ─── Test 11: projectName traversal guard ───────────────────────────
describe('bridgeSession() — projectName traversal guard', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('returns error for projectName with slash or dot-dot', async () => {
    const callHaiku = haiku({ decisions: [] });
    const r1 = await bridgeSession({
      transcriptPath: FIXTURE_JSONL, cwd: process.cwd(), vaultPath: t.vault,
      projectName: 'foo/bar', sessionLogPath: t.sessionLogPath, callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.ok(r1.error, 'foo/bar must error');
    const r2 = await bridgeSession({
      transcriptPath: FIXTURE_JSONL, cwd: process.cwd(), vaultPath: t.vault,
      projectName: 'foo..bar', sessionLogPath: t.sessionLogPath, callHaiku,
      now: new Date('2026-04-15T00:00:00Z'),
    });
    assert.ok(r2.error, 'foo..bar must error');
  });
});

// ─── Test 12: source.commit fallback ────────────────────────────────
describe('bridgeSession() — source.commit fallback', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('omits commit when git rev-parse fails; still writes file', async () => {
    // use tmp dir that's not a git repo as cwd → git rev-parse fails
    const notAGitRepo = mkdtempSync(join(tmpdir(), 'not-a-git-'));
    try {
      const callHaiku = haiku({
        decisions: [
          { topic: 'topic-x', title: 'T', context: 'c', decision: 'd',
            consequences: 'cons', confidence: 'high' },
        ],
      });
      const res = await bridgeSession({
        transcriptPath: FIXTURE_JSONL,
        cwd: notAGitRepo,
        vaultPath: t.vault,
        projectName: 'test-proj',
        sessionLogPath: t.sessionLogPath,
        callHaiku,
        now: new Date('2026-04-15T00:00:00Z'),
      });
      assert.equal(res.error, null);
      assert.equal(res.newAdrs.length, 1);
      const content = readFileSync(res.newAdrs[0].path, 'utf8');
      assert.doesNotMatch(content, /\n\s*commit: (undefined|null)/);
    } finally {
      rmSync(notAGitRepo, { recursive: true, force: true });
    }
  });
});

// ─── parseHaikuResponse unit ───────────────────────────────────────
describe('parseHaikuResponse()', () => {
  it('returns {decisions:[]} on malformed input', () => {
    assert.deepEqual(parseHaikuResponse('not tagged'), { decisions: [] });
    assert.deepEqual(parseHaikuResponse('<decisions>not json</decisions>'), { decisions: [] });
  });
  it('parses well-formed tagged JSON', () => {
    const parsed = parseHaikuResponse('<decisions>{"decisions":[{"topic":"a","title":"b","context":"c","decision":"d","consequences":"e","confidence":"high"}]}</decisions>');
    assert.equal(parsed.decisions.length, 1);
    assert.equal(parsed.decisions[0].topic, 'a');
  });
});

// ─── topicMatchesExistingAdr unit ──────────────────────────────────
describe('topicMatchesExistingAdr()', () => {
  let t;
  beforeEach(() => { t = makeTmp(); });
  afterAll(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('matches new-format by frontmatter topic:', () => {
    const file = join(t.decisionsDir, '0013-logging-strategy.md');
    writeFileSync(file, '---\nid: 0013\ntopic: logging-strategy\nstatus: accepted\ndate: 2026-04-01\n---\n\n# body');
    const m = topicMatchesExistingAdr('logging-strategy', t.decisionsDir);
    assert.equal(m.matched, true);
    assert.equal(m.filePath, file);
  });
  it('matches old-format by filename', () => {
    const file = join(t.decisionsDir, '0005-logging-strategy.md');
    writeFileSync(file, '# ADR-0005: Use winston');
    const m = topicMatchesExistingAdr('logging-strategy', t.decisionsDir);
    assert.equal(m.matched, true);
    assert.equal(m.filePath, file);
    assert.equal(m.isOldFormat, true);
  });
  it('no match returns matched:false', () => {
    const m = topicMatchesExistingAdr('absent-topic', t.decisionsDir);
    assert.equal(m.matched, false);
  });
});
