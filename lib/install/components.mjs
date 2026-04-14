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

  const srcPath = join(pkgRoot, 'templates', 'loop.md');
  if (!existsSync(srcPath)) {
    warn('templates/loop.md not found in package — skipping');
    return;
  }

  // DX-13 / D-13: Split into new vs already-installed
  const newProjects = eligibleProjects.filter(p => !loopMdByProject?.[p.name]);
  const installedProjects = eligibleProjects.filter(p => loopMdByProject?.[p.name]);

  // Bulk select for new projects
  if (newProjects.length > 0) {
    let installScope = 'all';
    if (newProjects.length > 1) {
      const { bulk } = await prompt({
        type: 'select',
        name: 'bulk',
        message: `Install loop.md for all ${newProjects.length} new projects?`,
        choices: [
          { title: `Yes, all ${newProjects.length} projects`, value: 'all' },
          { title: 'Choose per project', value: 'per-project' },
          { title: 'Skip', value: 'skip' },
        ],
        initial: 0,
      });
      installScope = bulk;
    }

    if (installScope === 'skip') {
      info('loop.md installation skipped');
    } else if (installScope === 'all') {
      for (const project of newProjects) {
        const claudeDir = join(project.path, '.claude');
        if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
        cpSync(srcPath, join(claudeDir, 'loop.md'));
        ok('loop.md installed for ' + project.name);
      }
    } else {
      // per-project: ask individually using select (D-04 — no confirm)
      for (const project of newProjects) {
        const { install } = await prompt({
          type: 'select',
          name: 'install',
          message: `Install loop.md for ${project.name}?`,
          choices: [
            { title: 'Yes', value: 'yes' },
            { title: 'Skip', value: 'skip' },
          ],
          initial: 0,
        });
        if (install === 'yes') {
          const claudeDir = join(project.path, '.claude');
          if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
          cpSync(srcPath, join(claudeDir, 'loop.md'));
          ok('loop.md installed for ' + project.name);
        }
      }
    }
  }

  // Bulk select for already-installed projects (overwrite)
  if (installedProjects.length > 0) {
    let overwriteScope = 'skip';
    if (installedProjects.length > 1) {
      const { bulk } = await prompt({
        type: 'select',
        name: 'bulk',
        message: `Overwrite loop.md for all ${installedProjects.length} existing projects?`,
        choices: [
          { title: `Yes, overwrite all ${installedProjects.length}`, value: 'all' },
          { title: 'Choose per project', value: 'per-project' },
          { title: 'Skip', value: 'skip' },
        ],
        initial: 2,
      });
      overwriteScope = bulk;
    } else {
      const { overwrite } = await prompt({
        type: 'select',
        name: 'overwrite',
        message: `loop.md already installed for ${installedProjects[0].name} — overwrite?`,
        choices: [
          { title: 'Yes, overwrite', value: 'yes' },
          { title: 'Skip', value: 'skip' },
        ],
        initial: 1,
      });
      overwriteScope = overwrite === 'yes' ? 'all' : 'skip';
    }

    if (overwriteScope === 'all') {
      for (const project of installedProjects) {
        const claudeDir = join(project.path, '.claude');
        cpSync(srcPath, join(claudeDir, 'loop.md'));
        ok('loop.md overwritten for ' + project.name);
      }
    } else if (overwriteScope === 'per-project') {
      for (const project of installedProjects) {
        const { overwrite } = await prompt({
          type: 'select',
          name: 'overwrite',
          message: `Overwrite loop.md for ${project.name}?`,
          choices: [
            { title: 'Yes, overwrite', value: 'yes' },
            { title: 'Skip', value: 'skip' },
          ],
          initial: 1,
        });
        if (overwrite === 'yes') {
          const claudeDir = join(project.path, '.claude');
          cpSync(srcPath, join(claudeDir, 'loop.md'));
          ok('loop.md overwritten for ' + project.name);
        }
      }
    }
  }
}
