// lib/install/hooks.mjs — Session hook installation wizard step

import { existsSync, readFileSync, writeFileSync, cpSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, warn, info, step, mkdirp } from '../shared.mjs';

// ── Install session hooks ───────────────────────────────────────
export function installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath) {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      warn(`settings.json is corrupt or invalid JSON — skipping hook installation`);
      return;
    }
  }

  const hooksDir = join(homedir(), '.claude', 'hooks');
  mkdirp(hooksDir);

  if (!settings.hooks) settings.hooks = {};
  let changed = false;

  // Hook 1: SessionStart — load project context from vault
  const startSrc = join(pkgRoot, 'hooks', 'session-start-context.sh');
  const startDest = join(hooksDir, 'session-start-context.sh');

  if (existsSync(startSrc)) {
    cpSync(startSrc, startDest);
    try { chmodSync(startDest, 0o755); } catch {}
  }

  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const hasStart = settings.hooks.SessionStart.some(entry =>
    entry.hooks?.some(h => h.command?.includes('session-start-context'))
  );

  if (!hasStart) {
    settings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: `bash ${startDest}` }],
    });
    ok('Session start hook installed (auto-loads project context)');
    changed = true;
  }

  // Hook 2: Stop — remind to log session
  const endSrc = join(pkgRoot, 'hooks', 'session-end-check.sh');
  const endDest = join(hooksDir, 'session-end-check.sh');

  if (existsSync(endSrc)) {
    cpSync(endSrc, endDest);
    try { chmodSync(endDest, 0o755); } catch {}
  }

  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  const hasEnd = settings.hooks.Stop.some(entry =>
    entry.hooks?.some(h => h.command?.includes('session-end-check'))
  );

  if (!hasEnd) {
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: `bash ${endDest}`, timeout: 5 }],
    });
    ok('Session end hook installed (auto-logs sessions)');
    changed = true;
  }

  // Hook 3: PostToolUse (Write|Edit) — auto-push vault on changes
  const pushSrc = join(pkgRoot, 'hooks', 'vault-auto-push.sh');
  const pushDest = join(hooksDir, 'vault-auto-push.sh');

  if (existsSync(pushSrc)) {
    cpSync(pushSrc, pushDest);
    try { chmodSync(pushDest, 0o755); } catch {}
  }

  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const hasPush = settings.hooks.PostToolUse.some(entry =>
    entry.hooks?.some(h => h.command?.includes('vault-auto-push'))
  );

  if (!hasPush) {
    settings.hooks.PostToolUse.push({
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: `bash ${pushDest}`, timeout: 10 }],
    });
    ok('Vault auto-push hook installed (syncs on every write)');
    changed = true;
  }

  // Hook 4: SessionStart — reset budget warning state at session start
  const budgetResetSrc = join(pkgRoot, 'hooks', 'budget-reset.mjs');
  const budgetResetDest = join(hooksDir, 'budget-reset.mjs');

  if (existsSync(budgetResetSrc)) {
    cpSync(budgetResetSrc, budgetResetDest);
    try { chmodSync(budgetResetDest, 0o755); } catch {}
  }

  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const hasBudgetReset = settings.hooks.SessionStart.some(entry =>
    entry.hooks?.some(h => h.command?.includes('budget-reset'))
  );

  if (!hasBudgetReset && existsSync(budgetResetSrc)) {
    settings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: `node ${budgetResetDest}` }],
    });
    ok('Budget reset hook installed (resets warning state at session start)');
    changed = true;
  }

  // Hook 5: PostToolUse (*) — budget detection warning
  const budgetCheckSrc = join(pkgRoot, 'hooks', 'budget-check.mjs');
  const budgetCheckDest = join(hooksDir, 'budget-check.mjs');

  if (existsSync(budgetCheckSrc)) {
    cpSync(budgetCheckSrc, budgetCheckDest);
    try { chmodSync(budgetCheckDest, 0o755); } catch {}
  }

  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const hasBudgetCheck = settings.hooks.PostToolUse.some(entry =>
    entry.hooks?.some(h => h.command?.includes('budget-check'))
  );

  if (!hasBudgetCheck && existsSync(budgetCheckSrc)) {
    settings.hooks.PostToolUse.push({
      hooks: [{ type: 'command', command: `node ${budgetCheckDest}`, timeout: 5 }],
    });
    ok('Budget check hook installed (warns when context usage crosses threshold)');
    changed = true;
  }

  // Copy supporting scripts used by session-end-check.sh (FIX-04)
  const supportFiles = [
    'notebooklm-sync-trigger.mjs',
    'notebooklm-sync-runner.mjs',
    'update-context.mjs',
  ];
  for (const file of supportFiles) {
    const src = join(pkgRoot, 'hooks', file);
    const dest = join(hooksDir, file);
    if (existsSync(src)) {
      cpSync(src, dest);
    }
  }

  // DX-01: Write allowedTools for session-manager vault read/write operations
  if (vaultPath) {
    if (!Array.isArray(settings.allowedTools)) settings.allowedTools = [];

    const patterns = [
      `Read(${vaultPath}/**/context.md)`,
      `Read(${vaultPath}/**/sessions/*.md)`,
      `Write(${vaultPath}/**/sessions/*.md)`,
      `Read(${vaultPath}/shared/patterns.md)`,
      `Read(${vaultPath}/meta/project-registry.md)`,
    ];

    let toolsChanged = false;
    for (const pattern of patterns) {
      if (!settings.allowedTools.includes(pattern)) {
        settings.allowedTools.push(pattern);
        toolsChanged = true;
      }
    }

    if (toolsChanged) {
      ok('Auto-approve configured for vault read/write');
      info(`Inspect: ${settingsPath} → allowedTools`);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  } else {
    info('Session hooks already configured');
  }
}
