import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, statSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'session-start-context.sh');

/**
 * Run the SessionStart hook inside a fixture project directory.
 *
 * The hook resolves CURRENT_DIR via `git rev-parse --show-toplevel` with
 * fallback to `pwd`. We initialise a git repo in the fixture so the marker
 * path is deterministic (`$CURRENT_DIR/.claude/.session-loaded`).
 *
 * VAULT_PATH is pointed at a tmp vault WITHOUT a project directory, so
 * the hook early-exits before the context echo block — that's fine, the
 * marker writer runs AFTER the context block and is placed before
 * budget-check. Wait — actually the current hook early-exits at line 43
 * (`exit 0`) if vault project dir is missing, which would prevent marker
 * write. The Phase 28 change places the marker block AFTER the early exit
 * only if it's in the "vault project exists" branch. Per plan D-05, the
 * marker MUST be written unconditionally, so we verify both branches.
 */
describe('session-start-marker (Phase 28 / SSR-01 SC#3)', () => {
  let fixtureRoot;
  let projectDir;
  let vaultDir;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'ssr01-marker-'));
    projectDir = join(fixtureRoot, 'myproject');
    vaultDir = join(fixtureRoot, 'vault');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(vaultDir, { recursive: true });
    // Init git so `git rev-parse --show-toplevel` returns projectDir
    execFileSync('git', ['init', '-q', projectDir]);
    // Create a vault project dir so the hook does NOT early-exit; this
    // mirrors the common case (claude-dev-stack-configured project).
    const vaultProject = join(vaultDir, 'projects', 'myproject');
    mkdirSync(join(vaultProject, 'sessions'), { recursive: true });
    writeFileSync(join(vaultProject, 'context.md'), '# test context\n');
  });

  afterAll(() => {
    if (fixtureRoot && existsSync(fixtureRoot)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  function runHook() {
    // Run hook with clean env so home-dir budget state doesn't leak in
    return execFileSync('bash', [hookPath], {
      cwd: projectDir,
      env: {
        ...process.env,
        VAULT_PATH: vaultDir,
        HOME: fixtureRoot, // isolate ~/.claude budget state
      },
      encoding: 'utf8',
    });
  }

  it('writes .claude/.session-loaded after successful run', () => {
    runHook();
    const marker = join(projectDir, '.claude', '.session-loaded');
    assert.ok(existsSync(marker), 'marker file was not written');
  });

  it('marker content is a single ISO 8601 UTC timestamp', () => {
    const marker = join(projectDir, '.claude', '.session-loaded');
    const raw = readFileSync(marker, 'utf8');
    // Exactly one line (trailing newline allowed)
    const lines = raw.split('\n').filter((l) => l.length > 0);
    assert.equal(lines.length, 1, `expected one non-empty line, got ${lines.length}`);
    assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('marker mtime is within 5 seconds of now', () => {
    const marker = join(projectDir, '.claude', '.session-loaded');
    const nowMs = Date.now();
    const mtimeMs = statSync(marker).mtimeMs;
    const deltaSec = Math.abs(nowMs - mtimeMs) / 1000;
    assert.ok(deltaSec < 5, `marker mtime drift ${deltaSec}s is >= 5s`);
  });

  it('no .session-loaded.tmp leftover in .claude dir', () => {
    const claudeDir = join(projectDir, '.claude');
    const entries = readdirSync(claudeDir);
    assert.ok(
      !entries.includes('.session-loaded.tmp'),
      `temp file leftover: ${entries.join(', ')}`
    );
  });

  it('re-running the hook updates the marker timestamp (atomic rewrite)', async () => {
    const marker = join(projectDir, '.claude', '.session-loaded');
    const firstMtime = statSync(marker).mtimeMs;
    // Wait >=1.1 s so 1-second-resolution mtimes differ on any filesystem
    await new Promise((r) => setTimeout(r, 1100));
    runHook();
    const secondMtime = statSync(marker).mtimeMs;
    assert.ok(secondMtime > firstMtime, 'mtime did not advance on re-run');
  });

  it('hook exits 0 even when .claude dir cannot be created', () => {
    // Create a read-only project dir and run the hook — marker write must
    // fail silently; hook still exits 0.
    const roFixture = mkdtempSync(join(tmpdir(), 'ssr01-ro-'));
    const roProject = join(roFixture, 'ro-project');
    mkdirSync(roProject, { recursive: true });
    execFileSync('git', ['init', '-q', roProject]);
    // Seed a regular file at .claude so mkdir -p fails (can't make dir
    // where file exists). This is the most portable way to force mkdir -p
    // to fail without relying on chmod behavior.
    writeFileSync(join(roProject, '.claude'), 'not-a-dir');
    try {
      const res = execFileSync('bash', [hookPath], {
        cwd: roProject,
        env: { ...process.env, VAULT_PATH: vaultDir, HOME: fixtureRoot },
        encoding: 'utf8',
      });
      // Exit code 0 (execFileSync would throw on non-zero)
      assert.ok(typeof res === 'string');
      assert.ok(!existsSync(join(roProject, '.claude', '.session-loaded')));
    } finally {
      rmSync(roFixture, { recursive: true, force: true });
    }
  });
});
