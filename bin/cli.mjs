#!/usr/bin/env node

/**
 * Claude Dev Stack CLI
 */

const args = process.argv.slice(2);
const command = args[0];

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
};

function printHelp() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Claude Dev Stack${c.reset} — AI-powered development workflow`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Setup${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack${c.reset}                       ${c.dim}Full interactive setup wizard${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Projects${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack projects${c.reset}               ${c.dim}List projects and their status${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack projects add${c.reset}           ${c.dim}Add a project to vault${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack projects remove${c.reset}        ${c.dim}Remove project from vault${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Documents${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack docs${c.reset}                  ${c.dim}List documents per project${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack docs add${c.reset}              ${c.dim}Add from files, Notion export, or paste${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Skills${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills${c.reset}                 ${c.dim}List installed skills${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills install${c.reset}         ${c.dim}Install from catalog or Git URL${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills remove${c.reset}          ${c.dim}Remove installed skills${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Plugins${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack plugins${c.reset}                ${c.dim}List installed plugins${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack plugins install${c.reset}        ${c.dim}Install (preset or browse all)${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack plugins presets${c.reset}        ${c.dim}Install from a preset (fullstack, etc.)${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack plugins marketplaces${c.reset}   ${c.dim}Add third-party marketplaces${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}MCP Servers${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack mcp${c.reset}                   ${c.dim}List configured MCP servers${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack mcp install${c.reset}           ${c.dim}Install from catalog${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack mcp remove${c.reset}            ${c.dim}Remove MCP servers${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack mcp serve${c.reset}             ${c.dim}Run the CDS MCP server (stdio, for Claude Code integration)${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Templates${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack new${c.reset}                   ${c.dim}Generate context.md from stack template${c.reset}`);
  console.log(`    ${c.dim}14 stacks: Next.js, Nuxt, SvelteKit, Astro, React, FastAPI, Express,${c.reset}`);
  console.log(`    ${c.dim}Laravel, Spring Boot, Rails, Django, Flutter, Go, Blank${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Import & Export${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack import${c.reset}                 ${c.dim}Import AI configs (.cursorrules, CLAUDE.md, etc.)${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack export${c.reset}                 ${c.dim}Export vault as .tar.gz${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack sync init${c.reset}              ${c.dim}Initialize vault as git repo${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack sync push${c.reset}              ${c.dim}Commit and push vault${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack sync pull${c.reset}              ${c.dim}Pull latest vault from remote${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Analytics${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack stats${c.reset}                 ${c.dim}Dashboard: sessions, context quality, recommendations${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}NotebookLM Sync${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack notebooklm sync${c.reset}     ${c.dim}Sync vault to NotebookLM notebook${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack notebooklm status${c.reset}   ${c.dim}Show last sync, file count, stale files${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack notebooklm ask${c.reset}      ${c.dim}Ask a question to your NotebookLM notebook${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack notebooklm generate${c.reset} ${c.dim}Generate an artifact (report, quiz, audio, etc.)${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Notion Import${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack notion${c.reset}                 ${c.dim}Notion page import (list/add/import)${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Git Conventions${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack scopes init${c.reset}            ${c.dim}Initialize git-scopes.json for project${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack scopes list${c.reset}            ${c.dim}Show current scopes and config${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack scopes add <name>${c.reset}      ${c.dim}Add a scope${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack scopes remove <name>${c.reset}   ${c.dim}Remove a scope${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack scopes refresh${c.reset}         ${c.dim}Re-detect scopes from project structure${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack git-action${c.reset}             ${c.dim}Generate .github/workflows/commitlint.yml${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack migrate-claude-md${c.reset}      ${c.dim}Migrate prose CLAUDE.md to git-scopes.json${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Budget${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack budget${c.reset}                 ${c.dim}Show budget threshold and warning state${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack budget set <pct>${c.reset}       ${c.dim}Set warning threshold (0–100, default 70)${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack budget reset${c.reset}           ${c.dim}Clear warning state (re-arm for next crossing)${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Handoff${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack handoff status${c.reset}         ${c.dim}Check if there is stopped work to resume (exit 0/1)${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Decisions${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack decisions list${c.reset}         ${c.dim}List ADRs for current project${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack decisions show <id|slug>${c.reset} ${c.dim}Show full ADR content${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack decisions search <term>${c.reset} ${c.dim}Search across all ADRs${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Maintenance${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack doctor${c.reset}                 ${c.dim}Health check for all components${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack update${c.reset}                 ${c.dim}Update skills, GSD, Claude CLI${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Other${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack help${c.reset}                   ${c.dim}Show this help${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack version${c.reset}                ${c.dim}Show version${c.reset}`);
  console.log('');
}

