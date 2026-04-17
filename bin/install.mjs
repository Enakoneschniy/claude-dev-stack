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
import { installCdsMcpServer } from '../lib/install/mcp.mjs';
import { printSummary } from '../lib/install/summary.mjs';
import { detectInstallState } from '../lib/install/detect.mjs';
import { assertNodeVersion } from '../lib/install/node-check.mjs';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(homedir(), '.claude', 'skills');
const agentsDir = join(homedir(), '.claude', 'agents');

async function main() {
  // Node 20+ required for claude-dev-stack@1.0.0-alpha.1 (better-sqlite3 12.x N-API 9 + EOL).
  // Throws with actionable error + rollback path if too old. MUST be first — before any
  // file I/O, prompts, or imports that load native bindings.
  assertNodeVersion(20);

  process.on('SIGINT', () => {
    console.log(`\n  ${c.dim}Cancelled. No changes made.${c.reset}\n`);
    process.exit(0);
  });

  printHeader();
  const { ready } = await prompt({
    type: 'select',
    name: 'ready',
    message: 'Ready to start?',
    choices: [
      { title: 'Yes, start installation', value: 'start' },
      { title: 'Cancel', value: 'cancel' },
    ],
    initial: 0,
  });
  if (ready === 'cancel') { console.log(`\n  ${c.dim}No changes made. Run again when ready.${c.reset}\n`); return; }

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
      type: 'select',
      name: 'reconfigure',
      message: 'Reconfigure everything from scratch?',
      choices: [
        { title: 'Keep existing + offer per-step skip', value: 'skip-aware' },
        { title: 'Reconfigure everything', value: 'reconfigure' },
      ],
      initial: 0,
    });
    reconfigure = result.reconfigure === 'reconfigure';

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

  // UX-05: Resolve the hooks action BEFORE building the steps array so a "skip" choice
  // does not consume a step number.
  const hookAction = await resolveHookAction(installState, reconfigure);

  const installed = [];
  const failed = [];

  // UX-05: Build runtime steps array — only push a step if it will actually run.
  // Each run() callback receives (stepNum, totalSteps) so helpers keep their signatures.
  const steps = [];

  // Plugins step (runs first after pre-flight — step 5 in the sequence)
  let pluginResults = { installed: [], failed: [], useCase: undefined };
  steps.push({
    label: 'Plugins',
    run: async (n, t) => {
      pluginResults = await selectAndInstallPlugins(n, t, installState.profile?.useCase);
      if (pluginResults.installed.length > 0) installed.push(`Claude plugins (${pluginResults.installed.length} new)`);
      if (pluginResults.failed.length > 0) failed.push(`Claude plugins (${pluginResults.failed.length} failed)`);
    },
  });

  // Vault path selection (always, but prompt varies based on state)
  let vaultPath;
  steps.push({
    label: 'Vault path',
    run: async (n, t) => {
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
          return;
        }
      }
      vaultPath = await getVaultPath(t, installState.vaultPath || null);
    },
  });

  // Component installs — one step each, only pushed if selected
  if (components.vault) {
    steps.push({ label: 'Knowledge Vault', run: async (n, t) => {
      if (installVault(vaultPath, projectsData, n, t, PKG_ROOT)) installed.push('Knowledge Vault');
      else failed.push('Vault');
    }});
  }
  if (components.gsd) {
    steps.push({ label: 'GSD', run: async (n, t) => {
      if (await installGSD(n, t)) installed.push('GSD (Get Shit Done)');
      else failed.push('GSD');
    }});
  }
  if (components.obsidianSkills) {
    steps.push({ label: 'Obsidian Skills', run: async (n, t) => {
      if (installObsidianSkills(skillsDir, n, t, PKG_ROOT)) installed.push('Obsidian Skills (kepano)');
      else failed.push('Obsidian Skills');
    }});
  }
  if (components.customSkills) {
    steps.push({ label: 'Custom skills', run: async (n, t) => {
      if (installCustomSkills(skillsDir, n, t, PKG_ROOT)) installed.push('Custom skills (sessions, projects, router)');
      else failed.push('Custom skills');
    }});
  }
  if (components.deepResearch) {
    steps.push({ label: 'Deep Research', run: async (n, t) => {
      if (installDeepResearch(skillsDir, agentsDir, n, t)) installed.push('Deep Research');
      else failed.push('Deep Research');
    }});
  }
  if (components.notebooklm) {
    steps.push({ label: 'NotebookLM', run: async (n, t) => {
      if (await installNotebookLM(pipCmd, n, t, installState.notebooklmAuthenticated)) installed.push('NotebookLM');
      else failed.push('NotebookLM');
    }});
  }

  // LIMIT-03: loop.md — only if GSD selected or already installed
  if (components.gsd || installState.gsdInstalled) {
    steps.push({ label: 'loop.md', run: async (n, t) => {
      await installLoopMd(n, t, PKG_ROOT, projectsData?.projects || [], installState.loopMdByProject || {});
    }});
  }

  // Git conventions — always
  steps.push({ label: 'Git conventions', run: async (n, t) => {
    const gitConvOk = await installGitConventions(projectsData, n, t);
    if (gitConvOk) installed.push('Git conventions'); else failed.push('Git conventions');
  }});

  // CLAUDE.md — always
  steps.push({ label: 'CLAUDE.md', run: async (n, t) => {
    await generateClaudeMD(vaultPath, profile, projectsData, skillsDir, n, t, PKG_ROOT);
  }});

  // Session hooks — only push if action !== 'skip'
  if (hookAction === 'install') {
    steps.push({ label: 'Session hooks', run: async (n, t) => {
      installSessionHook(n, t, PKG_ROOT, vaultPath, projectsData);
    }});
  }

  // Phase 37 MCP-02: register CDS MCP server in each project's .claude/settings.json.
  // Always runs (independent of hooks choice) — users without hooks still benefit
  // from Claude Code seeing the MCP tools.
  steps.push({ label: 'CDS MCP server', run: async (n, t) => {
    installCdsMcpServer(n, t, projectsData);
  }});

  // Phase 40 D-129: auto-configure GSD executor permissions for CC 2.x.
  // Writes Bash allowlist to each project's .claude/settings.local.json so
  // gsd-executor subagents don't silently fail on Bash calls.
  steps.push({ label: 'GSD permissions', run: async (n, t) => {
    const { setupGsdPermissions, detectCCMajorVersion } = await import('../lib/install/permission-config.mjs');
    const ccMajor = detectCCMajorVersion();
    if (ccMajor === null || ccMajor < 2) return;
    const projects = projectsData?.projects || [];
    for (const p of projects) {
      const result = setupGsdPermissions(p.path);
      if (result.added.length > 0) {
        info(`  GSD permissions: ${result.added.length} pattern(s) added for ${p.name}`);
      }
    }
  }});

  // UX-05: totalSteps is derived from runtime array length.
  // Pre-flight steps (prereqs, profile, projects, components) ran earlier with earlyTotal='...'
  // placeholders; the dynamic counter begins at step 5 (plugins) and proceeds.
  const preFlightCount = 4; // prereqs(1) + profile(2) + projects(3) + components(4)
  const totalSteps = steps.length + preFlightCount;

  for (let i = 0; i < steps.length; i++) {
    const stepNum = preFlightCount + i + 1;
    await steps[i].run(stepNum, totalSteps);
  }

  // DX-07 / DX-10: Persist profile for next re-install (after plugins + vaultPath are known)
  saveInstallProfile(vaultPath, {
    lang: profile.lang,
    codeLang: profile.codeLang,
    useCase: pluginResults.useCase || installState.profile?.useCase || null,
  });

  if (hookAction === 'skip') {
    info('Session hooks already configured (skipped)');
  }

  // UX-01 / UX-04: Vault git sync — branch on existing remote
  await runVaultGitSync(vaultPath, installState);

  printSummary(installed, failed, vaultPath, projectsData, components);
}

// UX-05: Resolve hooks action (install vs skip) BEFORE step array is built,
// so a "skip" choice does not consume a step number.
async function resolveHookAction(installState, reconfigure) {
  if (!installState.hooksInstalled || reconfigure) return 'install';
  const { action } = await prompt({
    type: 'select',
    name: 'action',
    message: 'Session hooks — already installed',
    choices: [
      { title: 'Skip (keep existing)', value: 'skip' },
      { title: 'Reconfigure', value: 'install' },
    ],
    initial: 0,
  });
  return action;
}

// UX-01/UX-04: Vault git sync block — detects existing origin and uses select prompts only (never y/N confirm)
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
