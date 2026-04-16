// Phase 37 — MCP server entry point for claude-dev-stack.
//
// Hosts the 5 CDS tools (sessions.search / sessions.timeline /
// sessions.get_observations / docs.search / planning.status) over stdio
// so Claude Code can consume them via `.claude/settings.json` `mcp.servers.cds`.
//
// Plan 01 produces the scaffold with stubs — Plan 04 replaces the stubs with
// real delegating calls to the tool modules built in Plans 02 and 03.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Shared error hierarchy — imported so subsequent plans and tests can
// narrow by `instanceof`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CdsMcpError } from './mcp-tools/shared.js';

// ---------------------------------------------------------------------------
// Tool catalog (D-77..D-81). Kept here rather than inline in setRequestHandler
// so `createServer()` stays skinny and the catalog is unit-testable.
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    name: 'sessions.search',
    description:
      'Full-text search over session observations in the project sessions DB ' +
      '(BM25 ranked). Supports FTS5 MATCH syntax plus optional filters.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'FTS5 MATCH expression (e.g. "monorepo AND sqlite").',
        },
        filters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date_from: {
              type: 'string',
              description: 'ISO 8601 lower bound on observations.created_at.',
            },
            date_to: {
              type: 'string',
              description: 'ISO 8601 upper bound on observations.created_at.',
            },
            project: {
              type: 'string',
              description: 'Project basename (defaults to cwd project).',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Observation types to include (OR semantics).',
            },
            session_id: {
              type: 'string',
              description: 'Scope search to a single session.',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              description: 'Max hits (default 20, clamped to 100).',
            },
          },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'sessions.timeline',
    description:
      'Return observations chronologically around an anchor observation ' +
      '(window_before + anchor + window_after). Same-session only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        anchor_observation_id: {
          type: 'number',
          description: 'Observation ID to center the window on.',
        },
        window_before: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Observations before the anchor (default 5, max 20).',
        },
        window_after: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Observations after the anchor (default 5, max 20).',
        },
      },
      required: ['anchor_observation_id'],
    },
  },
  {
    name: 'sessions.get_observations',
    description:
      'Fetch observations by ID list. "raw" format returns full rows; ' +
      '"summary" format truncates content to 140 chars for bulk previews.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ids: {
          type: 'array',
          items: { type: 'number' },
          minItems: 1,
          maxItems: 50,
          description: 'Observation IDs (max 50 per call).',
        },
        format: {
          type: 'string',
          enum: ['raw', 'summary'],
          description: 'Response format (default "raw").',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'docs.search',
    description:
      'Search markdown docs under ~/vault/projects/*/docs/ with ripgrep ' +
      '(POSIX grep fallback). Path-traversal restricted to vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Regex (ripgrep/PCRE subset).',
        },
        scope: {
          type: 'string',
          description:
            '"current" (cwd project, default), "all" (all projects), or a project basename.',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Max hits (default 20, clamped to 100).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'planning.status',
    description:
      'Parse .planning/ROADMAP.md + STATE.md for a project and return ' +
      'structured milestone/phases/current_phase/progress metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        project: {
          type: 'string',
          description: 'Project basename (defaults to cwd project).',
        },
      },
    },
  },
] as const;

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name) as readonly string[];

// ---------------------------------------------------------------------------
// Stub tool handlers — Plan 04 replaces these with real imports from
// packages/cds-cli/src/mcp-tools/{sessions-search, sessions-timeline, ...}.
// Keeping stubs here during Plan 01 so the scaffold compiles + registers
// tool definitions end-to-end.
// ---------------------------------------------------------------------------

function notImplementedStub(toolName: string): never {
  throw new McpError(
    ErrorCode.InternalError,
    `Tool '${toolName}' not yet implemented (Plan 04 wires handlers).`,
  );
}

// ---------------------------------------------------------------------------
// Server factory (extracted from main() so unit tests can inspect handlers
// without spawning stdio transport).
// ---------------------------------------------------------------------------

export function createServer(): Server {
  const server = new Server(
    { name: 'cds', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    try {
      switch (name) {
        case 'sessions.search':
          return notImplementedStub('sessions.search');
        case 'sessions.timeline':
          return notImplementedStub('sessions.timeline');
        case 'sessions.get_observations':
          return notImplementedStub('sessions.get_observations');
        case 'docs.search':
          return notImplementedStub('docs.search');
        case 'planning.status':
          return notImplementedStub('planning.status');
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`,
          );
      }
    } catch (err) {
      if (err instanceof McpError) throw err;
      throw new McpError(
        ErrorCode.InternalError,
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Stdio entry — invoked by bin/cli.mjs `case 'mcp': if args[1] === 'serve'`.
// ---------------------------------------------------------------------------

export async function main(_args: string[]): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Direct-invoke guard — when executed via `node mcp-server.js` (not imported),
// run main() and propagate errors to stderr.
const entryUrl = `file://${process.argv[1]}`;
if (import.meta.url === entryUrl) {
  main(process.argv.slice(2)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[cds mcp] fatal:', err);
    process.exit(1);
  });
}
