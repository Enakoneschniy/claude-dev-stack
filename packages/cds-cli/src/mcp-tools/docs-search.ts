// Phase 37 Plan 03 Task 37-03-02 — docs.search tool.
//
// Live grep over markdown docs under vault/projects/*/docs/ using ripgrep
// (with POSIX grep fallback) and a path-traversal guard restricting queries
// to the vault. Per D-73..D-76, D-80, VALIDATION T-37-01.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import {
  InvalidFilterError,
  VaultNotFoundError,
  assertValidScopeBasename,
} from './shared.js';

export interface DocsSearchArgs {
  query: string;
  scope?: string;
  limit?: number;
}

export interface DocsSearchHit {
  file: string;
  line: number;
  match: string;
  context_before: string[];
  context_after: string[];
}

export interface DocsSearchResult {
  hits: DocsSearchHit[];
  total: number;
}

export interface DocsSearchDeps {
  vaultPath?: string;
  /** Override cwd project basename (default: basename(process.cwd())). */
  cwdProject?: string;
}

// Module-level ripgrep-available cache. Cleared on demand by tests.
let ripgrepAvailable: boolean | undefined;
let loggedFallback = false;

export function resetRipgrepCache(): void {
  ripgrepAvailable = undefined;
  loggedFallback = false;
}

function hasRipgrep(): boolean {
  if (ripgrepAvailable !== undefined) return ripgrepAvailable;
  const r = spawnSync('rg', ['--version'], { stdio: 'ignore' });
  ripgrepAvailable = r.status === 0;
  return ripgrepAvailable;
}

