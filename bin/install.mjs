#!/usr/bin/env node

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { c, ok, warn, info, prompt } from '../lib/shared.mjs';
import { printHeader, checkPrerequisites } from '../lib/install/prereqs.mjs';
import { collectProfile } from '../lib/install/profile.mjs';
import { collectProjects } from '../lib/install/projects.mjs';
import { selectComponents } from '../lib/install/components.mjs';
import { selectAndInstallPlugins } from '../lib/install/plugins.mjs';
import { getVaultPath, installVault } from '../lib/install/vault.mjs';
import { installGSD } from '../lib/install/gsd.mjs';
import { installObsidianSkills, installCustomSkills, installDeepResearch } from '../lib/install/skills.mjs';
import { installNotebookLM } from '../lib/install/notebooklm.mjs';
import { installGitConventions } from '../lib/install/git-conventions.mjs';
import { generateClaudeMD } from '../lib/install/claude-md.mjs';
import { installSessionHook } from '../lib/install/hooks.mjs';
import { printSummary } from '../lib/install/summary.mjs';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(homedir(), '.claude', 'skills');
const agentsDir = join(homedir(), '.claude', 'agents');

async function main() {
  printHeader();
  const { ready } = await prompt({ type: 'confirm', name: 'ready', message: 'Ready to start?', initial: true });
  if (!ready) { console.log(`\n  ${c.dim}No changes made. Run again when ready.${c.reset}\n`); return; }

  const earlyTotal = '...';
  const { pythonCmd, pipCmd } = checkPrerequisites(earlyTotal);
  const profile = await collectProfile(earlyTotal);
  const projectsData = await collectProjects(earlyTotal);
  projectsData._profileName = profile.name;
  const components = await selectComponents(earlyTotal, !!pipCmd);

  const setupSteps = 6;
  const installCount = [
    components.vault, components.gsd, components.obsidianSkills,
    components.customSkills, components.deepResearch, components.notebooklm,
  ].filter(Boolean).length;
  const totalSteps = setupSteps + installCount + 2;

  const pluginResults = await selectAndInstallPlugins(5, totalSteps);
  const vaultPath = await getVaultPath(totalSteps);

  const installed = [];
  const failed = [];
  let stepNum = setupSteps + 1;

  if (pluginResults.installed.length > 0) installed.push(`Claude plugins (${pluginResults.installed.length} new)`);
  if (pluginResults.failed.length > 0) failed.push(`Claude plugins (${pluginResults.failed.length} failed)`);

  if (components.vault) installVault(vaultPath, projectsData, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Knowledge Vault') : failed.push('Vault');
  if (components.gsd) installGSD(stepNum++, totalSteps) ? installed.push('GSD (Get Shit Done)') : failed.push('GSD');
  if (components.obsidianSkills) installObsidianSkills(skillsDir, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Obsidian Skills (kepano)') : failed.push('Obsidian Skills');
  if (components.customSkills) installCustomSkills(skillsDir, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Custom skills (sessions, projects, router)') : failed.push('Custom skills');
  if (components.deepResearch) installDeepResearch(skillsDir, agentsDir, stepNum++, totalSteps) ? installed.push('Deep Research') : failed.push('Deep Research');
  if (components.notebooklm) (await installNotebookLM(pipCmd, stepNum++, totalSteps)) ? installed.push('NotebookLM') : failed.push('NotebookLM');

  await installGitConventions(projectsData, stepNum++, totalSteps);
  await generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps, PKG_ROOT);
  installSessionHook(undefined, undefined, PKG_ROOT);

  // Vault git sync setup (optional)
  console.log('');
  const { setupSync } = await prompt({ type: 'confirm', name: 'setupSync', message: 'Set up vault git sync? (backup + team sharing)', initial: false });

  if (setupSync) {
    if (!existsSync(join(vaultPath, '.git'))) {
      spawnSync('git', ['init'], { cwd: vaultPath, stdio: 'pipe' });
      const gitignorePath = join(vaultPath, '.gitignore');
      if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, `.obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.obsidian/cache\n.DS_Store\n*.log\n`);
      spawnSync('git', ['add', '.'], { cwd: vaultPath, stdio: 'pipe' });
      spawnSync('git', ['commit', '-m', 'Initial vault commit'], { cwd: vaultPath, stdio: 'pipe' });
      ok('Git repository initialized');
    }
    const { remoteUrl } = await prompt({ type: 'text', name: 'remoteUrl', message: 'Remote URL (e.g. git@github.com:user/vault.git)' });
    if (remoteUrl) {
      spawnSync('git', ['remote', 'remove', 'origin'], { cwd: vaultPath, stdio: 'pipe' });
      spawnSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: vaultPath, stdio: 'pipe' });
      ok(`Remote: ${remoteUrl}`);
      const branch = spawnSync('git', ['branch', '--show-current'], { cwd: vaultPath, stdio: 'pipe' });
      const branchName = branch.stdout?.toString().trim() || 'main';
      const pushResult = spawnSync('git', ['push', '-u', 'origin', branchName], { cwd: vaultPath, stdio: 'pipe', timeout: 30000 });
      if (pushResult.status === 0) { ok('Pushed to remote'); info('Auto-sync enabled: pull on start, push on end'); }
      else warn('Push failed — configure later: claude-dev-stack sync init');
    }
  } else {
    info('Skip sync. Set up later: claude-dev-stack sync init');
  }

  printSummary(installed, failed, vaultPath, projectsData, components);
}

export { installNotebookLM } from '../lib/install/notebooklm.mjs';
export default main;

// Auto-run only when executed directly (not imported by cli.mjs)
const isDirectRun = process.argv[1] && process.argv[1].includes('install.mjs');
if (isDirectRun) {
  main().catch((err) => {
    console.error(`\n  ${c.red}Error: ${err.message}${c.reset}\n`);
    process.exit(1);
  });
}
