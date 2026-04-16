// Phase 37 Plan 03 Task 37-03-06 — planning.status tool.
//
// Resolves a project, reads .planning/ROADMAP.md + STATE.md, and returns a
// structured metadata object. Per D-81, D-84..D-86.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
  parseCriticalRisks,
  parseRoadmapMilestone,
  parseRoadmapPhases,
  parseStateCurrentPhase,
  parseStateFrontmatter,
  type CurrentPhase,
  type MilestoneInfo,
  type PhaseCounts,
} from './planning-parsers.js';
import {
  NotAGsdProjectError,
  assertValidScopeBasename,
} from './shared.js';

export interface PlanningStatusArgs {
  project?: string;
}

export interface PlanningStatusCurrentPhase extends CurrentPhase {
  plan_count?: number;
}

export interface PlanningStatusResult {
  project: string;
  milestone?: MilestoneInfo;
  phases?: PhaseCounts;
  current_phase?: PlanningStatusCurrentPhase;
  progress_percent?: number;
  last_activity?: string;
  critical_risks?: string[];
}

export interface PlanningStatusDeps {
  vaultPath?: string;
  cwd?: string;
}

interface ProjectMapEntry {
  path?: string;
  slug?: string;
}

function loadProjectMap(vault: string): Record<string, ProjectMapEntry> {
  const path = join(vault, 'project-map.json');
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, ProjectMapEntry>;
    }
  } catch {
    return {};
  }
  return {};
}

function resolveProjectPath(
  args: PlanningStatusArgs,
  deps: PlanningStatusDeps,
  vault: string,
): { name: string; path: string } {
  let name: string;
  let cwdName = false;
  if (args.project !== undefined && args.project !== null && args.project !== '') {
    assertValidScopeBasename(args.project);
    name = args.project;
  } else {
    name = basename(deps.cwd ?? process.cwd());
    cwdName = true;
  }

  // 1. project-map.json lookup (exact basename match).
  const map = loadProjectMap(vault);
  const entry = map[name];
  if (entry && typeof entry.path === 'string' && existsSync(entry.path)) {
    return { name, path: entry.path };
  }

  // 2. vault/projects/{name} with .planning/ROADMAP.md.
  const vaultProjectPath = join(vault, 'projects', name);
  const roadmapPath = join(vaultProjectPath, '.planning', 'ROADMAP.md');
  if (existsSync(roadmapPath)) {
    return { name, path: vaultProjectPath };
  }

  // 3. If cwd fallback, check cwd itself for .planning/ROADMAP.md.
  if (cwdName) {
    const cwd = deps.cwd ?? process.cwd();
    if (existsSync(join(cwd, '.planning', 'ROADMAP.md'))) {
      return { name, path: cwd };
    }
  }

  throw new NotAGsdProjectError(
    `Project '${name}' not found in vault or registry (expected .planning/ROADMAP.md)`,
  );
}

function countPlanFiles(phasesDir: string, phaseNumber: string): number | undefined {
  if (!existsSync(phasesDir) || !statSync(phasesDir).isDirectory()) return undefined;
  try {
    const entries = readdirSync(phasesDir, { withFileTypes: true });
    // Match directories that start with `{phaseNumber}-` (handles `37-mcp-adapter`)
    // as well as the zero-padded variant (`037-...`).
    const matchingDirs = entries
      .filter((e) => e.isDirectory())
      .filter((e) => {
        return e.name.startsWith(`${phaseNumber}-`);
      });
    if (matchingDirs.length === 0) return 0;
    let count = 0;
    for (const dir of matchingDirs) {
      const full = join(phasesDir, dir.name);
      const files = readdirSync(full);
      for (const f of files) {
        if (/^\d+-\d+-PLAN\.md$/.test(f)) count += 1;
      }
    }
    return count;
  } catch {
    return undefined;
  }
}

export async function planningStatus(
  args: PlanningStatusArgs,
  deps: PlanningStatusDeps = {},
): Promise<PlanningStatusResult> {
  const vault =
    deps.vaultPath ??
    process.env['CDS_TEST_VAULT'] ??
    resolve(homedir(), 'vault');

  const { name, path: projectPath } = resolveProjectPath(args, deps, vault);

  const roadmapPath = join(projectPath, '.planning', 'ROADMAP.md');
  if (!existsSync(roadmapPath)) {
    throw new NotAGsdProjectError(`No .planning/ROADMAP.md at ${roadmapPath}`);
  }
  const roadmapMd = readFileSync(roadmapPath, 'utf8');

  const statePath = join(projectPath, '.planning', 'STATE.md');
  const stateMd = existsSync(statePath) ? readFileSync(statePath, 'utf8') : '';

  const result: PlanningStatusResult = { project: name };

  const milestone = parseRoadmapMilestone(roadmapMd);
  const frontmatter = parseStateFrontmatter(stateMd);
  const phases = parseRoadmapPhases(roadmapMd);
  const currentPhase = parseStateCurrentPhase(stateMd);
  const criticalRisks = parseCriticalRisks(stateMd);

  // Merge milestone info from frontmatter where ROADMAP heading didn't provide it.
  if (milestone || frontmatter) {
    const merged: MilestoneInfo = { ...(milestone ?? {}) };
    if (frontmatter?.milestone && !merged.version) merged.version = frontmatter.milestone;
    if (frontmatter?.milestone_name && !merged.name) merged.name = frontmatter.milestone_name;
    if (frontmatter?.status && !merged.status) {
      if (
        frontmatter.status === 'planning' ||
        frontmatter.status === 'in-progress' ||
        frontmatter.status === 'complete'
      ) {
        merged.status = frontmatter.status;
      }
    }
    if (Object.keys(merged).length > 0) {
      result.milestone = merged;
    }
  }

  if (phases) {
    result.phases = phases;
    result.progress_percent = Math.round((phases.completed / phases.total) * 100);
  } else if (frontmatter?.progress?.percent !== undefined) {
    result.progress_percent = frontmatter.progress.percent;
  }

  if (currentPhase) {
    const enriched: PlanningStatusCurrentPhase = { ...currentPhase };
    const phasesDir = join(projectPath, '.planning', 'phases');
    const planCount = countPlanFiles(phasesDir, currentPhase.number);
    if (planCount !== undefined) enriched.plan_count = planCount;
    result.current_phase = enriched;
  }

  if (frontmatter?.last_activity) {
    result.last_activity = frontmatter.last_activity;
  }
  if (criticalRisks && criticalRisks.length > 0) {
    result.critical_risks = criticalRisks;
  }

  return result;
}
