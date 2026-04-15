/**
 * lib/decisions-cli.mjs — `claude-dev-stack decisions list|show|search` (ADR-02 SC#5, D-12, D-13).
 *
 * Browses `vault/projects/{project}/decisions/` as pure filesystem reads.
 * No API calls, no new deps. Handles both old (no frontmatter) and new
 * (YAML frontmatter) ADR formats.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { ok, warn, info, fail, c } from './shared.mjs';

const PROJECT_NAME_TRAVERSAL_RE = /[/\\]|\.\./;

function vaultRoot() {
  return process.env.VAULT_PATH || join(homedir(), 'vault');
}

function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error(`invalid projectName: ${name}`);
  }
  if (PROJECT_NAME_TRAVERSAL_RE.test(name)) {
    throw new Error(`projectName must not contain path separators or parent refs: ${name}`);
  }
}

// ── parseAdrFile ─────────────────────────────────────────────────

export function parseAdrFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const fname = basename(filePath);
  const fnameMatch = fname.match(/^(\d+)-(.+?)\.md$/);
  const fnameId = fnameMatch ? parseInt(fnameMatch[1], 10) : 0;
  const topicFromFilename = fnameMatch ? fnameMatch[2] : fname.replace(/\.md$/, '');

  let id = fnameId;
  let topic = null;
  let status = 'unknown';
  let date = '';

  const hasFrontmatter = raw.startsWith('---\n');
  if (hasFrontmatter) {
    const end = raw.indexOf('\n---', 4);
    if (end !== -1) {
      const fm = raw.slice(4, end);
      // Flat keys only (id/topic/status/date). Nested `source:` block is ignored here.
      let inNested = false;
      for (const line of fm.split('\n')) {
        if (/^\S/.test(line)) inNested = false;
        if (/^source:\s*$/.test(line)) { inNested = true; continue; }
        if (inNested) continue;
        const m = line.match(/^(id|topic|status|date):\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, v] = m;
        if (k === 'id') id = parseInt(v, 10) || id;
        else if (k === 'topic') topic = v;
        else if (k === 'status') status = v;
        else if (k === 'date') date = v;
      }
    }
  } else {
    // Old format: inline fields via bold label (Russian or English)
    const dateM = raw.match(/^\*\*(?:Дата|Date)\*\*:\s*(.+?)\s*$/m);
    if (dateM) date = dateM[1];
    const statusM = raw.match(/^\*\*(?:Статус|Status)\*\*:\s*(.+?)\s*$/m);
    if (statusM) status = statusM[1];
  }

  // Title: first H1 line, strip `ADR-?\d+:\s*`
  let title = topicFromFilename;
  const h1 = raw.match(/^#\s+(.+?)\s*$/m);
  if (h1) {
    title = h1[1].replace(/^ADR[\s-]*\d+:\s*/, '').trim();
  }

  return { id, topic, topicFromFilename, title, status, date, raw };
}

// ── listDecisions ─────────────────────────────────────────────────

export function listDecisions(decisionsDir) {
  if (!decisionsDir || !existsSync(decisionsDir)) return [];
  let files;
  try { files = readdirSync(decisionsDir).filter((f) => f.endsWith('.md')); }
  catch { return []; }
  const entries = files.map((f) => {
    try { return parseAdrFile(join(decisionsDir, f)); }
    catch { return null; }
  }).filter(Boolean);
  entries.sort((a, b) => a.id - b.id);
  return entries;
}

// ── findDecision ──────────────────────────────────────────────────

export function findDecision(decisionsDir, query) {
  const entries = listDecisions(decisionsDir);
  if (!entries.length || !query) return null;
  const q = String(query).trim();
  // Numeric first
  if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10);
    const hit = entries.find((e) => e.id === n);
    if (hit) return hit;
  }
  // Exact topic / filename slug
  const exact = entries.find((e) => e.topic === q || e.topicFromFilename === q);
  if (exact) return exact;
  // Partial substring (filename slug preferred since topic may be null for old format)
  const partial = entries.find((e) =>
    (e.topic && e.topic.includes(q)) || (e.topicFromFilename && e.topicFromFilename.includes(q))
  );
  return partial || null;
}

// ── searchDecisions ───────────────────────────────────────────────

