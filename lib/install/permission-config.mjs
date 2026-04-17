// lib/install/permission-config.mjs — GSD permission allowlist helper
// Source: Phase 40 CONTEXT.md D-128 (doctor), D-129 (wizard)
//
// Writes GSD-required Bash patterns to {projectPath}/.claude/settings.local.json
// (project-scoped — NEVER global ~/.claude/settings.json).
//
// Idempotent: re-running on a project that already has all patterns is a no-op.
// No prompts — pure write-or-skip.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { warn } from '../shared.mjs';

/**
 * Bash patterns required by GSD executor agents under CC 2.1.x.
 * @type {readonly string[]}
 */
export const GSD_BASH_PATTERNS = Object.freeze([
  'Bash(pnpm:*)',
  'Bash(npx:*)',
  'Bash(node:*)',
  'Bash(node --check *)',
  'Bash(git merge-base:*)',
  'Bash(git reset:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git rev-parse:*)',
  'Bash(tsc:*)',
  'Bash(vitest:*)',
]);

/**
 * Idempotently write GSD-required Bash permission patterns to the project's
 * `.claude/settings.local.json`. Creates the file + dir if absent.
 *
 * @param {string} projectPath — absolute path to the project root
 * @returns {{ added: string[], existing: string[] }}
 */
export function setupGsdPermissions(projectPath) {
  const claudeDir = join(projectPath, '.claude');
  const settingsPath = join(claudeDir, 'settings.local.json');
  const result = { added: [], existing: [] };

  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      warn(`${settingsPath} is corrupt JSON — will be overwritten with valid config`);
      settings = {};
    }
  }

  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

  const existing = new Set(settings.permissions.allow);

  for (const pattern of GSD_BASH_PATTERNS) {
    if (existing.has(pattern)) {
      result.existing.push(pattern);
    } else {
      settings.permissions.allow.push(pattern);
      result.added.push(pattern);
    }
  }

  if (result.added.length > 0) {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  return result;
}

/**
 * Detect Claude Code version via `claude --version`.
 * Returns the major version as an integer, or null if CC is not found.
 *
 * @returns {number | null}
 */
export function detectCCMajorVersion() {
  try {
    const r = spawnSync('claude', ['--version'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.status !== 0) return null;
    const match = (r.stdout || '').match(/(\d+)\.\d+/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
