#!/usr/bin/env node

/**
 * Claude Dev Stack CLI
 *
 * Usage:
 *   npx claude-dev-stack              Full setup wizard
 *   npx claude-dev-stack skills       List installed skills
 *   npx claude-dev-stack skills install   Install skills from catalog
 *   npx claude-dev-stack skills remove    Remove installed skills
 *   npx claude-dev-stack help         Show this help
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
};

function printHelp() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Claude Dev Stack${c.reset} — AI-powered development workflow`);
  console.log('');
  console.log(`  ${c.bold}Commands:${c.reset}`);
  console.log('');
  console.log(`    ${c.white}claude-dev-stack${c.reset}                    ${c.dim}Full setup wizard${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills${c.reset}              ${c.dim}List installed skills${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills install${c.reset}      ${c.dim}Install skills from catalog${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack skills remove${c.reset}       ${c.dim}Remove installed skills${c.reset}`);
  console.log(`    ${c.white}claude-dev-stack help${c.reset}                ${c.dim}Show this help${c.reset}`);
  console.log('');
}

async function run() {
  switch (command) {
    case 'skills':
    case 'skill': {
      const { main } = await import('../lib/skills.mjs');
      await main(args.slice(1));
      break;
    }

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

    default: {
      // Default: run the full setup wizard
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
