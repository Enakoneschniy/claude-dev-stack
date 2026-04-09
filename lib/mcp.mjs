/**
 * MCP server management — list, install popular servers, remove.
 * Wraps `claude mcp` CLI with a curated catalog of popular MCP servers.
 */

import { c, ok, fail, warn, info, prompt, hasCommand, spawnSync } from './shared.mjs';

const MCP_CATALOG = [
  // HTTP-based (hosted, no local setup)
  { name: 'sentry', type: 'http', url: 'https://mcp.sentry.dev/mcp', cat: 'Monitoring', desc: 'Error tracking and performance monitoring' },
  { name: 'linear', type: 'http', url: 'https://mcp.linear.app/sse', cat: 'Project Mgmt', desc: 'Issue tracking and project management' },
  { name: 'browserbase', type: 'http', url: 'https://mcp.browserbase.com', cat: 'Browser', desc: 'Cloud browser automation' },

  // NPX-based (local, no API key needed)
  { name: 'filesystem', type: 'npx', cmd: '@anthropic-ai/mcp-filesystem', cat: 'Core', desc: 'Read/write files outside project directory' },
  { name: 'memory', type: 'npx', cmd: '@anthropic-ai/mcp-memory', cat: 'Core', desc: 'Persistent memory store across sessions' },
  { name: 'fetch', type: 'npx', cmd: '@anthropic-ai/mcp-fetch', cat: 'Core', desc: 'HTTP fetch for web content' },
  { name: 'playwright', type: 'npx', cmd: '@anthropic-ai/mcp-playwright', cat: 'Browser', desc: 'Browser automation via Playwright' },
  { name: 'puppeteer', type: 'npx', cmd: '@anthropic-ai/mcp-puppeteer', cat: 'Browser', desc: 'Browser automation via Puppeteer' },
  { name: 'postgres', type: 'npx', cmd: '@anthropic-ai/mcp-postgres', cat: 'Database', desc: 'PostgreSQL database access', needsEnv: 'DATABASE_URL' },
  { name: 'sqlite', type: 'npx', cmd: '@anthropic-ai/mcp-sqlite', cat: 'Database', desc: 'SQLite database access' },
  { name: 'github', type: 'npx', cmd: '@anthropic-ai/mcp-github', cat: 'Dev', desc: 'GitHub API integration', needsEnv: 'GITHUB_TOKEN' },
  { name: 'gitlab', type: 'npx', cmd: '@anthropic-ai/mcp-gitlab', cat: 'Dev', desc: 'GitLab API integration', needsEnv: 'GITLAB_TOKEN' },
  { name: 'slack', type: 'npx', cmd: '@anthropic-ai/mcp-slack', cat: 'Communication', desc: 'Slack workspace access', needsEnv: 'SLACK_TOKEN' },
  { name: 'google-drive', type: 'npx', cmd: '@anthropic-ai/mcp-google-drive', cat: 'Cloud', desc: 'Google Drive file access' },
  { name: 'google-maps', type: 'npx', cmd: '@anthropic-ai/mcp-google-maps', cat: 'Cloud', desc: 'Google Maps API', needsEnv: 'GOOGLE_MAPS_API_KEY' },
  { name: 'brave-search', type: 'npx', cmd: '@anthropic-ai/mcp-brave-search', cat: 'Search', desc: 'Web search via Brave', needsEnv: 'BRAVE_API_KEY' },
  { name: 'exa', type: 'npx', cmd: '@anthropic-ai/mcp-exa', cat: 'Search', desc: 'AI-powered web search', needsEnv: 'EXA_API_KEY' },
  { name: 'everart', type: 'npx', cmd: '@anthropic-ai/mcp-everart', cat: 'Creative', desc: 'AI image generation' },
];

function getInstalledMcp() {
  if (!hasCommand('claude')) return [];

  const result = spawnSync('claude', ['mcp', 'list'], {
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
  });

  if (result.status !== 0) return [];

  const output = result.stdout?.toString('utf8') || '';
  // Parse the list output: each line is like "name: type (scope)"
  const servers = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\S+):/);
    if (match) {
      servers.push(match[1]);
    }
  }
  return servers;
}

