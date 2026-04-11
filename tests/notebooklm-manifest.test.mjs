import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  MANIFEST_VERSION,
  hashFile,
} from '../lib/notebooklm-manifest.mjs';

const EMPTY_FILE_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('lib/notebooklm-manifest.mjs', () => {
  const tmpBase = join(tmpdir(), `claude-test-notebooklm-manifest-${process.pid}`);
  const vaultRoot = join(tmpBase, 'vault');

  function resetFixture() {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(vaultRoot, { recursive: true });
  }

  function writeFixture(relativePath, content) {
    const abs = join(vaultRoot, relativePath);
    const dir = abs.replace(/\/[^/]+$/, '');
    mkdirSync(dir, { recursive: true });
    writeFileSync(abs, content);
    return abs;
  }

  beforeEach(() => {
    resetFixture();
  });

  after(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  // ── Task 1: MANIFEST_VERSION + hashFile ──────────────────────────────────────

  describe('MANIFEST_VERSION constant', () => {
    it('is the integer 1', () => {
      assert.equal(MANIFEST_VERSION, 1);
      assert.equal(typeof MANIFEST_VERSION, 'number');
    });
  });

  describe('hashFile', () => {
    it('returns a 64-char lowercase hex string', () => {
      const abs = writeFixture('hello.md', 'hello world\n');
      const digest = hashFile(abs);
      assert.equal(digest.length, 64);
      assert.match(digest, /^[0-9a-f]{64}$/);
    });

    it('is deterministic — same bytes produce the same hash across calls', () => {
      const abs = writeFixture('determ.md', 'some content\n');
      const a = hashFile(abs);
      const b = hashFile(abs);
      assert.equal(a, b);
    });

    it('returns the well-known SHA-256 constant for an empty file', () => {
      const abs = writeFixture('empty.md', '');
      assert.equal(hashFile(abs), EMPTY_FILE_SHA256);
    });

    it('returns a different hash when file bytes change (change detection)', () => {
      const abs = writeFixture('mutable.md', 'before\n');
      const before = hashFile(abs);
      writeFileSync(abs, 'after\n');
      const after = hashFile(abs);
      assert.notEqual(before, after);
    });

    it('does NOT normalize line endings (D-08 raw-bytes policy)', () => {
      const lf = writeFixture('lf.md', 'line1\nline2\n');
      const crlf = writeFixture('crlf.md', 'line1\r\nline2\r\n');
      assert.notEqual(hashFile(lf), hashFile(crlf));
    });
  });

  // ── readManifest / writeManifest suites added in Task 2 ──
  // ── ensureManifestGitignored suite added in Task 3 ──
});
