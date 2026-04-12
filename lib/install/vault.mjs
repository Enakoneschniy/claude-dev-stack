// lib/install/vault.mjs — Vault path collection and vault installation

import { existsSync, writeFileSync, readFileSync, cpSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, warn, info, prompt, askPath, step, mkdirp, mkdirpKeep } from '../shared.mjs';

// ── Step 6: Vault Path ──────────────────────────────────────────
export async function getVaultPath(totalSteps) {
  step(6, totalSteps, '📁 Vault location');

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
export function installVault(vaultPath, projectsData, stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, '📁 Creating knowledge vault');

  mkdirp(join(vaultPath, 'meta'));
  mkdirp(join(vaultPath, 'shared'));
  mkdirpKeep(join(vaultPath, 'research'));

  const projectNames = projectsData.projects.map(p => p.name);

  for (const name of projectNames) {
    mkdirpKeep(join(vaultPath, 'projects', name, 'decisions'));
    mkdirpKeep(join(vaultPath, 'projects', name, 'sessions'));
    mkdirpKeep(join(vaultPath, 'projects', name, 'docs'));
  }
  mkdirpKeep(join(vaultPath, 'projects', '_template', 'decisions'));
  mkdirpKeep(join(vaultPath, 'projects', '_template', 'sessions'));
  mkdirpKeep(join(vaultPath, 'projects', '_template', 'docs'));

  // Copy templates from package
  const templatesDir = join(pkgRoot, 'templates');
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
