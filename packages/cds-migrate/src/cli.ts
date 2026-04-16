// Phase 38 Plan 03 Task 38-03-01 — @cds/migrate CLI.
//
// Invoked by bin/cli.mjs as `main(['sessions', '--dry-run', ...])`. Hand-
// rolled flag parser (no yargs/commander — Phase 33 D-03 single-dep
// constraint). Uses `prompts` for the apply confirmation dialog.

import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import prompts from 'prompts';

import { migrateMarkdownSessions } from './sessions-md-to-sqlite.js';
import { formatCost, formatSize } from './token-estimate.js';
import type { MigrationFileResult, MigrationReport } from './types.js';

// ANSI color helpers. Matches bin/cli.mjs palette — single-dep constraint.
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const DEFAULT_MAX_COST = 0.3;

interface ParsedFlags {
  subcommand: string | null;
  dryRun: boolean;
  apply: boolean;
  forceRefresh: boolean;
  maxCost: number;
  project: string | null;
  vault: string | null;
  help: boolean;
}

export async function main(args: string[]): Promise<number> {
  let parsed: ParsedFlags;
  try {
    parsed = parseFlags(args);
  } catch (err) {
    console.error(
      c.red +
        'Error: ' +
        (err instanceof Error ? err.message : String(err)) +
        c.reset,
    );
    return 1;
  }

  if (parsed.help) {
    printHelp();
    return 0;
  }
  if (!parsed.subcommand) {
    printHelp();
    return 1;
  }
  if (parsed.subcommand !== 'sessions') {
    console.error(c.red + 'Unknown subcommand: ' + parsed.subcommand + c.reset);
    printHelp();
    return 1;
  }

  // Flag combination validation.
  if (parsed.dryRun && parsed.apply) {
    console.error(
      c.red +
        'Error: --dry-run and --apply are mutually exclusive.' +
        c.reset,
    );
    return 1;
  }
  if (parsed.forceRefresh && !parsed.apply) {
    console.error(
      c.red + 'Error: --force-refresh requires --apply.' + c.reset,
    );
    return 1;
  }

  // Default to dry-run when neither mode flag is set.
  const isDryRun = !parsed.apply;

  const vaultPath =
    parsed.vault ?? process.env['CDS_TEST_VAULT'] ?? join(homedir(), 'vault');
  const projectName = parsed.project ?? basename(process.cwd());

  try {
    // Always run a dry-run classification pass first.
    const preview = await migrateMarkdownSessions({
      vaultPath,
      projectName,
      dryRun: true,
    });

    if (preview.total.fileCount === 0) {
      console.log(
        c.yellow +
          'No sessions found in ' +
          join(vaultPath, 'projects', projectName, 'sessions') +
          c.reset,
      );
      return 0;
    }

    // Render the dry-run table (apply callers also see the preview).
    printDryRunTable(preview);

    if (isDryRun) {
      console.log('');
      console.log(
        c.dim +
          'Run with --apply to execute. Add --force-refresh to re-process already-migrated files.' +
          c.reset,
      );
      return 0;
    }

    // --apply path.
    const willMigrate = preview.files.filter(
      (f) =>
        f.status === 'will-migrate' ||
        (f.status === 'hash-changed' && parsed.forceRefresh),
    );
    if (willMigrate.length === 0) {
      console.log('');
      console.log(
        c.green + 'Nothing to migrate — all sessions are up to date.' + c.reset,
      );
      return 0;
    }

    const applyCost = willMigrate.reduce((sum, f) => sum + f.estimatedCost, 0);

    if (applyCost > parsed.maxCost) {
      const answer = (await prompts({
        type: 'confirm',
        name: 'proceed',
        message:
          'Estimated cost: ' +
          formatCost(applyCost) +
          ' (threshold ' +
          formatCost(parsed.maxCost) +
          ') — proceed?',
        initial: false,
      })) as { proceed?: boolean };
      if (!answer.proceed) {
        console.log(c.yellow + 'Aborted.' + c.reset);
        return 2;
      }
    }

    const totalFiles = preview.files.length;
    let index = 0;
    const report = await migrateMarkdownSessions({
      vaultPath,
      projectName,
      dryRun: false,
      forceRefresh: parsed.forceRefresh,
      maxCost: parsed.maxCost,
      onFileResult: (result) => {
        index++;
        printProgressLine(index, totalFiles, result);
      },
    });

    printFinalSummary(report);
    return 0;
  } catch (err) {
    console.error(
      c.red +
        'Migration failed: ' +
        (err instanceof Error ? err.message : String(err)) +
        c.reset,
    );
    return 1;
  }
}

