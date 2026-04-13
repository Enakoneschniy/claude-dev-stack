import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const fixtureDir = join(__dirname, 'fixtures', 'state');

// Helper: create a temp dir with .planning/STATE.md from fixture content
function makeTempProject(fixtureFile) {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-test-'));
  mkdirSync(join(dir, '.planning'), { recursive: true });
  const content = readFileSync(join(fixtureDir, fixtureFile), 'utf8');
  writeFileSync(join(dir, '.planning', 'STATE.md'), content, 'utf8');
  return dir;
}

// Helper: create a temp dir with NO STATE.md
function makeTempProjectNoState() {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-test-'));
  mkdirSync(join(dir, '.planning'), { recursive: true });
  return dir;
}

describe('lib/handoff.mjs', async () => {
  const mod = await import('../lib/handoff.mjs');

  describe('exports', () => {
    it('exports readHandoffState as a function', () => {
      assert.equal(typeof mod.readHandoffState, 'function');
    });
    it('exports parseFrontmatter as a function', () => {
      assert.equal(typeof mod.parseFrontmatter, 'function');
    });
    it('exports formatHandoffSummary as a function', () => {
      assert.equal(typeof mod.formatHandoffSummary, 'function');
    });
    it('exports HandoffError as a class', () => {
      assert.equal(typeof mod.HandoffError, 'function');
    });
    it('exports MISSING_STATE constant as string', () => {
      assert.equal(typeof mod.MISSING_STATE, 'string');
    });
    it('exports MISSING_STOPPED_AT constant as string', () => {
      assert.equal(typeof mod.MISSING_STOPPED_AT, 'string');
    });
  });

  describe('parseFrontmatter', () => {
    it('parses stopped_at from valid frontmatter with resume_file', () => {
      const content = readFileSync(join(fixtureDir, 'valid-with-resume-file.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.equal(result.stopped_at, 'Phase 21 complete — ready to plan Phase 22');
    });
    it('parses resume_file from valid frontmatter', () => {
      const content = readFileSync(join(fixtureDir, 'valid-with-resume-file.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.ok(result.resume_file.includes('21-SUMMARY.md'));
    });
    it('returns no resume_file key when absent from frontmatter', () => {
      const content = readFileSync(join(fixtureDir, 'valid-no-resume-file.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.equal(result.resume_file, undefined);
    });
    it('parses stopped_at when resume_file is None string', () => {
      const content = readFileSync(join(fixtureDir, 'valid-resume-file-none.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.equal(result.stopped_at, 'Phase 19 complete');
      assert.equal(result.resume_file, 'None');
    });
    it('does not include stopped_at when absent', () => {
      const content = readFileSync(join(fixtureDir, 'missing-stopped-at.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.equal(result.stopped_at, undefined);
    });
    it('parses empty-string stopped_at', () => {
      const content = readFileSync(join(fixtureDir, 'empty-stopped-at.md'), 'utf8');
      const result = mod.parseFrontmatter(content);
      assert.equal(result.stopped_at, '');
    });
  });

  describe('readHandoffState', () => {
    it('returns stopped_at and null resume_file for fixture without resume_file', () => {
      const dir = makeTempProject('valid-no-resume-file.md');
      const result = mod.readHandoffState(dir);
      assert.equal(result.stopped_at, 'Phase 20 complete — ready to plan Phase 21');
      assert.equal(result.resume_file, null);
    });
    it('returns stopped_at and resume_file for fixture with resume_file', () => {
      const dir = makeTempProject('valid-with-resume-file.md');
      const result = mod.readHandoffState(dir);
      assert.equal(result.stopped_at, 'Phase 21 complete — ready to plan Phase 22');
      assert.ok(result.resume_file.includes('21-SUMMARY.md'));
    });
    it('treats resume_file: None as null', () => {
      const dir = makeTempProject('valid-resume-file-none.md');
      const result = mod.readHandoffState(dir);
      assert.equal(result.resume_file, null);
    });
    it('throws HandoffError with MISSING_STATE when STATE.md absent', () => {
      const dir = makeTempProjectNoState();
      assert.throws(
        () => mod.readHandoffState(dir),
        (err) => err instanceof mod.HandoffError && err.code === mod.MISSING_STATE
      );
    });
    it('throws HandoffError with MISSING_STOPPED_AT when stopped_at absent', () => {
      const dir = makeTempProject('missing-stopped-at.md');
      assert.throws(
        () => mod.readHandoffState(dir),
        (err) => err instanceof mod.HandoffError && err.code === mod.MISSING_STOPPED_AT
      );
    });
    it('throws HandoffError with MISSING_STOPPED_AT when stopped_at is empty string', () => {
      const dir = makeTempProject('empty-stopped-at.md');
      assert.throws(
        () => mod.readHandoffState(dir),
        (err) => err instanceof mod.HandoffError && err.code === mod.MISSING_STOPPED_AT
      );
    });
    it('error message for MISSING_STATE contains path hint', () => {
      const dir = makeTempProjectNoState();
      assert.throws(
        () => mod.readHandoffState(dir),
        (err) => err.message.includes('STATE.md not found')
      );
    });
    it('error message for MISSING_STOPPED_AT mentions gsd-next', () => {
      const dir = makeTempProject('missing-stopped-at.md');
      assert.throws(
        () => mod.readHandoffState(dir),
        (err) => err.message.includes('/gsd-next')
      );
    });
  });

  describe('HandoffError', () => {
    it('is an instance of Error', () => {
      const err = new mod.HandoffError('test message', mod.MISSING_STATE);
      assert.ok(err instanceof Error);
    });
    it('has name HandoffError', () => {
      const err = new mod.HandoffError('test message', mod.MISSING_STATE);
      assert.equal(err.name, 'HandoffError');
    });
    it('has correct code property', () => {
      const err = new mod.HandoffError('test', mod.MISSING_STATE);
      assert.equal(err.code, mod.MISSING_STATE);
    });
    it('has correct message', () => {
      const err = new mod.HandoffError('test message', mod.MISSING_STOPPED_AT);
      assert.equal(err.message, 'test message');
    });
  });

  describe('formatHandoffSummary', () => {
    it('includes stopped_at in output', () => {
      const summary = mod.formatHandoffSummary({ stopped_at: 'Phase 22 done', resume_file: null });
      assert.ok(summary.includes('Phase 22 done'));
    });
    it('does not include Context file line when resume_file is null', () => {
      const summary = mod.formatHandoffSummary({ stopped_at: 'Phase 22 done', resume_file: null });
      assert.ok(!summary.includes('Context file'));
    });
    it('includes resume_file in output when present', () => {
      const summary = mod.formatHandoffSummary({ stopped_at: 'Phase 22 done', resume_file: 'path/to/file.md' });
      assert.ok(summary.includes('path/to/file.md'));
    });
    it('includes Context file label when resume_file present', () => {
      const summary = mod.formatHandoffSummary({ stopped_at: 'Phase 22 done', resume_file: 'path/to/file.md' });
      assert.ok(summary.includes('Context file'));
    });
  });
});

describe('claude-dev-stack handoff CLI', () => {
  it('exits 0 and prints resumable when project has valid STATE.md', () => {
    const result = spawnSync('node', ['bin/cli.mjs', 'handoff', 'status'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('resumable'), `Expected 'resumable' in output: ${result.stdout}`);
  });

  it('exits 1 when run from a directory without STATE.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'handoff-cli-test-'));
    mkdirSync(join(dir, '.planning'), { recursive: true });
    const result = spawnSync('node', [join(projectRoot, 'bin/cli.mjs'), 'handoff', 'status'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stdout: ${result.stdout}`);
    assert.ok(
      result.stdout.includes('STATE.md not found') || result.stderr.includes('STATE.md not found'),
      `Expected error message about STATE.md. stdout: ${result.stdout}`
    );
  });

  it('handoff with no subcommand shows help text with LIMIT-04', () => {
    const result = spawnSync('node', ['bin/cli.mjs', 'handoff'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.ok(result.stdout.includes('LIMIT-04'), `Expected LIMIT-04 in help. stdout: ${result.stdout}`);
  });
});
