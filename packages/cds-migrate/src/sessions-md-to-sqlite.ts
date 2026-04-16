// Phase 38 Plan 02 Task 38-02-05 — migrateMarkdownSessions core library.
//
// Reads `{vaultPath}/projects/{projectName}/sessions/*.md`, dispatches each
// file to Haiku via `@cds/core.dispatchAgent` (prompt built by Phase 38's
// `buildExtractionPrompt({mode:'backfill',input})`), and writes the extracted
// observations into SQLite via per-file transactions — one transaction per
// markdown file so a single failure does not contaminate other files.
//
// Idempotency: `sessions.id = 'backfill-' + <filename-stem>` (D-94).
// `sessions.source_hash` stores sha256 of the raw file bytes (D-95). A second
// apply pass compares hashes: matching → skip; mismatched → warn (unless
// `--force-refresh` is set, in which case DELETE + re-insert inside the same
// transaction per D-97).

import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { dispatchAgent as productionDispatchAgent } from '@cds/core';
import { buildExtractionPrompt } from '@cds/core/capture';

import { hashFile } from './file-hash.js';
import {
  extractSessionId,
  extractStartTime,
  extractSummary,
} from './markdown-parser.js';
import { estimateCost, estimateTokens } from './token-estimate.js';
import type {
  DispatchAgentFn,
  DispatchResultLike,
  FileInput,
  MigrateOptions,
  MigrationFileResult,
  MigrationFileStatus,
  MigrationReport,
} from './types.js';

const DEFAULT_MAX_COST = 0.3;
const HAIKU_MODEL = 'haiku';
const RETRY_DELAY_MS = 500;

interface ExtractedPayload {
  session_summary?: string;
  observations?: Array<{
    type: string;
    content: string;
    entities?: string[];
  }>;
  entities?: Array<{ name: string; type: string }>;
  relations?: Array<{ from: string; to: string; type: string }>;
}

type Classification = 'will-migrate' | 'unchanged' | 'hash-changed';

