/**
 * lib/notion-config.mjs -- Schema, URL parsing, and read/write for notion_pages.json.
 *
 * Exports:
 *   validateNotionConfig(obj)             -- validate a notion_pages.json config object
 *   readNotionConfig(projectDir)          -- read .claude/notion_pages.json from a project dir
 *   writeNotionConfig(projectDir, config) -- write .claude/notion_pages.json atomically
 *   parseNotionUrl(url)                   -- extract page_id (32-char hex) from a Notion URL
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { atomicWriteJson, mkdirp, warn } from './shared.mjs';

// ── parseNotionUrl ────────────────────────────────────────────────

/**
 * Extract a 32-char lowercase hex page_id from a Notion URL.
 * Handles both undashed (32 hex) and dashed UUID (8-4-4-4-12) formats.
 * Strips query parameters before parsing.
 *
 * @param {string} url
 * @returns {string|null} 32-char hex page_id or null if not found
 */
export function parseNotionUrl(url) {
  if (!url || typeof url !== 'string') return null;

  // Strip query params
  const withoutQuery = url.split('?')[0];

  // Match dashed UUID at end of path segment: 8-4-4-4-12
  const dashedMatch = withoutQuery.match(
    /([a-f0-9]{8})-([a-f0-9]{4})-([a-f0-9]{4})-([a-f0-9]{4})-([a-f0-9]{12})$/i
  );
  if (dashedMatch) {
    return (dashedMatch[1] + dashedMatch[2] + dashedMatch[3] + dashedMatch[4] + dashedMatch[5]).toLowerCase();
  }

  // Match undashed 32-char hex at end of path segment
  const undashedMatch = withoutQuery.match(/([a-f0-9]{32})$/i);
  if (undashedMatch) {
    return undashedMatch[1].toLowerCase();
  }

  return null;
}

// ── validateNotionConfig ──────────────────────────────────────────

/**
 * Validate a notion_pages.json config object.
 *
 * @param {*} obj
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateNotionConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, reason: 'not an object' };
  }
  if (obj.version === undefined || obj.version === null) {
    return { valid: false, reason: 'missing version' };
  }
  if (obj.version !== 1) {
    return { valid: false, reason: 'unsupported version' };
  }
  if (!Array.isArray(obj.pages)) {
    return { valid: false, reason: 'pages must be an array' };
  }
  for (const page of obj.pages) {
    if (!page.page_id || typeof page.page_id !== 'string') {
      return { valid: false, reason: 'page missing page_id' };
    }
    if (!/^[a-f0-9]{32}$/i.test(page.page_id)) {
      return { valid: false, reason: 'page_id must be 32 hex chars' };
    }
  }
  return { valid: true };
}

// ── readNotionConfig ──────────────────────────────────────────────

/**
 * Read and validate .claude/notion_pages.json from a project directory.
 *
 * @param {string} projectDir
 * @returns {object|null} parsed config or null if missing/invalid
 */
export function readNotionConfig(projectDir) {
  const configPath = join(projectDir, '.claude', 'notion_pages.json');
  if (!existsSync(configPath)) return null;
  let obj;
  try {
    obj = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    warn('notion_pages.json is not valid JSON');
    return null;
  }
  const { valid, reason } = validateNotionConfig(obj);
  if (!valid) {
    warn(`notion_pages.json is invalid: ${reason}`);
    return null;
  }
  return obj;
}

// ── writeNotionConfig ─────────────────────────────────────────────

/**
 * Atomically write a config object to .claude/notion_pages.json.
 *
 * @param {string} projectDir
 * @param {object} config
 */
export function writeNotionConfig(projectDir, config) {
  const claudeDir = join(projectDir, '.claude');
  mkdirp(claudeDir);
  atomicWriteJson(join(claudeDir, 'notion_pages.json'), config);
}
