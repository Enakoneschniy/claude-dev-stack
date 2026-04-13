/**
 * Add a project to the vault without running the full wizard.
 * Finds existing vault, creates project structure, optionally installs CLAUDE.md.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, cpSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, askPath, mkdirp, mkdirpKeep, listDirs } from './shared.mjs';
import { toSlug } from './project-naming.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

/**
 * Update project-map.json in vault: maps directory path → vault project name.
 * Creates the file from template if it doesn't exist.
 */
export function updateProjectMap(vaultPath, dirPath, projectName) {
  const mapPath = join(vaultPath, 'project-map.json');
  let mapData = { projects: {} };

  if (existsSync(mapPath)) {
    try {
      mapData = JSON.parse(readFileSync(mapPath, 'utf8'));
      if (!mapData.projects) mapData.projects = {};
    } catch {}
  }

  mapData.projects[dirPath] = projectName;
  writeFileSync(mapPath, JSON.stringify(mapData, null, 2) + '\n');
}

function findVault() {
  // Check common vault locations
  const candidates = [
    join(homedir(), 'vault'),
    join(homedir(), 'Vault'),
    join(homedir(), '.vault'),
    join(homedir(), 'obsidian-vault'),
    join(homedir(), 'Documents', 'vault'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta')) && existsSync(join(dir, 'projects'))) {
      return dir;
    }
  }

  // Search for CLAUDE.md.template which we create during setup
  for (const dir of candidates) {
    if (existsSync(join(dir, 'CLAUDE.md.template'))) {
      return dir;
    }
  }

  return null;
}

function findClaudeTemplate(vaultPath) {
  const templatePath = join(vaultPath, 'CLAUDE.md.template');
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf8');
  }
  return null;
}

export async function main() {
  console.log('');
  console.log(`  ${c.bold}Add project${c.reset}`);
  console.log('');

  // Find vault
  let vaultPath = findVault();

  if (vaultPath) {
    info(`Found vault: ${vaultPath.replace(homedir(), '~')}`);
  } else {
    console.log(`    ${c.dim}Could not find vault automatically.${c.reset}`);
    console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);
    vaultPath = await askPath('Vault path', join(homedir(), 'vault'));
    vaultPath = vaultPath.replace(/^~/, homedir());

    if (!existsSync(vaultPath)) {
      fail(`Vault not found at ${vaultPath}`);
      info('Run the full setup first: claude-dev-stack');
      return;
    }
  }

  // List existing projects
  const projectsDir = join(vaultPath, 'projects');
  const existing = listDirs(projectsDir)
    .filter(d => d.name !== '_template')
    .map(d => d.name);

  if (existing.length > 0) {
    console.log('');
    info(`Existing projects: ${existing.join(', ')}`);
  }

  // Ask for project details
  console.log('');
  const { projectName } = await prompt({
    type: 'text',
    name: 'projectName',
    message: 'Project name',
    validate: (val) => {
      if (!val) return 'Name is required';
      const clean = toSlug(val);
      if (existing.includes(clean)) return `"${clean}" already exists in vault`;
      return true;
    },
  });

  if (!projectName) return;

  const clean = toSlug(projectName);

  // Ask for project directory
  console.log('');
  console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);
  const projectPath = await askPath('Project source code directory', '');
  const resolvedPath = projectPath ? projectPath.replace(/^~/, homedir()).replace(/\/+$/, '') : null;

  // Create vault structure
  console.log('');
  const projDir = join(projectsDir, clean);
  mkdirpKeep(join(projDir, 'decisions'));
  mkdirpKeep(join(projDir, 'sessions'));
  mkdirpKeep(join(projDir, 'docs'));

  // Create context.md from template
  const templateDir = join(projectsDir, '_template');
  const contextTemplate = existsSync(join(templateDir, 'context.md'))
    ? readFileSync(join(templateDir, 'context.md'), 'utf8')
    : `# Project: ${clean}\n\n## Overview\n\n## Stack\n\n## Current State\n`;

  const contextPath = join(projDir, 'context.md');
  if (!existsSync(contextPath)) {
    writeFileSync(contextPath, contextTemplate
      .replace(/\{\{PROJECT_NAME\}\}/g, clean)
      .replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0])
    );
    ok(`context.md created`);
  }

  ok(`Vault: ${projDir.replace(homedir(), '~')}`);

  // Install CLAUDE.md into project directory
  if (resolvedPath && existsSync(resolvedPath)) {
    const template = findClaudeTemplate(vaultPath);

    if (template) {
      const claudeMdPath = join(resolvedPath, 'CLAUDE.md');

      if (existsSync(claudeMdPath)) {
        const { overwrite } = await prompt({
          type: 'confirm',
          name: 'overwrite',
          message: 'CLAUDE.md already exists. Overwrite?',
          initial: false,
        });

        if (!overwrite) {
          info('Kept existing CLAUDE.md');
        } else {
          writeFileSync(claudeMdPath, template.replace(/THIS_PROJECT/g, clean));
          ok('CLAUDE.md updated');
        }
      } else {
        writeFileSync(claudeMdPath, template.replace(/THIS_PROJECT/g, clean));
        ok('CLAUDE.md installed');
      }
    }

    ok(`Project: ${resolvedPath.replace(homedir(), '~')}`);
  } else if (resolvedPath) {
    warn(`${resolvedPath.replace(homedir(), '~')} does not exist — skipped CLAUDE.md`);
  }

  // Update project-map.json (directory → project name mapping)
  if (resolvedPath && existsSync(resolvedPath)) {
    updateProjectMap(vaultPath, resolvedPath, clean);
  }

  // Update project registry if it exists
  const registryPath = join(vaultPath, 'meta', 'project-registry.md');
  if (existsSync(registryPath)) {
    let registry = readFileSync(registryPath, 'utf8');
    if (!registry.includes(`| ${clean} |`)) {
      registry = registry.trimEnd() + `\n| ${clean} | active | — |\n`;
      writeFileSync(registryPath, registry);
      ok('Updated project-registry.md');
    }
  }

  console.log('');
  console.log(`  ${c.bold}Next steps:${c.reset}`);
  console.log(`    ${c.cyan}1.${c.reset} Fill in context.md: ${c.white}${contextPath.replace(homedir(), '~')}${c.reset}`);
  if (resolvedPath && existsSync(resolvedPath)) {
    console.log(`    ${c.cyan}2.${c.reset} Start working: ${c.white}cd ${resolvedPath.replace(homedir(), '~')} && claude${c.reset}`);
  }
  console.log('');
}
