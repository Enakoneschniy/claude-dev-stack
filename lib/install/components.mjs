// lib/install/components.mjs — Component selection wizard step

import { c, ok, info, prompt, step } from '../shared.mjs';

// ── Step 4: Component Selection ─────────────────────────────────
export async function selectComponents(totalSteps, hasPip) {
  step(4, totalSteps, '📦 Choose components');

  const choices = [
    { title: '📁 Knowledge Vault (project context, session logs, ADRs)', value: 'vault', selected: true },
    { title: '⚙️  Custom skills (session manager, project switcher, auto-router)', value: 'customSkills', selected: true },
    { title: '🔌 Obsidian Skills by kepano (vault format support)', value: 'obsidianSkills', selected: true },
    { title: '🔍 Deep Research (structured web research from terminal)', value: 'deepResearch', selected: true },
    { title: '🚀 GSD — Get Shit Done (advanced spec-driven workflow, 78 slash commands)', value: 'gsd', selected: false },
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
