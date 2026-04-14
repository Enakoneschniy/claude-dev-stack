// lib/install/claude-md.mjs — CLAUDE.md generation wizard step

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, warn, info, prompt, step } from '../shared.mjs';
import { updateManagedSection } from '../project-setup.mjs';

// ── Generate CLAUDE.md ──────────────────────────────────────────
export async function generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, '📝 Generating CLAUDE.md');

  let langLine = '';
  switch (profile.lang) {
    case 'ru': langLine = 'Общение на русском. Код и коммиты на английском.'; break;
    case 'en': langLine = 'Communication in English.'; break;
    default:   langLine = `Communication in ${profile.lang}. Code in English.`; break;
  }

  // Managed-section body (goes BETWEEN markers — no marker wrapping here;
  // `updateManagedSection` adds the markers). No leading `# CLAUDE.md` H1 —
  // that stays outside our managed section and is seeded by
  // `updateManagedSection` only when the file doesn't exist yet.
  const managedBody = `## Language
${langLine}

## Auto-Routing (IMPORTANT)
Do NOT ask which tool to use. Determine automatically:
- First message in session → load context (session-manager)
- Development task → GSD (/gsd:quick for small, /gsd:plan-phase for large)
- Research/comparison → deep-research
- Different project mentioned → project-switcher
- End of work ("done", "всё", "хватит") → session-manager /end
If .planning/ exists → project uses GSD, respect its state.

## Knowledge Base
Before starting, ALWAYS read:
1. \`cat ${vaultPath}/projects/THIS_PROJECT/context.md\`
2. Last 3 session logs from \`${vaultPath}/projects/THIS_PROJECT/sessions/\`

## Session Protocol
- Start: read context + propose continuation from last TODO
- During: ADR for decisions, Known Issues for bugs, shared/patterns.md for reusables
- End ("done"/"всё"/"хватит"): create session log, update context.md

## Code Style
- Commits: conventional commits (feat:, fix:, chore:)
- Code and comments in ${profile.codeLang}
- Communication in ${profile.lang}

## Rules
- Do NOT delete code without explicit request
- On .env change → update .env.example
- On new dependency → explain in session log

## References
- Vault: \`${vaultPath}/\`
- Registry: \`${vaultPath}/meta/project-registry.md\`
- Patterns: \`${vaultPath}/shared/patterns.md\`
- Skills: \`${skillsDir}/\``;

  // D-08: reference template on vault side stays non-idempotent (fully overwritten).
  const template = `# CLAUDE.md — Project Intelligence Layer\n\n${managedBody}\n`;
  const templatePath = join(vaultPath, 'CLAUDE.md.template');
  writeFileSync(templatePath, template);
  ok(`Template: ${templatePath}`);

  // Install CLAUDE.md into project directories with known paths
  const projectsWithPaths = projectsData.projects.filter(p => p.path && existsSync(p.path));
  const projectsWithoutPaths = projectsData.projects.filter(p => !p.path || !existsSync(p.path));

  if (projectsWithPaths.length > 0) {
    console.log('');
    const { installNow } = await prompt({
      type: 'confirm',
      name: 'installNow',
      message: 'Install CLAUDE.md into project directories?',
      initial: true,
    });

    if (installNow) {
      for (const project of projectsWithPaths) {
        // Substitute THIS_PROJECT placeholder per project
        const projectManagedBody = managedBody.replace(/THIS_PROJECT/g, project.name);

        // BUG-07 fix: idempotent merge — preserves user content outside markers
        const status = updateManagedSection(project.path, projectManagedBody);

        // Status output (color-coded helper wiring lives in Plan 30-02 Task 1)
        switch (status) {
          case 'created':   ok(`${project.name} → CLAUDE.md: created`); break;
          case 'updated':   ok(`${project.name} → CLAUDE.md: updated`); break;
          case 'appended':  warn(`${project.name} → CLAUDE.md: appended (existing content preserved)`); break;
          case 'unchanged': info(`${project.name} → CLAUDE.md: unchanged`); break;
          default:          info(`${project.name} → CLAUDE.md: ${status}`); break;
        }
      }
    }
  }

  if (projectsWithoutPaths.length > 0) {
    for (const project of projectsWithoutPaths) {
      warn(`${project.name} — no valid path, copy CLAUDE.md manually from: ${templatePath}`);
    }
  }

  // Write project-map.json for directory → project name mapping
  // Note: dynamic import path is relative to lib/install/ — lib/add-project.mjs is one level up
  const { updateProjectMap } = await import('../add-project.mjs');
  for (const project of projectsWithPaths) {
    updateProjectMap(vaultPath, project.path, project.name);
  }
  if (projectsWithPaths.length > 0) {
    ok('project-map.json updated');
  }
}
