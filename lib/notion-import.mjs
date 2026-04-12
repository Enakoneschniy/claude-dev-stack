/**
 * lib/notion-import.mjs -- Notion page import with frontmatter provenance stamps and overwrite protection.
 *
 * Exports:
 *   contentHash(text)                           -- SHA-256 hex digest of a string
 *   stampFrontmatter(markdownBody, opts)         -- prepend YAML frontmatter block
 *   parseFrontmatter(fileContent)               -- extract frontmatter fields + body
 *   importPage(vaultDocsDir, pageConfig, md)    -- write one page with 3-way hash protection
 *   importAllPages(projectDir, vaultPath, fn)   -- orchestrate import of all configured pages
 *
 * Overwrite protection (D-06 — 3-way hash):
 *   1. Notion content unchanged → skip (no-op)
 *   2. Local body matches stored hash (no edits) → overwrite in place
 *   3. Local body differs from stored hash (local edits) → write .notion-update.md sibling
 *
 * Frontmatter provenance stamps ship in the FIRST version (D-05).
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { mkdirp, ok, warn, info, fail } from './shared.mjs';
import { readNotionConfig } from './notion-config.mjs';
import { cleanNotionFilename } from './docs.mjs';

// ── contentHash ───────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a text string.
 *
 * @param {string} text
 * @returns {string} 64-char hex string
 */
export function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── stampFrontmatter ──────────────────────────────────────────────

/**
 * Prepend YAML frontmatter provenance block to a markdown body.
 * Computes notion_content_hash from the raw markdownBody.
 *
 * @param {string} markdownBody
 * @param {{ page_id: string }} opts
 * @returns {string}
 */
export function stampFrontmatter(markdownBody, opts) {
  const hash = contentHash(markdownBody);
  const synced = new Date().toISOString();
  return `---\nnotion_page_id: ${opts.page_id}\nnotion_last_synced: ${synced}\nnotion_content_hash: ${hash}\n---\n\n${markdownBody}`;
}

// ── parseFrontmatter ──────────────────────────────────────────────

/**
 * Extract frontmatter fields and body from file content.
 *
 * @param {string} fileContent
 * @returns {{ notion_page_id?: string, notion_last_synced?: string, notion_content_hash?: string, body: string }}
 */
export function parseFrontmatter(fileContent) {
  if (!fileContent.startsWith('---\n')) {
    return { body: fileContent };
  }

  const closeIdx = fileContent.indexOf('\n---\n', 4);
  if (closeIdx === -1) {
    return { body: fileContent };
  }

  const frontmatterStr = fileContent.slice(4, closeIdx);
  // Body starts after the closing ---\n and an optional blank line
  const afterClose = fileContent.slice(closeIdx + 5); // skip '\n---\n'
  const body = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;

  const result = { body };
  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (['notion_page_id', 'notion_last_synced', 'notion_content_hash'].includes(key)) {
      result[key] = value;
    }
  }

  return result;
}

// ── importPage ────────────────────────────────────────────────────

/**
 * Import a single Notion page into the vault docs directory.
 * Uses 3-way hash to decide whether to create, update, skip, or write conflict file.
 *
 * @param {string} vaultDocsDir - absolute path to vault/projects/{slug}/docs/notion/
 * @param {{ page_id: string, page_url: string }} pageConfig
 * @param {string} fetchedMarkdown - raw markdown from MCP fetch
 * @returns {{ status: 'created'|'updated'|'unchanged'|'conflict' }}
 */
export async function importPage(vaultDocsDir, pageConfig, fetchedMarkdown) {
  mkdirp(vaultDocsDir);

  // Derive filename from first # heading, fallback to page_id
  const headingMatch = fetchedMarkdown.match(/^#\s+(.+)$/m);
  const pageTitle = headingMatch ? headingMatch[1].trim() : pageConfig.page_id;
  const filename = cleanNotionFilename(pageTitle + '.md');
  const targetPath = join(vaultDocsDir, filename);

  const newHash = contentHash(fetchedMarkdown);

  if (!existsSync(targetPath)) {
    // New file — create with frontmatter stamp
    const stamped = stampFrontmatter(fetchedMarkdown, { page_id: pageConfig.page_id });
    writeFileSync(targetPath, stamped, 'utf8');
    ok(`notion: created ${filename}`);
    return { status: 'created' };
  }

  // File exists — run 3-way hash check
  const existing = readFileSync(targetPath, 'utf8');
  const stored = parseFrontmatter(existing);
  const storedHash = stored.notion_content_hash;

  // 1. Notion content unchanged — no-op
  if (newHash === storedHash) {
    info(`notion: unchanged ${filename}`);
    return { status: 'unchanged' };
  }

  // 2. Check if local body was edited
  const localHash = contentHash(stored.body);

  if (localHash === storedHash) {
    // No local edits — overwrite in place with new stamp
    const stamped = stampFrontmatter(fetchedMarkdown, { page_id: pageConfig.page_id });
    writeFileSync(targetPath, stamped, 'utf8');
    ok(`notion: updated ${filename}`);
    return { status: 'updated' };
  }

  // 3. Local drift detected — write sibling conflict file
  const conflictFilename = filename.replace(/\.md$/, '.notion-update.md');
  const conflictPath = join(vaultDocsDir, conflictFilename);
  const stamped = stampFrontmatter(fetchedMarkdown, { page_id: pageConfig.page_id });
  writeFileSync(conflictPath, stamped, 'utf8');
  warn(`notion: local edits detected in ${filename} — new version in ${conflictFilename}`);
  return { status: 'conflict' };
}

// ── importAllPages ────────────────────────────────────────────────

/**
 * Import all pages configured in .claude/notion_pages.json.
 *
 * @param {string} projectDir - project root (where .claude/notion_pages.json lives)
 * @param {string} vaultPath - vault root for this project (e.g. vault/projects/{slug})
 * @param {function(string): Promise<string>} fetchFn - async fn(page_id) => markdown string
 * @returns {{ created: number, updated: number, unchanged: number, conflict: number }|null}
 */
export async function importAllPages(projectDir, vaultPath, fetchFn) {
  const config = readNotionConfig(projectDir);
  if (!config) {
    fail('no .claude/notion_pages.json found');
    return null;
  }

  const docsDir = join(vaultPath, 'docs', 'notion');
  const counts = { created: 0, updated: 0, unchanged: 0, conflict: 0 };

  for (const page of config.pages) {
    const markdown = await fetchFn(page.page_id);
    const result = await importPage(docsDir, page, markdown);
    counts[result.status] = (counts[result.status] || 0) + 1;
  }

  return counts;
}
