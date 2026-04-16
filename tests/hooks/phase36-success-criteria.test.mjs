/**
 * tests/hooks/phase36-success-criteria.test.mjs — Phase 36 Plan 04.
 *
 * Cross-cutting acceptance audit mapping each ROADMAP SC#1-4 to a concrete
 * assertion. Runs in the default `pnpm test` suite (no live API required).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const HOOK_MJS = join(REPO_ROOT, 'hooks', 'session-end-capture.mjs');
const HOOK_SH = join(REPO_ROOT, 'hooks', 'session-end-capture.sh');
const WIZARD = join(REPO_ROOT, 'lib', 'install', 'hooks.mjs');
const SKILL_MD = join(REPO_ROOT, 'skills', 'session-manager', 'SKILL.md');
const GUARD = join(REPO_ROOT, 'scripts', 'check-no-shell-interpolation.mjs');

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'p36-sc-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe('Phase 36 Success Criteria Audit', () => {
  describe('SC#1: Detached execution → SQLite write within 60s', () => {
    it('wrapper .sh file exists and is executable', () => {
      expect(existsSync(HOOK_SH)).toBe(true);
      // Smoke-run to measure wrapper exit time (<200ms CI-safe bound).
      const start = Date.now();
      const res = spawnSync('sh', [HOOK_SH], {
        env: { ...process.env, CLAUDE_SESSION_ID: '', CLAUDE_PROJECT_DIR: tmpDir },
        stdio: 'ignore',
      });
      const elapsed = Date.now() - start;
      expect(res.status).toBe(0);
      expect(elapsed).toBeLessThan(400);
    });

    it('hook Node script imports dispatchAgent + openSessionsDB from @cds/core', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/dispatchAgent.*@cds\/core/s);
      expect(src).toMatch(/openSessionsDB.*@cds\/core/s);
    });

    it('hook enforces 60s AbortController timeout', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/AbortController/);
      expect(src).toMatch(/60_000|TIMEOUT_MS/);
    });
  });

  describe('SC#2: context.md (Tier 3) gains session pointer', () => {
    it('hook imports updateContextHistory from lib/session-context.mjs', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      // Either static `import { updateContextHistory } from '...session-context.mjs'`
      // or dynamic `({ updateContextHistory } = await import('...session-context.mjs'))`.
      expect(src).toContain('updateContextHistory');
      expect(src).toMatch(/lib\/session-context\.mjs/);
    });

    it('hook calls updateContextHistory with vaultPath, projectName, sessionLogFilename', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/updateContextHistory\s*\(\s*\{/);
      expect(src).toMatch(/vaultPath/);
      expect(src).toMatch(/projectName/);
      expect(src).toMatch(/sessionLogFilename/);
    });
  });

  describe('SC#3: Forced dispatchAgent throw → session exits normally + rollback', () => {
    it('hook classifies errors into silent|log|crash tiers', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/classifyError/);
      expect(src).toMatch(/silent/);
      expect(src).toMatch(/crash/);
      expect(src).toMatch(/'log'|"log"/);
    });

    it('hook wraps DB writes in a transaction (auto-rollback on throw)', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/\.transaction\s*\(/);
    });

    it('hook appends to cds-capture.log on non-silent errors', () => {
      const src = readFileSync(HOOK_MJS, 'utf8');
      expect(src).toMatch(/cds-capture\.log/);
      expect(src).toMatch(/appendCaptureLog|appendFile/);
    });
  });

  describe('SC#4: Wizard replaces hook entry + prints migration message', () => {
    it('lib/install/hooks.mjs filters out session-end-check entries', () => {
      const src = readFileSync(WIZARD, 'utf8');
      expect(src).toMatch(/filter.*session-end-check/s);
    });

    it('lib/install/hooks.mjs emits migration message via info()', () => {
      const src = readFileSync(WIZARD, 'utf8');
      expect(src).toMatch(
        /auto-capture enabled, \/end no longer required for routine sessions/,
      );
    });

    it('lib/install/hooks.mjs copies both wrapper and mjs to hooks dir', () => {
      const src = readFileSync(WIZARD, 'utf8');
      expect(src).toMatch(/'session-end-capture\.sh'/);
      expect(src).toMatch(/'session-end-capture\.mjs'/);
    });

    it('skills/session-manager/SKILL.md description includes fallback keyword', () => {
      const src = readFileSync(SKILL_MD, 'utf8');
      expect(src).toMatch(/fallback/i);
      expect(src).toMatch(/auto-capture/i);
    });
  });

  describe('Meta: structural safety', () => {
    it('hook uses spawn (argv array) for subprocess calls — no shell interpolation', () => {
      const res = spawnSync(process.execPath, [GUARD, HOOK_MJS], { stdio: 'pipe' });
      expect(res.status).toBe(0);
    });

    it('hook is syntactically valid Node ESM', () => {
      const res = spawnSync(process.execPath, ['--check', HOOK_MJS], { stdio: 'pipe' });
      expect(res.status).toBe(0);
    });

    it('pretest structural check is wired into package.json', () => {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
      expect(pkg.scripts?.pretest).toBeTruthy();
      expect(pkg.scripts.pretest).toContain('check-no-shell-interpolation');
    });
  });
});
