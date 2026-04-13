/**
 * lib/handoff-cli.mjs — CLI commands for post-reset handoff (LIMIT-04)
 *
 * Commands:
 *   claude-dev-stack handoff status  — show handoff state, exit 0 if resumable, 1 if not
 */

import { ok, warn, info, fail } from './shared.mjs';
import { readHandoffState, formatHandoffSummary, HandoffError, MISSING_STOPPED_AT } from './handoff.mjs';

export async function main(args) {
  const sub = args[0];

  switch (sub) {
    case 'status': {
      try {
        const state = readHandoffState(process.cwd());
        console.log('');
        console.log(`  Handoff State (LIMIT-04)`);
        console.log(`  Status: resumable`);
        console.log('');
        console.log(formatHandoffSummary(state));
        console.log('');
        ok('Ready to resume — run /gsd-resume-work to continue');
        process.exit(0);
      } catch (err) {
        if (err instanceof HandoffError) {
          console.log('');
          console.log(`  Handoff State (LIMIT-04)`);
          if (err.code === MISSING_STOPPED_AT) {
            console.log(`  Status: no interrupted work`);
            console.log('');
            info(err.message);
          } else {
            console.log(`  Status: not resumable`);
            console.log('');
            fail(err.message);
          }
          console.log('');
          process.exit(1);
        }
        throw err;
      }
    }

    default: {
      console.log('');
      console.log(`  Handoff (LIMIT-04)`);
      console.log('');
      info(`Commands:`);
      info(`  claude-dev-stack handoff status  — check if there is work to resume`);
      console.log('');
      info(`Usage in scheduled tasks:`);
      info(`  Run 'handoff status' first — exits 0 if resumable, 1 if not.`);
      info(`  On exit 0, run /gsd-resume-work to continue from stopped_at.`);
      console.log('');
      break;
    }
  }
}