export async function migrateMarkdownSessions(
  opts: MigrateOptions,
): Promise<MigrationReport> {
  const dryRun = opts.dryRun ?? true;
  const forceRefresh = opts.forceRefresh ?? false;
  // maxCost is consumed by the CLI layer; the library reports estimatedCost
  // and leaves the confirmation decision to callers.
  void (opts.maxCost ?? DEFAULT_MAX_COST);

  const dispatch: DispatchAgentFn =
    opts.dispatchAgent ?? (productionDispatchAgent as unknown as DispatchAgentFn);

  const sessionsDir = join(
    opts.vaultPath,
    'projects',
    opts.projectName,
    'sessions',
  );

  let filenames: string[];
  try {
    filenames = readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
      .sort();
  } catch {
    return emptyReport(opts, dryRun, forceRefresh);
  }

  if (filenames.length === 0) {
    return emptyReport(opts, dryRun, forceRefresh);
  }

  const db: Database.Database = opts.db ?? openDefaultDb(opts);
  const checkExistingStmt = db.prepare<string>(
    'SELECT source_hash FROM sessions WHERE id = ?',
  );

  // Pass 1: hash + classify every file.
  const pending: Array<{ input: FileInput; classification: Classification }> = [];
  for (const filename of filenames) {
    const filePath = join(sessionsDir, filename);
    const content = readFileSync(filePath, 'utf8');
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    const hash = hashFile(filePath);
    const sessionId = extractSessionId(filename);
    const existing = checkExistingStmt.get(sessionId) as
      | { source_hash: string | null }
      | undefined;

    let classification: Classification;
    if (!existing) classification = 'will-migrate';
    else if (existing.source_hash === hash) classification = 'unchanged';
    else classification = 'hash-changed';

    pending.push({
      input: { path: filePath, filename, sessionId, sizeBytes, content, hash },
      classification,
    });
  }

  const results: MigrationFileResult[] = [];

  for (const { input, classification } of pending) {
    const estimatedTokens = estimateTokens(input.content);
    const estimated = estimateCost(estimatedTokens);

    const base: MigrationFileResult = {
      filename: input.filename,
      sessionId: input.sessionId,
      status: classification,
      sizeBytes: input.sizeBytes,
      estimatedTokens,
      estimatedCost: estimated,
    };

    if (dryRun) {
      results.push(base);
      opts.onFileResult?.(base);
      continue;
    }

    // Apply path — branch by classification.
    if (classification === 'unchanged') {
      const r: MigrationFileResult = { ...base, status: 'unchanged' };
      results.push(r);
      opts.onFileResult?.(r);
      continue;
    }

    if (classification === 'hash-changed' && !forceRefresh) {
      const r: MigrationFileResult = {
        ...base,
        status: 'hash-changed',
        reason: 'content changed since last migration — use --force-refresh',
      };
      results.push(r);
      opts.onFileResult?.(r);
      continue;
    }

    // Dispatch + transact.
    let dispatchResult: DispatchResultLike;
    try {
      dispatchResult = await dispatchWithRetry(dispatch, input);
    } catch (err) {
      const r: MigrationFileResult = {
        ...base,
        status: 'failed',
        reason: err instanceof Error ? err.message : String(err),
      };
      results.push(r);
      opts.onFileResult?.(r);
      continue;
    }

    // Extract the emit_observations tool input payload.
    let payload: ExtractedPayload;
    try {
      payload = extractToolPayload(dispatchResult);
    } catch (err) {
      const r: MigrationFileResult = {
        ...base,
        status: 'failed',
        reason: err instanceof Error ? err.message : String(err),
      };
      results.push(r);
      opts.onFileResult?.(r);
      continue;
    }

    const refreshing = classification === 'hash-changed' && forceRefresh;
    const targetStatus: MigrationFileStatus = refreshing ? 'refreshed' : 'migrated';

    try {
      const writeSummary = writeSessionTransaction(db, input, payload, refreshing);
      const r: MigrationFileResult = {
        ...base,
        status: targetStatus,
        actualCost: dispatchResult.cost_usd,
        observationCount: writeSummary.observationCount,
        entityCount: writeSummary.entityCount,
      };
      results.push(r);
      opts.onFileResult?.(r);
    } catch (err) {
      const r: MigrationFileResult = {
        ...base,
        status: 'failed',
        reason:
          'DB transaction failed: ' +
          (err instanceof Error ? err.message : String(err)),
      };
      results.push(r);
      opts.onFileResult?.(r);
    }
  }

  const total = {
    fileCount: results.length,
    succeeded: results.filter(
      (r) => r.status === 'migrated' || r.status === 'refreshed',
    ).length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter(
      (r) => r.status === 'unchanged' || r.status === 'hash-changed',
    ).length,
    estimatedCost: results.reduce((s, r) => s + r.estimatedCost, 0),
    actualCost: results.reduce((s, r) => s + (r.actualCost ?? 0), 0),
  };

  return {
    vaultPath: opts.vaultPath,
    projectName: opts.projectName,
    dryRun,
    forceRefresh,
    files: results,
    total,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function emptyReport(
  opts: MigrateOptions,
  dryRun: boolean,
  forceRefresh: boolean,
): MigrationReport {
  return {
    vaultPath: opts.vaultPath,
    projectName: opts.projectName,
    dryRun,
    forceRefresh,
    files: [],
    total: {
      fileCount: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      estimatedCost: 0,
      actualCost: 0,
    },
  };
}

/**
 * Open the default raw better-sqlite3 handle at
 * `{vaultPath}/projects/{projectName}/sessions.db`, assuming migrations have
 * already been applied (the caller is expected to invoke `openSessionsDB`
 * which runs them). In CLI usage Plan 03 calls `openSessionsDB` once at the
 * top of `main()` so migrations land before the raw handle is opened.
 */
function openDefaultDb(opts: MigrateOptions): Database.Database {
  const dbFile = join(
    opts.vaultPath,
    'projects',
    opts.projectName,
    'sessions.db',
  );
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

async function dispatchWithRetry(
  dispatch: DispatchAgentFn,
  input: FileInput,
): Promise<DispatchResultLike> {
  const built = buildExtractionPrompt({
    mode: 'backfill',
    input: input.content,
  });

  try {
    return await dispatch({
      model: HAIKU_MODEL,
      system: built.systemPrompt,
      prompt: built.userPrompt,
      tools: built.tools as unknown as unknown[],
    });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await dispatch({
      model: HAIKU_MODEL,
      system: built.systemPrompt,
      prompt: built.userPrompt,
      tools: built.tools as unknown as unknown[],
    });
  }
}

/**
 * Pull the `emit_observations` tool_use payload from the dispatcher result.
 * Falls back to JSON-parsing `output` for older mocks that return stringified
 * tool responses instead of structured toolUses.
 */
function extractToolPayload(result: DispatchResultLike): ExtractedPayload {
  const tu = result.toolUses?.find((t) => t.name === 'emit_observations');
  if (tu && tu.input && typeof tu.input === 'object') {
    return tu.input as ExtractedPayload;
  }
  if (result.output) {
    try {
      return JSON.parse(result.output) as ExtractedPayload;
    } catch (err) {
      throw new Error(
        'invalid JSON from dispatch output: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  throw new Error('dispatch returned no emit_observations tool_use and no output');
}

interface WriteSummary {
  observationCount: number;
  entityCount: number;
}

function writeSessionTransaction(
  db: Database.Database,
  input: FileInput,
  payload: ExtractedPayload,
  refreshing: boolean,
): WriteSummary {
  const observations = Array.isArray(payload.observations)
    ? payload.observations
    : [];

  // Declared outside the transaction so the outer scope can return the count
  // after commit.
  const allEntityIds = new Set<number>();

  const deleteObsStmt = db.prepare<string>(
    'DELETE FROM observations WHERE session_id = ?',
  );
  const deleteSessionStmt = db.prepare<string>(
    'DELETE FROM sessions WHERE id = ?',
  );
  const insertSessionStmt = db.prepare(
    'INSERT INTO sessions (id, start_time, end_time, project, summary, source_hash) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  );
  const upsertEntityStmt = db.prepare(
    'INSERT INTO entities (name, display_name, type, first_seen, last_updated) ' +
      'VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(name) DO UPDATE SET ' +
      'type = COALESCE(entities.type, excluded.type), ' +
      'last_updated = excluded.last_updated ' +
      'RETURNING id',
  );
  const insertObsStmt = db.prepare(
    "INSERT INTO observations (session_id, type, content, entities, created_at) " +
      "VALUES (?, ?, ?, ?, datetime('now'))",
  );

  const startTime = extractStartTime(input.path);
  const summary = extractSummary(input.content, input.filename);

  const transact = db.transaction(() => {
    if (refreshing) {
      deleteObsStmt.run(input.sessionId);
      deleteSessionStmt.run(input.sessionId);
    }

    insertSessionStmt.run(
      input.sessionId,
      startTime,
      startTime,
      // Use the project basename so session rows remain consistent with
      // @cds/core.createSession output (which stores basename(projectPath)).
      basename(input.path).replace(/\.md$/i, ''),
      summary,
      input.hash,
    );

    // Seed entity lookup from the top-level entities[] first (preserves the
    // Haiku-provided type). Observations that reference unseen names fall
    // back to type='unknown'.
    const nameToId = new Map<string, number>();
    const seedEntities = Array.isArray(payload.entities) ? payload.entities : [];
    for (const ent of seedEntities) {
      if (!ent || typeof ent.name !== 'string') continue;
      const name = ent.name.trim();
      if (name === '') continue;
      const id = upsertNamed(upsertEntityStmt, name, ent.type || 'unknown');
      nameToId.set(name.toLowerCase(), id);
      allEntityIds.add(id);
    }

    for (const obs of observations) {
      const refNames = Array.isArray(obs.entities) ? obs.entities : [];
      const entityIds: number[] = [];
      for (const rawName of refNames) {
        if (typeof rawName !== 'string') continue;
        const name = rawName.trim();
        if (name === '') continue;
        const key = name.toLowerCase();
        let id = nameToId.get(key);
        if (id === undefined) {
          id = upsertNamed(upsertEntityStmt, name, 'unknown');
          nameToId.set(key, id);
          allEntityIds.add(id);
        }
        entityIds.push(id);
      }
      insertObsStmt.run(
        input.sessionId,
        String(obs.type ?? 'user-intent'),
        String(obs.content ?? ''),
        JSON.stringify(entityIds),
      );
    }
  });

  transact();

  return {
    observationCount: observations.length,
    entityCount: allEntityIds.size,
  };
}

function upsertNamed(
  stmt: Database.Statement,
  rawName: string,
  type: string,
): number {
  const trimmed = rawName.trim();
  const normalized = trimmed.toLowerCase();
  const now = new Date().toISOString();
  const row = stmt.get(normalized, trimmed, type, now, now) as {
    id: number;
  };
  return row.id;
}
