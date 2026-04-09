/**
 * Plugin management — install, list, presets, third-party marketplaces.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { c, ok, fail, warn, info, prompt, hasCommand, CLAUDE_DIR, spawnSync } from './shared.mjs';

// ── Presets ──────────────────────────────────────────────────────
const PRESETS = {
  fullstack: {
    name: 'Full-Stack Web',
    plugins: [
      'supabase', 'prisma', 'firebase', 'vercel', 'netlify-skills',
      'stripe', 'playwright', 'stagehand', 'posthog',
    ],
  },
  frontend: {
    name: 'Frontend / UI',
    plugins: [
      'playwright', 'stagehand', 'vercel', 'netlify-skills',
      'expo', 'figma', 'posthog',
    ],
  },
  backend: {
    name: 'Backend / API',
    plugins: [
      'supabase', 'prisma', 'firebase', 'mongodb', 'neon',
      'cockroachdb', 'planetscale', 'railway', 'stripe', 'postman',
    ],
  },
  mobile: {
    name: 'Mobile',
    plugins: ['expo', 'firebase', 'figma', 'rc', 'revenuecat'],
  },
  data: {
    name: 'Data / ML',
    plugins: [
      'supabase', 'prisma', 'mongodb', 'planetscale', 'neon',
      'cockroachdb', 'posthog', 'pinecone', 'huggingface-skills',
    ],
  },
  devops: {
    name: 'DevOps / Infrastructure',
    plugins: [
      'terraform', 'railway', 'deploy-on-aws', 'aws-serverless',
      'vercel', 'netlify-skills', 'pagerduty',
    ],
  },
};

// ── Third-party marketplaces ─────────────────────────────────────
const KNOWN_MARKETPLACES = [
  // Core / Official
  { name: 'superpowers-marketplace', repo: 'obra/superpowers-marketplace', desc: 'Curated plugins: TDD, debugging, episodic memory, Chrome control' },
  { name: 'superpowers-dev', repo: 'obra/superpowers', desc: 'Superpowers core skills: TDD, debugging, collaboration patterns' },
  { name: 'anthropic-agent-skills', repo: 'anthropics/skills', desc: 'Official Anthropic skills: document processing, examples' },
  // Subagent collections
  { name: 'voltagent-subagents', repo: 'VoltAgent/awesome-claude-code-subagents', desc: 'VoltAgent specialized subagents (core-dev, research, infra, lang)' },
  { name: 'cc-marketplace', repo: 'ananddtyagi/cc-marketplace', desc: '50+ agents: backend, frontend, security, analytics, devops' },
  { name: 'claude-night-market', repo: 'athola/claude-night-market', desc: 'Attune, memory-palace, sanctum, spec-kit plugins' },
  // Domain-specific
  { name: 'supabase-agent-skills', repo: 'supabase/agent-skills', desc: 'Supabase Postgres best practices and skills' },
  { name: 'payload-marketplace', repo: 'payloadcms/payload', desc: 'Payload CMS: collections, hooks, access control' },
  { name: 'microsoft-docs-mcp', repo: 'MicrosoftDocs/mcp', desc: 'Microsoft docs: Azure, .NET, Windows API references' },
  { name: 'claude-marketplace-elixir', repo: 'bradleygolden/claude-marketplace-elixir', desc: 'Elixir/Phoenix: Credo, Dialyzer, Sobelow, ExUnit' },
  { name: 'claude-code-lsps', repo: 'Piebald-AI/claude-code-lsps', desc: 'LSP servers for 20+ languages (Rust, Go, Java, etc.)' },
  // Workflow & templates
  { name: 'claude-code-templates', repo: 'davila7/claude-code-templates', desc: 'DevOps, testing, project management, Next.js templates' },
  { name: 'awesome-claude-skills', repo: 'ComposioHQ/awesome-claude-skills', desc: '107+ skills: business, dev, productivity integrations' },
  { name: 'claude-skills-marketplace', repo: 'adrianpuiu/claude-skills-marketplace', desc: 'Community skill marketplace with validation' },
  { name: 'happy-claude-skills', repo: 'iamzhihuix/happy-claude-skills', desc: 'Browser automation, video processing, WeChat writing' },
  // Niche
  { name: 'obsidian-skills', repo: 'kepano/obsidian-skills', desc: 'Obsidian vault format support by kepano' },
  { name: 'hcp-terraform-skills', repo: 'hashicorp/hcp-terraform-skills', desc: 'HashiCorp Terraform Cloud skills' },
  { name: 'n8n-skills', repo: 'czlonkowski/n8n-skills', desc: 'n8n workflow automation skills' },
  { name: 'sap-skills', repo: 'secondsky/sap-skills', desc: 'SAP development skills' },
];

function getInstalledMarketplaces() {
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  if (!existsSync(settingsPath)) return new Set();

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const extra = settings.extraKnownMarketplaces || {};
    const known = join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json');
    const knownData = existsSync(known) ? JSON.parse(readFileSync(known, 'utf8')) : {};
    return new Set([...Object.keys(extra), ...Object.keys(knownData)]);
  } catch {
    return new Set();
  }
}

function loadPluginData() {
  if (!hasCommand('claude')) return null;

  try {
    const raw = execFileSync('claude', ['plugin', 'list', '--available', '--json'], {
      encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 30000,
    });
    return JSON.parse(raw);
  } catch {
    // Fallback: write to temp file
    const tmpFile = `/tmp/claude-plugins-${process.pid}.json`;
    spawnSync('sh', ['-c', `claude plugin list --available --json > ${tmpFile}`], {
      stdio: 'pipe', timeout: 30000,
    });
    try {
      const content = readFileSync(tmpFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

// ── List plugins ─────────────────────────────────────────────────
async function listPlugins() {
  console.log('');
  console.log(`  ${c.bold}Installed plugins${c.reset}`);
  console.log('');

  if (!hasCommand('claude')) {
    warn('claude CLI not found');
    return;
  }

  try {
    const tmpFile = `/tmp/claude-plugins-list-${process.pid}.json`;
    spawnSync('sh', ['-c', `claude plugin list --json > ${tmpFile}`], {
      stdio: 'pipe', timeout: 15000,
    });
    const raw = readFileSync(tmpFile, 'utf8');
    const plugins = JSON.parse(raw);

    const enabled = plugins.filter(p => p.enabled !== false);
    const disabled = plugins.filter(p => p.enabled === false);

    if (enabled.length > 0) {
      for (const p of enabled) {
        const name = p.id.split('@')[0];
        const mkt = p.id.split('@')[1] || '';
        const mktHint = mkt !== 'claude-plugins-official' ? ` ${c.dim}@${mkt}${c.reset}` : '';
        console.log(`    ${c.green}✔${c.reset} ${name}${mktHint}`);
      }
    }

    if (disabled.length > 0) {
      console.log('');
      info('Disabled:');
      for (const p of disabled) {
        console.log(`    ${c.dim}○ ${p.id.split('@')[0]}${c.reset}`);
      }
    }

    console.log('');
    info(`${enabled.length} enabled, ${disabled.length} disabled`);
  } catch {
    warn('Could not load plugin list');
  }
  console.log('');
}

// ── Install with presets ─────────────────────────────────────────
async function installPlugins() {
  console.log('');
  console.log(`  ${c.bold}Install plugins${c.reset}`);
  console.log('');

  if (!hasCommand('claude')) {
    fail('claude CLI required for plugin management');
    info('Install: npm install -g @anthropic-ai/claude-code');
    return;
  }

  // Offer presets or manual selection
  const { mode } = await prompt({
    type: 'select',
    name: 'mode',
    message: 'How would you like to install?',
    choices: [
      { title: `Use a preset ${c.dim}(recommended sets for your stack)${c.reset}`, value: 'preset' },
      { title: `Browse all available ${c.dim}(full marketplace)${c.reset}`, value: 'browse' },
    ],
  });

  if (mode === 'preset') {
    await installFromPreset();
  } else {
    await installFromBrowse();
  }
}

async function installFromPreset() {
  const { preset } = await prompt({
    type: 'select',
    name: 'preset',
    message: 'Choose a preset',
    choices: Object.entries(PRESETS).map(([key, val]) => ({
      title: `${val.name} ${c.dim}(${val.plugins.length} plugins)${c.reset}`,
      value: key,
    })),
  });

  if (!preset) return;

  const presetData = PRESETS[preset];
  info(`${presetData.name} preset: ${presetData.plugins.join(', ')}`);
  console.log('');

  const { confirm } = await prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Install ${presetData.plugins.length} plugins?`,
    initial: true,
  });

  if (!confirm) return;

  console.log('');
  for (const name of presetData.plugins) {
    const result = spawnSync('claude', ['plugin', 'install', name], {
      stdio: 'pipe', timeout: 60000,
    });
    if (result.status === 0) {
      ok(name);
    } else {
      const err = result.stderr?.toString().trim() || '';
      if (err.includes('already installed')) {
        info(`${name} ${c.dim}(already installed)${c.reset}`);
      } else {
        warn(`${name} — ${err || 'install failed'}`);
      }
    }
  }
  console.log('');
}

async function installFromBrowse() {
  info('Loading marketplace...');
  const data = loadPluginData();

  if (!data) {
    fail('Could not load plugin data');
    return;
  }

  const available = data.available || [];
  const installedList = data.installed || [];

  if (installedList.length > 0) {
    info(`${installedList.length} already installed`);
  }

  if (available.length === 0) {
    info('All plugins already installed');
    return;
  }

  console.log('');

  const sorted = [...available].sort((a, b) => (b.installCount || 0) - (a.installCount || 0));

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select plugins (space to toggle)',
    choices: sorted.map(p => ({
      title: `${p.name} ${c.dim}— ${(p.description || '').slice(0, 55)}${c.reset}`,
      value: p.pluginId,
      selected: false,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const toInstall = selected || [];
  if (toInstall.length === 0) {
    info('Nothing selected');
    return;
  }

  console.log('');
  for (const pluginId of toInstall) {
    const result = spawnSync('claude', ['plugin', 'install', pluginId], {
      stdio: 'pipe', timeout: 60000,
    });
    if (result.status === 0) {
      ok(pluginId);
    } else {
      fail(pluginId);
    }
  }
  console.log('');
}

// ── Third-party marketplaces ─────────────────────────────────────
async function manageMarketplaces() {
  console.log('');
  console.log(`  ${c.bold}Third-party marketplaces${c.reset}`);
  console.log('');

  const installed = getInstalledMarketplaces();

  for (const mkt of KNOWN_MARKETPLACES) {
    const isInstalled = installed.has(mkt.name);
    const status = isInstalled ? `${c.green}✔${c.reset}` : `${c.dim}○${c.reset}`;
    console.log(`    ${status} ${c.bold}${mkt.name}${c.reset} ${c.dim}(${mkt.repo})${c.reset}`);
    console.log(`      ${c.dim}${mkt.desc}${c.reset}`);
  }

  const notInstalled = KNOWN_MARKETPLACES.filter(m => !installed.has(m.name));

  if (notInstalled.length === 0) {
    console.log('');
    ok('All known marketplaces installed');
    console.log('');
    return;
  }

  console.log('');
  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Add marketplaces',
    choices: notInstalled.map(m => ({
      title: `${m.name} ${c.dim}— ${m.desc}${c.reset}`,
      value: m.name,
      selected: true,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('Nothing selected');
    return;
  }

  // Add to settings.json
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  }

  if (!settings.extraKnownMarketplaces) {
    settings.extraKnownMarketplaces = {};
  }

  for (const name of selected) {
    const mkt = KNOWN_MARKETPLACES.find(m => m.name === name);
    if (!mkt) continue;

    settings.extraKnownMarketplaces[name] = {
      source: { source: 'github', repo: mkt.repo },
    };
    ok(`Added ${name}`);
  }

  const { writeFileSync } = await import('fs');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  ok('settings.json updated');

  console.log('');
  info('Restart Claude Code for changes to take effect.');
  info('Then install plugins from new marketplaces with: claude-dev-stack plugins install');
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listPlugins();
      break;
    case 'install':
    case 'add':
      await installPlugins();
      break;
    case 'presets':
    case 'preset':
      await installFromPreset();
      break;
    case 'marketplaces':
    case 'marketplace':
      await manageMarketplaces();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}Plugin management${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack plugins${c.reset}               ${c.dim}List installed plugins${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack plugins install${c.reset}        ${c.dim}Install (preset or browse)${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack plugins presets${c.reset}        ${c.dim}Install from a preset${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack plugins marketplaces${c.reset}   ${c.dim}Add third-party marketplaces${c.reset}`);
      console.log('');
  }
}
