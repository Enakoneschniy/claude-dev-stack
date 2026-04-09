/**
 * Export & Sync — share vault with team or back up.
 *
 * - export: create a .tar.gz of the vault
 * - sync init: initialize vault as git repo
 * - sync push/pull: push/pull vault to/from remote
 */

import { existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, askPath, spawnSync } from './shared.mjs';
import { findVault } from './projects.mjs';

// ── Export to tar.gz ─────────────────────────────────────────────
async function exportVault() {
  console.log('');
  console.log(`  ${c.bold}Export vault${c.reset}`);
  console.log('');

  let vaultPath = findVault();
  if (!vaultPath) {
    console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);
    vaultPath = await askPath('Vault path', join(homedir(), 'vault'));
    vaultPath = vaultPath.replace(/^~/, homedir());
  } else {
    info(`Vault: ${vaultPath.replace(homedir(), '~')}`);
  }

  if (!existsSync(vaultPath)) {
    fail('Vault not found');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const defaultDest = join(homedir(), `vault-export-${date}.tar.gz`);

  console.log('');
  const destPath = await askPath('Export to', defaultDest);
  const resolved = destPath.replace(/^~/, homedir());

  console.log('');
  info('Exporting vault...');

  const vaultName = basename(vaultPath);
  const vaultParent = join(vaultPath, '..');

  const result = spawnSync('tar', [
    'czf', resolved,
    '--exclude', '.git',
    '--exclude', '.obsidian',
    '-C', vaultParent,
    vaultName,
  ], { stdio: 'pipe', timeout: 60000 });

  if (result.status === 0) {
    ok(`Exported to ${resolved.replace(homedir(), '~')}`);
    console.log('');
    info('Share this file with team members. They can extract with:');
    console.log(`    ${c.white}tar xzf ${basename(resolved)} -C ~${c.reset}`);
  } else {
    fail('Export failed');
    if (result.stderr) console.log(`    ${c.dim}${result.stderr.toString().trim()}${c.reset}`);
  }
  console.log('');
}

// ── Sync vault via git ───────────────────────────────────────────

function getVaultForSync() {
  let vaultPath = findVault();
  if (!vaultPath) return null;
  return vaultPath;
}

function hasRemote(vaultPath) {
  const result = spawnSync('git', ['remote'], { cwd: vaultPath, stdio: 'pipe' });
  return result.stdout?.toString().trim().length > 0;
}

async function addRemoteFlow(vaultPath) {
  const { remoteUrl } = await prompt({
    type: 'text',
    name: 'remoteUrl',
    message: 'Remote URL (e.g. git@github.com:user/vault.git)',
  });

  if (!remoteUrl) return false;

  // Remove existing origin if present
  spawnSync('git', ['remote', 'remove', 'origin'], { cwd: vaultPath, stdio: 'pipe' });

  spawnSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: vaultPath, stdio: 'pipe' });
  ok(`Remote: ${remoteUrl}`);

  // Push
  info('Pushing to remote...');
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: vaultPath, stdio: 'pipe' });
  const branchName = branch.stdout?.toString().trim() || 'main';

  const pushResult = spawnSync('git', ['push', '-u', 'origin', branchName], {
    cwd: vaultPath, stdio: 'pipe', timeout: 30000,
  });

  if (pushResult.status === 0) {
    ok('Pushed to remote');
    return true;
  } else {
    const err = pushResult.stderr?.toString().trim() || '';
    warn(`Push failed: ${err}`);
    return false;
  }
}

