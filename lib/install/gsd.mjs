// lib/install/gsd.mjs — GSD (Get Shit Done) installation step

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ok, warn, info, step, spawnSync } from '../shared.mjs';

// ── DX-11: Read installed GSD version from package.json ─────────
function _installedGSDVersion() {
  const pkgPath = join(homedir(), '.claude', 'get-shit-done', 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || null;
  } catch {
    return null;
  }
}

// ── DX-11: Query latest GSD version from npm registry ───────────
function _latestGSDVersion() {
  const result = spawnSync('npm', ['view', 'get-shit-done-cc', 'version'], {
    stdio: 'pipe', encoding: 'utf8', timeout: 10000,
  });
  if (result.status === 0) return result.stdout.trim() || null;
  return null;
}

// ── Install: GSD ────────────────────────────────────────────────
export function installGSD(stepNum, totalSteps) {
  step(stepNum, totalSteps, '🚀 Installing GSD (Get Shit Done)');

  // DX-11: check installed version vs latest before running npx
  const installed = _installedGSDVersion();
  if (installed) {
    const latest = _latestGSDVersion();
    if (latest && installed === latest) {
      ok(`GSD: up to date (v${installed})`);
      return true;
    }
    if (latest) {
      info(`GSD update available: v${installed} → v${latest}`);
    }
  }

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
