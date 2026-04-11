import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, copyFileSync, chmodSync, existsSync, readFileSync } from 'fs';
import { join, dirname, delimiter } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const stubSource = join(fixturesDir, 'notebooklm-stub.sh');

// Dedicated directory on PATH containing ONLY the stub renamed to `notebooklm`.
// Prepended to process.env.PATH during before(); restored in after().
const stubDir = join(tmpdir(), `notebooklm-stub-dir-${process.pid}`);
const stubInstall = join(stubDir, 'notebooklm');

let originalPath;

// Module is imported once at the top because the cache is reset between tests
// via _resetBinaryCache() — dynamic import is not needed (D-07 resolution:
// _resetBinaryCache is the chosen approach).
let nblm;

before(async () => {
  // Install the stub as a fake `notebooklm` binary in a dedicated PATH dir.
  if (existsSync(stubDir)) rmSync(stubDir, { recursive: true, force: true });
  mkdirSync(stubDir, { recursive: true });
  copyFileSync(stubSource, stubInstall);
  chmodSync(stubInstall, 0o755);

  // Prepend stubDir to PATH so `which notebooklm` (inside hasCommand) resolves here.
  originalPath = process.env.PATH;
  process.env.PATH = `${stubDir}${delimiter}${originalPath}`;

  // Import AFTER PATH mutation, to avoid ordering surprises during module load.
  nblm = await import('../lib/notebooklm.mjs');
});

beforeEach(() => {
  // Clear stub scenario vars so each test starts clean.
  delete process.env.NOTEBOOKLM_STUB_STDOUT;
  delete process.env.NOTEBOOKLM_STUB_STDERR;
  delete process.env.NOTEBOOKLM_STUB_EXIT;
  // Reset lazy detection cache so tests can mutate PATH between scenarios.
  nblm._resetBinaryCache();
});

after(() => {
  process.env.PATH = originalPath;
  if (existsSync(stubDir)) rmSync(stubDir, { recursive: true, force: true });
});

// ── Helper: set stub scenario env vars in one call ──────────────────────────
function stub({ stdout = '', stderr = '', exit = 0 } = {}) {
  if (stdout) process.env.NOTEBOOKLM_STUB_STDOUT = stdout;
  else delete process.env.NOTEBOOKLM_STUB_STDOUT;
  if (stderr) process.env.NOTEBOOKLM_STUB_STDERR = stderr;
  else delete process.env.NOTEBOOKLM_STUB_STDERR;
  process.env.NOTEBOOKLM_STUB_EXIT = String(exit);
}

