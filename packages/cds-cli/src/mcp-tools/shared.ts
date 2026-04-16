// Phase 37 — Shared MCP error hierarchy and input-validation helpers.
//
// Every tool throws instances of these classes; the MCP SDK serializes them
// over JSON-RPC with a stable `code` (per JSON-RPC) plus `data.kind` carrying
// the concrete class name so clients can programmatically switch behavior
// without string-matching messages.

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export { ErrorCode, McpError };

/**
 * Base class for every domain error thrown by CDS MCP tools.
 *
 * Populates `data.kind` with the concrete class name so clients can do:
 *
 *   if (err.data?.kind === 'NotAGsdProjectError') { ... }
 */
export class CdsMcpError extends McpError {
  constructor(code: ErrorCode, kind: string, message: string) {
    super(code, message, { kind });
    this.name = kind;
  }
}

/** Project has no `.planning/ROADMAP.md` — not a GSD-managed project. */
export class NotAGsdProjectError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, 'NotAGsdProjectError', message);
  }
}

/** Anchor observation ID unknown (used by sessions.timeline). */
export class SessionNotFoundError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, 'SessionNotFoundError', message);
  }
}

/** Input validation failure — bad query, bad filter, malformed FTS5 syntax. */
export class InvalidFilterError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, 'InvalidFilterError', message);
  }
}

/**
 * Informational — ripgrep not installed. Caller SHOULD catch this and fall
 * through to POSIX grep rather than surface it to the client.
 */
export class RipgrepMissingError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InternalError, 'RipgrepMissingError', message);
  }
}

/** Vault directory or SQLite DB not found at the expected path. */
export class VaultNotFoundError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, 'VaultNotFoundError', message);
  }
}

/**
 * SQLite build lacks FTS5 compile-time support. Extremely rare on stock
 * better-sqlite3 prebuilds — surfaced as InternalError so CI can flag it
 * if it ever lands.
 */
export class FTS5UnavailableError extends CdsMcpError {
  constructor(message: string) {
    super(ErrorCode.InternalError, 'FTS5UnavailableError', message);
  }
}

/**
 * Validates that `name` is a bare project basename — no path separators, no
 * parent-dir references, no user-dir prefix, no absolute-path prefix.
 *
 * Used by:
 * - docs.search (D-75 path-traversal guard)
 * - planning.status (D-84 project resolution)
 *
 * Throws InvalidFilterError on rejection so the error surfaces cleanly to
 * Claude Code.
 */
export function assertValidScopeBasename(name: string): void {
  if (typeof name !== 'string') {
    throw new InvalidFilterError('scope/project must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new InvalidFilterError('scope/project must be non-empty');
  }
  if (trimmed !== name) {
    throw new InvalidFilterError('scope/project must not have leading/trailing whitespace');
  }
  if (name.includes('..')) {
    throw new InvalidFilterError(`scope/project must not contain '..': '${name}'`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new InvalidFilterError(`scope/project must not contain path separators: '${name}'`);
  }
  if (name.startsWith('~')) {
    throw new InvalidFilterError(`scope/project must not start with '~': '${name}'`);
  }
  if (name.startsWith('.')) {
    throw new InvalidFilterError(`scope/project must not start with '.': '${name}'`);
  }
}
