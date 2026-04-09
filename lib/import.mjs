/**
 * Import — bring in configs from other AI dev tools or existing CLAUDE.md
 *
 * Supported sources:
 * - CLAUDE.md (existing Claude Code config)
 * - .cursorrules / .cursor/rules (Cursor)
 * - .windsurfrules (Windsurf)
 * - .github/copilot-instructions.md (GitHub Copilot)
 * - .clinerules (Cline)
 * - .aider.conf.yml (Aider)
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, askPath, mkdirp } from './shared.mjs';
import { findVault } from './projects.mjs';

const KNOWN_SOURCES = [
  { name: 'CLAUDE.md', paths: ['CLAUDE.md'], tool: 'Claude Code' },
  { name: '.cursorrules', paths: ['.cursorrules', '.cursor/rules'], tool: 'Cursor' },
  { name: '.windsurfrules', paths: ['.windsurfrules'], tool: 'Windsurf' },
  { name: 'copilot-instructions.md', paths: ['.github/copilot-instructions.md'], tool: 'GitHub Copilot' },
  { name: '.clinerules', paths: ['.clinerules'], tool: 'Cline' },
  { name: '.aider.conf.yml', paths: ['.aider.conf.yml'], tool: 'Aider' },
];

function detectSources(projectDir) {
  const found = [];
  for (const source of KNOWN_SOURCES) {
    for (const relPath of source.paths) {
      const fullPath = join(projectDir, relPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf8');
        found.push({
          ...source,
          path: fullPath,
          relPath,
          content,
          size: content.length,
        });
        break; // take first matching path for this source
      }
    }
  }
  return found;
}

function extractSections(content) {
  // Parse markdown into sections
  const sections = {};
  let currentSection = 'general';
  const lines = content.split('\n');

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase().trim();
    }
    if (!sections[currentSection]) sections[currentSection] = [];
    sections[currentSection].push(line);
  }

  return sections;
}

function buildContextFromImport(sources, projectName) {
  let context = `# Project: ${projectName}\n\n`;
  context += `> Imported on ${new Date().toISOString().split('T')[0]}\n\n`;

  for (const source of sources) {
    context += `## Imported from ${source.tool} (${source.relPath})\n\n`;

    // For YAML files, include as code block
    if (source.relPath.endsWith('.yml') || source.relPath.endsWith('.yaml')) {
      context += '```yaml\n' + source.content + '\n```\n\n';
      continue;
    }

    // For markdown files, extract key sections
    const sections = extractSections(source.content);

    for (const [name, lines] of Object.entries(sections)) {
      const text = lines.join('\n').trim();
      if (text && text.length > 10) {
        // Skip empty sections, keep meaningful content
        const hasContent = lines.some(l => l.trim() && !l.startsWith('#'));
        if (hasContent) {
          context += text + '\n\n';
        }
      }
    }
  }

  context += `## Overview\n\n<!-- Fill in: what does this project do? -->\n\n`;
  context += `## Stack\n\n<!-- Fill in: languages, frameworks, databases -->\n\n`;
  context += `## Current State\n\n<!-- Fill in: what's the current status? -->\n\n`;

  return context;
}

// ── Import from project directory ────────────────────────────────
export async function importFromProject() {
  console.log('');
  console.log(`  ${c.bold}Import from project${c.reset}`);
  console.log(`  ${c.dim}Scan a project directory for AI dev tool configs and import into vault.${c.reset}`);
  console.log('');

  // Get vault
  let vaultPath = findVault();
  if (!vaultPath) {
    console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);
    vaultPath = await askPath('Vault path', join(homedir(), 'vault'));
    vaultPath = vaultPath.replace(/^~/, homedir());
  } else {
    info(`Vault: ${vaultPath.replace(homedir(), '~')}`);
  }

  if (!existsSync(join(vaultPath, 'projects'))) {
    fail('Not a valid vault');
    return;
  }

  // Get project directory to scan
  console.log('');
  console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);
  const projectDir = await askPath('Project directory to scan', process.cwd());
  const resolvedDir = projectDir.replace(/^~/, homedir()).replace(/\/+$/, '');

  if (!existsSync(resolvedDir)) {
    fail(`Directory not found: ${resolvedDir}`);
    return;
  }

  // Detect sources
  console.log('');
  info('Scanning for AI dev tool configs...');
  console.log('');

  const sources = detectSources(resolvedDir);

  if (sources.length === 0) {
    warn('No AI dev tool configs found in this directory');
    info('Supported: CLAUDE.md, .cursorrules, .windsurfrules, copilot-instructions.md, .clinerules, .aider.conf.yml');
    console.log('');
    return;
  }

  for (const source of sources) {
    ok(`${source.tool}: ${source.relPath} ${c.dim}(${source.size} bytes)${c.reset}`);
  }

  // Ask which to import
  console.log('');
  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select configs to import',
    choices: sources.map(s => ({
      title: `${s.tool} ${c.dim}(${s.relPath})${c.reset}`,
      value: s.relPath,
      selected: true,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('Nothing selected');
    return;
  }

  const selectedSources = sources.filter(s => selected.includes(s.relPath));

  // Ask for project name
  const dirName = basename(resolvedDir);
  const { projectName } = await prompt({
    type: 'text',
    name: 'projectName',
    message: 'Project name in vault',
    initial: dirName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  });

  if (!projectName) return;

  const clean = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Create vault structure
  const projDir = join(vaultPath, 'projects', clean);
  mkdirp(join(projDir, 'decisions'));
  mkdirp(join(projDir, 'sessions'));

  // Generate context.md
  const contextPath = join(projDir, 'context.md');
  const context = buildContextFromImport(selectedSources, clean);

  if (existsSync(contextPath)) {
    const { overwrite } = await prompt({
      type: 'confirm',
      name: 'overwrite',
      message: 'context.md already exists. Overwrite?',
      initial: false,
    });

    if (!overwrite) {
      // Append instead
      const existing = readFileSync(contextPath, 'utf8');
      writeFileSync(contextPath, existing + '\n\n---\n\n' + context);
      ok('Appended to existing context.md');
    } else {
      writeFileSync(contextPath, context);
      ok('context.md created from import');
    }
  } else {
    writeFileSync(contextPath, context);
    ok('context.md created from import');
  }

  // Also save raw imported files for reference
  const importsDir = join(projDir, 'imports');
  mkdirp(importsDir);
  for (const source of selectedSources) {
    const destName = source.relPath.replace(/\//g, '_');
    writeFileSync(join(importsDir, destName), source.content);
  }
  ok(`Raw configs saved to ${clean}/imports/`);

  console.log('');
  console.log(`  ${c.bold}Next steps:${c.reset}`);
  console.log(`    ${c.cyan}1.${c.reset} Review and edit: ${c.white}${contextPath.replace(homedir(), '~')}${c.reset}`);
  console.log(`    ${c.cyan}2.${c.reset} Fill in Overview, Stack, and Current State sections`);
  console.log(`    ${c.cyan}3.${c.reset} Remove any imported content that's not relevant`);
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'project';

  switch (subcommand) {
    case 'project':
    case 'from':
      await importFromProject();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}Import${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack import${c.reset}           ${c.dim}Import AI configs from a project directory${c.reset}`);
      console.log(`    ${c.dim}Supported: CLAUDE.md, .cursorrules, .windsurfrules,${c.reset}`);
      console.log(`    ${c.dim}copilot-instructions.md, .clinerules, .aider.conf.yml${c.reset}`);
      console.log('');
  }
}
