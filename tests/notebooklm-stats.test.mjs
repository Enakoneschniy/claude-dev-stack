/**
 * Tests for lib/notebooklm-stats.mjs — query usage counter read/write.
 */
import { describe, it, beforeEach, onTestFinished } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { readQueryStats, incrementQueryStats } from '../lib/notebooklm-stats.mjs';

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-nblm-stats-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const STATS_FILE = '.notebooklm-stats.json';

describe('readQueryStats', () => {
  it('returns defaults when file absent', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    const stats = readQueryStats(dir);
    assert.deepEqual(stats, {
      version: 1,
      questions_asked: 0,
      artifacts_generated: 0,
      last_query_at: null,
    });
  });

  it('returns defaults for corrupt JSON', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    writeFileSync(join(dir, STATS_FILE), 'not-json', 'utf8');
    const stats = readQueryStats(dir);
    assert.equal(stats.questions_asked, 0);
  });

  it('returns stored values when file exists', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    writeFileSync(join(dir, STATS_FILE), JSON.stringify({
      version: 1, questions_asked: 5, artifacts_generated: 2, last_query_at: '2026-04-10T10:00:00.000Z'
    }), 'utf8');
    const stats = readQueryStats(dir);
    assert.equal(stats.questions_asked, 5);
    assert.equal(stats.artifacts_generated, 2);
  });
});

describe('incrementQueryStats', () => {
  it('creates file when absent and increments question', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    incrementQueryStats(dir, 'question');
    const stats = readQueryStats(dir);
    assert.equal(stats.questions_asked, 1);
    assert.equal(stats.artifacts_generated, 0);
    assert.ok(stats.last_query_at !== null);
  });

  it('increments artifact without touching question count', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    incrementQueryStats(dir, 'artifact');
    const stats = readQueryStats(dir);
    assert.equal(stats.artifacts_generated, 1);
    assert.equal(stats.questions_asked, 0);
  });

  it('increments existing counts', (t) => {
    const { dir, cleanup } = makeTempDir();
    onTestFinished(cleanup);
    incrementQueryStats(dir, 'question');
    incrementQueryStats(dir, 'question');
    const stats = readQueryStats(dir);
    assert.equal(stats.questions_asked, 2);
  });
});
