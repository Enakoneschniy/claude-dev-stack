/**
 * Shared utilities for claude-dev-stack CLI
 */

import prompts from 'prompts';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { createInterface } from 'readline';
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

export function step(num, total, title) {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Step ${num} of ${total} —${c.reset} ${c.bold}${title}${c.reset}`);
  console.log('');
}

// ── Path input with tab completion ──────────────────────────────
export function askPath(message, defaultVal) {
  return new Promise((res) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line) => {
        const expanded = (line || '').replace(/^~/, homedir());
        const dir = expanded.endsWith('/') ? expanded : dirname(expanded);
        const prefix = expanded.endsWith('/') ? '' : basename(expanded);

        try {
          const entries = readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'));

          const matches = entries
            .filter(e => !prefix || e.name.startsWith(prefix))
            .map(e => {
              const full = join(dir, e.name) + '/';
              return line.startsWith('~') ? full.replace(homedir(), '~') : full;
            });

          return [matches.length ? matches : [line], line];
        } catch {
          return [[line], line];
        }
      },
    });

    const hint = defaultVal ? `${c.dim}[${defaultVal}]${c.reset} ` : '';
    rl.question(`    ${c.cyan}→${c.reset} ${hint}`, (answer) => {
      rl.close();
      res(answer || defaultVal || '');
    });
  });
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
