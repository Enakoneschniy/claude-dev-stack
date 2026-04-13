/**
 * lib/notebooklm-stats.mjs — Query usage counter for NotebookLM ask/generate calls.
 *
 * Stores counts in vault/.notebooklm-stats.json (machine-local, gitignored per D-15).
 * Reads return a safe default when file is absent or corrupt — never throws.
 *
 * Per D-13, D-14: separate file from manifest to keep separation of concerns.
 * Per D-20: covered by tests/notebooklm-stats.test.mjs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from './shared.mjs';

const STATS_FILENAME = '.notebooklm-stats.json';

const DEFAULT_STATS = {
  version: 1,
  questions_asked: 0,
  artifacts_generated: 0,
  last_query_at: null,
};

function statsPath(vaultRoot) {
  return join(vaultRoot, STATS_FILENAME);
}

/**
 * Read query usage stats from vault. Returns default values on absent or corrupt file.
 *
 * @param {string} vaultRoot
 * @returns {{ version: number, questions_asked: number, artifacts_generated: number, last_query_at: string|null }}
 */
export function readQueryStats(vaultRoot) {
  const path = statsPath(vaultRoot);
  if (!existsSync(path)) return { ...DEFAULT_STATS };
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATS, ...parsed };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/**
 * Increment query counter in vault stats file. Creates file if absent.
 *
 * @param {string} vaultRoot
 * @param {'question'|'artifact'} type
 */
export function incrementQueryStats(vaultRoot, type) {
  const current = readQueryStats(vaultRoot);
  if (type === 'question') {
    current.questions_asked += 1;
  } else if (type === 'artifact') {
    current.artifacts_generated += 1;
  }
  current.last_query_at = new Date().toISOString();
  atomicWriteJson(statsPath(vaultRoot), current);
}
