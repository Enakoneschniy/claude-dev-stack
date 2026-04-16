// Phase 37 Plan 01 Task 37-01-05 — unit tests for mcp-server scaffold.
//
// Uses SDK's InMemoryTransport.createLinkedPair() so tests exercise the full
// ListTools/CallTool round-trip the same way Claude Code does over stdio,
// just without spawning a child process.

import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolResultSchema,
  ErrorCode,
  ListToolsResultSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { createServer, TOOL_DEFINITIONS, TOOL_NAMES } from './mcp-server.js';

const EXPECTED_TOOL_NAMES = new Set([
  'sessions.search',
  'sessions.timeline',
  'sessions.get_observations',
  'docs.search',
  'planning.status',
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
  it('returns exactly 5 tools', async () => {
    const { client } = await connectedClient();
    const result = await client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema,
    );
    expect(result.tools).toHaveLength(5);
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
    expect(TOOL_DEFINITIONS).toHaveLength(5);
    expect(new Set(TOOL_NAMES)).toEqual(EXPECTED_TOOL_NAMES);
  });
});

describe('mcp-server — CallTool dispatch (Plan 01 stub phase)', () => {
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

  // NOTE: this test is scaffold-phase specific — Plan 04 Task 37-04-06 removes
  // it and replaces with content-envelope assertions once tool handlers are
  // wired to real implementations.
  it('CallTool with known name throws InternalError (stub phase)', async () => {
    const { client } = await connectedClient();
    let caught: unknown;
    try {
      await client.request(
        {
          method: 'tools/call',
          params: { name: 'sessions.search', arguments: { query: 'test' } },
        },
        CallToolResultSchema,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as McpError).code).toBe(ErrorCode.InternalError);
    expect((caught as McpError).message).toMatch(/not yet implemented/);
    await client.close();
  });
});
