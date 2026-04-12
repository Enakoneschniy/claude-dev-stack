// lib/install/summary.mjs — Post-installation summary and getting started guide

import { join } from 'path';
import { homedir } from 'os';
import { c } from '../shared.mjs';

// ── Summary & Getting Started Guide ─────────────────────────────
export function printSummary(installed, failed, vaultPath, projectsData, components) {
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

  // ── Getting Started Guide ──
  console.log('');
  console.log(`  ${c.cyan}${c.bold}╔════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}║              📖 Getting Started Guide              ║${c.reset}`);
  console.log(`  ${c.cyan}${c.bold}╚════════════════════════════════════════════════════╝${c.reset}`);

  // Step 1: Fill context.md
  console.log('');
  console.log(`  ${c.bold}1. Fill in context.md for each project${c.reset}`);
  console.log(`     ${c.dim}This is the most important step. Without it, Claude won't${c.reset}`);
  console.log(`     ${c.dim}know anything about your project.${c.reset}`);
  console.log('');
  for (const p of projectsData.projects) {
    console.log(`     ${c.white}${vaultPath}/projects/${p.name}/context.md${c.reset}`);
  }
  console.log('');
  console.log(`     ${c.dim}Tip: Open the project in Claude Code and say:${c.reset}`);
  console.log(`     ${c.white}"help me fill in context.md for this project"${c.reset}`);

  // Step 2: Obsidian (if vault was installed)
  if (components.vault || components.obsidianSkills) {
    console.log('');
    console.log(`  ${c.bold}2. Set up Obsidian ${c.dim}(optional but recommended)${c.reset}`);
    console.log(`     ${c.dim}Obsidian lets you browse and edit the vault visually.${c.reset}`);
    console.log('');
    console.log(`     a) Download Obsidian:  ${c.white}https://obsidian.md${c.reset}`);
    console.log(`     b) Open as vault:      ${c.white}File → Open Vault → ${vaultPath}${c.reset}`);
    console.log(`     c) Enable these Obsidian settings for best experience:`);
    console.log(`        ${c.dim}• Settings → Files & Links → Default location: "Same folder as current file"${c.reset}`);
    console.log(`        ${c.dim}• Settings → Files & Links → Use [[Wikilinks]]: ON${c.reset}`);
    console.log(`        ${c.dim}• Settings → Editor → Readable line length: ON${c.reset}`);
    console.log(`     d) Recommended community plugins:`);
    console.log(`        ${c.dim}• Dataview (query your vault like a database)${c.reset}`);
    console.log(`        ${c.dim}• Calendar (navigate session logs by date)${c.reset}`);
    console.log(`        ${c.dim}• Templater (create sessions from templates)${c.reset}`);
  }

  // Step 3: GSD
  if (components.gsd) {
    console.log('');
    console.log(`  ${c.bold}${components.vault || components.obsidianSkills ? '3' : '2'}. Using GSD (Get Shit Done)${c.reset}`);
    console.log(`     ${c.dim}GSD auto-activates when you describe a development task.${c.reset}`);
    console.log('');
    console.log(`     ${c.white}"build user auth with email and social login"${c.reset}`);
    console.log(`     ${c.dim}  → GSD creates a spec, plans tasks, executes in clean contexts${c.reset}`);
    console.log(`     ${c.white}"fix the login page redirect bug"${c.reset}`);
    console.log(`     ${c.dim}  → Quick mode: diagnose and fix without full planning${c.reset}`);
    console.log(`     ${c.dim}If you see .planning/ in your project — GSD is active, don't delete it.${c.reset}`);
  }

  // Step 4: Deep Research
  if (components.deepResearch) {
    console.log('');
    const stepN = 2 + (components.vault || components.obsidianSkills ? 1 : 0) + (components.gsd ? 1 : 0);
    console.log(`  ${c.bold}${stepN}. Using Deep Research${c.reset}`);
    console.log(`     ${c.dim}Just say what you want to research:${c.reset}`);
    console.log('');
    console.log(`     ${c.white}"research best CMS options for 2026"${c.reset}`);
    console.log(`     ${c.white}"compare React Server Components vs Astro for our use case"${c.reset}`);
    console.log(`     ${c.dim}  → Creates structured markdown report in vault/research/${c.reset}`);
  }

  // Step 5: NotebookLM post-install summary (wizard already ran — this is just confirmation)
  if (components.notebooklm) {
    console.log('');
    const stepN = 2 + (components.vault || components.obsidianSkills ? 1 : 0) + (components.gsd ? 1 : 0) + (components.deepResearch ? 1 : 0);
    console.log(`  ${c.bold}${stepN}. NotebookLM Sync${c.reset}`);
    console.log(`     ${c.dim}Vault automatically syncs to NotebookLM after every session end.${c.reset}`);
    console.log(`     ${c.white}claude-dev-stack notebooklm sync${c.reset}     ${c.dim}Manual sync${c.reset}`);
    console.log(`     ${c.white}claude-dev-stack notebooklm status${c.reset}   ${c.dim}Show last sync + file count${c.reset}`);
    console.log(`     ${c.white}claude-dev-stack doctor${c.reset}              ${c.dim}Health check${c.reset}`);
  }

  // How to use daily
  console.log('');
  console.log(`  ${c.bold}Daily workflow:${c.reset}`);
  console.log('');
  console.log(`     ${c.cyan}Start:${c.reset}  ${c.white}cd ~/projects/your-project && claude${c.reset}`);
  console.log(`            ${c.dim}Say "hi" or "let's continue" → loads context + last session TODO${c.reset}`);
  console.log('');
  console.log(`     ${c.cyan}Work:${c.reset}   ${c.dim}Just describe tasks naturally. Skills activate automatically.${c.reset}`);
  console.log('');
  console.log(`     ${c.cyan}End:${c.reset}    ${c.dim}Say "done" / "done for today" → creates session log, updates context${c.reset}`);

  // Paths
  console.log('');
  console.log(`  ${c.dim}─── Paths ───${c.reset}`);
  console.log(`  ${c.dim}Vault:    ${vaultPath}${c.reset}`);
  console.log(`  ${c.dim}Skills:   ${join(homedir(), '.claude', 'skills')}${c.reset}`);
  console.log(`  ${c.dim}Template: ${vaultPath}/CLAUDE.md.template${c.reset}`);
  console.log('');
}
