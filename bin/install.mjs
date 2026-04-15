#!/usr/bin/env node

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { c, ok, warn, info, prompt } from '../lib/shared.mjs';
import { printHeader, checkPrerequisites } from '../lib/install/prereqs.mjs';
import { collectProfile, saveInstallProfile } from '../lib/install/profile.mjs';
import { collectProjects } from '../lib/install/projects.mjs';
import { selectComponents, installLoopMd } from '../lib/install/components.mjs';
import { selectAndInstallPlugins } from '../lib/install/plugins.mjs';
import { getVaultPath, installVault } from '../lib/install/vault.mjs';
import { installGSD } from '../lib/install/gsd.mjs';
import { installObsidianSkills, installCustomSkills, installDeepResearch } from '../lib/install/skills.mjs';
import { installNotebookLM } from '../lib/install/notebooklm.mjs';
import { installGitConventions } from '../lib/install/git-conventions.mjs';
import { generateClaudeMD } from '../lib/install/claude-md.mjs';
import { installSessionHook } from '../lib/install/hooks.mjs';
import { printSummary } from '../lib/install/summary.mjs';
import { detectInstallState } from '../lib/install/detect.mjs';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(homedir(), '.claude', 'skills');
const agentsDir = join(homedir(), '.claude', 'agents');

