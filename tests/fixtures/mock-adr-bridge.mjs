#!/usr/bin/env node
/**
 * Mock adr-bridge-session for script-level tests.
 *
 * Env:
 *   MOCK_MODE        - "success" (default), "fail" (exit 1), "silent" (no output, exit 0)
 *   MOCK_ARGV_FILE   - if set, writes JSON-encoded argv to this path before responding
 */
import { writeFileSync } from 'node:fs';

const mode = process.env.MOCK_MODE || 'success';
const argvFile = process.env.MOCK_ARGV_FILE;

if (argvFile) {
  writeFileSync(argvFile, JSON.stringify(process.argv.slice(2)));
}

if (mode === 'success') {
  process.stdout.write(JSON.stringify({
    newAdrs: [{ number: 13, topic: 'x', title: 'y', path: '/tmp/x' }],
    superseded: [],
    error: null,
  }));
  process.exit(0);
} else if (mode === 'fail') {
  process.stdout.write('partial output before crash');
  process.exit(1);
} else {
  // silent
  process.exit(0);
}
