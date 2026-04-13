// lib/install/profile.mjs — Language/profile wizard step

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, prompt, step } from '../shared.mjs';

// ── saveInstallProfile() — D-01: persist to vault/meta/profile.json ─
export function saveInstallProfile(vaultPath, profile) {
  if (!vaultPath) return;
  const metaDir = join(vaultPath, 'meta');
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, 'profile.json'), JSON.stringify(profile, null, 2));
}

// ── Step 2: Language ─────────────────────────────────────────────
export async function collectProfile(totalSteps, detectedProfile) {
  step(2, totalSteps, '🌐 Language');

  console.log(`    ${c.dim}Claude Code will communicate in this language.${c.reset}`);
  console.log('');

  const profile = await prompt([
    {
      type: 'text',
      name: 'lang',
      message: 'Communication language (ru/en/es/de...)',
      initial: detectedProfile?.lang || 'en',
    },
    {
      type: 'text',
      name: 'codeLang',
      message: 'Code comments & git commits language',
      initial: detectedProfile?.codeLang || 'en',
    },
  ]);

  // Set defaults for removed fields
  profile.name = '';
  profile.company = '';

  console.log('');
  ok(`Language: ${c.bold}${profile.lang}${c.reset}, code: ${c.bold}${profile.codeLang}${c.reset}`);

  return profile;
}
