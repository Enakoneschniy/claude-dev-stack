/**
 * Skills management — install, list, remove
 *
 * Skills are folders with SKILL.md in ~/.claude/skills/
 * Installed via git clone from known GitHub repositories.
 */

import { existsSync, readdirSync, readFileSync, rmSync, cpSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { c, ok, fail, warn, info, prompt, SKILLS_DIR, AGENTS_DIR, mkdirp, spawnSync } from './shared.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── Known skill sources ─────────────────────────────────────────
// Each source is a GitHub repo containing one or more skills.
// `path` is the subdirectory within the repo where skills live.
// If `path` is null, the repo root IS the skill folder.
const SKILL_CATALOG = [
  {
    name: 'obsidian-skills',
    repo: 'https://github.com/kepano/obsidian-skills.git',
    desc: 'Obsidian vault format support by kepano (Obsidian CEO)',
    cat: 'Productivity',
    installAs: 'obsidian', // folder name in ~/.claude/skills/
    isRepo: true, // clone entire repo as one skill folder
  },
  {
    name: 'deep-research',
    repo: 'https://github.com/Weizhena/Deep-Research-skills.git',
    desc: 'Structured web research from terminal — outlines, investigation, reports',
    cat: 'Research',
    skillsPath: 'skills/research-en', // subdirectory with skills
    agentsPath: 'agents', // agents to also copy
  },
  {
    name: 'gsd',
    repo: 'npx:get-shit-done-cc@latest',
    desc: 'Get Shit Done — spec-driven dev with subagent orchestration',
    cat: 'Development',
    isNpx: true, // installed via npx, not git clone
  },
  {
    name: 'session-manager',
    repo: 'builtin',
    desc: 'Auto-manage session lifecycle — start, log, end',
    cat: 'Workflow',
    isBuiltin: true,
  },
  {
    name: 'project-switcher',
    repo: 'builtin',
    desc: 'Switch between multiple projects with context preservation',
    cat: 'Workflow',
    isBuiltin: true,
  },
  {
    name: 'dev-router',
    repo: 'builtin',
    desc: 'Auto-route messages to the right skill based on intent',
    cat: 'Workflow',
    isBuiltin: true,
  },
  {
    name: 'dev-research',
    repo: 'builtin',
    desc: 'NotebookLM integration for docs-grounded research',
    cat: 'Research',
    isBuiltin: true,
  },
];

// ── Get installed skills ────────────────────────────────────────
export function getInstalledSkills() {
  if (!existsSync(SKILLS_DIR)) return [];

  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const skills = [];
  for (const entry of entries) {
    const dir = join(SKILLS_DIR, entry.name);
    const skillMd = join(dir, 'SKILL.md');

    // Check for SKILL.md in root or in subdirectories
    let description = '';
    let hasSkillFile = false;

    if (existsSync(skillMd)) {
      hasSkillFile = true;
      description = parseSkillDescription(skillMd);
    } else {
      // Check subdirectories (e.g. obsidian/skills/*)
      const subSkills = findSkillFiles(dir);
      if (subSkills.length > 0) {
        hasSkillFile = true;
        description = `${subSkills.length} skill(s)`;
      }
    }

    if (hasSkillFile) {
      skills.push({
        name: entry.name,
        path: dir,
        description,
      });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function findSkillFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const skillMd = join(dir, e.name, 'SKILL.md');
        if (existsSync(skillMd)) {
          results.push(e.name);
        }
      }
      if (e.name === 'SKILL.md') {
        results.push(basename(dir));
      }
    }
  } catch {}
  return results;
}

function parseSkillDescription(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    // Parse YAML frontmatter description
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
      const descMatch = match[1].match(/description:\s*[>|]?\s*\n?\s*(.+)/);
      if (descMatch) return descMatch[1].trim().slice(0, 80);
    }
    // Fallback: first non-empty non-heading line
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed.slice(0, 80);
      }
    }
  } catch {}
  return '';
}

// ── Commands ────────────────────────────────────────────────────

