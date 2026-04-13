/**
 * lib/git-scopes.mjs -- Schema, detection, and skill installation for git-conventions.
 *
 * Exports:
 *   validateScopes(obj)            -- validate a git-scopes.json config object
 *   readScopes(projectDir)         -- read .claude/git-scopes.json from a project dir
 *   writeScopes(projectDir, obj)   -- write .claude/git-scopes.json atomically
 *   detectStack(projectDir)        -- auto-detect monorepo stack type + scopes
 *   detectMainBranch(projectDir)   -- auto-detect main branch via git fallback chain
 *   installSkill(projectPath, config) -- render + write git-conventions SKILL.md
 *   printCommitlintInstructions(config) -- print commitlint setup commands
 *   createDefaultConfig(name, detected) -- build default v1 config object
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJson, mkdirp, runCmd, hasCommand } from './shared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

// ── checkPrereqs ──────────────────────────────────────────────────────────────

/**
 * Check prerequisites for git-conventions commands.
 *
 * @param {string} projectDir
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkPrereqs(projectDir) {
  const missing = [];
  if (!hasCommand('git')) {
    missing.push('git');
    return { ok: false, missing };
  }
  if (!existsSync(join(projectDir, '.git'))) {
    missing.push('not-a-git-repo');
  }
  return { ok: missing.length === 0, missing };
}

// ── validateScopes ────────────────────────────────────────────────────────────

/**
 * Validate a git-scopes.json config object.
 *
 * @param {*} obj
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateScopes(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, reason: 'not-an-object' };
  }
  if (obj.version !== 1) {
    return { valid: false, reason: 'unknown-version' };
  }
  if (!Array.isArray(obj.scopes) || obj.scopes.length === 0) {
    return { valid: false, reason: 'missing-scopes' };
  }
  if (typeof obj.main_branch !== 'string') {
    return { valid: false, reason: 'missing-main-branch' };
  }
  return { valid: true };
}

// ── readScopes ────────────────────────────────────────────────────────────────

/**
 * Read and validate .claude/git-scopes.json from a project directory.
 *
 * @param {string} projectDir
 * @returns {object|null} parsed config or null if missing/invalid
 */
export function readScopes(projectDir) {
  const scopesPath = join(projectDir, '.claude', 'git-scopes.json');
  if (!existsSync(scopesPath)) return null;
  let obj;
  try {
    obj = JSON.parse(readFileSync(scopesPath, 'utf8'));
  } catch {
    return null;
  }
  const { valid } = validateScopes(obj);
  return valid ? obj : null;
}

// ── writeScopes ───────────────────────────────────────────────────────────────

/**
 * Atomically write a config object to .claude/git-scopes.json.
 *
 * @param {string} projectDir
 * @param {object} config
 */
export function writeScopes(projectDir, config) {
  const scopesPath = join(projectDir, '.claude', 'git-scopes.json');
  atomicWriteJson(scopesPath, config);
}

// ── detectStack ───────────────────────────────────────────────────────────────

/**
 * Expand a simple glob pattern (e.g. "apps/*") by listing direct children.
 * Does NOT support ** or nested globs -- direct children only.
 *
 * @param {string} projectDir
 * @param {string} pattern  e.g. "apps/*" or "packages/*"
 * @returns {string[]} directory names (basenames)
 */
