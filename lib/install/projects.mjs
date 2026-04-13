// lib/install/projects.mjs — Project discovery wizard step

import { readdirSync, existsSync as fsExistsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { c, ok, warn, prompt, askPath, step, existsSync, listDirs, homedir } from '../shared.mjs';
import { toSlug } from '../project-naming.mjs';

// ── Read registered project paths from project-map.json ────────
function _registeredPaths(vaultPath) {
  if (!vaultPath) return new Set();
  const mapPath = join(vaultPath, 'project-map.json');
  if (!fsExistsSync(mapPath)) return new Set();
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    return new Set(Object.keys(data.projects || {}));
  } catch {
    return new Set();
  }
}

// ── Step 3: Projects ────────────────────────────────────────────
export async function collectProjects(totalSteps, detectedProjects, detectedBaseDir, vaultPath) {
  step(3, totalSteps, '📂 Projects');

  console.log(`    ${c.dim}Claude Code will maintain separate context for each project.${c.reset}`);
  console.log('');

  // BUG-03: pre-select paths already registered in project-map.json
  const registeredPaths = _registeredPaths(vaultPath);

  const { hasBaseDir } = await prompt({
    type: 'confirm',
    name: 'hasBaseDir',
    message: 'Are your projects in one directory? (e.g. ~/Projects)',
    initial: true,
  });

  const projects = [];
  let resolvedBase = null;

  if (hasBaseDir) {
    // ── Mode A: scan base directory, pick folders ──
    console.log('');
    console.log(`    ${c.dim}Press Tab to autocomplete path.${c.reset}`);
    const baseDir = await askPath('Projects directory', detectedBaseDir || join(homedir(), 'Projects'));
    resolvedBase = baseDir.replace(/^~/, homedir());

    const dirs = listDirs(resolvedBase);

    if (dirs.length === 0) {
      warn(`No subdirectories found in ${resolvedBase.replace(homedir(), '~')}`);
    } else {
      console.log('');
      const { selected } = await prompt({
        type: 'multiselect',
        name: 'selected',
        message: 'Select project directories',
        choices: dirs.map(d => ({
          title: d.name,
          value: d.path,
          // BUG-03: pre-check dirs already in project-map.json
          selected: registeredPaths.has(d.path) ||
            (detectedProjects ? detectedProjects.some(p => p.path === d.path) : false),
        })),
        instructions: false,
        hint: '↑↓ navigate, space toggle, enter confirm',
      });

      const sel = selected || [];

      // Ask project name for each selected directory
      for (const dirPath of sel) {
        const dirName = basename(dirPath);
        const defaultName = toSlug(dirName);

        const { name } = await prompt({
          type: 'text',
          name: 'name',
          message: `Project name for ${c.cyan}${dirName}${c.reset}`,
          initial: defaultName,
        });

        const clean = toSlug(name || defaultName);
        projects.push({ name: clean, path: dirPath });
        ok(`${clean} → ${c.dim}${dirPath.replace(homedir(), '~')}${c.reset}`);
      }
    }

    // Offer to add more manually
    const { addMore } = await prompt({
      type: 'confirm',
      name: 'addMore',
      message: 'Add more projects from other locations?',
      initial: false,
    });

    if (addMore) {
      await addProjectsManually(projects);
    }
  } else {
    // ── Mode B: add projects one by one with full paths ──
    console.log('');
    console.log(`    ${c.dim}Add projects one by one. Press Tab to autocomplete paths.${c.reset}`);
    console.log(`    ${c.dim}Enter empty name to finish.${c.reset}`);
    console.log('');

    await addProjectsManually(projects);
  }

  if (projects.length === 0) {
    warn('No projects added. Adding "my-project" as default.');
    projects.push({ name: 'my-project', path: null });
  }

  console.log('');
  ok(`${c.bold}${projects.length} project(s)${c.reset} configured`);

  return { baseDir: resolvedBase, projects };
}

async function addProjectsManually(projects) {
  while (true) {
    const { name } = await prompt({
      type: 'text',
      name: 'name',
      message: 'Project name (enter to finish)',
    });

    if (!name) break;

    const clean = toSlug(name);
    if (!clean) continue;

    console.log(`    ${c.dim}Tab to autocomplete path:${c.reset}`);
    const p = await askPath(`Path to ${clean}`, '');

    if (p) {
      const resolved = p.replace(/^~/, homedir()).replace(/\/+$/, '');
      if (existsSync(resolved)) {
        projects.push({ name: clean, path: resolved });
        ok(`${clean} → ${c.dim}${resolved.replace(homedir(), '~')}${c.reset}`);
      } else {
        warn(`${resolved.replace(homedir(), '~')} does not exist`);
        projects.push({ name: clean, path: null });
        ok(`${clean} ${c.dim}(path not set)${c.reset}`);
      }
    } else {
      projects.push({ name: clean, path: null });
      ok(`${clean} ${c.dim}(path not set)${c.reset}`);
    }
  }
}
