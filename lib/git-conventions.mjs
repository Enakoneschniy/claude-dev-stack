/**
 * lib/git-conventions.mjs -- CLI dispatcher for `claude-dev-stack scopes` subcommand.
 *
 * Dispatches to:
 *   scopes list     -- show current scopes and config
 *   scopes init     -- interactive setup of git-scopes.json
 *   scopes refresh  -- re-detect scopes from project structure
 *   scopes add      -- add a scope to existing config
 *   scopes remove   -- remove a scope from existing config
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { c, ok, fail, warn, info, prompt, mkdirp } from './shared.mjs';
import {
  detectStack,
  readScopes,
  writeScopes,
  validateScopes,
  detectMainBranch,
  installSkill,
  printCommitlintInstructions,
  createDefaultConfig,
  checkPrereqs,
  buildCommitlintYml,
  parseClauda,
} from './git-scopes.mjs';

const DEFAULT_GITMOJI = {
  feat: '✨', fix: '🐛', refactor: '♻️',
  test: '✅', docs: '📝', ci: '👷', chore: '🔧',
};

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Main CLI dispatcher for the scopes subcommand.
 * Called from bin/cli.mjs with args.slice(1).
 *
 * @param {string[]} args
 */
export async function main(args = []) {
  const sub = args[0];
  const isQuick = args.includes('--quick');
  const isFull = args.includes('--full');
  const isGitmoji = args.includes('--gitmoji');

  switch (sub) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      printHelp();
      return;
    case 'list':
      return cmdList();
    case 'init':
      return cmdInit({ quick: isQuick, full: isFull, gitmoji: isGitmoji });
    case 'refresh':
      return cmdRefresh();
    case 'add':
      return cmdAdd(args.slice(1));
    case 'remove':
      return cmdRemove(args.slice(1));
    default:
      fail(`Unknown scopes subcommand: ${sub}`);
      printHelp();
      return;
  }
}

// ── printHelp ─────────────────────────────────────────────────────────────────

