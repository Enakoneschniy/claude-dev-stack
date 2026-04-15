/**
 * Phase 30 Plan 02 — D-06: CLAUDE.md status-line helper tests.
 *
 * `formatClaudeMdStatus` is a pure function: given a project name and a
 * status from `updateManagedSection`, return the exact user-facing string.
 *
 * Contract (BUG-07 D-06): the output NEVER contains the legacy forbidden
 * BUG-07 verb for any status value, including unknown/future ones.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatClaudeMdStatus } from '../lib/install/claude-md.mjs';

// Build the forbidden word at runtime so this test file itself does not
// contain the literal verb (keeps `grep -ci` checks clean on the repo).
const FORBIDDEN = ['over', 'written'].join('');

describe('formatClaudeMdStatus (D-06)', () => {
  it('returns "created" line for new files', () => {
    const line = formatClaudeMdStatus('my-app', 'created');
    assert.equal(line, 'my-app → CLAUDE.md: created');
  });

  it('returns "updated" line when markers existed', () => {
    const line = formatClaudeMdStatus('my-app', 'updated');
    assert.equal(line, 'my-app → CLAUDE.md: updated');
  });

  it('returns "appended" line with preservation hint when markers absent', () => {
    const line = formatClaudeMdStatus('my-app', 'appended');
    assert.ok(line.startsWith('my-app → CLAUDE.md: appended'));
    assert.ok(line.includes('preserved'));
  });

  it('returns "unchanged" line for idempotent re-runs', () => {
    const line = formatClaudeMdStatus('my-app', 'unchanged');
    assert.equal(line, 'my-app → CLAUDE.md: unchanged');
  });

  it('NEVER outputs the forbidden legacy verb for any status (BUG-07 D-06)', () => {
    for (const status of [
      'created',
      'updated',
      'appended',
      'unchanged',
      'unknown-future-status',
      '',
      'replaced',
    ]) {
      const line = formatClaudeMdStatus('my-app', status);
      assert.ok(
        !line.toLowerCase().includes(FORBIDDEN),
        `Status "${status}" produced "${line}" which contains the forbidden verb`
      );
    }
  });

  it('handles unknown status defensively without crashing', () => {
    const line = formatClaudeMdStatus('my-app', 'mystery');
    assert.ok(line.includes('my-app'));
    assert.ok(line.includes('mystery'));
  });

  it('includes project name in every output', () => {
    for (const status of ['created', 'updated', 'appended', 'unchanged']) {
      const line = formatClaudeMdStatus('some-project-42', status);
      assert.ok(line.includes('some-project-42'), `status "${status}" missing project name`);
    }
  });
});

describe('printClaudeMdStatus wiring (D-06)', () => {
  it('is exported and callable without throwing for any status', async () => {
    const { printClaudeMdStatus } = await import('../lib/install/claude-md.mjs');
    assert.equal(typeof printClaudeMdStatus, 'function');
    // Capture stdout so the test output stays clean
    const originalWrite = process.stdout.write.bind(process.stdout);
    try {
      let captured = '';
      process.stdout.write = (chunk) => {
        captured += chunk;
        return true;
      };
      for (const status of ['created', 'updated', 'appended', 'unchanged', 'mystery']) {
        printClaudeMdStatus('smoke-test', status);
      }
      assert.ok(!captured.toLowerCase().includes(FORBIDDEN));
      assert.ok(captured.includes('smoke-test'));
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
