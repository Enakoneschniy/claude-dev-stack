#!/usr/bin/env node
/**
 * hooks/idea-capture-trigger.mjs — UserPromptSubmit hook (CAPTURE-02/03/04)
 *
 * Detects idea-trigger phrases (Russian + English) in user prompts and
 * emits a hint nudging Claude to invoke /gsd-note for capture.
 *
 * Per D-18..D-22 in vault cds-core-independence-plan.md.
 *
 * Design:
 *   - Fail-silent (exit 0) on empty stdin / malformed JSON / missing config
 *   - No npm dependencies — node stdlib only
 *   - ReDoS-safe: MAX_PROMPT_LEN=4096, escaped-literal alternation, no nested quantifiers
 *   - First-match-wins (Russian checked before English — deterministic order)
 *   - Cyrillic uses explicit boundary class (JS \b is ASCII-only)
 *   - Optional telemetry bump in ~/.claude/cds-stats.json (CAPTURE-04, opt-out by deleting file)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MAX_PROMPT_LEN = 4096;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIGGERS_PATH = join(__dirname, 'idea-capture-triggers.json');
const STATS_DIR = join(homedir(), '.claude');
const STATS_PATH = join(STATS_DIR, 'cds-stats.json');

// Cyrillic boundary classes — JS \b is ASCII-only, so we use explicit character sets.
// Matches start-of-string, end-of-string, or common whitespace/punctuation separators.
const CYR_BOUNDARY_HEAD = "(?:^|[\\s.,!?;:()\"'«»—-])";
const CYR_BOUNDARY_TAIL = "(?:$|[\\s.,!?;:()\"'«»—-])";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadTriggers() {
  try {
    if (!existsSync(TRIGGERS_PATH)) return null;
    const data = JSON.parse(readFileSync(TRIGGERS_PATH, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    const russian = Array.isArray(data.russian) ? data.russian.filter((s) => typeof s === 'string' && s.length > 0) : [];
    const english = Array.isArray(data.english) ? data.english.filter((s) => typeof s === 'string' && s.length > 0) : [];
    if (russian.length === 0 && english.length === 0) return null;
    return { russian, english };
  } catch {
    return null;
  }
}

function bumpTelemetry() {
  try {
    mkdirSync(STATS_DIR, { recursive: true });
    let stats = {};
    if (existsSync(STATS_PATH)) {
      try {
        stats = JSON.parse(readFileSync(STATS_PATH, 'utf8'));
      } catch {
        stats = {};
      }
    }
    if (typeof stats !== 'object' || stats === null || Array.isArray(stats)) stats = {};
    stats.idea_capture_hints_fired = (Number(stats.idea_capture_hints_fired) || 0) + 1;
    writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2) + '\n');
  } catch {
    /* fail-silent — telemetry must never affect hook exit status */
  }
}

async function readStdin(timeoutMs = 500) {
  const chunks = [];
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve();
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return Buffer.concat(chunks).toString('utf8').trim();
}

function findMatch(text, triggers) {
  // Russian first (explicit boundary class — JS \b is ASCII-only)
  for (const phrase of triggers.russian || []) {
    const re = new RegExp(`${CYR_BOUNDARY_HEAD}${escapeRegex(phrase)}${CYR_BOUNDARY_TAIL}`, 'i');
    if (re.test(text)) return phrase;
  }
  // English second (ASCII \b works fine)
  for (const phrase of triggers.english || []) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');
    if (re.test(text)) return phrase;
  }
  return null;
}

async function main() {
  const raw = await readStdin();
  if (!raw) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  if (!prompt) return;

  const triggers = loadTriggers();
  if (!triggers) return;

  // ReDoS guard: truncate very long input before regex testing (T-32-01)
  const text = prompt.length > MAX_PROMPT_LEN ? prompt.slice(0, MAX_PROMPT_LEN) : prompt;

  const matched = findMatch(text, triggers);
  if (!matched) return;

  // Exact hint format per CAPTURE-03 / D-21.
  // {phrase} is the literal entry from idea-capture-triggers.json (NOT user input) —
  // prevents T-32-02 (user prompt injection into Claude's context via this hook).
  const hint = `💡 IDEA-CAPTURE HINT: Detected trigger phrase "${matched}" in user message. Consider invoking /gsd-note to capture the idea to .planning/notes/.`;
  process.stdout.write(hint);

  bumpTelemetry();
}

main().catch(() => {}).finally(() => process.exit(0));
