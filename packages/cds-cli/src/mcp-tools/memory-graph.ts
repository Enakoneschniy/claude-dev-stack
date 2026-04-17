// Phase 45 — memory.graph MCP tool (MEM-05).

import {
  getEntityGraph,
  type EntityGraph,
  type GraphNode,
  type GraphEdge,
} from '@cds/core';

import { assertValidScopeBasename, VaultNotFoundError } from './shared.js';

export interface MemoryGraphArgs {
  project?: string;
}

export interface MemoryGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

export async function memoryGraph(
  args: MemoryGraphArgs,
): Promise<MemoryGraphResult> {
  const projectPath = args.project
    ? (assertValidScopeBasename(args.project), args.project)
    : process.cwd();

  let graph: EntityGraph;
  try {
    graph = getEntityGraph(projectPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('SQLITE_CANTOPEN') ||
      msg.includes('not found') ||
      msg.includes('no such file')
    ) {
      throw new VaultNotFoundError(
        `Sessions DB not found for project: ${args.project ?? projectPath}`,
      );
    }
    throw err;
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
  };
}
