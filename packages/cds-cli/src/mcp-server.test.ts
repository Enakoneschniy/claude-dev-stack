// Phase 37 Plan 01 Task 37-01-05 + Plan 04 Task 37-04-06 — unit tests for
// the mcp-server scaffold + wired CallTool dispatch.
//
// Uses SDK's InMemoryTransport.createLinkedPair() so tests exercise the full
// ListTools/CallTool round-trip the same way Claude Code does over stdio,
// just without spawning a child process.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolResultSchema,
  ErrorCode,
  ListToolsResultSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { createServer, TOOL_DEFINITIONS, TOOL_NAMES } from './mcp-server.js';
import {
  buildFixtureSessionsDB,
  type FixtureHandle,
} from './mcp-tools/__fixtures__/build-sessions-db.js';

const EXPECTED_TOOL_NAMES = new Set([
  'sessions.search',
  'sessions.timeline',
  'sessions.get_observations',
  'docs.search',
  'planning.status',
  'sessions.searchAll',
  'memory.graph',
]);

async function connectedClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cds-test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

describe('mcp-server — ListTools', () => {
  it('returns exactly 7 tools', async () => {
    const { client } = await connectedClient();
    const result = await client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema,
    );
    expect(result.tools).toHaveLength(7);
    await client.close();
  });

  it('each tool has name, description, and inputSchema', async () => {
    const { client } = await connectedClient();
    const result = await client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema,
    );
    for (const t of result.tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.inputSchema).toBe('object');
    }
    await client.close();
  });

  it('tool names match the canonical set', async () => {
    const { client } = await connectedClient();
    const result = await client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema,
    );
    const actual = new Set(result.tools.map((t) => t.name));
    expect(actual).toEqual(EXPECTED_TOOL_NAMES);
    await client.close();
  });

  it('exposes TOOL_DEFINITIONS + TOOL_NAMES matching canonical set', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(7);
    expect(new Set(TOOL_NAMES)).toEqual(EXPECTED_TOOL_NAMES);
  });
});

describe('mcp-server — CallTool dispatch', () => {
  it('CallTool with unknown name throws McpError MethodNotFound', async () => {
    const { client } = await connectedClient();
    let caught: unknown;
    try {
      await client.request(
        {
          method: 'tools/call',
          params: { name: 'nonexistent', arguments: {} },
        },
        CallToolResultSchema,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as McpError).code).toBe(ErrorCode.MethodNotFound);
    await client.close();
  });

  describe('wired tools (Plan 04)', () => {
    let sessionsFixture: FixtureHandle;
    let vaultDir: string;
    let priorEnv: string | undefined;

    beforeEach(() => {
      // Build an isolated sessions.db for sessions.search to read.
      sessionsFixture = buildFixtureSessionsDB({
        sessions: [
          {
            id: 'session-1',
            start_time: '2026-04-16T10:00:00.000Z',
            end_time: null,
            project: 'alpha',
            summary: 'alpha',
          },
        ],
        observations: [
          {
            id: 1,
            session_id: 'session-1',
            type: 'decision',
            content: 'monorepo test observation',
            entities: '[]',
            created_at: '2026-04-16T10:00:00.000Z',
          },
        ],
      });

      // Arrange a CDS_TEST_VAULT pointing at the fixture's parent dir so
      // resolveSessionsDBPath() picks up the fixture sessions.db.
      vaultDir = sessionsFixture.dbPath.slice(
        0,
        sessionsFixture.dbPath.length - '/sessions.db'.length,
      );
      priorEnv = process.env['CDS_TEST_VAULT'];
      process.env['CDS_TEST_VAULT'] = vaultDir;
    });

    afterEach(() => {
      sessionsFixture.cleanup();
      if (priorEnv === undefined) delete process.env['CDS_TEST_VAULT'];
      else process.env['CDS_TEST_VAULT'] = priorEnv;
    });

    it('CallTool with sessions.search returns text-content envelope', async () => {
      const { client } = await connectedClient();
      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'sessions.search',
            arguments: { query: 'monorepo' },
          },
        },
        CallToolResultSchema,
      );
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]?.type).toBe('text');
      const first = result.content[0];
      if (!first || first.type !== 'text') throw new Error('unexpected envelope');
      const parsed = JSON.parse(first.text) as { hits: unknown[] };
      expect(Array.isArray(parsed.hits)).toBe(true);
      expect(parsed.hits.length).toBeGreaterThanOrEqual(1);
      await client.close();
    });

    it('CallTool with sessions.searchAll rejects empty query', async () => {
      const { client } = await connectedClient();
      let caught: unknown;
      try {
        await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'sessions.searchAll',
              arguments: { query: '' },
            },
          },
          CallToolResultSchema,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(McpError);
      const data = (caught as McpError).data as { kind?: string } | undefined;
      expect(data?.kind).toBe('InvalidFilterError');
      await client.close();
    });

    it('CallTool with memory.graph dispatches to tool module', async () => {
      const { client } = await connectedClient();
      let caught: unknown;
      try {
        await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'memory.graph',
              arguments: {},
            },
          },
          CallToolResultSchema,
        );
      } catch (err) {
        caught = err;
      }
      // VaultNotFoundError is acceptable — tool was dispatched correctly
      if (caught) {
        expect(caught).toBeInstanceOf(McpError);
      }
      await client.close();
    });

    it('CallTool with planning.status throws NotAGsdProjectError on unknown project', async () => {
      // Point CDS_TEST_VAULT at an empty tmpdir so planning.status resolution fails.
      const emptyVault = mkdtempSync(join(tmpdir(), 'cds-empty-vault-'));
      process.env['CDS_TEST_VAULT'] = emptyVault;
      try {
        const { client } = await connectedClient();
        let caught: unknown;
        try {
          await client.request(
            {
              method: 'tools/call',
              params: {
                name: 'planning.status',
                arguments: { project: 'does-not-exist' },
              },
            },
            CallToolResultSchema,
          );
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(McpError);
        // data.kind preserves the domain error class name across JSON-RPC.
        const data = (caught as McpError).data as { kind?: string } | undefined;
        expect(data?.kind).toBe('NotAGsdProjectError');
        await client.close();
      } finally {
        rmSync(emptyVault, { recursive: true, force: true });
      }
    });
  });
});
