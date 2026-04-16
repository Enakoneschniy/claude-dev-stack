// Phase 38 Plan 02 Task 38-02-01 — sha256 utilities for idempotency detection.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Returns the SHA-256 hex digest of a file's raw bytes.
 *
 * Used by Phase 38 backfill to detect whether a markdown session has been
 * edited since its last migration (D-95 / D-96).
 *
 * @param path Absolute or relative path to the file.
 * @returns 64-character lowercase hex string.
 */
export function hashFile(path: string): string {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

/** Hash a string directly — used for prompt-dedup keys in the mock dispatcher. */
export function hashString(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
