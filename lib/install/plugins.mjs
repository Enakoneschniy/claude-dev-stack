// lib/install/plugins.mjs — Claude Code plugin selection and installation

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { c, ok, fail, warn, info, prompt, step, hasCommand, spawnSync } from '../shared.mjs';

// ── Step 5: Claude Plugins ──────────────────────────────────────

function loadPluginData() {
  if (!hasCommand('claude')) return null;

  // Save to temp file to avoid pipe truncation at 64KB
  const tmpFile = `/tmp/claude-plugins-${process.pid}.json`;
  const result = spawnSync('claude', ['plugin', 'list', '--available', '--json'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });

  if (result.status !== 0) return null;

  try {
    const raw = result.stdout.toString('utf8');
    return JSON.parse(raw);
  } catch {
    // If stdout was truncated, try via temp file
    spawnSync('sh', ['-c', `claude plugin list --available --json > ${tmpFile}`], {
      stdio: 'pipe', timeout: 30000,
    });
    try {
      const content = readFileSync(tmpFile, 'utf8');
      try { unlinkSync(tmpFile); } catch {}
      return JSON.parse(content);
    } catch {
      try { unlinkSync(tmpFile); } catch {}
      return null;
    }
  }
}

export async function selectAndInstallPlugins(stepNum, totalSteps, detectedUseCase) {
  step(stepNum, totalSteps, '🔌 Claude Code plugins');

  if (!hasCommand('claude')) {
    warn('claude CLI not found — skipping plugin installation');
    info('Install Claude Code first, then run: claude plugin install <name>');
    return { installed: [], failed: [] };
  }

  info('Loading plugin marketplace...');
  const data = loadPluginData();

  if (!data) {
    warn('Could not load plugin data from claude CLI');
    return { installed: [], failed: [] };
  }

  const installedList = data.installed || [];
  const available = data.available || [];

  if (available.length === 0 && installedList.length === 0) {
    warn('No plugins found in marketplace');
    return { installed: [], failed: [] };
  }

  // Auto-install superpowers (essential for auto-triggered workflows)
  const hasSuperpowers = installedList.some(p => p.id.startsWith('superpowers@'));
  if (!hasSuperpowers) {
    info('Installing superpowers (essential for auto-invoked skills)...');
    const result = spawnSync('claude', ['plugin', 'install', 'superpowers@claude-plugins-official'], {
      stdio: 'pipe', timeout: 60000,
    });
    if (result.status === 0) {
      ok('superpowers installed');
    } else {
      warn('superpowers auto-install failed — install manually: claude plugin install superpowers');
    }
    console.log('');
  } else {
    info(`${c.dim}superpowers already installed${c.reset}`);
  }

  // Show already installed count (available list already excludes them)
  if (installedList.length > 0) {
    info(`${installedList.length} plugin(s) already installed:`);
    for (const p of installedList) {
      const name = p.id.split('@')[0];
      console.log(`      ${c.green}✔${c.reset} ${name}`);
    }
  }

  if (available.length === 0) {
    info('All available plugins already installed');
    return { installed: [], failed: [] };
  }
  console.log('');

  // Ask about use-case to recommend relevant plugins
  const USE_CASE_PLUGINS = {
    fullstack: ['supabase', 'prisma', 'firebase', 'vercel', 'netlify', 'stripe', 'playwright', 'stagehand'],
    frontend: ['playwright', 'stagehand', 'vercel', 'netlify', 'expo', 'figma'],
    backend: ['supabase', 'prisma', 'firebase', 'mongodb', 'cockroachdb', 'railway', 'stripe'],
    mobile: ['expo', 'firebase', 'figma', 'rc'],
    data: ['supabase', 'prisma', 'mongodb', 'planetscale', 'neon', 'cockroachdb', 'posthog'],
    devops: ['terraform', 'railway', 'deploy-on-aws', 'aws-serverless', 'vercel', 'netlify'],
    any: [],
  };

  const USE_CASE_LABELS = {
    fullstack: 'Full-stack web development',
    frontend: 'Frontend / UI',
    backend: 'Backend / API',
    mobile: 'Mobile apps',
    data: 'Data / ML',
    devops: 'DevOps / Infrastructure',
    any: 'Mixed / Other',
  };

  // DX-10: pre-fill use case from previously saved profile
  const useCaseChoices = [
    { title: 'Full-stack web development', value: 'fullstack' },
    { title: 'Frontend / UI', value: 'frontend' },
    { title: 'Backend / API', value: 'backend' },
    { title: 'Mobile apps', value: 'mobile' },
    { title: 'Data / ML', value: 'data' },
    { title: 'DevOps / Infrastructure', value: 'devops' },
    { title: 'Mixed / Other', value: 'any' },
  ];
  const initialUseCaseIdx = detectedUseCase
    ? Math.max(0, useCaseChoices.findIndex(c => c.value === detectedUseCase))
    : 0;
  if (detectedUseCase && USE_CASE_LABELS[detectedUseCase]) {
    info(`Use case: ${c.bold}${USE_CASE_LABELS[detectedUseCase]}${c.reset} (from previous install)`);
  }

  const { useCase } = await prompt({
    type: 'select',
    name: 'useCase',
    message: 'What do you mainly work on?',
    choices: useCaseChoices,
    initial: initialUseCaseIdx,
  });

  const recommended = new Set(USE_CASE_PLUGINS[useCase || 'any'] || []);
  console.log('');

  // Sort: recommended first, then by popularity
  const sorted = [...available].sort((a, b) => {
    const aRec = recommended.has(a.name) ? 1 : 0;
    const bRec = recommended.has(b.name) ? 1 : 0;
    if (aRec !== bRec) return bRec - aRec;
    return (b.installCount || 0) - (a.installCount || 0);
  });

  // Build choices — pre-select recommended for the use-case
  const choices = sorted.map(p => {
    const isRec = recommended.has(p.name);
    const tag = isRec ? `${c.cyan}★${c.reset} ` : '  ';
    return {
      title: `${tag}${p.name} ${c.dim}— ${(p.description || '').slice(0, 60)}${c.reset}`,
      value: p.pluginId,
      selected: isRec,
    };
  });

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select plugins to install (space to toggle)',
    choices,
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const toInstall = (selected || []).filter(id => !id.startsWith('__'));

  if (toInstall.length === 0) {
    info('No new plugins to install');
    return { installed: [], failed: [], useCase };
  }

  console.log('');
  info(`Installing ${toInstall.length} plugin(s)...`);

  const installed = [];
  const failed = [];

  for (const pluginId of toInstall) {
    const result = spawnSync('claude', ['plugin', 'install', pluginId], {
      stdio: 'pipe', timeout: 60000,
    });

    if (result.status === 0) {
      ok(pluginId);
      installed.push(pluginId);
    } else {
      const stderr = result.stderr ? result.stderr.toString().trim() : '';
      fail(`${pluginId}${stderr ? ` — ${stderr}` : ''}`);
      failed.push(pluginId);
    }
  }

  return { installed, failed, useCase };
}
