/**
 * lib/budget-cli.mjs — CLI commands for budget detection configuration (LIMIT-01)
 *
 * Commands:
 *   claude-dev-stack budget              — show current threshold and state
 *   claude-dev-stack budget set <pct>   — set threshold percentage (0–100)
 *   claude-dev-stack budget reset        — clear warning state manually
 */

import { loadThreshold, saveThreshold, loadState, clearState, DEFAULT_THRESHOLD } from './budget.mjs';
import { ok, warn, info, fail } from './shared.mjs';

export async function main(args) {
  const sub = args[0];

  switch (sub) {
    case 'set': {
      const raw = parseInt(args[1], 10);
      if (isNaN(raw) || raw < 0 || raw > 100) {
        fail(`Usage: claude-dev-stack budget set <0-100>`);
        process.exit(1);
      }
      saveThreshold(raw);
      ok(`Budget threshold set to ${raw}%`);
      break;
    }

    case 'reset': {
      clearState();
      ok('Budget warning state cleared — warning will fire again on next threshold crossing');
      break;
    }

    default: {
      const threshold = loadThreshold();
      const state = loadState();
      console.log('');
      console.log(`  Budget Detection (LIMIT-01)`);
      console.log(`  Threshold : ${threshold}% (default: ${DEFAULT_THRESHOLD}%)`);
      if (state && state.firedForSession) {
        console.log(`  Last warn : session ${state.firedForSession} at ${state.firedAtPercent}%`);
      } else {
        console.log(`  Last warn : not fired this session`);
      }
      console.log('');
      info(`To change: claude-dev-stack budget set <0-100>`);
      info(`To reset:  claude-dev-stack budget reset`);
      console.log('');
      break;
    }
  }
}
