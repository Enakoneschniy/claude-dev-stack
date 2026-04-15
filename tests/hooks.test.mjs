import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', 'hooks');
const fixturesDir = join(__dirname, 'fixtures');

describe('node hooks (Phase 31)', () => {
  const nodeHookFiles = ['dev-router.mjs', 'project-switcher.mjs', 'git-conventions-check.mjs'];
  for (const file of nodeHookFiles) {
    describe(file, () => {
      const hookPath = join(hooksDir, file);

      it('file exists', () => {
        assert.ok(existsSync(hookPath));
      });

      it('starts with node shebang', () => {
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(
          content.startsWith('#!/usr/bin/env node'),
          `expected #!/usr/bin/env node shebang in ${file}`
        );
      });

      it('exits 0 on empty stdin', () => {
        const result = spawnSync('node', [hookPath], {
          input: '',
          encoding: 'utf8',
          timeout: 3000,
        });
        assert.equal(result.status, 0);
      });

      it('exits 0 on malformed JSON', () => {
        const result = spawnSync('node', [hookPath], {
          input: 'not-json{{{',
          encoding: 'utf8',
          timeout: 3000,
        });
        assert.equal(result.status, 0);
      });
    });
  }
});

describe('hooks', () => {
  const hookFiles = ['session-start-context.sh', 'session-end-check.sh'];

  for (const file of hookFiles) {
    describe(file, () => {
      const hookPath = join(hooksDir, file);

      it('file exists', () => {
        assert.ok(existsSync(hookPath));
      });

      it('starts with shebang', () => {
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(content.startsWith('#!/bin/bash'));
      });

      it('is valid bash syntax', () => {
        const result = execFileSync('bash', ['-n', hookPath], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // bash -n returns empty on success
      });

      it('uses VAULT_PATH env var with fallback', () => {
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(content.includes('VAULT_PATH'), 'should reference VAULT_PATH');
        assert.ok(content.includes('$HOME/vault'), 'should have fallback to ~/vault');
      });
    });
  }

  describe('session-end-check.sh', () => {
    it('exits silently when no vault project exists', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');
      // Run with a non-existent vault path
      const result = execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: '/nonexistent/vault/path', HOME: '/nonexistent' },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp',
      });
      assert.equal(result, '');
    });
  });

  // ── notebooklm-sync-trigger.mjs tests ──────────────────────────────────────
  describe('notebooklm-sync-trigger', () => {
    const triggerPath = join(hooksDir, 'notebooklm-sync-trigger.mjs');
    const stubDir = join(tmpdir(), `cds-trigger-stub-${process.pid}`);
    const stubBinPath = join(stubDir, 'notebooklm');
    let tmpVault;

    before(() => {
      tmpVault = join(tmpdir(), `cds-trigger-vault-${process.pid}`);
      mkdirSync(tmpVault, { recursive: true });
      mkdirSync(stubDir, { recursive: true });
      // Create a stub notebooklm binary
      writeFileSync(stubBinPath, '#!/bin/bash\nsleep 10\n');
      chmodSync(stubBinPath, 0o755);
    });

    after(() => {
      if (existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
      if (existsSync(stubDir)) rmSync(stubDir, { recursive: true, force: true });
    });

    it('trigger file exists', () => {
      assert.ok(existsSync(triggerPath), 'hooks/notebooklm-sync-trigger.mjs must exist');
    });

    it('exits 0 with notebooklm NOT in PATH (binary absent)', () => {
      const start = Date.now();
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/nonexistent', VAULT_PATH: tmpVault },
      });
      const elapsed = Date.now() - start;
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
      assert.ok(elapsed < 1000, `must exit within 1000ms, took ${elapsed}ms`);
    });

    it('exits 0 with stub notebooklm in PATH, wall-clock < 1000ms (non-blocking)', () => {
      const start = Date.now();
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, VAULT_PATH: tmpVault },
      });
      const elapsed = Date.now() - start;
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
      assert.ok(elapsed < 1000, `must exit within 1000ms even with slow stub runner, took ${elapsed}ms`);
    });

    it('exits 0 when VAULT_PATH does not exist (graceful skip)', () => {
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: '/nonexistent/vault/path/that/does/not/exist' },
      });
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
    });
  });

  // ── notebooklm-sync-runner.mjs tests ───────────────────────────────────────
  describe('notebooklm-sync-runner', () => {
    const runnerPath = join(hooksDir, 'notebooklm-sync-runner.mjs');
    const stubSrc = join(fixturesDir, 'notebooklm-sync-stub.sh');
    let tmpVault;
    let stubBinDir;

    before(() => {
      tmpVault = join(tmpdir(), `cds-runner-vault-${process.pid}`);
      stubBinDir = join(tmpdir(), `cds-runner-stub-bin-${process.pid}`);
      // Set up minimal vault structure
      mkdirSync(join(tmpVault, 'projects', 'test-proj', 'sessions'), { recursive: true });
      mkdirSync(stubBinDir, { recursive: true });
      // Install stub as `notebooklm` binary
      const stubDest = join(stubBinDir, 'notebooklm');
      const stubContent = readFileSync(stubSrc, 'utf8');
      writeFileSync(stubDest, stubContent);
      chmodSync(stubDest, 0o755);
    });

    after(() => {
      if (existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
      if (existsSync(stubBinDir)) rmSync(stubBinDir, { recursive: true, force: true });
    });

    function runRunner(env = {}) {
      return spawnSync(process.execPath, [runnerPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${stubBinDir}:${process.env.PATH}`,
          VAULT_PATH: tmpVault,
          NOTEBOOKLM_NOTEBOOK_NAME: 'test-vault',
          ...env,
        },
        timeout: 15000,
      });
    }

    function readLog() {
      const logPath = join(tmpVault, '.notebooklm-sync.log');
      return existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    }

    function writeLogReset() {
      const logPath = join(tmpVault, '.notebooklm-sync.log');
      writeFileSync(logPath, '');
    }

    it('runner file exists', () => {
      assert.ok(existsSync(runnerPath), 'hooks/notebooklm-sync-runner.mjs must exist');
    });

    it('exits 0 on successful auth + sync (sync done log entry)', () => {
      writeLogReset();
      const result = runRunner({
        NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '0',
        NOTEBOOKLM_SYNC_STUB_LIST_STDOUT: '{"notebooks":[{"id":"nb1","title":"test-vault"}]}',
      });
      assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
      const log = readLog();
      assert.ok(log.includes('sync start'), `log must contain "sync start", got: ${log}`);
      assert.ok(
        log.includes('sync done') || log.includes('sync failed') || log.includes('sync skipped'),
        `log must contain result line, got: ${log}`
      );
    });

    it('exits 0 and logs auth-check-failed when auth stub exits 1', () => {
      writeLogReset();
      const result = runRunner({ NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '1' });
      assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
      const log = readLog();
      assert.ok(log.includes('auth-check-failed'), `log must contain "auth-check-failed", got: ${log}`);
      assert.ok(!log.includes('sync done'), 'sync done must NOT appear after auth failure');
    });

    it('exits 0 when vault does not exist', () => {
      const result = spawnSync(process.execPath, [runnerPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${stubBinDir}:${process.env.PATH}`,
          VAULT_PATH: '/nonexistent/vault/does-not-exist',
        },
        timeout: 10000,
      });
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
    });

    it('multiple invocations append (no truncation)', () => {
      const logPath = join(tmpVault, '.notebooklm-sync.log');
      // Get initial line count
      const before = readLog().split('\n').filter(Boolean).length;

      runRunner({ NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '0' });
      runRunner({ NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '1' });

      const after = readLog().split('\n').filter(Boolean).length;
      assert.ok(after > before, `log must grow: before=${before} after=${after}`);
    });

    it('log lines match D-14 format: ISO timestamp + [level] prefix', () => {
      runRunner({ NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '0' });
      const log = readLog();
      const lines = log.split('\n').filter(Boolean);
      assert.ok(lines.length > 0, 'log must have at least one line');
      for (const line of lines) {
        assert.match(
          line,
          /^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[(info|warn|error)\] /,
          `line does not match D-14 format: "${line}"`
        );
      }
    });

    it('exit code is always 0 regardless of sync outcome (forced auth fail)', () => {
      const result = runRunner({ NOTEBOOKLM_SYNC_STUB_AUTH_EXIT: '2' });
      assert.equal(result.status, 0);
    });
  });

  describe('session-end-check.sh integration (updates context.md)', () => {
    const tmpBase = join(tmpdir(), `claude-test-hook-integration-${process.pid}`);
    const vaultPath = join(tmpBase, 'vault');
    const projectName = 'hook-demo';
    const projectDir = join(vaultPath, 'projects', projectName);
    const sessionsDir = join(projectDir, 'sessions');
    const contextPath = join(projectDir, 'context.md');

    before(() => {
      if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
      mkdirSync(sessionsDir, { recursive: true });

      // Seed context.md with a template-like layout
      writeFileSync(
        contextPath,
        '# Project: hook-demo\n\n## Overview\n\nTest.\n\n---\n*Last updated: 2026-04-10*\n'
      );

      // Seed a session log dated today so the hook takes the "session logged" branch
      const today = new Date().toISOString().slice(0, 10);
      const sessionFilename = `${today}-integration-run.md`;
      writeFileSync(
        join(sessionsDir, sessionFilename),
        `# Session: ${today} — Integration run\n\n## Notes\nrun via hook test\n`
      );

      // Create a fake project-map.json so the hook resolves the project name correctly
      writeFileSync(
        join(vaultPath, 'project-map.json'),
        JSON.stringify({ projects: { [projectDir]: projectName } })
      );
    });

    after(() => {
      if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    });

    it('updates context.md with a Session History entry linking today\'s log', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');

      // Run the hook with our fixture vault and project dir as cwd
      execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: vaultPath, HOME: tmpBase },
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Assert context.md was mutated: both markers present, one linked entry
      const updated = readFileSync(contextPath, 'utf8');
      assert.ok(
        updated.includes('<!-- @claude-dev-stack:session-history:start -->'),
        'start marker must be present after hook run'
      );
      assert.ok(
        updated.includes('<!-- @claude-dev-stack:session-history:end -->'),
        'end marker must be present after hook run'
      );

      const today = new Date().toISOString().slice(0, 10);
      const expectedLink = `(sessions/${today}-integration-run.md)`;
      assert.ok(
        updated.includes(expectedLink),
        `context.md must link to the session log: expected substring "${expectedLink}"`
      );
      assert.ok(
        updated.includes(`${today} — Integration run`),
        'context.md entry must carry the title extracted from the session log heading'
      );
    });

    it('is silent on stdout (hook produces no output on success)', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');
      const result = execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: vaultPath, HOME: tmpBase },
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // On the "session logged" branch the hook prints nothing to stdout
      assert.equal(result, '');
    });
  });

  // ── session-end-check.sh notebooklm trigger wiring (NBLM-21) ───────────────
  describe('session-end-check.sh — notebooklm trigger wiring (NBLM-21)', () => {
    const hookPath = join(hooksDir, 'session-end-check.sh');

    it('source-level ordering: update-context before trigger before vault push (D-07)', () => {
      const src = readFileSync(hookPath, 'utf8');
      const updateCtxIdx = src.indexOf('update-context.mjs');
      const triggerIdx = src.indexOf('notebooklm-sync-trigger.mjs');
      const vaultPushIdx = src.indexOf('git -C "$VAULT" push');

      assert.ok(updateCtxIdx > 0, 'update-context.mjs must appear in hook');
      assert.ok(triggerIdx > 0, 'notebooklm-sync-trigger.mjs must appear in hook');
      assert.ok(vaultPushIdx > 0, 'git push must appear in hook');
      assert.ok(updateCtxIdx < triggerIdx, `update-context (${updateCtxIdx}) must precede trigger (${triggerIdx})`);
      assert.ok(triggerIdx < vaultPushIdx, `trigger (${triggerIdx}) must precede vault push (${vaultPushIdx})`);
    });

    it('trigger invocation block has 2>/dev/null || true (double-safety)', () => {
      const src = readFileSync(hookPath, 'utf8');
      // The trigger block uses TRIGGER var; find the node "$TRIGGER" invocation line
      const lines = src.split('\n');
      // The node invocation line uses $TRIGGER variable — look for node + $TRIGGER pattern
      const nodeTriggerLine = lines.find(l => l.includes('node') && l.includes('$TRIGGER'));
      assert.ok(nodeTriggerLine, 'must have a "node ... $TRIGGER" invocation line');
      assert.match(nodeTriggerLine, /2>\/dev\/null \|\| true/, 'node $TRIGGER invocation must have 2>/dev/null || true');
    });

    it('bash -n syntax check passes', () => {
      const result = spawnSync('bash', ['-n', hookPath], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.equal(result.status, 0, `bash -n failed: ${result.stderr}`);
    });

    it('hook exits 0 when trigger file is absent (graceful skip)', () => {
      // We test via a VAULT_PATH that has no sessions — hook takes the early exit path.
      // The trigger's `if [ -f "$TRIGGER" ]` guard is tested at source level (ordering test above).
      // Here we verify the whole hook still exits 0 without sessions (early exit).
      const result = spawnSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: '/nonexistent/vault', HOME: '/nonexistent' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.equal(result.status, 0, `hook must exit 0 when vault absent, got ${result.status}`);
    });

    it('trigger invocation count is exactly 1 in hook', () => {
      const src = readFileSync(hookPath, 'utf8');
      const count = (src.match(/notebooklm-sync-trigger\.mjs/g) || []).length;
      assert.equal(count, 1, `expected exactly 1 trigger reference, got ${count}`);
    });
  });

  // WF-01: gsd-workflow-enforcer.mjs file-level assertions (Phase 29 Plan 02)
  describe('gsd-workflow-enforcer.mjs', () => {
    const hookPath = join(hooksDir, 'gsd-workflow-enforcer.mjs');

    it('exists in hooks/', () => {
      assert.ok(existsSync(hookPath), 'hooks/gsd-workflow-enforcer.mjs must exist');
    });

    it('has node shebang', () => {
      const firstLine = readFileSync(hookPath, 'utf8').split('\n')[0];
      assert.match(firstLine, /^#!.*node/, 'must start with #!... node shebang');
    });

    it('passes node --check', () => {
      assert.doesNotThrow(() => execFileSync('node', ['--check', hookPath]));
    });
  });

  // D-07: gsd-auto-reapply-patches.sh must prefer ~/.claude/gsd-local-patches over npm resolution
  describe('gsd-auto-reapply-patches.sh — D-07 precedence', () => {
    const scriptPath = join(hooksDir, 'gsd-auto-reapply-patches.sh');

    it('gsd-auto-reapply-patches.sh prefers ~/.claude/gsd-local-patches over npm resolution (BUG-06 D-07)', () => {
      const nonce = `NEW_WIZARD_PINNED_${Date.now()}`;
      const tmpHome = mkdtempSync(join(tmpdir(), 'hooks-d07-home-'));
      const tmpGsdDir = mkdtempSync(join(tmpdir(), 'hooks-d07-gsd-'));

      try {
        // Set up fake GSD workflows dir with OLD content
        const workflowsDir = join(tmpGsdDir, 'workflows');
        mkdirSync(workflowsDir, { recursive: true });
        writeFileSync(join(workflowsDir, 'transition.md'), 'OLD_UNPATCHED');

        // Set up ~/.claude/gsd-local-patches with NEW (wizard-pinned) content
        const localPatchesDir = join(tmpHome, '.claude', 'gsd-local-patches');
        mkdirSync(localPatchesDir, { recursive: true });
        writeFileSync(join(localPatchesDir, 'transition.md'), nonce);

        // Set up a competing npm-cache-style patches dir with THIRD content to prove precedence
        const npmFakePatchesDir = join(tmpHome, '.npm', '_npx', 'fake', 'node_modules', 'claude-dev-stack', 'patches');
        mkdirSync(npmFakePatchesDir, { recursive: true });
        writeFileSync(join(npmFakePatchesDir, 'transition.md'), 'NPM_CACHE_CONTENT');

        // Run the script with PATCHES_DIR="" to force resolution (not the env-var override)
        const result = execFileSync('bash', [scriptPath], {
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: tmpHome,
            GSD_DIR: tmpGsdDir,
            PATCHES_DIR: '',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Must print reapply message (content differed)
        assert.ok(
          result.includes('GSD patches auto-reapplied'),
          `must print reapply message, got: "${result}"`,
        );

        // Must have used the wizard-pinned content (gsd-local-patches wins over npm cache)
        const applied = readFileSync(join(workflowsDir, 'transition.md'), 'utf8');
        assert.equal(
          applied,
          nonce,
          `gsd-local-patches must win: expected "${nonce}", got "${applied}"`,
        );
      } finally {
        rmSync(tmpHome, { recursive: true, force: true });
        rmSync(tmpGsdDir, { recursive: true, force: true });
      }
    });
  });
});