async function syncVault(action) {
  console.log('');
  console.log(`  ${c.bold}Sync vault${c.reset}`);
  console.log('');

  const vaultPath = getVaultForSync();
  if (!vaultPath) {
    fail('Vault not found');
    return;
  }

  info(`Vault: ${vaultPath.replace(homedir(), '~')}`);

  const gitDir = join(vaultPath, '.git');
  const isGitRepo = existsSync(gitDir);

  // ── Init ──
  if (action === 'init') {
    if (!isGitRepo) {
      info('Initializing git repository...');
      spawnSync('git', ['init'], { cwd: vaultPath, stdio: 'pipe' });

      const { writeFileSync } = await import('fs');
      const gitignorePath = join(vaultPath, '.gitignore');
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, `.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.DS_Store
*.log
`);
      }

      spawnSync('git', ['add', '.'], { cwd: vaultPath, stdio: 'pipe' });
      spawnSync('git', ['commit', '-m', 'Initial vault commit'], { cwd: vaultPath, stdio: 'pipe' });
      ok('Git repository initialized');
    } else {
      ok('Git repository already initialized');
    }

    // Always offer to add/change remote
    const remoteExists = hasRemote(vaultPath);
    if (remoteExists) {
      const remote = spawnSync('git', ['remote', '-v'], { cwd: vaultPath, stdio: 'pipe' });
      info(`Current remote: ${remote.stdout?.toString().trim().split('\n')[0] || 'none'}`);
      console.log('');

      const { changeRemote } = await prompt({
        type: 'confirm',
        name: 'changeRemote',
        message: 'Change remote?',
        initial: false,
      });

      if (changeRemote) {
        await addRemoteFlow(vaultPath);
      }
    } else {
      console.log('');
      const { addRemote } = await prompt({
        type: 'confirm',
        name: 'addRemote',
        message: 'Add a remote repository?',
        initial: true,
      });

      if (addRemote) {
        await addRemoteFlow(vaultPath);
      }
    }

    console.log('');
    return;
  }

  // All other actions need git
  if (!isGitRepo) {
    warn('Vault is not a git repository');
    info('Run: claude-dev-stack sync init');
    console.log('');
    return;
  }

  switch (action) {
    case 'push': {
      info('Committing and pushing...');

      spawnSync('git', ['add', '.'], { cwd: vaultPath, stdio: 'pipe' });

      const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const commitResult = spawnSync('git', ['commit', '-m', `Vault update ${date}`], {
        cwd: vaultPath, stdio: 'pipe',
      });

      if (commitResult.status === 0) {
        ok('Changes committed');
      } else {
        info('No changes to commit');
      }

      if (!hasRemote(vaultPath)) {
        warn('No remote configured');
        info('Run: claude-dev-stack sync init');
        break;
      }

      const pushResult = spawnSync('git', ['push'], { cwd: vaultPath, stdio: 'pipe', timeout: 30000 });
      if (pushResult.status === 0) {
        ok('Pushed to remote');
      } else {
        warn('Push failed — check remote configuration');
      }
      break;
    }

    case 'pull': {
      info('Pulling latest...');
      const pullResult = spawnSync('git', ['pull'], { cwd: vaultPath, stdio: 'pipe', timeout: 30000 });
      if (pullResult.status === 0) {
        ok('Vault updated from remote');
      } else {
        warn('Pull failed — check remote configuration');
      }
      break;
    }

    case 'status': {
      const statusResult = spawnSync('git', ['status', '--short'], { cwd: vaultPath, stdio: 'pipe' });
      const status = statusResult.stdout?.toString().trim();
      if (status) {
        info('Uncommitted changes:');
        console.log(`    ${c.dim}${status}${c.reset}`);
      } else {
        ok('Vault is up to date');
      }

      const remote = spawnSync('git', ['remote', '-v'], { cwd: vaultPath, stdio: 'pipe' });
      if (remote.stdout?.toString().trim()) {
        console.log('');
        info('Remote:');
        console.log(`    ${c.dim}${remote.stdout.toString().trim().split('\n')[0]}${c.reset}`);
      }
      break;
    }

    default:
      info('Vault is a git repo. Available actions:');
      console.log(`    ${c.white}claude-dev-stack sync push${c.reset}    ${c.dim}Commit and push${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack sync pull${c.reset}    ${c.dim}Pull latest${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack sync status${c.reset}  ${c.dim}Show status${c.reset}`);
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0];

  switch (subcommand) {
    case 'export':
      await exportVault();
      break;
    case 'sync':
      await syncVault(args[1]);
      break;
    case 'import':
    default: {
      const { main: importMain } = await import('./import.mjs');
      await importMain(args.slice(subcommand === 'import' ? 1 : 0));
      break;
    }
  }
}
