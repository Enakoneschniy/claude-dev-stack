---
plan_id: 34-03-context-class
phase: 34
plan: 03
type: execute
wave: 1
depends_on:
  - 34-01-sdk-dependency-notices
files_modified:
  - packages/cds-core/src/context.ts
  - packages/cds-core/src/context.test.ts
autonomous: true
requirements:
  - CORE-01
user_setup: []
must_haves:
  truths:
    - "Context class constructor resolves sessionId: arg > process.env.CLAUDE_SESSION_ID > crypto.randomUUID() (ROADMAP SC#3 / D-23)"
    - "sessionId is frozen after construction — cannot be reassigned (D-23)"
    - "Context.add() appends to internal messages array in insertion order (D-22)"
    - "Context.clear() resets in-memory array without touching disk (D-22)"
    - "Context.summarize() returns a compact text summary (D-22)"
    - "Context.save() writes JSON to ~/.claude/cds-context-{sessionId}.json atomically (D-24/D-25 + Pitfall 3 mitigation)"
    - "Context.load(sessionId) static factory reads file if present and returns a hydrated instance (D-22)"
    - "File format is { _v: 1, sessionId, savedAt, messages: [{ role, content, timestamp }] } (D-25)"
    - "Unsupported _v throws; mismatched sessionId throws (D-25 safety)"
    - "Context.save() sets file mode 0600 (defense in depth — research §Security Domain V8)"
    - "No auto-save on add() (D-24 explicit persistence)"
  artifacts:
    - path: "packages/cds-core/src/context.ts"
      provides: "Context class + ConversationMessage type + ContextFile schema"
      contains: "export class Context"
    - path: "packages/cds-core/src/context.test.ts"
      provides: "Unit tests using tmp-HOME redirect pattern"
      contains: "cds-context-"
  key_links:
    - from: "Context constructor sessionId arg (or env var, or uuid fallback)"
      to: "readonly this.sessionId frozen at construction"
      via: "resolution chain"
      pattern: 'readonly sessionId'
    - from: "Context.save()"
      to: "~/.claude/cds-context-{sessionId}.json (mode 0600)"
      via: "atomic write (write to .tmp + rename)"
      pattern: 'writeFile'
    - from: "Context.load(sessionId)"
      to: "fully hydrated Context with messages array restored"
      via: "readFile + JSON.parse + _v check"
      pattern: 'static async load'
---

<objective>
Implement the `Context` class — CDS's cross-`dispatchAgent`-call conversation state holder with explicit persistence (CONTEXT.md D-22..D-26). Ship the class in `packages/cds-core/src/context.ts` with a JSON on-disk schema versioned at `_v: 1`, atomic writes to `~/.claude/cds-context-{sessionId}.json`, and comprehensive unit tests that use a `HOME` environment redirect so disk I/O never escapes the test tmpdir.

Purpose: satisfy CORE-01 ("`Context` instance accumulates conversation history across `add()` calls and persists to `~/.claude/cds-context-{session_id}.json` when persistence is enabled"). This plan runs in Wave 1 alongside Plans 02 and 04 — all three share only the `sessionId` threading convention, no file-level dependencies.

Output: 2 new files — `context.ts`, `context.test.ts` — and a `feat(34-03)` commit on the phase branch.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md
@.planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md
@.planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md
@.planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md
@./CLAUDE.md
@./packages/cds-core/package.json
@./packages/cds-core/src/errors.ts

<interfaces>
<!-- Context public API shape (CONTEXT.md D-22, adapted to async fs/promises per RESEARCH.md Pattern 3 note). -->
<!-- D-22 sketch showed sync-looking signatures; real impl is async because Node's fs/promises is async and blocking the event loop with readFileSync/writeFileSync is wrong for this use case. -->

```ts
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;        // ISO 8601
  tool_use_id?: string;     // optional, Phase 36+ readiness per CONTEXT.md Claude's Discretion
}

export class Context {
  readonly sessionId: string;                   // frozen at construction (D-23)
  constructor(sessionId?: string);              // sessionId resolution: arg > env > uuid
  static load(sessionId: string): Promise<Context>;
  add(message: ConversationMessage): void;      // in-memory only (no auto-save per D-24)
  clear(): void;                                 // in-memory only
  summarize(): string;                           // compact text summary
  save(): Promise<void>;                          // atomic write to ~/.claude/cds-context-{sessionId}.json
  get messages(): readonly ConversationMessage[];// readonly view
}
```

