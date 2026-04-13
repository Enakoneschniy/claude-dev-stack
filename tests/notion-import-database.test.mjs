import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { importDatabase } from '../lib/notion-import.mjs';

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-notion-db-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('importDatabase', () => {
  it('returns zero counts for empty database', async (t) => {
    const { dir, cleanup } = makeTempDir();
    t.after(cleanup);
    const fetchFn = async () => ({ pages: [], has_more: false, next_cursor: null });
    const result = await importDatabase('db-id', dir, fetchFn);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 0, conflict: 0, total: 0 });
  });

  it('imports single page and returns created:1', async (t) => {
    const { dir, cleanup } = makeTempDir();
    t.after(cleanup);
    const fetchFn = async () => ({
      pages: [{ page_id: 'page-001', title: 'My Page', markdown: '# My Page\n\nContent.' }],
      has_more: false,
      next_cursor: null,
    });
    const result = await importDatabase('db-id', dir, fetchFn);
    assert.equal(result.created, 1);
    assert.equal(result.total, 1);
  });

  it('handles pagination — calls fetchFn with cursor on second call', async (t) => {
    const { dir, cleanup } = makeTempDir();
    t.after(cleanup);
    const calls = [];
    const fetchFn = async (dbId, cursor) => {
      calls.push({ dbId, cursor });
      if (cursor === null) {
        return {
          pages: [{ page_id: 'page-001', title: 'Page One', markdown: '# Page One\n\nContent.' }],
          has_more: true,
          next_cursor: 'cursor-abc',
        };
      }
      return {
        pages: [{ page_id: 'page-002', title: 'Page Two', markdown: '# Page Two\n\nContent.' }],
        has_more: false,
        next_cursor: null,
      };
    };
    const result = await importDatabase('db-id', dir, fetchFn);
    assert.equal(result.total, 2);
    assert.equal(calls[0].cursor, null);
    assert.equal(calls[1].cursor, 'cursor-abc');
  });

  it('uses page_id as filename when title is empty', async (t) => {
    const { dir, cleanup } = makeTempDir();
    t.after(cleanup);
    const fetchFn = async () => ({
      pages: [{ page_id: 'abc123def456', title: '', markdown: 'Content.' }],
      has_more: false,
      next_cursor: null,
    });
    await importDatabase('db-id', dir, fetchFn);
    const { existsSync } = await import('fs');
    assert.ok(existsSync(join(dir, 'abc123def456.md')));
  });
});
