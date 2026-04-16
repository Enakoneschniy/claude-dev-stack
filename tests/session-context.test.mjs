import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { updateContextHistory, SESSION_HISTORY_CAP } from '../lib/session-context.mjs';

const MARKER_START = '<!-- @claude-dev-stack:session-history:start -->';
const MARKER_END   = '<!-- @claude-dev-stack:session-history:end -->';

describe('lib/session-context.mjs', () => {
  const tmpBase = join(tmpdir(), `claude-test-session-context-${process.pid}`);
  const vaultPath = join(tmpBase, 'vault');
  const projectName = 'demo-project';
  const projectDir = join(vaultPath, 'projects', projectName);
  const sessionsDir = join(projectDir, 'sessions');
  const contextPath = join(projectDir, 'context.md');

  function resetFixture() {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(sessionsDir, { recursive: true });
  }

  function writeSessionLog(filename, heading) {
    const path = join(sessionsDir, filename);
    const body = (heading ? heading + '\n\n' : '# Untitled\n\n') + '## Notes\nstuff\n';
    writeFileSync(path, body);
    return path;
  }

  beforeEach(() => {
    resetFixture();
  });

  afterAll(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('SESSION_HISTORY_CAP is 5', () => {
    assert.equal(SESSION_HISTORY_CAP, 5);
  });

  it('creates Session History section on fresh context.md (no markers, no header)', () => {
    writeFileSync(contextPath, '# Project: demo\n\n## Overview\n\nStuff.\n\n---\n*Last updated: 2026-04-10*\n');
    writeSessionLog('2026-04-10-first-session.md', '# Session: 2026-04-10 — First session');

    const result = updateContextHistory({
      vaultPath,
      projectName,
      sessionLogFilename: '2026-04-10-first-session.md',
    });

    assert.equal(result.action, 'created');
    assert.equal(result.entriesCount, 1);

    const updated = readFileSync(contextPath, 'utf8');
    assert.ok(updated.includes(MARKER_START), 'start marker must be present');
    assert.ok(updated.includes(MARKER_END), 'end marker must be present');
    assert.ok(updated.includes('- [2026-04-10 — First session](sessions/2026-04-10-first-session.md)'));
    const markerIdx = updated.indexOf(MARKER_START);
    const hrIdx = updated.indexOf('\n---\n');
    assert.ok(markerIdx < hrIdx, 'section must appear before footer ---');
  });

  it('appends to existing markers', () => {
    const initial = [
      '# Project: demo',
      '',
      '## Session History (last 5)',
      '',
      MARKER_START,
      '- [2026-04-08 — Old one](sessions/2026-04-08-old-one.md)',
      '- [2026-04-09 — Middle one](sessions/2026-04-09-middle-one.md)',
      MARKER_END,
      '',
      '---',
      '*Last updated: 2026-04-10*',
      '',
    ].join('\n');
    writeFileSync(contextPath, initial);
    writeSessionLog('2026-04-10-new-one.md', '# Session: 2026-04-10 — New one');

    const result = updateContextHistory({
      vaultPath,
      projectName,
      sessionLogFilename: '2026-04-10-new-one.md',
    });

    assert.equal(result.action, 'updated');
    assert.equal(result.entriesCount, 3);

    const updated = readFileSync(contextPath, 'utf8');
    assert.ok(updated.includes('- [2026-04-08 — Old one](sessions/2026-04-08-old-one.md)'));
    assert.ok(updated.includes('- [2026-04-09 — Middle one](sessions/2026-04-09-middle-one.md)'));
    assert.ok(updated.includes('- [2026-04-10 — New one](sessions/2026-04-10-new-one.md)'));
  });

  it('is idempotent (second call with same filename returns noop)', () => {
    writeFileSync(contextPath, '# Project: demo\n\n## Overview\n\nStuff.\n');
    writeSessionLog('2026-04-10-only.md', '# Session: 2026-04-10 — Only one');

    const first = updateContextHistory({ vaultPath, projectName, sessionLogFilename: '2026-04-10-only.md' });
    const afterFirst = readFileSync(contextPath, 'utf8');

    const second = updateContextHistory({ vaultPath, projectName, sessionLogFilename: '2026-04-10-only.md' });
    const afterSecond = readFileSync(contextPath, 'utf8');

    assert.equal(second.action, 'noop');
    assert.equal(second.entriesCount, first.entriesCount);
    assert.equal(afterFirst, afterSecond, 'file must be byte-identical on idempotent re-run');
  });

  it('migrates legacy "## Session History" header by wrapping it with markers', () => {
    const initial = [
      '# Project: demo',
      '',
      '## Session History (last 5)',
      '',
      '- [2026-04-08 — Legacy entry](sessions/2026-04-08-legacy-entry.md)',
      '',
      '---',
      '*Last updated: 2026-04-08*',
      '',
    ].join('\n');
    writeFileSync(contextPath, initial);
    writeSessionLog('2026-04-10-migrate.md', '# Session: 2026-04-10 — Migrate me');

    const result = updateContextHistory({
      vaultPath, projectName, sessionLogFilename: '2026-04-10-migrate.md',
    });

    assert.equal(result.action, 'updated');
    assert.equal(result.entriesCount, 2);

    const updated = readFileSync(contextPath, 'utf8');
    assert.ok(updated.includes(MARKER_START));
    assert.ok(updated.includes(MARKER_END));
    assert.ok(updated.includes('- [2026-04-08 — Legacy entry](sessions/2026-04-08-legacy-entry.md)'));
    assert.ok(updated.includes('- [2026-04-10 — Migrate me](sessions/2026-04-10-migrate.md)'));
  });

  it('enforces cap of 5 entries (FIFO drop oldest)', () => {
    const entries = [
      '- [2026-04-01 — E1](sessions/2026-04-01-e1.md)',
      '- [2026-04-02 — E2](sessions/2026-04-02-e2.md)',
      '- [2026-04-03 — E3](sessions/2026-04-03-e3.md)',
      '- [2026-04-04 — E4](sessions/2026-04-04-e4.md)',
      '- [2026-04-05 — E5](sessions/2026-04-05-e5.md)',
    ];
    const initial = [
      '# Project: demo',
      '',
      MARKER_START,
      ...entries,
      MARKER_END,
      '',
    ].join('\n');
    writeFileSync(contextPath, initial);
    writeSessionLog('2026-04-10-sixth.md', '# Session: 2026-04-10 — Sixth');

    const result = updateContextHistory({
      vaultPath, projectName, sessionLogFilename: '2026-04-10-sixth.md',
    });

    assert.equal(result.entriesCount, 5);

    const updated = readFileSync(contextPath, 'utf8');
    assert.ok(!updated.includes('2026-04-01-e1'), 'oldest entry must be dropped');
    assert.ok(updated.includes('2026-04-02-e2'));
    assert.ok(updated.includes('2026-04-10-sixth'));
  });

  it('preserves bytes outside the managed marker block (SKILL-02)', () => {
    const prefix = '# Project: demo\n\n## Overview\n\nImportant prose with special chars: $&*()[]{}.\n\n## Stack\n\n- Node\n- ESM\n\n';
    const history = [MARKER_START, '- [2026-04-08 — Old](sessions/2026-04-08-old.md)', MARKER_END].join('\n');
    const suffix = '\n\n## Known Issues\n\n- one\n- two\n\n---\n*Last updated: 2026-04-08*\n';
    const initial = prefix + history + suffix;
    writeFileSync(contextPath, initial);
    writeSessionLog('2026-04-10-new.md', '# Session: 2026-04-10 — New');

    updateContextHistory({ vaultPath, projectName, sessionLogFilename: '2026-04-10-new.md' });

    const updated = readFileSync(contextPath, 'utf8');
    const newStart = updated.indexOf(MARKER_START);
    const newEnd = updated.indexOf(MARKER_END) + MARKER_END.length;
    const updatedPrefix = updated.slice(0, newStart);
    const updatedSuffix = updated.slice(newEnd);

    assert.equal(updatedPrefix, prefix, 'prefix must be byte-identical');
    assert.equal(updatedSuffix, suffix, 'suffix must be byte-identical');
  });

  it('extracts title from "# Session: DATE — TITLE" heading', () => {
    writeFileSync(contextPath, '# Project: demo\n');
    writeSessionLog('2026-04-10-fix-broken-thing.md', '# Session: 2026-04-10 — Fix broken thing');

    updateContextHistory({
      vaultPath, projectName, sessionLogFilename: '2026-04-10-fix-broken-thing.md',
    });

    const updated = readFileSync(contextPath, 'utf8');
    assert.ok(updated.includes('- [2026-04-10 — Fix broken thing](sessions/2026-04-10-fix-broken-thing.md)'));
  });

  it('falls back to filename slug when heading is malformed (never throws)', () => {
    writeFileSync(contextPath, '# Project: demo\n');
    writeSessionLog('2026-04-10-weird-log.md', '# Untitled blob');

    assert.doesNotThrow(() => {
      updateContextHistory({
        vaultPath, projectName, sessionLogFilename: '2026-04-10-weird-log.md',
      });
    });

    const updated = readFileSync(contextPath, 'utf8');
    assert.match(updated, /- \[2026-04-10 — weird log\]\(sessions\/2026-04-10-weird-log\.md\)/);
  });

  it('returns skipped when vault directory does not exist (D-14)', () => {
    const result = updateContextHistory({
      vaultPath: '/nonexistent/vault/path',
      projectName: 'ghost',
      sessionLogFilename: '2026-04-10-ghost.md',
    });
    assert.equal(result.action, 'skipped');
    assert.equal(result.entriesCount, 0);
  });

  it('throws on missing required args (programmer error)', () => {
    assert.throws(() => {
      updateContextHistory({ projectName: 'x', sessionLogFilename: 'y.md' });
    }, /vaultPath/);
  });

  it('throws on projectName with path traversal (T-01-03 guard)', () => {
    writeFileSync(contextPath, '# Project: demo\n');
    assert.throws(() => updateContextHistory({
      vaultPath, projectName: '../escape', sessionLogFilename: '2026-04-10-x.md',
    }), /projectName/);
    assert.throws(() => updateContextHistory({
      vaultPath, projectName: 'ok/sub', sessionLogFilename: '2026-04-10-x.md',
    }), /projectName/);
  });
});
