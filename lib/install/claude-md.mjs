// lib/install/claude-md.mjs — CLAUDE.md generation wizard step

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, warn, info, prompt, step } from '../shared.mjs';
import { updateManagedSection, generateSkillsSection } from '../project-setup.mjs';

/**
 * Format the per-project CLAUDE.md status line (pure — no console side effects).
 *
 * Returns the exact string the wizard will print for a given merge outcome.
 * By contract (BUG-07 D-06), the output NEVER uses the legacy BUG-07 verb —
 * only create/update/append/unchanged are allowed.
 *
 * @param {string} projectName
 * @param {'created' | 'updated' | 'appended' | 'unchanged' | string} status
 * @returns {string}
 */
export function formatClaudeMdStatus(projectName, status) {
  switch (status) {
    case 'created':   return `${projectName} → CLAUDE.md: created`;
    case 'updated':   return `${projectName} → CLAUDE.md: updated`;
    case 'appended':  return `${projectName} → CLAUDE.md: appended (existing content preserved)`;
    case 'unchanged': return `${projectName} → CLAUDE.md: unchanged`;
    default:          return `${projectName} → CLAUDE.md: ${status}`;
  }
}

/**
 * Print the per-project CLAUDE.md status using the appropriate color helper
 * from `lib/shared.mjs`. Wraps `formatClaudeMdStatus`.
 *
 *   created   → info  (blue  ℹ)
 *   updated   → ok    (green ✔)
 *   appended  → warn  (yellow ⚠)   — existing user content preserved
 *   unchanged → info  (blue  ℹ)    — idempotent re-run, no diff
 *   other     → info  (defensive)
 *
 * @param {string} projectName
 * @param {'created' | 'updated' | 'appended' | 'unchanged' | string} status
 */
export function printClaudeMdStatus(projectName, status) {
  const line = formatClaudeMdStatus(projectName, status);
  switch (status) {
    case 'created':   info(line); break;
    case 'updated':   ok(line);   break;
    case 'appended':  warn(line); break;
    case 'unchanged': info(line); break;
    default:          info(line); break;
  }
}

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
Project context is auto-loaded at session start by the SessionStart hook
(\`hooks/session-start-context.sh\`). Do NOT re-read \`context.md\` or session
logs on the first user message — they are already in your prompt.
Re-read only on explicit user request ("напомни про проект", "что делали",
\`/resume\`) or when more than 60 min have passed since the
\`.claude/.session-loaded\` marker was written.

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

${generateSkillsSection({ withMarkers: false })}`;

  // D-08: reference template on vault side stays non-idempotent (fully written).
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
      type: 'select',
      name: 'installNow',
      message: 'Install CLAUDE.md into project directories?',
      choices: [
        { title: 'Install into all project directories', value: 'install' },
        { title: 'Skip', value: 'skip' },
      ],
      initial: 0,
    });

    if (installNow === 'install') {
      for (const project of projectsWithPaths) {
        // Substitute THIS_PROJECT placeholder per project
        const projectManagedBody = managedBody.replace(/THIS_PROJECT/g, project.name);

        // BUG-07 fix: idempotent merge — preserves user content outside markers
        const status = updateManagedSection(project.path, projectManagedBody);

        // D-06: color-coded status line via dedicated helper
        printClaudeMdStatus(project.name, status);
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
