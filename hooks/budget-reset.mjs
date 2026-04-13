#!/usr/bin/env node
/**
 * hooks/budget-reset.mjs — SessionStart hook: resets budget warning state.
 *
 * Clears ~/.claude/budget-state.json at the start of each session so the
 * budget warning can fire once per session crossing (not once globally).
 *
 * Silent on all errors — never disrupts session start.
 * Always exits 0.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    const budget = await import(join(__dirname, '..', 'lib', 'budget.mjs'));
    budget.clearState();
  } catch {
    // lib not available or state file error — silent skip
  }
}

main().catch(() => {}).finally(() => {
  process.exit(0);
});