describe('lib/notebooklm.mjs — error classes and invariants', () => {
  it('NotebooklmRateLimitError is subclass of NotebooklmCliError', () => {
    const err = new nblm.NotebooklmRateLimitError('boom', {
      command: ['source', 'delete', 'x'],
      exitCode: 1,
      stderr: 'Error: Rate limited.',
      matchedPattern: 'rate[\\s_-]?limit',
    });
    assert.ok(err instanceof nblm.NotebooklmCliError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'NotebooklmRateLimitError');
    assert.equal(err.matchedPattern, 'rate[\\s_-]?limit');
  });

  it('NotebooklmNotInstalledError is NOT a subclass of NotebooklmCliError', () => {
    const err = new nblm.NotebooklmNotInstalledError('createNotebook');
    assert.ok(err instanceof Error);
    assert.ok(!(err instanceof nblm.NotebooklmCliError));
    assert.equal(err.name, 'NotebooklmNotInstalledError');
    assert.equal(err.functionName, 'createNotebook');
    assert.equal(err.binaryName, 'notebooklm');
  });

  it('NotebooklmNotInstalledError.message contains install hint and function name', () => {
    const err = new nblm.NotebooklmNotInstalledError('uploadSource');
    assert.match(err.message, /pipx install notebooklm-py/);
    assert.match(err.message, /pip install --user notebooklm-py/);
    assert.match(err.message, /uploadSource/);
  });

  it('NotebooklmCliError carries command, exitCode, stderr fields', () => {
    const err = new nblm.NotebooklmCliError('boom', {
      command: ['create', 'Title', '--json'],
      exitCode: 1,
      stderr: 'auth failed',
    });
    assert.deepEqual(err.command, ['create', 'Title', '--json']);
    assert.equal(err.exitCode, 1);
    assert.equal(err.stderr, 'auth failed');
    assert.equal(err.rawOutput, undefined); // rawOutput only set when JSON parse fails
  });

  it('RATE_LIMIT_PATTERNS is frozen and contains only RegExp instances', () => {
    assert.ok(Array.isArray(nblm.RATE_LIMIT_PATTERNS));
    assert.ok(Object.isFrozen(nblm.RATE_LIMIT_PATTERNS));
    assert.ok(nblm.RATE_LIMIT_PATTERNS.length >= 3);
    for (const p of nblm.RATE_LIMIT_PATTERNS) {
      assert.ok(p instanceof RegExp, `${p} is not a RegExp`);
    }
    // Key patterns required by research
    assert.ok(nblm.RATE_LIMIT_PATTERNS.some((p) => p.test('Error: Rate limited.')));
    assert.ok(nblm.RATE_LIMIT_PATTERNS.some((p) => p.test('too many requests')));
  });

  it('_resetBinaryCache is a function and is idempotent', () => {
    assert.equal(typeof nblm._resetBinaryCache, 'function');
    assert.equal(nblm._resetBinaryCache(), undefined);
    // Calling again must remain safe (idempotent).
    nblm._resetBinaryCache();
  });
});

describe('createNotebook', () => {
  it('returns { id, title } on successful JSON response', async () => {
    stub({ stdout: '{"notebook":{"id":"nb-1","title":"Test"}}', exit: 0 });
    const result = await nblm.createNotebook('Test');
    assert.deepEqual(result, { id: 'nb-1', title: 'Test' });
  });

  it('throws NotebooklmCliError when parsed.notebook is missing', async () => {
    stub({ stdout: '{}', exit: 0 });
    await assert.rejects(
      () => nblm.createNotebook('Test'),
      (err) => err instanceof nblm.NotebooklmCliError && /expected.*notebook/.test(err.message)
    );
  });

  it('throws TypeError on empty name', async () => {
    await assert.rejects(
      () => nblm.createNotebook(''),
      (err) => err instanceof TypeError
    );
  });
});

describe('listSources', () => {
  it('returns normalized array stripping index/type/url/status_id/created_at', async () => {
    const fullShape = {
      notebook_id: 'nb-1',
      notebook_title: 'Test',
      sources: [
        {
          index: 1,
          id: 'src-1',
          title: 'file.md',
          type: 'SourceType.MARKDOWN',
          url: null,
          status: 'processing',
          status_id: 1,
          created_at: '2026-04-10T21:05:26',
        },
      ],
      count: 1,
    };
    stub({ stdout: JSON.stringify(fullShape), exit: 0 });
    const result = await nblm.listSources('nb-1');
    assert.deepEqual(result, [{ id: 'src-1', title: 'file.md', status: 'processing' }]);
  });

  it('returns empty array on empty notebook (benign WARNING on stderr)', async () => {
    stub({
      stdout: '{"notebook_id":"nb-1","notebook_title":"Empty","sources":[],"count":0}',
      stderr: 'WARNING [notebooklm._sources] Sources data for nb-1 is not a list (type=NoneType), returning empty list',
      exit: 0,
    });
    const result = await nblm.listSources('nb-1');
    assert.deepEqual(result, []);
  });

  it('throws NotebooklmCliError when sources is not an array', async () => {
    stub({ stdout: '{"sources":"not an array"}', exit: 0 });
    await assert.rejects(
      () => nblm.listSources('nb-1'),
      (err) => err instanceof nblm.NotebooklmCliError
    );
  });

  it('throws TypeError on empty notebookId', async () => {
    await assert.rejects(
      () => nblm.listSources(''),
      (err) => err instanceof TypeError
    );
  });
});

