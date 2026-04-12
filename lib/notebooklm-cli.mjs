/**
 * lib/notebooklm-cli.mjs — dispatcher for `claude-dev-stack notebooklm {sync|status|help}`.
 *
 * D-01 resolution of NBLM-24 semantic drift: CLI logic lives here, NOT in lib/notebooklm.mjs.
 * Phase 2 D-03 ("no UI in lib/*") is preserved — lib/notebooklm.mjs stays a pure wrapper.
 *
 * All three invocation modes (CLI sync, CLI status, install wizard first-sync) call the
 * same lib/notebooklm-sync.mjs::syncVault function. This file handles only CLI UX.
 *
 * Security (T-05-01): Error reason strings truncated to ≤200 chars before printing to
 * prevent vault content inside subprocess stderr from leaking via CLI output.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { c, ok, fail, warn, info } from './shared.mjs';
import { syncVault } from './notebooklm-sync.mjs';
import { readManifest } from './notebooklm-manifest.mjs';
import { NotebooklmNotInstalledError, NotebooklmRateLimitError } from './notebooklm.mjs';
import { findVault } from './projects.mjs';

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Main CLI dispatcher. Called from bin/cli.mjs with `args.slice(1)` so args[0]
 * is the sub-command (sync | status | help | -h | --help).
 *
 * @param {string[]} args
 * @returns {Promise<void>}
 */
export async function main(args = []) {
  const sub = args[0];
  switch (sub) {
    case 'sync':
      return runSync(args.slice(1));
    case 'status':
      return runStatus(args.slice(1));
    case 'migrate':
      return runMigrate(args.slice(1));
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      printNotebooklmHelp();
      return;
    default: {
      fail(`Unknown notebooklm subcommand: ${sub}`);
      printNotebooklmHelp();
      throw new Error(`Unknown notebooklm subcommand: ${sub}`);
    }
  }
}

// ── runSync ──────────────────────────────────────────────────────────────────

/**
 * Execute a full vault-to-NotebookLM sync. Prints per-error lines and a final
 * summary to stdout. Exits 0 on completion regardless of per-file failures
 * (NBLM-23 best-effort philosophy — visible output, not silent).
 *
 * Throws on fatal errors (NotebooklmNotInstalledError, NotebooklmRateLimitError,
 * or unexpected errors) so bin/cli.mjs catch handler can exit non-zero.
 *
 * @param {string[]} _subArgs  — reserved for future flags (--dry-run, --notebook)
 */
async function runSync(_subArgs) {
  const vaultRoot = process.env.VAULT_PATH ?? findVault();
  if (!vaultRoot) {
    fail('Vault not found');
    info("Run: claude-dev-stack  (setup wizard to initialize your vault)");
    throw new Error('Vault not found');
  }

  info(`Syncing vault to NotebookLM\u2026`);

  let stats;
  try {
    stats = await syncVault({ vaultRoot });
  } catch (err) {
    if (err instanceof NotebooklmNotInstalledError) {
      fail(err.message);
      info('Install with: pipx install notebooklm-py');
      info('Fallback:     pip install --user notebooklm-py');
      throw err;
    }
    if (err instanceof NotebooklmRateLimitError) {
      warn('Rate limited by notebooklm-py \u2014 try again later');
      throw err;
    }
    throw err;
  }

  // Print per-file errors with truncated reasons (T-05-01 security mitigation).
  if (stats.errors && stats.errors.length > 0) {
    for (const e of stats.errors) {
      warn(`  ${e.file}: ${truncateReason(e.reason)}`);
    }
  }

  // Summary line — mirrors export.mjs UX pattern (Claude's Discretion R6).
  const summary = `Sync complete: ${stats.uploaded} uploaded, ${stats.skipped} skipped, ${stats.failed} failed (${stats.durationMs}ms)`;
  if (stats.failed > 0 || (stats.errors && stats.errors.length > 0)) {
    warn(summary);
  } else {
    ok(summary);
  }

  if (stats.notebookId) {
    info(`Notebook: ${stats.notebookId}`);
  }

  if (stats.rateLimited) {
    warn('Sync aborted due to rate limit \u2014 try again later');
    throw new Error('Sync rate-limited');
  }
}

// ── runMigrate ───────────────────────────────────────────────────────────────

/**
 * Execute a vault-to-per-project migration. Dry-run by default; pass --execute
 * to perform actual mutations (upload + delete).
 *
 * Throws on fatal errors (NotebooklmNotInstalledError, NotebooklmRateLimitError,
 * vault not found, or shared notebook not found) so bin/cli.mjs exits non-zero.
 *
 * @param {string[]} subArgs
 */
