#!/usr/bin/env node
/**
 * Thin wrapper around lib/session-context.mjs::updateContextHistory.
 *
 * Invoked from:
 *   1. hooks/session-end-check.sh (Stop hook safety net)
 *   2. skills/session-manager/SKILL.md /end code block (primary)
 *
 * Environment:
 *   VAULT_PATH          - vault root (default: $HOME/vault)
 *   CDS_PROJECT_NAME    - project slug under vault/projects/ (required)
 *
 * Args:
 *   argv[2]             - session log filename (required, e.g. "2026-04-10-fix-bug.md")
 *   argv[3]             - optional session title override
 *
 * Exit codes (D-14):
 *   0 - success OR non-fatal skip (vault missing, project missing, etc.)
 *   2 - programmer error (required args missing or invalid)
 *
 * Never propagates errors to the user's terminal. stderr is used for diagnostic messages
 * but the process never exits non-zero on filesystem conditions.
 */

import { homedir } from 'os';

import { updateContextHistory } from '../lib/session-context.mjs';

function main() {
  const vaultPath = process.env.VAULT_PATH || `${homedir()}/vault`;
  const projectName = process.env.CDS_PROJECT_NAME;
  const sessionLogFilename = process.argv[2];
  const sessionTitle = process.argv[3]; // optional

  if (!projectName) {
    process.stderr.write('update-context: CDS_PROJECT_NAME env var is required\n');
    process.exit(2);
  }
  if (!sessionLogFilename) {
    process.stderr.write('update-context: session log filename argument is required\n');
    process.exit(2);
  }

  try {
    const result = updateContextHistory({
      vaultPath,
      projectName,
      sessionLogFilename,
      sessionTitle,
    });
    // Diagnostic line on stderr (kept silent on hook invocation via 2>/dev/null)
    process.stderr.write(`update-context: ${result.action} (${result.entriesCount} entries)\n`);
    process.exit(0);
  } catch (err) {
    // Programmer errors (missing args, bad projectName) exit 2.
    // Anything else is a bug - still exit 0 to keep the hook quiet (D-14).
    const msg = err && err.message ? err.message : String(err);
    if (/required|projectName/.test(msg)) {
      process.stderr.write(`update-context: ${msg}\n`);
      process.exit(2);
    }
    process.stderr.write(`update-context: unexpected error: ${msg}\n`);
    process.exit(0);
  }
}

main();
