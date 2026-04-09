/**
 * Update all installed components.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { c, ok, fail, warn, info, prompt, hasCommand, SKILLS_DIR, spawnSync } from './shared.mjs';

export async function main() {
  console.log('');
  console.log(`  ${c.bold}Update components${c.reset}`);
  console.log('');

  const updates = [];

  // ── 1. Git-based skills (pull latest) ──
  if (existsSync(SKILLS_DIR)) {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory());

    for (const dir of dirs) {
      const gitDir = join(SKILLS_DIR, dir.name, '.git');
      if (existsSync(gitDir)) {
        updates.push({ name: dir.name, type: 'skill-git', path: join(SKILLS_DIR, dir.name) });
      }
    }
  }

  // ── 2. GSD ──
  const hasGsd = existsSync(SKILLS_DIR) &&
    readdirSync(SKILLS_DIR).some(d => d.startsWith('gsd-'));
  if (hasGsd) {
    updates.push({ name: 'GSD (Get Shit Done)', type: 'gsd' });
  }

  // ── 3. Claude Code itself ──
  if (hasCommand('claude')) {
    updates.push({ name: 'Claude Code CLI', type: 'claude' });
  }

  if (updates.length === 0) {
    info('Nothing to update');
    console.log('');
    return;
  }

  // Show what will be updated
  for (const u of updates) {
    info(`${u.name} ${c.dim}(${u.type})${c.reset}`);
  }

  console.log('');
  const { confirm } = await prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Update ${updates.length} component(s)?`,
    initial: true,
  });

  if (!confirm) {
    info('Cancelled');
    return;
  }

  console.log('');

  for (const u of updates) {
    switch (u.type) {
      case 'skill-git': {
        info(`Updating ${u.name}...`);
        const result = spawnSync('git', ['pull', '--quiet'], {
          cwd: u.path, stdio: 'pipe', timeout: 30000,
        });
        if (result.status === 0) {
          ok(`${u.name} updated`);
        } else {
          warn(`${u.name} — pull failed`);
        }
        break;
      }

      case 'gsd': {
        info('Updating GSD...');
        const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
          stdio: 'pipe', timeout: 120000,
        });
        if (result.status === 0) {
          ok('GSD updated');
        } else {
          warn('GSD update failed. Run manually: npx get-shit-done-cc@latest');
        }
        break;
      }

      case 'claude': {
        info('Checking Claude Code updates...');
        const result = spawnSync('claude', ['update'], {
          stdio: 'inherit', timeout: 60000,
        });
        if (result.status === 0) {
          ok('Claude Code checked');
        } else {
          warn('Claude Code update check failed');
        }
        break;
      }
    }
  }

  console.log('');
  ok(`${c.bold}Update complete${c.reset}`);
  console.log('');
}
