// lib/install/gsd.mjs — GSD (Get Shit Done) installation step

import { ok, warn, info, step, spawnSync } from '../shared.mjs';

// ── Install: GSD ────────────────────────────────────────────────
export function installGSD(stepNum, totalSteps) {
  step(stepNum, totalSteps, '🚀 Installing GSD (Get Shit Done)');

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