describe('uploadSource', () => {
  it('returns { sourceId, title } from nested parsed.source (corrected v0.3.4 shape)', async () => {
    stub({
      stdout: '{"source":{"id":"src-42","title":"file.md","type":"SourceType.UNKNOWN","url":null}}',
      exit: 0,
    });
    const result = await nblm.uploadSource('nb-1', '/tmp/file.md');
    assert.deepEqual(result, { sourceId: 'src-42', title: 'file.md' });
  });

  it('throws NotebooklmCliError when parsed.source is missing (flat shape from SKILL.md is wrong)', async () => {
    stub({ stdout: '{"source_id":"flat-shape-from-skill-md"}', exit: 0 });
    await assert.rejects(
      () => nblm.uploadSource('nb-1', '/tmp/x.md'),
      (err) => err instanceof nblm.NotebooklmCliError
    );
  });

  it('throws TypeError on empty filepath', async () => {
    await assert.rejects(
      () => nblm.uploadSource('nb-1', ''),
      (err) => err instanceof TypeError
    );
  });
});

describe('deleteSource', () => {
  it('returns { deleted: true, sourceId } on success text output', async () => {
    stub({ stdout: 'Deleted source: abc-123', exit: 0 });
    const result = await nblm.deleteSource('nb-1', 'abc-123');
    assert.deepEqual(result, { deleted: true, sourceId: 'abc-123' });
  });

  it('throws NotebooklmCliError on unexpected output format', async () => {
    stub({ stdout: 'Something completely unexpected', exit: 0 });
    await assert.rejects(
      () => nblm.deleteSource('nb-1', 'abc-123'),
      (err) => err instanceof nblm.NotebooklmCliError && /unexpected output format/.test(err.message)
    );
  });
});

describe('deleteSourceByTitle', () => {
  it('returns { deleted: true, sourceId } on success', async () => {
    stub({ stdout: 'Deleted source: xyz-789', exit: 0 });
    const result = await nblm.deleteSourceByTitle('nb-1', 'My Doc');
    assert.deepEqual(result, { deleted: true, sourceId: 'xyz-789' });
  });

  it('throws TypeError on empty title', async () => {
    await assert.rejects(
      () => nblm.deleteSourceByTitle('nb-1', ''),
      (err) => err instanceof TypeError
    );
  });
});

describe('updateSource', () => {
  it('propagates deleteSource failures without attempting upload', async () => {
    stub({ stderr: 'Error: Not found', exit: 1 });
    await assert.rejects(
      () => nblm.updateSource('nb-1', 'src-dead', '/tmp/new.md'),
      (err) => err instanceof nblm.NotebooklmCliError
    );
  });

  it('throws TypeError on empty filepath', async () => {
    await assert.rejects(
      () => nblm.updateSource('nb-1', 'src-1', ''),
      (err) => err instanceof TypeError
    );
  });
});

describe('error propagation through runNotebooklm', () => {
  it('non-zero exit with generic stderr throws NotebooklmCliError', async () => {
    stub({ stderr: 'boom', exit: 1 });
    await assert.rejects(
      () => nblm.createNotebook('Test'),
      (err) => err instanceof nblm.NotebooklmCliError &&
               !(err instanceof nblm.NotebooklmRateLimitError) &&
               err.exitCode === 1 &&
               err.stderr === 'boom'
    );
  });

  it('non-zero exit with JSON RATE_LIMITED code throws NotebooklmRateLimitError', async () => {
    stub({
      stdout: '{"error":true,"code":"RATE_LIMITED","message":"Rate limited."}',
      exit: 1,
    });
    await assert.rejects(
      () => nblm.createNotebook('Test'),
      (err) => err instanceof nblm.NotebooklmRateLimitError &&
               err.matchedPattern === 'RATE_LIMITED'
    );
  });

  it('non-zero exit with stderr rate-limit text triggers rate-limit error (text mode path)', async () => {
    stub({ stderr: 'Error: Rate limited.', exit: 1 });
    await assert.rejects(
      () => nblm.deleteSource('nb-1', 'src-1'),
      (err) => err instanceof nblm.NotebooklmRateLimitError
    );
  });

  it('exit 0 with unparseable stdout throws NotebooklmCliError with rawOutput set', async () => {
    stub({ stdout: 'not json at all', exit: 0 });
    await assert.rejects(
      () => nblm.createNotebook('Test'),
      (err) => err instanceof nblm.NotebooklmCliError &&
               err.rawOutput === 'not json at all' &&
               /failed to parse/.test(err.message)
    );
  });
});

