// packages/cds-cli/src/memory.ts
// Internal CLI command: called by SessionStart hook to inject SQLite memory.
// Not user-facing (no help entry). Per D-140/D-146.
import { openSessionsDB, closeSessionsDB } from '@cds/core';

export interface MemoryOptions {
  projectPath: string;
  sessionCount?: number;
}

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
      // Get topic excerpts: search observations for this session, take first few content strings
      const obs = db.searchObservations('session', { sessionId: s.id, limit: 3 });
      const topics =
        obs.length > 0
          ? obs.map((o) => (o.observation.content.split('\n')[0] ?? '').slice(0, 40)).join(', ')
          : (s.summary ?? 'no summary');
      lines.push(`Session ${date}: [${obsCount} observations] -- ${topics}`);
    }
    lines.push('');
    lines.push('Use sessions.search MCP tool for deeper queries.');
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
