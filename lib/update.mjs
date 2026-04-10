/**
 * Update all installed components.
 *
 * Updates:
 * - claude-dev-stack itself (re-fetches package, copies skills + hooks)
 * - Git-based skills (pull latest)
 * - GSD (npx latest)
 * - Claude Code CLI
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, cpSync, chmodSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, hasCommand, SKILLS_DIR, CLAUDE_DIR, mkdirp, spawnSync } from './shared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

// ── Backfill .gitkeep in vault empty dirs ──────────────────────
function backfillGitkeep(vaultPath) {
  const targetDirs = [
    join(vaultPath, 'research'),
  ];

  const projectsDir = join(vaultPath, 'projects');
  if (existsSync(projectsDir)) {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        targetDirs.push(join(projectsDir, entry.name, 'sessions'));
        targetDirs.push(join(projectsDir, entry.name, 'decisions'));
        targetDirs.push(join(projectsDir, entry.name, 'docs'));
      }
    }
  }

  let added = 0;
  for (const dir of targetDirs) {
    if (existsSync(dir)) {
      const files = readdirSync(dir);
      if (files.length === 0) {
        writeFileSync(join(dir, '.gitkeep'), '');
        added++;
      }
    }
  }
  return added;
}

// ── Update builtin skills from package ──────────────────────────
function updateBuiltinSkills() {
  const skillsSrcDir = join(PKG_ROOT, 'skills');
  const skillNames = ['session-manager', 'project-switcher', 'dev-router', 'dev-research'];
  let updated = 0;

  for (const name of skillNames) {
    const src = join(skillsSrcDir, name, 'SKILL.md');
    const destDir = join(SKILLS_DIR, name);

    if (!existsSync(src)) continue;

    mkdirp(destDir);
    const dest = join(destDir, 'SKILL.md');

    // Compare content — only update if changed
    const srcContent = readFileSync(src, 'utf8');
    const destContent = existsSync(dest) ? readFileSync(dest, 'utf8') : '';

    if (srcContent !== destContent) {
      cpSync(src, dest);
      ok(`${name} skill updated`);
      updated++;
    }
  }

  if (updated === 0) {
    info('Builtin skills already up to date');
  }
  return updated;
}

// ── Update hooks from package ───────────────────────────────────
function updateHooks() {
  const hooksSrcDir = join(PKG_ROOT, 'hooks');
  const hooksDestDir = join(CLAUDE_DIR, 'hooks');

  if (!existsSync(hooksSrcDir)) return 0;

  mkdirp(hooksDestDir);
  let updated = 0;

  const hookFiles = readdirSync(hooksSrcDir).filter(f => f.endsWith('.sh'));

  for (const file of hookFiles) {
    const src = join(hooksSrcDir, file);
    const dest = join(hooksDestDir, file);

    const srcContent = readFileSync(src, 'utf8');
    const destContent = existsSync(dest) ? readFileSync(dest, 'utf8') : '';

    if (srcContent !== destContent) {
      cpSync(src, dest);
      try { chmodSync(dest, 0o755); } catch {}
      ok(`${file} hook updated`);
      updated++;
    }
  }

  // Ensure hooks are registered in settings.json
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}
  }

  if (!settings.hooks) settings.hooks = {};
  let settingsChanged = false;

  // SessionStart hook
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  const startDest = join(hooksDestDir, 'session-start-context.sh');
  if (existsSync(startDest)) {
    const hasStart = settings.hooks.SessionStart.some(e =>
      e.hooks?.some(h => h.command?.includes('session-start-context'))
    );
    if (!hasStart) {
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: `bash ${startDest}` }],
      });
      ok('SessionStart hook registered');
      settingsChanged = true;
    }
  }

  // Stop hook
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  const endDest = join(hooksDestDir, 'session-end-check.sh');
  if (existsSync(endDest)) {
    const hasEnd = settings.hooks.Stop.some(e =>
      e.hooks?.some(h => h.command?.includes('session-end-check'))
    );
    if (!hasEnd) {
      settings.hooks.Stop.push({
        hooks: [{ type: 'command', command: `bash ${endDest}`, timeout: 5 }],
      });
      ok('Stop hook registered');
      settingsChanged = true;
    }
  }

  // PostToolUse hook (vault auto-push)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const pushDest = join(hooksDestDir, 'vault-auto-push.sh');
  if (existsSync(pushDest)) {
    const hasPush = settings.hooks.PostToolUse.some(e =>
      e.hooks?.some(h => h.command?.includes('vault-auto-push'))
    );
    if (!hasPush) {
      settings.hooks.PostToolUse.push({
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: `bash ${pushDest}`, timeout: 10 }],
      });
      ok('PostToolUse hook registered (vault auto-push)');
      settingsChanged = true;
    }
  }

  if (settingsChanged) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  if (updated === 0 && !settingsChanged) {
    info('Hooks already up to date');
  }
  return updated;
}

// ── Main ─────────────────────────────────────────────────────────
export async function main() {
  console.log('');
  console.log(`  ${c.bold}Update components${c.reset}`);
  console.log('');

  // ── 1. Builtin skills + hooks (from this package) ──
  info('Checking builtin skills and hooks...');
  const skillsUpdated = updateBuiltinSkills();
  const hooksUpdated = updateHooks();

  // ── 2. Git-based skills (pull latest) ──
  const gitSkills = [];
  if (existsSync(SKILLS_DIR)) {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory());

    for (const dir of dirs) {
      const gitDir = join(SKILLS_DIR, dir.name, '.git');
      if (existsSync(gitDir)) {
        gitSkills.push({ name: dir.name, path: join(SKILLS_DIR, dir.name) });
      }
    }
  }

  // ── 3. GSD ──
  const hasGsd = existsSync(SKILLS_DIR) &&
    readdirSync(SKILLS_DIR).some(d => d.startsWith('gsd-'));

  // ── 4. Claude Code ──
  const hasClaude = hasCommand('claude');

  // Show what else can be updated
  const additional = [];
  if (gitSkills.length > 0) additional.push(`${gitSkills.length} git-based skill(s)`);
  if (hasGsd) additional.push('GSD');
  if (hasClaude) additional.push('Claude Code CLI');

  if (additional.length > 0) {
    console.log('');
    const { updateMore } = await prompt({
      type: 'confirm',
      name: 'updateMore',
      message: `Also update: ${additional.join(', ')}?`,
      initial: true,
    });

    if (updateMore) {
      console.log('');

      for (const skill of gitSkills) {
        info(`Pulling ${skill.name}...`);
        const result = spawnSync('git', ['pull', '--quiet'], {
          cwd: skill.path, stdio: 'pipe', timeout: 30000,
        });
        if (result.status === 0) {
          ok(`${skill.name}`);
        } else {
          warn(`${skill.name} — pull failed`);
        }
      }

      if (hasGsd) {
        info('Updating GSD...');
        const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
          stdio: 'pipe', timeout: 120000,
        });
        if (result.status === 0) {
          ok('GSD updated');
        } else {
          warn('GSD update failed. Run manually: npx get-shit-done-cc@latest');
        }
      }

      if (hasClaude) {
        info('Checking Claude Code updates...');
        const result = spawnSync('claude', ['update'], {
          stdio: 'inherit', timeout: 60000,
        });
        if (result.status === 0) {
          ok('Claude Code checked');
        } else {
          warn('Claude Code update check failed');
        }
      }
    }
  }

  // ── 5. Backfill .gitkeep in empty vault dirs ──
  const { findVault } = await import('./projects.mjs');
  const vaultPath = findVault();
  if (vaultPath) {
    const kept = backfillGitkeep(vaultPath);
    if (kept > 0) {
      ok(`Added .gitkeep to ${kept} empty directories`);
    }

    // Check project mapping completeness
    const mapPath = join(vaultPath, 'project-map.json');
    let mappedNames = new Set();
    if (existsSync(mapPath)) {
      try {
        const mapData = JSON.parse(readFileSync(mapPath, 'utf8'));
        mappedNames = new Set(Object.values(mapData.projects || {}));
      } catch {}
    }

    const projectsDir = join(vaultPath, 'projects');
    if (existsSync(projectsDir)) {
      const allProjects = readdirSync(projectsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== '_template')
        .map(e => e.name);

      const unmapped = allProjects.filter(p => !mappedNames.has(p));

      if (unmapped.length > 0) {
        console.log('');
        warn(`${unmapped.length} project(s) not mapped: ${unmapped.join(', ')}`);
        info('Hooks may not find context for these projects.');

        const { setupMap } = await prompt({
          type: 'confirm',
          name: 'setupMap',
          message: 'Set up directory → project mapping now?',
          initial: true,
        });

        if (setupMap) {
          const { mapProjects } = await import('./projects.mjs');
          await mapProjects();
        } else {
          info('Run later: claude-dev-stack projects map');
        }
      }
    }
  }

  console.log('');
  ok(`${c.bold}Update complete${c.reset}`);
  console.log('');
  info(`${c.dim}Note: npx may cache old versions. If commands behave unexpectedly, run:${c.reset}`);
  console.log(`    ${c.white}npx --yes claude-dev-stack <command>${c.reset}`);
  console.log('');
}
