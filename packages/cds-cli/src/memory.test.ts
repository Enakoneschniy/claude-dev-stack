// packages/cds-cli/src/memory.test.ts
// Unit tests for memory CLI command (D-140 / D-146).
// Phase 45 — auto-surface tests (MEM-06, MEM-07).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListSessions, mockGetSessionObsCount, mockListObs, mockSearchObs, mockClose } = vi.hoisted(() => ({
  mockListSessions: vi.fn(() => []),
  mockGetSessionObsCount: vi.fn(() => 0),
  mockListObs: vi.fn(() => []),
  mockSearchObs: vi.fn(() => []),
  mockClose: vi.fn(),
}));

vi.mock('@cds/core', () => ({
  openSessionsDB: vi.fn(() => ({
    listSessions: mockListSessions,
    getSessionObservationCount: mockGetSessionObsCount,
    listObservations: mockListObs,
    searchObservations: mockSearchObs,
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
    mockSearchObs.mockClear();
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

  describe('auto-surface relevant observations', () => {
    it('includes "Relevant past observations:" when FTS5 matches exist', () => {
      // listSessions called twice: once for recent sessions display, once for auto-surface
      mockListSessions.mockReturnValue([
        { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test' },
      ]);
      mockGetSessionObsCount.mockReturnValue(2);
      mockListObs.mockReturnValue([
        { id: 1, session_id: 'a', type: 'decision', content: 'authentication system design', entities: [], created_at: '2026-04-17T10:00:00Z' },
        { id: 2, session_id: 'a', type: 'pattern', content: 'auth token refresh flow', entities: [], created_at: '2026-04-17T11:00:00Z' },
      ]);
      mockSearchObs.mockReturnValue([
        {
          observation: { id: 1, session_id: 'a', type: 'decision', content: 'authentication system design', entities: [], created_at: '2026-04-17T10:00:00Z' },
          rank: -1.5,
          sessionSummary: null,
        },
      ]);
      const out = formatMemorySummary({ projectPath: '/tmp/my-auth-project' });
      expect(out).toContain('Relevant past observations:');
      expect(out).toContain('[decision]');
      expect(out).toContain('fts5');
    });

    it('fuzzy matching finds observations via MiniSearch', () => {
      mockListSessions.mockReturnValue([
        { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test' },
      ]);
      mockGetSessionObsCount.mockReturnValue(1);
      mockListObs.mockReturnValue([
        { id: 10, session_id: 'a', type: 'decision', content: 'authentication middleware setup', entities: [], created_at: '2026-04-17T10:00:00Z' },
      ]);
      // FTS5 returns nothing — fuzzy should still find it
      mockSearchObs.mockReturnValue([]);
      const out = formatMemorySummary({ projectPath: '/tmp/my-auth-project' });
      expect(out).toContain('Relevant past observations:');
      expect(out).toContain('fuzzy');
    });

    it('deduplicates results across FTS5 and fuzzy', () => {
      mockListSessions.mockReturnValue([
        { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test' },
      ]);
      mockGetSessionObsCount.mockReturnValue(1);
      const sharedObs = { id: 5, session_id: 'a', type: 'decision', content: 'authentication module created', entities: [], created_at: '2026-04-17T10:00:00Z' };
      mockListObs.mockReturnValue([sharedObs]);
      mockSearchObs.mockReturnValue([
        { observation: sharedObs, rank: -2, sessionSummary: null },
      ]);
      const out = formatMemorySummary({ projectPath: '/tmp/my-auth-project' });
      // Count occurrences of [decision] — should appear only once for the deduplicated observation
      const matches = out.match(/\[decision\]/g) ?? [];
      // May have 1 from sessions listing + 1 from relevant, but the relevant section
      // should not have duplicates
      const relevantSection = out.split('Relevant past observations:')[1] ?? '';
      const relevantMatches = relevantSection.match(/\[decision\]/g) ?? [];
      expect(relevantMatches.length).toBe(1);
    });

    it('gracefully handles empty observations without crashing', () => {
      mockListSessions.mockReturnValue([
        { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test' },
      ]);
      mockGetSessionObsCount.mockReturnValue(0);
      mockListObs.mockReturnValue([]);
      mockSearchObs.mockReturnValue([]);
      const out = formatMemorySummary({ projectPath: '/tmp/my-auth-project' });
      // Should not crash and should not include the section
      expect(out).not.toContain('Relevant past observations:');
    });

    it('caps results to maxResults (5)', () => {
      mockListSessions.mockReturnValue([
        { id: 'a', start_time: '2026-04-17T10:00:00Z', end_time: null, project: 'test', summary: 'test' },
      ]);
      mockGetSessionObsCount.mockReturnValue(10);
      // Return many observations that all match
      const manyObs = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        session_id: 'a',
        type: 'decision',
        content: `authentication feature number ${i + 1}`,
        entities: [],
        created_at: '2026-04-17T10:00:00Z',
      }));
      mockListObs.mockReturnValue(manyObs);
      mockSearchObs.mockReturnValue(
        manyObs.slice(0, 10).map((o) => ({
          observation: o,
          rank: -1,
          sessionSummary: null,
        })),
      );
      const out = formatMemorySummary({ projectPath: '/tmp/my-auth-project' });
      const relevantSection = out.split('Relevant past observations:')[1] ?? '';
      const lineCount = relevantSection.split('\n').filter((l) => l.trim().startsWith('[')).length;
      expect(lineCount).toBeLessThanOrEqual(5);
    });
  });
});