function parseFlags(args: string[]): ParsedFlags {
  const result: ParsedFlags = {
    subcommand: null,
    dryRun: false,
    apply: false,
    forceRefresh: false,
    maxCost: DEFAULT_MAX_COST,
    project: null,
    vault: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--help' || a === '-h') {
      result.help = true;
    } else if (a === '--dry-run') {
      result.dryRun = true;
    } else if (a === '--apply') {
      result.apply = true;
    } else if (a === '--force-refresh') {
      result.forceRefresh = true;
    } else if (a === '--max-cost') {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--max-cost requires a value');
      const parsedCost = parseFloat(next);
      if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
        throw new Error('--max-cost must be a positive number, got: ' + next);
      }
      result.maxCost = parsedCost;
      i++;
    } else if (a === '--project') {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--project requires a value');
      result.project = next;
      i++;
    } else if (a === '--vault') {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--vault requires a value');
      result.vault = next;
      i++;
    } else if (!a.startsWith('-') && !result.subcommand) {
      result.subcommand = a;
    } else {
      throw new Error('Unknown flag: ' + a);
    }
  }

  return result;
}

function printHelp(): void {
  console.log('');
  console.log(
    '  ' +
      c.magenta +
      c.bold +
      'claude-dev-stack migrate' +
      c.reset +
      ' — port markdown sessions into SQLite',
  );
  console.log('');
  console.log('  ' + c.cyan + c.bold + 'Usage' + c.reset);
  console.log(
    '    ' +
      c.white +
      'claude-dev-stack migrate sessions' +
      c.reset +
      ' [flags]',
  );
  console.log('');
  console.log('  ' + c.cyan + c.bold + 'Flags' + c.reset);
  console.log(
    '    ' +
      c.white +
      '--dry-run' +
      c.reset +
      '           ' +
      c.dim +
      'Preview without writing (default if no mode flag).' +
      c.reset,
  );
  console.log(
    '    ' +
      c.white +
      '--apply' +
      c.reset +
      '             ' +
      c.dim +
      'Execute the migration.' +
      c.reset,
  );
  console.log(
    '    ' +
      c.white +
      '--force-refresh' +
      c.reset +
      '     ' +
      c.dim +
      'Re-extract files whose content changed since last migration (requires --apply).' +
      c.reset,
  );
  console.log(
    '    ' +
      c.white +
      '--max-cost N' +
      c.reset +
      '        ' +
      c.dim +
      'Confirm if estimated cost exceeds $N (default $' +
      DEFAULT_MAX_COST.toFixed(2) +
      ').' +
      c.reset,
  );
  console.log(
    '    ' +
      c.white +
      '--project NAME' +
      c.reset +
      '      ' +
      c.dim +
      'Vault project name (default: cwd basename).' +
      c.reset,
  );
  console.log(
    '    ' +
      c.white +
      '--vault PATH' +
      c.reset +
      '        ' +
      c.dim +
      'Override vault root (default: ~/vault).' +
      c.reset,
  );
  console.log('');
  console.log('  ' + c.cyan + c.bold + 'Examples' + c.reset);
  console.log(
    '    ' +
      c.dim +
      '$ claude-dev-stack migrate sessions --dry-run' +
      c.reset,
  );
  console.log(
    '    ' + c.dim + '$ claude-dev-stack migrate sessions --apply' + c.reset,
  );
  console.log(
    '    ' +
      c.dim +
      '$ claude-dev-stack migrate sessions --apply --force-refresh' +
      c.reset,
  );
  console.log('');
}

function printDryRunTable(report: MigrationReport): void {
  const { vaultPath, projectName, files, total } = report;
  console.log('');
  console.log('Project: ' + c.bold + projectName + c.reset);
  console.log('Vault:   ' + vaultPath);
  console.log('Sessions found: ' + files.length);
  console.log('');

  const widths = {
    num: 3,
    filename: 44,
    size: 6,
    tokens: 11,
    cost: 10,
    status: 12,
  };

  const header = [
    padLeft('#', widths.num),
    padRight('Filename', widths.filename),
    padLeft('Size', widths.size),
    padLeft('Tokens(est)', widths.tokens),
    padLeft('Cost(est)', widths.cost),
    padRight('Status', widths.status),
  ];
  console.log(header.join('  '));

  const sep = [
    '─'.repeat(widths.num),
    '─'.repeat(widths.filename),
    '─'.repeat(widths.size),
    '─'.repeat(widths.tokens),
    '─'.repeat(widths.cost),
    '─'.repeat(widths.status),
  ];
  console.log(sep.join('  '));

  files.forEach((f, idx) => {
    const cols = [
      padLeft(String(idx + 1), widths.num),
      padRight(truncate(f.filename, widths.filename), widths.filename),
      padLeft(formatSize(f.sizeBytes), widths.size),
      padLeft(String(f.estimatedTokens), widths.tokens),
      padLeft(formatCost(f.estimatedCost), widths.cost),
      padRight(colorStatus(f.status), widths.status),
    ];
    console.log(cols.join('  '));
  });

  const totalsRow = [
    padLeft('Σ', widths.num),
    padRight('Total', widths.filename),
    padLeft(
      formatSize(files.reduce((s, f) => s + f.sizeBytes, 0)),
      widths.size,
    ),
    padLeft(
      String(files.reduce((s, f) => s + f.estimatedTokens, 0)),
      widths.tokens,
    ),
    padLeft(formatCost(total.estimatedCost), widths.cost),
    padRight(files.length + ' files', widths.status),
  ];
  console.log('');
  console.log(totalsRow.join('  '));
}

