// tests/install-permission-config.test.mjs
// Unit tests for lib/install/permission-config.mjs::setupGsdPermissions.
// Source: Phase 40 Plan 03
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupGsdPermissions, GSD_BASH_PATTERNS } from '../lib/install/permission-config.mjs';

describe('setupGsdPermissions', () => {
  let tempProject;

  afterEach(() => {
    if (tempProject) rmSync(tempProject, { recursive: true, force: true });
  });

  it('creates .claude/settings.local.json with all patterns on fresh project', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-perms-'));
    const result = setupGsdPermissions(tempProject);

    expect(result.added.length).toBe(GSD_BASH_PATTERNS.length);
    expect(result.existing.length).toBe(0);

    const settingsPath = join(tempProject, '.claude', 'settings.local.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    for (const p of GSD_BASH_PATTERNS) {
      expect(settings.permissions.allow).toContain(p);
    }
  });

  it('is idempotent — second call adds nothing', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-perms-idempotent-'));
    setupGsdPermissions(tempProject);
    const result = setupGsdPermissions(tempProject);

    expect(result.added.length).toBe(0);
    expect(result.existing.length).toBe(GSD_BASH_PATTERNS.length);
  });

  it('preserves existing custom patterns in settings.local.json', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-perms-custom-'));
    const claudeDir = join(tempProject, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(my-custom:*)'] } }, null, 2),
    );

    setupGsdPermissions(tempProject);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.local.json'), 'utf8'));
    expect(settings.permissions.allow).toContain('Bash(my-custom:*)');
    expect(settings.permissions.allow).toContain('Bash(pnpm:*)');
  });

  it('does not write file if all patterns already present', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-perms-noop-'));
    setupGsdPermissions(tempProject);
    const settingsPath = join(tempProject, '.claude', 'settings.local.json');
    const mtime1 = readFileSync(settingsPath, 'utf8');

    // Small delay to detect mtime change (if file were rewritten)
    setupGsdPermissions(tempProject);
    const mtime2 = readFileSync(settingsPath, 'utf8');

    expect(mtime1).toBe(mtime2);
  });

  it('handles corrupt JSON gracefully — overwrites with valid config', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-perms-corrupt-'));
    const claudeDir = join(tempProject, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.local.json'), '{{{invalid');

    const result = setupGsdPermissions(tempProject);
    expect(result.added.length).toBe(GSD_BASH_PATTERNS.length);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.local.json'), 'utf8'));
    expect(settings.permissions.allow.length).toBe(GSD_BASH_PATTERNS.length);
  });
});
