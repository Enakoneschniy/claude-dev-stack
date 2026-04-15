// lib/install/skills.mjs — Obsidian Skills, Custom Skills, and Deep Research installation

import { existsSync, cpSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { c, ok, fail, warn, info, step, runCmd, mkdirp, spawnSync } from '../shared.mjs';

// ── Install: Obsidian Skills ────────────────────────────────────
export function installObsidianSkills(skillsDir, stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, '🔌 Installing Obsidian Skills (kepano)');

  const dest = join(skillsDir, 'obsidian');
  mkdirp(skillsDir);

  if (existsSync(dest)) {
    info('Already installed, pulling latest...');
    runCmd('git pull --quiet', { cwd: dest });
    ok('Updated');
    return true;
  }

  const result = spawnSync('git', ['clone', '--quiet',
    'https://github.com/kepano/obsidian-skills.git', dest,
  ], { stdio: 'pipe', timeout: 60000 });

  if (result.status === 0) {
    ok('Obsidian Skills installed');
    return true;
  } else {
    fail('Clone failed. Try manually:');
    info('git clone https://github.com/kepano/obsidian-skills.git ~/.claude/skills/obsidian');
    return false;
  }
}

// ── Install: Custom Skills ──────────────────────────────────────
export function installCustomSkills(skillsDir, stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, '⚙️  Installing custom skills');

  mkdirp(skillsDir);

  // D-17: Remove deprecated skills migrated to hooks in v0.12 Phase 31
  // dev-router → hooks/dev-router.mjs (SKL-01)
  // project-switcher → hooks/project-switcher.mjs (SKL-03)
  const DEPRECATED_SKILLS = ['dev-router', 'project-switcher'];
  for (const name of DEPRECATED_SKILLS) {
    const path = join(skillsDir, name);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      info(`Removed deprecated skill: ${name} (migrated to hook)`);
    }
  }

  const skillsSrcDir = join(pkgRoot, 'skills');
  // D-15: skillNames excludes dev-router/project-switcher (replaced by hooks)
  const skillNames = ['session-manager', 'dev-research'];

  for (const name of skillNames) {
    const src = join(skillsSrcDir, name, 'SKILL.md');
    const destDir = join(skillsDir, name);
    mkdirp(destDir);

    if (existsSync(src)) {
      cpSync(src, join(destDir, 'SKILL.md'));
      ok(name);
    } else {
      warn(`${name} — source not found in package`);
    }
  }

  return true;
}

// ── Install: Deep Research ──────────────────────────────────────
export function installDeepResearch(skillsDir, agentsDir, stepNum, totalSteps) {
  step(stepNum, totalSteps, '🔍 Installing Deep Research Skills');

  mkdirp(skillsDir);
  mkdirp(agentsDir);

  const tmpDir = `/tmp/deep-research-skills-${process.pid}`;
  const result = spawnSync('git', ['clone', '--quiet',
    'https://github.com/Weizhena/Deep-Research-skills.git', tmpDir,
  ], { stdio: 'pipe', timeout: 60000 });

  if (result.status !== 0) {
    fail('Clone failed. Try manually:');
    info('git clone https://github.com/Weizhena/Deep-Research-skills.git');
    return false;
  }

  // Copy skills
  const skillsSrc = join(tmpDir, 'skills', 'research-en');
  if (existsSync(skillsSrc)) {
    for (const item of readdirSync(skillsSrc)) {
      const src = join(skillsSrc, item);
      const dest = join(skillsDir, item);
      cpSync(src, dest, { recursive: true });
    }
  }

  // Copy agent
  const agentSrc = join(tmpDir, 'agents', 'web-search-agent.md');
  if (existsSync(agentSrc)) {
    cpSync(agentSrc, join(agentsDir, 'web-search-agent.md'));
  }

  // Install pyyaml (avoid --break-system-packages on managed Python envs)
  runCmd('python3 -m pip install --user pyyaml 2>/dev/null || pip3 install pyyaml 2>/dev/null || pip install pyyaml 2>/dev/null');

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });

  ok('Deep Research Skills installed');
  return true;
}
