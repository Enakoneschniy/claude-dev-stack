// packages/cds-core/src/vault/sessions.busy-timeout.test.ts
// Regression test: busy_timeout=5000 pragma persists across DB reopens.
// Source: Phase 40 Plan 04 — D-131 follow-up (originally Phase 35).
// Uses openRawDb directly since SessionsDB intentionally hides the raw handle.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRawDb } from './internal/db.js';

describe('SQLite busy_timeout pragma', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cds-busy-timeout-'));
  const dbPath = join(tempDir, 'test-sessions.db');

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('openRawDb sets busy_timeout = 5000', () => {
    const db = openRawDb(dbPath);
    const result = db.pragma('busy_timeout') as Array<{ timeout: number }>;
    expect(result[0].timeout).toBe(5000);
    db.close();
  });

  it('busy_timeout persists across DB close + reopen', () => {
    const db = openRawDb(dbPath);
    const result = db.pragma('busy_timeout') as Array<{ timeout: number }>;
    expect(result[0].timeout).toBe(5000);
    db.close();
  });

  it('WAL mode is set', () => {
    const db = openRawDb(dbPath);
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');
    db.close();
  });
});
