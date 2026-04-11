import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  MANIFEST_VERSION,
  hashFile,
  readManifest,
  writeManifest,
  ensureManifestGitignored,
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

  // ── Task 2: writeManifest + readManifest ────────────────────────────────────

  describe('writeManifest', () => {
    it('writes .notebooklm-sync.json to vaultRoot with version, generated_at, files (T2-01)', () => {
      writeManifest(vaultRoot, { files: {} });
      const manifestFile = join(vaultRoot, '.notebooklm-sync.json');
      assert.ok(existsSync(manifestFile));
      const parsed = JSON.parse(readFileSync(manifestFile, 'utf8'));
      assert.equal(parsed.version, 1);
      assert.ok(typeof parsed.generated_at === 'string' && parsed.generated_at.length > 0);
      assert.deepEqual(parsed.files, {});
    });

    it('leaves no .tmp sibling after success (T2-02 — atomic rename consumed it)', () => {
      writeManifest(vaultRoot, { files: {} });
      const tmpFile = join(vaultRoot, '.notebooklm-sync.json.tmp');
      assert.ok(!existsSync(tmpFile));
    });

    it('serializes with 2-space indentation (T2-03 — D-12 pretty-print)', () => {
      writeManifest(vaultRoot, { files: { 'projects/a.md': { hash: 'abc', notebook_source_id: null, uploaded_at: new Date().toISOString() } } });
      const raw = readFileSync(join(vaultRoot, '.notebooklm-sync.json'), 'utf8');
      assert.ok(raw.includes('  "version"'), 'expected 2-space indented version field');
    });

    it('throws Error("Vault not found at: ...") for null vaultRoot (T2-04)', () => {
      assert.throws(
        () => writeManifest(null, { files: {} }),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });

    it('throws Error("Vault not found at: ...") for non-existent vaultRoot (T2-04)', () => {
      assert.throws(
        () => writeManifest('/nonexistent/path/does-not-exist', { files: {} }),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });

    it('throws on null manifest (T2-05 — malformed input)', () => {
      assert.throws(
        () => writeManifest(vaultRoot, null),
        (err) => err instanceof Error
      );
    });

    it('throws when manifest.files is missing (T2-05)', () => {
      assert.throws(
        () => writeManifest(vaultRoot, {}),
        (err) => err instanceof Error
      );
    });

    it('throws when manifest.files is an array (T2-05)', () => {
      assert.throws(
        () => writeManifest(vaultRoot, { files: [] }),
        (err) => err instanceof Error
      );
    });
  });

  describe('readManifest', () => {
    it('returns { version:1, generated_at, files:{} } on fresh vault with no side effects (T2-06 — D-17)', () => {
      const result = readManifest(vaultRoot);
      assert.equal(result.version, 1);
      assert.ok(typeof result.generated_at === 'string' && result.generated_at.length > 0);
      assert.deepEqual(result.files, {});
      // No .corrupt-* sibling should exist
      const siblings = readdirSync(vaultRoot).filter(f => f.startsWith('.notebooklm-sync.corrupt-'));
      assert.equal(siblings.length, 0);
    });

    it('round-trips files entries exactly via write then read (T2-07)', () => {
      const files = {
        'projects/foo/context.md': { hash: 'a'.repeat(64), notebook_source_id: 'src-1', uploaded_at: new Date().toISOString() },
        'projects/bar/context.md': { hash: 'b'.repeat(64), notebook_source_id: 'src-2', uploaded_at: new Date().toISOString() },
      };
      writeManifest(vaultRoot, { files });
      const result = readManifest(vaultRoot);
      assert.equal(result.version, 1);
      assert.deepEqual(result.files, files);
    });

    it('corrupt recovery: invalid JSON renames to .corrupt-*, returns empty manifest, no .json file remains (T2-08 — D-14)', () => {
      // Write invalid JSON directly
      writeFileSync(join(vaultRoot, '.notebooklm-sync.json'), 'not json at all', 'utf8');
      const result = readManifest(vaultRoot);
      // Returns empty manifest
      assert.equal(result.version, 1);
      assert.deepEqual(result.files, {});
      // Original .json file no longer exists
      assert.ok(!existsSync(join(vaultRoot, '.notebooklm-sync.json')));
      // A .corrupt-* sibling now exists
      const siblings = readdirSync(vaultRoot).filter(f => f.startsWith('.notebooklm-sync.corrupt-'));
      assert.equal(siblings.length, 1);
      assert.match(siblings[0], /^\.notebooklm-sync\.corrupt-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });

    it('version:2 manifest is treated as corrupt (T2-09 — D-11 magic-number)', () => {
      writeFileSync(join(vaultRoot, '.notebooklm-sync.json'), JSON.stringify({ version: 2, files: {} }), 'utf8');
      const result = readManifest(vaultRoot);
      assert.equal(result.version, 1);
      assert.deepEqual(result.files, {});
      assert.ok(!existsSync(join(vaultRoot, '.notebooklm-sync.json')));
    });

    it('missing files field is treated as corrupt (T2-10)', () => {
      writeFileSync(join(vaultRoot, '.notebooklm-sync.json'), JSON.stringify({ version: 1 }), 'utf8');
      const result = readManifest(vaultRoot);
      assert.deepEqual(result.files, {});
      assert.ok(!existsSync(join(vaultRoot, '.notebooklm-sync.json')));
    });

    it('files being an array is treated as corrupt (T2-11)', () => {
      writeFileSync(join(vaultRoot, '.notebooklm-sync.json'), JSON.stringify({ version: 1, files: [] }), 'utf8');
      const result = readManifest(vaultRoot);
      assert.deepEqual(result.files, {});
      assert.ok(!existsSync(join(vaultRoot, '.notebooklm-sync.json')));
    });

    it('crash simulation: .tmp written and deleted without rename leaves target unchanged (T2-12 — SC4)', () => {
      // First write a valid manifest
      writeManifest(vaultRoot, { files: { 'a.md': { hash: 'c'.repeat(64), notebook_source_id: null, uploaded_at: '' } } });
      const manifestFilePath = join(vaultRoot, '.notebooklm-sync.json');
      const originalContent = readFileSync(manifestFilePath, 'utf8');

      // Simulate crash: write .tmp then delete it without rename
      const tmpPath = join(vaultRoot, '.notebooklm-sync.json.tmp');
      writeFileSync(tmpPath, 'garbage crash data', 'utf8');
      unlinkSync(tmpPath);

      // Target manifest must be byte-for-byte identical to before the crash
      const afterContent = readFileSync(manifestFilePath, 'utf8');
      assert.equal(afterContent, originalContent);
    });

    it('throws Error("Vault not found at: ...") for null vaultRoot (T2-13)', () => {
      assert.throws(
        () => readManifest(null),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });

    it('throws Error("Vault not found at: ...") for non-existent vaultRoot (T2-13)', () => {
      assert.throws(
        () => readManifest('/nonexistent/path/does-not-exist'),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });
  });

  // ── Task 3: ensureManifestGitignored ────────────────────────────────────────

  describe('ensureManifestGitignored', () => {
    it('creates .gitignore with only managed block when none exists, no leading blank line (T3-01)', () => {
      ensureManifestGitignored(vaultRoot);
      const gitignorePath = join(vaultRoot, '.gitignore');
      assert.ok(existsSync(gitignorePath));
      const content = readFileSync(gitignorePath, 'utf8');
      // Must NOT start with a blank line (D-18 step 4)
      assert.ok(!content.startsWith('\n'), 'must not have leading blank line');
      // Must end with \n
      assert.ok(content.endsWith('\n'));
      // Must contain the comment header
      assert.ok(content.includes('# Claude Dev Stack'));
    });

    it('appends managed block to existing .gitignore ending with \\n, preserving prior content (T3-02)', () => {
      const gitignorePath = join(vaultRoot, '.gitignore');
      writeFileSync(gitignorePath, 'node_modules\n.DS_Store\n', 'utf8');
      ensureManifestGitignored(vaultRoot);
      const content = readFileSync(gitignorePath, 'utf8');
      // Prior content preserved
      assert.ok(content.startsWith('node_modules\n.DS_Store\n'));
      // Managed entries present
      assert.ok(content.includes('.notebooklm-sync.json'));
    });

    it('repairs missing trailing newline on existing .gitignore (T3-03 — matches real vault state)', () => {
      const gitignorePath = join(vaultRoot, '.gitignore');
      // Write without trailing newline (matches real ~/vault/.gitignore per research)
      writeFileSync(gitignorePath, 'node_modules\n.DS_Store', 'utf8');
      ensureManifestGitignored(vaultRoot);
      const content = readFileSync(gitignorePath, 'utf8');
      // Prior content still there
      assert.ok(content.includes('node_modules'));
      assert.ok(content.includes('.DS_Store'));
      // Managed entries added
      assert.ok(content.includes('.notebooklm-sync.json'));
      // Blank line separator between old content and block
      assert.ok(content.includes('.DS_Store\n\n'));
    });

    it('is idempotent: second call leaves file byte-for-byte identical (T3-04 — D-19)', () => {
      ensureManifestGitignored(vaultRoot);
      const afterFirst = readFileSync(join(vaultRoot, '.gitignore'), 'utf8');
      ensureManifestGitignored(vaultRoot);
      const afterSecond = readFileSync(join(vaultRoot, '.gitignore'), 'utf8');
      assert.equal(afterFirst, afterSecond);
    });

    it('N calls result in exactly one occurrence of .notebooklm-sync.json entry (T3-05 — SC5)', () => {
      ensureManifestGitignored(vaultRoot);
      ensureManifestGitignored(vaultRoot);
      ensureManifestGitignored(vaultRoot);
      const content = readFileSync(join(vaultRoot, '.gitignore'), 'utf8');
      const lines = content.split(/\r?\n/);
      const count = lines.filter(l => l.trim() === '.notebooklm-sync.json').length;
      assert.equal(count, 1);
    });

    it('recognizes CRLF-formatted entry as already-present (T3-06 — idempotency with Windows line endings)', () => {
      const gitignorePath = join(vaultRoot, '.gitignore');
      // Write with CRLF including the managed entry
      writeFileSync(gitignorePath, 'node_modules\r\n.notebooklm-sync.json\r\n', 'utf8');
      ensureManifestGitignored(vaultRoot);
      const content = readFileSync(gitignorePath, 'utf8');
      // Must not have duplicated the entry
      const lines = content.split(/\r?\n/);
      const count = lines.filter(l => l.trim() === '.notebooklm-sync.json').length;
      assert.equal(count, 1);
    });

    it('managed block contains all three entries (T3-07 — D-22)', () => {
      ensureManifestGitignored(vaultRoot);
      const content = readFileSync(join(vaultRoot, '.gitignore'), 'utf8');
      assert.ok(content.includes('.notebooklm-sync.json\n'));
      assert.ok(content.includes('.notebooklm-sync.json.tmp\n'));
      assert.ok(content.includes('.notebooklm-sync.corrupt-*'));
    });

    it('throws Error("Vault not found at: ...") for null vaultRoot (T3-08)', () => {
      assert.throws(
        () => ensureManifestGitignored(null),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });

    it('throws Error("Vault not found at: ...") for non-existent vaultRoot (T3-08)', () => {
      assert.throws(
        () => ensureManifestGitignored('/nonexistent/path/does-not-exist'),
        (err) => err instanceof Error && /Vault not found at:/.test(err.message)
      );
    });
  });
});
