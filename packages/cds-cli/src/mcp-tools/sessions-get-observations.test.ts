// Phase 37 Plan 02 Task 37-02-07 — tests for sessions.get_observations.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidFilterError } from './shared.js';
import { sessionsGetObservations } from './sessions-get-observations.js';
import {
  buildFixtureSessionsDB,
  type FixtureHandle,
  type FixtureObservation,
  type FixtureSession,
} from './__fixtures__/build-sessions-db.js';

function makeSession(id: string): FixtureSession {
  return {
    id,
    start_time: '2026-04-16T10:00:00.000Z',
    end_time: null,
    project: 'alpha',
    summary: 'test',
  };
}

function makeObs(
  id: number,
  session_id: string,
  content: string,
  createdIso = '2026-04-16T10:00:00.000Z',
): FixtureObservation {
  return {
    id,
    session_id,
    type: 'decision',
    content,
    entities: '[]',
    created_at: createdIso,
  };
}

describe('sessions.get_observations', () => {
  let fixture: FixtureHandle;

  beforeEach(() => {
    const obs: FixtureObservation[] = [];
    for (let i = 1; i <= 60; i++) {
      const content = i === 1 ? 'A'.repeat(200) : `obs ${i}`;
      obs.push(
        makeObs(
          i,
          'S1',
          content,
          `2026-04-16T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
        ),
      );
    }
    fixture = buildFixtureSessionsDB({
      sessions: [makeSession('S1')],
      observations: obs,
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('returns raw format by default', async () => {
    const result = await sessionsGetObservations({ ids: [1, 2, 3] }, { db: fixture.db });
    expect(result.observations.length).toBe(3);
    const first = result.observations[0] as {
      id: number;
      session_id: string;
      type: string;
      content: string;
      entities: string[];
      created_at: string;
    };
    expect(first.id).toBe(1);
    expect(first.session_id).toBe('S1');
    expect(first.type).toBe('decision');
    expect(first.created_at).toBeTruthy();
    expect(first.entities).toEqual([]);
    expect(first.content.length).toBe(200);
  });

  it('returns summary format when requested', async () => {
    const result = await sessionsGetObservations(
      { ids: [1, 2, 3], format: 'summary' },
      { db: fixture.db },
    );
    expect(result.observations.length).toBe(3);
    const first = result.observations[0] as {
      id: number;
      type: string;
      content: string;
      entities: string[];
    };
    expect(first.content.length).toBe(140);
    // Summary should NOT have session_id/created_at per D-79
    expect((first as Record<string, unknown>).session_id).toBeUndefined();
    expect((first as Record<string, unknown>).created_at).toBeUndefined();
  });

  it('silently drops missing ids', async () => {
    const result = await sessionsGetObservations(
      { ids: [1, 2, 999] },
      { db: fixture.db },
    );
    expect(result.observations.length).toBe(2);
    const ids = (result.observations as Array<{ id: number }>).map((o) => o.id);
    expect(ids).toEqual([1, 2]);
  });

  it('clamps ids to 50 when more provided', async () => {
    const allIds = Array.from({ length: 60 }, (_, i) => i + 1);
    const result = await sessionsGetObservations({ ids: allIds }, { db: fixture.db });
    expect(result.observations.length).toBe(50);
  });

  it('throws InvalidFilterError on empty ids', async () => {
    await expect(
      sessionsGetObservations({ ids: [] }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('throws InvalidFilterError on non-positive id', async () => {
    await expect(
      sessionsGetObservations({ ids: [-1] }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
    await expect(
      sessionsGetObservations({ ids: [0] }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
    await expect(
      sessionsGetObservations({ ids: [1.5] }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('orders returned observations by id ascending', async () => {
    const result = await sessionsGetObservations(
      { ids: [5, 3, 1] },
      { db: fixture.db },
    );
    const ids = (result.observations as Array<{ id: number }>).map((o) => o.id);
    expect(ids).toEqual([1, 3, 5]);
  });

  it('rejects unknown format value', async () => {
    await expect(
      sessionsGetObservations(
        // @ts-expect-error — intentional bad value for runtime guard
        { ids: [1], format: 'weird' },
        { db: fixture.db },
      ),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });
});
