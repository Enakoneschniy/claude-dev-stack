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

// ── LIMIT-03 / DX-13: Install loop.md for scheduled tasks ──────────────────
export async function installLoopMd(stepNum, totalSteps, pkgRoot, projects, loopMdByProject) {
  step(stepNum, totalSteps, 'Install loop.md for scheduled tasks');

  const eligibleProjects = (projects || []).filter(p => p.path && existsSync(p.path));

  if (eligibleProjects.length === 0) {
    info('No projects found — skipping loop.md installation');
    return;
  }

  const srcPath = join(pkgRoot, 'templates', 'loop.md');
  if (!existsSync(srcPath)) {
    warn('templates/loop.md not found in package — skipping');
    return;
  }

  const newProjects = eligibleProjects.filter(p => !loopMdByProject?.[p.name]);
  const installedProjects = eligibleProjects.filter(p => loopMdByProject?.[p.name]);

  // DX-13: bulk prompt for new projects (N individual prompts → one "Install for all?")
  if (newProjects.length > 1) {
    const { installAll } = await prompt({
      type: 'confirm',
      name: 'installAll',
      message: `Install loop.md for all ${newProjects.length} projects? (Y/n)`,
      initial: true,
    });
    if (installAll) {
      for (const project of newProjects) {
        const claudeDir = join(project.path, '.claude');
        if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
        cpSync(srcPath, join(claudeDir, 'loop.md'));
        ok('loop.md installed to ' + join(claudeDir, 'loop.md').replace(homedir(), '~'));
      }
    } else {
      info('loop.md installation skipped');
    }
  } else if (newProjects.length === 1) {
    const project = newProjects[0];
    const { install } = await prompt({
      type: 'confirm',
      name: 'install',
      message: `Install loop.md for ${project.name}?`,
      initial: true,
    });
    if (install) {
      const claudeDir = join(project.path, '.claude');
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
      cpSync(srcPath, join(claudeDir, 'loop.md'));
      ok('loop.md installed to ' + join(claudeDir, 'loop.md').replace(homedir(), '~'));
    }
  }

  // DX-13: bulk prompt for already-installed projects (overwrite?)
  if (installedProjects.length > 1) {
    const { overwriteAll } = await prompt({
      type: 'confirm',
      name: 'overwriteAll',
      message: `loop.md already installed for ${installedProjects.length} projects — overwrite all?`,
      initial: false,
    });
    if (overwriteAll) {
      for (const project of installedProjects) {
        const claudeDir = join(project.path, '.claude');
        cpSync(srcPath, join(claudeDir, 'loop.md'));
        ok('loop.md updated at ' + join(claudeDir, 'loop.md').replace(homedir(), '~'));
      }
    }
  } else if (installedProjects.length === 1) {
    const project = installedProjects[0];
    const { overwrite } = await prompt({
      type: 'confirm',
      name: 'overwrite',
      message: `loop.md already installed for ${project.name} — overwrite?`,
      initial: false,
    });
    if (overwrite) {
      const claudeDir = join(project.path, '.claude');
      cpSync(srcPath, join(claudeDir, 'loop.md'));
      ok('loop.md updated at ' + join(claudeDir, 'loop.md').replace(homedir(), '~'));
    }
  }
}
