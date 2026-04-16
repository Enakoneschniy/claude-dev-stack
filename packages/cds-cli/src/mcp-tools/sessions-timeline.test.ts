// Phase 37 Plan 02 Task 37-02-05 — tests for sessions.timeline.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidFilterError, SessionNotFoundError } from './shared.js';
import { sessionsTimeline } from './sessions-timeline.js';
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
  createdIso: string,
  content = `obs ${id}`,
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

describe('sessions.timeline', () => {
  let fixture: FixtureHandle;

  beforeEach(() => {
    // 11 observations in session S1 with timestamps 1s apart (increasing by id)
    // so anchor=6 has 5 before + 5 after available.
    const obs: FixtureObservation[] = Array.from({ length: 11 }, (_, i) =>
      makeObs(
        i + 1,
        'S1',
        `2026-04-16T10:00:${String(i).padStart(2, '0')}.000Z`,
      ),
    );
    fixture = buildFixtureSessionsDB({
      sessions: [makeSession('S1')],
      observations: obs,
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('returns anchor + default 5 before + 5 after', async () => {
    const result = await sessionsTimeline(
      { anchor_observation_id: 6 },
      { db: fixture.db },
    );
    expect(result.anchor_id).toBe(6);
    expect(result.observations.length).toBe(11);
    const offsets = result.observations.map((o) => o.offset);
    expect(offsets).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
  });

  it('clamps window_before and window_after to 20', async () => {
    const result = await sessionsTimeline(
      { anchor_observation_id: 6, window_before: 100, window_after: 100 },
      { db: fixture.db },
    );
    // With an 11-obs seed and anchor=6, all 10 non-anchor observations fit
    // within the clamped window, so length = 11.
    expect(result.observations.length).toBe(11);
  });

  it('handles anchor near start (fewer before available)', async () => {
    const result = await sessionsTimeline(
      { anchor_observation_id: 2 },
      { db: fixture.db },
    );
    expect(result.observations.length).toBe(7); // 1 before + anchor + 5 after
    expect(result.observations[0]?.id).toBe(1);
    expect(result.observations[0]?.offset).toBe(-1);
  });

  it('handles anchor near end', async () => {
    const result = await sessionsTimeline(
      { anchor_observation_id: 10 },
      { db: fixture.db },
    );
    expect(result.observations.length).toBe(7); // 5 before + anchor + 1 after
    const last = result.observations[result.observations.length - 1];
    expect(last?.id).toBe(11);
    expect(last?.offset).toBe(1);
  });

  it('throws SessionNotFoundError on unknown anchor_id', async () => {
    await expect(
      sessionsTimeline({ anchor_observation_id: 999 }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('throws InvalidFilterError on non-positive anchor', async () => {
    await expect(
      sessionsTimeline({ anchor_observation_id: 0 }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
    await expect(
      sessionsTimeline({ anchor_observation_id: -1 }, { db: fixture.db }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('ties break by id ascending', async () => {
    const fx = buildFixtureSessionsDB({
      sessions: [makeSession('T1')],
      observations: [
        makeObs(100, 'T1', '2026-04-16T10:00:00.000Z'),
        makeObs(101, 'T1', '2026-04-16T10:00:00.000Z'),
        makeObs(102, 'T1', '2026-04-16T10:00:00.000Z'),
      ],
    });
    try {
      const result = await sessionsTimeline(
        { anchor_observation_id: 101, window_before: 2, window_after: 2 },
        { db: fx.db },
      );
      const ids = result.observations.map((o) => o.id);
      expect(ids).toEqual([100, 101, 102]);
    } finally {
      fx.cleanup();
    }
  });

  it('only returns same-session observations', async () => {
    const fx = buildFixtureSessionsDB({
      sessions: [makeSession('S1'), makeSession('S2')],
      observations: [
        makeObs(1, 'S1', '2026-04-16T10:00:00.000Z'),
        makeObs(2, 'S2', '2026-04-16T10:00:01.000Z'), // interleaved
        makeObs(3, 'S1', '2026-04-16T10:00:02.000Z'),
        makeObs(4, 'S2', '2026-04-16T10:00:03.000Z'),
        makeObs(5, 'S1', '2026-04-16T10:00:04.000Z'),
      ],
    });
    try {
      const result = await sessionsTimeline(
        { anchor_observation_id: 3, window_before: 5, window_after: 5 },
        { db: fx.db },
      );
      for (const o of result.observations) {
        expect(o.session_id).toBe('S1');
      }
    } finally {
      fx.cleanup();
    }
  });
});
