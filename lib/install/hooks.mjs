// lib/install/hooks.mjs — Session hook installation wizard step

import { existsSync, readFileSync, writeFileSync, cpSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import prompts from 'prompts';
import { c, ok, warn, info, step, mkdirp } from '../shared.mjs';

// SSR-01 (Phase 28): ensure `.claude/.session-loaded` is gitignored in each
// configured project. Idempotent — re-running the wizard never produces
// duplicate entries. Returns true if a change was written, false if the
// line was already present.
export function addSessionMarkerToGitignore(projectPath) {
  const gitignorePath = join(projectPath, '.gitignore');
  const marker = '.claude/.session-loaded';
  let content = '';
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines.some((l) => l.trim() === marker)) return false;
  }
  const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
  const addition =
    (needsLeadingNewline ? '\n' : '') +
    (content.length > 0 ? '\n' : '') +
    '# claude-dev-stack: session marker (Phase 28)\n' +
    marker + '\n';
  writeFileSync(gitignorePath, content + addition);
  return true;
}

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
  const endCaptureDest = join(hooksDir, 'session-end-capture.sh');
  const pushDest = join(hooksDir, 'vault-auto-push.sh');

  // Copy hook scripts to shared ~/.claude/hooks/ directory
  // `session-end-check.sh` stays listed — legacy users who haven't re-run the
  // wizard yet may still reference it from their settings.json until migration.
  // `session-end-capture.sh` is the Phase 36 replacement (D-68).
  for (const name of ['session-start-context.sh', 'session-end-check.sh', 'session-end-capture.sh', 'vault-auto-push.sh', 'gsd-auto-reapply-patches.sh', 'budget-check.mjs', 'budget-reset.mjs', 'budget-check-status.mjs', 'gsd-workflow-enforcer.mjs', 'dev-router.mjs', 'project-switcher.mjs', 'git-conventions-check.mjs', 'idea-capture-trigger.mjs']) {
    const src = join(pkgRoot, 'hooks', name);
    const dest = join(hooksDir, name);
    if (existsSync(src)) {
      cpSync(src, dest);
      try { chmodSync(dest, 0o755); } catch (err) { warn(`Could not set executable bit on ${dest}: ${err.message}`); }
    }
  }

  // Copy supporting scripts (no chmod — invoked via `node ...`).
  // Phase 36: `session-end-capture.mjs` is the Node logic invoked by the
  // `.sh` wrapper above; it must live alongside it in ~/.claude/hooks/.
  for (const file of ['notebooklm-sync-trigger.mjs', 'notebooklm-sync-runner.mjs', 'update-context.mjs', 'session-end-capture.mjs', 'idea-capture-triggers.json']) {
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
    _writeSettingsFile(join(homedir(), '.claude', 'settings.json'), startDest, endDest, endCaptureDest, pushDest, vaultPath);
    return;
  }

  for (const project of projects) {
    const projectClaudeDir = join(project.path, '.claude');
    mkdirp(projectClaudeDir);
    const settingsPath = join(projectClaudeDir, 'settings.json');
    _writeSettingsFile(settingsPath, startDest, endDest, endCaptureDest, pushDest, vaultPath);
    ok(`Hooks configured for ${c.cyan}${project.name}${c.reset} → ${c.dim}${settingsPath.replace(homedir(), '~')}${c.reset}`);

    // SSR-01 (Phase 28): keep the session marker out of git
    try {
      addSessionMarkerToGitignore(project.path);
    } catch (err) {
      warn(`Could not update .gitignore for ${project.name}: ${err.message}`);
    }
  }
}

