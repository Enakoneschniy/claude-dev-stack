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
  // Declared with `declare` so the class field has NO runtime initializer —
  // we install it via Object.defineProperty below with writable:false so
  // reassignment throws at runtime (must_haves: "sessionId is frozen").
  declare readonly sessionId: string;
  private _messages: ConversationMessage[] = [];

  constructor(sessionId?: string) {
    // D-23 resolution order: explicit arg > env > uuid fallback
    const resolved = sessionId
      ?? process.env.CLAUDE_SESSION_ID
      ?? randomUUID();
    // Freeze the property at runtime — TS `readonly` is type-only;
    // Object.defineProperty with writable:false makes reassignment throw
    // in strict mode (ESM modules are always strict).
    Object.defineProperty(this, 'sessionId', {
      value: resolved,
      writable: false,
      enumerable: true,
      configurable: false,
    });
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
