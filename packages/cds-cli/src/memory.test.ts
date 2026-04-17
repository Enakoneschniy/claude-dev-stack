// packages/cds-cli/src/memory.test.ts
// Unit tests for memory CLI command (D-140 / D-146).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListSessions, mockGetSessionObsCount, mockListObs, mockClose } = vi.hoisted(() => ({
  mockListSessions: vi.fn(() => []),
  mockGetSessionObsCount: vi.fn(() => 0),
  mockListObs: vi.fn(() => []),
  mockClose: vi.fn(),
}));

vi.mock('@cds/core', () => ({
  openSessionsDB: vi.fn(() => ({
    listSessions: mockListSessions,
    getSessionObservationCount: mockGetSessionObsCount,
    listObservations: mockListObs,
    close: mockClose,
  })),
  closeSessionsDB: vi.fn(),
}));

import { formatMemorySummary } from './memory.js';

describe('memory.ts', () => {
  beforeEach(() => {
    mockListSessions.mockClear();
    mockGetSessionObsCount.mockClear();
    mockListObs.mockClear();
    mockClose.mockClear();
  });

  it('returns no-sessions message when DB is empty', () => {
    mockListSessions.mockReturnValue([]);
    const out = formatMemorySummary({ projectPath: '/fake' });
    expect(out).toContain('No sessions recorded yet');
    expect(out).toContain('sessions.search MCP tool');
  });

  it('formats sessions with observation count and topic excerpts per D-140', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'Phase 41 UAT complete' },
      { id: 'b', start_time: '2026-04-16T09:00:00Z', end_time: null, project: 'test', summary: 'Phase 41 UAT' },
    ]);
    mockGetSessionObsCount.mockReturnValueOnce(3).mockReturnValueOnce(5);
    mockListObs
      .mockReturnValueOnce([
        { id: 1, session_id: 'a', type: 'decision', content: 'Phase 41 UAT complete', entities: [], created_at: '' },
        { id: 2, session_id: 'a', type: 'pattern', content: 'Docker devcontainer setup', entities: [], created_at: '' },
      ])
      .mockReturnValueOnce([
        { id: 3, session_id: 'b', type: 'decision', content: 'Phase 39 execute started', entities: [], created_at: '' },
      ]);
    const out = formatMemorySummary({ projectPath: '/fake' });
    expect(out).toContain('Session 2026-04-17: [3 observations] --');
    expect(out).toContain('Session 2026-04-16: [5 observations] --');
    expect(out).toContain('Recent memory (from SQLite):');
  });

  it('respects sessionCount option', () => {
    mockListSessions.mockReturnValue([]);
    formatMemorySummary({ projectPath: '/fake', sessionCount: 5 });
    expect(mockListSessions).toHaveBeenCalledWith({ limit: 5 });
  });

  it('falls back to summary when no observations exist', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'Phase 42 planning' },
    ]);
    mockGetSessionObsCount.mockReturnValue(0);
    mockListObs.mockReturnValue([]);
    const out = formatMemorySummary({ projectPath: '/fake' });
    expect(out).toContain('[0 observations]');
    expect(out).toContain('Phase 42 planning');
  });

  it('handles missing summary gracefully', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: null },
    ]);
    mockGetSessionObsCount.mockReturnValue(0);
    mockListObs.mockReturnValue([]);
    const out = formatMemorySummary({ projectPath: '/fake' });
    expect(out).toContain('no summary');
  });

  it('includes footer line for deeper queries', () => {
    mockListSessions.mockReturnValue([
      { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test session' },
    ]);
    mockGetSessionObsCount.mockReturnValue(1);
    mockListObs.mockReturnValue([]);
    const out = formatMemorySummary({ projectPath: '/fake' });
    expect(out).toContain('Use sessions.search MCP tool for deeper queries.');
  });
});
