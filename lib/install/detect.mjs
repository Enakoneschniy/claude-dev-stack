// lib/install/detect.mjs — Detect existing claude-dev-stack install state

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

// ── readInstallProfile() — read saved profile from vault ─────────────────────
export function readInstallProfile(vaultPath) {
  if (!vaultPath) return null;
  const profilePath = join(vaultPath, 'meta', 'install-profile.json');
  if (!existsSync(profilePath)) return null;
  try {
    return JSON.parse(readFileSync(profilePath, 'utf8'));
  } catch {
    return null;
  }
}

// ── detectProjectsDir() — derive common prefix from project-map.json ─────────
export function detectProjectsDir(vaultPath) {
  if (!vaultPath) return null;
  const mapPath = join(vaultPath, 'project-map.json');
  if (!existsSync(mapPath)) return null;
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    const paths = Object.keys(data.projects || {}).filter(Boolean);
    if (paths.length === 0) return null;
    // Find the common parent directory
    const parts = paths[0].split('/');
    let common = parts.slice(0, -1);
    for (const p of paths.slice(1)) {
      const pparts = p.split('/');
      const parent = pparts.slice(0, -1);
      while (common.length > 0 && common.join('/') !== parent.slice(0, common.length).join('/')) {
        common = common.slice(0, -1);
      }
    }
    const result = common.join('/');
    return result.length > 1 ? result : null;
  } catch {
    return null;
  }
}

// ── detectRegisteredPaths() — return project-map.json path→name mapping ──────
export function detectRegisteredPaths(vaultPath) {
  if (!vaultPath) return {};
  const mapPath = join(vaultPath, 'project-map.json');
  if (!existsSync(mapPath)) return {};
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    return data.projects || {};
  } catch {
    return {};
  }
}

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

  // 5. Detect GSD installation (LIMIT-03)
  const gsdInstalled = existsSync(join(homedir(), '.claude', 'get-shit-done'));

  // 6. Detect loop.md installation per project (LIMIT-03)
  const loopMdByProject = Object.fromEntries(
    projects.map(p => [p.name, existsSync(join(p.path, '.claude', 'loop.md'))])
  );

  // 7. Profile — read from vault/meta/install-profile.json (DX-07, DX-10)
  const profile = readInstallProfile(vaultPath);

  // 8. Detect projects directory from project-map.json common prefix (DX-08)
  const projectsDir = detectProjectsDir(vaultPath);

  // 9. Registered paths from project-map.json (DX-09)
  const registeredPaths = detectRegisteredPaths(vaultPath);

  // 10. DX-12: Detect NotebookLM authentication via storage_state.json
  const notebooklmAuthenticated = existsSync(join(homedir(), '.notebooklm', 'storage_state.json'));

  return { vaultExists: !!vaultPath, vaultPath, hooksInstalled, gitRemote, projects, profile, projectsDir, registeredPaths, gsdInstalled, loopMdByProject, notebooklmAuthenticated };
}
