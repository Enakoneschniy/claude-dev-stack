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

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

import { c, ok, fail, warn, info } from './shared.mjs';
import { syncVault } from './notebooklm-sync.mjs';
import { readManifest } from './notebooklm-manifest.mjs';
import { NotebooklmNotInstalledError, NotebooklmRateLimitError, askNotebook, generateArtifact, BINARY_ARTIFACT_TYPES, listNotebooks } from './notebooklm.mjs';
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
    case 'ask':
      return runAsk(args.slice(1));
    case 'generate':
      return runGenerate(args.slice(1));
    case 'migrate':
      return runMigrate(args.slice(1));
    case 'search':
      return runSearch(args.slice(1));
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
 * @param {string[]} subArgs  — reserved for future flags (--dry-run, --notebook)
 */
async function runSync(subArgs) {
  // WR-04: warn on unrecognized flags instead of silently discarding them.
  for (const flag of subArgs) {
    if (flag.startsWith('-')) {
      warn(`Unknown flag ignored: ${flag}`);
    }
  }

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

  // FIX-02: syncVault returns { perProject, total, durationMs, rateLimited, notebookId }.
  // Counts are under stats.total, not directly on stats. Extract total for display.
  const total = stats.total ?? stats; // fallback to stats itself for backward compat

  // Print per-file errors with truncated reasons (T-05-01 security mitigation).
  if (total.errors && total.errors.length > 0) {
    for (const e of total.errors) {
      warn(`  ${e.file}: ${truncateReason(e.reason)}`);
    }
  }

  // Summary line — mirrors export.mjs UX pattern (Claude's Discretion R6).
  const summary = `Sync complete: ${total.uploaded} uploaded, ${total.skipped} skipped, ${total.failed} failed (${stats.durationMs}ms)`;
  if (total.failed > 0 || (total.errors && total.errors.length > 0)) {
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

// ── resolveNotebookId ────────────────────────────────────────────────────────

/**
 * Resolve a notebook ID from CLI args or manifest.
 *
 * Priority (D-13, D-14):
 *   1. --notebook <id> or -n <id> flag in args
 *   2. manifest entry for current project slug (basename of process.cwd())
 *
 * @param {string[]} args
 * @returns {{ notebookId: string, remaining: string[], vaultRoot?: string, slug?: string }}
 * @throws {Error} if notebook ID cannot be resolved (after printing fail message)
 */
function resolveNotebookId(args) {
  // Check --notebook flag
  const nbIdx = args.indexOf('--notebook');
  if (nbIdx !== -1 && args[nbIdx + 1]) {
    return {
      notebookId: args[nbIdx + 1],
      remaining: args.filter((_, i) => i !== nbIdx && i !== nbIdx + 1),
    };
  }
  // Check -n short flag
  const nbShortIdx = args.indexOf('-n');
  if (nbShortIdx !== -1 && args[nbShortIdx + 1]) {
    return {
      notebookId: args[nbShortIdx + 1],
      remaining: args.filter((_, i) => i !== nbShortIdx && i !== nbShortIdx + 1),
    };
  }
  // Auto-resolve from manifest
  const vaultRoot = process.env.VAULT_PATH ?? findVault();
  if (!vaultRoot) {
    fail('No --notebook flag and vault not found. Pass --notebook <id> or set up vault first.');
    throw new Error('Cannot resolve notebook ID');
  }
  const manifest = readManifest(vaultRoot);
  const slug = basename(process.cwd());
  const entry = manifest?.projects?.[slug];
  if (!entry?.notebook_id) {
    fail(`No notebook ID found for project "${slug}" in manifest. Pass --notebook <id> or run notebooklm sync first.`);
    throw new Error('Cannot resolve notebook ID');
  }
  return { notebookId: entry.notebook_id, remaining: args, vaultRoot, slug };
}

// ── runAsk ───────────────────────────────────────────────────────────────────

/**
 * Execute `notebooklm ask`. Prints answer and citations; optionally saves to vault.
 *
 * @param {string[]} args  — everything after the 'ask' subcommand token
 */
async function runAsk(args) {
  // Parse --save flag
  const hasSave = args.includes('--save');
  const filteredArgs = args.filter(a => a !== '--save');

  // Parse --source / -s flags
  const sourceIds = [];
  const cleanArgs = [];
  for (let i = 0; i < filteredArgs.length; i++) {
    if ((filteredArgs[i] === '--source' || filteredArgs[i] === '-s') && filteredArgs[i + 1]) {
      sourceIds.push(filteredArgs[i + 1]);
      i++; // skip value
    } else {
      cleanArgs.push(filteredArgs[i]);
    }
  }

  // resolveNotebookId strips --notebook/-n flags; remaining = positional args
  let resolved;
  try {
    resolved = resolveNotebookId(cleanArgs);
  } catch (err) {
    // fail() already called inside resolveNotebookId
    return;
  }
  const { notebookId, remaining, vaultRoot, slug } = resolved;

  // Remaining positional args joined = the question
  const question = remaining.join(' ').trim();
  if (!question) {
    fail('No question provided. Usage: notebooklm ask [--notebook <id>] "your question"');
    return;
  }

  try {
    const result = await askNotebook(notebookId, question, sourceIds.length ? { sourceIds } : {});

    // Display answer
    console.log('');
    console.log(`  ${c.white}${result.answer}${c.reset}`);

    if (result.citations.length > 0) {
      console.log('');
      console.log(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);
      console.log(`  ${c.cyan}${c.bold}Citations${c.reset}`);
      for (const cite of result.citations) {
        const idx = cite.index != null ? `[${cite.index}]` : '[-]';
        const snippet = cite.snippet ? ` \u2014 ${cite.snippet}` : '';
        console.log(`  ${c.dim}${idx}${c.reset} ${c.yellow}${cite.sourceId}${c.reset}${snippet}`);
      }
    }
    console.log('');

    // --save: write answer to vault (D-09)
    if (hasSave) {
      const saveVault = vaultRoot || process.env.VAULT_PATH || findVault();
      const saveSlug = slug || basename(process.cwd());
      if (!saveVault) {
        warn('Cannot save: vault not found.');
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
      const questionSlug = question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      const dir = join(saveVault, 'projects', saveSlug, 'docs', 'notebooklm-answers');
      mkdirSync(dir, { recursive: true });
      const filepath = join(dir, `${timestamp}-${questionSlug}.md`);

      const citationsMd = result.citations.map(cite => {
        const idx = cite.index != null ? `[${cite.index}]` : '[-]';
        return `- ${idx} \`${cite.sourceId}\`${cite.snippet ? ': ' + cite.snippet : ''}`;
      }).join('\n');

      const content = `# ${question}\n\n${result.answer}\n\n## Citations\n\n${citationsMd}\n\n---\n*Generated: ${new Date().toISOString()}*\n`;
      writeFileSync(filepath, content);
      ok(`Saved to ${filepath}`);
    }
  } catch (err) {
    if (err instanceof NotebooklmNotInstalledError) {
      fail('notebooklm-py is not installed. Run: pipx install notebooklm-py');
      throw err;
    }
    fail(`Ask failed: ${truncateReason(err.message)}`);
    throw err;
  }
}

// ── runGenerate ──────────────────────────────────────────────────────────────

/**
 * Execute `notebooklm generate`. Prints artifact content or binary download hint;
 * optionally saves to vault.
 *
 * @param {string[]} args  — everything after the 'generate' subcommand token
 */
async function runGenerate(args) {
  const hasSave = args.includes('--save');
  const filteredArgs = args.filter(a => a !== '--save');

  // Strip --notebook/-n flag and its value before looking for the type arg,
  // so the notebook ID value is not mistaken for the artifact type.
  const positionalArgs = [];
  for (let i = 0; i < filteredArgs.length; i++) {
    if ((filteredArgs[i] === '--notebook' || filteredArgs[i] === '-n') && filteredArgs[i + 1]) {
      i++; // skip flag value
    } else if (!filteredArgs[i].startsWith('-')) {
      positionalArgs.push(filteredArgs[i]);
    }
  }

  // First positional arg is the artifact type
  const typeArg = positionalArgs[0];
  if (!typeArg) {
    fail('No artifact type provided. Usage: notebooklm generate <type> [--notebook <id>]');
    info('Types: audio, video, cinematic-video, slide-deck, quiz, flashcards, infographic, data-table, mind-map, report, revise-slide');
    return;
  }

  const argsWithoutType = filteredArgs.filter(a => a !== typeArg);

  let resolved;
  try {
    resolved = resolveNotebookId(argsWithoutType);
  } catch (err) {
    // fail() already called inside resolveNotebookId
    return;
  }
  const { notebookId, vaultRoot, slug } = resolved;

  try {
    // D-15: waiting message for long-running generation
    console.log('');
    console.log(`  ${c.dim}Generating ${typeArg}\u2026 (this may take up to 5 minutes)${c.reset}`);

    const result = await generateArtifact(notebookId, typeArg);

    if (result.content !== null) {
      // Text artifact — display content
      console.log('');
      console.log(`  ${c.white}${result.content}${c.reset}`);
      console.log('');
      ok(`${typeArg} generated (artifact: ${result.artifactId})`);
    } else {
      // Binary artifact — display ID + download hint (D-15, Pitfall 2)
      console.log('');
      ok(`${typeArg} generated (artifact: ${result.artifactId})`);
      info(`Binary artifact \u2014 use \`notebooklm download ${typeArg}\` to retrieve the file.`);
    }

    // --save (D-09 for text, D-16 for binary)
    if (hasSave) {
      const saveVault = vaultRoot || process.env.VAULT_PATH || findVault();
      const saveSlug = slug || basename(process.cwd());
      if (!saveVault) {
        warn('Cannot save: vault not found.');
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');

      if (result.content !== null) {
        // Text artifact → save to notebooklm-answers
        const dir = join(saveVault, 'projects', saveSlug, 'docs', 'notebooklm-answers');
        mkdirSync(dir, { recursive: true });
        const filepath = join(dir, `${timestamp}-${typeArg}.md`);
        writeFileSync(filepath, `# ${typeArg}\n\n${result.content}\n\n---\n*Generated: ${new Date().toISOString()} | Artifact: ${result.artifactId}*\n`);
        ok(`Saved to ${filepath}`);
      } else {
        // Binary artifact → print download path hint (D-16)
        const extMap = { audio: 'wav', video: 'mp4', 'cinematic-video': 'mp4', 'slide-deck': 'pptx', infographic: 'png' };
        const ext = extMap[typeArg] || 'bin';
        const dir = join(saveVault, 'projects', saveSlug, 'docs', 'notebooklm-artifacts');
        mkdirSync(dir, { recursive: true });
        const filepath = join(dir, `${timestamp}-${typeArg}.${ext}`);
        info(`Binary download to ${filepath} \u2014 run: notebooklm download ${typeArg} -n ${notebookId} -o '${filepath}'`);
      }
    }
  } catch (err) {
    if (err instanceof NotebooklmNotInstalledError) {
      fail('notebooklm-py is not installed. Run: pipx install notebooklm-py');
      throw err;
    }
    fail(`Generate failed: ${truncateReason(err.message)}`);
    throw err;
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

// ── runSearch ─────────────────────────────────────────────────────────────────

/**
 * Search across all per-project notebooks in parallel.
 *
 * Discovers notebooks via listNotebooks() filtered to the cds__ prefix (D-01).
 * Fans out one askNotebook() call per notebook via Promise.allSettled (D-02).
 * Prints fulfilled results first, then warn() lines for failures (D-04).
 * Exits 0 if at least one notebook succeeded; exits non-zero if all failed (D-04).
 * Supports --json flag for machine-readable output (D-07).
 * Does NOT require a vault to be present (D-12).
 *
 * Injectable _listFn and _askFn for testing (D-10).
 *
 * @param {string[]} args  — everything after the 'search' subcommand token
 * @param {object}   [options]
 * @param {Function} [options._listFn]  — injectable; defaults to listNotebooks
 * @param {Function} [options._askFn]   — injectable; defaults to askNotebook
 */
export async function runSearch(args, options = {}) {
  // D-08: warn on unrecognized flags instead of silently discarding them.
  const jsonMode = args.includes('--json');
  const remaining = [];
  for (const arg of args) {
    if (arg === '--json') continue;
    if (arg.startsWith('-')) {
      warn(`Unknown flag ignored: ${arg}`);
    } else {
      remaining.push(arg);
    }
  }

  const query = remaining.join(' ').trim();
  if (!query) {
    fail('No query provided. Usage: notebooklm search "your question"');
    return;
  }

  // Dependency injection for testing (D-10).
  const listFn = options._listFn || listNotebooks;
  const askFn = options._askFn || askNotebook;

  // D-01: discover all per-project notebooks via listNotebooks().
  // D-12: no vault needed — live API lookup only.
  let allNotebooks;
  try {
    allNotebooks = await listFn();
  } catch (err) {
    if (err instanceof NotebooklmNotInstalledError) {
      fail(err.message);
      info('Install with: pipx install notebooklm-py');
      throw err;
    }
    if (err instanceof NotebooklmRateLimitError) {
      warn('Rate limited by notebooklm-py \u2014 try again later');
      throw err;
    }
    throw err;
  }

  // D-01: filter to cds__ prefix; extract project slug by stripping first 5 chars.
  const projectNotebooks = allNotebooks.filter(nb => nb.title.startsWith('cds__'));

  // D-05: zero notebooks case — info message, exit 0.
  if (projectNotebooks.length === 0) {
    info('No project notebooks configured.');
    info('Run: claude-dev-stack notebooklm sync  (to create per-project notebooks)');
    return;
  }

  if (!jsonMode) {
    console.log('');
    console.log(`  ${c.dim}Searching ${projectNotebooks.length} notebook${projectNotebooks.length === 1 ? '' : 's'} for: "${query}"\u2026${c.reset}`);
    console.log('');
  }

  // D-02: parallel fan-out via Promise.allSettled — failures in one notebook
  // do not cancel in-flight requests to others.
  const settled = await Promise.allSettled(
    projectNotebooks.map(async (nb) => {
      const slug = nb.title.slice(5); // D-01: strip 'cds__' prefix
      const result = await askFn(nb.id, query);
      return { project: slug, answer: result.answer, citations: result.citations };
    })
  );

  // D-04: separate fulfilled from rejected.
  const successes = [];
  const failures = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const slug = projectNotebooks[i].title.slice(5);
    if (s.status === 'fulfilled') {
      successes.push(s.value);
    } else {
      // D-11: truncate error message to ≤200 chars (T-05-01 security mitigation).
      failures.push({ project: slug, error: truncateReason(s.reason?.message || String(s.reason)) });
    }
  }

  // D-07: --json mode — single JSON object to stdout, no formatted output.
  if (jsonMode) {
    console.log(JSON.stringify({ query, results: successes, errors: failures }));
    // D-04: exit non-zero only if all failed.
    if (successes.length === 0 && failures.length > 0) {
      throw new Error(`All ${failures.length} notebook queries failed`);
    }
    return;
  }

  // D-06: human-readable output — group results by project with dim dividers.
  for (const res of successes) {
    console.log(`  ${c.dim}${'─'.repeat(46)}${c.reset}`);
    console.log(`  ${c.bold}${res.project}${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(46)}${c.reset}`);
    console.log('');
    console.log(`  ${c.white}${res.answer}${c.reset}`);

    if (res.citations.length > 0) {
      console.log('');
      console.log(`  ${c.cyan}${c.bold}Citations${c.reset}`);
      for (const cite of res.citations) {
        const idx = cite.index != null ? `[${cite.index}]` : '[-]';
        const snippet = cite.snippet ? ` \u2014 ${cite.snippet}` : '';
        console.log(`  ${c.dim}${idx}${c.reset} ${c.yellow}${cite.sourceId}${c.reset}${snippet}`);
      }
    }
    console.log('');
  }

  // D-04: print warnings for failed notebooks after successful results.
  for (const f of failures) {
    warn(`${f.project}: ${f.error}`);
  }

  // D-04: exit non-zero only if ALL notebooks failed.
  if (successes.length === 0 && failures.length > 0) {
    throw new Error(`All ${failures.length} notebook queries failed`);
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
 * @param {string[]} subArgs  — reserved for future flags
 */
async function runStatus(subArgs) {
  // WR-04: warn on unrecognized flags instead of silently discarding them.
  for (const flag of subArgs) {
    if (flag.startsWith('-')) {
      warn(`Unknown flag ignored: ${flag}`);
    }
  }

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
  console.log(`  ${c.white}claude-dev-stack notebooklm ask${c.reset}      ${c.dim}Ask a question to your NotebookLM notebook${c.reset}`);
  console.log(`  ${c.white}claude-dev-stack notebooklm generate${c.reset} ${c.dim}Generate an artifact (report, quiz, audio, etc.)${c.reset}`);
  console.log(`  ${c.white}claude-dev-stack notebooklm search${c.reset}   ${c.dim}Search across all project notebooks simultaneously${c.reset}`);
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
