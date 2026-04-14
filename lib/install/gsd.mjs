// lib/install/gsd.mjs — GSD (Get Shit Done) installation step

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ok, warn, info, step, spawnSync, prompt } from '../shared.mjs';

// ── Internal helpers ─────────────────────────────────────────────

function _installedGSDVersion() {
  const pkgPath = join(homedir(), '.claude', 'get-shit-done', 'package.json');
  if (!existsSync(pkgPath)) return null;
  try { return JSON.parse(readFileSync(pkgPath, 'utf8')).version || null; }
  catch { return null; }
}

function _latestGSDVersion() {
  const result = spawnSync('npm', ['view', 'get-shit-done-cc', 'version'], {
    stdio: 'pipe', encoding: 'utf8', timeout: 10000,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

// ── Install: GSD ────────────────────────────────────────────────
export async function installGSD(stepNum, totalSteps) {
  step(stepNum, totalSteps, 'Installing GSD (Get Shit Done)');

  const installed = _installedGSDVersion();
  const latest = _latestGSDVersion();

  // D-08: If already latest — auto-skip
  if (installed && latest && installed === latest) {
    ok(`GSD: up to date (v${installed})`);
    return true;
  }

  // D-09: If outdated — show Update / Skip select
  if (installed && latest && installed !== latest) {
    info(`GSD: v${installed} installed, v${latest} available`);
    const { action } = await prompt({
      type: 'select',
      name: 'action',
      message: `GSD: v${installed} → v${latest} available`,
      choices: [
        { title: 'Update', value: 'update' },
        { title: 'Skip', value: 'skip' },
      ],
      initial: 0,
    });
    if (action === 'skip') {
      info('GSD update skipped');
      return true;
    }
  }

  // Not installed or user chose update — run npx
  info('Running npx get-shit-done-cc@latest (may take a minute)...');
  const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
    stdio: 'pipe', timeout: 120000,
  });

  if (result.status === 0) {
    ok('GSD installed globally');
    return true;
  } else {
    warn('Auto-install failed. Run manually:');
    info('npx get-shit-done-cc@latest');
    return false;
  }
}
