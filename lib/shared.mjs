/**
 * Shared utilities for claude-dev-stack CLI
 */

import prompts from 'prompts';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

// ── Colors ──────────────────────────────────────────────────────
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

export const ok   = (msg) => console.log(`    ${c.green}✔${c.reset} ${msg}`);
export const fail = (msg) => console.log(`    ${c.red}✘${c.reset} ${msg}`);
export const warn = (msg) => console.log(`    ${c.yellow}⚠${c.reset} ${msg}`);
export const info = (msg) => console.log(`    ${c.blue}ℹ${c.reset} ${msg}`);

// ── Ctrl+C ──────────────────────────────────────────────────────
const onCancel = () => {
  console.log(`\n  ${c.dim}Aborted.${c.reset}\n`);
  process.exit(0);
};

export async function prompt(questions, opts) {
  return prompts(questions, { onCancel, ...opts });
}

// ── Shell helpers ───────────────────────────────────────────────
// Note: execSync is used only with hardcoded commands, not user input
export function runCmd(command, opts = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch { return null; }
}

export function hasCommand(name) {
  return runCmd(`which ${name}`) !== null;
}

export function mkdirp(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Create directory + .gitkeep file so empty dirs are tracked by git.
 * Important for vault folders (sessions, decisions, docs) that start empty.
 */
export function mkdirpKeep(dir) {
  mkdirp(dir);
  const gitkeep = join(dir, '.gitkeep');
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, '');
  }
}

export function step(num, total, title) {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Step ${num} of ${total} —${c.reset} ${c.bold}${title}${c.reset}`);
  console.log('');
}

// ── Path input with directory suggestions ───────────────────────
export async function askPath(message, defaultVal) {
  return askPathAutocomplete(message || 'Path', defaultVal);
}

// ── Path input via prompts autocomplete (works after other prompts calls) ──
export async function askPathAutocomplete(message, defaultVal) {
  function getDirSuggestions(input) {
    const expanded = (input || defaultVal || '').replace(/^~/, homedir());
    const dir = expanded.endsWith('/') ? expanded : dirname(expanded);
    const prefix = expanded.endsWith('/') ? '' : basename(expanded);

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'));

      return entries
        .filter(e => !prefix || e.name.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(e => {
          const full = join(dir, e.name);
          return {
            title: full.replace(homedir(), '~') + '/',
            value: full,
          };
        });
    } catch {
      return [];
    }
  }

  const { value } = await prompts({
    type: 'autocomplete',
    name: 'value',
    message,
    initial: defaultVal || '',
    suggest: (input) => Promise.resolve(getDirSuggestions(input)),
    fallback: defaultVal || '',
  }, { onCancel: () => { process.exit(0); } });

  return value || defaultVal || '';
}

// ── Directory listing ───────────────────────────────────────────
export function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => ({ name: e.name, path: join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ── Paths ───────────────────────────────────────────────────────
export const SKILLS_DIR = join(homedir(), '.claude', 'skills');
export const AGENTS_DIR = join(homedir(), '.claude', 'agents');
export const CLAUDE_DIR = join(homedir(), '.claude');

export { spawnSync, existsSync, homedir };