export async function listSkills() {
  console.log('');
  console.log(`  ${c.bold}Installed skills${c.reset} ${c.dim}(${SKILLS_DIR})${c.reset}`);
  console.log('');

  const skills = getInstalledSkills();

  if (skills.length === 0) {
    warn('No skills installed');
    console.log(`    ${c.dim}Run: claude-dev-stack skills install${c.reset}`);
    return;
  }

  for (const skill of skills) {
    const desc = skill.description ? ` ${c.dim}— ${skill.description}${c.reset}` : '';
    console.log(`    ${c.green}✔${c.reset} ${skill.name}${desc}`);
  }

  console.log('');
  info(`${skills.length} skill(s) installed`);
  console.log('');
}

export async function installSkills() {
  console.log('');
  console.log(`  ${c.bold}Install skills${c.reset}`);
  console.log('');

  const installed = getInstalledSkills();
  const installedNames = new Set(installed.map(s => s.name));

  // Also check for GSD skills (gsd-*)
  const hasGsd = installed.some(s => s.name.startsWith('gsd-'));

  // Build choices from catalog
  const choices = [];
  let lastCat = '';

  for (const skill of SKILL_CATALOG) {
    if (skill.cat !== lastCat) {
      lastCat = skill.cat;
      choices.push({ title: `${c.bold}── ${skill.cat} ──${c.reset}`, value: '__sep__', disabled: true });
    }

    const isInstalled = installedNames.has(skill.installAs || skill.name) ||
                        (skill.isNpx && hasGsd);
    const suffix = isInstalled ? ` ${c.green}(installed)${c.reset}` : '';

    choices.push({
      title: `${skill.name}${suffix} ${c.dim}— ${skill.desc}${c.reset}`,
      value: skill.name,
      disabled: isInstalled,
      selected: false,
    });
  }

  // Option to install from custom Git URL
  choices.push({ title: `${c.bold}── Custom ──${c.reset}`, value: '__sep2__', disabled: true });
  choices.push({
    title: `Install from Git URL ${c.dim}— paste any GitHub repo with SKILL.md${c.reset}`,
    value: '__custom__',
    selected: false,
  });

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select skills to install',
    choices,
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  const toInstall = (selected || []).filter(id => !id.startsWith('__'));
  const hasCustom = (selected || []).includes('__custom__');

  // Install selected catalog skills
  for (const name of toInstall) {
    const skill = SKILL_CATALOG.find(s => s.name === name);
    if (!skill) continue;

    console.log('');
    info(`Installing ${name}...`);

    if (skill.isBuiltin) {
      installBuiltinSkill(skill);
    } else if (skill.isNpx) {
      installNpxSkill(skill);
    } else if (skill.isRepo) {
      installRepoSkill(skill);
    } else {
      installMultiSkill(skill);
    }
  }

  // Handle custom git URL
  if (hasCustom) {
    console.log('');
    const { url } = await prompt({
      type: 'text',
      name: 'url',
      message: 'Git URL (e.g. https://github.com/user/skills-repo.git)',
    });

    if (url) {
      const { folderName } = await prompt({
        type: 'text',
        name: 'folderName',
        message: 'Install as (folder name in ~/.claude/skills/)',
        initial: basename(url).replace('.git', ''),
      });

      if (folderName) {
        const dest = join(SKILLS_DIR, folderName);
        mkdirp(SKILLS_DIR);

        if (existsSync(dest)) {
          warn(`${folderName} already exists, skipping`);
        } else {
          const result = spawnSync('git', ['clone', '--quiet', url, dest], {
            stdio: 'pipe', timeout: 60000,
          });

          if (result.status === 0) {
            ok(`${folderName} installed`);
          } else {
            fail(`Clone failed: ${url}`);
          }
        }
      }
    }
  }

  if (toInstall.length === 0 && !hasCustom) {
    info('No new skills selected');
  }

  console.log('');
}