export function searchDecisions(decisionsDir, term) {
  const entries = listDecisions(decisionsDir);
  if (!entries.length || !term) return [];
  const q = String(term).toLowerCase();
  const scored = entries.map((e) => {
    let score = 0;
    const topicLike = (e.topic || e.topicFromFilename || '').toLowerCase();
    if (topicLike === q) score = Math.max(score, 100);
    if (topicLike.includes(q)) score = Math.max(score, 80);
    if ((e.title || '').toLowerCase().includes(q)) score = Math.max(score, 50);
    if ((e.raw || '').toLowerCase().includes(q)) score = Math.max(score, 10);
    return { entry: e, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ── resolveProject ────────────────────────────────────────────────

export function resolveProject(cwd, explicitProject) {
  if (explicitProject) {
    validateProjectName(explicitProject);
    return {
      projectName: explicitProject,
      decisionsDir: join(vaultRoot(), 'projects', explicitProject, 'decisions'),
    };
  }
  let projectName = '';
  try {
    projectName = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd || process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (projectName) projectName = basename(projectName);
  } catch { /* fallback */ }
  if (!projectName) projectName = basename(cwd || process.cwd());
  return {
    projectName,
    decisionsDir: join(vaultRoot(), 'projects', projectName, 'decisions'),
  };
}

// ── Printing helpers ──────────────────────────────────────────────

function printHelp() {
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Decisions (ADR-02)${c.reset}`);
  console.log('');
  console.log(`  Commands:`);
  console.log(`    claude-dev-stack decisions list                     List ADRs for current project`);
  console.log(`    claude-dev-stack decisions show <id|slug>           Show full ADR content`);
  console.log(`    claude-dev-stack decisions search <term>            Search across all ADRs`);
  console.log('');
  console.log(`  Flags:`);
  console.log(`    --project <name>    Use vault/projects/<name>/decisions/ instead of the cwd-derived project`);
  console.log('');
  console.log(`  Examples:`);
  console.log(`    claude-dev-stack decisions list`);
  console.log(`    claude-dev-stack decisions show 0013`);
  console.log(`    claude-dev-stack decisions search logging`);
  console.log('');
}

function pad(str, width) {
  str = String(str ?? '');
  if (str.length >= width) return str.slice(0, width - 1) + ' ';
  return str + ' '.repeat(width - str.length);
}

function printList(entries, projectName) {
  if (!entries.length) {
    info(`No decisions found for project "${projectName}"`);
    return;
  }
  console.log('');
  console.log(`  ${c.bold}${pad('id', 6)}${pad('date', 12)}${pad('status', 12)}${pad('topic', 28)}title${c.reset}`);
  console.log(`  ${'-'.repeat(70)}`);
  for (const e of entries) {
    const idStr = String(e.id).padStart(4, '0');
    const topicStr = e.topic || e.topicFromFilename || '';
    console.log(
      `  ${pad(idStr, 6)}${pad(e.date, 12)}${pad(e.status, 12)}${pad(topicStr, 28)}${e.title || ''}`
    );
  }
  console.log('');
}

// ── main ──────────────────────────────────────────────────────────

export async function main(args) {
  if (!Array.isArray(args)) args = [];

  // Strip --project <value>
  let explicitProject = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') {
      explicitProject = args[++i];
    } else {
      positional.push(args[i]);
    }
  }

  const sub = positional[0];

  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    printHelp();
    return;
  }

  let resolved;
  try {
    resolved = resolveProject(process.cwd(), explicitProject);
  } catch (err) {
    fail(err.message);
    process.exit(1);
    return;
  }
  const { projectName, decisionsDir } = resolved;

  switch (sub) {
    case 'list': {
      const entries = listDecisions(decisionsDir);
      printList(entries, projectName);
      break;
    }
    case 'show': {
      const query = positional[1];
      if (!query) {
        fail('Missing <id|slug> for "show"');
        process.exit(1);
        return;
      }
      const entry = findDecision(decisionsDir, query);
      if (!entry) {
        fail(`Decision "${query}" not found`);
        process.exit(1);
        return;
      }
      console.log(entry.raw);
      break;
    }
    case 'search': {
      const term = positional[1];
      if (!term) {
        fail('Missing <term> for "search"');
        process.exit(1);
        return;
      }
      const results = searchDecisions(decisionsDir, term);
      if (!results.length) {
        info(`No matches for "${term}"`);
        return;
      }
      console.log('');
      for (const r of results) {
        const idStr = String(r.entry.id).padStart(4, '0');
        const topic = r.entry.topic || r.entry.topicFromFilename || '';
        console.log(`  [${idStr}] ${topic} — ${r.entry.title} (score: ${r.score})`);
      }
      console.log('');
      break;
    }
    default:
      warn(`Unknown subcommand: ${sub}`);
      printHelp();
  }
}
