/**
 * Health check — verify vault, skills, plugins, and CLAUDE.md.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { c, ok, fail, warn, info, hasCommand, runCmd, SKILLS_DIR, CLAUDE_DIR } from './shared.mjs';

function findVault() {
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

  // ── 2. Vault ──
  console.log('');
  console.log(`  ${c.bold}Knowledge Vault${c.reset}`);
  console.log('');

  const vaultPath = findVault();
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
      }
    } catch {
      warn('settings.json — invalid JSON');
      warnings++;
    }
  } else {
    info('No settings.json found');
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
