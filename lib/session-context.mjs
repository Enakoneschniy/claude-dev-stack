/**
 * Pure filesystem helper: update context.md's Session History section idempotently.
 *
 * Invoked from two sites (D-02):
 *   1. skills/session-manager/SKILL.md  /end code block  (primary)
 *   2. hooks/session-end-check.sh       via hooks/update-context.mjs wrapper (safety net)
 *
 * Dual invocation is safe because the helper is idempotent by filename.
 *
 * No network. No subprocess. No git. Pure read/write of a single markdown file. (D-13)
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';

export const SESSION_HISTORY_CAP = 5;

const MARKER_START = '<!-- @claude-dev-stack:session-history:start -->';
const MARKER_END   = '<!-- @claude-dev-stack:session-history:end -->';

// Matches '## Session History' (with any trailing suffix like ' (last 5)')
const HEADER_REGEX = /^## Session History[^\n]*$/m;

// Matches the first line '# Session: YYYY-MM-DD — TITLE' in a session log
const SESSION_HEADING_REGEX = /^# Session: (\d{4}-\d{2}-\d{2}) [—-] (.+)$/m;

/**
 * Escape a string for use inside a RegExp literal.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the session title from a session log file.
 * Falls back to a slug-derived title if the heading is missing or malformed. (D-11, D-12)
 */
function extractSessionMeta(sessionLogPath, sessionLogFilename) {
  const filenameDateMatch = sessionLogFilename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  const fallbackDate = filenameDateMatch ? filenameDateMatch[1] : new Date().toISOString().slice(0, 10);
  const fallbackSlug = filenameDateMatch ? filenameDateMatch[2] : sessionLogFilename.replace(/\.md$/, '');
  const fallbackTitle = fallbackSlug.replace(/-/g, ' ');

  if (!existsSync(sessionLogPath)) {
    return { date: fallbackDate, title: fallbackTitle };
  }

  try {
    const content = readFileSync(sessionLogPath, 'utf8');
    const match = content.match(SESSION_HEADING_REGEX);
    if (match) {
      return { date: match[1], title: match[2].trim() };
    }
  } catch {
    // swallow — fall through to filename-derived fallback
  }

  return { date: fallbackDate, title: fallbackTitle };
}

/**
 * Format a single Session History entry as a portable markdown link. (D-04)
 */
function formatEntry(date, title, filename) {
  return `- [${date} — ${title}](sessions/${filename})`;
}

/**
 * Parse the entry lines from a block of text between markers.
 */
function parseEntries(blockContent) {
  return blockContent
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- '));
}

/**
 * Build the full marker block from an array of entry lines.
 */
function buildMarkerBlock(entries) {
  return [MARKER_START, ...entries, MARKER_END].join('\n');
}

/**
 * Enforce the cap: keep only the last N entries (drop oldest). (D-09)
 */
function enforceCap(entries, cap) {
  if (entries.length <= cap) return entries;
  return entries.slice(entries.length - cap);
}

/**
 * Atomic write via tmp + rename. Cheap belt per D-13 planner's discretion.
 */
function atomicWrite(path, content) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/**
 * Update the Session History section of a project's context.md.
 *
 * @param {object} args
 * @param {string} args.vaultPath            Absolute vault root (e.g. ~/vault)
 * @param {string} args.projectName          Project directory name under projects/
 * @param {string} args.sessionLogFilename   Basename of the session log file inside sessions/
 * @param {string} [args.sessionTitle]       Optional override for the title
 * @param {number} [args.cap=SESSION_HISTORY_CAP]
 * @returns {{ action: 'created'|'updated'|'noop'|'skipped', entriesCount: number }}
 */
