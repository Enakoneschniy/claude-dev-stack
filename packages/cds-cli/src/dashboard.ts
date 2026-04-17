// Phase 48 — Web Dashboard server (DX-01, DX-04).
// Hono HTTP server with JSON API routes consuming @cds/core APIs.
// Process lifecycle: PID file, graceful shutdown, stale detection.

import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openSessionsDB,
  closeSessionsDB,
  getEntityGraph,
} from '@cds/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 3456;
const PID_DIR = join(homedir(), '.cds');
const PID_FILE = join(PID_DIR, 'dashboard.pid');

// ---------------------------------------------------------------------------
// PID file management (DX-04)
// ---------------------------------------------------------------------------

export function writePidFile(pid: number): void {
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), 'utf8');
}

export function readPidFile(): number | null {
  try {
    const content = readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function deletePidFile(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Ignore ENOENT — file already gone.
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Returns true if a stale PID file was cleaned up. */
export function cleanStalePidFile(): boolean {
  const pid = readPidFile();
  if (pid === null) return false;
  if (!isProcessRunning(pid)) {
    deletePidFile();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hono app factory
// ---------------------------------------------------------------------------

export function createApp(projectPath: string): Hono {
  const app = new Hono();

  // ---------- API routes ----------

  app.get('/api/sessions', (c) => {
    const db = openSessionsDB(projectPath);
    try {
      const sessions = db.listSessions({ limit: 100 });
      return c.json(sessions);
    } finally {
      closeSessionsDB(projectPath);
    }
  });

  app.get('/api/sessions/:id/observations', (c) => {
    const sessionId = c.req.param('id');
    const db = openSessionsDB(projectPath);
    try {
      const observations = db.listObservations({ sessionId, limit: 200 });
      return c.json(observations);
    } finally {
      closeSessionsDB(projectPath);
    }
  });

  app.get('/api/stats', (c) => {
    const db = openSessionsDB(projectPath);
    try {
      const sessions = db.listSessions({ limit: 1000 });
      const countsByType = db.countObservationsByType();
      const entityCount = db.countEntities();
      const topEntities = db.topEntities(10);
      const totalObs = countsByType.reduce((s, r) => s + r.count, 0);
      return c.json({
        sessionCount: sessions.length,
        observationCount: totalObs,
        observationsByType: countsByType,
        entityCount,
        topEntities,
      });
    } finally {
      closeSessionsDB(projectPath);
    }
  });

  app.get('/api/costs', (c) => {
    const db = openSessionsDB(projectPath);
    try {
      const sessions = db.listSessions({ limit: 100 });
      const costs = sessions.map((s) => {
        const obs = db.listObservations({ sessionId: s.id, limit: 500 });
        let inputTokens = 0;
        let outputTokens = 0;
        let costUsd = 0;
        for (const o of obs) {
          const inputMatch = o.content.match(/input[_ ]tokens?:?\s*([\d,]+)/i);
          const outputMatch = o.content.match(/output[_ ]tokens?:?\s*([\d,]+)/i);
          const costMatch = o.content.match(/cost(?:_usd)?:?\s*\$?([\d.]+)/i);
          if (inputMatch?.[1]) inputTokens += parseInt(inputMatch[1].replace(/,/g, ''), 10);
          if (outputMatch?.[1]) outputTokens += parseInt(outputMatch[1].replace(/,/g, ''), 10);
          if (costMatch?.[1]) costUsd += parseFloat(costMatch[1]);
        }
        return {
          sessionId: s.id,
          date: s.start_time,
          project: s.project,
          summary: s.summary,
          inputTokens,
          outputTokens,
          costUsd,
        };
      });
      const totalCost = costs.reduce((s, x) => s + x.costUsd, 0);
      const totalInput = costs.reduce((s, x) => s + x.inputTokens, 0);
      const totalOutput = costs.reduce((s, x) => s + x.outputTokens, 0);
      return c.json({
        sessions: costs,
        totals: { costUsd: totalCost, inputTokens: totalInput, outputTokens: totalOutput },
      });
    } finally {
      closeSessionsDB(projectPath);
    }
  });

  app.get('/api/graph', (c) => {
    const graph = getEntityGraph(projectPath);
    // Limit to top 500 nodes by edge count for performance (T-48-05).
    if (graph.nodes.length > 500) {
      const edgeCounts = new Map<number, number>();
      for (const e of graph.edges) {
        edgeCounts.set(e.from, (edgeCounts.get(e.from) ?? 0) + 1);
        edgeCounts.set(e.to, (edgeCounts.get(e.to) ?? 0) + 1);
      }
      const topIds = new Set(
        [...edgeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 500)
          .map(([id]) => id),
      );
      graph.nodes = graph.nodes.filter((n) => topIds.has(n.id));
      graph.edges = graph.edges.filter((e) => topIds.has(e.from) && topIds.has(e.to));
    }
    return c.json(graph);
  });

  // ---------- Static assets (served after API routes) ----------

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const assetsRoot = resolve(__dirname, 'dashboard-assets');

  app.get('/*', serveStatic({ root: assetsRoot }));

  return app;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let activeServer: ServerType | null = null;

function shutdown(): void {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
  deletePidFile();
  process.exit(0);
}

export async function startDashboard(options: {
  port?: number;
  projectPath?: string;
  noBrowser?: boolean;
}): Promise<void> {
  const port = options.port ?? DEFAULT_PORT;
  const projectPath = options.projectPath ?? process.cwd();
  const noBrowser = options.noBrowser ?? false;

  // Check for stale PID file and clean up.
  cleanStalePidFile();

  // If dashboard already running, show URL and exit.
  const existingPid = readPidFile();
  if (existingPid !== null && isProcessRunning(existingPid)) {
    process.stdout.write(`Dashboard already running (pid ${existingPid}) at http://localhost:${port}\n`);
    return;
  }

  const app = createApp(projectPath);

  // T-48-02: bind to 127.0.0.1 (localhost only, no remote access).
  activeServer = serve({
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  });

  writePidFile(process.pid);

  // Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM.
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.stdout.write(`Dashboard running at http://localhost:${port}\n`);

  // Open browser (dynamic import — ESM-only package).
  if (!noBrowser) {
    try {
      const openMod = await import('open');
      await openMod.default(`http://localhost:${port}`);
    } catch {
      // Non-fatal — user can open manually.
    }
  }
}

export async function stopDashboard(): Promise<void> {
  const pid = readPidFile();
  if (pid === null) {
    process.stdout.write('No dashboard running\n');
    return;
  }

  if (!isProcessRunning(pid)) {
    deletePidFile();
    process.stdout.write('Dashboard was not running (cleaned stale PID file)\n');
    return;
  }

  // Send SIGTERM.
  process.kill(pid, 'SIGTERM');

  // Wait up to 3 seconds for process to exit.
  const start = Date.now();
  while (Date.now() - start < 3000) {
    if (!isProcessRunning(pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  deletePidFile();
  process.stdout.write('Dashboard stopped\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<void> {
  if (args[0] === 'stop') {
    await stopDashboard();
    return;
  }

  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '', 10) || DEFAULT_PORT : DEFAULT_PORT;
  const noBrowser = args.includes('--no-browser');

  await startDashboard({ port, projectPath: process.cwd(), noBrowser });
}
