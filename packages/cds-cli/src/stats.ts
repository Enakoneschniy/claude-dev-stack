// packages/cds-cli/src/stats.ts
// CLI subcommand: claude-dev-stack mem-stats
// Reads sessions.db via openSessionsDB, prints dashboard. Per D-145.
import { openSessionsDB, closeSessionsDB } from '@cds/core';
import { basename } from 'node:path';

export function formatDashboard(projectPath: string): string {
  const projectName = basename(projectPath);
  const db = openSessionsDB(projectPath);
  try {
    const sessions = db.listSessions();
    const countsByType = db.countObservationsByType();
    const totalObs = countsByType.reduce((s, r) => s + r.count, 0);

    // Week filter: count sessions from last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekCount = sessions.filter((s) => s.start_time >= weekAgo).length;

    const obsBreakdown =
      countsByType.length > 0
        ? countsByType.map((r) => `${r.type}: ${r.count}`).join(', ')
        : 'none';

    const lastActivity =
      sessions.length > 0 ? (sessions[0]?.start_time.slice(0, 10) ?? 'none') : 'none';

    // Per D-145: entity count + top entities
    const entityCount = db.countEntities();
    const topEnts = db.topEntities(5);
    const entityLine =
      entityCount > 0
        ? `Entities: ${entityCount} (top: ${topEnts.map((e) => e.name).join(', ')})`
        : 'Entities: 0';

    const lines = [
      `Project: ${projectName}`,
      `Sessions: ${sessions.length} (${weekCount} this week)`,
      `Observations: ${totalObs} (${obsBreakdown})`,
      entityLine,
      `Last activity: ${lastActivity}`,
    ];
    return lines.join('\n');
  } finally {
    closeSessionsDB(projectPath);
  }
}

export async function main(_args: string[]): Promise<void> {
  try {
    const output = formatDashboard(process.cwd());
    process.stdout.write(output + '\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stats error: ${msg}\n`);
    process.exit(1);
  }
}
