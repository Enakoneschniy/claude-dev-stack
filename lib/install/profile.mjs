// lib/install/profile.mjs — Language/profile wizard step

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { c, ok, info, prompt, step } from '../shared.mjs';

// ── saveInstallProfile() — persist profile to vault/meta/install-profile.json ─
export function saveInstallProfile(vaultPath, profile) {
  if (!vaultPath) return;
  const metaDir = join(vaultPath, 'meta');
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true });
  const profilePath = join(metaDir, 'install-profile.json');
  writeFileSync(profilePath, JSON.stringify(profile, null, 2));
}

// ── Step 2: Language ─────────────────────────────────────────────
export async function collectProfile(totalSteps, detectedProfile) {
  step(2, totalSteps, '🌐 Language');

  console.log(`    ${c.dim}Claude Code will communicate in this language.${c.reset}`);
  console.log('');

  // DX-07: If profile already exists, show current values and offer to skip
  if (detectedProfile?.lang) {
    info(`Current: lang=${c.bold}${detectedProfile.lang}${c.reset}, code=${c.bold}${detectedProfile.codeLang || 'en'}${c.reset}`);
    const { change } = await prompt({
      type: 'confirm',
      name: 'change',
      message: 'Change language settings?',
      initial: false,
    });
    if (!change) {
      console.log('');
      ok(`Language: ${c.bold}${detectedProfile.lang}${c.reset}, code: ${c.bold}${detectedProfile.codeLang || 'en'}${c.reset} (skipped)`);
      const profile = { ...detectedProfile };
      profile.name = profile.name || '';
      profile.company = profile.company || '';
      return profile;
    }
    console.log('');
  }

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
