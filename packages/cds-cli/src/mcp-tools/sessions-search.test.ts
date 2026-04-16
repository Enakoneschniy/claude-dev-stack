// Phase 37 Plan 02 Task 37-02-03 — tests for sessions.search.
//
// Validation matrix §6.3 (a)–(f) + limit/clamp/FTS5-error coverage.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidFilterError } from './shared.js';
import { sessionsSearch } from './sessions-search.js';
import {
  buildFixtureSessionsDB,
  type FixtureHandle,
  type FixtureObservation,
  type FixtureSession,
} from './__fixtures__/build-sessions-db.js';

function makeSession(id: string, project: string, summary: string): FixtureSession {
  return {
    id,
    start_time: '2026-04-16T10:00:00.000Z',
    end_time: null,
    project,
    summary,
  };
}

function makeObs(
  id: number,
  session_id: string,
  type: string,
  content: string,
  createdIso = '2026-04-16T10:00:00.000Z',
): FixtureObservation {
  return {
    id,
    session_id,
    type,
    content,
    entities: '[]',
    created_at: createdIso,
  };
}

describe('sessions.search', () => {
  let fixture: FixtureHandle;

  beforeEach(() => {
    fixture = buildFixtureSessionsDB({
      sessions: [
        makeSession('session-A', 'alpha', 'Alpha summary'),
        makeSession('session-B', 'beta', 'Beta summary'),
      ],
      observations: [
        makeObs(1, 'session-A', 'decision', 'monorepo migration decision', '2026-04-16T09:00:00Z'),
        makeObs(2, 'session-A', 'insight', 'sqlite FTS5 indexing insight', '2026-04-16T09:05:00Z'),
        makeObs(3, 'session-A', 'bug', 'vault sync bug with hooks', '2026-04-16T09:10:00Z'),
        makeObs(4, 'session-B', 'decision', 'mcp adapter scaffolding decision', '2026-04-16T10:00:00Z'),
        makeObs(5, 'session-B', 'insight', 'monorepo vault sqlite combined insight', '2026-04-16T10:05:00Z'),
      ],
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('returns hits matching query word', async () => {
    const result = await sessionsSearch({ query: 'monorepo' }, { db: fixture.db });
    expect(result.hits.length).toBeGreaterThanOrEqual(1);
    for (const h of result.hits) {
      expect(h.content.toLowerCase()).toContain('monorepo');
    }
  });

  it('respects AND operator', async () => {
    const result = await sessionsSearch(
      { query: 'monorepo AND sqlite' },
      { db: fixture.db },
    );
    expect(result.hits.length).toBe(1);
    expect(result.hits[0]?.observation_id).toBe(5);
  });

  it('respects OR operator', async () => {
    const result = await sessionsSearch(
      { query: 'monorepo OR mcp' },
      { db: fixture.db },
    );
    // 1 (monorepo) + 4 (mcp) + 5 (monorepo)
    expect(result.hits.length).toBe(3);
  });

  it('filters by date range', async () => {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    const result = await sessionsSearch(
      { query: 'monorepo OR mcp', filters: { date_from: tomorrow } },
      { db: fixture.db },
    );
    expect(result.hits.length).toBe(0);
  });

  it('filters by session_id', async () => {
    const result = await sessionsSearch(
      { query: 'monorepo OR mcp OR sqlite', filters: { session_id: 'session-A' } },
      { db: fixture.db },
    );
    for (const h of result.hits) {
      expect(h.session_id).toBe('session-A');
    }
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('filters by type[]', async () => {
    const result = await sessionsSearch(
      { query: 'monorepo OR mcp OR sqlite', filters: { type: ['decision'] } },
      { db: fixture.db },
    );
    for (const h of result.hits) {
      expect(h.type).toBe('decision');
    }
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('clamps limit to 100 max', async () => {
    const result = await sessionsSearch(
      { query: 'monorepo', filters: { limit: 9999 } },
      { db: fixture.db },
    );
    expect(result.hits.length).toBeLessThanOrEqual(100);
  });

  it('defaults limit to 20 when omitted', async () => {
    // Seed 30 matching observations on a fresh DB
    const big = buildFixtureSessionsDB({
      sessions: [makeSession('session-X', 'alpha', 'X')],
      observations: Array.from({ length: 30 }, (_, i) =>
        makeObs(
          i + 100,
          'session-X',
          'decision',
          `monorepo item ${i + 1}`,
          `2026-04-16T10:00:${String(i).padStart(2, '0')}Z`,
        ),
      ),
    });
    try {
      const result = await sessionsSearch({ query: 'monorepo' }, { db: big.db });
      expect(result.hits.length).toBe(20);
    } finally {
      big.cleanup();
    }
  });

  it('throws InvalidFilterError on malformed FTS5 query', async () => {
    await expect(
      sessionsSearch({ query: '"unclosed' }, { db: fixture.db }),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof InvalidFilterError ||
        (typeof err === 'object' && err !== null && (err as { data?: { kind?: string } }).data?.kind === 'InvalidFilterError');
    });
  });

  it('throws InvalidFilterError on empty query', async () => {
    await expect(sessionsSearch({ query: '' }, { db: fixture.db })).rejects.toBeInstanceOf(
      InvalidFilterError,
    );
    await expect(sessionsSearch({ query: '   ' }, { db: fixture.db })).rejects.toBeInstanceOf(
      InvalidFilterError,
    );
  });

  it('returns empty hits array on no match', async () => {
    const result = await sessionsSearch(
      { query: 'nonexistentwordxyz' },
      { db: fixture.db },
    );
    expect(result.hits).toEqual([]);
    expect(result.total_matched).toBe(0);
  });

  it('BM25 rank: closer match comes first', async () => {
    const fx = buildFixtureSessionsDB({
      sessions: [makeSession('session-R', 'alpha', 'R')],
      observations: [
        makeObs(
          201,
          'session-R',
          'decision',
          'hook hook hook — triple-hook observation',
          '2026-04-16T09:00:00Z',
        ),
        makeObs(
          202,
          'session-R',
          'decision',
          'single hook observation',
          '2026-04-16T09:05:00Z',
        ),
      ],
    });
    try {
      const result = await sessionsSearch({ query: 'hook' }, { db: fx.db });
      expect(result.hits.length).toBe(2);
      expect(result.hits[0]?.observation_id).toBe(201);
    } finally {
      fx.cleanup();
    }
  });
});
