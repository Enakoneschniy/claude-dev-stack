/**
 * Health check — verify vault, skills, plugins, and CLAUDE.md.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { c, ok, fail, warn, info, hasCommand, runCmd, SKILLS_DIR, CLAUDE_DIR } from './shared.mjs';
import { validateScopes } from './git-scopes.mjs';

function findVault() {
  // Allow tests (and advanced users) to override vault discovery via VAULT_PATH.
  if (process.env.VAULT_PATH && existsSync(process.env.VAULT_PATH)) {
    return process.env.VAULT_PATH;
  }

  const candidates = [
    join(homedir(), 'vault'),
    join(homedir(), 'Vault'),
    join(homedir(), '.vault'),
    join(homedir(), 'obsidian-vault'),
    join(homedir(), 'Documents', 'vault'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta')) || existsSync(join(dir, 'CLAUDE.md.template'))) {
      return dir;
    }
  }
  return null;
}

export async function main() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Claude Dev Stack — Health Check${c.reset}`);
  console.log('');

  let issues = 0;
  let warnings = 0;

  // ── 1. Prerequisites ──
  console.log(`  ${c.bold}Prerequisites${c.reset}`);
  console.log('');

  for (const tool of ['git', 'node', 'npm']) {
    if (hasCommand(tool)) {
      ok(tool);
    } else {
      fail(`${tool} — not installed`);
      issues++;
    }
  }

  if (hasCommand('claude')) {
    const ver = runCmd('claude --version 2>/dev/null');
    ok(`claude CLI${ver ? ` (${ver})` : ''}`);
  } else {
    warn('claude CLI — not installed');
    info('Install: npm install -g @anthropic-ai/claude-code');
    warnings++;
  }

  for (const py of ['python3', 'python']) {
    if (hasCommand(py)) {
      ok(py);
      break;
    }
  }

  // Hoist vault discovery so both NotebookLM section and Vault section can use it.
  const vaultPath = findVault();

  // ── 1b. NotebookLM (optional feature) ──
  console.log('');
  console.log(`  ${c.bold}NotebookLM Sync${c.reset}`);
  console.log('');

  const hasNotebooklm = hasCommand('notebooklm');
  if (hasNotebooklm) {
    // Line 1: binary version
    const ver = runCmd('notebooklm --version 2>/dev/null');
    ok(`notebooklm${ver ? ` (${ver.replace(/^NotebookLM CLI, version /, '')})` : ''}`);

    // Line 2: auth check (plain form — research §R1 exit 0 = authenticated)
    const authResult = runCmd('notebooklm auth check 2>/dev/null');
    if (authResult !== null) {
      ok('notebooklm auth — ok');
    } else {
      warn('notebooklm auth — login required, run: notebooklm login');
      warnings++;
    }

    // Line 3: last sync from manifest.generated_at (research §R6 — avoid log parsing)
    if (vaultPath) {
      try {
        const { readManifest } = await import('./notebooklm-manifest.mjs');
        const manifest = readManifest(vaultPath);
        const lastSync = manifest.generated_at;
        const fileCount = Object.values(manifest.projects ?? {}).reduce((sum, p) => sum + Object.keys(p.files ?? {}).length, 0);
        if (!lastSync || fileCount === 0) {
          info('last sync: never');
        } else {
          const ageMs = Date.now() - new Date(lastSync).getTime();
          const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          const label = ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
          if (ageDays > 3) {
            warn(`last sync: ${label}, ${fileCount} file${fileCount === 1 ? '' : 's'} tracked (consider running manually)`);
            warnings++;
          } else {
            ok(`last sync: ${label}, ${fileCount} file${fileCount === 1 ? '' : 's'} tracked`);
          }
        }
      } catch {
        info('last sync: unknown');
      }
    } else {
      info('last sync: unknown (no vault)');
    }
  } else {
    // CRITICAL (ADR-0012 + Pitfall 5): `info` level, NOT `fail` or `warn`.
    // NotebookLM is an optional feature — missing binary is "not configured",
    // not a health problem. DO NOT increment issues or warnings counters.
    info('notebooklm — not installed (optional, run claude-dev-stack to set up)');
  }

  // ── 2. Vault ──
  console.log('');
  console.log(`  ${c.bold}Knowledge Vault${c.reset}`);
  console.log('');

  if (vaultPath) {
    ok(`Vault: ${vaultPath.replace(homedir(), '~')}`);

    // Check structure
    const requiredDirs = ['meta', 'shared', 'projects'];
    for (const dir of requiredDirs) {
      if (existsSync(join(vaultPath, dir))) {
        ok(`${dir}/`);
      } else {
        warn(`${dir}/ — missing`);
        warnings++;
      }
    }

    // Check projects
    const projectsDir = join(vaultPath, 'projects');
    if (existsSync(projectsDir)) {
      const projects = readdirSync(projectsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== '_template');

      if (projects.length === 0) {
        warn('No projects in vault');
        info('Run: claude-dev-stack add-project');
        warnings++;
      } else {
        for (const p of projects) {
          const contextPath = join(projectsDir, p.name, 'context.md');
          if (existsSync(contextPath)) {
            const content = readFileSync(contextPath, 'utf8');
            const isEmpty = content.includes('## Overview') &&
                           !content.replace(/^#.*$/gm, '').replace(/\s/g, '').length;
            if (isEmpty || content.length < 100) {
              warn(`${p.name}/context.md — empty or unfilled`);
              warnings++;
            } else {
              ok(`${p.name}/context.md`);
            }
          } else {
            fail(`${p.name}/context.md — missing`);
            issues++;
          }
        }
      }
    }

    // Check CLAUDE.md template
    if (existsSync(join(vaultPath, 'CLAUDE.md.template'))) {
      ok('CLAUDE.md.template');
    } else {
      warn('CLAUDE.md.template — missing');
      warnings++;
    }
  } else {
    warn('Vault not found');
    info('Run setup: claude-dev-stack');
    warnings++;
  }

  // ── 3. Skills ──
  console.log('');
  console.log(`  ${c.bold}Skills${c.reset}`);
  console.log('');

  if (existsSync(SKILLS_DIR)) {
    const skills = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory());

    ok(`${skills.length} skill(s) in ${SKILLS_DIR.replace(homedir(), '~')}`);

    // Check key skills
    const keySkills = ['session-manager', 'project-switcher', 'dev-router'];
    for (const name of keySkills) {
      const skillDir = join(SKILLS_DIR, name);
      if (existsSync(join(skillDir, 'SKILL.md'))) {
        ok(name);
      } else {
        warn(`${name} — not installed`);
        info('Run: claude-dev-stack skills install');
        warnings++;
      }
    }
  } else {
    warn('Skills directory not found');
    info('Run setup: claude-dev-stack');
    warnings++;
  }

  // ── 4. Plugins ──
  console.log('');
  console.log(`  ${c.bold}Plugins${c.reset}`);
  console.log('');

  if (hasCommand('claude')) {
    try {
      const tmpFile = `/tmp/claude-doctor-plugins-${process.pid}.json`;
      execFileSync('sh', ['-c', `claude plugin list --json > ${tmpFile}`], { timeout: 15000 });
      const raw = readFileSync(tmpFile, 'utf8');
      try { rmSync(tmpFile); } catch {}
      const plugins = JSON.parse(raw);
      const enabled = plugins.filter(p => p.enabled !== false);
      const withErrors = plugins.filter(p => p.errors && p.errors.length > 0);

      ok(`${enabled.length} plugin(s) enabled`);

      if (withErrors.length > 0) {
        for (const p of withErrors) {
          warn(`${p.id} — ${p.errors[0]}`);
          warnings++;
        }
      }
    } catch {
      warn('Could not get plugin list');
      warnings++;
    }
  } else {
    info('Skipped — claude CLI not available');
  }

  // ── 5. Settings ──
  console.log('');
  console.log(`  ${c.bold}Settings${c.reset}`);
  console.log('');

  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      ok('settings.json');

      if (settings.hooks && Object.keys(settings.hooks).length > 0) {
        const hookCount = Object.values(settings.hooks)
          .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        ok(`${hookCount} hook(s) configured`);
      }

      if (settings.enabledPlugins) {
        const count = Object.values(settings.enabledPlugins).filter(Boolean).length;
        ok(`${count} plugin(s) enabled in settings`);

        // Detect output-style plugins that hijack Claude behaviour via SessionStart
        // hooks. Both `learning-output-style` and `explanatory-output-style` from
        // claude-plugins-official ship unconditional hooks that inject "you are in
        // learning/explanatory mode" instructions into every session, conflicting
        // with claude-dev-stack's automation-first workflow (e.g. GSD).
        const conflictingStylePlugins = Object.entries(settings.enabledPlugins)
          .filter(([k, v]) => v === true && (
            k.startsWith('learning-output-style@') ||
            k.startsWith('explanatory-output-style@')
          ))
          .map(([k]) => k);
        if (conflictingStylePlugins.length > 0) {
          warn(`Output-style plugins active: ${conflictingStylePlugins.join(', ')}`);
          info('These inject learning/explanatory mode into every session via SessionStart hooks');
          info('They conflict with claude-dev-stack automation. Disable in ~/.claude/settings.json:');
          for (const k of conflictingStylePlugins) {
            info(`  "${k}": false`);
          }
          warnings++;
        }
      }
    } catch {
      warn('settings.json — invalid JSON');
      warnings++;
    }
  } else {
    info('No settings.json found');
  }

  // ── 6. Git Conventions ──
  console.log('');
  console.log(`  ${c.bold}Git Conventions${c.reset}`);
  console.log('');

  if (vaultPath) {
    const mapPath = join(vaultPath, 'project-map.json');
    if (existsSync(mapPath)) {
      let projectMap = {};
      try {
        projectMap = JSON.parse(readFileSync(mapPath, 'utf8')).projects || {};
      } catch {
        warn('project-map.json malformed — skipping git-scopes check');
        warnings++;
      }

      let gitScopesFound = 0;
      for (const [dirPath, projectName] of Object.entries(projectMap)) {
        if (!existsSync(dirPath)) continue; // stale entry, already warned by vault section
        const scopesPath = join(dirPath, '.claude', 'git-scopes.json');
        if (existsSync(scopesPath)) {
          // Validate the file (T-06-10: catch malformed JSON + invalid schema)
          try {
            const raw = JSON.parse(readFileSync(scopesPath, 'utf8'));
            const { valid, reason } = validateScopes(raw);
            if (valid) {
              ok(`${projectName}: git-scopes.json (${raw.scopes.length} scopes)`);
              gitScopesFound++;
            } else {
              warn(`${projectName}: git-scopes.json invalid (${reason})`);
              info(`Run: claude-dev-stack scopes init in ${dirPath}`);
              warnings++;
            }
          } catch {
            warn(`${projectName}: git-scopes.json malformed`);
            info(`Run: claude-dev-stack scopes init in ${dirPath}`);
            warnings++;
          }
        } else {
          warn(`${projectName}: .claude/git-scopes.json missing`);
          info(`Run: claude-dev-stack scopes init in ${dirPath}`);
          warnings++;
        }
      }

      if (Object.keys(projectMap).length > 0 && gitScopesFound === 0) {
        info('No projects have git-scopes configured yet');
      }
    } else {
      info('No project-map.json — skipping git-scopes check');
    }
  } else {
    info('No vault found — skipping git-scopes check');
  }

  // ── Summary ──
  console.log('');
  if (issues === 0 && warnings === 0) {
    console.log(`  ${c.green}${c.bold}Everything looks good!${c.reset}`);
  } else if (issues === 0) {
    console.log(`  ${c.yellow}${c.bold}${warnings} warning(s)${c.reset} — things work but could be improved`);
  } else {
    console.log(`  ${c.red}${c.bold}${issues} issue(s)${c.reset}, ${c.yellow}${warnings} warning(s)${c.reset}`);
  }
  console.log('');
}
