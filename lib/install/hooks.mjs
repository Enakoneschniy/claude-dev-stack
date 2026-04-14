// lib/install/hooks.mjs — Session hook installation wizard step

import { existsSync, readFileSync, writeFileSync, cpSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, warn, info, step, mkdirp } from '../shared.mjs';

// ── Install session hooks ───────────────────────────────────────
// BUG-01/02: Writes hooks + permissions.allow to each project's .claude/settings.json
// so session hooks only fire for projects configured via claude-dev-stack.
// Global ~/.claude/settings.json is never written — existing global hooks untouched.
export function installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath, projectsData) {
  const hooksDir = join(homedir(), '.claude', 'hooks');
  mkdirp(hooksDir);

  // BUG-06 D-07: Copy shipped patches/ to ~/.claude/gsd-local-patches/ so
  // gsd-auto-reapply-patches.sh has a version-pinned, wizard-authoritative source
  // that survives /gsd-update and does not depend on npm cache layout.
  const patchesSrc = join(pkgRoot, 'patches');
  const patchesDest = join(homedir(), '.claude', 'gsd-local-patches');
  if (existsSync(patchesSrc)) {
    mkdirp(patchesDest);
    cpSync(patchesSrc, patchesDest, { recursive: true });
  }

  const startDest = join(hooksDir, 'session-start-context.sh');
  const endDest = join(hooksDir, 'session-end-check.sh');
  const pushDest = join(hooksDir, 'vault-auto-push.sh');

  // Copy hook scripts to shared ~/.claude/hooks/ directory
  for (const name of ['session-start-context.sh', 'session-end-check.sh', 'vault-auto-push.sh', 'gsd-auto-reapply-patches.sh', 'budget-check.mjs', 'budget-reset.mjs', 'budget-check-status.mjs']) {
    const src = join(pkgRoot, 'hooks', name);
    const dest = join(hooksDir, name);
    if (existsSync(src)) {
      cpSync(src, dest);
      try { chmodSync(dest, 0o755); } catch (err) { warn(`Could not set executable bit on ${dest}: ${err.message}`); }
    }
  }

  // Copy supporting scripts used by session-end-check.sh (FIX-04)
  for (const file of ['notebooklm-sync-trigger.mjs', 'notebooklm-sync-runner.mjs', 'update-context.mjs']) {
    const src = join(pkgRoot, 'hooks', file);
    const dest = join(hooksDir, file);
    if (existsSync(src)) cpSync(src, dest);
  }

  // Copy budget lib so budget hooks can resolve imports from ~/.claude/hooks/
  // Hooks try ../lib/ (source) then ./lib/ (installed) — this ensures the latter works
  const budgetLibSrc = join(pkgRoot, 'lib', 'budget.mjs');
  if (existsSync(budgetLibSrc)) {
    const libDir = join(hooksDir, 'lib');
    mkdirp(libDir);
    cpSync(budgetLibSrc, join(libDir, 'budget.mjs'));
  }

  // Determine which project directories to configure
  const projects = (projectsData?.projects || []).filter(p => p.path && existsSync(p.path));

  if (projects.length === 0) {
    warn('No project directories found — writing hooks to global ~/.claude/settings.json as fallback');
    _writeSettingsFile(join(homedir(), '.claude', 'settings.json'), startDest, endDest, pushDest, vaultPath);
    return;
  }

  for (const project of projects) {
    const projectClaudeDir = join(project.path, '.claude');
    mkdirp(projectClaudeDir);
    const settingsPath = join(projectClaudeDir, 'settings.json');
    _writeSettingsFile(settingsPath, startDest, endDest, pushDest, vaultPath);
    ok(`Hooks configured for ${c.cyan}${project.name}${c.reset} → ${c.dim}${settingsPath.replace(homedir(), '~')}${c.reset}`);
  }
}

// ── Write hooks + permissions.allow to a settings.json file ─────────
function _writeSettingsFile(settingsPath, startDest, endDest, pushDest, vaultPath) {
  const hooksDir = join(homedir(), '.claude', 'hooks');
  let settings = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      warn(`settings.json is corrupt or invalid JSON — skipping hook installation`);
      return;
    }
  }

  if (!settings.hooks) settings.hooks = {};
  let changed = false;

  // Hook 1: SessionStart — load project context from vault
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const hasStart = settings.hooks.SessionStart.some(entry =>
    entry.hooks?.some(h => h.command?.includes('session-start-context'))
  );
  if (!hasStart) {
    settings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: `bash ${startDest}` }],
    });
    changed = true;
  }

  // Hook 2: Stop — remind to log session
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  const hasEnd = settings.hooks.Stop.some(entry =>
    entry.hooks?.some(h => h.command?.includes('session-end-check'))
  );
  if (!hasEnd) {
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: `bash ${endDest}`, timeout: 5 }],
    });
    changed = true;
  }

  // Hook 3: PostToolUse (Write|Edit) — auto-push vault on changes
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const hasPush = settings.hooks.PostToolUse.some(entry =>
    entry.hooks?.some(h => h.command?.includes('vault-auto-push'))
  );
  if (!hasPush) {
    settings.hooks.PostToolUse.push({
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: `bash ${pushDest}`, timeout: 10 }],
    });
    changed = true;
  }

  // Hook 4: SessionStart — reset budget warning state for new session
  const budgetResetDest = join(hooksDir, 'budget-reset.mjs');
  if (existsSync(budgetResetDest)) {
    const hasBudgetReset = settings.hooks.SessionStart.some(entry =>
      entry.hooks?.some(h => h.command?.includes('budget-reset'))
    );
    if (!hasBudgetReset) {
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: `node ${budgetResetDest}`, timeout: 5 }],
      });
      changed = true;
    }
  }

  // Hook 5: PostToolUse — budget detection (warns when context usage crosses threshold)
  const budgetCheckDest = join(hooksDir, 'budget-check.mjs');
  if (existsSync(budgetCheckDest)) {
    const hasBudgetCheck = settings.hooks.PostToolUse.some(entry =>
      entry.hooks?.some(h => h.command?.includes('budget-check'))
    );
    if (!hasBudgetCheck) {
      settings.hooks.PostToolUse.push({
        matcher: 'Bash|Edit|Write|MultiEdit|Agent|Task',
        hooks: [{ type: 'command', command: `node ${budgetCheckDest}`, timeout: 5 }],
      });
      changed = true;
    }
  }

  // BUG-02: permissions.allow — read ops, vault write, safe bash
  // Claude Code uses "permissions.allow" (NOT "allowedTools" — v0.11 DX-01 bug)
  if (vaultPath) {
    if (!settings.permissions) settings.permissions = {};
    if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

    const patterns = [
      'Read',
      'Glob',
      'Grep',
      `Write(${vaultPath}/**/sessions/*.md)`,
      `Read(~/.claude/**)`,
      'Bash(git status)',
      'Bash(git branch *)',
      'Bash(git log *)',
      'Bash(git diff *)',
      'Bash(git remote *)',
      'Bash(ls *)',
      'Bash(cat *)',
      'Bash(node *)',
      'Bash(npm test*)',
    ];

    for (const pattern of patterns) {
      if (!settings.permissions.allow.includes(pattern)) {
        settings.permissions.allow.push(pattern);
        changed = true;
      }
    }
  }

  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
}
