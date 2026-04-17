// Phase 37 — MCP server entry point for claude-dev-stack.
//
// Hosts the 5 CDS tools (sessions.search / sessions.timeline /
// sessions.get_observations / docs.search / planning.status) over stdio
// so Claude Code can consume them via `.claude/settings.json` `mcp.servers.cds`.
//
// Plan 01 produces the scaffold with stubs — Plan 04 replaces the stubs with
// real delegating calls to the tool modules built in Plans 02 and 03.

import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import {
  docsSearch,
  type DocsSearchArgs,
} from './mcp-tools/docs-search.js';
import {
  planningStatus,
  type PlanningStatusArgs,
} from './mcp-tools/planning-status.js';
import {
  sessionsGetObservations,
  type GetObservationsArgs,
} from './mcp-tools/sessions-get-observations.js';
import {
  sessionsSearch,
  type SessionsSearchArgs,
} from './mcp-tools/sessions-search.js';
import {
  sessionsTimeline,
  type SessionsTimelineArgs,
} from './mcp-tools/sessions-timeline.js';
import {
  sessionsSearchAll,
  type SearchAllArgs,
} from './mcp-tools/sessions-search-all.js';
import {
  memoryGraph,
  type MemoryGraphArgs,
} from './mcp-tools/memory-graph.js';
import { VaultNotFoundError } from './mcp-tools/shared.js';

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
  {
    name: 'sessions.searchAll',
    description:
      'Cross-project full-text search over all project vaults. ' +
      'Discovers sessions.db files under ~/vault/projects/, queries FTS5 per project, ' +
      'and returns BM25-ranked results with project attribution.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'FTS5 MATCH expression (e.g. "monorepo AND sqlite").',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Max total hits across all projects (default 20, max 100).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory.graph',
    description:
      'Return entity relationship graph for a project. ' +
      'Nodes have type labels; edges are directional with frequency-based weight.',
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
// Sessions DB resolver — session-scoped tools need a path to the project's
// `sessions.db`. The `CDS_TEST_VAULT` env override keeps tests deterministic
// (no writes to real ~/vault).
// ---------------------------------------------------------------------------

function resolveSessionsDBPath(): string {
  const base =
    process.env['CDS_TEST_VAULT'] ??
    join(homedir(), 'vault', 'projects', basename(process.cwd()));
  const dbPath = join(base, 'sessions.db');
  try {
    statSync(dbPath);
  } catch {
    throw new VaultNotFoundError(`Sessions DB not found at ${dbPath}`);
  }
  return dbPath;
}

function textEnvelope(value: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
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
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case 'sessions.search': {
          const result = await sessionsSearch(args as unknown as SessionsSearchArgs, {
            dbPath: resolveSessionsDBPath(),
          });
          return textEnvelope(result);
        }
        case 'sessions.timeline': {
          const result = await sessionsTimeline(
            args as unknown as SessionsTimelineArgs,
            { dbPath: resolveSessionsDBPath() },
          );
          return textEnvelope(result);
        }
        case 'sessions.get_observations': {
          const result = await sessionsGetObservations(
            args as unknown as GetObservationsArgs,
            { dbPath: resolveSessionsDBPath() },
          );
          return textEnvelope(result);
        }
        case 'docs.search': {
          const result = await docsSearch(args as unknown as DocsSearchArgs);
          return textEnvelope(result);
        }
        case 'planning.status': {
          const result = await planningStatus(args as unknown as PlanningStatusArgs);
          return textEnvelope(result);
        }
        case 'sessions.searchAll': {
          const result = await sessionsSearchAll(args as unknown as SearchAllArgs);
          return textEnvelope(result);
        }
        case 'memory.graph': {
          const result = await memoryGraph(args as unknown as MemoryGraphArgs);
          return textEnvelope(result);
        }
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
