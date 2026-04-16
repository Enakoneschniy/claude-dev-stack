#!/usr/bin/env node
/**
 * scripts/check-no-shell-interpolation.mjs
 *
 * Phase 36 structural guard. Scans a given file for unsafe subprocess patterns
 * (shell-interpreting variant with interpolation or concatenation). Exits 1
 * when any unsafe pattern is found, 0 otherwise.
 *
 * Invoked by the `pretest` npm script to run before the full test suite.
 *
 * Character-class regexes prevent this script from matching its own source
 * when a developer scans the scripts/ directory.
 */
import { readFileSync } from 'node:fs';

const target = process.argv[2];
if (!target) {
  process.stderr.write('usage: check-no-shell-interpolation.mjs <file>\n');
  process.exit(2);
}

let src;
try {
  src = readFileSync(target, 'utf8');
} catch (err) {
  process.stderr.write(`cannot read ${target}: ${err.message}\n`);
  process.exit(2);
}

const lines = src.split('\n');
let failures = 0;

const UNSAFE_PATTERNS = [
  {
    re: /[e][x][e][c]Sync\s*\([^)]*`[^`]*\$\{/,
    reason: 'shell-command with template-literal interpolation',
  },
  {
    re: /[e][x][e][c]Sync\s*\([^)]*\+\s*/,
    reason: 'shell-command with string concatenation',
  },
  {
    re: /child_process\.[e][x][e][c]\s*\(/,
    reason: 'shell-interpreting variant — use spawn or execFile',
  },
  {
    re: /^\s*[e][x][e][c]\s*\(/,
    reason: 'bare shell-call — use spawn or execFile',
  },
];

lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return;
  for (const { re, reason } of UNSAFE_PATTERNS) {
    if (re.test(line)) {
      process.stderr.write(`FAIL: ${target}:${idx + 1}: ${reason}\n`);
      process.stderr.write(`      ${line.trim()}\n`);
      failures++;
    }
  }
});

if (failures > 0) {
  process.stderr.write(`\n${failures} unsafe subprocess pattern(s) in ${target}\n`);
  process.exit(1);
}
process.exit(0);
