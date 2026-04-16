/**
 * tests/install/hooks-migration.test.mjs — Phase 36 Plan 03 wizard regression tests.
 *
 * Verifies:
 *   - 'replaces': wizard removes session-end-check entries and adds session-end-capture
 *   - 'idempotent': re-running wizard produces no diff
 *   - 'custom-preserved': wizard preserves user-added Stop hooks + warns
 *   - 'executable-bit': session-end-capture.sh is chmod 0o755 after install
 *   - 'migration-message': wizard prints the D-68 info message on first migration
 *
 * Strategy: point HOME at a tmp dir, synthesize a minimal pkgRoot with only
 * the hook files installSessionHook copies, run the real installSessionHook
 * against a synthetic project, inspect .claude/settings.json.
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  statSync,
  existsSync,
} from 'node:fs';
import { tmpdir, homedir as osHomedir } from 'node:os';
import { join } from 'node:path';
import { installSessionHook } from '../../lib/install/hooks.mjs';

// ─── setup ─────────────────────────────────────────────────────────
let tmpDir;
let projectDir;
let pkgRoot;
let fakeHome;
let origHome;

const ALL_HOOK_FILES = [
  // executable loop
  'session-start-context.sh',
  'session-end-check.sh',
  'session-end-capture.sh',
  'vault-auto-push.sh',
  'gsd-auto-reapply-patches.sh',
  'budget-check.mjs',
  'budget-reset.mjs',
  'budget-check-status.mjs',
  'gsd-workflow-enforcer.mjs',
  'dev-router.mjs',
  'project-switcher.mjs',
  'git-conventions-check.mjs',
  'idea-capture-trigger.mjs',
  // support loop (no chmod)
  'notebooklm-sync-trigger.mjs',
  'notebooklm-sync-runner.mjs',
  'update-context.mjs',
  'session-end-capture.mjs',
  'idea-capture-triggers.json',
];

function stubAllHookFiles(root) {
  const hooksSrc = join(root, 'hooks');
  mkdirSync(hooksSrc, { recursive: true });
  for (const name of ALL_HOOK_FILES) {
    const content = name.endsWith('.sh')
      ? '#!/bin/sh\nexit 0\n'
      : name.endsWith('.json')
        ? '{}\n'
        : '// stub\n';
    writeFileSync(join(hooksSrc, name), content);
  }
  // Stub lib/budget.mjs that installSessionHook copies.
  const libDir = join(root, 'lib');
  mkdirSync(libDir, { recursive: true });
  writeFileSync(join(libDir, 'budget.mjs'), 'export default {};\n');
  // Empty patches/ dir so the copy path exists without patching anything.
  mkdirSync(join(root, 'patches'), { recursive: true });
}

beforeEach(() => {
  origHome = process.env.HOME;
  tmpDir = mkdtempSync(join(tmpdir(), 'p36-wizard-'));
  fakeHome = join(tmpDir, 'home');
  mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;
  projectDir = join(tmpDir, 'project');
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
  pkgRoot = join(tmpDir, 'pkg');
  stubAllHookFiles(pkgRoot);
});

afterEach(() => {
  if (origHome !== undefined) process.env.HOME = origHome;
  else delete process.env.HOME;
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function runWizard() {
  installSessionHook(1, 1, pkgRoot, join(fakeHome, 'vault'), {
    projects: [{ name: 'proj', path: projectDir }],
  });
}

function readSettings() {
  const p = join(projectDir, '.claude', 'settings.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ─── tests ─────────────────────────────────────────────────────────

describe('wizard Phase 36 migration — replaces session-end-check with session-end-capture', () => {
  it('replaces legacy entry and adds new session-end-capture entry', () => {
    const legacyPath = join(fakeHome, '.claude', 'hooks', 'session-end-check.sh');
    writeFileSync(
      join(projectDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: `bash ${legacyPath}`, timeout: 5 }],
            },
          ],
        },
      }),
    );

    runWizard();

    const settings = readSettings();
    const stop = settings.hooks?.Stop ?? [];
    expect(stop).toHaveLength(1);
    const cmd = stop[0].hooks[0].command;
    expect(cmd).toContain('session-end-capture.sh');
    expect(cmd).not.toContain('session-end-check');
  });
});

describe('wizard — idempotent re-run produces no diff', () => {
  it('second run does not mutate settings.json or add duplicates', () => {
    runWizard();
    const first = JSON.parse(
      readFileSync(join(projectDir, '.claude', 'settings.json'), 'utf8'),
    );
    runWizard();
    const second = JSON.parse(
      readFileSync(join(projectDir, '.claude', 'settings.json'), 'utf8'),
    );
    expect(second).toEqual(first);
    // Only one session-end-capture entry
    const count = (second.hooks.Stop ?? []).filter((e) =>
      e.hooks?.some((h) => h.command?.includes('session-end-capture.sh')),
    ).length;
    expect(count).toBe(1);
  });
});

describe('wizard — custom-preserved: preserves user-authored Stop hooks', () => {
  it('keeps custom Stop entry + drops legacy session-end-check + adds capture', () => {
    writeFileSync(
      join(projectDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'bash ~/my-custom-hook.sh', timeout: 5 }],
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: `bash ${join(fakeHome, '.claude', 'hooks', 'session-end-check.sh')}`,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
    );

    runWizard();

    const stop = readSettings().hooks.Stop;
    expect(stop).toHaveLength(2);
    // Custom entry preserved
    const customKept = stop.some((e) =>
      e.hooks?.some((h) => h.command?.includes('my-custom-hook.sh')),
    );
    expect(customKept).toBe(true);
    // Legacy session-end-check removed
    const legacyGone = !stop.some((e) =>
      e.hooks?.some((h) => h.command?.includes('session-end-check')),
    );
    expect(legacyGone).toBe(true);
    // New session-end-capture added
    const captureAdded = stop.some((e) =>
      e.hooks?.some((h) => h.command?.includes('session-end-capture.sh')),
    );
    expect(captureAdded).toBe(true);
  });
});

describe('wizard — executable-bit: session-end-capture.sh is chmod 0o755', () => {
  it('installs the wrapper with execute permissions', () => {
    runWizard();
    const wrapper = join(fakeHome, '.claude', 'hooks', 'session-end-capture.sh');
    expect(existsSync(wrapper)).toBe(true);
    const mode = statSync(wrapper).mode & 0o777;
    // At minimum, owner execute bit must be set.
    expect(mode & 0o100).not.toBe(0);
  });

  it('installs the .mjs Node-logic file alongside the wrapper', () => {
    runWizard();
    const mjs = join(fakeHome, '.claude', 'hooks', 'session-end-capture.mjs');
    expect(existsSync(mjs)).toBe(true);
  });
});

describe('wizard — migration-message: prints the D-68 info line on first migration', () => {
  it('emits `auto-capture enabled, /end no longer required` exactly once', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runWizard();
      const calls = logSpy.mock.calls
        .map((args) => args.join(' '))
        .filter((line) => /auto-capture enabled/.test(line));
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]).toContain('auto-capture enabled, /end no longer required for routine sessions');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('does NOT emit the migration message on a second idempotent run', () => {
    runWizard(); // first migration emits
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      runWizard();
      const calls = logSpy.mock.calls
        .map((args) => args.join(' '))
        .filter((line) => /auto-capture enabled/.test(line));
      expect(calls.length).toBe(0);
    } finally {
      logSpy.mockRestore();
    }
  });
});