function printProgressLine(
  index: number,
  total: number,
  result: MigrationFileResult,
): void {
  const prefix = '[' + index + '/' + total + '] ' + result.filename;

  let statusLine = '';
  switch (result.status) {
    case 'migrated':
    case 'refreshed': {
      const obs = result.observationCount ?? 0;
      const cost = formatCost(result.actualCost ?? 0);
      statusLine =
        c.green +
        '✓' +
        c.reset +
        ' (' +
        obs +
        ' observations, ' +
        cost +
        ')';
      break;
    }
    case 'unchanged':
      statusLine = c.dim + 'already migrated' + c.reset;
      break;
    case 'hash-changed':
      statusLine =
        c.yellow + '⚠ content changed — use --force-refresh' + c.reset;
      break;
    case 'failed':
      statusLine = c.red + '✗ ' + (result.reason ?? 'unknown error') + c.reset;
      break;
    default:
      statusLine = c.dim + result.status + c.reset;
  }

  // Single-line per update for both TTY and CI — in-place retry display
  // is deferred to v1.1+ (D-101).
  process.stdout.write(prefix + ' ... ' + statusLine + '\n');
}

function printFinalSummary(report: MigrationReport): void {
  console.log('');
  console.log(c.bold + 'Migration complete:' + c.reset);
  console.log(
    '  Succeeded: ' + report.total.succeeded + '/' + report.total.fileCount,
  );
  if (report.total.failed > 0) {
    console.log(
      '  ' +
        c.red +
        'Failed:    ' +
        report.total.failed +
        '/' +
        report.total.fileCount +
        c.reset,
    );
  }
  if (report.total.skipped > 0) {
    console.log(
      '  Skipped:   ' + report.total.skipped + '/' + report.total.fileCount,
    );
  }
  console.log(
    '  Total cost: ' +
      formatCost(report.total.actualCost) +
      ' (estimated ' +
      formatCost(report.total.estimatedCost) +
      ')',
  );

  const failed = report.files.filter((f) => f.status === 'failed');
  if (failed.length > 0) {
    console.log('');
    console.log(c.red + c.bold + 'Failed files:' + c.reset);
    for (const f of failed) {
      console.log('  - ' + f.filename + ' — ' + (f.reason ?? 'unknown'));
    }
    console.log('');
    console.log(
      c.dim +
        'Re-run `claude-dev-stack migrate sessions --apply` to retry (successful files skip automatically).' +
        c.reset,
    );
  }

  const hashChanged = report.files.filter((f) => f.status === 'hash-changed');
  if (hashChanged.length > 0) {
    console.log('');
    console.log(
      c.yellow +
        c.bold +
        'Hash-changed files (use --force-refresh to re-extract):' +
        c.reset,
    );
    for (const f of hashChanged) {
      console.log('  - ' + f.filename);
    }
  }
}

function padLeft(s: string, width: number): string {
  return s.length >= width
    ? s.slice(0, width)
    : ' '.repeat(width - s.length) + s;
}

function padRight(s: string, width: number): string {
  // Strip ANSI codes for width calculation.
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - visible.length);
}

function truncate(s: string, width: number): string {
  if (s.length <= width) return s;
  return s.slice(0, width - 3) + '...';
}

function colorStatus(status: string): string {
  switch (status) {
    case 'will-migrate':
      return c.cyan + status + c.reset;
    case 'unchanged':
      return c.dim + status + c.reset;
    case 'hash-changed':
      return c.yellow + status + c.reset;
    case 'migrated':
    case 'refreshed':
      return c.green + status + c.reset;
    case 'failed':
      return c.red + status + c.reset;
    default:
      return status;
  }
}

// Direct-invoke guard for tsx/node entry:
if (import.meta.url === 'file://' + process.argv[1]) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