async function run() {
  switch (command) {
    // ── Projects ──
    case 'projects':
    case 'project': {
      const { main } = await import('../lib/projects.mjs');
      await main(args.slice(1));
      break;
    }
    // ── Documents ──
    case 'docs':
    case 'doc': {
      const { main } = await import('../lib/docs.mjs');
      await main(args.slice(1));
      break;
    }

    case 'add-project':
    case 'add': {
      const { main } = await import('../lib/add-project.mjs');
      await main();
      break;
    }
    case 'remove-project': {
      const { removeProject } = await import('../lib/projects.mjs');
      await removeProject();
      break;
    }

    // ── Skills ──
    case 'skills':
    case 'skill': {
      const { main } = await import('../lib/skills.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Plugins ──
    case 'plugins':
    case 'plugin': {
      const { main } = await import('../lib/plugins.mjs');
      await main(args.slice(1));
      break;
    }

    // ── MCP ──
    case 'mcp': {
      if (args[1] === 'serve') {
        // Phase 37 MCP-02: route to the CDS MCP server under packages/cds-cli/
        const { main } = await import('../packages/cds-cli/dist/mcp-server.js');
        await main(args.slice(2));
      } else {
        // Existing third-party MCP catalog (install/remove/list/bare)
        const { main } = await import('../lib/mcp.mjs');
        await main(args.slice(1));
      }
      break;
    }

    // ── NotebookLM ──
    case 'notebooklm': {
      const { main } = await import('../lib/notebooklm-cli.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Notion Import ──
    case 'notion': {
      const { main } = await import('../lib/notion-cli.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Git Conventions ──
    case 'scopes':
    case 'scope': {
      const { main } = await import('../lib/git-conventions.mjs');
      await main(args.slice(1));
      break;
    }
    case 'git-action': {
      const { cmdGitAction } = await import('../lib/git-conventions.mjs');
      await cmdGitAction(args.slice(1));
      break;
    }
    case 'migrate-claude-md': {
      const { cmdMigrateClaude } = await import('../lib/git-conventions.mjs');
      await cmdMigrateClaude(args.slice(1));
      break;
    }

    // ── Templates ──
    case 'template':
    case 'templates':
    case 'new': {
      const { main } = await import('../lib/templates.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Import & Export ──
    case 'import': {
      const { main } = await import('../lib/import.mjs');
      await main(args.slice(1));
      break;
    }
    case 'export': {
      const { main } = await import('../lib/export.mjs');
      await main(['export']);
      break;
    }
    case 'sync': {
      const { main } = await import('../lib/export.mjs');
      await main(['sync', ...args.slice(1)]);
      break;
    }

    // ── Analytics ──
    case 'analytics':
    case 'stats':
    case 'status': {
      const { main } = await import('../lib/analytics.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Budget ──
    case 'budget': {
      const { main } = await import('../lib/budget-cli.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Handoff ──
    case 'handoff': {
      const { main } = await import('../lib/handoff-cli.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Decisions (ADR-02) ──
    case 'decisions': {
      const { main } = await import('../lib/decisions-cli.mjs');
      await main(args.slice(1));
      break;
    }

    // ── Maintenance ──
    case 'doctor':
    case 'check': {
      const { main } = await import('../lib/doctor.mjs');
      await main();
      break;
    }
    case 'update':
    case 'upgrade': {
      const { main } = await import('../lib/update.mjs');
      await main();
      break;
    }

    // ── Meta ──
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    case 'version':
    case '--version':
    case '-v': {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
      const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
      console.log(pkg.version);
      break;
    }

    // ── Default: setup wizard ──
    default: {
      const { default: setup } = await import('./install.mjs');
      await setup();
      break;
    }
  }
}

run().catch((err) => {
  console.error(`\n  ${c.reset}\x1b[31mError: ${err.message}${c.reset}\n`);
  process.exit(1);
});
