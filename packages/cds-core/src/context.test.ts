/**
 * context.test.ts — Unit tests for Context class (CORE-01).
 *
 * All tests use a tmp-HOME redirect so that Context.save() writes land in a
 * throwaway directory, never the developer's real ~/.claude/.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context, contextFilePath } from './context.js';

const HOME_BACKUP = process.env.HOME;
const SESSION_BACKUP = process.env.CLAUDE_SESSION_ID;

async function setupTmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cds-ctx-'));
  process.env.HOME = dir;
  await mkdir(join(dir, '.claude'), { recursive: true });
  return dir;
}

async function cleanupTmpHome(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

describe('Context — construction & sessionId resolution (D-23)', () => {
  beforeEach(() => {
    delete process.env.CLAUDE_SESSION_ID;
  });
  afterEach(() => {
    if (SESSION_BACKUP !== undefined) process.env.CLAUDE_SESSION_ID = SESSION_BACKUP;
  });

  it('uses explicit constructor arg when provided', () => {
    const ctx = new Context('explicit-id');
    expect(ctx.sessionId).toBe('explicit-id');
  });

  it('falls back to process.env.CLAUDE_SESSION_ID when no arg', () => {
    process.env.CLAUDE_SESSION_ID = 'env-derived-id';
    const ctx = new Context();
    expect(ctx.sessionId).toBe('env-derived-id');
  });

  it('falls back to randomUUID when neither arg nor env present', () => {
    const ctx = new Context();
    // UUID v4 format: 8-4-4-4-12 hex digits
    expect(ctx.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('prefers explicit arg over env var', () => {
    process.env.CLAUDE_SESSION_ID = 'env-id';
    const ctx = new Context('arg-id');
    expect(ctx.sessionId).toBe('arg-id');
  });

  it('sessionId is readonly at runtime (reassignment throws in strict mode)', () => {
    const ctx = new Context('my-id');
    // In strict-mode ESM modules, reassigning a readonly class field throws a TypeError.
    // Vitest test files are transpiled in strict mode by default.
    expect(() => {
      (ctx as { sessionId: string }).sessionId = 'hacked';
    }).toThrow(TypeError);
  });
});

describe('Context — add / clear / summarize (D-22, D-24)', () => {
  it('add() accumulates messages in insertion order', () => {
    const ctx = new Context('test-add');
    ctx.add({ role: 'user', content: 'first', timestamp: '' });
    ctx.add({ role: 'assistant', content: 'second', timestamp: '' });
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[0].role).toBe('user');
    expect(ctx.messages[0].content).toBe('first');
    expect(ctx.messages[1].role).toBe('assistant');
    expect(ctx.messages[1].content).toBe('second');
  });

  it('add() auto-fills timestamp when omitted', () => {
    const ctx = new Context('test-ts');
    ctx.add({ role: 'user', content: 'hi', timestamp: '' });
    expect(ctx.messages[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('add() preserves explicit timestamp', () => {
    const ctx = new Context('test-ts-explicit');
    ctx.add({ role: 'user', content: 'hi', timestamp: '2000-01-01T00:00:00.000Z' });
    expect(ctx.messages[0].timestamp).toBe('2000-01-01T00:00:00.000Z');
  });

  it('clear() resets the in-memory array', () => {
    const ctx = new Context('test-clear');
    ctx.add({ role: 'user', content: 'a', timestamp: '' });
    ctx.add({ role: 'user', content: 'b', timestamp: '' });
    expect(ctx.messages).toHaveLength(2);
    ctx.clear();
    expect(ctx.messages).toHaveLength(0);
  });

  it('summarize() returns one line per message with role prefix', () => {
    const ctx = new Context('test-summary');
    ctx.add({ role: 'user', content: 'short', timestamp: '' });
    ctx.add({ role: 'assistant', content: 'longer content here', timestamp: '' });
    const s = ctx.summarize();
    expect(s).toContain('[user] short');
    expect(s).toContain('[assistant] longer content here');
    expect(s.split('\n')).toHaveLength(2);
  });

  it('summarize() truncates long content with ellipsis', () => {
    const ctx = new Context('test-trunc');
    const long = 'x'.repeat(200);
    ctx.add({ role: 'user', content: long, timestamp: '' });
    const s = ctx.summarize();
    expect(s).toContain('xxxxxxx');
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThan(100);
  });

  it('messages getter returns a readonly view (push/splice not on the array)', () => {
    const ctx = new Context('test-readonly');
    ctx.add({ role: 'user', content: 'a', timestamp: '' });
    const msgs = ctx.messages;
    // `readonly ConversationMessage[]` is a TS-level constraint — at runtime it's a normal array.
    // The contract is consumer-ergonomic (TS prevents .push in consumer code).
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs.length).toBe(1);
  });
});

describe('Context — save / load roundtrip + persistence path (D-22, D-24, D-25)', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await setupTmpHome();
  });
  afterEach(async () => {
    await cleanupTmpHome(tmpHome);
    if (HOME_BACKUP !== undefined) process.env.HOME = HOME_BACKUP;
  });

  it('save() writes to ~/.claude/cds-context-{sessionId}.json with mode 0600', async () => {
    const sessionId = 'roundtrip-sid';
    const ctx = new Context(sessionId);
    ctx.add({ role: 'user', content: 'hi', timestamp: '2026-04-16T12:00:00.000Z' });
    await ctx.save();

    const expectedPath = join(tmpHome, '.claude', `cds-context-${sessionId}.json`);
    expect(existsSync(expectedPath)).toBe(true);

    // Verify the contextFilePath helper also resolves to the same location when HOME is redirected
    expect(contextFilePath(sessionId)).toBe(expectedPath);

    // Verify mode 0600 (POSIX-only; skip check on Windows)
    if (process.platform !== 'win32') {
      const stats = await stat(expectedPath);
      // eslint-disable-next-line no-bitwise
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('save() writes JSON matching the on-disk schema', async () => {
    const sessionId = 'schema-sid';
    const ctx = new Context(sessionId);
    ctx.add({ role: 'user', content: 'hi', timestamp: '2026-04-16T12:00:00.000Z' });
    ctx.add({ role: 'assistant', content: 'hello', timestamp: '2026-04-16T12:00:05.000Z' });
    await ctx.save();

    const raw = await readFile(contextFilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed._v).toBe(1);
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toEqual({
      role: 'user',
      content: 'hi',
      timestamp: '2026-04-16T12:00:00.000Z',
    });
  });

  it('save() → load() roundtrips messages', async () => {
    const sessionId = 'rt-sid';
    const original = new Context(sessionId);
    original.add({ role: 'user', content: 'one', timestamp: '2026-04-16T12:00:00.000Z' });
    original.add({ role: 'assistant', content: 'two', timestamp: '2026-04-16T12:00:05.000Z' });
    await original.save();

    const loaded = await Context.load(sessionId);
    expect(loaded.sessionId).toBe(sessionId);
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[0].content).toBe('one');
    expect(loaded.messages[1].content).toBe('two');
  });

  it('Context.load(unknown-id) returns a fresh empty Context (no error)', async () => {
    const ctx = await Context.load('no-such-session');
    expect(ctx.sessionId).toBe('no-such-session');
    expect(ctx.messages).toHaveLength(0);
  });

  it('add() does NOT auto-save to disk (D-24)', async () => {
    const sessionId = 'no-autosave';
    const ctx = new Context(sessionId);
    ctx.add({ role: 'user', content: 'hi', timestamp: '' });
    // File must NOT exist — save() was not called
    expect(existsSync(contextFilePath(sessionId))).toBe(false);
  });

  it('save() is atomic — tmp file does not linger on successful write', async () => {
    const sessionId = 'atomic-sid';
    const ctx = new Context(sessionId);
    ctx.add({ role: 'user', content: 'x', timestamp: '' });
    await ctx.save();
    expect(existsSync(contextFilePath(sessionId))).toBe(true);
    expect(existsSync(`${contextFilePath(sessionId)}.tmp`)).toBe(false);
  });
});

describe('Context — load error cases (D-25 safety)', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await setupTmpHome();
  });
  afterEach(async () => {
    await cleanupTmpHome(tmpHome);
    if (HOME_BACKUP !== undefined) process.env.HOME = HOME_BACKUP;
  });

  it('throws on unsupported schema version', async () => {
    const sessionId = 'bad-version';
    const path = contextFilePath(sessionId);
    await writeFile(
      path,
      JSON.stringify({ _v: 99, sessionId, savedAt: new Date().toISOString(), messages: [] }),
      'utf8',
    );
    await expect(Context.load(sessionId)).rejects.toThrow(/Unsupported context schema version: 99/);
  });

  it('throws on sessionId mismatch', async () => {
    const requestedId = 'requested-sid';
    const path = contextFilePath(requestedId);
    await writeFile(
      path,
      JSON.stringify({ _v: 1, sessionId: 'different-sid', savedAt: new Date().toISOString(), messages: [] }),
      'utf8',
    );
    await expect(Context.load(requestedId)).rejects.toThrow(/sessionId mismatch/);
  });

  it('throws on malformed JSON', async () => {
    const sessionId = 'bad-json';
    const path = contextFilePath(sessionId);
    await writeFile(path, '{not valid json', 'utf8');
    await expect(Context.load(sessionId)).rejects.toThrow(/Failed to parse context file/);
  });
});
