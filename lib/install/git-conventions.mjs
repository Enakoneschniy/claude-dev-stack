// lib/install/git-conventions.mjs — Git conventions installation wizard step

import { existsSync } from 'fs';
import { join } from 'path';
import { c, ok, info, prompt, step } from '../shared.mjs';
import {
  detectStack, detectMainBranch, writeScopes, installSkill,
  createDefaultConfig, printCommitlintInstructions,
} from '../git-scopes.mjs';

// ── Install: Git Conventions ────────────────────────────────────
export async function installGitConventions(projectsData, stepNum, totalSteps) {
  step(stepNum, totalSteps, '🔧 Git Conventions');

  const projects = (projectsData.projects || []).filter(p => p.path && existsSync(p.path));

  if (projects.length === 0) {
    info('No projects mapped — skipping git conventions setup');
    return true;
  }

  // DX-13 / D-13: Bulk prompt when multiple projects
  let configureAll = null;  // null = ask per-project, true = all, false = skip all
  if (projects.length > 1) {
    const { action } = await prompt({
      type: 'select',
      name: 'action',
      message: `Configure git conventions for all ${projects.length} projects?`,
      choices: [
        { title: `Yes, all ${projects.length} projects`, value: 'all' },
        { title: 'Choose per project', value: 'per-project' },
        { title: 'Skip all', value: 'skip' },
      ],
      initial: 0,
    });
    if (action === 'all') configureAll = true;
    else if (action === 'skip') {
      info('Git conventions skipped for all projects');
      return true;
    }
    // action === 'per-project' → configureAll stays null → existing per-project flow
  }

  for (const project of projects) {
    const { name: projectName, path: dirPath } = project;

    console.log(`\n    ${c.bold}${projectName}${c.reset} (${dirPath})\n`);

    // BUG-05: Check if git-scopes.json already exists — offer skip/reconfigure
    const scopesPath = join(dirPath, '.claude', 'git-scopes.json');
    if (existsSync(scopesPath)) {
      if (configureAll) {
        info(`Skipped — existing git-scopes.json kept for ${projectName}`);
        continue;
      }
      const { reconfigure } = await prompt([{
        type: 'confirm',
        name: 'reconfigure',
        message: `git-scopes.json already configured — reconfigure?`,
        initial: false,
      }]);
      if (!reconfigure) {
        info(`Skipped — existing git-scopes.json kept for ${projectName}`);
        continue;
      }
    }

    // 1. Detect stack
    const detected = detectStack(dirPath);
    ok(`Detected: ${detected.source} (${detected.scopes.length} scopes, confidence: ${detected.confidence})`);

    // 2. Detect main branch
    const mainBranch = detectMainBranch(dirPath);

    // 3. Build default config (co_authored_by defaults to false per GIT-08)
    const config = createDefaultConfig(projectName, detected);
    if (mainBranch) config.main_branch = mainBranch;

    if (configureAll) {
      // Auto-accept detected scopes and branch when bulk "all" selected
      writeScopes(dirPath, config);
      ok(`Wrote .claude/git-scopes.json`);
      installSkill(dirPath, config);
      ok(`Installed git-conventions skill`);
      continue;
    }

    // Per-project flow (existing behavior) — only reached when configureAll is null
    // 4. Confirm scopes
    const { acceptScopes } = await prompt([{
      type: 'confirm',
      name: 'acceptScopes',
      message: `Scopes: [${config.scopes.join(', ')}]. Accept?`,
      initial: true,
    }]);
    // If user rejects scopes, they can run `claude-dev-stack scopes init` later
    if (acceptScopes === false) {
      info(`Skipped — run 'claude-dev-stack scopes init' in ${dirPath} to configure manually`);
      continue;
    }

    // 5. Confirm main branch
    const { acceptBranch } = await prompt([{
      type: 'confirm',
      name: 'acceptBranch',
      message: `Main branch: ${config.main_branch}. Correct?`,
      initial: true,
    }]);
    if (acceptBranch === false) {
      const { customBranch } = await prompt([{
        type: 'text',
        name: 'customBranch',
        message: 'Enter main branch name:',
        initial: 'main',
      }]);
      if (customBranch) config.main_branch = customBranch;
    }

    // 6. Commitlint (only if package.json exists; print-only per GIT-10 / T-06-11)
    if (existsSync(join(dirPath, 'package.json'))) {
      const { wantCommitlint } = await prompt([{
        type: 'confirm',
        name: 'wantCommitlint',
        message: 'Install commitlint enforcement? (print instructions only)',
        initial: false,
      }]);
      if (wantCommitlint) {
        config.commitlint_enforced = true;
        printCommitlintInstructions(config);
      }
    }

    // 7. Write config + install skill
    writeScopes(dirPath, config);
    ok(`Wrote .claude/git-scopes.json`);
    installSkill(dirPath, config);
    ok(`Installed git-conventions skill`);
  }

  return true;
}
