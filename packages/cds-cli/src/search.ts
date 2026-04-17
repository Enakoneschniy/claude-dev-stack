// packages/cds-cli/src/search.ts
// CLI subcommand: claude-dev-stack search [--global] "query"
// Wraps the Phase 37 sessionsSearch function + Phase 45 searchAllProjects. Per D-144.
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { searchAllProjects, type CrossSearchHit } from '@cds/core';
import { sessionsSearch } from './mcp-tools/sessions-search.js';

function resolveDbPath(projectPath: string): string {
  return join(homedir(), 'vault', 'projects', basename(projectPath), 'sessions.db');
}

function formatHit(hit: {
  observation_id: number;
  session_id: string;
  type: string;
  content: string;
  created_at: string;
  rank: number;
}): string {
  const date = hit.created_at.slice(0, 10);
  const snippet =
    hit.content.length > 120 ? hit.content.slice(0, 117) + '...' : hit.content;
  return `[${hit.type}] ${snippet}\n  session: ${hit.session_id.slice(0, 8)} | ${date}`;
}

function formatGlobalHit(hit: CrossSearchHit): string {
  const date = hit.createdAt.slice(0, 10);
  const snippet =
    hit.content.length > 120 ? hit.content.slice(0, 117) + '...' : hit.content;
  return `[${hit.project}] [${hit.type}] ${snippet}\n  session: ${hit.sessionId.slice(0, 8)} | ${date}`;
}

export async function main(args: string[]): Promise<void> {
  const globalFlag = args.includes('--global');
  const query = args.filter((a) => a !== '--global')[0];
  if (!query) {
    process.stderr.write('Usage: claude-dev-stack search [--global] "<query>"\n');
    process.exit(1);
  }
  try {
    if (globalFlag) {
      const hits = searchAllProjects(query);
      if (hits.length === 0) {
        process.stdout.write('No results found across projects.\n');
        return;
      }
      for (const hit of hits) {
        process.stdout.write(formatGlobalHit(hit) + '\n\n');
      }
      process.stdout.write(`${hits.length} result(s) across projects\n`);
    } else {
      const dbPath = resolveDbPath(process.cwd());
      const result = await sessionsSearch({ query }, { dbPath });
      if (result.hits.length === 0) {
        process.stdout.write('No results found.\n');
        return;
      }
      for (const hit of result.hits) {
        process.stdout.write(formatHit(hit) + '\n\n');
      }
      process.stdout.write(`${result.total_matched} result(s) in ${result.query_time_ms}ms\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`search error: ${msg}\n`);
    process.exit(1);
  }
}
