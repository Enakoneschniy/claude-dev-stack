// Phase 43 — Cross-project search via SQLite ATTACH batching (MEM-02).
//
// FTS5 MATCH does not support schema-qualified table names (e.g.
// `p0.observations_fts MATCH ?` fails with "no such column"). This was
// flagged as RESEARCH.md Assumption A2 and confirmed empirically.
//
// Strategy: open each project DB individually for FTS5 queries, but
// batch connections in groups of 9 to bound concurrent open handles.
// Each batch opens at most 9 DBs, queries them, closes all, then
// proceeds to the next batch. This preserves the ATTACH-limit-aware
// batching contract from D-07 while working around the FTS5 limitation.

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A search hit annotated with the project it came from.
 *
 * Flat interface (not extending SearchHit) for simplicity — consumers get
 * all fields directly without nested `observation` access.
 */
export interface CrossSearchHit {
  /** basename of the project directory under vault/projects/ */
  project: string;
  observationId: number;
  sessionId: string;
  type: string;
  content: string;
  entities: number[];
  createdAt: string;
  sessionSummary: string | null;
  /** BM25 rank from FTS5 (lower = better match) */
  rank: number;
}

// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------

interface ProjectDb {
  path: string;
  project: string;
}

interface SearchRow {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string; // JSON string from DB
  created_at: string;
  session_summary: string | null;
  rank: number;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Discover all sessions.db files under the vault projects directory.
 * Returns empty array if the directory does not exist.
 */
function discoverProjectDbs(projectsDir: string): ProjectDb[] {
  let entries: string[];
  try {
    entries = readdirSync(projectsDir);
  } catch {
    // ENOENT or permission error — no projects to search
    return [];
  }

  const results: ProjectDb[] = [];
  for (const entry of entries) {
    const dbPath = join(projectsDir, entry, 'sessions.db');
    if (existsSync(dbPath)) {
      results.push({ path: dbPath, project: entry });
    }
  }
  return results;
}

/** The FTS5 search query — no schema qualification needed (runs on main). */
const SEARCH_SQL =
  'SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at, ' +
  's.summary AS session_summary, bm25(observations_fts) AS rank ' +
  'FROM observations_fts ' +
  'JOIN observations o ON o.id = observations_fts.rowid ' +
  'LEFT JOIN sessions s ON s.id = o.session_id ' +
  'WHERE observations_fts MATCH ? ' +
  'ORDER BY rank LIMIT ?';

/**
 * Map a raw DB row to a CrossSearchHit.
 */
function mapRow(row: SearchRow, project: string): CrossSearchHit {
  return {
    project,
    observationId: row.id,
    sessionId: row.session_id,
    type: row.type,
    content: row.content,
    entities: JSON.parse(row.entities) as number[],
    createdAt: row.created_at,
    sessionSummary: row.session_summary,
    rank: row.rank,
  };
}

/**
 * Search a single project DB for observations matching the query.
 * Opens a read-only connection, queries FTS5, and closes in finally.
 */
function searchSingleDb(
  dbInfo: ProjectDb,
  query: string,
  limit: number,
): CrossSearchHit[] {
  const db = new Database(dbInfo.path, { readonly: true });
  db.pragma('query_only = ON');
  try {
    const rows = db.prepare(SEARCH_SQL).all(query, limit) as SearchRow[];
    return rows.map((r) => mapRow(r, dbInfo.project));
  } catch {
    // FTS5 table may not exist in this DB — skip silently
    return [];
  } finally {
    db.close();
  }
}

/**
 * Run FTS5 search across a batch of project DBs.
 *
 * Each DB is opened individually (FTS5 MATCH does not support
 * schema-qualified table names with ATTACH). Batching in groups
 * of 9 bounds the number of concurrent open file descriptors.
 */
function runBatchSearch(
  dbPaths: ProjectDb[],
  query: string,
  limitPerProject: number,
): CrossSearchHit[] {
  const hits: CrossSearchHit[] = [];
  for (const dbInfo of dbPaths) {
    hits.push(...searchSingleDb(dbInfo, query, limitPerProject));
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search across all project vaults for observations matching the query.
 *
 * Discovers sessions.db files under `~/vault/projects/`, batches DB
 * connections in groups of 9 (matching SQLite's per-connection ATTACH
 * limit), queries FTS5 per DB, and merges results sorted by BM25 rank.
 *
 * @param query - FTS5 MATCH query string
 * @param options.vaultPath - Override vault root (default: VAULT_PATH env or ~/vault)
 * @param options.limit - Maximum total results to return (default: 100)
 */
export function searchAllProjects(
  query: string,
  options?: { vaultPath?: string; limit?: number },
): CrossSearchHit[] {
  const vaultRoot =
    options?.vaultPath ?? process.env['VAULT_PATH'] ?? join(homedir(), 'vault');
  const projectsDir = join(vaultRoot, 'projects');
  const dbPaths = discoverProjectDbs(projectsDir);

  if (dbPaths.length === 0) {
    return [];
  }

  const limitPerProject = 20;
  const allHits: CrossSearchHit[] = [];

  // Batch in groups of 9 (ATTACH limit = 10, primary uses 1 slot)
  for (let i = 0; i < dbPaths.length; i += 9) {
    const batch = dbPaths.slice(i, i + 9);
    allHits.push(...runBatchSearch(batch, query, limitPerProject));
  }

  // Re-rank merged results by BM25 rank (lower = better match)
  allHits.sort((a, b) => a.rank - b.rank);

  // Apply overall limit
  return allHits.slice(0, options?.limit ?? 100);
}
