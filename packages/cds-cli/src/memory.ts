// packages/cds-cli/src/memory.ts
// Internal CLI command: called by SessionStart hook to inject SQLite memory.
// Not user-facing (no help entry). Per D-140/D-146.
// Phase 45 — MEM-06/MEM-07: auto-surface relevant observations via MiniSearch fuzzy + FTS5.
import { basename } from 'node:path';
import MiniSearch from 'minisearch';
import { openSessionsDB, closeSessionsDB, type SessionsDB, type Observation } from '@cds/core';

export interface MemoryOptions {
  projectPath: string;
  sessionCount?: number;
}

// ---------------------------------------------------------------------------
// Auto-surface: find relevant past observations (MEM-06, MEM-07)
// ---------------------------------------------------------------------------

interface RelevantObservation {
  id: number;
  type: string;
  content: string;
  createdAt: string;
  source: 'fuzzy' | 'fts5';
}

function findRelevantObservations(
  db: SessionsDB,
  projectPath: string,
  maxResults: number = 5,
): RelevantObservation[] {
  // Derive implicit query from project basename
  const projectName = basename(projectPath);
  // Split project name into searchable tokens (e.g., "claude-dev-stack" -> ["claude", "dev", "stack"])
  const tokens = projectName.split(/[-_.]/).filter((t) => t.length > 2);
  if (tokens.length === 0) return [];

  const query = tokens.join(' ');

  // 1. FTS5 exact search
  const fts5Hits: RelevantObservation[] = [];
  try {
    const searchResults = db.searchObservations(query, { limit: maxResults });
    for (const hit of searchResults) {
      fts5Hits.push({
        id: hit.observation.id,
        type: hit.observation.type,
        content: hit.observation.content,
        createdAt: hit.observation.created_at,
        source: 'fts5',
      });
    }
  } catch {
    // FTS5 may not be available — continue with fuzzy only
  }

  // 2. MiniSearch fuzzy search on recent observations from recent sessions
  const recentSessions = db.listSessions({ limit: 10 });
  const recentObs: Observation[] = [];
  for (const s of recentSessions) {
    const obs = db.listObservations({ sessionId: s.id, limit: 20 });
    recentObs.push(...obs);
  }
  if (recentObs.length === 0) return fts5Hits.slice(0, maxResults);

  const miniSearch = new MiniSearch({
    fields: ['content', 'type'],
    storeFields: ['content', 'type', 'created_at'],
    idField: 'id',
  });
  miniSearch.addAll(
    recentObs.map((o) => ({
      id: o.id,
      content: o.content,
      type: o.type,
      created_at: o.created_at,
    })),
  );

  const fuzzyHits = miniSearch.search(query, { fuzzy: 0.2, prefix: true });
  const fuzzyResults: RelevantObservation[] = fuzzyHits
    .slice(0, maxResults)
    .map((hit) => {
      const obs = recentObs.find((o) => o.id === hit.id);
      return {
        id: hit.id as number,
        type: obs?.type ?? 'unknown',
        content: obs?.content ?? '',
        createdAt: obs?.created_at ?? '',
        source: 'fuzzy' as const,
      };
    });

  // 3. Merge and deduplicate by observation ID
  const seen = new Set<number>();
  const merged: RelevantObservation[] = [];
  // FTS5 results first (exact matches are higher quality)
  for (const hit of [...fts5Hits, ...fuzzyResults]) {
    if (!seen.has(hit.id)) {
      seen.add(hit.id);
      merged.push(hit);
    }
  }
  return merged.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

export function formatMemorySummary(options: MemoryOptions): string {
  const db = openSessionsDB(options.projectPath);
  try {
    const sessions = db.listSessions({ limit: options.sessionCount ?? 3 });
    if (sessions.length === 0) {
      return 'Recent memory (from SQLite):\nNo sessions recorded yet.\n\nUse sessions.search MCP tool for deeper queries.';
    }
    const lines: string[] = ['Recent memory (from SQLite):'];
    for (const s of sessions) {
      const date = s.start_time.slice(0, 10);
      // Per D-140: format is "Session DATE: [N observations] -- topic1, topic2, topic3"
      const obsCount = db.getSessionObservationCount(s.id);
      // Get topic excerpts: list most recent observations for this session (WR-03 fix —
      // using searchObservations with 'session' keyword excluded non-matching content).
      const obs = db.listObservations({ sessionId: s.id, limit: 3 });
      const topics =
        obs.length > 0
          ? obs.map((o) => (o.content.split('\n')[0] ?? '').slice(0, 40)).join(', ')
          : (s.summary ?? 'no summary');
      lines.push(`Session ${date}: [${obsCount} observations] -- ${topics}`);
    }
    lines.push('');
    lines.push('Use sessions.search MCP tool for deeper queries.');

    // Auto-surface relevant past observations (MEM-06, MEM-07)
    try {
      const relevant = findRelevantObservations(db, options.projectPath);
      if (relevant.length > 0) {
        lines.push('');
        lines.push('Relevant past observations:');
        for (const obs of relevant) {
          const date = obs.createdAt.slice(0, 10);
          const snippet =
            obs.content.length > 100
              ? obs.content.slice(0, 97) + '...'
              : obs.content;
          lines.push(`  [${obs.type}] ${snippet} (${date}, ${obs.source})`);
        }
      }
    } catch {
      // Non-fatal — auto-surface is best-effort
    }

    return lines.join('\n');
  } finally {
    closeSessionsDB(options.projectPath);
  }
}

export async function main(_args: string[]): Promise<void> {
  try {
    const output = formatMemorySummary({ projectPath: process.cwd() });
    process.stdout.write(output + '\n');
  } catch {
    // Fail-silent: hook captures all stdout; any crash must not pollute context.
    // Errors go to stderr only.
    process.stderr.write('cds memory: failed to load SQLite summary\n');
  }
}
