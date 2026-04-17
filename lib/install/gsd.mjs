// lib/install/gsd.mjs — GSD (Get Shit Done) installation step

import { existsSync, readFileSync, readdirSync } from 'fs';
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

// ── Apply shipped patches ────────────────────────────────────────
/**
 * Apply every `patches/*.patch` shipped in this package to the user's
 * ~/.claude/get-shit-done/ install. Idempotent: patches that are already
 * applied report "Reversed (or previously applied)" from `patch --dry-run`
 * and are skipped. Failed patches print a warning but do NOT abort the
 * wizard — matches Phase 27 SHA-diff fail-soft philosophy.
 *
 * Per Phase 40 D-126: GSD lives at ~/.claude/get-shit-done/ shared across
 * all projects. We never edit GSD directly from project install — patches
 * survive /gsd-update via re-application by hooks/gsd-auto-reapply-patches.sh.
 *
 * @param {string} pkgRoot Absolute path to claude-dev-stack repo root
 * @returns {{ applied: string[], skipped: string[], failed: string[] }}
 */
export function applyShippedPatches(pkgRoot) {
  const patchesDir = join(pkgRoot, 'patches');
  const gsdDir = join(homedir(), '.claude', 'get-shit-done');
  const result = { applied: [], skipped: [], failed: [] };

  if (!existsSync(patchesDir) || !existsSync(gsdDir)) return result;

  let patchFiles;
  try {
    patchFiles = readdirSync(patchesDir).filter((f) => f.endsWith('.patch'));
  } catch {
    return result;
  }

  for (const name of patchFiles) {
    const patchPath = join(patchesDir, name);

    // Dry-run: detect already-applied vs cleanly-applicable
    const dry = spawnSync('patch', ['--dry-run', '-p1', '-d', gsdDir, '-i', patchPath], {
      stdio: 'pipe', encoding: 'utf8', timeout: 10000,
    });

    const stderrLower = (dry.stderr || '').toLowerCase();
    const alreadyApplied = stderrLower.includes('reversed') || stderrLower.includes('previously applied');

    if (alreadyApplied) {
      result.skipped.push(name);
      continue;
    }

    if (dry.status !== 0) {
      warn(`Patch ${name} no longer applies cleanly — skipping. The hooks/gsd-auto-reapply-patches.sh runner will retry on next session.`);
      result.failed.push(name);
      continue;
    }

    // Real apply
    const real = spawnSync('patch', ['-p1', '-d', gsdDir, '-i', patchPath], {
      stdio: 'pipe', encoding: 'utf8', timeout: 10000,
    });

    if (real.status === 0) {
      ok(`Applied GSD patch: ${name}`);
      result.applied.push(name);
    } else {
      warn(`Patch ${name} dry-run passed but real apply failed — investigate manually`);
      result.failed.push(name);
    }
  }

  return result;
}

// ── Install: GSD ────────────────────────────────────────────────
export async function installGSD(stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, 'Installing GSD (Get Shit Done)');

  const installed = _installedGSDVersion();
  const latest = _latestGSDVersion();

  // D-08: If already latest — auto-skip
  if (installed && latest && installed === latest) {
    ok(`GSD: up to date (v${installed})`);
    if (pkgRoot) applyShippedPatches(pkgRoot);
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
    if (pkgRoot) applyShippedPatches(pkgRoot);
    return true;
  } else {
    warn('Auto-install failed. Run manually:');
    info('npx get-shit-done-cc@latest');
    return false;
  }
}
