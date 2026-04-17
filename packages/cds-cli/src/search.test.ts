import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockSearchFn, mockSearchAllFn } = vi.hoisted(() => ({
  mockSearchFn: vi.fn(async () => ({ hits: [], total_matched: 0, query_time_ms: 1 })),
  mockSearchAllFn: vi.fn(() => []),
}));

vi.mock('./mcp-tools/sessions-search.js', () => ({
  sessionsSearch: mockSearchFn,
}));

vi.mock('@cds/core', () => ({
  searchAllProjects: mockSearchAllFn,
}));

import { main } from './search.js';

describe('search.ts', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchFn.mockClear();
    mockSearchAllFn.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`exit:${code}`);
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('prints usage and exits 1 when no query provided', async () => {
    await expect(main([])).rejects.toThrow('exit:1');
    expect(stderrSpy).toHaveBeenCalledWith('Usage: claude-dev-stack search [--global] "<query>"\n');
  });

  it('prints "No results found" when search returns empty', async () => {
    mockSearchFn.mockResolvedValue({ hits: [], total_matched: 0, query_time_ms: 1 });
    await main(['test']);
    expect(stdoutSpy).toHaveBeenCalledWith('No results found.\n');
  });

  it('formats hits with type, content snippet, session ID, and date', async () => {
    mockSearchFn.mockResolvedValue({
      hits: [
        {
          observation_id: 1,
          session_id: 'abcdef12-3456-7890',
          type: 'decision',
          content: 'Use better-sqlite3 for vault',
          entities: [],
          created_at: '2026-04-16T10:00:00Z',
          rank: -1.5,
        },
      ],
      total_matched: 1,
      query_time_ms: 5,
    });
    await main(['sqlite']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('[decision] Use better-sqlite3 for vault');
    expect(output).toContain('session: abcdef12');
    expect(output).toContain('2026-04-16');
    expect(output).toContain('1 result(s) in 5ms');
  });

  it('truncates long content at 120 chars', async () => {
    const longContent = 'x'.repeat(200);
    mockSearchFn.mockResolvedValue({
      hits: [
        {
          observation_id: 1,
          session_id: 'a',
          type: 't',
          content: longContent,
          entities: [],
          created_at: '2026-01-01',
          rank: 0,
        },
      ],
      total_matched: 1,
      query_time_ms: 0,
    });
    await main(['test']);
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('...');
    expect(output).not.toContain('x'.repeat(200));
  });

  describe('search --global', () => {
    it('--global with no results prints "No results found across projects"', async () => {
      mockSearchAllFn.mockReturnValue([]);
      await main(['--global', 'test']);
      expect(stdoutSpy).toHaveBeenCalledWith('No results found across projects.\n');
    });

    it('--global extracts query correctly regardless of flag position', async () => {
      mockSearchAllFn.mockReturnValue([]);
      await main(['test-query', '--global']);
      expect(mockSearchAllFn).toHaveBeenCalledWith('test-query');
    });

    it('--global formats hits with project name', async () => {
      mockSearchAllFn.mockReturnValue([
        {
          project: 'my-project',
          observationId: 1,
          sessionId: 'abcdef12-3456-7890',
          type: 'decision',
          content: 'Use monorepo structure',
          entities: [],
          createdAt: '2026-04-17T10:00:00Z',
          sessionSummary: null,
          rank: -1.5,
        },
      ]);
      await main(['--global', 'monorepo']);
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('[my-project]');
      expect(output).toContain('[decision]');
      expect(output).toContain('Use monorepo structure');
      expect(output).toContain('1 result(s) across projects');
    });

    it('without --global does not call searchAllProjects', async () => {
      mockSearchFn.mockResolvedValue({ hits: [], total_matched: 0, query_time_ms: 1 });
      await main(['test-query']);
      expect(mockSearchAllFn).not.toHaveBeenCalled();
    });
  });
});
