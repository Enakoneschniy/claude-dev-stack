// Phase 37 Plan 03 Task 37-03-04 — lenient ROADMAP.md + STATE.md parsers.
//
// Per D-85 (lenient mode): any parse failure returns `undefined` rather than
// throwing so downstream `planning.status` can degrade gracefully.

export interface MilestoneInfo {
  version?: string;
  name?: string;
  status?: 'planning' | 'in-progress' | 'complete';
}

export interface PhaseCounts {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
}

export interface CurrentPhase {
  number: string;
  name: string;
  disk_status?: string;
}

export interface StateProgress {
  total_phases?: number;
  completed_phases?: number;
  percent?: number;
}

export interface StateFrontmatter {
  milestone?: string;
  milestone_name?: string;
  status?: string;
  progress?: StateProgress;
  last_activity?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sliceFrontmatter(md: string): string | undefined {
  if (!md.startsWith('---')) return undefined;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m.exec(md);
  if (!match || typeof match[1] !== 'string') return undefined;
  return match[1];
}

function coerceNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : undefined;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  return t;
}

// ---------------------------------------------------------------------------
// YAML-ish frontmatter scanner (intentionally minimal)
// ---------------------------------------------------------------------------

export function parseStateFrontmatter(stateMd: string): StateFrontmatter | undefined {
  try {
    const body = sliceFrontmatter(stateMd);
    if (body === undefined) return undefined;

    const out: StateFrontmatter = {};
    const lines = body.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const raw = lines[i];
      if (raw === undefined) {
        i += 1;
        continue;
      }
      if (raw.trim().length === 0 || raw.trimStart().startsWith('#')) {
        i += 1;
        continue;
      }
      const topLevel = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
      if (!topLevel) {
        i += 1;
        continue;
      }
      const key = topLevel[1];
      const value = topLevel[2] ?? '';

      if (key === 'progress' && value.trim().length === 0) {
        const progress: StateProgress = {};
        i += 1;
        while (i < lines.length) {
          const nested = lines[i];
          if (nested === undefined) break;
          if (!/^\s+\S/.test(nested)) break;
          const kv = /^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(nested);
          if (kv) {
            const nKey = kv[1];
            const nVal = stripQuotes(kv[2] ?? '');
            if (nKey === 'total_phases') progress.total_phases = coerceNumber(nVal);
            else if (nKey === 'completed_phases') progress.completed_phases = coerceNumber(nVal);
            else if (nKey === 'percent') progress.percent = coerceNumber(nVal);
          }
          i += 1;
        }
        if (Object.keys(progress).length > 0) out.progress = progress;
        continue;
      }

      const v = stripQuotes(value);
      if (key === 'milestone') out.milestone = v;
      else if (key === 'milestone_name') out.milestone_name = v;
      else if (key === 'status') out.status = v;
      else if (key === 'last_activity') out.last_activity = v;
      i += 1;
    }

    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// ROADMAP parsers
// ---------------------------------------------------------------------------

export function parseRoadmapMilestone(roadmapMd: string): MilestoneInfo | undefined {
  try {
    const out: MilestoneInfo = {};

    const heading = /^#\s+Milestone\s+(v[\d.]+)(?:\s*[-—:]\s*(.+?))?\s*$/m.exec(roadmapMd);
    if (heading) {
      out.version = heading[1];
      if (heading[2]) out.name = heading[2].trim();
    }

    const fm = sliceFrontmatter(roadmapMd);
    if (fm) {
      const nameMatch = /^milestone_name:\s*(.+)$/m.exec(fm);
      if (nameMatch && nameMatch[1]) out.name = stripQuotes(nameMatch[1]);
      const versionMatch = /^milestone:\s*(.+)$/m.exec(fm);
      if (versionMatch && versionMatch[1]) out.version = stripQuotes(versionMatch[1]);
    }

    const near = roadmapMd.slice(0, 2000);
    if (/✅/.test(near)) out.status = 'complete';
    else if (/🚧|in[\s-]progress/i.test(near)) out.status = 'in-progress';
    else if (/planning/i.test(near)) out.status = 'planning';

    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function phaseSection(roadmapMd: string): string | undefined {
  const re =
    /^##+\s+(?:Active\s+Milestone\s+Phases?|Phases?|Current\s+Phases?)\s*$/im;
  const m = re.exec(roadmapMd);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  const tail = roadmapMd.slice(start);
  const nextHeading = /^##+\s+\S/m.exec(tail);
  if (nextHeading) return tail.slice(0, nextHeading.index);
  return tail;
}

export function parseRoadmapPhases(roadmapMd: string): PhaseCounts | undefined {
  try {
    const section = phaseSection(roadmapMd);
    if (!section) return undefined;

    let completed = 0;
    let in_progress = 0;
    let pending = 0;

    const lines = section.split(/\r?\n/);

    const tableHeaderIdx = lines.findIndex(
      (l) => /^\s*\|/.test(l) && /status/i.test(l),
    );
    if (tableHeaderIdx !== -1) {
      for (let i = tableHeaderIdx + 2; i < lines.length; i++) {
        const row = lines[i];
        if (row === undefined) continue;
        if (!/^\s*\|/.test(row)) break;
        const cols = row.split('|').map((c) => c.trim());
        const statusCell = [...cols].reverse().find((c) => c.length > 0) ?? '';
        const s = statusCell.toLowerCase();
        if (/(complete|done|✅)/.test(s)) completed += 1;
        else if (/(in[\s-]progress|🚧|active)/.test(s)) in_progress += 1;
        else pending += 1;
      }
    } else {
      for (const line of lines) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue;
        if (/\[x\]/i.test(trimmed) || /✅/.test(trimmed)) completed += 1;
        else if (/◆/.test(trimmed) || /🚧/.test(trimmed) || /in[\s-]progress/i.test(trimmed)) in_progress += 1;
        else if (/\[\s\]/.test(trimmed)) pending += 1;
      }
    }

    const total = completed + in_progress + pending;
    if (total === 0) return undefined;
    return { total, completed, in_progress, pending };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// STATE.md "Current Position" parser
// ---------------------------------------------------------------------------

export function parseStateCurrentPhase(stateMd: string): CurrentPhase | undefined {
  try {
    const posHeading = /^##+\s+Current\s+Position\s*$/im.exec(stateMd);
    const haystack = posHeading
      ? stateMd.slice(posHeading.index + posHeading[0].length)
      : stateMd;

    const re =
      /Phase:\s*\*{0,2}(\d+(?:\.\d+)?)\s*[-—:]\s*(.+?)\*{0,2}(?:\s*\(([^)]+)\))?\s*(?:\n|$)/i;
    const m = re.exec(haystack);
    if (!m) return undefined;
    const number = m[1];
    const nameRaw = m[2];
    const diskRaw = m[3];
    if (typeof number !== 'string' || typeof nameRaw !== 'string') return undefined;

    const result: CurrentPhase = {
      number,
      name: nameRaw.trim().replace(/\*+$/, '').trim(),
    };
    if (typeof diskRaw === 'string' && diskRaw.trim().length > 0) {
      result.disk_status = diskRaw.trim();
    }
    return result;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Critical Risks
// ---------------------------------------------------------------------------

export function parseCriticalRisks(stateMd: string): string[] | undefined {
  try {
    const heading = /^##+\s+Critical\s+Risks?\s*$/im.exec(stateMd);
    if (!heading) return undefined;
    const start = heading.index + heading[0].length;
    const tail = stateMd.slice(start);
    const nextHeading = /^##+\s+\S/m.exec(tail);
    const body = nextHeading ? tail.slice(0, nextHeading.index) : tail;

    const items: string[] = [];
    for (const raw of body.split(/\r?\n/)) {
      const trimmed = raw.trimStart();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        items.push(trimmed.slice(2).trim());
      }
    }
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}
