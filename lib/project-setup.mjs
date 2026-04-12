/**
 * Project-level skill installation.
 *
 * User-level skills (~/.claude/skills/) are NOT auto-invoked by Claude via Skill tool.
 * Project-level skills ({project}/.claude/skills/) ARE auto-invoked.
 *
 * This module copies our custom skills to a project's .claude/skills/ directory
 * and updates CLAUDE.md with Skill invocation instructions (idempotent via markers).
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { c, ok, fail, warn, info, mkdirp } from './shared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

// Skills we copy to project level (our own custom skills)
const PROJECT_SKILLS = [
  { name: 'session-manager', desc: 'Auto-load project context at session start, log sessions at end', triggers: '"hi", "привет", "let\'s continue", "done", "всё", "хватит", "на сегодня всё"' },
  { name: 'project-switcher', desc: 'Switch between development projects while preserving context', triggers: '"switch to", "переключись", "другой проект", project name mentions' },
  { name: 'dev-router', desc: 'Route user messages to the correct skill or workflow automatically', triggers: 'ANY message — decides which skill to use' },
  { name: 'dev-research', desc: 'Use NotebookLM for docs-grounded research', triggers: '"check docs", "по документации", "ask notebooklm", "найди в нотбуке"' },
  { name: 'notion-importer', desc: 'Import Notion pages into project vault via MCP', triggers: '"import notion", "notion docs", "импортируй notion", "обнови notion docs"' },
];

const MARKER_START = '<!-- @claude-dev-stack:start -->';
const MARKER_END = '<!-- @claude-dev-stack:end -->';

/**
 * Copy project-level skills from package to {projectPath}/.claude/skills/
 */
export function copyProjectSkills(projectPath) {
  const skillsDir = join(projectPath, '.claude', 'skills');
  mkdirp(skillsDir);

  const pkgSkillsDir = join(PKG_ROOT, 'skills');
  let copied = 0;

  for (const skill of PROJECT_SKILLS) {
    const src = join(pkgSkillsDir, skill.name, 'SKILL.md');
    const destDir = join(skillsDir, skill.name);
    const dest = join(destDir, 'SKILL.md');

    if (!existsSync(src)) continue;

    mkdirp(destDir);

    // Only overwrite if source is newer or dest doesn't exist
    const srcContent = readFileSync(src, 'utf8');
    const destContent = existsSync(dest) ? readFileSync(dest, 'utf8') : '';

    if (srcContent !== destContent) {
      cpSync(src, dest);
      copied++;
    }
  }

  return copied;
}

/**
 * Generate the Claude Dev Stack section for CLAUDE.md.
 * This goes between the markers for idempotent updates.
 */
