// Phase 38 Plan 02 Task 38-02-03 — lightweight markdown metadata helpers.
//
// The Phase 38 migrator does NOT pre-parse markdown sections — Haiku does
// that per D-92. These helpers only derive session ID + start_time + a
// placeholder summary from filename + the first H1.

import { basename } from 'node:path';
import { statSync } from 'node:fs';

/**
 * Derive the Phase 38 session ID from a markdown filename.
 * Per D-94: `backfill-` + filename without .md extension.
 *
 * Example: `2026-04-09-sync-and-publish.md` → `backfill-2026-04-09-sync-and-publish`
 */
export function extractSessionId(filename: string): string {
  const base = basename(filename, '.md');
  if (base.length === 0) {
    throw new Error('extractSessionId: filename has no stem: ' + filename);
  }
  return 'backfill-' + base;
}

/**
 * Derive the start_time for a session row.
 * Preference order:
 *   1. Leading YYYY-MM-DD prefix in filename (e.g., `2026-04-09-title.md`)
 *   2. File mtime from statSync
 *   3. Current wall-clock time (fallback for statSync failures)
 *
 * Returns an ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ).
 */
export function extractStartTime(filePath: string): string {
  const base = basename(filePath, '.md');
  const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch && dateMatch[1]) {
    // Midnight UTC on that date — deterministic across timezones.
    return dateMatch[1] + 'T00:00:00.000Z';
  }
  try {
    const stat = statSync(filePath);
    return stat.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Derive a short session summary from the markdown.
 * Uses the first H1 line (`# Session: ... — <title>`) if present,
 * else a generic placeholder keyed on filename.
 */
export function extractSummary(markdown: string, filename: string): string {
  const h1Match = markdown.match(/^#\s+(.+?)\s*$/m);
  if (h1Match && h1Match[1]) {
    const title = h1Match[1].trim();
    return title.length > 200 ? title.slice(0, 197) + '...' : title;
  }
  return 'Backfilled session from ' + basename(filename);
}
