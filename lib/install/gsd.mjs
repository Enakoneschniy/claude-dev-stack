// lib/install/gsd.mjs — CDS Workflow Engine installation step

import { existsSync, readFileSync, readdirSync, cpSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ok, warn, info, step, mkdirp } from '../shared.mjs';

// Phase 50: patches mechanism dissolved — CDS owns the source now

// ── Internal helpers ─────────────────────────────────────────────

function _installedCdsWorkflowVersion(dest) {
  const versionPath = join(dest, 'VERSION');
  return existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : null;
}

function _bundledVersion(vendorSrc) {
  const versionPath = join(vendorSrc, 'VERSION');
  return existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : 'unknown';
}

// ── Apply shipped patches (no-op) ────────────────────────────────
/**
 * Phase 50: patches mechanism dissolved — CDS owns the workflow engine source
 * (vendored at vendor/cds-workflow/). This function is kept as a no-op for
 * backward compatibility with any code that imports it.
 *
 * @param {string} pkgRoot Absolute path to claude-dev-stack repo root
 * @returns {{ applied: string[], skipped: string[], failed: string[] }}
 */
export function applyShippedPatches(_pkgRoot) {
  // Phase 50: patches mechanism dissolved — CDS owns the source now
  return { applied: [], skipped: [], failed: [] };
}

// ── Install: CDS Workflow Engine ─────────────────────────────────
export async function installGSD(stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, 'Installing CDS Workflow Engine');

  const vendorSrc = join(pkgRoot, 'vendor', 'cds-workflow');
  const dest = join(homedir(), '.claude', 'cds-workflow');

  if (!existsSync(vendorSrc)) {
    warn('vendor/cds-workflow not found in package — skipping');
    return false;
  }

  const installed = _installedCdsWorkflowVersion(dest);
  const bundled = _bundledVersion(vendorSrc);

  if (installed === bundled) {
    ok(`CDS workflow engine: up to date (v${installed})`);
    return true;
  }

  info(`Installing CDS workflow engine v${bundled}...`);
  mkdirp(join(homedir(), '.claude'));
  cpSync(vendorSrc, dest, { recursive: true });

  // Install agents separately — merge into ~/.claude/agents/ (global Claude agents dir)
  // Per Pitfall 2: agents go to ~/.claude/agents/, NOT into ~/.claude/cds-workflow/agents/
  const agentsSrc = join(vendorSrc, 'agents');
  if (existsSync(agentsSrc)) {
    const agentsDest = join(homedir(), '.claude', 'agents');
    mkdirp(agentsDest);
    for (const f of readdirSync(agentsSrc).filter(f => f.startsWith('gsd-'))) {
      cpSync(join(agentsSrc, f), join(agentsDest, f));
    }
  }

  // Install skills — merge into ~/.claude/skills/
  const skillsSrc = join(vendorSrc, 'skills');
  if (existsSync(skillsSrc)) {
    const skillsDest = join(homedir(), '.claude', 'skills');
    mkdirp(skillsDest);
    cpSync(skillsSrc, skillsDest, { recursive: true });
  }

  ok(`CDS workflow engine installed (v${bundled})`);
  return true;
}