export function updateContextHistory({
  vaultPath,
  projectName,
  sessionLogFilename,
  sessionTitle,
  cap = SESSION_HISTORY_CAP,
} = {}) {
  // Programmer errors — throw (D-14)
  if (!vaultPath) throw new Error('updateContextHistory: vaultPath is required');
  if (!projectName) throw new Error('updateContextHistory: projectName is required');
  if (!sessionLogFilename) throw new Error('updateContextHistory: sessionLogFilename is required');

  // Path traversal guard (T-01-03)
  if (/[\/\\]|\.\./.test(projectName)) {
    throw new Error('updateContextHistory: projectName must not contain path separators or parent refs');
  }

  // Non-fatal filesystem issues — return 'skipped' (D-14)
  const projectDir = join(vaultPath, 'projects', projectName);
  const contextPath = join(projectDir, 'context.md');
  const sessionLogPath = join(projectDir, 'sessions', sessionLogFilename);

  if (!existsSync(vaultPath)) {
    process.stderr.write(`session-context: vault not found at ${vaultPath}, skipping\n`);
    return { action: 'skipped', entriesCount: 0 };
  }
  if (!existsSync(projectDir)) {
    process.stderr.write(`session-context: project dir not found at ${projectDir}, skipping\n`);
    return { action: 'skipped', entriesCount: 0 };
  }
  if (!existsSync(contextPath)) {
    process.stderr.write(`session-context: context.md not found at ${contextPath}, skipping\n`);
    return { action: 'skipped', entriesCount: 0 };
  }

  // Resolve entry fields (D-11, D-12)
  const meta = extractSessionMeta(sessionLogPath, sessionLogFilename);
  const title = sessionTitle || meta.title;
  const newEntry = formatEntry(meta.date, title, sessionLogFilename);

  const existing = readFileSync(contextPath, 'utf8');

  // Case 1: markers exist — parse, append, cap, replace block (D-07 case 1)
  if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
    const blockPattern = new RegExp(
      `${escapeRegex(MARKER_START)}([\\s\\S]*?)${escapeRegex(MARKER_END)}`
    );
    const match = existing.match(blockPattern);
    const innerContent = match ? match[1] : '';
    const currentEntries = parseEntries(innerContent);

    // Idempotency: same filename already present (D-02)
    if (currentEntries.some((line) => line.includes(`(sessions/${sessionLogFilename})`))) {
      return { action: 'noop', entriesCount: currentEntries.length };
    }

    const nextEntries = enforceCap([...currentEntries, newEntry], cap);
    const newBlock = buildMarkerBlock(nextEntries);
    const replacePattern = new RegExp(
      `${escapeRegex(MARKER_START)}[\\s\\S]*?${escapeRegex(MARKER_END)}`,
      'g'
    );
    const updated = existing.replace(replacePattern, newBlock);

    atomicWrite(contextPath, updated);
    return { action: 'updated', entriesCount: nextEntries.length };
  }

  // Case 2: '## Session History' header exists but no markers — wrap + append (D-07 case 2)
  const headerMatch = existing.match(HEADER_REGEX);
  if (headerMatch) {
    const headerIdx = existing.indexOf(headerMatch[0]);
    const afterHeaderIdx = headerIdx + headerMatch[0].length;
    // Find the end of this section: next '## ' header, next '---' hr line, or EOF
    const rest = existing.slice(afterHeaderIdx);
    const nextHeaderRel = rest.search(/\n## /);
    const nextHrRel = rest.search(/\n---\s*(\n|$)/);
    const candidates = [nextHeaderRel, nextHrRel].filter((i) => i >= 0);
    const sectionEndRel = candidates.length ? Math.min(...candidates) : rest.length;
    const sectionBody = rest.slice(0, sectionEndRel);
    const existingEntries = parseEntries(sectionBody);

    if (existingEntries.some((line) => line.includes(`(sessions/${sessionLogFilename})`))) {
      return { action: 'noop', entriesCount: existingEntries.length };
    }

    const nextEntries = enforceCap([...existingEntries, newEntry], cap);
    const newBlock = buildMarkerBlock(nextEntries);

    const before = existing.slice(0, afterHeaderIdx);
    const after = existing.slice(afterHeaderIdx + sectionEndRel);
    const updated = before + '\n\n' + newBlock + '\n' + after;

    atomicWrite(contextPath, updated);
    return { action: 'updated', entriesCount: nextEntries.length };
  }

  // Case 3: no markers, no header — create new section (D-07 case 3)
  const newSection = [
    '',
    '## Session History (last 5)',
    '',
    buildMarkerBlock([newEntry]),
    '',
  ].join('\n');

  // Insert BEFORE the first '---' horizontal rule line on its own line, else EOF
  const hrIdx = existing.search(/\n---\s*(\n|$)/);
  let updated;
  if (hrIdx >= 0) {
    // hrIdx points at the leading \n of the hr line; insert newSection right before it
    updated = existing.slice(0, hrIdx) + '\n' + newSection + existing.slice(hrIdx);
  } else {
    updated = existing.endsWith('\n') ? existing + newSection : existing + '\n' + newSection;
  }

  atomicWrite(contextPath, updated);
  return { action: 'created', entriesCount: 1 };
}
