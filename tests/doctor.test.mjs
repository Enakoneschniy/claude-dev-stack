/**
 * tests/doctor.test.mjs — NotebookLM section in lib/doctor.mjs (NBLM-27 + ADR-0012)
 *
 * Strategy: run `node bin/cli.mjs doctor` in a subprocess with a custom PATH that
 * points to a fake `notebooklm` binary (the existing sync stub). Capture stdout and
 * assert on the presence/absence of expected lines. Also set VAULT_PATH to a
 * controlled temp directory so doctor reads a known manifest state.
 */

import { describe, it, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const cliPath = join(projectRoot, 'bin', 'cli.mjs');
const stubSh = join(projectRoot, 'tests', 'fixtures', 'notebooklm-sync-stub.sh');

// Build a PATH string that excludes any segment containing the real `notebooklm` binary.
// This allows us to simulate "notebooklm not installed" in tests.
function buildPathWithoutNblm() {
  const segments = (process.env.PATH || '').split(':');
  return segments.filter(seg => !existsSync(join(seg, 'notebooklm'))).join(':');
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Run `node bin/cli.mjs doctor` with a controlled environment.
 * @param {object} opts
 * @param {string|null} opts.stubBinDir   - Prepend to PATH so fake `notebooklm` is found.
 * @param {boolean}     opts.excludeNblm  - If true, strip the real notebooklm from PATH.
 * @param {string|null} opts.vaultPath    - Passed as VAULT_PATH env var (overrides findVault).
 * @param {object}      opts.extraEnv     - Additional env vars to pass to the subprocess.
 */
function runDoctor({ stubBinDir = null, excludeNblm = false, vaultPath = null, extraEnv = {} } = {}) {
  let pathValue = excludeNblm ? buildPathWithoutNblm() : process.env.PATH;

  const env = {
    PATH: pathValue,
    HOME: process.env.HOME,
    ...extraEnv,
  };

  if (stubBinDir) {
    env.PATH = `${stubBinDir}:${env.PATH}`;
  }
  if (vaultPath) {
    env.VAULT_PATH = vaultPath;
  }

  const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
    encoding: 'utf8',
    env,
    timeout: 15000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/**
 * Create a temp vault dir with meta/ and projects/ so findVault() picks it up.
 * Optionally write a .notebooklm-sync.json manifest.
 */
function makeTempVault({ manifest = null } = {}) {
  const vaultRoot = mkdtempSync(join(tmpdir(), 'doctor-test-vault-'));
  mkdirSync(join(vaultRoot, 'meta'), { recursive: true });
  mkdirSync(join(vaultRoot, 'projects'), { recursive: true });
  if (manifest !== null) {
    writeFileSync(
      join(vaultRoot, '.notebooklm-sync.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
  }
  return vaultRoot;
}

/**
 * Create a temp bin directory with a `notebooklm` wrapper that delegates
 * to the existing sync stub with configurable env vars.
 */
function makeStubBinDir({ authExit = 0 } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'doctor-test-bin-'));
  const wrapperPath = join(binDir, 'notebooklm');

  writeFileSync(
    wrapperPath,
    `#!/bin/bash\nexport NOTEBOOKLM_SYNC_STUB_AUTH_EXIT=${authExit}\nexec "${stubSh}" "$@"\n`,
    'utf8',
  );
  chmodSync(wrapperPath, 0o755);
  return binDir;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('doctor — NotebookLM section (NBLM-27 + ADR-0012)', () => {
  let tmpVault = null;
  let tmpBinDir = null;

  afterEach(() => {
    if (tmpVault && existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
    if (tmpBinDir && existsSync(tmpBinDir)) rmSync(tmpBinDir, { recursive: true, force: true });
    tmpVault = null;
    tmpBinDir = null;
  });

  it('missing notebooklm binary — prints info line, no fail line for notebooklm', () => {
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    // Must see the info "not installed (optional" line.
    assert.ok(
      result.stdout.includes('not installed (optional'),
      `Expected "not installed (optional" in stdout.\nGot: ${result.stdout}`,
    );

    // Must NOT see a red ✘ on a line containing "notebooklm" (fail() would produce that).
    const lines = result.stdout.split('\n');
    const nblmFailLine = lines.find(l => l.includes('\x1b[31m\u2718') && l.toLowerCase().includes('notebooklm'));
    assert.equal(
      nblmFailLine,
      undefined,
      `notebooklm must not appear on a fail (✘) line. Found: ${nblmFailLine}`,
    );
  });

  it('binary present + auth ok — prints ok lines for binary and auth', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    // Should see notebooklm binary ok line.
    assert.ok(
      result.stdout.includes('notebooklm'),
      `Expected notebooklm mention in stdout.\nGot: ${result.stdout}`,
    );
    // Should see auth ok line.
    assert.ok(
      result.stdout.includes('notebooklm auth — ok'),
      `Expected "notebooklm auth — ok".\nGot: ${result.stdout}`,
    );
  });

  it('binary present + auth check fails — prints warn line and login hint', () => {
    tmpBinDir = makeStubBinDir({ authExit: 1 });
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('login required'),
      `Expected "login required" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('fresh vault (no manifest) — prints "last sync: never"', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    tmpVault = makeTempVault(); // no manifest written

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('last sync: never'),
      `Expected "last sync: never".\nGot: ${result.stdout}`,
    );
  });

  it('manifest with generated_at = today — prints ok last sync', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    const recentDate = new Date().toISOString();
    tmpVault = makeTempVault({
      manifest: {
        version: 1,
        generated_at: recentDate,
        files: {
          'sessions/2026-01-01.md': { hash: 'abc123', notebook_source_id: 'src1', uploaded_at: recentDate },
          'sessions/2026-01-02.md': { hash: 'def456', notebook_source_id: 'src2', uploaded_at: recentDate },
        },
      },
    });

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('last sync: today') || result.stdout.includes('last sync: 0 day'),
      `Expected recent sync in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('manifest with generated_at = 5 days ago — prints stale sync warn', () => {
    tmpBinDir = makeStubBinDir({ authExit: 0 });
    const staleDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    tmpVault = makeTempVault({
      manifest: {
        version: 1,
        generated_at: staleDate,
        files: {
          'sessions/old.md': { hash: 'aaa', notebook_source_id: 'src1', uploaded_at: staleDate },
        },
      },
    });

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('consider running manually'),
      `Expected stale sync warning.\nGot: ${result.stdout}`,
    );
  });

  it('doctor exits 0 regardless of notebooklm state', () => {
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
  });
});

// ── 260411-u3g: output-style plugin conflict detection ─────────────────────

/**
 * Build a temp HOME with a controlled .claude/settings.json. The doctor
 * subprocess inherits HOME and reads CLAUDE_DIR/settings.json via shared.mjs,
 * which resolves homedir() at module load.
 */
function makeTempHomeWithSettings(enabledPlugins) {
  const tmpHome = mkdtempSync(join(tmpdir(), 'doctor-test-home-'));
  mkdirSync(join(tmpHome, '.claude'), { recursive: true });
  writeFileSync(
    join(tmpHome, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins }, null, 2),
    'utf8',
  );
  return tmpHome;
}

describe('doctor — output-style plugin conflict detection (260411-u3g)', () => {
  let tmpHome = null;
  let tmpVault = null;

  afterEach(() => {
    if (tmpHome && existsSync(tmpHome)) rmSync(tmpHome, { recursive: true, force: true });
    if (tmpVault && existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
    tmpHome = null;
    tmpVault = null;
  });

  it('warns when learning-output-style is enabled', () => {
    tmpHome = makeTempHomeWithSettings({
      'learning-output-style@claude-plugins-official': true,
    });
    tmpVault = makeTempVault();

    const result = runDoctor({
      excludeNblm: true,
      vaultPath: tmpVault,
      extraEnv: { HOME: tmpHome },
    });

    assert.ok(
      result.stdout.includes('Output-style plugins active'),
      `Expected output-style warning. Got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('learning-output-style@claude-plugins-official'),
      `Expected plugin name in warning. Got:\n${result.stdout}`,
    );
  });

  it('warns when explanatory-output-style is enabled', () => {
    tmpHome = makeTempHomeWithSettings({
      'explanatory-output-style@claude-plugins-official': true,
    });
    tmpVault = makeTempVault();

    const result = runDoctor({
      excludeNblm: true,
      vaultPath: tmpVault,
      extraEnv: { HOME: tmpHome },
    });

    assert.ok(
      result.stdout.includes('Output-style plugins active'),
      `Expected output-style warning. Got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('explanatory-output-style@claude-plugins-official'),
      `Expected plugin name in warning. Got:\n${result.stdout}`,
    );
  });

  it('lists both plugins when both are enabled', () => {
    tmpHome = makeTempHomeWithSettings({
      'learning-output-style@claude-plugins-official': true,
      'explanatory-output-style@claude-plugins-official': true,
    });
    tmpVault = makeTempVault();

    const result = runDoctor({
      excludeNblm: true,
      vaultPath: tmpVault,
      extraEnv: { HOME: tmpHome },
    });

    assert.ok(result.stdout.includes('learning-output-style@claude-plugins-official'));
    assert.ok(result.stdout.includes('explanatory-output-style@claude-plugins-official'));
  });

  it('does NOT warn when both plugins are disabled (false)', () => {
    tmpHome = makeTempHomeWithSettings({
      'learning-output-style@claude-plugins-official': false,
      'explanatory-output-style@claude-plugins-official': false,
      'some-other-plugin@marketplace': true,
    });
    tmpVault = makeTempVault();

    const result = runDoctor({
      excludeNblm: true,
      vaultPath: tmpVault,
      extraEnv: { HOME: tmpHome },
    });

    assert.equal(
      result.stdout.includes('Output-style plugins active'),
      false,
      `Did not expect output-style warning. Got:\n${result.stdout}`,
    );
  });

  it('does NOT warn when neither plugin is in settings', () => {
    tmpHome = makeTempHomeWithSettings({
      'session-report@claude-plugins-official': true,
      'sentry@claude-plugins-official': true,
    });
    tmpVault = makeTempVault();

    const result = runDoctor({
      excludeNblm: true,
      vaultPath: tmpVault,
      extraEnv: { HOME: tmpHome },
    });

    assert.equal(
      result.stdout.includes('Output-style plugins active'),
      false,
      `Did not expect output-style warning. Got:\n${result.stdout}`,
    );
  });
});

// ── Git Conventions section (GIT-08 / GIT-09 / GIT-10) ───────────

/**
 * Write a project-map.json into the vault pointing at dirPath → projectName.
 */
function writeProjectMap(vaultRoot, projectMap) {
  writeFileSync(
    join(vaultRoot, 'project-map.json'),
    JSON.stringify({ projects: projectMap }, null, 2),
    'utf8',
  );
}

describe('doctor — Git Conventions section (GIT-08/GIT-09/GIT-10)', () => {
  let tmpVault = null;
  let tmpProjectDir = null;

  afterEach(() => {
    if (tmpVault && existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
    if (tmpProjectDir && existsSync(tmpProjectDir)) rmSync(tmpProjectDir, { recursive: true, force: true });
    tmpVault = null;
    tmpProjectDir = null;
  });

  it('warns for missing .claude/git-scopes.json on existing project', () => {
    tmpVault = makeTempVault();
    tmpProjectDir = mkdtempSync(join(tmpdir(), 'doctor-git-proj-'));
    writeProjectMap(tmpVault, { [tmpProjectDir]: 'test-project' });

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('git-scopes.json missing'),
      `Expected "git-scopes.json missing" in stdout.\nGot: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude-dev-stack scopes init'),
      `Expected "claude-dev-stack scopes init" guidance.\nGot: ${result.stdout}`,
    );
  });

  it('shows OK for valid .claude/git-scopes.json', () => {
    tmpVault = makeTempVault();
    tmpProjectDir = mkdtempSync(join(tmpdir(), 'doctor-git-proj-'));
    // Create .claude/ directory and write a valid git-scopes.json
    mkdirSync(join(tmpProjectDir, '.claude'), { recursive: true });
    writeFileSync(
      join(tmpProjectDir, '.claude', 'git-scopes.json'),
      JSON.stringify({ version: 1, scopes: ['core', 'api'], main_branch: 'main' }, null, 2),
      'utf8',
    );
    writeProjectMap(tmpVault, { [tmpProjectDir]: 'test-project' });

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('git-scopes.json (2 scopes)'),
      `Expected "git-scopes.json (2 scopes)" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('warns for invalid (schema-violating) .claude/git-scopes.json', () => {
    tmpVault = makeTempVault();
    tmpProjectDir = mkdtempSync(join(tmpdir(), 'doctor-git-proj-'));
    mkdirSync(join(tmpProjectDir, '.claude'), { recursive: true });
    // version: 99 is unknown — validateScopes returns invalid
    writeFileSync(
      join(tmpProjectDir, '.claude', 'git-scopes.json'),
      JSON.stringify({ version: 99, scopes: [] }),
      'utf8',
    );
    writeProjectMap(tmpVault, { [tmpProjectDir]: 'test-project' });

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('invalid'),
      `Expected "invalid" in stdout.\nGot: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude-dev-stack scopes init'),
      `Expected guidance.\nGot: ${result.stdout}`,
    );
  });

  it('skips gracefully when no project-map.json exists', () => {
    // makeTempVault() does NOT write project-map.json
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('No project-map.json'),
      `Expected "No project-map.json" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('doctor exits 0 even when git-scopes.json is missing', () => {
    tmpVault = makeTempVault();
    tmpProjectDir = mkdtempSync(join(tmpdir(), 'doctor-git-proj-'));
    writeProjectMap(tmpVault, { [tmpProjectDir]: 'test-project' });

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
  });
});

// ── NotebookLM per-project stats + deprecation warning (NBLM-V2-08/D-09) ─────

/**
 * Create a temp bin dir with a notebooklm stub that returns per-project notebooks.
 * The stub handles:
 *   list --json         → { notebooks: [cds__alpha, cds__beta, user-personal] }
 *   source list -n nb-1 → { sources: [5 items] }
 *   source list -n nb-2 → { sources: [3 items] }
 *   auth check          → exit 0
 */
function makePerProjectStubBinDir() {
  const binDir = mkdtempSync(join(tmpdir(), 'doctor-perproject-bin-'));
  const wrapperPath = join(binDir, 'notebooklm');

  const script = `#!/bin/bash
CMD="$1"
SUB="$2"

if [ "$CMD" = "auth" ] && [ "$SUB" = "check" ]; then
  printf '%s\\n' '{"status":"ok","checks":{}}'
  exit 0
fi

if [ "$CMD" = "--version" ] || [ "$CMD" = "version" ]; then
  printf '%s\\n' "NotebookLM CLI, version 0.3.4"
  exit 0
fi

if [ "$CMD" = "list" ]; then
  printf '%s\\n' '{"notebooks":[{"id":"nb-1","title":"cds__alpha","created_at":null},{"id":"nb-2","title":"cds__beta","created_at":null},{"id":"nb-3","title":"user-personal","created_at":null}]}'
  exit 0
fi

if [ "$CMD" = "source" ] && [ "$SUB" = "list" ]; then
  NB_ID="$4"
  if [ "$NB_ID" = "nb-1" ]; then
    printf '%s\\n' '{"sources":[{"id":"s1","title":"t1"},{"id":"s2","title":"t2"},{"id":"s3","title":"t3"},{"id":"s4","title":"t4"},{"id":"s5","title":"t5"}]}'
  elif [ "$NB_ID" = "nb-2" ]; then
    printf '%s\\n' '{"sources":[{"id":"s6","title":"t6"},{"id":"s7","title":"t7"},{"id":"s8","title":"t8"}]}'
  else
    printf '%s\\n' '{"sources":[]}'
  fi
  exit 0
fi

exit 0
`;

  writeFileSync(wrapperPath, script, 'utf8');
  chmodSync(wrapperPath, 0o755);
  return binDir;
}

describe('doctor — per-project NotebookLM stats + NOTEBOOKLM_NOTEBOOK_NAME deprecation (NBLM-V2-08/D-09)', () => {
  let tmpVault = null;
  let tmpBinDir = null;

  afterEach(() => {
    if (tmpVault && existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
    if (tmpBinDir && existsSync(tmpBinDir)) rmSync(tmpBinDir, { recursive: true, force: true });
    // Clean up env var in case a test failed before clearing it
    delete process.env.NOTEBOOKLM_NOTEBOOK_NAME;
    tmpVault = null;
    tmpBinDir = null;
  });

  it('shows "2 notebooks, 8 sources total" when 2 cds__ notebooks have 5 and 3 sources', () => {
    tmpBinDir = makePerProjectStubBinDir();
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('2 notebooks') && result.stdout.includes('8 sources total'),
      `Expected "2 notebooks, 8 sources total" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('shows per-project breakdown lines: "alpha: 5 sources" and "beta: 3 sources"', () => {
    tmpBinDir = makePerProjectStubBinDir();
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('alpha: 5'),
      `Expected "alpha: 5" in stdout.\nGot: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('beta: 3'),
      `Expected "beta: 3" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('emits D-09 deprecation warning when NOTEBOOKLM_NOTEBOOK_NAME is set', () => {
    tmpBinDir = makePerProjectStubBinDir();
    tmpVault = makeTempVault();

    const result = runDoctor({
      stubBinDir: tmpBinDir,
      vaultPath: tmpVault,
      extraEnv: { NOTEBOOKLM_NOTEBOOK_NAME: 'old-name' },
    });

    assert.ok(
      result.stdout.includes('NOTEBOOKLM_NOTEBOOK_NAME is deprecated'),
      `Expected deprecation warning.\nGot: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('Per-project notebooks (cds__{slug}) are now used'),
      `Expected per-project guidance in deprecation warning.\nGot: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('Will be removed in v1.0'),
      `Expected "Will be removed in v1.0" in deprecation warning.\nGot: ${result.stdout}`,
    );
  });

  it('does NOT emit deprecation warning when NOTEBOOKLM_NOTEBOOK_NAME is not set', () => {
    tmpBinDir = makePerProjectStubBinDir();
    tmpVault = makeTempVault();

    // Ensure env var is absent
    const extraEnv = {};
    // Do NOT set NOTEBOOKLM_NOTEBOOK_NAME

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault, extraEnv });

    assert.equal(
      result.stdout.includes('NOTEBOOKLM_NOTEBOOK_NAME is deprecated'),
      false,
      `Did not expect deprecation warning.\nGot: ${result.stdout}`,
    );
  });

  it('skips per-project stats section when notebooklm binary is missing', () => {
    tmpVault = makeTempVault();

    const result = runDoctor({ excludeNblm: true, vaultPath: tmpVault });

    // Should not see stats output (neither "notebooks" count nor "sources total")
    assert.equal(
      result.stdout.includes('sources total'),
      false,
      `Did not expect "sources total" when notebooklm is absent.\nGot: ${result.stdout}`,
    );
    // Should still see the "not installed (optional)" info line
    assert.ok(
      result.stdout.includes('not installed (optional'),
      `Expected "not installed (optional" in stdout.\nGot: ${result.stdout}`,
    );
  });

  it('shows "0 notebooks" when listNotebooks returns no cds__ notebooks', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'doctor-zero-nb-bin-'));
    const wrapperPath = join(binDir, 'notebooklm');
    const zeroScript = `#!/bin/bash
CMD="$1"
SUB="$2"
if [ "$CMD" = "auth" ] && [ "$SUB" = "check" ]; then
  printf '%s\\n' '{"status":"ok","checks":{}}'
  exit 0
fi
if [ "$CMD" = "list" ]; then
  printf '%s\\n' '{"notebooks":[{"id":"nb-x","title":"user-personal","created_at":null}]}'
  exit 0
fi
exit 0
`;
    writeFileSync(wrapperPath, zeroScript, 'utf8');
    chmodSync(wrapperPath, 0o755);
    tmpBinDir = binDir;
    tmpVault = makeTempVault();

    const result = runDoctor({ stubBinDir: tmpBinDir, vaultPath: tmpVault });

    assert.ok(
      result.stdout.includes('notebooks: 0') || result.stdout.includes('0 notebook'),
      `Expected "notebooks: 0" or "0 notebook" in stdout.\nGot: ${result.stdout}`,
    );
  });
});