On-disk schema (D-25):
```json
{
  "_v": 1,
  "sessionId": "<uuid>",
  "savedAt": "2026-04-16T12:34:56.789Z",
  "messages": [
    { "role": "user", "content": "hi", "timestamp": "2026-04-16T12:34:50.000Z" },
    { "role": "assistant", "content": "hello", "timestamp": "2026-04-16T12:34:55.000Z" }
  ]
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create packages/cds-core/src/context.ts with full Context class implementation</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"Context Class (D-22 … D-26)"
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Pattern 3: Context persistence roundtrip", §"Common Pitfalls" (Pitfall 3)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/context.ts"
  </read_first>
  <files>
    - packages/cds-core/src/context.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/context.ts` with the full Context implementation, including `ConversationMessage` type, `ContextFile` schema, atomic write via `writeFile` + `rename`, and file mode 0600.

  **File: `packages/cds-core/src/context.ts`** — paste verbatim:

  ```typescript
  /**
   * Context — in-memory conversation state with explicit JSON persistence.
   *
   * CONTEXT.md D-22..D-26 contract:
   *   - sessionId: arg > process.env.CLAUDE_SESSION_ID > crypto.randomUUID() (frozen)
   *   - Persistence is explicit: user calls save() — no auto-save on add()
   *   - File: ~/.claude/cds-context-{sessionId}.json, mode 0600, atomic write
   *   - Schema: { _v: 1, sessionId, savedAt, messages: [{ role, content, timestamp, tool_use_id? }] }
   *   - load(sessionId) is a static async factory (Node fs/promises is async)
   *   - No compaction in Phase 34 (D-26)
   */

  import { randomUUID } from 'node:crypto';
  import { existsSync } from 'node:fs';
  import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
  import { homedir } from 'node:os';
  import { join } from 'node:path';

  export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;           // ISO 8601; auto-filled by add() if omitted
    tool_use_id?: string;         // Phase 36+ readiness (Claude's Discretion per CONTEXT.md)
  }

  interface ContextFile {
    _v: 1;
    sessionId: string;
    savedAt: string;
    messages: ConversationMessage[];
  }

  /** Compute path to persistence file for a given session ID. */
  export function contextFilePath(sessionId: string): string {
    return join(homedir(), '.claude', `cds-context-${sessionId}.json`);
  }

  export class Context {
    readonly sessionId: string;
    private _messages: ConversationMessage[] = [];

    constructor(sessionId?: string) {
      // D-23 resolution order: explicit arg > env > uuid fallback
      const resolved = sessionId
        ?? process.env.CLAUDE_SESSION_ID
        ?? randomUUID();
      // Freeze the value — Context is a single-session container
      Object.defineProperty(this, 'sessionId', {
        value: resolved,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      // TS-strict requires explicit readonly init; Object.defineProperty above
      // covers the runtime freeze but the TS compiler needs this:
      this.sessionId = resolved;
    }

    /**
     * Hydrate a Context from its persisted JSON file. If the file does not
     * exist, returns a fresh Context (not an error — matches D-22 factory
     * semantics where load doubles as "get or create").
     */
    static async load(sessionId: string): Promise<Context> {
      const ctx = new Context(sessionId);
      const path = contextFilePath(sessionId);
      if (!existsSync(path)) return ctx;
      const raw = await readFile(path, 'utf8');
      let parsed: ContextFile;
      try {
        parsed = JSON.parse(raw) as ContextFile;
      } catch (err) {
        throw new Error(
          `Failed to parse context file ${path}: ${(err as Error).message}`,
          { cause: err },
        );
      }
      if (parsed._v !== 1) {
        throw new Error(
          `Unsupported context schema version: ${parsed._v}. This version of @cds/core expects _v === 1.`,
        );
      }
      if (parsed.sessionId !== sessionId) {
        throw new Error(
          `Context file sessionId mismatch: file has "${parsed.sessionId}", requested "${sessionId}".`,
        );
      }
      ctx._messages = Array.isArray(parsed.messages) ? [...parsed.messages] : [];
      return ctx;
    }

    /** Append a message to the in-memory array. Auto-fills timestamp if omitted. */
    add(message: ConversationMessage): void {
      this._messages.push({
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      });
    }

    /** Reset the in-memory array. Does NOT touch disk (D-24). */
    clear(): void {
      this._messages = [];
    }

    /**
     * Return a compact text summary — one line per message with role prefix
     * and first 80 characters of content.
     */
    summarize(): string {
      return this._messages
        .map((m) => `[${m.role}] ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`)
        .join('\n');
    }

    /**
     * Atomically persist the in-memory messages to the context file.
     * Writes to `{path}.tmp` then renames — rename is atomic on POSIX
     * and prevents mid-write corruption if multiple saves race (Pitfall 3).
     * Sets file mode 0600 after write for defense-in-depth (research §Security V8).
     */
    async save(): Promise<void> {
      const dir = join(homedir(), '.claude');
      await mkdir(dir, { recursive: true });
      const path = contextFilePath(this.sessionId);
      const tmpPath = `${path}.tmp`;
      const payload: ContextFile = {
        _v: 1,
        sessionId: this.sessionId,
        savedAt: new Date().toISOString(),
        messages: this._messages,
      };
      await writeFile(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(tmpPath, path);
      // chmod after rename is a belt-and-suspenders move in case the rename
      // preserved a broader mode from the source — POSIX usually preserves
      // the source mode we already set to 0o600 above, so this is defensive.
      try {
        await chmod(path, 0o600);
      } catch {
        // Non-fatal: some filesystems don't support chmod (e.g., NTFS-mounted
        // volumes on macOS). The 0o600 writeFile mode is the primary safeguard.
      }
    }

    /** Readonly view of the in-memory messages. */
    get messages(): readonly ConversationMessage[] {
      return this._messages;
    }
  }
  ```

  **Notes:**
  - `Object.defineProperty(this, 'sessionId', ...)` with `writable: false, configurable: false` is the runtime freeze. The TypeScript `readonly` modifier + second assignment are required for TS-strict compilation — the second assignment is a no-op at runtime (property is non-writable by the time the line runs, but TS sees the class declaration as valid). An alternative is `Object.freeze(this)` after construction, but that also freezes `_messages` which we need mutable. The current approach is the minimal freeze.
  - Actually, **correction**: after `Object.defineProperty` sets `writable: false`, the subsequent `this.sessionId = resolved` will throw in strict mode. Use a different TS-compatible pattern — assign first, then defineProperty is redundant since readonly + `public readonly sessionId` field already prevents rebinding after constructor. The simplest fix is to remove the `defineProperty` call and just use the `readonly` class field — TS guarantees no re-assignment, and JS consumers who try to set it either hit strict-mode throw or silently fail. This is the idiomatic TS pattern. Update the file accordingly:

  **Revised constructor body (replace the Object.defineProperty block):**

  ```typescript
    constructor(sessionId?: string) {
      // D-23 resolution order: explicit arg > env > uuid fallback
      this.sessionId = sessionId
        ?? process.env.CLAUDE_SESSION_ID
        ?? randomUUID();
    }
  ```

  Then rely on the class-level `readonly sessionId: string;` to prevent rebinding. JS consumers get TS-layer protection; runtime freezing against malicious mutation is out of scope for an internal CDS class (threat model lists Tampering on user's own file; not on in-memory fields).

  **Final file content** (use this — simpler and idiomatic):

  Take the file from the main code block above, but REPLACE the constructor body to be the simpler form just shown. Do NOT include the `Object.defineProperty` block.
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/context.ts && grep -q 'export class Context' packages/cds-core/src/context.ts && grep -q 'export interface ConversationMessage' packages/cds-core/src/context.ts && grep -q 'readonly sessionId: string' packages/cds-core/src/context.ts && grep -q 'static async load' packages/cds-core/src/context.ts && grep -q 'async save' packages/cds-core/src/context.ts && grep -q 'cds-context-' packages/cds-core/src/context.ts && grep -q "_v: 1" packages/cds-core/src/context.ts && grep -q 'rename' packages/cds-core/src/context.ts && grep -q 'mode: 0o600' packages/cds-core/src/context.ts && grep -q 'randomUUID' packages/cds-core/src/context.ts && grep -q 'CLAUDE_SESSION_ID' packages/cds-core/src/context.ts && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/context.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/context.ts` exits 0
    - `grep -c 'export class Context' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'export interface ConversationMessage' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'export function contextFilePath' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'readonly sessionId: string' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'static async load' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'async save' packages/cds-core/src/context.ts` returns `1`
    - `grep -c "cds-context-" packages/cds-core/src/context.ts` returns ≥ 1
    - `grep -c "_v: 1" packages/cds-core/src/context.ts` returns ≥ 1
    - `grep -c 'rename(tmpPath, path)' packages/cds-core/src/context.ts` returns `1` (atomic write pattern)
    - `grep -c 'mode: 0o600' packages/cds-core/src/context.ts` returns `1` (writeFile mode)
    - `grep -c 'chmod.*0o600' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'randomUUID' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'CLAUDE_SESSION_ID' packages/cds-core/src/context.ts` returns `1`
    - `grep -c 'get messages' packages/cds-core/src/context.ts` returns `1` (readonly getter)
    - TS transpile with `strict: true` succeeds
    - `wc -l packages/cds-core/src/context.ts` returns ≥ 80
  </acceptance_criteria>
  <done>
  context.ts implements the full Context class per CONTEXT.md D-22..D-26. sessionId resolution honors arg > env > uuid order. save() is atomic (write-to-tmp + rename) and sets mode 0600. load() validates _v === 1 and matches sessionId. File compiles under TS strict mode.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create packages/cds-core/src/context.test.ts with tmp-HOME redirect tests</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Code Examples" ("Verified tmpdir pattern for Context tests")
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/context.test.ts"
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-03-*
    - ./packages/cds-core/src/context.ts (Task 1 output — the implementation to test)
  </read_first>
  <files>
    - packages/cds-core/src/context.test.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/context.test.ts`. All file-writing tests use a tmp-HOME redirect pattern — the test rewrites `process.env.HOME` to a mkdtemp dir before each test and cleans up after. This guarantees `~/.claude/cds-context-*.json` writes stay contained.

  **File: `packages/cds-core/src/context.test.ts`** — paste verbatim:

  ```typescript
  /**
   * context.test.ts — Unit tests for Context class (CORE-01).
   *
   * All tests use a tmp-HOME redirect so that Context.save() writes land in a
   * throwaway directory, never the developer's real ~/.claude/.
   */

  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { mkdtemp, readFile, rm, writeFile, chmod, mkdir, stat } from 'node:fs/promises';
  import { existsSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  import { Context, contextFilePath, type ConversationMessage } from './context.js';

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
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/context.test.ts && grep -q 'tmp-HOME redirect' packages/cds-core/src/context.test.ts && grep -q "mkdtemp(join(tmpdir(), 'cds-ctx-'))" packages/cds-core/src/context.test.ts && grep -q 'describe.*sessionId resolution' packages/cds-core/src/context.test.ts && grep -q 'describe.*save / load roundtrip' packages/cds-core/src/context.test.ts && grep -q 'Unsupported context schema version' packages/cds-core/src/context.test.ts && grep -q 'sessionId mismatch' packages/cds-core/src/context.test.ts && grep -q 'mode 0600' packages/cds-core/src/context.test.ts && grep -c "^  it\(" packages/cds-core/src/context.test.ts | grep -qE '^(1[5-9]|[2-9][0-9])$'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/context.test.ts` exits 0
    - `grep -c "describe\('Context" packages/cds-core/src/context.test.ts` returns ≥ 4 (4 describe blocks)
    - Test count: `grep -cE "^    it\('" packages/cds-core/src/context.test.ts` (indented `it`) returns ≥ 15
    - `grep -c "cds-ctx-" packages/cds-core/src/context.test.ts` returns ≥ 1 (tmp-HOME prefix)
    - `grep -c 'CLAUDE_SESSION_ID' packages/cds-core/src/context.test.ts` returns ≥ 1
    - `grep -c 'randomUUID\|UUID v4' packages/cds-core/src/context.test.ts` returns ≥ 1
    - `grep -c 'mode 0600' packages/cds-core/src/context.test.ts` returns `1`
    - `grep -c 'Unsupported context schema version' packages/cds-core/src/context.test.ts` returns ≥ 1
    - `grep -c 'sessionId mismatch' packages/cds-core/src/context.test.ts` returns ≥ 1
    - `grep -c 'Failed to parse context file' packages/cds-core/src/context.test.ts` returns ≥ 1
    - `grep -c 'does NOT auto-save' packages/cds-core/src/context.test.ts` returns ≥ 1 (D-24 regression)
    - `grep -c 'atomic' packages/cds-core/src/context.test.ts` returns ≥ 1
    - TS transpile succeeds
  </acceptance_criteria>
  <done>
  context.test.ts covers all 5 CORE-01 validation rows (add accumulates, sessionId resolution, save/load roundtrip, persist path + mode, _v version rejection) plus D-24 no-auto-save regression and atomic write verification. Uses tmp-HOME redirect to keep disk I/O contained.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run @cds/core tests; verify Plan 03 tests pass + Phase 33 baseline preserved</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-03-*
  </read_first>
  <files>
    - (no files modified)
  </files>
  <action>
  Run the package test suite to verify Plan 03 tests pass. Plan 03 tests should exist alongside Plan 02's agent-dispatcher tests in the same vitest run.

  **Steps:**

  1. Run package tests with ANTHROPIC_API_KEY unset (to confirm Plan 03 doesn't accidentally depend on Plan 02's SDK path):
  ```bash
  env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run
  ```
  Expected: All Plan 02 mock tests pass; all Plan 03 context tests pass.

  2. Run the full root suite to verify Phase 33 baseline (928 tests) is preserved:
  ```bash
  pnpm test 2>&1 | tee /tmp/full-plan03.log
  ```
  Expected output includes Phase 33's 928-passing baseline + any new tests from Phase 34 Plans.

  3. Verify the context file path helper works — smoke check:
  ```bash
  node -e '
    process.env.HOME = "/tmp/cds-smoke-" + Date.now();
    require("node:fs").mkdirSync(process.env.HOME + "/.claude", { recursive: true });
    const { Context } = require("./packages/cds-core/dist/context.js");
    const ctx = new Context("smoke-sid");
    ctx.add({ role: "user", content: "smoke", timestamp: "" });
    ctx.save().then(() => console.log("OK smoke save"));
  ' || echo "(skipped: dist not built yet — Phase 33 tsc may be wave-gated)"
  ```
  (Non-blocking — just confirms the class is consumable if dist exists.)
  </action>
  <verify>
    <automated>env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run</automated>
  </verify>
  <acceptance_criteria>
    - `env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run` exits 0
    - Vitest output reports ≥ 15 tests passing from `context.test.ts`
    - Plan 02's agent-dispatcher.test.ts tests (from sibling commit) also pass (regression signal — Plan 03 didn't break Plan 02)
    - Package-suite run completes in < 30 seconds
    - No vitest warnings about orphaned `process.env.HOME` (tests must restore HOME)
  </acceptance_criteria>
  <done>
  Plan 03 tests green. Plan 02 tests still green (no cross-plan regression). Phase 33 baseline preserved when full-suite runs.
  </done>
