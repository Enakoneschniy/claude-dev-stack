/**
 * vendor-gsd.mjs
 *
 * One-time script to copy GSD workflow engine into vendor/cds-workflow/ and
 * rewrite all internal path references from `/.claude/get-shit-done` to
 * `/.claude/cds-workflow`.
 *
 * Safe replacement pattern: replaces only filesystem path references,
 * NOT the npm package name `get-shit-done-cc`.
 *
 * Usage: node scripts/vendor-gsd.mjs
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const VENDOR_DEST = join(PKG_ROOT, 'vendor', 'cds-workflow');
const GSD_SRC = join(homedir(), '.claude', 'get-shit-done');
const AGENTS_SRC = join(homedir(), '.claude', 'agents');
const SKILLS_SRC = join(homedir(), '.claude', 'skills');

const OLD_PATH = '/.claude/get-shit-done';
const NEW_PATH = '/.claude/cds-workflow';

const TEXT_EXTENSIONS = new Set(['.md', '.cjs', '.json', '.sh', '.mjs', '.ts', '.txt', '.yaml', '.yml']);

function isTextFile(filePath) {
  const ext = extname(filePath);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (ext === '') return true; // VERSION and similar
  return false;
}

function rewriteFile(filePath) {
  if (!isTextFile(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  if (!content.includes(OLD_PATH)) return;
  const updated = content.replaceAll(OLD_PATH, NEW_PATH);
  writeFileSync(filePath, updated, 'utf8');
}

function walkAndRewrite(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndRewrite(fullPath);
    } else if (entry.isFile()) {
      rewriteFile(fullPath);
    }
  }
}

function grepDir(dir, pattern) {
  const matches = [];
  function walk(d) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isTextFile(fullPath)) {
        const content = readFileSync(fullPath, 'utf8');
        if (content.includes(pattern)) {
          matches.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return matches;
}

// Step 1: Copy GSD core
console.log(`[1/7] Copying GSD core: ${GSD_SRC} -> ${VENDOR_DEST}`);
mkdirSync(VENDOR_DEST, { recursive: true });
cpSync(GSD_SRC, VENDOR_DEST, { recursive: true });

// Step 2: Copy agents (gsd-*.md only)
console.log('[2/7] Copying GSD agents...');
const agentsDest = join(VENDOR_DEST, 'agents');
mkdirSync(agentsDest, { recursive: true });
const agentFiles = readdirSync(AGENTS_SRC).filter(f => f.startsWith('gsd-'));
console.log(`      Found ${agentFiles.length} agent files`);
for (const f of agentFiles) {
  cpSync(join(AGENTS_SRC, f), join(agentsDest, f));
}

// Step 3: Copy skills (gsd-*/ directories only)
console.log('[3/7] Copying GSD skills...');
const skillsDest = join(VENDOR_DEST, 'skills');
mkdirSync(skillsDest, { recursive: true });
const skillDirs = readdirSync(SKILLS_SRC).filter(d => d.startsWith('gsd-'));
console.log(`      Found ${skillDirs.length} skill directories`);
for (const d of skillDirs) {
  cpSync(join(SKILLS_SRC, d), join(skillsDest, d), { recursive: true });
}

// Step 4: Bulk path rewrite
console.log('[4/7] Rewriting path references...');
walkAndRewrite(VENDOR_DEST);

// Step 5: Verify no corruption (cds-workflow-cc must not appear)
console.log('[5/7] Verifying no npm package name corruption...');
const corrupted = grepDir(VENDOR_DEST, 'cds-workflow-cc');
if (corrupted.length > 0) {
  console.error('ERROR: Found corrupted npm package name references:');
  for (const f of corrupted) console.error('  ', f);
  process.exit(1);
}
console.log('      No corruption found');

// Step 6: Set VERSION
console.log('[6/7] Setting fork VERSION...');
writeFileSync(join(VENDOR_DEST, 'VERSION'), '1.36.0-cds.1\n', 'utf8');

// Step 7: Remove npm artifacts and .git if present
console.log('[7/7] Removing npm artifacts...');
const toRemove = ['node_modules', 'package.json', 'package-lock.json', '.git'];
for (const name of toRemove) {
  const p = join(VENDOR_DEST, name);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`      Removed: ${name}`);
  }
}

console.log('\nVendor copy complete.');
console.log(`  Location: ${VENDOR_DEST}`);
console.log(`  Agents:   ${agentFiles.length} files`);
console.log(`  Skills:   ${skillDirs.length} directories`);
