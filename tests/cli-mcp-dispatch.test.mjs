// Phase 37 Plan 04 Task 37-04-02 — CLI dispatch regression test.
//
// Verifies that `bin/cli.mjs` routes:
//   - `mcp serve`   → packages/cds-cli/dist/mcp-server.js (Phase 37)
//   - everything else under `mcp` → lib/mcp.mjs (legacy catalog, no regression)
// without requiring the cds-cli dist to exist (the serve branch emits a
// module-not-found error we can pattern-match on).

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLI = join(REPO_ROOT, 'bin', 'cli.mjs');
const DIST_SERVER = join(REPO_ROOT, 'packages', 'cds-cli', 'dist', 'mcp-server.js');

function runCLI(args, opts = {}) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, NO_COLOR: '1' },
    ...opts,
  });
}

describe('CLI mcp dispatch', () => {
  it('help output lists `mcp serve`', () => {
    const result = runCLI(['help']);
    assert.ok(
      result.stdout.includes('mcp serve'),
      `expected "mcp serve" in help output, got: ${result.stdout.slice(0, 300)}`,
    );
  });

  it('`mcp serve` routes to packages/cds-cli/dist/mcp-server.js', () => {
    if (existsSync(DIST_SERVER)) {
      // With a build present, the server will actually start — close stdin
      // quickly so it exits gracefully. We send empty stdin and rely on the
      // 5s timeout.
      const result = runCLI(['mcp', 'serve'], { timeout: 5000, input: '' });
      // Exit is expected on stdin close. The test passes as long as we didn't
      // attempt to invoke the catalog (no "Installed MCP Servers" banner,
      // no catalog keywords in stdout).
      const output = `${result.stdout}\n${result.stderr}`;
      assert.ok(
        !/filesystem|playwright|brave-search/.test(output),
        'expected `mcp serve` not to route to the lib/mcp.mjs catalog',
      );
    } else {
      // No dist → dynamic import fails; assert the failure mentions the
      // expected path (proves the serve branch routed correctly) and not the
      // catalog path.
      const result = runCLI(['mcp', 'serve'], { timeout: 5000 });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.ok(
        /packages\/cds-cli\/dist\/mcp-server/.test(output),
        `expected dist-server module path in error output, got: ${output.slice(0, 400)}`,
      );
      assert.ok(
        !/filesystem|playwright|brave-search/.test(output),
        '`mcp serve` must not fall through to the lib/mcp.mjs catalog',
      );
    }
  });

  it('`mcp <unknown-subcommand>` routes to lib/mcp.mjs catalog help (no regression)', () => {
    // Pass an unknown subcommand so lib/mcp.mjs's switch hits the default
    // branch — prints usage and exits. No interactive prompts.
    const result = runCLI(['mcp', 'foobar-unknown-subcommand'], {
      timeout: 5000,
      input: '',
    });
    const output = `${result.stdout}\n${result.stderr}`;
    // Must NOT route to the new server.
    assert.ok(
      !/packages\/cds-cli\/dist\/mcp-server/.test(output),
      `non-serve mcp subcommand must not route to the new server, got: ${output.slice(0, 400)}`,
    );
    // Must show the catalog's MCP management banner.
    assert.ok(
      /MCP server management/.test(output) || /claude-dev-stack mcp/.test(output),
      `expected lib/mcp.mjs catalog output, got: ${output.slice(0, 400)}`,
    );
  });
});
