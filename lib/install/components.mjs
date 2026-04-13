// lib/install/components.mjs — Component selection wizard step

import { existsSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, info, warn, prompt, step } from '../shared.mjs';

// ── Detect which components are already installed ───────────────
function _detectInstalled(installState) {
  const installed = {
    vault: false,
    customSkills: false,
    obsidianSkills: false,
    deepResearch: false,
    gsd: false,
    notebooklm: false,
  };

  if (!installState) return installed;

  // vault: already detected by installState.vaultExists
  installed.vault = !!installState.vaultExists;

  const skillsDir = join(homedir(), '.claude', 'skills');

  // customSkills: session-manager skill present
  installed.customSkills = existsSync(join(skillsDir, 'session-manager'));

  // obsidianSkills: obsidian-skills present (kepano)
  installed.obsidianSkills = existsSync(join(skillsDir, 'obsidian-skills')) ||
    existsSync(join(skillsDir, 'kepano'));

  // deepResearch: research or dev-research skill present
  installed.deepResearch = existsSync(join(skillsDir, 'research')) ||
    existsSync(join(skillsDir, 'dev-research'));

  // gsd: gsd-manager skill present
  installed.gsd = existsSync(join(skillsDir, 'gsd-manager'));

  // notebooklm: notebooklm skill present
  installed.notebooklm = existsSync(join(skillsDir, 'notebooklm'));

  return installed;
}

// ── Step 4: Component Selection ─────────────────────────────────
export async function selectComponents(totalSteps, hasPip, installState) {
  step(4, totalSteps, '📦 Choose components');

  const detected = _detectInstalled(installState);

  function label(title, key) {
    return detected[key] ? `${title} ${c.green}(installed)${c.reset}` : title;
  }

  const choices = [
    { title: label('📁 Knowledge Vault (project context, session logs, ADRs)', 'vault'), value: 'vault', selected: detected.vault || true },
    { title: label('⚙️  Custom skills (session manager, project switcher, auto-router)', 'customSkills'), value: 'customSkills', selected: detected.customSkills || true },
    { title: label('🔌 Obsidian Skills by kepano (vault format support)', 'obsidianSkills'), value: 'obsidianSkills', selected: detected.obsidianSkills || true },
    { title: label('🔍 Deep Research (structured web research from terminal)', 'deepResearch'), value: 'deepResearch', selected: detected.deepResearch || true },
    { title: label('🚀 GSD — Get Shit Done (advanced spec-driven workflow, 78 slash commands)', 'gsd'), value: 'gsd', selected: detected.gsd },
  ];

  if (hasPip) {
    choices.push({
      title: label('📚 NotebookLM (docs-grounded research, needs Google account)', 'notebooklm'),
      value: 'notebooklm',
      selected: detected.notebooklm,
    });
  } else {
    info('NotebookLM skipped — pip not available');
    console.log('');
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select components',
    choices,
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const sel = selected || [];
  console.log('');
  ok(`Selected ${c.bold}${sel.length}${c.reset} component(s)`);

  return {
    vault: sel.includes('vault'),
    gsd: sel.includes('gsd'),
    obsidianSkills: sel.includes('obsidianSkills'),
    customSkills: sel.includes('customSkills'),
    deepResearch: sel.includes('deepResearch'),
    notebooklm: sel.includes('notebooklm'),
  };
}

// ── LIMIT-03: Install loop.md for scheduled tasks ───────────────────────────
export async function installLoopMd(stepNum, totalSteps, pkgRoot, projects, loopMdByProject) {
  step(stepNum, totalSteps, 'Install loop.md for scheduled tasks');

  const eligibleProjects = (projects || []).filter(p => p.path && existsSync(p.path));

  if (eligibleProjects.length === 0) {
    info('No projects found — skipping loop.md installation');
    return;
  }

  for (const project of eligibleProjects) {
    const claudeDir = join(project.path, '.claude');
    const destPath = join(claudeDir, 'loop.md');
    const alreadyInstalled = loopMdByProject?.[project.name] || false;

    let shouldInstall = true;
    if (alreadyInstalled) {
      const { overwrite } = await prompt({
        type: 'confirm',
        name: 'overwrite',
        message: `loop.md already installed for ${project.name} — overwrite?`,
        initial: false,
      });
      shouldInstall = overwrite;
    } else {
      const { install } = await prompt({
        type: 'confirm',
        name: 'install',
        message: `Install loop.md for ${project.name}?`,
        initial: true,
      });
      shouldInstall = install;
    }

    if (shouldInstall) {
      const srcPath = join(pkgRoot, 'templates', 'loop.md');
      if (!existsSync(srcPath)) {
        warn('templates/loop.md not found in package — skipping');
        continue;
      }
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
      cpSync(srcPath, destPath);
      ok('loop.md installed to ' + destPath.replace(homedir(), '~'));
    }
  }
}
