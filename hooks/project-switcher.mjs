#!/usr/bin/env node
/**
 * hooks/project-switcher.mjs — UserPromptSubmit hook (SKL-03)
 *
 * Replaces the project-switcher skill. Reads JSON payload from stdin, parses
 * project names from VAULT_PATH/project-map.json, uses word-boundary regex to
 * detect mentions of a known project that differs from the cwd-resolved project,
 * and emits a switch hint (≤200 chars) to stdout. Claude Code prepends that text
 * as additionalContext.
 *
 * Design:
 *   - Fail-silent (exit 0, no stdout) on empty stdin / malformed JSON / missing
 *     registry / no match / current-project match
 *   - No npm dependencies
 *   - ReDoS-safe: alternation of literal project names (escaped), no nested quantifiers
 *   - Project names in project-map.json are ASCII kebab-case by convention, so
 *     JS `\b` works correctly here (unlike dev-router's Cyrillic keywords)
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MAX_PROMPT_LEN = 4096;

function resolveVaultPath() {
  // If VAULT_PATH env var is explicitly set (even to empty/missing dir),
  // honor it strictly — do NOT fall back to ~/vault, otherwise tests with
  // a bogus VAULT_PATH would silently leak into the user's real registry.
  if (Object.prototype.hasOwnProperty.call(process.env, 'VAULT_PATH')) {
    const env = process.env.VAULT_PATH;
    return env || null;
  }
  return join(homedir(), 'vault');
}

function resolveRealPath(p) {
  try { return realpathSync(p); } catch { return p; }
}

function loadProjectMap(vaultPath) {
  if (!vaultPath) return null;
  const mapPath = join(vaultPath, 'project-map.json');
  if (!existsSync(mapPath)) return null;
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    const projects = data?.projects;
    if (!projects || typeof projects !== 'object') return null;
    return projects; // { absPath: projectName }
  } catch {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCurrentProject(projectMap, cwd) {
  // Longest-prefix match wins. Compare both the literal cwd and its realpath
  // against both the literal and realpath-normalized entries — handles cases
  // where the mkdtempSync base is /var/folders but process.cwd() returns
  // /private/var/folders (macOS symlink).
  const cwdReal = resolveRealPath(cwd);
  let best = null;
  let bestLen = -1;
  for (const [absPath, name] of Object.entries(projectMap)) {
    const candidates = [absPath, resolveRealPath(absPath)];
    for (const base of candidates) {
      for (const c of [cwd, cwdReal]) {
        if (c === base || c.startsWith(base + '/')) {
          if (base.length > bestLen) {
            bestLen = base.length;
            best = name;
          }
        }
      }
    }
  }
  return best;
}

async function main() {
  let payload;
  try {
    const chunks = [];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (c) => chunks.push(c));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
    });
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  if (!prompt) return;

  const vaultPath = resolveVaultPath();
  const projectMap = loadProjectMap(vaultPath);
  if (!projectMap) return;

  const text = prompt.length > MAX_PROMPT_LEN ? prompt.slice(0, MAX_PROMPT_LEN) : prompt;

  const current = resolveCurrentProject(projectMap, process.cwd());

  // Reverse map: name → path, and build a stable iteration order
  const entries = Object.entries(projectMap).map(([path, name]) => ({ name, path }));

  for (const { name, path } of entries) {
    if (!name) continue;
    if (current && name === current) continue; // do not emit for current project
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
    if (re.test(text)) {
      const hint = `PROJECT HINT: User mentioned '${name}' (path: ${path}). Switch cwd before acting if they want to work there.`;
      // Emit at most one hint — first non-current match wins
      process.stdout.write(hint.length > 200 ? hint.slice(0, 200) : hint);
      return;
    }
  }
}

main().catch(() => {}).finally(() => process.exit(0));
