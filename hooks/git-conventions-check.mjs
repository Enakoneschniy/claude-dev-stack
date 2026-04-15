#!/usr/bin/env node
/**
 * hooks/git-conventions-check.mjs — PreToolUse hook (SKL-04)
 *
 * Validates git commit messages against the conventional commits spec.
 * Warn-only by default (exit 0 with stdout suggestion); strict mode (exit 2
 * blocking) opt-in via `.planning/config.json` → `workflow.commit_validation: "strict"`.
 *
 * Installer registers this hook with:
 *   matcher: "Bash"
 *   hooks[0].if: "Bash(git commit*)"
 *
 * Design:
 *   - Fail-silent on: empty stdin, malformed JSON, tool_name != "Bash",
 *     command does not contain "git commit", no -m extraction, heredoc-style commit,
 *     uncaught errors
 *   - Config parse failure falls back to WARN mode (never blocks on bad config)
 *   - No npm dependencies
 *   - ReDoS-safe regex: anchored, simple alternation
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_MSG_LEN = 1024;
const CONVENTIONAL_RE =
  /^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([^)]+\))?!?:\s.+/;

// Try to extract the -m/--message value from a raw shell command string.
// Returns the message (string) or null if nothing extractable.
function extractCommitMessage(command) {
  if (!command || typeof command !== 'string') return null;

  // Skip amend entirely — we cannot reliably validate amend operations
  if (/\bgit\s+commit\b.*\s--amend\b/.test(command)) return null;

  // Skip heredoc / command substitution — cannot reliably extract
  if (/-m\s*"?\$\(/.test(command) || /-m\s*"?<<</.test(command)) return null;

  // Try double-quoted: -m "..."
  const dq = command.match(/-m\s+"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (dq) return dq[1];

  // Try single-quoted: -m '...'
  const sq = command.match(/-m\s+'([^']*)'/);
  if (sq) return sq[1];

  // Try -m=...
  const eq = command.match(/-m=(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (eq) return eq[1] || eq[2] || eq[3] || null;

  return null;
}

function loadValidationMode(cwd) {
  // Returns 'strict' or 'warn'. Any failure → 'warn' (fail-open, never block).
  try {
    const cfgPath = join(cwd, '.planning', 'config.json');
    if (!existsSync(cfgPath)) return 'warn';
    const raw = readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg?.workflow?.commit_validation === 'strict') return 'strict';
    return 'warn';
  } catch {
    return 'warn';
  }
}

function buildSuggestion(msg) {
  const trimmed = (msg || '').trim().slice(0, 200);
  // If first word looks like it could be a type, rewrite as "type: rest"
  const parts = trimmed.split(/\s+/);
  const typeWords = new Set([
    'feat', 'fix', 'chore', 'docs', 'refactor', 'test',
    'ci', 'build', 'perf', 'style', 'revert',
  ]);
  if (parts.length >= 2 && typeWords.has(parts[0].toLowerCase())) {
    return `${parts[0].toLowerCase()}: ${parts.slice(1).join(' ')}`;
  }
  // Default: prefix with "fix: "
  return `fix: ${trimmed}`;
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

  // Defensive: tool_name must be Bash (matcher narrows, but hook is defensive too)
  if (payload?.tool_name !== 'Bash') return;
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return;
  if (!command.includes('git commit')) return;

  const message = extractCommitMessage(command);
  if (!message) return; // nothing extractable — silent

  // Cap length before regex (ReDoS guard)
  const capped = message.length > MAX_MSG_LEN ? message.slice(0, MAX_MSG_LEN) : message;

  if (CONVENTIONAL_RE.test(capped)) return; // valid — silent

  const suggestion = buildSuggestion(capped);
  const mode = loadValidationMode(process.cwd());

  if (mode === 'strict') {
    const explain =
      `git-conventions: commit message "${capped}" is not conventional. ` +
      `Try: "${suggestion}". Strict mode is enabled (workflow.commit_validation=strict); blocking.`;
    process.stderr.write(explain.slice(0, 500));
    process.exit(2);
  }

  // warn mode (default)
  const warning =
    `git-conventions warning: commit message "${capped}" is not conventional. ` +
    `Try: "${suggestion}". (warn-only; set workflow.commit_validation=strict to block)`;
  process.stdout.write(warning.slice(0, 500));
}

main().catch(() => {}).finally(() => {
  // Only use default exit if we haven't already set one via process.exit(2)
  if (process.exitCode == null) process.exit(0);
});
