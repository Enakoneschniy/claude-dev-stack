// tests/install-hook-migration.test.mjs
// Tests for Stop hook migration in lib/install/hooks.mjs (registerCaptureHook).
// Source: Phase 39 VALIDATION §Task 39-04-04
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

const promptMock = vi.fn();
vi.mock('prompts', () => ({
  default: promptMock,
}));

let registerCaptureHook;

beforeAll(async () => {
  const mod = await import('../lib/install/hooks.mjs');
  registerCaptureHook = mod.registerCaptureHook;
  if (typeof registerCaptureHook !== 'function') {
    throw new Error(
      `Expected registerCaptureHook export in lib/install/hooks.mjs. Available: ${Object.keys(mod).join(', ')}`,
    );
  }
});

describe('Stop hook migration (Phase 36 D-69 + Phase 39 D-121)', () => {
  beforeEach(() => {
    promptMock.mockReset();
  });

  it('fresh install (no existing Stop hooks): adds capture.sh without prompt', async () => {
    const settings = { hooks: {} };
    const result = await registerCaptureHook('/tmp/freshproj', settings);

    expect(result.action).toMatch(/added|migrated/);
    expect(promptMock).not.toHaveBeenCalled();
    const stopList = settings.hooks.Stop || [];
    const hasCapture = stopList.some((entry) => {
      const hooksArr = entry.hooks || [];
      return hooksArr.some((h) => (h.command || '').includes('session-end-capture.sh'));
    });
    expect(hasCapture).toBe(true);
  });

  it('idempotent: already-migrated settings produce no changes + no prompt', async () => {
    const settings = {
      hooks: {
        Stop: [
          { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-capture.sh' }] },
        ],
      },
    };
    const result = await registerCaptureHook('/tmp/alreadyproj', settings);

    expect(result.action).toBe('noop');
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('legacy check.sh present: prompts for confirmation, replaces on accept', async () => {
    promptMock.mockResolvedValueOnce({ proceed: true });
    const settings = {
      hooks: {
        Stop: [
          { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-check.sh' }] },
        ],
      },
    };
    const result = await registerCaptureHook('/tmp/legacyproj', settings);

    expect(promptMock).toHaveBeenCalledOnce();
    expect(result.action).toBe('migrated');

    const stopList = settings.hooks.Stop;
    const hasOld = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-check.sh')));
    const hasNew = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-capture.sh')));
    expect(hasOld).toBe(false);
    expect(hasNew).toBe(true);
  });

  it('legacy check.sh present but user declines: no change + result skipped', async () => {
    promptMock.mockResolvedValueOnce({ proceed: false });
    const settings = {
      hooks: {
        Stop: [
          { matcher: '*', hooks: [{ type: 'command', command: '~/.claude/hooks/session-end-check.sh' }] },
        ],
      },
    };
    const result = await registerCaptureHook('/tmp/declineproj', settings);

    expect(result.action).toBe('skipped');
    const stopList = settings.hooks.Stop;
    const hasOld = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-check.sh')));
    expect(hasOld).toBe(true);
  });

  it('custom user hooks preserved alongside capture.sh', async () => {
    const settings = {
      hooks: {
        Stop: [
          { matcher: '*', hooks: [{ type: 'command', command: '~/custom/my-hook.sh' }] },
        ],
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await registerCaptureHook('/tmp/customproj', settings);
    } finally {
      warnSpy.mockRestore();
    }

    const stopList = settings.hooks.Stop;
    const hasCustom = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('my-hook.sh')));
    const hasCapture = stopList.some((e) => (e.hooks || []).some((h) => (h.command || '').includes('session-end-capture.sh')));
    expect(hasCustom).toBe(true);
    expect(hasCapture).toBe(true);
  });
});
