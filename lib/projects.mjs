/**
 * Project management — list, add, remove projects in the vault.
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, askPath, askPathAutocomplete, mkdirp } from './shared.mjs';

// ── Find vault ──────────────────────────────────────────────────
export function findVault() {
  const candidates = [
    join(homedir(), 'vault'),
    join(homedir(), 'Vault'),
    join(homedir(), '.vault'),
    join(homedir(), 'obsidian-vault'),
    join(homedir(), 'Documents', 'vault'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta')) && existsSync(join(dir, 'projects'))) {
      return dir;
    }
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, 'CLAUDE.md.template'))) {
      return dir;
    }
  }
  return null;
}

async function resolveVault() {
  let vaultPath = findVault();

  if (vaultPath) {
    info(`Vault: ${vaultPath.replace(homedir(), '~')}`);
    return vaultPath;
  }

  console.log(`    ${c.dim}Could not find vault automatically. Tab to autocomplete.${c.reset}`);
  vaultPath = await askPath('Vault path', join(homedir(), 'vault'));
  vaultPath = vaultPath.replace(/^~/, homedir());

  if (!existsSync(join(vaultPath, 'projects'))) {
    fail('Not a valid vault (no projects/ directory)');
    info('Run the full setup first: claude-dev-stack');
    return null;
  }
  return vaultPath;
}

function getProjects(vaultPath) {
  const projectsDir = join(vaultPath, 'projects');
  if (!existsSync(projectsDir)) return [];

  return readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template')
    .map(e => {
      const dir = join(projectsDir, e.name);
      const contextPath = join(dir, 'context.md');
      const hasContext = existsSync(contextPath);
      let contextSize = 0;
      let lastModified = null;

      if (hasContext) {
        const stat = statSync(contextPath);
        contextSize = stat.size;
        lastModified = stat.mtime;
      }

      const sessionsDir = join(dir, 'sessions');
      const sessionCount = existsSync(sessionsDir)
        ? readdirSync(sessionsDir).filter(f => f.endsWith('.md')).length
        : 0;

      const decisionsDir = join(dir, 'decisions');
      const decisionCount = existsSync(decisionsDir)
        ? readdirSync(decisionsDir).filter(f => f.endsWith('.md')).length
        : 0;

      return {
        name: e.name,
        path: dir,
        hasContext,
        contextSize,
        lastModified,
        sessionCount,
        decisionCount,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── List ─────────────────────────────────────────────────────────
export async function listProjects() {
  console.log('');
  console.log(`  ${c.bold}Projects${c.reset}`);
  console.log('');

  const vaultPath = await resolveVault();
  if (!vaultPath) return;

  const projects = getProjects(vaultPath);

  if (projects.length === 0) {
    warn('No projects in vault');
    info('Run: claude-dev-stack add-project');
    console.log('');
    return;
  }

  for (const p of projects) {
    const status = p.hasContext && p.contextSize > 100
      ? `${c.green}✔${c.reset}`
      : `${c.yellow}⚠${c.reset}`;

    const contextHint = p.hasContext
      ? (p.contextSize > 100 ? `${c.dim}context.md filled${c.reset}` : `${c.yellow}context.md empty${c.reset}`)
      : `${c.red}no context.md${c.reset}`;

    const sessions = p.sessionCount > 0 ? `${p.sessionCount} sessions` : '';
    const decisions = p.decisionCount > 0 ? `${p.decisionCount} ADRs` : '';
    const extras = [sessions, decisions].filter(Boolean).join(', ');
    const extrasStr = extras ? ` ${c.dim}(${extras})${c.reset}` : '';

    console.log(`    ${status} ${c.bold}${p.name}${c.reset} — ${contextHint}${extrasStr}`);
  }

  console.log('');
  info(`${projects.length} project(s) in ${vaultPath.replace(homedir(), '~')}`);
  console.log('');
}

// ── Remove ───────────────────────────────────────────────────────
export async function removeProject() {
  console.log('');
  console.log(`  ${c.bold}Remove project${c.reset}`);
  console.log('');

  const vaultPath = await resolveVault();
  if (!vaultPath) return;

  const projects = getProjects(vaultPath);

  if (projects.length === 0) {
    warn('No projects to remove');
    return;
  }

  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select projects to remove from vault',
    choices: projects.map(p => {
      const extras = [];
      if (p.sessionCount > 0) extras.push(`${p.sessionCount} sessions`);
      if (p.decisionCount > 0) extras.push(`${p.decisionCount} ADRs`);
      const hint = extras.length > 0 ? ` ${c.dim}(${extras.join(', ')})${c.reset}` : '';
      return {
        title: `${p.name}${hint}`,
        value: p.name,
        selected: false,
      };
    }),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('No projects selected');
    return;
  }

  console.log('');
  warn(`This will delete vault data for: ${selected.join(', ')}`);
  info('This does NOT delete your source code — only vault context, sessions, and decisions.');
  console.log('');

  const { confirm } = await prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${selected.length} project(s) from vault?`,
    initial: false,
  });

  if (!confirm) {
    info('Cancelled');
    return;
  }

  for (const name of selected) {
    const projDir = join(vaultPath, 'projects', name);
    try {
      rmSync(projDir, { recursive: true, force: true });
      ok(`Removed ${name}`);
    } catch (err) {
      fail(`Failed to remove ${name}: ${err.message}`);
    }
  }

  // Update registry
  const registryPath = join(vaultPath, 'meta', 'project-registry.md');
  if (existsSync(registryPath)) {
    let registry = readFileSync(registryPath, 'utf8');
    for (const name of selected) {
      registry = registry.replace(new RegExp(`\\|\\s*${name}\\s*\\|[^\\n]*\\n`, 'g'), '');
    }
    const { writeFileSync } = await import('fs');
    writeFileSync(registryPath, registry);
    ok('Updated project-registry.md');
  }

  console.log('');
}

// ── Map: assign directory paths to vault projects ────────────────
export async function mapProjects() {
  console.log('');
  console.log(`  ${c.bold}Map directories to projects${c.reset}`);
  console.log(`  ${c.dim}Link source code directories to vault project names.${c.reset}`);
  console.log(`  ${c.dim}This allows hooks to load the right context regardless of folder name.${c.reset}`);
  console.log('');

  const vaultPath = await resolveVault();
  if (!vaultPath) return;

  const projects = getProjects(vaultPath);
  if (projects.length === 0) {
    warn('No projects in vault');
    return;
  }

  const { updateProjectMap } = await import('./add-project.mjs');

  // Load existing map
  const mapPath = join(vaultPath, 'project-map.json');
  let existingMap = {};
  if (existsSync(mapPath)) {
    try {
      existingMap = JSON.parse(readFileSync(mapPath, 'utf8')).projects || {};
    } catch {}
  }

  // Reverse map: project name → path
  const reverseMap = {};
  for (const [dir, name] of Object.entries(existingMap)) {
    reverseMap[name] = dir;
  }

  // Show already mapped projects
  const mapped = projects.filter(p => reverseMap[p.name]);
  const unmapped = projects.filter(p => !reverseMap[p.name]);

  if (mapped.length > 0) {
    info(`${mapped.length} project(s) already mapped:`);
    for (const p of mapped) {
      console.log(`      ${c.green}✔${c.reset} ${p.name} → ${c.dim}${reverseMap[p.name].replace(homedir(), '~')}${c.reset}`);
    }
    console.log('');
  }

  if (unmapped.length === 0) {
    ok('All projects mapped');
    const { remap } = await prompt({
      type: 'confirm',
      name: 'remap',
      message: 'Re-map existing projects?',
      initial: false,
    });
    if (!remap) {
      console.log('');
      return;
    }
  }

  // Ask: are projects in one directory?
  const { hasBaseDir } = await prompt({
    type: 'confirm',
    name: 'hasBaseDir',
    message: 'Are your projects in one directory? (e.g. ~/Projects)',
    initial: true,
  });

  if (hasBaseDir) {
    // Scan base directory and match to vault projects
    const { baseDir } = await prompt({
      type: 'text',
      name: 'baseDir',
      message: 'Projects directory',
      initial: join(homedir(), 'Projects'),
    });

    const resolvedBase = (baseDir || '').replace(/^~/, homedir());
    if (!existsSync(resolvedBase)) {
      fail(`Directory not found: ${resolvedBase}`);
      return;
    }

    const dirs = listDirs(resolvedBase);
    if (dirs.length === 0) {
      warn('No subdirectories found');
      return;
    }

    // For each unmapped project, try to find matching directory
    const toMap = unmapped.length > 0 ? unmapped : projects;
    console.log('');

    for (const p of toMap) {
      // Try auto-match: exact name, case-insensitive, or contains
      const nameLower = p.name.toLowerCase();
      const exactMatch = dirs.find(d => d.name.toLowerCase() === nameLower);
      const fuzzyMatches = dirs.filter(d => {
        const dl = d.name.toLowerCase();
        return dl.includes(nameLower) || nameLower.includes(dl);
      });

      if (exactMatch) {
        updateProjectMap(vaultPath, exactMatch.path, p.name);
        ok(`${p.name} → ${c.dim}${exactMatch.path.replace(homedir(), '~')}${c.reset}`);
      } else if (fuzzyMatches.length > 0) {
        const { selected } = await prompt({
          type: 'select',
          name: 'selected',
          message: `Directory for "${p.name}"`,
          choices: [
            ...fuzzyMatches.map(d => ({
              title: d.name,
              value: d.path,
            })),
            ...dirs.filter(d => !fuzzyMatches.includes(d)).slice(0, 10).map(d => ({
              title: `${c.dim}${d.name}${c.reset}`,
              value: d.path,
            })),
            { title: 'Skip', value: '__skip__' },
          ],
        });

        if (selected && selected !== '__skip__') {
          updateProjectMap(vaultPath, selected, p.name);
          ok(`${p.name} → ${c.dim}${selected.replace(homedir(), '~')}${c.reset}`);
        }
      } else {
        // Show all directories for manual selection
        const { selected } = await prompt({
          type: 'select',
          name: 'selected',
          message: `Directory for "${p.name}"`,
          choices: [
            ...dirs.map(d => ({ title: d.name, value: d.path })),
            { title: 'Skip', value: '__skip__' },
          ],
        });

        if (selected && selected !== '__skip__') {
          updateProjectMap(vaultPath, selected, p.name);
          ok(`${p.name} → ${c.dim}${selected.replace(homedir(), '~')}${c.reset}`);
        }
      }
    }
  } else {
    // Manual mode: for each project, type path
    const toMap = unmapped.length > 0 ? unmapped : projects;

    for (const p of toMap) {
      const { path } = await prompt({
        type: 'text',
        name: 'path',
        message: `Path to ${p.name} (enter to skip)`,
        initial: reverseMap[p.name] || '',
      });

      if (path) {
        const resolved = path.replace(/^~/, homedir()).replace(/\/+$/, '');
        if (existsSync(resolved)) {
          updateProjectMap(vaultPath, resolved, p.name);
          ok(`${p.name} → ${c.dim}${resolved.replace(homedir(), '~')}${c.reset}`);
        } else {
          warn(`${resolved.replace(homedir(), '~')} does not exist`);
        }
      }
    }
  }

  console.log('');
  ok('Project mapping updated');
  console.log('');
}

// ── Main entry ───────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listProjects();
      break;
    case 'add':
    case 'new': {
      const { main: addProject } = await import('./add-project.mjs');
      await addProject();
      break;
    }
    case 'remove':
    case 'rm':
      await removeProject();
      break;
    case 'map':
    case 'link':
      await mapProjects();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}Project management${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack projects${c.reset}          ${c.dim}List projects and status${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack projects add${c.reset}      ${c.dim}Add a project to vault${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack projects remove${c.reset}   ${c.dim}Remove project from vault${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack projects map${c.reset}      ${c.dim}Map directories to project names${c.reset}`);
      console.log('');
  }
}
