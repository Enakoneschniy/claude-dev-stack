// lib/install/detect.mjs — Detect existing claude-dev-stack install state

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

// ── VAULT_CANDIDATES (D-09 — same order as lib/projects.mjs findVault()) ────
const VAULT_CANDIDATES = [
  join(homedir(), 'vault'),
  join(homedir(), 'Vault'),
  join(homedir(), '.vault'),
  join(homedir(), 'obsidian-vault'),
  join(homedir(), 'Documents', 'vault'),
];

// ── detectInstallState() ─────────────────────────────────────────────────────
export function detectInstallState() {
  // 1. Find vault — first candidate with both meta/ and projects/ subdirs
  const vaultPath = VAULT_CANDIDATES.find(p =>
    existsSync(join(p, 'meta')) && existsSync(join(p, 'projects'))
  ) || null;

  // 2. Check hooks (D-16) — read settings.json, look for session-start-context
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let hooksInstalled = false;
  if (existsSync(settingsPath)) {
    try {
      const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
      hooksInstalled = (s.hooks?.SessionStart || []).some(e =>
        e.hooks?.some(h => h.command?.includes('session-start-context'))
      );
    } catch {
      // Corrupt settings.json — treat as hooks not installed
    }
  }

  // 3. Read git remote from vault (D-13)
  let gitRemote = null;
  if (vaultPath && existsSync(join(vaultPath, '.git'))) {
    const r = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: vaultPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (r.status === 0) gitRemote = r.stdout.trim();
  }

  // 4. Parse projects from project-registry.md (D-15)
  const projects = [];
  if (vaultPath) {
    const regPath = join(vaultPath, 'meta', 'project-registry.md');
    if (existsSync(regPath)) {
      try {
        const content = readFileSync(regPath, 'utf8');
        const rowRegex = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
        let match;
        while ((match = rowRegex.exec(content)) !== null) {
          const name = match[1].trim();
          const path = match[3].trim();
          // Skip header and separator rows
          if (name === 'name' || name === 'Name') continue;
          if (name.startsWith('-') || path.includes('---') || path.includes('path')) continue;
          if (name.includes('---')) continue;
          projects.push({ name, path });
        }
      } catch {
        // Could not read or parse registry — return empty array
      }
    }
  }

  // 5. Profile — always null for v1 (D-07 deferred per CONTEXT.md)
  return { vaultExists: !!vaultPath, vaultPath, hooksInstalled, gitRemote, projects, profile: null };
}
