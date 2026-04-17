// Unit tests for VaultBackend interface, ConflictStrategy enum, and FsBackend class.

import { test, expect } from 'vitest';
import { FsBackend, ConflictStrategy } from './backend.js';
import type { VaultBackend } from './backend.js';

test('ConflictStrategy.MergeByUuid equals "merge-by-uuid"', () => {
  expect(ConflictStrategy.MergeByUuid).toBe('merge-by-uuid');
});

test('ConflictStrategy.LastWriteWins equals "last-write-wins"', () => {
  expect(ConflictStrategy.LastWriteWins).toBe('last-write-wins');
});

test('FsBackend.pull resolves immediately without error', async () => {
  const backend = new FsBackend();
  await expect(backend.pull('/any/path')).resolves.toBeUndefined();
});

test('FsBackend.push resolves immediately without error', async () => {
  const backend = new FsBackend();
  await expect(backend.push('/any/path')).resolves.toBeUndefined();
});

test('FsBackend.conflictStrategy is MergeByUuid', () => {
  const backend = new FsBackend();
  expect(backend.conflictStrategy).toBe(ConflictStrategy.MergeByUuid);
});

test('VaultBackend can be structurally implemented by an external class', async () => {
  class TestBackend implements VaultBackend {
    readonly conflictStrategy = ConflictStrategy.LastWriteWins;
    async pull(_p: string): Promise<void> {
      /* test */
    }
    async push(_p: string): Promise<void> {
      /* test */
    }
  }
  const b: VaultBackend = new TestBackend();
  expect(b.conflictStrategy).toBe(ConflictStrategy.LastWriteWins);
  await expect(b.pull('/test')).resolves.toBeUndefined();
  await expect(b.push('/test')).resolves.toBeUndefined();
});
