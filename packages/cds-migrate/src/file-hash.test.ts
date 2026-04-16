import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashFile, hashString } from './file-hash.js';

describe('file-hash', () => {
  it('hashFile returns 64-char lowercase hex for a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-test-'));
    try {
      const file = join(dir, 'sample.txt');
      writeFileSync(file, 'hello world');
      const hex = hashFile(file);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashFile is deterministic — same file → same hex across calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-test-'));
    try {
      const file = join(dir, 'sample.txt');
      writeFileSync(file, 'hello world');
      expect(hashFile(file)).toBe(hashFile(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashFile differs on a 1-byte change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-test-'));
    try {
      const file = join(dir, 'sample.txt');
      writeFileSync(file, 'hello world');
      const a = hashFile(file);
      writeFileSync(file, 'hello worlD');
      const b = hashFile(file);
      expect(a).not.toBe(b);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashFile throws on missing file', () => {
    expect(() => hashFile('/tmp/definitely-does-not-exist-38-02')).toThrow();
  });

  it('hashFile of empty file equals sha256 of empty input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-test-'));
    try {
      const file = join(dir, 'empty.txt');
      writeFileSync(file, '');
      // Known sha256 hex of empty string:
      expect(hashFile(file)).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashString returns identical hex to hashFile for same content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hash-test-'));
    try {
      const file = join(dir, 'sample.txt');
      const content = 'hello world';
      writeFileSync(file, content);
      expect(hashFile(file)).toBe(hashString(content));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
