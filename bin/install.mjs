#!/usr/bin/env node

/**
 * Claude Dev Stack — Interactive Setup Wizard
 * 
 * Usage: npx claude-dev-stack
 * 
 * Installs: GSD + Obsidian Skills + Deep Research + NotebookLM +
 *           Session Management + Project Switching + Auto-routing
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, readdirSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

// ── Colors ──────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const ok   = (msg) => console.log(`    ${c.green}✔${c.reset} ${msg}`);
const fail = (msg) => console.log(`    ${c.red}✘${c.reset} ${msg}`);
const warn = (msg) => console.log(`    ${c.yellow}⚠${c.reset} ${msg}`);
const info = (msg) => console.log(`    ${c.blue}ℹ${c.reset} ${msg}`);

// ── Readline ────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askDefault(label, explanation, defaultVal) {
  console.log('');
  console.log(`    ${c.bold}${label}${c.reset}`);
  if (explanation) {
    console.log(`    ${c.dim}${explanation}${c.reset}`);
  }
  const suffix = defaultVal ? ` ${c.dim}[${defaultVal}]${c.reset}` : '';
  const answer = await ask(`    → ${suffix} `);
  return answer || defaultVal || '';
}

async function askYN(label, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(`    ${label} ${c.dim}[${hint}]${c.reset} `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ── Helpers ──────────────────────────────────────────────────────
function cmd(command, opts = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch { return null; }
}

function hasCommand(name) {
  return cmd(`which ${name}`) !== null;
}

function mkdirp(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function step(num, total, title) {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Step ${num} of ${total} —${c.reset} ${c.bold}${title}${c.reset}`);
  console.log('');
}

// ── Header ──────────────────────────────────────────────────────
function printHeader() {
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

// ── Step 1: Prerequisites ───────────────────────────────────────
function checkPrerequisites(totalSteps) {
  step(1, totalSteps, '🔍 Checking prerequisites');
  
  const required = ['git', 'node', 'npm'];
  const missing = [];

  for (const tool of required) {
    const path = cmd(`which ${tool}`);
    if (path) {
      ok(`${tool} — ${c.dim}${path}${c.reset}`);
    } else {
      fail(`${tool} — not found`);
      missing.push(tool);
    }
  }

  // Python
  let pythonCmd = null;
  for (const py of ['python3', 'python']) {
    if (hasCommand(py)) {
      const ver = cmd(`${py} --version`);
      ok(`${py} — ${c.dim}${ver}${c.reset}`);
      pythonCmd = py;
      break;
    }
  }
  if (!pythonCmd) warn('python — not found (NotebookLM unavailable)');

  // pip
  let pipCmd = null;
  for (const pip of ['pip3', 'pip']) {
    if (hasCommand(pip)) {
      ok(pip);
      pipCmd = pip;
      break;
    }
  }
  if (!pipCmd) warn('pip — not found (NotebookLM unavailable)');

  // Claude Code
  if (hasCommand('claude')) {
    ok('claude CLI');
  } else {
    warn('claude CLI — not found (install later from docs.claude.com)');
  }

  if (missing.length > 0) {
    console.log('');
    fail(`${c.bold}Missing: ${missing.join(', ')}. Install them and re-run.${c.reset}`);
    process.exit(1);
  }

  console.log('');
  ok(`${c.bold}All prerequisites met${c.reset}`);
  return { pythonCmd, pipCmd };
}

// ── Step 2: Profile ─────────────────────────────────────────────
async function collectProfile(totalSteps) {
  step(2, totalSteps, '👤 Your profile');

  console.log(`    ${c.dim}These answers personalize CLAUDE.md and vault structure.${c.reset}`);
  console.log(`    ${c.dim}Claude Code will use this to know who you are.${c.reset}`);

  const name = await askDefault(
    'Your name',
    'Shows in CLAUDE.md and session logs',
    'Developer'
  );

  const lang = await askDefault(
    'Language you speak with Claude',
    'ru = Russian, en = English, es = Spanish, de = German...',
    'en'
  );

  const codeLang = await askDefault(
    'Language for code comments and git commits',
    null,
    'en'
  );

  const company = await askDefault(
    'Company / team name (optional)',
    'Leave empty to skip',
    ''
  );

  // Projects
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Projects —${c.reset}`);
  console.log('');
  console.log(`    ${c.dim}List projects you actively develop.${c.reset}`);
  console.log(`    ${c.dim}Claude Code will maintain separate context for each.${c.reset}`);
  console.log(`    ${c.dim}Type a name, press Enter. Empty line when done.${c.reset}`);
  console.log(`    ${c.dim}Examples: my-saas, client-app, mobile-backend${c.reset}`);
  console.log('');

  const projects = [];
  while (true) {
    const name = await ask(`    ${c.cyan}+${c.reset} Project: `);
    if (!name) break;
    const clean = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (clean) {
      projects.push(clean);
      ok(`Added: ${clean}`);
    }
  }

  if (projects.length === 0) {
    warn('No projects. Adding "my-project" as default.');
    projects.push('my-project');
  }

  console.log('');
  ok(`Profile: ${c.bold}${name}${c.reset}, ${projects.length} project(s), lang: ${lang}`);

  return { name, lang, codeLang, company, projects };
}

// ── Step 3: Component Selection ─────────────────────────────────
async function selectComponents(totalSteps, hasPip) {
  step(3, totalSteps, '📦 Choose components');

  console.log(`    ${c.dim}Pick what to install. All are optional, all can be added later.${c.reset}`);
  console.log('');

  console.log(`    ${c.bold}Core:${c.reset}`);
  const vault = await askYN('📁 Knowledge Vault (project context, session logs, ADRs)');
  const gsd = await askYN('🚀 GSD — Get Shit Done (spec-driven dev with subagents)');
  const obsidianSkills = await askYN('🔌 Obsidian Skills by kepano (vault format support)');
  const customSkills = await askYN('⚙️  Custom skills (session manager, project switcher, auto-router)');

  console.log('');
  console.log(`    ${c.bold}Research:${c.reset}`);
  const deepResearch = await askYN('🔍 Deep Research (structured web research from terminal)');
  let notebooklm = false;
  if (hasPip) {
    notebooklm = await askYN('📚 NotebookLM (docs-grounded research, needs Google account)', false);
  } else {
    info('NotebookLM skipped — pip not available');
  }

  const count = [vault, gsd, obsidianSkills, customSkills, deepResearch, notebooklm].filter(Boolean).length;
  console.log('');
  ok(`Selected ${c.bold}${count}${c.reset} component(s)`);

  return { vault, gsd, obsidianSkills, customSkills, deepResearch, notebooklm };
}

// ── Step 4: Vault Path ──────────────────────────────────────────
async function getVaultPath(totalSteps) {
  step(4, totalSteps, '📁 Vault location');

  console.log(`    ${c.dim}The vault is a folder of markdown files — your project memory.${c.reset}`);
  console.log(`    ${c.dim}Open it in Obsidian to browse, or let Claude Code read/write.${c.reset}`);

  const raw = await askDefault('Where to create the vault?', null, join(homedir(), 'vault'));
  const vaultPath = raw.replace(/^~/, homedir());

  info(`Vault: ${vaultPath}`);
  return vaultPath;
}

// ── Install: Vault ──────────────────────────────────────────────
function installVault(vaultPath, profile, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📁 Creating knowledge vault');

  mkdirp(join(vaultPath, 'meta'));
  mkdirp(join(vaultPath, 'shared'));
  mkdirp(join(vaultPath, 'research'));

  for (const p of profile.projects) {
    mkdirp(join(vaultPath, 'projects', p, 'decisions'));
    mkdirp(join(vaultPath, 'projects', p, 'sessions'));
  }
  mkdirp(join(vaultPath, 'projects', '_template', 'decisions'));
  mkdirp(join(vaultPath, 'projects', '_template', 'sessions'));

  // Copy templates from package
  const templatesDir = join(PKG_ROOT, 'templates');
  const templateFiles = {
    'project-registry.md': join(vaultPath, 'meta', 'project-registry.md'),
    'session-protocol.md': join(vaultPath, 'meta', 'session-protocol.md'),
    'context-template.md': join(vaultPath, 'projects', '_template', 'context.md'),
    'patterns.md': join(vaultPath, 'shared', 'patterns.md'),
    'infra.md': join(vaultPath, 'shared', 'infra.md'),
  };

  for (const [src, dest] of Object.entries(templateFiles)) {
    const srcPath = join(templatesDir, src);
    if (existsSync(srcPath) && !existsSync(dest)) {
      let content = readFileSync(srcPath, 'utf8');
      content = content.replace(/\{\{USER_NAME\}\}/g, profile.name);
      content = content.replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
      content = content.replace(/\{\{PROJECTS_TABLE\}\}/g,
        profile.projects.map(p => `| ${p} | active | — |`).join('\n')
      );
      writeFileSync(dest, content);
    }
  }

  // Create context.md for each project
  const ctxTemplate = existsSync(join(templatesDir, 'context-template.md'))
    ? readFileSync(join(templatesDir, 'context-template.md'), 'utf8')
    : '# Project: {{PROJECT_NAME}}\n\n## Overview\n\n## Stack\n\n## Current State\n';

  for (const p of profile.projects) {
    const ctx = join(vaultPath, 'projects', p, 'context.md');
    if (!existsSync(ctx)) {
      writeFileSync(ctx, ctxTemplate
        .replace(/\{\{PROJECT_NAME\}\}/g, p)
        .replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0])
      );
    }
  }

  ok(`Vault created with ${profile.projects.length} project(s)`);
  return true;
}

// ── Install: GSD ────────────────────────────────────────────────
function installGSD(stepNum, totalSteps) {
  step(stepNum, totalSteps, '🚀 Installing GSD (Get Shit Done)');

  info('Running npx get-shit-done-cc@latest (may take a minute)...');
  const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
    stdio: 'pipe', timeout: 120000
  });

  if (result.status === 0) {
    ok('GSD installed globally');
    return true;
  } else {
    warn('Auto-install failed. Run manually:');
    info('npx get-shit-done-cc@latest');
    return false;
  }
}

// ── Install: Obsidian Skills ────────────────────────────────────
function installObsidianSkills(skillsDir, stepNum, totalSteps) {
  step(stepNum, totalSteps, '🔌 Installing Obsidian Skills (kepano)');

  const dest = join(skillsDir, 'obsidian');
  mkdirp(skillsDir);

  if (existsSync(dest)) {
    info('Already installed, pulling latest...');
    cmd('git pull --quiet', { cwd: dest });
    ok('Updated');
    return true;
  }

  const result = spawnSync('git', ['clone', '--quiet',
    'https://github.com/kepano/obsidian-skills.git', dest
  ], { stdio: 'pipe', timeout: 60000 });

  if (result.status === 0) {
    ok('Obsidian Skills installed');
    return true;
  } else {
    fail('Clone failed. Try manually:');
    info('git clone https://github.com/kepano/obsidian-skills.git ~/.claude/skills/obsidian');
    return false;
  }
}

// ── Install: Custom Skills ──────────────────────────────────────
function installCustomSkills(skillsDir, stepNum, totalSteps) {
  step(stepNum, totalSteps, '⚙️  Installing custom skills');

  mkdirp(skillsDir);

  const skillsSrcDir = join(PKG_ROOT, 'skills');
  const skillNames = ['session-manager', 'project-switcher', 'dev-router', 'dev-research'];

  for (const name of skillNames) {
    const src = join(skillsSrcDir, name, 'SKILL.md');
    const destDir = join(skillsDir, name);
    mkdirp(destDir);

    if (existsSync(src)) {
      cpSync(src, join(destDir, 'SKILL.md'));
      ok(name);
    } else {
      warn(`${name} — source not found in package`);
    }
  }

  return true;
}

// ── Install: Deep Research ──────────────────────────────────────
function installDeepResearch(skillsDir, agentsDir, stepNum, totalSteps) {
  step(stepNum, totalSteps, '🔍 Installing Deep Research Skills');

  mkdirp(skillsDir);
  mkdirp(agentsDir);

  const tmpDir = `/tmp/deep-research-skills-${process.pid}`;
  const result = spawnSync('git', ['clone', '--quiet',
    'https://github.com/Weizhena/Deep-Research-skills.git', tmpDir
  ], { stdio: 'pipe', timeout: 60000 });

  if (result.status !== 0) {
    fail('Clone failed. Try manually:');
    info('git clone https://github.com/Weizhena/Deep-Research-skills.git');
    return false;
  }

  // Copy skills
  const skillsSrc = join(tmpDir, 'skills', 'research-en');
  if (existsSync(skillsSrc)) {
    for (const item of readdirSync(skillsSrc)) {
      const src = join(skillsSrc, item);
      const dest = join(skillsDir, item);
      cpSync(src, dest, { recursive: true });
    }
  }

  // Copy agent
  const agentSrc = join(tmpDir, 'agents', 'web-search-agent.md');
  if (existsSync(agentSrc)) {
    cpSync(agentSrc, join(agentsDir, 'web-search-agent.md'));
  }

  // Install pyyaml
  cmd('pip3 install pyyaml --break-system-packages 2>/dev/null || pip3 install pyyaml 2>/dev/null || pip install pyyaml 2>/dev/null');

  // Cleanup
  cmd(`rm -rf ${tmpDir}`);

  ok('Deep Research Skills installed');
  return true;
}

// ── Install: NotebookLM ─────────────────────────────────────────
function installNotebookLM(pipCmd, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📚 Installing NotebookLM');

  info('Installing notebooklm-py (this may take a minute)...');
  const result = cmd(`${pipCmd} install "notebooklm-py[browser]" --break-system-packages 2>/dev/null || ${pipCmd} install "notebooklm-py[browser]"`);

  if (result !== null) {
    cmd('playwright install chromium 2>/dev/null');
    cmd('notebooklm skill install 2>/dev/null');
    ok('NotebookLM installed');
    warn('Run "notebooklm login" to authenticate with Google');
    return true;
  } else {
    fail('Install failed. Try: pip install "notebooklm-py[browser]"');
    return false;
  }
}

// ── Generate CLAUDE.md ──────────────────────────────────────────
async function generateClaudeMD(vaultPath, profile, skillsDir, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📝 Generating CLAUDE.md');

  let langLine = '';
  switch (profile.lang) {
    case 'ru': langLine = 'Общение на русском. Код и коммиты на английском.'; break;
    case 'en': langLine = 'Communication in English.'; break;
    default:   langLine = `Communication in ${profile.lang}. Code in English.`; break;
  }

  const companyLine = profile.company ? `\nCompany: ${profile.company}` : '';

  const template = `# CLAUDE.md — Project Intelligence Layer

## Identity
Developer: ${profile.name}${companyLine}
${langLine}

## Auto-Routing (IMPORTANT)
Do NOT ask which tool to use. Determine automatically:
- First message in session → load context (session-manager)
- Development task → GSD (/gsd:quick for small, /gsd:plan-phase for large)
- Research/comparison → deep-research
- Different project mentioned → project-switcher
- End of work ("done", "всё", "хватит") → session-manager /end
If .planning/ exists → project uses GSD, respect its state.

## Knowledge Base
Before starting, ALWAYS read:
1. \`cat ${vaultPath}/projects/THIS_PROJECT/context.md\`
2. Last 3 session logs from \`${vaultPath}/projects/THIS_PROJECT/sessions/\`

## Session Protocol
- Start: read context + propose continuation from last TODO
- During: ADR for decisions, Known Issues for bugs, shared/patterns.md for reusables
- End ("done"/"всё"/"хватит"): create session log, update context.md

## Code Style
- Commits: conventional commits (feat:, fix:, chore:)
- Code and comments in ${profile.codeLang}
- Communication in ${profile.lang}

## Rules
- Do NOT delete code without explicit request
- On .env change → update .env.example
- On new dependency → explain in session log

## References
- Vault: \`${vaultPath}/\`
- Registry: \`${vaultPath}/meta/project-registry.md\`
- Patterns: \`${vaultPath}/shared/patterns.md\`
- Skills: \`${skillsDir}/\`
`;

  // Save template
  const templatePath = join(vaultPath, 'CLAUDE.md.template');
  writeFileSync(templatePath, template);
  ok(`Template: ${templatePath}`);

  // Offer to install into projects
  console.log('');
  const installNow = await askYN('Install CLAUDE.md into your project directories now?');

  if (installNow) {
    for (const project of profile.projects) {
      const defaultPath = join(homedir(), 'projects', project);
      const dir = await askDefault(
        `Path to "${project}" source code`,
        'Where the code repo lives on disk',
        defaultPath
      );
      const resolved = dir.replace(/^~/, homedir());

      if (existsSync(resolved)) {
        writeFileSync(
          join(resolved, 'CLAUDE.md'),
          template.replace(/THIS_PROJECT/g, project)
        );
        ok(`${project} → CLAUDE.md installed`);
      } else {
        warn(`${resolved} doesn't exist yet — skipped`);
        info(`Copy CLAUDE.md manually later from: ${templatePath}`);
      }
    }
  } else {
    info(`Install later: copy ${templatePath} to each project root`);
  }
}

// ── Summary ─────────────────────────────────────────────────────
function printSummary(installed, failed, vaultPath, profile) {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}╔════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}║            ✅ Setup Complete!                      ║${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}╚════════════════════════════════════════════════════╝${c.reset}`);
  console.log('');

  if (installed.length > 0) {
    console.log(`  ${c.green}${c.bold}Installed:${c.reset}`);
    for (const name of installed) console.log(`    ${c.green}✔${c.reset} ${name}`);
  }

  if (failed.length > 0) {
    console.log('');
    console.log(`  ${c.red}${c.bold}Failed:${c.reset}`);
    for (const name of failed) console.log(`    ${c.red}✘${c.reset} ${name}`);
  }

  console.log('');
  console.log(`  ${c.bold}What to do next:${c.reset}`);
  console.log('');
  console.log(`    ${c.cyan}1.${c.reset} ${c.bold}Fill in context.md for each project:${c.reset}`);
  for (const p of profile.projects) {
    console.log(`       ${c.dim}${vaultPath}/projects/${p}/context.md${c.reset}`);
  }
  console.log('');
  console.log(`    ${c.cyan}2.${c.reset} Open Claude Code in any project:`);
  console.log(`       ${c.white}cd ~/projects/your-project && claude${c.reset}`);
  console.log('');
  console.log(`    ${c.cyan}3.${c.reset} Just talk naturally:`);
  console.log(`       ${c.dim}"hi, let's continue"      → loads context${c.reset}`);
  console.log(`       ${c.dim}"build X"                 → GSD plans & executes${c.reset}`);
  console.log(`       ${c.dim}"research Y"              → deep web research${c.reset}`);
  console.log(`       ${c.dim}"done for today"          → logs session${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Vault: ${vaultPath}${c.reset}`);
  console.log(`  ${c.dim}Skills: ${join(homedir(), '.claude', 'skills')}${c.reset}`);
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const skillsDir = join(homedir(), '.claude', 'skills');
  const agentsDir = join(homedir(), '.claude', 'agents');
  const totalSteps = 10;

  printHeader();

  if (!(await askYN('Ready to start?'))) {
    console.log(`\n  ${c.dim}No changes made. Run again when ready.${c.reset}\n`);
    rl.close();
    return;
  }

  const { pythonCmd, pipCmd } = checkPrerequisites(totalSteps);
  const profile = await collectProfile(totalSteps);
  const components = await selectComponents(totalSteps, !!pipCmd);
  const vaultPath = await getVaultPath(totalSteps);

  const installed = [];
  const failed = [];
  let stepNum = 5;

  if (components.vault) {
    installVault(vaultPath, profile, stepNum++, totalSteps) ? installed.push('Knowledge Vault') : failed.push('Vault');
  }
  if (components.gsd) {
    installGSD(stepNum++, totalSteps) ? installed.push('GSD (Get Shit Done)') : failed.push('GSD');
  }
  if (components.obsidianSkills) {
    installObsidianSkills(skillsDir, stepNum++, totalSteps) ? installed.push('Obsidian Skills (kepano)') : failed.push('Obsidian Skills');
  }
  if (components.customSkills) {
    installCustomSkills(skillsDir, stepNum++, totalSteps) ? installed.push('Custom skills (sessions, projects, router)') : failed.push('Custom skills');
  }
  if (components.deepResearch) {
    installDeepResearch(skillsDir, agentsDir, stepNum++, totalSteps) ? installed.push('Deep Research') : failed.push('Deep Research');
  }
  if (components.notebooklm) {
    installNotebookLM(pipCmd, stepNum++, totalSteps) ? installed.push('NotebookLM') : failed.push('NotebookLM');
  }

  await generateClaudeMD(vaultPath, profile, skillsDir, stepNum, totalSteps);

  printSummary(installed, failed, vaultPath, profile);

  rl.close();
}

main().catch((err) => {
  console.error(`\n  ${c.red}Error: ${err.message}${c.reset}\n`);
  process.exit(1);
});
