// Phase 43 — Entity relationship graph data primitive (MEM-04).

import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types (framework-agnostic — NOT cytoscape-native)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: number;
  name: string;
  type: string;
  displayName: string | null;
}

export interface GraphEdge {
  from: number;
  to: number;
  relationType: string;
  weight: number;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Private row interfaces (DB column mapping)
// ---------------------------------------------------------------------------

interface EntityRow {
  id: number;
  name: string;
  type: string;
  display_name: string | null;
}

interface EdgeRow {
  from: number;
  to: number;
  relationType: string;
  weight: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDbPath(projectPath: string): string {
  const project = basename(projectPath);
  return join(homedir(), 'vault', 'projects', project, 'sessions.db');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the entity relationship graph for a project.
 *
 * Opens the project's sessions.db in read-only mode (no migrations),
 * queries the `entities` and `relations` tables, and returns a
 * framework-agnostic `EntityGraph` structure.
 *
 * Edge `weight` is frequency-based: the number of distinct (from, to,
 * relationType) occurrences across sessions.
 */
export function getEntityGraph(projectPath: string): EntityGraph {
  const db = new Database(resolveDbPath(projectPath), { readonly: true });
  try {
    const nodeRows = db
      .prepare('SELECT id, name, type, display_name FROM entities ORDER BY id ASC')
      .all() as EntityRow[];

    const edgeRows = db
      .prepare(
        'SELECT from_entity AS "from", to_entity AS "to", ' +
          'relation_type AS relationType, COUNT(*) AS weight ' +
          'FROM relations GROUP BY from_entity, to_entity, relation_type',
      )
      .all() as EdgeRow[];

    const nodes: GraphNode[] = nodeRows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      displayName: r.display_name,
    }));

    const edges: GraphEdge[] = edgeRows.map((r) => ({
      from: r.from,
      to: r.to,
      relationType: r.relationType,
      weight: r.weight,
    }));

    return { nodes, edges };
  } finally {
    db.close();
  }
}