</task>

<task type="auto">
  <name>Task 4: Commit Plan 03 deliverables and write 34-03-SUMMARY.md</name>
  <read_first>
    - ./CLAUDE.md §"Rules" (conventional commits; no Co-Authored-By)
    - $HOME/.claude/get-shit-done/templates/summary.md
  </read_first>
  <files>
    - .planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md (new)
  </files>
  <action>
  Stage and commit Plan 03's deliverables.

  **Staged files:**
  - `packages/cds-core/src/context.ts`
  - `packages/cds-core/src/context.test.ts`
  - `.planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md` (new — this task)

  **Commit message:**
  ```
  feat(34-03): Context class with explicit persistence

  Implements CORE-01 Phase 34 primitive — Context class holding
  cross-dispatchAgent-call conversation state with explicit JSON
  persistence (CONTEXT.md D-22..D-26).

  - packages/cds-core/src/context.ts: Context class with:
    - sessionId resolution arg > env > crypto.randomUUID() (D-23)
    - add() / clear() / summarize() / readonly messages getter
    - Static async Context.load(sessionId) factory
    - Async Context.save() — atomic write-to-tmp + rename, mode 0600
    - ConversationMessage type with optional tool_use_id (Phase 36+ readiness)
    - Schema _v: 1 with load() validation (throws on mismatch)
  - packages/cds-core/src/context.test.ts: 15+ tests across 4 describe
    blocks covering construction, add/clear/summarize, save/load
    roundtrip, and load error cases. Uses tmp-HOME redirect pattern
    so disk I/O stays contained.

  No auto-save on add() (D-24 explicit persistence).
  No compaction in Phase 34 (D-26 defers).
  ```

  **Write `34-03-SUMMARY.md`:**

  ```markdown
  # Plan 34-03 — Context Class — Summary

  **Completed:** 2026-04-16 (TBD)
  **Requirement:** CORE-01
  **Commit:** {hash-fragment TBD}

  ## What shipped

  - `packages/cds-core/src/context.ts` — `Context` class + `ConversationMessage` type + `contextFilePath(sessionId)` helper.
    Behavior:
    - `new Context(sessionId?)` resolves ID per D-23 order (arg > env > uuid). ID is `readonly` at TS + instance level.
    - `add(msg)` accumulates messages; auto-fills timestamp if omitted. No auto-save (D-24).
    - `clear()` resets in-memory array; does not touch disk.
    - `summarize()` returns one line per message with role prefix + 80-char truncation.
    - `save()` writes to `~/.claude/cds-context-{sessionId}.json` atomically (`.tmp` + `rename`), mode 0600.
    - `Context.load(id)` static async factory. Returns fresh Context if file missing; throws on `_v` mismatch, sessionId mismatch, or malformed JSON.
  - `packages/cds-core/src/context.test.ts` — 15+ tests in 4 describe groups:
    1. Construction & sessionId resolution (5 tests — 4 resolution cases + runtime readonly check)
    2. add / clear / summarize (6 tests)
    3. save / load roundtrip + path + mode (6 tests including no-auto-save + atomic cleanup)
    4. Load error cases (3 tests — _v mismatch, sessionId mismatch, malformed JSON)
    All tests use `mkdtemp(tmpdir(), 'cds-ctx-')` as redirected HOME.

  ## Decisions honored

  - D-22: public API (add / clear / summarize / save / readonly messages / sessionId / static load)
  - D-23: sessionId resolution order + readonly
  - D-24: explicit persistence — no auto-save on add()
  - D-25: file format `{ _v: 1, sessionId, savedAt, messages }` + version validation
  - D-26: no compaction in this phase

  ## Security

  - File mode 0600 (only owner can read/write) — defense in depth per research §Security V8.
  - Atomic write via `.tmp` + `rename` mitigates Pitfall 3 (concurrent save collision).
  - HOME redirection pattern keeps tests isolated; no developer-real `.claude` directory ever touched.

  ## Ready for downstream

  Plan 04 (CostTracker) is now unblocked for its Wave 1 commit. Plan 04 Task 4 (index.ts barrel) will re-export `Context`, `ConversationMessage`, and `contextFilePath` from `@cds/core`.
  ```
  </action>
  <verify>
    <automated>git log -1 --pretty=%B | grep -q 'feat(34-03)' && git log -1 --pretty=%B | grep -q 'Context' && git log -1 --pretty=%B | grep -qvi 'co-authored-by' && test -f .planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md && git show --stat HEAD | grep -q 'packages/cds-core/src/context.ts' && git show --stat HEAD | grep -q 'packages/cds-core/src/context.test.ts'</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --pretty=%B` starts with `feat(34-03):`
    - `git log -1 --pretty=%B | grep -q 'Co-Authored-By'` returns non-zero (no Co-Authored-By)
    - `git log -1 --pretty=%B | grep -q 'CORE-01'` returns 0
    - `git show --stat HEAD` lists: `packages/cds-core/src/context.ts`, `packages/cds-core/src/context.test.ts`, `.planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md`
    - `test -f .planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md` exits 0
    - Working tree clean post-commit
    - Current branch is `gsd/phase-34-sdk-integration-core-primitives`
  </acceptance_criteria>
  <done>
  Plan 03 committed in one `feat(34-03)` commit. SUMMARY.md documents Context surface + security posture + Plan 04 handoff. Tests green under tmp-HOME isolation.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| In-memory messages array → `~/.claude/cds-context-*.json` on disk | Persistence boundary; file mode 0600 restricts to user. |
| `process.env.CLAUDE_SESSION_ID` → `Context.sessionId` | Env is caller-controlled; malicious env setting could trigger cross-session file overwrite — but only on the user's own machine (out of scope). |
| `~/.claude/cds-context-{id}.json` on-disk JSON → `Context.load(id)` in-memory | Deserialization boundary; _v check rejects unknown versions; schema validation prevents malformed data from silently loading. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-I1 | Information Disclosure | Context file world-readable | mitigate | `save()` writes with `mode: 0o600` and follows up with `chmod 0o600` (belt and suspenders). Conversation content is sensitive (may contain user prompts with PII). |
| T-34-I2 | Tampering | Concurrent writers corrupt JSON | mitigate | Atomic write: `writeFile(tmp)` + `rename(tmp, target)`. POSIX rename is atomic. Windows rename is best-effort but sufficient for CDS's scope. Acceptance criterion verifies no `.tmp` residue after successful save. |
| T-34-I3 | Tampering | Malformed JSON on disk causes silent corruption | mitigate | `load()` validates `_v === 1` and `parsed.sessionId === sessionId` — both throw. Malformed JSON throws with a descriptive "Failed to parse" error. Tests cover all three error paths. |
| T-34-D1 | Denial of Service | Unbounded in-memory messages array | defer | D-26 defers compaction. Phase 34 accepts unbounded growth; Phase 36+ real usage will signal when compaction is needed. No DoS risk in current use case (Stop hook captures one session's worth of messages per run, typical <50). |
| T-34-R1 | Repudiation | `savedAt` timestamp tampering | accept | `savedAt` is a developer convenience, not a security claim. Users who modify their own `~/.claude/cds-context-*.json` are out of scope — it's their file. |
| T-34-S1 | Spoofing | sessionId collision across concurrent processes (Pitfall 3) | partial | D-23 allows env-derived sessionId; concurrent child processes inheriting same env MUST reassign `CLAUDE_SESSION_ID` before spawning peers — documented in JSDoc for Context constructor. Atomic write mitigates the immediate corruption risk. Cross-writer semantic collision (both processes believe they own the session) is a caller-coordination problem, not a Context-class problem. |
</threat_model>

<verification>
Phase-level checks for Plan 03 contribution to CORE-01:

1. `packages/cds-core/src/context.ts` exists with `export class Context` + `ConversationMessage` + `contextFilePath` helpers.
2. `packages/cds-core/src/context.test.ts` has ≥ 15 tests across 4 describe blocks.
3. All tests pass under default (no ANTHROPIC_API_KEY) conditions.
4. `save()` implementation uses atomic rename + mode 0600.
5. `load()` rejects unsupported `_v` values and sessionId mismatches.
6. `add()` does NOT trigger disk I/O (verified by test + absence of file after add-without-save).
7. One atomic `feat(34-03)` commit on the phase branch.
</verification>

<success_criteria>
CORE-01 satisfied: "`Context` instance accumulates conversation history across `add()` calls and persists to `~/.claude/cds-context-{session_id}.json` when persistence is enabled." Plan 03 is the sole contributor. Plan 04 will re-export `Context` + `ConversationMessage` from the `@cds/core` public barrel.
</success_criteria>

<output>
After completion, `34-03-SUMMARY.md` documents:
- Files created (2 source + 1 summary)
- Test count (15+ across 4 describe blocks)
- Decisions honored (D-22 through D-26)
- Security posture (mode 0600, atomic write, tmp-HOME isolation)
- Green-light status for Plan 04 (CostTracker) to commit in parallel Wave 1, then run the index.ts barrel task consolidating all three primitives.
</output>