describe('lib/notebooklm.mjs — static invariants', () => {
  it('package.json dependencies has exactly one key: prompts (NBLM-03)', () => {
    const pkgRaw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const depKeys = Object.keys(pkg.dependencies || {});
    assert.equal(depKeys.length, 1);
    assert.equal(depKeys[0], 'prompts');
  });

  it('lib/notebooklm.mjs contains no credential references (SC5)', () => {
    const src = readFileSync(join(__dirname, '..', 'lib', 'notebooklm.mjs'), 'utf8');
    assert.equal(src.match(/NOTEBOOKLM_API_KEY/g), null, 'must not reference NOTEBOOKLM_API_KEY');
    assert.equal(src.match(/storage_state/g), null, 'must not reference storage_state');
    assert.equal(src.match(/notebooklm login/g), null, 'must not reference notebooklm login');
  });
});

describe('lib/notebooklm.mjs — listNotebooks (D-10, NBLM-12)', () => {
  it('listNotebooks() returns normalized array with id, title, createdAt (happy path)', async () => {
    stub({
      stdout: '{"notebooks":[{"index":1,"id":"nb-1","title":"claude-dev-stack-vault","is_owner":true,"created_at":"2026-04-11T14:05:40"}],"count":1}',
      exit: 0,
    });
    const result = await nblm.listNotebooks();
    assert.ok(Array.isArray(result), 'result must be an array');
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { id: 'nb-1', title: 'claude-dev-stack-vault', createdAt: '2026-04-11T14:05:40' });
    // index and is_owner must be stripped
    assert.equal(result[0].index, undefined);
    assert.equal(result[0].is_owner, undefined);
  });

  it('listNotebooks() returns empty array for empty vault', async () => {
    stub({ stdout: '{"notebooks":[],"count":0}', exit: 0 });
    const result = await nblm.listNotebooks();
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('listNotebooks() tolerates null created_at (create-output shape)', async () => {
    stub({ stdout: '{"notebooks":[{"id":"nb-x","title":"x","created_at":null}]}', exit: 0 });
    const result = await nblm.listNotebooks();
    assert.deepEqual(result[0], { id: 'nb-x', title: 'x', createdAt: null });
  });

  it('listNotebooks() throws NotebooklmCliError when notebooks key is missing', async () => {
    stub({ stdout: '{"error":"oops"}', exit: 0 });
    await assert.rejects(
      () => nblm.listNotebooks(),
      (err) => err instanceof nblm.NotebooklmCliError &&
               /expected \{ notebooks/.test(err.message)
    );
  });

  it('listNotebooks() throws NotebooklmCliError when entry is missing id or title', async () => {
    stub({ stdout: '{"notebooks":[{"title":"only-title"}]}', exit: 0 });
    await assert.rejects(
      () => nblm.listNotebooks(),
      (err) => err instanceof nblm.NotebooklmCliError &&
               /notebook entry missing required id\/title/.test(err.message)
    );
  });

  it('listNotebooks() throws NotebooklmNotInstalledError when binary is absent from PATH', async () => {
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = '/nonexistent-path-for-test';
      nblm._resetBinaryCache();
      await assert.rejects(
        () => nblm.listNotebooks(),
        (err) => err instanceof nblm.NotebooklmNotInstalledError &&
                 err.functionName === 'listNotebooks'
      );
    } finally {
      process.env.PATH = savedPath;
      nblm._resetBinaryCache();
    }
  });
});