function hasPosixGrep(): boolean {
  const r = spawnSync('grep', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function clampLimit(n: number | undefined): number {
  const raw = typeof n === 'number' && Number.isFinite(n) ? n : 20;
  return Math.min(Math.max(1, Math.floor(raw)), 100);
}

function resolveSearchPaths(
  args: DocsSearchArgs,
  deps: DocsSearchDeps,
  vault: string,
): string[] {
  const projectsRoot = resolve(vault, 'projects');
  if (!existsSync(projectsRoot) || !statSync(projectsRoot).isDirectory()) {
    throw new VaultNotFoundError(`vault/projects not found at ${projectsRoot}`);
  }

  const scope = args.scope ?? 'current';

  if (scope === 'current') {
    const project = deps.cwdProject ?? basename(process.cwd());
    return [resolve(projectsRoot, project, 'docs')];
  }

  if (scope === 'all') {
    const entries = readdirSync(projectsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => resolve(projectsRoot, e.name, 'docs'));
  }

  assertValidScopeBasename(scope);
  return [resolve(projectsRoot, scope, 'docs')];
}

function ensureUnderVault(path: string, projectsRoot: string): void {
  const r = resolve(path);
  if (r !== projectsRoot && !r.startsWith(projectsRoot + '/')) {
    throw new InvalidFilterError(`Path traversal detected: ${path}`);
  }
}

interface RgBeginMessage { type: 'begin'; data: { path: { text: string } }; }
interface RgMatchMessage {
  type: 'match';
  data: { path: { text: string }; lines: { text: string }; line_number: number };
}
interface RgContextMessage {
  type: 'context';
  data: { path: { text: string }; lines: { text: string }; line_number: number };
}
interface RgEndMessage { type: 'end'; }
interface RgSummaryMessage { type: 'summary'; }
type RgMessage = RgBeginMessage | RgMatchMessage | RgContextMessage | RgEndMessage | RgSummaryMessage;

interface StagedHit {
  absPath: string;
  line: number;
  match: string;
  context_before: string[];
  context_after: string[];
}

interface PendingRg {
  absPath: string;
  line: number;
  match: string;
  context_before: string[];
  context_after: string[];
  remainingAfter: number;
}

async function runRipgrep(
  query: string,
  paths: string[],
  vault: string,
): Promise<DocsSearchHit[]> {
  const args = [
    '--json',
    '--no-heading',
    '--color',
    'never',
    '--type',
    'md',
    '--context',
    '2',
    query,
    ...paths,
  ];
  const child = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const rl = createInterface({ input: child.stdout });
  const stderrChunks: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const staged: StagedHit[] = [];
  let currentFile: string | undefined;
  let contextBefore: string[] = [];
  let pending: PendingRg[] = [];

  function flushPending(): void {
    for (const pm of pending) {
      staged.push({
        absPath: pm.absPath,
        line: pm.line,
        match: pm.match,
        context_before: pm.context_before,
        context_after: pm.context_after,
      });
    }
    pending = [];
  }

  for await (const line of rl) {
    if (!line) continue;
    let msg: RgMessage;
    try {
      msg = JSON.parse(line) as RgMessage;
    } catch {
      continue;
    }

    if (msg.type === 'begin') {
      currentFile = msg.data.path.text;
      contextBefore = [];
      pending = [];
    } else if (msg.type === 'context') {
      const text = msg.data.lines.text.replace(/\r?\n$/, '');
      for (const pm of pending) {
        if (pm.remainingAfter > 0) {
          pm.context_after.push(text);
          pm.remainingAfter -= 1;
        }
      }
      for (const pm of pending.filter((p) => p.remainingAfter === 0)) {
        staged.push({
          absPath: pm.absPath,
          line: pm.line,
          match: pm.match,
          context_before: pm.context_before,
          context_after: pm.context_after,
        });
      }
      pending = pending.filter((p) => p.remainingAfter > 0);

      contextBefore.push(text);
      if (contextBefore.length > 2) contextBefore.shift();
    } else if (msg.type === 'match') {
      const text = msg.data.lines.text.replace(/\r?\n$/, '');
      flushPending();
      pending.push({
        absPath: currentFile ?? '',
        line: msg.data.line_number,
        match: text,
        context_before: [...contextBefore],
        context_after: [],
        remainingAfter: 2,
      });
      // After a match, rolling-before buffer resets so next match's
      // context_before reflects only lines *after* this match.
      contextBefore = [];
    } else if (msg.type === 'end') {
      flushPending();
      contextBefore = [];
      currentFile = undefined;
    }
  }

  const status: number | null = await new Promise((res) => {
    if (child.exitCode !== null) res(child.exitCode);
    else child.on('exit', (code) => res(code));
  });
  if (status !== null && status >= 2) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    throw new InvalidFilterError(`ripgrep failed (exit ${status}): ${stderr.trim()}`);
  }

  return staged.map((s) => ({
    file: relative(vault, s.absPath),
    line: s.line,
    match: s.match,
    context_before: s.context_before,
    context_after: s.context_after,
  }));
}

interface PendingGrep {
  absPath: string;
  line: number;
  match: string;
  context_before: string[];
  context_after: string[];
  remainingAfter: number;
}

async function runPosixGrep(
  query: string,
  paths: string[],
  vault: string,
): Promise<DocsSearchHit[]> {
  const args = ['-rnE', '-C', '2', '--include=*.md', '-e', query, ...paths];
  const child = spawn('grep', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const rl = createInterface({ input: child.stdout });
  const stderrChunks: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const hits: DocsSearchHit[] = [];
  let pending: PendingGrep[] = [];
  let contextBefore: string[] = [];

  function finalize(pm: PendingGrep): void {
    hits.push({
      file: relative(vault, pm.absPath),
      line: pm.line,
      match: pm.match,
      context_before: pm.context_before,
      context_after: pm.context_after,
    });
  }

  // grep -rn -C 2 emits lines like `<absPath>:<line>:<text>` for matches
  // and `<absPath>-<line>-<text>` for context; `--` separates groups.
  const lineRe = /^(.+?)([-:])(\d+)([-:])(.*)$/;

  for await (const raw of rl) {
    if (raw === '--') {
      for (const pm of pending) finalize(pm);
      pending = [];
      contextBefore = [];
      continue;
    }
    const m = lineRe.exec(raw);
    if (!m) continue;
    const [, absPath, sep1, lineStr, , rest] = m;
    if (!absPath || !lineStr) continue;
    const lineNo = Number(lineStr);
    const isMatch = sep1 === ':';
    const text = rest ?? '';

    if (isMatch) {
      for (const pm of pending) finalize(pm);
      pending = [];
      pending.push({
        absPath,
        line: lineNo,
        match: text,
        context_before: [...contextBefore],
        context_after: [],
        remainingAfter: 2,
      });
      contextBefore = [];
    } else {
      for (const pm of pending) {
        if (pm.remainingAfter > 0 && pm.absPath === absPath) {
          pm.context_after.push(text);
          pm.remainingAfter -= 1;
        }
      }
      for (const pm of pending.filter((p) => p.remainingAfter === 0)) {
        finalize(pm);
      }
      pending = pending.filter((p) => p.remainingAfter > 0);

      contextBefore.push(text);
      if (contextBefore.length > 2) contextBefore.shift();
    }
  }

  for (const pm of pending) finalize(pm);

  const status: number | null = await new Promise((res) => {
    if (child.exitCode !== null) res(child.exitCode);
    else child.on('exit', (code) => res(code));
  });
  if (status !== null && status >= 2) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    throw new InvalidFilterError(`grep failed (exit ${status}): ${stderr.trim()}`);
  }

  return hits;
}

export async function docsSearch(
  args: DocsSearchArgs,
  deps: DocsSearchDeps = {},
): Promise<DocsSearchResult> {
  if (typeof args.query !== 'string' || args.query.length === 0) {
    throw new InvalidFilterError('query must be a non-empty string');
  }
  const limit = clampLimit(args.limit);

  const vault =
    deps.vaultPath ??
    process.env['CDS_TEST_VAULT'] ??
    resolve(homedir(), 'vault');

  const searchPaths = resolveSearchPaths(args, deps, vault);

  const projectsRoot = resolve(vault, 'projects');
  const existingPaths: string[] = [];
  for (const p of searchPaths) {
    ensureUnderVault(p, projectsRoot);
    if (existsSync(p) && statSync(p).isDirectory()) {
      existingPaths.push(p);
    }
  }
  if (existingPaths.length === 0) {
    return { hits: [], total: 0 };
  }

  let hits: DocsSearchHit[];
  if (hasRipgrep()) {
    hits = await runRipgrep(args.query, existingPaths, vault);
  } else if (hasPosixGrep()) {
    if (!loggedFallback) {
      // eslint-disable-next-line no-console
      console.warn('ripgrep not found, using POSIX grep (slower on large vaults)');
      loggedFallback = true;
    }
    hits = await runPosixGrep(args.query, existingPaths, vault);
  } else {
    throw new InvalidFilterError(
      'Neither ripgrep (rg) nor POSIX grep is available on PATH',
    );
  }

  const clipped = hits.slice(0, limit);
  return { hits: clipped, total: clipped.length };
}