async function main() {
  process.on('SIGINT', () => {
    console.log(`\n  ${c.dim}Cancelled. No changes made.${c.reset}\n`);
    process.exit(0);
  });

  printHeader();
  const { ready } = await prompt({ type: 'confirm', name: 'ready', message: 'Ready to start?', initial: true });
  if (!ready) { console.log(`\n  ${c.dim}No changes made. Run again when ready.${c.reset}\n`); return; }

  // DX-02: Detect existing install state
  const installState = detectInstallState();

  let reconfigure = false;
  if (installState.vaultExists) {
    const projectCount = installState.projects.length;
    const vaultDisplay = installState.vaultPath.replace(homedir(), '~');
    console.log('');
    console.log(`  ${c.blue}ℹ${c.reset} ${c.bold}Existing install detected:${c.reset}`);
    console.log(`    ${c.green}✔${c.reset} Vault: ${vaultDisplay}  (${projectCount} project${projectCount === 1 ? '' : 's'})`);
    console.log(`    ${installState.hooksInstalled ? c.green + '✔' : c.red + '✘'}${c.reset} Hooks: ${installState.hooksInstalled ? 'installed' : 'not installed'}`);
    console.log(`    ${installState.gitRemote ? c.green + '✔' : c.dim + '–'}${c.reset} Git remote: ${installState.gitRemote || 'not configured'}`);
    console.log('');

    const result = await prompt({
      type: 'confirm',
      name: 'reconfigure',
      message: 'Reconfigure everything from scratch?',
      initial: false,
    });
    reconfigure = result.reconfigure;

    if (!reconfigure) {
      console.log(`  ${c.dim}Skip-aware mode: completed sections will offer skip/reconfigure.${c.reset}`);
      console.log('');
    }
  }

  const earlyTotal = '...';
  const { pythonCmd, pipCmd } = checkPrerequisites(earlyTotal);
  const profile = await collectProfile(earlyTotal, installState.profile);
  const projectsData = await collectProjects(
    earlyTotal,
    installState.projects.length > 0 ? installState.projects : null,
    installState.projectsDir || null,  // DX-08: pre-fill base dir
    installState.vaultPath,
  );
  projectsData._profileName = profile.name;
  const components = await selectComponents(earlyTotal, !!pipCmd, installState);

  const setupSteps = 6;
  const installCount = [
    components.vault, components.gsd, components.obsidianSkills,
    components.customSkills, components.deepResearch, components.notebooklm,
  ].filter(Boolean).length;
  const totalSteps = setupSteps + installCount + 2;

  const pluginResults = await selectAndInstallPlugins(5, totalSteps, installState.profile?.useCase);

  // DX-02: Skip/reconfigure vault step if already configured
  let vaultPath;
  if (installState.vaultExists && !reconfigure) {
    const { vaultAction } = await prompt({
      type: 'select',
      name: 'vaultAction',
      message: `Vault setup — already at ${installState.vaultPath.replace(homedir(), '~')} (${installState.projects.length} project${installState.projects.length === 1 ? '' : 's'})`,
      choices: [
        { title: 'Skip (keep existing)', value: 'skip' },
        { title: 'Reconfigure', value: 'reconfigure' },
      ],
      initial: 0,
    });
    if (vaultAction === 'skip') {
      vaultPath = installState.vaultPath;
      info(`Vault: ${vaultPath.replace(homedir(), '~')} (skipped)`);
    } else {
      vaultPath = await getVaultPath(totalSteps, installState.vaultPath);
    }
  } else {
    vaultPath = await getVaultPath(totalSteps, installState.vaultPath || null);
  }

  // DX-07 / DX-10: Persist profile for next re-install
  saveInstallProfile(vaultPath, {
    lang: profile.lang,
    codeLang: profile.codeLang,
    useCase: pluginResults.useCase || installState.profile?.useCase || null,
  });

  const installed = [];
  const failed = [];
  let stepNum = setupSteps + 1;

  if (pluginResults.installed.length > 0) installed.push(`Claude plugins (${pluginResults.installed.length} new)`);
  if (pluginResults.failed.length > 0) failed.push(`Claude plugins (${pluginResults.failed.length} failed)`);

  if (components.vault) installVault(vaultPath, projectsData, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Knowledge Vault') : failed.push('Vault');
  if (components.gsd) (await installGSD(stepNum++, totalSteps)) ? installed.push('GSD (Get Shit Done)') : failed.push('GSD');
  if (components.obsidianSkills) installObsidianSkills(skillsDir, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Obsidian Skills (kepano)') : failed.push('Obsidian Skills');
  if (components.customSkills) installCustomSkills(skillsDir, stepNum++, totalSteps, PKG_ROOT) ? installed.push('Custom skills (sessions, projects, router)') : failed.push('Custom skills');
  if (components.deepResearch) installDeepResearch(skillsDir, agentsDir, stepNum++, totalSteps) ? installed.push('Deep Research') : failed.push('Deep Research');
  if (components.notebooklm) (await installNotebookLM(pipCmd, stepNum++, totalSteps, installState.notebooklmAuthenticated)) ? installed.push('NotebookLM') : failed.push('NotebookLM');

  // LIMIT-03: Install loop.md for scheduled tasks (only if GSD selected or already installed)
  if (components.gsd || installState.gsdInstalled) {
    await installLoopMd(stepNum++, totalSteps, PKG_ROOT, projectsData?.projects || [], installState.loopMdByProject || {});
  }

  const gitConvOk = await installGitConventions(projectsData, stepNum++, totalSteps);
  if (gitConvOk) installed.push('Git conventions'); else failed.push('Git conventions');
  await generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum++, totalSteps, PKG_ROOT);
  // DX-02: Skip/reconfigure hooks step if already installed
  if (installState.hooksInstalled && !reconfigure) {
    const { hookAction } = await prompt({
      type: 'select',
      name: 'hookAction',
      message: 'Session hooks — already installed',
      choices: [
        { title: 'Skip (keep existing)', value: 'skip' },
        { title: 'Reconfigure', value: 'reconfigure' },
      ],
      initial: 0,
    });
    if (hookAction === 'skip') {
      info('Session hooks already configured (skipped)');
      stepNum++;
    } else {
      installSessionHook(stepNum++, totalSteps, PKG_ROOT, vaultPath, projectsData);
    }
  } else {
    installSessionHook(stepNum++, totalSteps, PKG_ROOT, vaultPath, projectsData);
  }

  // UX-01 / UX-04: Vault git sync — branch on existing remote
  await runVaultGitSync(vaultPath, installState);

  printSummary(installed, failed, vaultPath, projectsData, components);
}

// UX-01/UX-04: Vault git sync block with detection + select prompts (no type: 'confirm')
async function runVaultGitSync(vaultPath, installState) {
  console.log('');

  if (installState.gitRemote) {
    // Branch A — remote already configured: offer Skip / Reconfigure / Remove
    ok(`Git sync: configured (origin → ${installState.gitRemote})`);
    const { gitSyncAction } = await prompt({
      type: 'select',
      name: 'gitSyncAction',
      message: 'Vault git sync',
      choices: [
        { title: 'Skip (keep existing)', value: 'skip' },
        { title: 'Reconfigure (set new remote URL)', value: 'reconfigure' },
        { title: 'Remove (unset origin)', value: 'remove' },
      ],
      initial: 0,
    });

    if (gitSyncAction === 'skip') {
      info('Vault git sync: keeping existing remote');
      return;
    }

    if (gitSyncAction === 'remove') {
      spawnSync('git', ['remote', 'remove', 'origin'], { cwd: vaultPath, stdio: 'pipe' });
      ok('Remote removed from vault — run claude-dev-stack sync init to reconfigure later');
      return;
    }

    // gitSyncAction === 'reconfigure' — fall through to remote-add flow (repo already exists)
    await configureVaultRemote(vaultPath, { initRepo: false });
    return;
  }

  // Branch B — no remote configured: offer Set up / Skip
  const { gitSyncAction } = await prompt({
    type: 'select',
    name: 'gitSyncAction',
    message: 'Set up vault git sync? (backup + team sharing)',
    choices: [
      { title: 'Yes, set up now', value: 'setup' },
      { title: 'Skip (set up later with: claude-dev-stack sync init)', value: 'skip' },
    ],
    initial: 1,
  });

  if (gitSyncAction === 'skip') {
    info('Skip sync. Set up later: claude-dev-stack sync init');
    return;
  }

  // gitSyncAction === 'setup' — run full init + remote-add + push flow
  await configureVaultRemote(vaultPath, { initRepo: true });
}

async function configureVaultRemote(vaultPath, { initRepo }) {
  if (initRepo && !existsSync(join(vaultPath, '.git'))) {
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
