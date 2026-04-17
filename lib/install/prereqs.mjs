// lib/install/prereqs.mjs — Prerequisites check and header for setup wizard

import { c, ok, fail, warn, info, step, hasCommand, runCmd } from '../shared.mjs';

// ── Header ──────────────────────────────────────────────────────
export function printHeader() {
  console.clear();
  console.log('');
  console.log(`  ${c.magenta}${c.bold}╔════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}║   🧠 Claude Dev Stack — Interactive Setup Wizard  ║${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}╚════════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Installs skills and tools so Claude Code remembers${c.reset}`);
  console.log(`  ${c.dim}your projects, manages sessions, and auto-routes tasks.${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Components: GSD · Obsidian Skills · Deep Research${c.reset}`);
  console.log(`  ${c.dim}NotebookLM · Session Manager · Project Switcher${c.reset}`);
  console.log('');
}

// ── Install hints for missing tools ─────────────────────────────
export const INSTALL_HINTS = {
  git: {
    darwin: 'xcode-select --install',
    linux: 'sudo apt install git   # or: sudo yum install git',
  },
  node: {
    darwin: 'brew install node   # or: https://nodejs.org',
    linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs',
  },
  npm: {
    darwin: 'comes with Node.js — install Node first',
    linux: 'comes with Node.js — install Node first',
  },
  python3: {
    darwin: 'brew install python3   # or: https://python.org',
    linux: 'sudo apt install python3 python3-pip',
  },
  pip: {
    darwin: 'python3 -m ensurepip --upgrade',
    linux: 'sudo apt install python3-pip',
  },
  claude: {
    darwin: 'npm install -g @anthropic-ai/claude-code',
    linux: 'npm install -g @anthropic-ai/claude-code',
  },
};

export function getInstallHint(tool) {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  return INSTALL_HINTS[tool]?.[platform] || '';
}

// ── Step 1: Prerequisites ───────────────────────────────────────
export function checkPrerequisites(totalSteps) {
  step(1, totalSteps, '🔍 Checking prerequisites');

  const required = ['git', 'node', 'npm'];
  const missing = [];

  for (const tool of required) {
    if (hasCommand(tool)) {
      const path = runCmd(`which ${tool}`);
      ok(`${tool} — ${c.dim}${path}${c.reset}`);
    } else {
      fail(`${tool} — not found`);
      const hint = getInstallHint(tool);
      if (hint) info(`Install: ${c.white}${hint}${c.reset}`);
      missing.push(tool);
    }
  }

  // Python
  let pythonCmd = null;
  for (const py of ['python3', 'python']) {
    if (hasCommand(py)) {
      const ver = runCmd(`${py} --version`);
      ok(`${py} — ${c.dim}${ver}${c.reset}`);
      pythonCmd = py;
      break;
    }
  }
  if (!pythonCmd) {
    warn('python — not found (Deep Research & NotebookLM unavailable)');
    info(`Install: ${c.white}${getInstallHint('python3')}${c.reset}`);
  }

  // pip
  let pipCmd = null;
  for (const pip of ['pip3', 'pip']) {
    if (hasCommand(pip)) {
      ok(pip);
      pipCmd = pip;
      break;
    }
  }
  if (!pipCmd && pythonCmd) {
    info('pip — not found (NotebookLM sync skipped, optional)');
  } else if (!pipCmd && !pythonCmd) {
    // No python at all — silently skip pip check, not a required tool
  }

  // Claude Code
  if (hasCommand('claude')) {
    const ver = runCmd('claude --version 2>/dev/null');
    ok(`claude CLI${ver ? ` — ${c.dim}${ver}${c.reset}` : ''}`);
  } else {
    warn('claude CLI — not found (plugin installation will be skipped)');
    info(`Install: ${c.white}${getInstallHint('claude')}${c.reset}`);
  }

  if (missing.length > 0) {
    console.log('');
    fail(`${c.bold}Missing required tools: ${missing.join(', ')}${c.reset}`);
    console.log(`    ${c.dim}Install them and re-run this wizard.${c.reset}`);
    process.exit(1);
  }

  console.log('');
  ok(`${c.bold}All prerequisites met${c.reset}`);
  return { pythonCmd, pipCmd };
}
