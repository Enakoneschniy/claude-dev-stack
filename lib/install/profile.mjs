// lib/install/profile.mjs — Language/profile wizard step

import { c, ok, prompt, step } from '../shared.mjs';

// ── Step 2: Language ─────────────────────────────────────────────
export async function collectProfile(totalSteps) {
  step(2, totalSteps, '🌐 Language');

  console.log(`    ${c.dim}Claude Code will communicate in this language.${c.reset}`);
  console.log('');

  const profile = await prompt([
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
  ]);

  // Set defaults for removed fields
  profile.name = '';
  profile.company = '';

  console.log('');
  ok(`Language: ${c.bold}${profile.lang}${c.reset}, code: ${c.bold}${profile.codeLang}${c.reset}`);

  return profile;
}