// ── List ─────────────────────────────────────────────────────────
async function listMcp() {
  console.log('');
  console.log(`  ${c.bold}MCP Servers${c.reset}`);
  console.log('');

  if (!hasCommand('claude')) {
    warn('claude CLI not found');
    return;
  }

  const result = spawnSync('claude', ['mcp', 'list'], {
    stdio: 'inherit', timeout: 15000,
  });

  if (result.status !== 0) {
    warn('Could not list MCP servers');
  }
  console.log('');
}

// ── Install ──────────────────────────────────────────────────────
async function installMcp() {
  console.log('');
  console.log(`  ${c.bold}Install MCP servers${c.reset}`);
  console.log('');

  if (!hasCommand('claude')) {
    fail('claude CLI required');
    return;
  }

  const installed = new Set(getInstalledMcp());

  // Build choices grouped by category
  let lastCat = '';
  const choices = [];

  for (const server of MCP_CATALOG) {
    if (server.cat !== lastCat) {
      lastCat = server.cat;
      choices.push({ title: `${c.bold}── ${server.cat} ──${c.reset}`, value: '__sep__', disabled: true });
    }

    const isInstalled = installed.has(server.name);
    const envHint = server.needsEnv ? ` ${c.yellow}(needs ${server.needsEnv})${c.reset}` : '';
    const installedHint = isInstalled ? ` ${c.green}(installed)${c.reset}` : '';

    choices.push({
      title: `${server.name}${installedHint}${envHint} ${c.dim}— ${server.desc}${c.reset}`,
      value: server.name,
      selected: false,
      disabled: isInstalled,
    });
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select MCP servers to install',
    choices,
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const toInstall = (selected || []).filter(id => !id.startsWith('__'));

  if (toInstall.length === 0) {
    info('Nothing selected');
    return;
  }

  console.log('');

  for (const name of toInstall) {
    const server = MCP_CATALOG.find(s => s.name === name);
    if (!server) continue;

    info(`Installing ${name}...`);

    let result;
    if (server.type === 'http') {
      result = spawnSync('claude', ['mcp', 'add', '--transport', 'http', server.name, server.url], {
        stdio: 'pipe', timeout: 30000,
      });
    } else {
      // npx-based
      const args = ['mcp', 'add', server.name, '--', 'npx', '-y', server.cmd];
      result = spawnSync('claude', args, {
        stdio: 'pipe', timeout: 30000,
      });
    }

    if (result.status === 0) {
      ok(name);
      if (server.needsEnv) {
        warn(`Set ${server.needsEnv} environment variable for ${name} to work`);
      }
    } else {
      const err = result.stderr?.toString().trim() || '';
      fail(`${name}${err ? ` — ${err}` : ''}`);
    }
  }
  console.log('');
}

// ── Remove ───────────────────────────────────────────────────────
async function removeMcp() {
  console.log('');
  console.log(`  ${c.bold}Remove MCP servers${c.reset}`);
  console.log('');

  if (!hasCommand('claude')) {
    fail('claude CLI required');
    return;
  }

  const installed = getInstalledMcp();

  if (installed.length === 0) {
    info('No MCP servers configured');
    return;
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select servers to remove',
    choices: installed.map(name => ({
      title: name,
      value: name,
      selected: false,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('Nothing selected');
    return;
  }

  const { confirm } = await prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${selected.length} server(s)?`,
    initial: false,
  });

  if (!confirm) return;

  console.log('');
  for (const name of selected) {
    const result = spawnSync('claude', ['mcp', 'remove', name], {
      stdio: 'pipe', timeout: 15000,
    });
    if (result.status === 0) {
      ok(`Removed ${name}`);
    } else {
      fail(`Failed to remove ${name}`);
    }
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listMcp();
      break;
    case 'install':
    case 'add':
      await installMcp();
      break;
    case 'remove':
    case 'rm':
      await removeMcp();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}MCP server management${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack mcp${c.reset}               ${c.dim}List configured MCP servers${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack mcp install${c.reset}       ${c.dim}Install from catalog${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack mcp remove${c.reset}        ${c.dim}Remove MCP servers${c.reset}`);
      console.log('');
  }
}