function printHelp() {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Git Conventions — scopes${c.reset}`);
  console.log('');
  console.log(`  Usage: claude-dev-stack scopes <command>`);
  console.log('');
  console.log(`  Commands:`);
  console.log(`    ${c.white}init${c.reset}             ${c.dim}Initialize .claude/git-scopes.json for this project${c.reset}`);
  console.log(`    ${c.white}list${c.reset}             ${c.dim}Show current scopes and config${c.reset}`);
  console.log(`    ${c.white}add <name>${c.reset}       ${c.dim}Add a new scope${c.reset}`);
  console.log(`    ${c.white}remove <name>${c.reset}    ${c.dim}Remove a scope${c.reset}`);
  console.log(`    ${c.white}refresh${c.reset}          ${c.dim}Re-detect scopes from project structure${c.reset}`);
  console.log('');
  console.log(`  Options for init:`);
  console.log(`    ${c.white}--quick${c.reset}          ${c.dim}4-question quick setup (default)${c.reset}`);
  console.log(`    ${c.white}--full${c.reset}           ${c.dim}Full setup with all config options${c.reset}`);
  console.log('');
}

// ── cmdList ───────────────────────────────────────────────────────────────────

async function cmdList() {
  const cwd = process.cwd();
  const config = readScopes(cwd);
  if (!config) {
    fail(`No .claude/git-scopes.json found in ${cwd}`);
    info('Run: claude-dev-stack scopes init');
    return;
  }

  console.log('');
  console.log(`  ${c.bold}Git Conventions — ${config.project || basename(cwd)}${c.reset}`);
  console.log('');
  ok(`Main branch: ${config.main_branch}`);
  ok(`Co-authored-by: ${config.co_authored_by ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log(`  ${c.bold}Scopes:${c.reset}`);
  for (const scope of config.scopes) {
    console.log(`    ${c.green}-${c.reset} ${scope}`);
  }
  console.log('');
  if (config.ticket_prefix) {
    info(`Ticket prefix: ${config.ticket_prefix}`);
  }
  if (config.commitlint_enforced) {
    info('Commitlint: enforced');
  }
}

// ── cmdInit ───────────────────────────────────────────────────────────────────

async function cmdInit({ quick = false, full = false, gitmoji = false } = {}) {
  const cwd = process.cwd();

  const prereqs = checkPrereqs(cwd);
  if (!prereqs.ok) {
    if (prereqs.missing.includes('git')) {
      fail('git-conventions requires: git');
      info('Install git: https://git-scm.com/downloads');
      info('Then re-run from a git repository root.');
    } else if (prereqs.missing.includes('not-a-git-repo')) {
      fail('Not a git repository.');
      info('Run: git init');
    }
    return;
  }

  const projectName = basename(cwd);

  info(`Detecting project structure for ${projectName}...`);
  const detected = detectStack(cwd);
  const mainBranch = detectMainBranch(cwd);

  const config = createDefaultConfig(projectName, detected);
  if (mainBranch) config.main_branch = mainBranch;

  console.log('');
  info(`Detected stack: ${detected.source} (${detected.confidence} confidence)`);
  info(`Detected scopes: ${detected.scopes.join(', ')}`);
  console.log('');

  // Prompts 1-4 always run (both quick and full mode)
  // Prompt 1: project name
  const nameAnswer = await prompt({
    type: 'text',
    name: 'projectName',
    message: 'Project name:',
    initial: projectName,
  });
  if (nameAnswer.projectName) config.project = nameAnswer.projectName;

  // Prompt 2: confirm detected scopes
  const scopesStr = detected.scopes.join(', ');
  const scopesAnswer = await prompt({
    type: 'confirm',
    name: 'acceptScopes',
    message: `Detected scopes: [${scopesStr}] (${detected.source}). Accept?`,
    initial: true,
  });
  if (scopesAnswer.acceptScopes === false) {
    const customScopes = await prompt({
      type: 'text',
      name: 'scopes',
      message: 'Enter scopes (comma-separated):',
      initial: scopesStr,
    });
    if (customScopes.scopes) {
      config.scopes = customScopes.scopes.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Prompt 3: confirm main branch
  const branchAnswer = await prompt({
    type: 'confirm',
    name: 'acceptBranch',
    message: `Main branch: ${config.main_branch}. Correct?`,
    initial: true,
  });
  if (branchAnswer.acceptBranch === false) {
    const customBranch = await prompt({
      type: 'text',
      name: 'branch',
      message: 'Enter main branch name:',
      initial: config.main_branch,
    });
    if (customBranch.branch) config.main_branch = customBranch.branch;
  }

  // Prompt 4: commitlint (only if package.json exists)
  if (existsSync(join(cwd, 'package.json'))) {
    const commitlintAnswer = await prompt({
      type: 'confirm',
      name: 'commitlint',
      message: 'Install commitlint enforcement?',
      initial: false,
    });
    config.commitlint_enforced = commitlintAnswer.commitlint === true;
  }

  // Full mode extends quick with additional prompts
  if (full) {
    // Prompt 5: ticket prefix
    const ticketAnswer = await prompt({
      type: 'text',
      name: 'ticketPrefix',
      message: 'Ticket prefix (optional, e.g. "PROJ-"):',
      initial: '',
    });
    config.ticket_prefix = ticketAnswer.ticketPrefix || '';

    // Prompt 6: branch format
    const branchFormatAnswer = await prompt({
      type: 'text',
      name: 'branchFormat',
      message: 'Branch format:',
      initial: config.branch_format,
    });
    config.branch_format = branchFormatAnswer.branchFormat || config.branch_format;

    // Prompt 7: co-authored-by
    const coAuthorAnswer = await prompt({
      type: 'confirm',
      name: 'coAuthoredBy',
      message: 'Include co-authorship attribution in commits?',
      initial: false,
    });
    config.co_authored_by = coAuthorAnswer.coAuthoredBy === true;

    // Prompt 8: gitmoji (full mode only, not when --gitmoji flag already set)
    if (!gitmoji) {
      const gitmojiAnswer = await prompt({
        type: 'confirm',
        name: 'gitmoji',
        message: 'Enable gitmoji prefixes? (y/N)',
        initial: false,
      });
      if (gitmojiAnswer.gitmoji === true) config.gitmoji = DEFAULT_GITMOJI;
    }
  }

  if (gitmoji) config.gitmoji = DEFAULT_GITMOJI;

  writeScopes(cwd, config);
  ok('Wrote .claude/git-scopes.json');
  installSkill(cwd, config);
  ok('Installed git-conventions skill');

  if (config.commitlint_enforced) {
    printCommitlintInstructions(config);
  }
}

// ── cmdRefresh ────────────────────────────────────────────────────────────────

async function cmdRefresh() {
  const cwd = process.cwd();
  const existing = readScopes(cwd);
  if (!existing) {
    fail('No .claude/git-scopes.json found. Run: claude-dev-stack scopes init');
    return;
  }

  const detected = detectStack(cwd);
  const prevScopes = new Set(existing.scopes);
  const newScopes = detected.scopes.filter(s => !prevScopes.has(s));
  const mergedScopes = [...existing.scopes, ...newScopes];

  if (newScopes.length === 0) {
    ok('No new scopes detected — config is up to date');
  } else {
    for (const s of newScopes) {
      ok(`Added scope: ${s}`);
    }
    existing.scopes = mergedScopes;
    writeScopes(cwd, existing);
    installSkill(cwd, existing);
    ok('Refreshed .claude/git-scopes.json and reinstalled skill');
  }

  info(`Current scopes: ${mergedScopes.join(', ')}`);
}

// ── cmdAdd ────────────────────────────────────────────────────────────────────

async function cmdAdd(args) {
  const scopeName = args[0];
  if (!scopeName || scopeName.startsWith('--')) {
    fail('Scope name required. Usage: claude-dev-stack scopes add <name>');
    return;
  }

  const cwd = process.cwd();
  const config = readScopes(cwd);
  if (!config) {
    fail('No .claude/git-scopes.json found. Run: claude-dev-stack scopes init');
    return;
  }

  if (config.scopes.includes(scopeName)) {
    warn(`Scope '${scopeName}' already exists`);
    return;
  }

  config.scopes.push(scopeName);
  writeScopes(cwd, config);
  installSkill(cwd, config);
  ok(`Added scope: ${scopeName}`);
}

// ── cmdRemove ─────────────────────────────────────────────────────────────────

async function cmdRemove(args) {
  const scopeName = args[0];
  if (!scopeName || scopeName.startsWith('--')) {
    fail('Scope name required. Usage: claude-dev-stack scopes remove <name>');
    return;
  }

  const cwd = process.cwd();
  const config = readScopes(cwd);
  if (!config) {
    fail('No .claude/git-scopes.json found. Run: claude-dev-stack scopes init');
    return;
  }

  if (!config.scopes.includes(scopeName)) {
    warn(`Scope '${scopeName}' not found in config`);
    return;
  }

  config.scopes = config.scopes.filter(s => s !== scopeName);
  writeScopes(cwd, config);
  installSkill(cwd, config);
  ok(`Removed scope: ${scopeName}`);
}

// ── cmdGitAction ──────────────────────────────────────────────────────────────

export async function cmdGitAction(args = []) {
  const cwd = process.cwd();
  const config = readScopes(cwd);
  if (!config) {
    fail('No .claude/git-scopes.json found.');
    info('Run: claude-dev-stack scopes init');
    return;
  }

  mkdirp(join(cwd, '.github', 'workflows'));
  const outPath = join(cwd, '.github', 'workflows', 'commitlint.yml');

  if (existsSync(outPath)) {
    const answer = await prompt({
      type: 'confirm',
      name: 'overwrite',
      message: 'commitlint.yml already exists. Overwrite? (y/N)',
      initial: false,
    });
    if (!answer.overwrite) {
      warn('Skipped -- existing file preserved');
      return;
    }
  }

  const yaml = buildCommitlintYml(config);
  writeFileSync(outPath, yaml, 'utf8');
  ok('Wrote .github/workflows/commitlint.yml');
  info('Add commitlint.config.mjs to your project root to enforce custom scopes.');
  printCommitlintInstructions(config);
}

// ── cmdMigrateClaude ──────────────────────────────────────────────────────────

export async function cmdMigrateClaude(args = []) {
  const cwd = process.cwd();

  // Resolve CLAUDE.md path
  let claudePath = null;
  if (args[0] && existsSync(args[0])) {
    claudePath = args[0];
  } else if (existsSync(join(cwd, 'CLAUDE.md'))) {
    claudePath = join(cwd, 'CLAUDE.md');
  } else if (existsSync(join(cwd, '.claude', 'CLAUDE.md'))) {
    claudePath = join(cwd, '.claude', 'CLAUDE.md');
  }

  if (!claudePath) {
    fail('No CLAUDE.md found.');
    info('Usage: claude-dev-stack migrate-claude-md [path]');
    return;
  }

  const content = readFileSync(claudePath, 'utf8');
  const extracted = parseClauda(content);

  let { scopes, types, mainBranch, ticketPrefix } = extracted;

  if (scopes.length === 0) {
    warn('No scopes found in CLAUDE.md.');
    const manualAnswer = await prompt({
      type: 'text',
      name: 'scopes',
      message: 'Enter scopes manually (comma-separated):',
      initial: '',
    });
    if (!manualAnswer.scopes) return;
    scopes = manualAnswer.scopes.split(',').map(s => s.trim()).filter(Boolean);
    if (scopes.length === 0) return;
  }

  // Show summary
  console.log('');
  info('Extracted from CLAUDE.md:');
  console.log(`     Scopes:       ${scopes.join(', ')}`);
  console.log(`     Types:        ${types.length > 0 ? types.join(', ') : '(defaults)'}`);
  console.log(`     Main branch:  ${mainBranch || '(defaults to main)'}`);
  console.log(`     Ticket:       ${ticketPrefix || '(none)'}`);
  console.log('');

  const acceptAnswer = await prompt({
    type: 'confirm',
    name: 'accept',
    message: 'Accept and write .claude/git-scopes.json?',
    initial: true,
  });

  if (!acceptAnswer.accept) {
    // Individual field review
    const scopesAnswer = await prompt({
      type: 'text',
      name: 'scopes',
      message: 'Scopes (comma-separated):',
      initial: scopes.join(', '),
    });
    if (scopesAnswer.scopes) {
      scopes = scopesAnswer.scopes.split(',').map(s => s.trim()).filter(Boolean);
    }

    const branchAnswer = await prompt({
      type: 'text',
      name: 'branch',
      message: 'Main branch:',
      initial: mainBranch || 'main',
    });
    if (branchAnswer.branch) mainBranch = branchAnswer.branch;

    const ticketAnswer = await prompt({
      type: 'text',
      name: 'ticket',
      message: 'Ticket prefix (e.g. PROJ-):',
      initial: ticketPrefix || '',
    });
    ticketPrefix = ticketAnswer.ticket || '';
  }

  // Overwrite protection
  const scopesPath = join(cwd, '.claude', 'git-scopes.json');
  if (existsSync(scopesPath)) {
    const owAnswer = await prompt({
      type: 'confirm',
      name: 'overwrite',
      message: 'git-scopes.json already exists. Overwrite? (y/N)',
      initial: false,
    });
    if (!owAnswer.overwrite) {
      warn('Skipped -- existing file preserved');
      return;
    }
  }

  const detected = { scopes, source: 'migrate-claude-md', confidence: 'medium' };
  const config = createDefaultConfig(basename(cwd), detected);
  if (mainBranch) config.main_branch = mainBranch;
  if (ticketPrefix) config.ticket_prefix = ticketPrefix;
  if (types.length > 0) config.types = types;

  writeScopes(cwd, config);
  ok('Wrote .claude/git-scopes.json');
  installSkill(cwd, config);
  ok('Installed git-conventions skill');
}