async function runMigrate(subArgs) {
  const vaultRoot = process.env.VAULT_PATH ?? findVault();
  if (!vaultRoot) {
    fail('Vault not found');
    info('Run: claude-dev-stack  (setup wizard to initialize your vault)');
    throw new Error('Vault not found');
  }

  const dryRun = !subArgs.includes('--execute');

  // Dynamic import to avoid loading migrate module when not needed
  const { migrateVault } = await import('./notebooklm-migrate.mjs');

  try {
    const result = await migrateVault({ vaultRoot, dryRun });
    if (result.dryRun) {
      info('Run with --execute to migrate');
    } else {
      if (result.phaseBSkipped) {
        warn(`Migration incomplete \u2014 ${result.phaseAFailures} failure(s) in Phase A, shared notebook untouched`);
      } else {
        ok(`Migration complete: ${result.sources.filter((s) => s.status === 'deleted').length} sources migrated`);
      }
    }
  } catch (err) {
    if (err instanceof NotebooklmNotInstalledError) {
      fail(err.message);
      info('Install with: pipx install notebooklm-py');
      throw err;
    }
    if (err instanceof NotebooklmRateLimitError) {
      warn('Rate limited \u2014 try again later');
      throw err;
    }
    throw err;
  }
}

// ── runStatus ────────────────────────────────────────────────────────────────

/**
 * Print a 3-4 line summary of last sync state without mutating any files.
 * Uses syncVault({ dryRun: true }) to compute stale counts (Pitfall 4 verified:
 * dryRun is safe on machines without notebooklm-py binary — bypasses all API calls).
 *
 * Fresh vault (no manifest file) exits 0 with "Last sync: never" — TEST-02 gate.
 *
 * @param {string[]} _subArgs  — reserved for future flags
 */
async function runStatus(_subArgs) {
  const vaultRoot = process.env.VAULT_PATH ?? findVault();
  if (!vaultRoot || !existsSync(vaultRoot)) {
    info('Vault not found \u2014 run `claude-dev-stack` to set up');
    return;
  }

  // Detect whether a manifest FILE actually exists before calling readManifest.
  // readManifest always returns an object (emptyManifest() on missing file) with
  // generated_at set to NOW — we cannot use that field to detect a fresh vault.
  const manifestFilePath = join(vaultRoot, '.notebooklm-sync.json');
  const manifestExists = existsSync(manifestFilePath);

  const manifest = readManifest(vaultRoot);
  const lastSync = manifestExists ? manifest.generated_at : null;
  const fileCount = Object.values(manifest.projects ?? {}).reduce((sum, p) => sum + Object.keys(p.files ?? {}).length, 0);

  // D-20: dryRun bypasses ALL API calls including listNotebooks/ensureNotebook.
  // Safe to call even if notebooklm binary is absent.
  let plan = { planned: [] };
  try {
    plan = await syncVault({ vaultRoot, dryRun: true });
  } catch (err) {
    // Defensive: if dryRun somehow fails (vault walk error etc.), degrade gracefully.
    info(`Status check incomplete: ${err.message}`);
  }

  const stale = (plan.planned ?? []).filter((p) => p.action !== 'skip');
  const newFiles = stale.filter((p) => p.action === 'upload').length;
  const changed = stale.filter((p) => p.action === 'replace').length;

  console.log('');
  console.log(`  ${c.bold}NotebookLM Sync Status${c.reset}`);

  if (!lastSync || fileCount === 0) {
    // Fresh vault or no files tracked yet.
    info('Last sync: never');
    info('Files tracked: 0');
    info("Run 'claude-dev-stack notebooklm sync' to start");
  } else {
    const ageMs = Date.now() - new Date(lastSync).getTime();
    const ageLabel = formatAge(ageMs);
    ok(`Last sync: ${ageLabel} (${lastSync})`);
    info(`Files tracked: ${fileCount}`);
    if (stale.length === 0) {
      ok('Files stale: 0 (all up to date)');
    } else {
      warn(`Files stale: ${stale.length} (${newFiles} new, ${changed} changed)`);
    }
  }

  console.log('');
}

// ── printNotebooklmHelp ──────────────────────────────────────────────────────

/**
 * Print subcommand help for `claude-dev-stack notebooklm`.
 * Called when no subcommand is given or when help/-h/--help is passed.
 */
function printNotebooklmHelp() {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}NotebookLM Sync${c.reset}`);
  console.log('');
  console.log(`  ${c.white}claude-dev-stack notebooklm sync${c.reset}     ${c.dim}Sync vault to NotebookLM notebook${c.reset}`);
  console.log(`  ${c.white}claude-dev-stack notebooklm status${c.reset}   ${c.dim}Show last sync, file count, stale files${c.reset}`);
  console.log(`  ${c.white}claude-dev-stack notebooklm migrate${c.reset}  ${c.dim}Migrate shared notebook to per-project notebooks${c.reset}`);
  console.log('');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a duration in milliseconds as a human-readable age string.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatAge(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return 'just now';
}

/**
 * Truncate an error reason string to ≤200 chars (T-05-01 security mitigation).
 * Prevents vault content inside subprocess stderr from leaking via CLI output.
 *
 * @param {string|unknown} reason
 * @returns {string}
 */
function truncateReason(reason) {
  if (!reason) return '';
  const str = String(reason);
  return str.length > 200 ? `${str.slice(0, 200)}\u2026` : str;
}
