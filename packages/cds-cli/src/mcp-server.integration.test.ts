// Phase 37 Plan 01 Task 37-01-06 — integration test for the MCP server.
//
// Spawns the server as a child process over stdio (the exact transport Claude
// Code uses) and asserts ListTools returns 5 tools. This catches SDK wiring
// regressions that in-memory tests cannot (subpath imports, ESM, bin layout).
//
// Skips automatically if `tsx` and a pre-built dist are both unavailable.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = dirname(dirname(__filename)); // packages/cds-cli
const SRC_PATH = join(PKG_ROOT, 'src', 'mcp-server.ts');
const DIST_PATH = join(PKG_ROOT, 'dist', 'mcp-server.js');

function hasCommand(cmd: string): boolean {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: 'ignore',
  });
  return r.status === 0;
}

function pickLauncher(): { command: string; args: string[] } | null {
  // Prefer tsx (no build step required).
  if (hasCommand('tsx')) {
    return { command: 'tsx', args: [SRC_PATH] };
  }
  if (hasCommand('npx')) {
    return { command: 'npx', args: ['-y', 'tsx', SRC_PATH] };
  }
  // Fall back to the built dist if it exists.
  if (existsSync(DIST_PATH)) {
    return { command: process.execPath, args: [DIST_PATH] };
  }
  return null;
}

const launcher = pickLauncher();

describe('mcp-server — stdio integration', () => {
  it.skipIf(!launcher)(
    'spawns server and lists 5 tools over stdio',
    { timeout: 20000 },
    async () => {
      if (!launcher) return; // type narrow
      const transport = new StdioClientTransport({
        command: launcher.command,
        args: launcher.args,
        cwd: PKG_ROOT,
      });
      const client = new Client(
        { name: 'cds-integration-test', version: '0.0.0' },
        { capabilities: {} },
      );
      try {
        await client.connect(transport);
        const result = await client.request(
          { method: 'tools/list', params: {} },
          ListToolsResultSchema,
        );
        expect(result.tools).toHaveLength(5);
        for (const t of result.tools) {
          expect(typeof t.name).toBe('string');
          expect(t.inputSchema).toBeDefined();
          expect((t.inputSchema as { type?: unknown }).type).toBe('object');
        }
      } finally {
        await client.close();
      }
    },
  );
});