function expandGlobPattern(projectDir, pattern) {
  const parts = pattern.split('/');
  // Remove trailing wildcard segment
  const parentSegments = parts.slice(0, -1);
  if (parentSegments.length === 0) return [];
  const parentDir = join(projectDir, ...parentSegments);
  if (!existsSync(parentDir)) return [];
  try {
    return readdirSync(parentDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Auto-detect monorepo stack type and scopes from sentinel files.
 * Checks in order of highest signal first.
 *
 * @param {string} projectDir
 * @returns {{ scopes: string[], confidence: 'high'|'medium'|'low', source: string }}
 */
export function detectStack(projectDir) {
  // 1. pnpm-workspace.yaml
  const pnpmWs = join(projectDir, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWs)) {
    try {
      const content = readFileSync(pnpmWs, 'utf8');
      const scopes = extractScopesFromPnpmWorkspace(content, projectDir);
      if (scopes.length > 0) return { scopes, confidence: 'high', source: 'pnpm-workspace' };
    } catch {
      // Fall through to next detector
    }
  }

  // 2. package.json workspaces
  const pkgJson = join(projectDir, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
      if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
        // Only process if NOT turbo (turbo is checked later with lower priority)
        // pnpm is already handled above, so this is npm workspaces
        const scopes = [];
        for (const pattern of pkg.workspaces) {
          scopes.push(...expandGlobPattern(projectDir, pattern));
        }
        if (scopes.length > 0) {
          // Check if turbo.json exists -- if so, skip here (turbo handles it)
          if (!existsSync(join(projectDir, 'turbo.json'))) {
            return { scopes, confidence: 'high', source: 'npm-workspaces' };
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  // 3. lerna.json
  const lernaJson = join(projectDir, 'lerna.json');
  if (existsSync(lernaJson)) {
    try {
      const lerna = JSON.parse(readFileSync(lernaJson, 'utf8'));
      if (Array.isArray(lerna.packages) && lerna.packages.length > 0) {
        const scopes = [];
        for (const pattern of lerna.packages) {
          scopes.push(...expandGlobPattern(projectDir, pattern));
        }
        if (scopes.length > 0) return { scopes, confidence: 'high', source: 'lerna' };
      }
    } catch {
      // Fall through
    }
  }

  // 4. nx.json (heuristic -- scan apps/ and packages/)
  if (existsSync(join(projectDir, 'nx.json'))) {
    const scopes = [];
    for (const dir of ['apps', 'packages']) {
      const full = join(projectDir, dir);
      if (existsSync(full)) {
        try {
          const entries = readdirSync(full, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name);
          scopes.push(...entries);
        } catch {
          // Continue
        }
      }
    }
    if (scopes.length > 0) return { scopes, confidence: 'medium', source: 'nx' };
  }

  // 5. turbo.json (use package.json workspaces if present)
  if (existsSync(join(projectDir, 'turbo.json'))) {
    if (existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
        if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
          const scopes = [];
          for (const pattern of pkg.workspaces) {
            scopes.push(...expandGlobPattern(projectDir, pattern));
          }
          if (scopes.length > 0) return { scopes, confidence: 'high', source: 'turbo' };
        }
      } catch {
        // Fall through
      }
    }
  }

  // 6. Cargo.toml [workspace]
  const cargoToml = join(projectDir, 'Cargo.toml');
  if (existsSync(cargoToml)) {
    try {
      const content = readFileSync(cargoToml, 'utf8');
      if (content.includes('[workspace]')) {
        const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
        if (membersMatch) {
          const membersList = membersMatch[1];
          const scopes = [];
          // Extract quoted strings from the members array
          const memberRegex = /["']([^"']+)["']/g;
          let m;
          while ((m = memberRegex.exec(membersList)) !== null) {
            scopes.push(basename(m[1]));
          }
          if (scopes.length > 0) return { scopes, confidence: 'high', source: 'cargo-workspace' };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 7. Go multi-module: subdirs containing go.mod (1 or 2 levels deep)
  // Skip heavy/internal directories that are never go module roots
  const GO_SKIP_DIRS = new Set(['node_modules', 'vendor', '.git']);
  try {
    const entries = readdirSync(projectDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !GO_SKIP_DIRS.has(e.name));
    const goScopes = [];
    for (const entry of entries) {
      const goMod = join(projectDir, entry.name, 'go.mod');
      if (existsSync(goMod)) {
        goScopes.push(entry.name);
      } else {
        // Check one level deeper (cmd/server/go.mod → scope "server")
        const subDir = join(projectDir, entry.name);
        try {
          const subEntries = readdirSync(subDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !GO_SKIP_DIRS.has(e.name));
          for (const sub of subEntries) {
            if (existsSync(join(subDir, sub.name, 'go.mod'))) {
              goScopes.push(sub.name);
            }
          }
        } catch { /* ignore */ }
      }
    }
    if (goScopes.length > 0) return { scopes: goScopes, confidence: 'high', source: 'go-multi-module' };
  } catch {
    // Fall through
  }

  // 8. pyproject.toml [tool.uv.workspace]
  const pyprojectToml = join(projectDir, 'pyproject.toml');
  if (existsSync(pyprojectToml)) {
    try {
      const content = readFileSync(pyprojectToml, 'utf8');
      if (content.includes('[tool.uv.workspace]')) {
        const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
        if (membersMatch) {
          const membersList = membersMatch[1];
          const scopes = [];
          const memberRegex = /["']([^"']+)["']/g;
          let m;
          while ((m = memberRegex.exec(membersList)) !== null) {
            // Expand glob patterns
            const expanded = expandGlobPattern(projectDir, m[1]);
            if (expanded.length > 0) {
              scopes.push(...expanded);
            } else {
              scopes.push(basename(m[1]));
            }
          }
          if (scopes.length > 0) return { scopes, confidence: 'high', source: 'python-uv' };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 9. Fallback
  return { scopes: ['core'], confidence: 'low', source: 'fallback' };
}

/**
 * Extract scope names from a pnpm-workspace.yaml content.
 * Parses the packages: block using regex (no yaml parser dep).
 *
 * @param {string} content  raw file content
 * @param {string} projectDir
 * @returns {string[]}
 */
function extractScopesFromPnpmWorkspace(content, projectDir) {
  // Find lines after "packages:" that start with "  -"
  const lines = content.split('\n');
  let inPackages = false;
  const patterns = [];
  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      // Stop at non-indented lines (new top-level key)
      if (line.length > 0 && !/^\s/.test(line) && !/^#/.test(line)) {
        inPackages = false;
        continue;
      }
      // Match list items: "  - 'apps/*'" or '  - "apps/*"' or '  - apps/*'
      const itemMatch = line.match(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/);
      if (itemMatch) {
        patterns.push(itemMatch[1].trim());
      }
    }
  }

  const scopes = [];
  for (const pattern of patterns) {
    const expanded = expandGlobPattern(projectDir, pattern);
    scopes.push(...expanded);
  }
  return scopes;
}

// ── detectMainBranch ──────────────────────────────────────────────────────────

/**
 * Auto-detect the main branch of a git repository.
 * Uses a three-step fallback chain ending in null.
 *
 * @param {string} projectDir
 * @returns {string|null}
 */
export function detectMainBranch(projectDir) {
  // Step 1: git symbolic-ref refs/remotes/origin/HEAD
  const step1 = runCmd('git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null', { cwd: projectDir });
  if (step1) {
    // Returns e.g. "origin/main" -- strip "origin/" prefix
    return step1.replace(/^origin\//, '');
  }

  // Step 2: set-head then retry
  runCmd('git remote set-head origin --auto 2>/dev/null', { cwd: projectDir });
  const step2 = runCmd('git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null', { cwd: projectDir });
  if (step2) {
    return step2.replace(/^origin\//, '');
  }

  // Step 3: current branch as proxy fallback
  const step3 = runCmd('git branch --show-current 2>/dev/null', { cwd: projectDir });
  if (step3) return step3;

  return null;
}

// ── installSkill ──────────────────────────────────────────────────────────────

/**
 * Render the git-conventions SKILL.md template and write it to the project.
 *
 * @param {string} projectPath
 * @param {object} config  must have scopes, main_branch, ticket_prefix, co_authored_by
 */
export function installSkill(projectPath, config) {
  const tmplPath = join(PKG_ROOT, 'templates', 'skills', 'git-conventions', 'SKILL.md.tmpl');
  let content = readFileSync(tmplPath, 'utf8');

  // Replace tokens
  const scopesList = config.scopes.map(s => `- \`${s}\``).join('\n');
  content = content.replaceAll('{{SCOPES_LIST}}', scopesList);
  content = content.replaceAll('{{MAIN_BRANCH}}', config.main_branch || 'main');
  content = content.replaceAll(
    '{{TICKET_FORMAT}}',
    config.ticket_prefix ? `; ${config.ticket_prefix}NNN` : ''
  );
  content = content.replaceAll(
    '{{CO_AUTHORED_BY_SECTION}}',
    config.co_authored_by ? '- [ ] Co-Authored-By line included' : ''
  );

  const gitmoji = config.gitmoji && typeof config.gitmoji === 'object';
  const gitmojiSection = gitmoji
    ? [
        '',
        '## Gitmoji Prefixes',
        'Prepend the emoji to the commit subject:',
        ...Object.entries(config.gitmoji).map(([type, emoji]) => `- ${type} → ${emoji} ${type}(scope): subject`),
      ].join('\n')
    : '';
  content = content.replaceAll('{{GITMOJI_SECTION}}', gitmojiSection);

  // Safety check: no unreplaced tokens
  if (content.includes('{{')) {
    throw new Error('SKILL.md template has unreplaced tokens');
  }

  const dest = join(projectPath, '.claude', 'skills', 'git-conventions', 'SKILL.md');
  mkdirp(dirname(dest));
  writeFileSync(dest, content, 'utf8');
}

// ── printCommitlintInstructions ───────────────────────────────────────────────

/**
 * Print commitlint setup instructions to console.
 * Never spawns npm install -- print-only per GIT-10.
 *
 * @param {object} config  must have scopes and types arrays
 */
export function printCommitlintInstructions(config) {
  console.log('');
  console.log('  Install commitlint:');
  console.log('');
  console.log('  npm install --save-dev @commitlint/cli@^19 @commitlint/config-conventional@^19 husky@^9');
  console.log('  npx husky init');
  console.log("  echo 'npx --no -- commitlint --edit \"$1\"' > .husky/commit-msg");
  console.log('');
  console.log('  commitlint.config.mjs:');
  console.log('');

  const scopeEnum = JSON.stringify(config.scopes || []);
  const typeEnum = JSON.stringify(config.types || ['feat', 'fix', 'refactor', 'test', 'docs', 'ci', 'chore']);

  console.log(`  export default {`);
  console.log(`    extends: ['@commitlint/config-conventional'],`);
  console.log(`    rules: {`);
  console.log(`      'scope-enum': [2, 'always', ${scopeEnum}],`);
  console.log(`      'type-enum': [2, 'always', ${typeEnum}],`);
  console.log(`    },`);
  console.log(`  };`);
  console.log('');
}

// ── createDefaultConfig ───────────────────────────────────────────────────────

/**
 * Build a default v1 config object from project name and detected stack.
 *
 * @param {string} projectName
 * @param {{ scopes: string[], source: string, confidence: string }} detected
 * @returns {object} v1 config
 */
export function createDefaultConfig(projectName, detected) {
  return {
    version: 1,
    project: projectName,
    scopes: detected.scopes,
    types: ['feat', 'fix', 'refactor', 'test', 'docs', 'ci', 'chore'],
    ticket_prefix: '',
    ticket_regex: '',
    main_branch: 'main',
    branch_format: '{ticket}-{description}',
    commit_format: 'type(scope): subject',
    co_authored_by: false,
    commitlint_enforced: false,
    auto_detect: { enabled: true, sources: [detected.source] },
  };
}
