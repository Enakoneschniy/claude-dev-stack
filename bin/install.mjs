#!/usr/bin/env node

/**
 * Claude Dev Stack — Interactive Setup Wizard
 *
 * Usage: npx claude-dev-stack
 *
 * Installs: GSD + Obsidian Skills + Deep Research + NotebookLM +
 *           Session Management + Project Switching + Auto-routing
 */

import prompts from 'prompts';
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

// ── Ctrl+C ─────────────────────────────────────────────────────
const onCancel = () => {
  console.log(`\n  ${c.dim}Aborted. No changes made.${c.reset}\n`);
  process.exit(0);
};

/** Wrap a prompts() call so Ctrl+C always exits */
async function prompt(questions, opts) {
  return prompts(questions, { onCancel, ...opts });
}

// ── Helpers ──────────────────────────────────────────────────────
function runCmd(command, opts = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch { return null; }
}

function hasCommand(name) {
  return runCmd(`which ${name}`) !== null;
}

function mkdirp(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function step(num, total, title) {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}— Step ${num} of ${total} —${c.reset} ${c.bold}${title}${c.reset}`);
  console.log('');
}

// ── Path input with tab completion ─────────────────────────────
function askPath(message, defaultVal) {
  return new Promise((res) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line) => {
        const expanded = (line || '').replace(/^~/, homedir());
        const dir = expanded.endsWith('/') ? expanded : dirname(expanded);
        const prefix = expanded.endsWith('/') ? '' : basename(expanded);

        try {
          const entries = readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'));

          const matches = entries
            .filter(e => !prefix || e.name.startsWith(prefix))
            .map(e => {
              const full = join(dir, e.name) + '/';
              return line.startsWith('~') ? full.replace(homedir(), '~') : full;
            });

          return [matches.length ? matches : [line], line];
        } catch {
          return [[line], line];
        }
      },
    });

    const hint = defaultVal ? `${c.dim}[${defaultVal}]${c.reset} ` : '';
    rl.question(`    ${c.cyan}→${c.reset} ${hint}`, (answer) => {
      rl.close();
      res(answer || defaultVal || '');
    });
  });
}

// ── List subdirectories ────────────────────────────────────────
function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => ({ name: e.name, path: join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
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
    const path = runCmd(`which ${tool}`);
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
      const ver = runCmd(`${py} --version`);
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
  console.log('');

  const profile = await prompt([
    {
      type: 'text',
      name: 'name',
      message: 'Your name',
      initial: 'Developer',
    },
    {
      type: 'text',
      name: 'lang',
      message: 'Communication language (ru/en/es/de...)',
      initial: 'en',
    },
    {
      type: 'text',
      name: 'codeLang',
      message: 'Code comments & git commits language',
      initial: 'en',
    },
    {
      type: 'text',
      name: 'company',
      message: 'Company / team name (enter to skip)',
      initial: '',
    },
  ]);

  console.log('');
  ok(`Profile: ${c.bold}${profile.name}${c.reset}, lang: ${profile.lang}`);

  return profile;
}

// ── Step 3: Projects ────────────────────────────────────────────
async function collectProjects(totalSteps) {
  step(3, totalSteps, '📂 Projects');

  console.log(`    ${c.dim}Claude Code will maintain separate context for each project.${c.reset}`);
  console.log('');

  const { hasBaseDir } = await prompt({
    type: 'confirm',
    name: 'hasBaseDir',
    message: 'Are your projects in one directory? (e.g. ~/Projects)',
    initial: true,
  });

  const projects = [];
  let resolvedBase = null;

  if (hasBaseDir) {
    // ── Mode A: scan base directory, pick folders ──
    console.log('');
    console.log(`    ${c.dim}Press Tab to autocomplete path.${c.reset}`);
    const baseDir = await askPath('Projects directory', join(homedir(), 'Projects'));
    resolvedBase = baseDir.replace(/^~/, homedir());

    const dirs = listDirs(resolvedBase);

    if (dirs.length === 0) {
      warn(`No subdirectories found in ${resolvedBase.replace(homedir(), '~')}`);
    } else {
      console.log('');
      const { selected } = await prompt({
        type: 'multiselect',
        name: 'selected',
        message: 'Select project directories',
        choices: dirs.map(d => ({ title: d.name, value: d.path, selected: false })),
        instructions: false,
        hint: '↑↓ navigate, space toggle, enter confirm',
      });

      const sel = selected || [];

      // Ask project name for each selected directory
      for (const dirPath of sel) {
        const dirName = basename(dirPath);
        const defaultName = dirName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const { name } = await prompt({
          type: 'text',
          name: 'name',
          message: `Project name for ${c.cyan}${dirName}${c.reset}`,
          initial: defaultName,
        });

        const clean = (name || defaultName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        projects.push({ name: clean, path: dirPath });
        ok(`${clean} → ${c.dim}${dirPath.replace(homedir(), '~')}${c.reset}`);
      }
    }

    // Offer to add more manually
    const { addMore } = await prompt({
      type: 'confirm',
      name: 'addMore',
      message: 'Add more projects from other locations?',
      initial: false,
    });

    if (addMore) {
      await addProjectsManually(projects);
    }
  } else {
    // ── Mode B: add projects one by one with full paths ──
    console.log('');
    console.log(`    ${c.dim}Add projects one by one. Press Tab to autocomplete paths.${c.reset}`);
    console.log(`    ${c.dim}Enter empty name to finish.${c.reset}`);
    console.log('');

    await addProjectsManually(projects);
  }

  if (projects.length === 0) {
    warn('No projects added. Adding "my-project" as default.');
    projects.push({ name: 'my-project', path: null });
  }

  console.log('');
  ok(`${c.bold}${projects.length} project(s)${c.reset} configured`);

  return { baseDir: resolvedBase, projects };
}

async function addProjectsManually(projects) {
  while (true) {
    const { name } = await prompt({
      type: 'text',
      name: 'name',
      message: 'Project name (enter to finish)',
    });

    if (!name) break;

    const clean = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!clean) continue;

    console.log(`    ${c.dim}Tab to autocomplete path:${c.reset}`);
    const p = await askPath(`Path to ${clean}`, '');

    if (p) {
      const resolved = p.replace(/^~/, homedir()).replace(/\/+$/, '');
      if (existsSync(resolved)) {
        projects.push({ name: clean, path: resolved });
        ok(`${clean} → ${c.dim}${resolved.replace(homedir(), '~')}${c.reset}`);
      } else {
        warn(`${resolved.replace(homedir(), '~')} does not exist`);
        projects.push({ name: clean, path: null });
        ok(`${clean} ${c.dim}(path not set)${c.reset}`);
      }
    } else {
      projects.push({ name: clean, path: null });
      ok(`${clean} ${c.dim}(path not set)${c.reset}`);
    }
  }
}

// ── Step 4: Component Selection ─────────────────────────────────
async function selectComponents(totalSteps, hasPip) {
  step(4, totalSteps, '📦 Choose components');

  const choices = [
    { title: '📁 Knowledge Vault (project context, session logs, ADRs)', value: 'vault', selected: true },
    { title: '🚀 GSD — Get Shit Done (spec-driven dev with subagents)', value: 'gsd', selected: true },
    { title: '🔌 Obsidian Skills by kepano (vault format support)', value: 'obsidianSkills', selected: true },
    { title: '⚙️  Custom skills (session manager, project switcher, auto-router)', value: 'customSkills', selected: true },
    { title: '🔍 Deep Research (structured web research from terminal)', value: 'deepResearch', selected: true },
  ];

  if (hasPip) {
    choices.push({
      title: '📚 NotebookLM (docs-grounded research, needs Google account)',
      value: 'notebooklm',
      selected: false,
    });
  } else {
    info('NotebookLM skipped — pip not available');
    console.log('');
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select components',
    choices,
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const sel = selected || [];
  console.log('');
  ok(`Selected ${c.bold}${sel.length}${c.reset} component(s)`);

  return {
    vault: sel.includes('vault'),
    gsd: sel.includes('gsd'),
    obsidianSkills: sel.includes('obsidianSkills'),
    customSkills: sel.includes('customSkills'),
    deepResearch: sel.includes('deepResearch'),
    notebooklm: sel.includes('notebooklm'),
  };
}

// ── Step 5: Vault Path ──────────────────────────────────────────
async function getVaultPath(totalSteps) {
  step(5, totalSteps, '📁 Vault location');

  console.log(`    ${c.dim}The vault is a folder of markdown files — your project memory.${c.reset}`);
  console.log(`    ${c.dim}Open it in Obsidian to browse, or let Claude Code read/write.${c.reset}`);
  console.log(`    ${c.dim}Press Tab to autocomplete path.${c.reset}`);
  console.log('');

  const raw = await askPath('Vault path', join(homedir(), 'vault'));
  const vaultPath = raw.replace(/^~/, homedir());

  info(`Vault: ${vaultPath}`);
  return vaultPath;
}

// ── Install: Vault ──────────────────────────────────────────────
function installVault(vaultPath, projectsData, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📁 Creating knowledge vault');

  mkdirp(join(vaultPath, 'meta'));
  mkdirp(join(vaultPath, 'shared'));
  mkdirp(join(vaultPath, 'research'));

  const projectNames = projectsData.projects.map(p => p.name);

  for (const name of projectNames) {
    mkdirp(join(vaultPath, 'projects', name, 'decisions'));
    mkdirp(join(vaultPath, 'projects', name, 'sessions'));
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
      content = content.replace(/\{\{USER_NAME\}\}/g, projectsData._profileName || 'Developer');
      content = content.replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
      content = content.replace(/\{\{PROJECTS_TABLE\}\}/g,
        projectNames.map(p => `| ${p} | active | — |`).join('\n')
      );
      writeFileSync(dest, content);
    }
  }

  // Create context.md for each project
  const ctxTemplate = existsSync(join(templatesDir, 'context-template.md'))
    ? readFileSync(join(templatesDir, 'context-template.md'), 'utf8')
    : '# Project: {{PROJECT_NAME}}\n\n## Overview\n\n## Stack\n\n## Current State\n';

  for (const name of projectNames) {
    const ctx = join(vaultPath, 'projects', name, 'context.md');
    if (!existsSync(ctx)) {
      writeFileSync(ctx, ctxTemplate
        .replace(/\{\{PROJECT_NAME\}\}/g, name)
        .replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0])
      );
    }
  }

  ok(`Vault created with ${projectNames.length} project(s)`);
  return true;
}

// ── Install: GSD ────────────────────────────────────────────────
function installGSD(stepNum, totalSteps) {
  step(stepNum, totalSteps, '🚀 Installing GSD (Get Shit Done)');

  info('Running npx get-shit-done-cc@latest (may take a minute)...');
  const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
    stdio: 'pipe', timeout: 120000,
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
    runCmd('git pull --quiet', { cwd: dest });
    ok('Updated');
    return true;
  }

  const result = spawnSync('git', ['clone', '--quiet',
    'https://github.com/kepano/obsidian-skills.git', dest,
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
    'https://github.com/Weizhena/Deep-Research-skills.git', tmpDir,
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
  runCmd('pip3 install pyyaml --break-system-packages 2>/dev/null || pip3 install pyyaml 2>/dev/null || pip install pyyaml 2>/dev/null');

  // Cleanup
  runCmd(`rm -rf ${tmpDir}`);

  ok('Deep Research Skills installed');
  return true;
}

// ── Install: NotebookLM ─────────────────────────────────────────
function installNotebookLM(pipCmd, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📚 Installing NotebookLM');

  info('Installing notebooklm-py (this may take a minute)...');
  const result = runCmd(`${pipCmd} install "notebooklm-py[browser]" --break-system-packages 2>/dev/null || ${pipCmd} install "notebooklm-py[browser]"`);

  if (result !== null) {
    runCmd('playwright install chromium 2>/dev/null');
    runCmd('notebooklm skill install 2>/dev/null');
    ok('NotebookLM installed');
    warn('Run "notebooklm login" to authenticate with Google');
    return true;
  } else {
    fail('Install failed. Try: pip install "notebooklm-py[browser]"');
    return false;
  }
}

// ── Generate CLAUDE.md ──────────────────────────────────────────
async function generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps) {
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

  // Install CLAUDE.md into project directories with known paths
  const projectsWithPaths = projectsData.projects.filter(p => p.path && existsSync(p.path));
  const projectsWithoutPaths = projectsData.projects.filter(p => !p.path || !existsSync(p.path));

  if (projectsWithPaths.length > 0) {
    console.log('');
    const { installNow } = await prompt({
      type: 'confirm',
      name: 'installNow',
      message: 'Install CLAUDE.md into project directories?',
      initial: true,
    });

    if (installNow) {
      for (const project of projectsWithPaths) {
        writeFileSync(
          join(project.path, 'CLAUDE.md'),
          template.replace(/THIS_PROJECT/g, project.name)
        );
        ok(`${project.name} → CLAUDE.md installed`);
      }
    }
  }

  if (projectsWithoutPaths.length > 0) {
    for (const project of projectsWithoutPaths) {
      warn(`${project.name} — no valid path, copy CLAUDE.md manually from: ${templatePath}`);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────
function printSummary(installed, failed, vaultPath, projectsData) {
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
  for (const p of projectsData.projects) {
    const pathHint = p.path ? ` ${c.dim}(${p.path.replace(homedir(), '~')})${c.reset}` : '';
    console.log(`       ${c.dim}${vaultPath}/projects/${p.name}/context.md${c.reset}${pathHint}`);
  }
  console.log('');
  console.log(`    ${c.cyan}2.${c.reset} Open Claude Code in any project:`);
  if (projectsData.projects.some(p => p.path)) {
    const first = projectsData.projects.find(p => p.path);
    console.log(`       ${c.white}cd ${first.path.replace(homedir(), '~')} && claude${c.reset}`);
  } else {
    console.log(`       ${c.white}cd ~/projects/your-project && claude${c.reset}`);
  }
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

  printHeader();

  const { ready } = await prompt({
    type: 'confirm',
    name: 'ready',
    message: 'Ready to start?',
    initial: true,
  });

  if (!ready) {
    console.log(`\n  ${c.dim}No changes made. Run again when ready.${c.reset}\n`);
    return;
  }

  // Use placeholder total for early steps; recalculate after component selection
  const earlyTotal = '...';

  const { pythonCmd, pipCmd } = checkPrerequisites(earlyTotal);
  const profile = await collectProfile(earlyTotal);
  const projectsData = await collectProjects(earlyTotal);
  projectsData._profileName = profile.name;

  const components = await selectComponents(earlyTotal, !!pipCmd);

  // Calculate actual total now that we know component selection
  const setupSteps = 5;
  const installCount = [
    components.vault,
    components.gsd,
    components.obsidianSkills,
    components.customSkills,
    components.deepResearch,
    components.notebooklm,
  ].filter(Boolean).length;
  const totalSteps = setupSteps + installCount + 1; // +1 for CLAUDE.md

  const vaultPath = await getVaultPath(totalSteps);

  const installed = [];
  const failed = [];
  let stepNum = setupSteps + 1;

  if (components.vault) {
    installVault(vaultPath, projectsData, stepNum++, totalSteps)
      ? installed.push('Knowledge Vault') : failed.push('Vault');
  }
  if (components.gsd) {
    installGSD(stepNum++, totalSteps)
      ? installed.push('GSD (Get Shit Done)') : failed.push('GSD');
  }
  if (components.obsidianSkills) {
    installObsidianSkills(skillsDir, stepNum++, totalSteps)
      ? installed.push('Obsidian Skills (kepano)') : failed.push('Obsidian Skills');
  }
  if (components.customSkills) {
    installCustomSkills(skillsDir, stepNum++, totalSteps)
      ? installed.push('Custom skills (sessions, projects, router)') : failed.push('Custom skills');
  }
  if (components.deepResearch) {
    installDeepResearch(skillsDir, agentsDir, stepNum++, totalSteps)
      ? installed.push('Deep Research') : failed.push('Deep Research');
  }
  if (components.notebooklm) {
    installNotebookLM(pipCmd, stepNum++, totalSteps)
      ? installed.push('NotebookLM') : failed.push('NotebookLM');
  }

  await generateClaudeMD(vaultPath, profile, projectsData, skillsDir, stepNum, totalSteps);

  printSummary(installed, failed, vaultPath, projectsData);
}

main().catch((err) => {
  console.error(`\n  ${c.red}Error: ${err.message}${c.reset}\n`);
  process.exit(1);
});
