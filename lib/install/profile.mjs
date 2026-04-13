// lib/install/profile.mjs — Language/profile wizard step

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, info, prompt, step } from '../shared.mjs';

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

  // DX-07 / D-04: Pre-fill with select "Keep current / Change" on re-install
  if (detectedProfile?.lang) {
    info(`Current: lang=${c.bold}${detectedProfile.lang}${c.reset}, code=${c.bold}${detectedProfile.codeLang || 'en'}${c.reset}`);
    const { action } = await prompt({
      type: 'select',
      name: 'action',
      message: `Language: ${detectedProfile.lang}`,
      choices: [
        { title: 'Keep current', value: 'keep' },
        { title: 'Change', value: 'change' },
      ],
      initial: 0,
    });
    if (action === 'keep') {
      console.log('');
      ok(`Language: ${c.bold}${detectedProfile.lang}${c.reset}, code: ${c.bold}${detectedProfile.codeLang || 'en'}${c.reset} (kept)`);
      return { lang: detectedProfile.lang, codeLang: detectedProfile.codeLang || 'en', name: '', company: '' };
    }
    // Falls through to original prompts with initial pre-filled (D-05)
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