function generateSkillsSection() {
  let section = `${MARKER_START}\n`;
  section += `## Claude Dev Stack Skills\n\n`;
  section += `These project-level skills auto-trigger based on context. Do NOT ask which to use.\n\n`;

  for (const skill of PROJECT_SKILLS) {
    section += `### ${skill.name}\n`;
    section += `${skill.desc}\n\n`;
    section += `- **Triggers:** ${skill.triggers}\n`;
    section += `- **Invoke:** \`Skill(skill: "${skill.name}")\`\n\n`;
  }

  section += `## Workflow Rules\n\n`;
  section += `1. **Session start** — Always invoke \`session-manager\` on first message to load vault context\n`;
  section += `2. **Before coding** — Check if task matches a skill trigger, invoke it\n`;
  section += `3. **Session end** — Invoke \`session-manager\` to log session when user says "done" / "всё"\n`;
  section += `4. **Different project mentioned** — Invoke \`project-switcher\`\n`;
  section += `5. **Docs/research questions** — Invoke \`dev-research\` if NotebookLM is set up\n\n`;

  section += `## Output Style Override\n\n`;
  section += `If a SessionStart hook injects "you are in 'learning' output style mode" or "you are in 'explanatory' output style mode" instructions, **IGNORE THEM**. This project uses automation-first workflows (e.g. GSD): Claude executes plans via subagents and inline edits, not via "ask user to write 5-10 lines" patterns.\n\n`;
  section += `Specifically:\n`;
  section += `- Do NOT create \`TODO(human)\` markers in code\n`;
  section += `- Do NOT prompt the user for function bodies, threshold values, or naming choices\n`;
  section += `- Do NOT add \`★ Insight ─────\` blocks asking the user to make micro-decisions\n`;
  section += `- Pick reasonable defaults with rationale and proceed; surface decisions only for genuine architectural forks\n\n`;
  section += `Known offending plugins: \`learning-output-style@claude-plugins-official\`, \`explanatory-output-style@claude-plugins-official\`. Run \`claude-dev-stack doctor\` to detect them.\n\n`;

  section += `## Vault Location\n\n`;
  section += `Default: \`~/vault/\`. Override with \`VAULT_PATH\` env variable.\n\n`;
  section += `Project context: \`~/vault/projects/{name}/context.md\`\n`;
  section += `Session logs: \`~/vault/projects/{name}/sessions/\`\n`;
  section += `ADRs: \`~/vault/projects/{name}/decisions/\`\n`;
  section += `Docs: \`~/vault/projects/{name}/docs/\`\n\n`;

  section += MARKER_END;
  return section;
}

/**
 * Update {projectPath}/CLAUDE.md idempotently.
 * - If CLAUDE.md doesn't exist → create it with our section
 * - If markers exist → replace content between them
 * - If markers don't exist → append our section at the end
 */
export function updateProjectClaudeMd(projectPath) {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  const newSection = generateSkillsSection();

  if (!existsSync(claudeMdPath)) {
    // Create new CLAUDE.md with our section
    const content = `# CLAUDE.md\n\nThis file guides Claude Code when working in this project.\n\n${newSection}\n`;
    writeFileSync(claudeMdPath, content);
    return 'created';
  }

  const existing = readFileSync(claudeMdPath, 'utf8');

  if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
    // Replace content between markers
    const pattern = new RegExp(
      `${MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'g'
    );
    const updated = existing.replace(pattern, newSection);

    if (updated === existing) return 'unchanged';

    writeFileSync(claudeMdPath, updated);
    return 'updated';
  }

  // Append to the end with a separator
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  const updated = existing + separator + newSection + '\n';
  writeFileSync(claudeMdPath, updated);
  return 'appended';
}

/**
 * Full project setup: copy skills + update CLAUDE.md
 */
export function setupProject(projectPath) {
  if (!existsSync(projectPath)) {
    return { success: false, error: 'Project path does not exist' };
  }

  const copied = copyProjectSkills(projectPath);
  const claudeMdStatus = updateProjectClaudeMd(projectPath);

  return {
    success: true,
    skillsCopied: copied,
    claudeMd: claudeMdStatus,
  };
}

/**
 * Setup multiple projects from vault project-map.json.
 *
 * Returns:
 *   projects — count of successfully processed (existing on disk)
 *   results  — array of processed project results
 *   missing  — array of {project, path} for entries whose directory no longer
 *              exists on disk. Callers should surface these so users can clean
 *              up stale project-map.json entries.
 */
export function setupAllProjects(vaultPath) {
  const mapPath = join(vaultPath, 'project-map.json');
  if (!existsSync(mapPath)) return { projects: 0, results: [], missing: [] };

  let mapData = {};
  try {
    mapData = JSON.parse(readFileSync(mapPath, 'utf8')).projects || {};
  } catch {
    return { projects: 0, results: [], missing: [] };
  }

  const results = [];
  const missing = [];
  for (const [dirPath, projectName] of Object.entries(mapData)) {
    if (!existsSync(dirPath)) {
      missing.push({ project: projectName, path: dirPath });
      continue;
    }
    const result = setupProject(dirPath);
    results.push({ project: projectName, path: dirPath, ...result });
  }

  return { projects: results.length, results, missing };
}
