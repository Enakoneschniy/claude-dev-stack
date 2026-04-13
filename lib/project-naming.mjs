/**
 * lib/project-naming.mjs — centralized project slug utilities.
 *
 * Consolidates the toLowerCase().replace(...) chain duplicated across
 * add-project.mjs, docs.mjs, templates.mjs, import.mjs, install/projects.mjs.
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Convert a human-readable project name to a filesystem-safe slug.
 *
 * toSlug("My Project")          -> "my-project"
 * toSlug("hello   world")       -> "hello-world"
 * toSlug("Test!@#$%Project")    -> "testproject"
 * toSlug("--leading-trailing--") -> "leading-trailing"
 * toSlug("a---b")               -> "a-b"
 * toSlug("  UPPER Case  ")      -> "upper-case"
 * toSlug("")                    -> ""
 *
 * @param {string} name - Raw project name from user input
 * @returns {string} Lowercase hyphen-separated slug safe for filesystem and vault paths
 */
export function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Reverse-lookup a slug against the vault/projects directory.
 *
 * Scans vault/projects/ and returns the directory name matching the slug,
 * or null if not found.
 *
 * @param {string} slug - Project slug to look up (e.g., "my-project")
 * @param {string} vaultPath - Absolute path to the vault root
 * @returns {string|null} Matching project directory name, or null if not found
 */
export function fromSlug(slug, vaultPath) {
  const projectsDir = join(vaultPath, 'projects');
  if (!existsSync(projectsDir)) return null;

  const entries = readdirSync(projectsDir);
  const match = entries.find(e => e === slug);
  return match || null;
}
