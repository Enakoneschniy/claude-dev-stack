import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockListSessions,
  mockCountByType,
  mockClose,
  mockCountEntities,
  mockTopEntities,
} = vi.hoisted(() => ({
  mockListSessions: vi.fn(() => []),
  mockCountByType: vi.fn(() => []),
  mockClose: vi.fn(),
  mockCountEntities: vi.fn(() => 0),
  mockTopEntities: vi.fn(() => []),
}));

vi.mock('@cds/core', () => ({
  openSessionsDB: vi.fn(() => ({
    listSessions: mockListSessions,
    countObservationsByType: mockCountByType,
    countEntities: mockCountEntities,
    topEntities: mockTopEntities,
    close: mockClose,
  })),
  closeSessionsDB: vi.fn(),
}));

import { formatDashboard, main } from './stats.js';

describe('stats.ts', () => {
  beforeEach(() => {
    mockListSessions.mockClear();
    mockCountByType.mockClear();
    mockClose.mockClear();
    mockCountEntities.mockClear();
    mockTopEntities.mockClear();
  });

  it('shows zero counts when DB is empty', () => {
    mockListSessions.mockReturnValue([]);
    mockCountByType.mockReturnValue([]);
    mockCountEntities.mockReturnValue(0);
    mockTopEntities.mockReturnValue([]);
    const out = formatDashboard('/fake/project-name');
    expect(out).toContain('Project: project-name');
    expect(out).toContain('Sessions: 0 (0 this week)');
    expect(out).toContain('Observations: 0 (none)');
    expect(out).toContain('Entities: 0');
    expect(out).toContain('Last activity: none');
  });

  it('counts sessions, observations, and entities correctly per D-145', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: new Date().toISOString(), end_time: null, project: 'x', summary: 'test' },
      { id: 'b', start_time: '2025-01-01T00:00:00Z', end_time: null, project: 'x', summary: 'old' },
    ]);
    mockCountByType.mockReturnValue([
      { type: 'decision', count: 5 },
      { type: 'bug', count: 2 },
    ]);
    mockCountEntities.mockReturnValue(89);
    mockTopEntities.mockReturnValue([
      { name: 'SQLite', count: 15 },
      { name: 'dispatchAgent', count: 12 },
      { name: 'Phase 39', count: 8 },
    ]);
    const out = formatDashboard('/fake/myproject');
    expect(out).toContain('Sessions: 2 (1 this week)');
    expect(out).toContain('Observations: 7 (decision: 5, bug: 2)');
    expect(out).toContain('Entities: 89 (top: SQLite, dispatchAgent, Phase 39)');
    expect(out).toContain('Project: myproject');
  });

  it('shows last activity from most recent session', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'x', summary: null },
    ]);
    mockCountByType.mockReturnValue([]);
    mockCountEntities.mockReturnValue(0);
    mockTopEntities.mockReturnValue([]);
    const out = formatDashboard('/fake/proj');
    expect(out).toContain('Last activity: 2026-04-17');
  });

  it('writes dashboard output to stdout from main()', async () => {
    mockListSessions.mockReturnValue([]);
    mockCountByType.mockReturnValue([]);
    mockCountEntities.mockReturnValue(0);
    mockTopEntities.mockReturnValue([]);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await main([]);
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Project:');
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
