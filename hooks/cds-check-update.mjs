#!/usr/bin/env node
/**
 * cds-check-update.mjs — Detached npm view check for CDS updates.
 * Called by SessionStart hook. Spawns a background process that writes
 * ~/.cds/update-check.json with latest version info. Never blocks session start.
 */

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

// Read current version from package.json
let currentVersion = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  currentVersion = pkg.version || '0.0.0';
} catch {
  // If package.json can't be read, exit silently
  process.exit(0);
}

const cacheDir = join(homedir(), '.cds');
const cacheFile = join(cacheDir, 'update-check.json');

// Ensure cache directory exists
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

// Spawn detached child to check npm registry without blocking
const child = spawn(process.execPath, ['-e', `
  const fs = require('fs');
  const { execFileSync } = require('child_process');

  const cacheFile = ${JSON.stringify(cacheFile)};
  const currentVersion = ${JSON.stringify(currentVersion)};

  // Compare semver: true if a > b
  // Strips pre-release suffixes (e.g. '1-alpha.1' -> '1') before comparison
  function isNewer(a, b) {
    const pa = (a || '').split('.').map(s => Number(s.replace(/-.*/, '')) || 0);
    const pb = (b || '').split('.').map(s => Number(s.replace(/-.*/, '')) || 0);
    for (let i = 0; i < 3; i++) {
      if (pa[i] > pb[i]) return true;
      if (pa[i] < pb[i]) return false;
    }
    return false;
  }

  let latest = null;
  try {
    latest = execFileSync('npm', ['view', 'claude-dev-stack', 'version'], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    }).trim();
  } catch (e) {
    // npm unreachable or timeout — write cache with no update
  }

  const result = {
    latest: latest || null,
    current: currentVersion,
    updateAvailable: latest ? isNewer(latest, currentVersion) : false,
    checked: new Date().toISOString(),
  };

  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
`], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true,
});

child.unref();
