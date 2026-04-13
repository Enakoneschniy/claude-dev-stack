// lib/install/claude-md.mjs — CLAUDE.md generation wizard step

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, warn, info, prompt, step } from '../shared.mjs';

// ── Generate CLAUDE.md ──────────────────────────────────────────
export async function generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, '📝 Generating CLAUDE.md');

  let langLine = '';
  switch (profile.lang) {
    case 'ru': langLine = 'Общение на русском. Код и коммиты на английском.'; break;
    case 'en': langLine = 'Communication in English.'; break;
    default:   langLine = `Communication in ${profile.lang}. Code in English.`; break;
  }

  const template = `# CLAUDE.md — Project Intelligence Layer

## Language
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
- Skills: \`${skillsDir}/\`
`;

  // Save template
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
        const claudePath = join(project.path, 'CLAUDE.md');
        const projectTemplate = template.replace(/THIS_PROJECT/g, project.name);

        if (existsSync(claudePath)) {
          // BUG-07: Merge with existing — preserve user content after our template section
          const existing = readFileSync(claudePath, 'utf8');

          // Find user content: anything after the @claude-dev-stack:end marker or GSD markers
          // that isn't part of our managed sections
          const markerEnd = '<!-- @claude-dev-stack:end -->';
          const gsdEnd = '<!-- GSD:conventions-end -->';

          // Find the last managed marker in existing content
          let userContentStart = -1;
          for (const marker of [gsdEnd, markerEnd]) {
            const idx = existing.lastIndexOf(marker);
            if (idx !== -1) {
              userContentStart = existing.indexOf('\n', idx + marker.length);
              break;
            }
          }

          // Extract user additions (content after all managed sections)
          let userAdditions = '';
          if (userContentStart !== -1 && userContentStart < existing.length) {
            userAdditions = existing.slice(userContentStart).trim();
            // Filter out known managed sections (GSD injects these via hooks)
            if (userAdditions && !userAdditions.startsWith('<!-- GSD:')) {
              userAdditions = '\n\n' + userAdditions;
            } else {
              userAdditions = '';
            }
          }

          writeFileSync(claudePath, projectTemplate + userAdditions + '\n');
          ok(`${project.name} → CLAUDE.md updated (user content preserved)`);
        } else {
          writeFileSync(claudePath, projectTemplate);
          ok(`${project.name} → CLAUDE.md installed`);
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
