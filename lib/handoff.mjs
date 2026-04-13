/**
 * lib/handoff.mjs — Post-reset handoff state reader (LIMIT-04)
 *
 * Reads .planning/STATE.md, extracts stopped_at and resume_file from
 * YAML frontmatter. Used by scheduled tasks (Desktop or Cloud) to resume
 * from where the previous session stopped.
 *
 * Pure reader — never writes to STATE.md (GSD owns that).
 * Works from a fresh git clone (cloud tasks) because all state is in git.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Error types ──────────────────────────────────────────────────────────────

export const MISSING_STATE = 'MISSING_STATE';
export const MISSING_STOPPED_AT = 'MISSING_STOPPED_AT';

export class HandoffError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'HandoffError';
    this.code = code;
  }
}

// ── YAML frontmatter parser ──────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a STATE.md content string.
 *
 * Extracts only top-level key: value pairs from the first --- ... --- block.
 * Does not handle nested YAML. Returns an object with string values (trimmed,
 * surrounding quotes stripped).
 *
 * @param {string} content — file content string
 * @returns {Record<string, string>} — frontmatter fields
 */
export function parseFrontmatter(content) {
  const lines = content.split('\n');
  const result = {};

  let inFrontmatter = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inFrontmatter) {
      if (trimmed === '---') { inFrontmatter = true; }
      continue;
    }

    if (trimmed === '---') { break; }

    // Skip indented lines (nested YAML values)
    if (line.startsWith(' ') || line.startsWith('\t')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

// ── State reader ─────────────────────────────────────────────────────────────

/**
 * Read handoff state from .planning/STATE.md relative to projectRoot.
 *
 * @param {string} [projectRoot] — project root directory (default: process.cwd())
 * @returns {{ stopped_at: string, resume_file: string|null }}
 * @throws {HandoffError} MISSING_STATE if STATE.md absent
 * @throws {HandoffError} MISSING_STOPPED_AT if stopped_at absent or empty
 */
export function readHandoffState(projectRoot = process.cwd()) {
  const statePath = join(resolve(projectRoot), '.planning', 'STATE.md');

  if (!existsSync(statePath)) {
    throw new HandoffError(
      `STATE.md not found at ${statePath}. ` +
      `Ensure you are running from a GSD-managed project root with committed state.`,
      MISSING_STATE
    );
  }

  const content = readFileSync(statePath, 'utf8');
  const fields = parseFrontmatter(content);

  const stoppedAt = fields.stopped_at;
  if (!stoppedAt || stoppedAt.trim() === '') {
    throw new HandoffError(
      `STATE.md exists but stopped_at is not set. ` +
      `No interrupted session to resume. Run /gsd-next to advance the milestone.`,
      MISSING_STOPPED_AT
    );
  }

  // resume_file is optional — treat "None" string as absent
  let resumeFile = fields.resume_file || null;
  if (resumeFile === 'None' || resumeFile === 'none' || resumeFile === '') {
    resumeFile = null;
  }

  return { stopped_at: stoppedAt, resume_file: resumeFile };
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a human-readable handoff summary for display.
 *
 * @param {{ stopped_at: string, resume_file: string|null }} state
 * @returns {string}
 */
export function formatHandoffSummary(state) {
  const lines = [
    `  Resuming from: ${state.stopped_at}`,
  ];
  if (state.resume_file) {
    lines.push(`  Context file:  ${state.resume_file}`);
  }
  return lines.join('\n');
}
