import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, copyFileSync, chmodSync, existsSync } from 'fs';
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