export async function removeSkills() {
  console.log('');
  console.log(`  ${c.bold}Remove skills${c.reset}`);
  console.log('');

  const installed = getInstalledSkills();

  if (installed.length === 0) {
    warn('No skills installed');
    return;
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select skills to remove',
    choices: installed.map(s => ({
      title: `${s.name} ${c.dim}— ${s.description || s.path}${c.reset}`,
      value: s.name,
      selected: false,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('No skills selected for removal');
    return;
  }

  // Confirm
  const { confirm } = await prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${selected.length} skill(s)? This cannot be undone.`,
    initial: false,
  });

  if (!confirm) {
    info('Cancelled');
    return;
  }

  for (const name of selected) {
    const skill = installed.find(s => s.name === name);
    if (!skill) continue;

    try {
      rmSync(skill.path, { recursive: true, force: true });
      ok(`Removed ${name}`);
    } catch (err) {
      fail(`Failed to remove ${name}: ${err.message}`);
    }
  }

  console.log('');
}

// ── Install helpers ─────────────────────────────────────────────

function installBuiltinSkill(skill) {
  const pkgRoot = join(__dirname, '..');
  const src = join(pkgRoot, 'skills', skill.name, 'SKILL.md');
  const destDir = join(SKILLS_DIR, skill.name);

  mkdirp(destDir);

  if (existsSync(src)) {
    cpSync(src, join(destDir, 'SKILL.md'));
    ok(`${skill.name} installed`);
  } else {
    fail(`${skill.name} — source not found in package`);
  }
}

function installRepoSkill(skill) {
  const dest = join(SKILLS_DIR, skill.installAs || skill.name);
  mkdirp(SKILLS_DIR);

  if (existsSync(dest)) {
    info('Already installed, pulling latest...');
    spawnSync('git', ['pull', '--quiet'], { cwd: dest, stdio: 'pipe' });
    ok(`${skill.name} updated`);
    return;
  }

  const result = spawnSync('git', ['clone', '--quiet', skill.repo, dest], {
    stdio: 'pipe', timeout: 60000,
  });

  if (result.status === 0) {
    ok(`${skill.name} installed`);
  } else {
    fail(`Clone failed: ${skill.repo}`);
  }
}

function installNpxSkill(skill) {
  info('Running npx get-shit-done-cc@latest (may take a minute)...');
  const result = spawnSync('npx', ['get-shit-done-cc@latest', '--claude', '--global'], {
    stdio: 'pipe', timeout: 120000,
  });

  if (result.status === 0) {
    ok('GSD installed globally');
  } else {
    warn('Auto-install failed. Run manually:');
    info('npx get-shit-done-cc@latest');
  }
}

function installMultiSkill(skill) {
  const tmpDir = `/tmp/skill-install-${process.pid}-${skill.name}`;

  const result = spawnSync('git', ['clone', '--quiet', skill.repo, tmpDir], {
    stdio: 'pipe', timeout: 60000,
  });

  if (result.status !== 0) {
    fail(`Clone failed: ${skill.repo}`);
    return;
  }

  // Copy skills from subdirectory
  if (skill.skillsPath) {
    const srcDir = join(tmpDir, skill.skillsPath);
    if (existsSync(srcDir)) {
      for (const item of readdirSync(srcDir)) {
        const src = join(srcDir, item);
        const dest = join(SKILLS_DIR, item);
        cpSync(src, dest, { recursive: true });
      }
    }
  }

  // Copy agents
  if (skill.agentsPath) {
    const agentsDest = AGENTS_DIR;
    mkdirp(agentsDest);
    const agentSrcDir = join(tmpDir, skill.agentsPath);
    if (existsSync(agentSrcDir)) {
  for (const item of readdirSync(agentSrcDir)) {
        const src = join(agentSrcDir, item);
        cpSync(src, join(agentsDest, item), { recursive: true });
      }
    }
  }

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
  ok(`${skill.name} installed`);
}

// ── Main entry ──────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listSkills();
      break;
    case 'install':
    case 'add':
      await installSkills();
      break;
    case 'remove':
    case 'rm':
    case 'uninstall':
      await removeSkills();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}Skills management${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack skills${c.reset}          ${c.dim}List installed skills${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack skills install${c.reset}   ${c.dim}Install skills from catalog${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack skills remove${c.reset}    ${c.dim}Remove installed skills${c.reset}`);
      console.log('');
  }
}
