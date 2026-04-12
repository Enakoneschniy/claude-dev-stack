/**
 * lib/notion-cli.mjs -- dispatcher for `claude-dev-stack notion {list|add|import|help}`.
 *
 * Wires the Plan 01 core modules (notion-config, notion-import) to the CLI.
 * Per D-03 skill-first: `notion import` prints guidance; actual MCP fetching
 * happens via the notion-importer skill in a live Claude session.
 */

import { c, ok, fail, warn, info } from './shared.mjs';
import { readNotionConfig, writeNotionConfig, parseNotionUrl } from './notion-config.mjs';
import { importAllPages } from './notion-import.mjs';

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Main CLI dispatcher. Called from bin/cli.mjs with `args.slice(1)` so args[0]
 * is the sub-command (list | add | import | help).
 *
 * @param {string[]} args
 * @returns {Promise<void>}
 */
export async function main(args = []) {
  const sub = args[0];
  switch (sub) {
    case 'list':
      return listPages(args.slice(1));
    case 'add':
      return addPage(args.slice(1));
    case 'import':
      return importPages(args.slice(1));
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return showHelp();
    default:
      fail(`Unknown notion subcommand: ${sub}`);
      return showHelp();
  }
}

// ── listPages ──────────────────────────────────────────────────────────────────

/**
 * List configured Notion pages from .claude/notion_pages.json.
 *
 * @param {string[]} _args
 * @returns {void}
 */
export function listPages(_args = []) {
  const config = readNotionConfig(process.cwd());
  if (!config || config.pages.length === 0) {
    info('No .claude/notion_pages.json found. Run: claude-dev-stack notion add <url>');
    return;
  }
  console.log('');
  console.log(`  ${c.bold}Configured Notion Pages${c.reset}`);
  console.log('');
  for (const page of config.pages) {
    ok(`${page.page_id} — ${page.page_url}`);
  }
  console.log('');
}

// ── addPage ────────────────────────────────────────────────────────────────────

/**
 * Parse a Notion URL and add the page to .claude/notion_pages.json.
 * Creates the config file if it doesn't exist. Skips duplicates.
 *
 * @param {string[]} args
 * @returns {void}
 */
export function addPage(args = []) {
  const url = args[0];
  if (!url) {
    fail('Usage: claude-dev-stack notion add <url>');
    return;
  }

  const pageId = parseNotionUrl(url);
  if (!pageId) {
    fail('Could not extract page ID from URL');
    info('Expected a Notion page URL like: https://www.notion.so/workspace/Page-Name-{id}');
    return;
  }

  // Read or create default config
  const config = readNotionConfig(process.cwd()) || { version: 1, pages: [] };

  // Check for duplicate
  const exists = config.pages.some(p => p.page_id === pageId);
  if (exists) {
    warn(`Page already configured: ${pageId}`);
    return;
  }

  config.pages.push({
    page_id: pageId,
    page_url: url,
    vault_path: 'docs/notion',
    refresh_strategy: 'manual',
  });

  writeNotionConfig(process.cwd(), config);
  ok(`Added page ${pageId}`);
}

// ── importPages ────────────────────────────────────────────────────────────────

/**
 * Import all configured Notion pages (or a single page via --page <id>).
 *
 * Per D-03 skill-first: in CLI context without a fetchFn, print guidance.
 * For testability, accepts an optional fetchFn override as second arg.
 *
 * @param {string[]} args
 * @param {Function|null} fetchFn - optional override for testing
 * @returns {Promise<void>}
 */
export async function importPages(args = [], fetchFn = null) {
  if (!fetchFn) {
    // CLI context: print guidance about skill-first approach (D-03)
    info('Notion import requires a live Claude session with notion-importer skill.');
    info('Run this command inside a Claude session, or use the notion-importer skill directly.');
    info('The skill will call Notion MCP tools (notion-fetch) to retrieve page content.');
    return;
  }

  // When fetchFn is provided (e.g., from a live session or test), run the import
  const config = readNotionConfig(process.cwd());
  if (!config) {
    info('No .claude/notion_pages.json found. Run: claude-dev-stack notion add <url>');
    return;
  }

  // Parse --page <id> flag
  const pageFlag = args.indexOf('--page');
  const singlePageId = pageFlag >= 0 ? args[pageFlag + 1] : null;

  const { homedir } = await import('os');
  const { join } = await import('path');
  const vaultPath = process.env.VAULT_PATH || join(homedir(), 'vault');

  const result = await importAllPages(process.cwd(), vaultPath, fetchFn);
  if (result === null) {
    info('No pages configured. Run: claude-dev-stack notion add <url>');
    return;
  }

  console.log('');
  console.log(`  ${c.bold}Notion Import Summary${c.reset}`);
  console.log('');
  ok(`Created: ${result.created}`);
  ok(`Updated: ${result.updated}`);
  ok(`Unchanged: ${result.unchanged}`);
  if (result.conflict > 0) {
    warn(`Conflicts (written as .notion-update.md): ${result.conflict}`);
  }
  console.log('');
}

// ── showHelp ───────────────────────────────────────────────────────────────────

/**
 * Print usage help for the notion subcommand.
 *
 * @returns {void}
 */
export function showHelp() {
  console.log('');
  console.log(`  ${c.bold}claude-dev-stack notion${c.reset} ${c.dim}— Notion page import${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}Subcommands${c.reset}`);
  console.log('');
  console.log(`    ${c.cyan}notion list${c.reset}               ${c.dim}Show configured pages from .claude/notion_pages.json${c.reset}`);
  console.log(`    ${c.cyan}notion add <url>${c.reset}          ${c.dim}Add a Notion page URL to config${c.reset}`);
  console.log(`    ${c.cyan}notion import${c.reset}             ${c.dim}Import all configured pages (via notion-importer skill)${c.reset}`);
  console.log(`    ${c.cyan}notion import --page <id>${c.reset} ${c.dim}Import a single page by ID${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Notion import uses the notion-importer skill in a live Claude session.${c.reset}`);
  console.log(`  ${c.dim}The skill calls Notion MCP tools (notion-fetch) to retrieve page content.${c.reset}`);
  console.log('');
}
