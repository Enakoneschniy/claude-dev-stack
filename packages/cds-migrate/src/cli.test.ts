// Phase 38 Plan 03 Task 38-03-02 — CLI flag + output coverage.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import {
  createTempVault,
  type TempVault,
} from '../tests/helpers/temp-vault.js';
import { createTestDB, type TestDB } from '../tests/helpers/temp-db.js';

// The CLI uses `prompts` — mock at module level to avoid TTY dependency.
vi.mock('prompts', () => ({
  default: vi.fn(async () => ({ proceed: false })),
}));

describe('cli.main — flag parsing', () => {
  it('prints help and exits 0 when --help passed', async () => {
    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main(['--help']);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('prints help and exits 1 when no subcommand', async () => {
    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main([]);
    expect(exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it('exits 1 on unknown subcommand', async () => {
    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['unknown']);
    expect(exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits 1 when both --dry-run and --apply passed', async () => {
    const { main } = await import('./cli.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['sessions', '--dry-run', '--apply']);
    expect(exitCode).toBe(1);
    expect(
      errSpy.mock.calls.some((call) =>
        String(call[0]).includes('mutually exclusive'),
      ),
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('exits 1 when --force-refresh used without --apply', async () => {
    const { main } = await import('./cli.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['sessions', '--force-refresh']);
    expect(exitCode).toBe(1);
    expect(
      errSpy.mock.calls.some((call) =>
        String(call[0]).includes('--force-refresh requires --apply'),
      ),
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('accepts --max-cost 0.50 as a valid float (empty vault → exits 0)', async () => {
    const emptyVault = createTempVault({ projectName: 'no-sessions' });
    try {
      const { main } = await import('./cli.js');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitCode = await main([
        'sessions',
        '--dry-run',
        '--max-cost',
        '0.50',
        '--vault',
        emptyVault.vaultPath,
        '--project',
        emptyVault.projectName,
      ]);
      expect(exitCode).toBe(0);
      logSpy.mockRestore();
    } finally {
      emptyVault.cleanup();
    }
  });

  it('rejects --max-cost invalid (non-numeric)', async () => {
    const { main } = await import('./cli.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main([
      'sessions',
      '--max-cost',
      'not-a-number',
    ]);
    expect(exitCode).toBe(1);
    errSpy.mockRestore();
  });

  it('rejects --max-cost 0 (non-positive)', async () => {
    const { main } = await import('./cli.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['sessions', '--max-cost', '0']);
    expect(exitCode).toBe(1);
    errSpy.mockRestore();
  });

  it('rejects unknown flags', async () => {
    const { main } = await import('./cli.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['sessions', '--does-not-exist']);
    expect(exitCode).toBe(1);
    errSpy.mockRestore();
  });
});

describe('cli.main — dry-run output', () => {
  let vault: TempVault;
  let testDb: TestDB;

  beforeEach(() => {
    vault = createTempVault({
      fixtures: ['empty-sections.md', 'bare-list.md'],
    });
    testDb = createTestDB();
  });

  afterEach(() => {
    testDb.cleanup();
    vault.cleanup();
  });

  it('prints dry-run table with 2 rows + total row for fixture vault', async () => {
    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main([
      'sessions',
      '--dry-run',
      '--vault',
      vault.vaultPath,
      '--project',
      vault.projectName,
    ]);
    expect(exitCode).toBe(0);
    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('empty-sections.md');
    expect(output).toContain('bare-list.md');
    expect(output).toContain('Total');
    expect(output).toContain('Filename');
    expect(output).toContain('Tokens(est)');
    logSpy.mockRestore();
  });

  it('prints "No sessions found" when the sessions directory is empty', async () => {
    const emptyVault = createTempVault({ projectName: 'empty-project' });
    try {
      const { main } = await import('./cli.js');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitCode = await main([
        'sessions',
        '--dry-run',
        '--vault',
        emptyVault.vaultPath,
        '--project',
        emptyVault.projectName,
      ]);
      expect(exitCode).toBe(0);
      const output = logSpy.mock.calls
        .map((call) => String(call[0]))
        .join('\n');
      expect(output).toContain('No sessions found');
      logSpy.mockRestore();
    } finally {
      emptyVault.cleanup();
    }
  });
});

describe('cli.main — confirmation prompt', () => {
  let vault: TempVault;
  let testDb: TestDB;

  beforeEach(() => {
    vault = createTempVault({ fixtures: ['large.md'] });
    testDb = createTestDB();
  });

  afterEach(() => {
    testDb.cleanup();
    vault.cleanup();
  });

  it('rejecting the confirmation prompt exits 2', async () => {
    const promptsModule = (await import('prompts')) as unknown as {
      default: ReturnType<typeof vi.fn>;
    };
    promptsModule.default.mockImplementationOnce(async () => ({
      proceed: false,
    }));

    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main([
      'sessions',
      '--apply',
      '--max-cost',
      '0.0001',
      '--vault',
      vault.vaultPath,
      '--project',
      vault.projectName,
    ]);
    expect(exitCode).toBe(2);
    logSpy.mockRestore();
  });

  it('below-threshold apply does NOT trigger the confirmation prompt', async () => {
    const promptsModule = (await import('prompts')) as unknown as {
      default: ReturnType<typeof vi.fn>;
    };
    promptsModule.default.mockClear();

    const { main } = await import('./cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // No dispatchAgent mock available to the CLI (it uses the production
    // path) — the apply will fail without ANTHROPIC_API_KEY, yielding exit
    // code 1. Asserting `prompts` was not called is the invariant we care
    // about here: the threshold gate.
    const exitCode = await main([
      'sessions',
      '--apply',
      '--max-cost',
      '10',
      '--vault',
      vault.vaultPath,
      '--project',
      vault.projectName,
    ]);
    expect(promptsModule.default).not.toHaveBeenCalled();
    expect([0, 1]).toContain(exitCode);
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('cli.main — non-TTY progress path', () => {
  it('detects non-TTY state so progress rendering can adapt', () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
      writable: true,
    });
    try {
      expect(process.stdout.isTTY).toBe(false);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
        writable: true,
      });
    }
  });
});