// ── Write hooks + permissions.allow to a settings.json file ─────────
// Phase 36 D-68: `endCaptureDest` (session-end-capture.sh wrapper) replaces
// `endDest` (legacy session-end-check.sh) in the Stop hook list. `endDest`
// stays in the signature so the removal loop can identify + filter out
// any pre-existing legacy entries in user settings.json files.
function _writeSettingsFile(settingsPath, startDest, endDest, endCaptureDest, pushDest, vaultPath) {
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

  // Hook 2: Stop — Phase 36 auto-capture (replaces legacy session-end-check.sh per D-68)
  if (!settings.hooks.Stop) settings.hooks.Stop = [];

  const captureAlready = settings.hooks.Stop.some((entry) =>
    entry.hooks?.some((h) => h.command?.includes('session-end-capture.sh')),
  );

  if (!captureAlready) {
    // D-68: Remove any legacy session-end-check entries before adding the new hook.
    const beforeCount = settings.hooks.Stop.length;
    settings.hooks.Stop = settings.hooks.Stop.filter((entry) =>
      !entry.hooks?.some((h) => h.command?.includes('session-end-check')),
    );
    if (settings.hooks.Stop.length < beforeCount) changed = true;

    // D-69: Detect non-CDS Stop entries and preserve them with a warning.
    const customStop = settings.hooks.Stop.filter((entry) =>
      entry.hooks?.every(
        (h) =>
          !h.command?.includes('session-end-capture') &&
          !h.command?.includes('session-end-check'),
      ),
    );
    if (customStop.length > 0) {
      warn(
        `Custom Stop hooks detected in ${settingsPath.replace(homedir(), '~')} — ` +
          `auto-capture added alongside. Review for conflicts.`,
      );
    }

    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: `bash ${endCaptureDest}`, timeout: 5 }],
    });
    changed = true;
    info('auto-capture enabled, /end no longer required for routine sessions');
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

  // Hook 8: PostToolUse Skill → gsd-workflow-enforcer (WF-01)
  // Fires after gsd-plan-phase completes; emits NEXT directive when 2+
  // pending phases still need planning, preventing premature
  // /gsd-execute-phase suggestion mid-batch.
  const workflowEnforcerDest = join(hooksDir, 'gsd-workflow-enforcer.mjs');
  if (existsSync(workflowEnforcerDest)) {
    if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
    const hasEnforcer = settings.hooks.PostToolUse.some(entry =>
      entry.hooks?.some(h => h.command?.includes('gsd-workflow-enforcer'))
    );
    if (!hasEnforcer) {
      settings.hooks.PostToolUse.push({
        matcher: 'Skill',
        hooks: [{ type: 'command', command: `node ${workflowEnforcerDest}`, timeout: 10 }],
      });
      changed = true;
    }
  }

  // ── Phase 31 SKL-01: UserPromptSubmit dev-router ──────────────────
  const devRouterDest = join(hooksDir, 'dev-router.mjs');
  if (existsSync(devRouterDest)) {
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const has = settings.hooks.UserPromptSubmit.some(entry =>
      entry.hooks?.some(h => h.command?.includes('dev-router'))
    );
    if (!has) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: 'command', command: `node ${devRouterDest}`, timeout: 5 }],
      });
      changed = true;
    }
  }

  // ── Phase 31 SKL-03: UserPromptSubmit project-switcher ────────────
  const projSwitchDest = join(hooksDir, 'project-switcher.mjs');
  if (existsSync(projSwitchDest)) {
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const has = settings.hooks.UserPromptSubmit.some(entry =>
      entry.hooks?.some(h => h.command?.includes('project-switcher'))
    );
    if (!has) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: 'command', command: `node ${projSwitchDest}`, timeout: 5 }],
      });
      changed = true;
    }
  }

  // ── Phase 32 CAPTURE-01: UserPromptSubmit idea-capture-trigger ─────
  const ideaCaptureDest = join(hooksDir, 'idea-capture-trigger.mjs');
  if (existsSync(ideaCaptureDest)) {
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const has = settings.hooks.UserPromptSubmit.some(entry =>
      entry.hooks?.some(h => h.command?.includes('idea-capture-trigger'))
    );
    if (!has) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: 'command', command: `node ${ideaCaptureDest}`, timeout: 5 }],
      });
      changed = true;
    }
  }

  // ── Phase 31 SKL-04: PreToolUse Bash(git commit*) ────────────────
  const gitConvDest = join(hooksDir, 'git-conventions-check.mjs');
  if (existsSync(gitConvDest)) {
    if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
    const has = settings.hooks.PreToolUse.some(entry =>
      entry.hooks?.some(h => h.command?.includes('git-conventions-check'))
    );
    if (!has) {
      settings.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [{
          type: 'command',
          command: `node ${gitConvDest}`,
          timeout: 5,
          if: 'Bash(git commit*)',
        }],
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

// ── Phase 39 D-121: Stop-hook migration with user confirmation ──────────
// Pure helper that mutates an in-memory settings.json object — used by
// tests/install-hook-migration.test.mjs and reusable from the wizard when
// re-installing on already-configured projects.
//
// Behavior matrix (Phase 36 D-69 + Phase 39 D-121):
//   - hasNewHook && !hasOldHook         -> noop (idempotent)
//   - hasOldHook                        -> prompt; on accept migrate, on decline skip
//   - customHooks present, no CDS hook  -> warn + add capture.sh alongside
//   - fresh (no Stop hooks)             -> add capture.sh
export async function registerCaptureHook(projectPath, settings) {
  if (!settings.hooks) settings.hooks = {};
  const stopList = settings.hooks.Stop ?? [];

  const isOld = (entry) =>
    (entry?.hooks ?? []).some((h) => /session-end-check\.sh/.test(h?.command ?? ''));
  const isNew = (entry) =>
    (entry?.hooks ?? []).some((h) => /session-end-capture\.sh/.test(h?.command ?? ''));
  const isCustom = (entry) => !isOld(entry) && !isNew(entry);

  const hasOldHook = stopList.some(isOld);
  const hasNewHook = stopList.some(isNew);
  const customHooks = stopList.filter(isCustom);

  if (hasNewHook && !hasOldHook) {
    return { action: 'noop', project: projectPath };
  }

  if (hasOldHook) {
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: `Replace legacy session-end-check.sh with auto-capture in ${projectPath}?`,
      initial: true,
    });
    if (!proceed) {
      return { action: 'skipped', project: projectPath };
    }
  }

  if (customHooks.length > 0) {
    console.warn(
      `  \x1b[33mℹ Custom Stop hooks detected in ${projectPath}/.claude/settings.json — auto-capture will be added alongside. Review for conflicts.\x1b[0m`,
    );
  }

  const captureEntry = {
    matcher: '*',
    hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-capture.sh' }],
  };
  settings.hooks.Stop = [...customHooks, captureEntry];

  return { action: hasOldHook ? 'migrated' : 'added', project: projectPath };
}
