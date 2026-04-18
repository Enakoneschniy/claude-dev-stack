#!/usr/bin/env node
/**
 * cds-statusline.mjs — CDS-branded statusline for Claude Code.
 * Shows: cds version | model | current task (or GSD state) | directory | context usage
 * Replaces gsd-statusline.js entirely.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

// ── GSD state reader ──────────────────────────────────────────────

/**
 * Walk up from dir looking for .planning/STATE.md.
 * Returns parsed state object or null.
 */
function readGsdState(dir) {
  const home = homedir();
  let current = dir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(current, '.planning', 'STATE.md');
    if (existsSync(candidate)) {
      try {
        return parseStateMd(readFileSync(candidate, 'utf8'));
      } catch {
        return null;
      }
    }
    const parent = dirname(current);
    if (parent === current || current === home) break;
    current = parent;
  }
  return null;
}

/**
 * Parse STATE.md frontmatter + Phase line from body.
 * Returns { status, milestone, milestoneName, phaseNum, phaseTotal, phaseName }
 */
function parseStateMd(content) {
  const state = {};

  // YAML frontmatter between --- markers
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/);
      if (!m) continue;
      const [, key, val] = m;
      const v = val.trim().replace(/^["']|["']$/g, '');
      if (key === 'status') state.status = v === 'null' ? null : v;
      if (key === 'milestone') state.milestone = v === 'null' ? null : v;
      if (key === 'milestone_name') state.milestoneName = v === 'null' ? null : v;
    }
  }

  // Phase: N of M (name)  or  Phase: none active (...)
  const phaseMatch = content.match(/^Phase:\s*(\d+)\s+of\s+(\d+)(?:\s+\(([^)]+)\))?/m);
  if (phaseMatch) {
    state.phaseNum = phaseMatch[1];
    state.phaseTotal = phaseMatch[2];
    state.phaseName = phaseMatch[3] || null;
  }

  // Fallback: parse Status: from body when frontmatter is absent
  if (!state.status) {
    const bodyStatus = content.match(/^Status:\s*(.+)/m);
    if (bodyStatus) {
      const raw = bodyStatus[1].trim().toLowerCase();
      if (raw.includes('ready to plan') || raw.includes('planning')) state.status = 'planning';
      else if (raw.includes('execut')) state.status = 'executing';
      else if (raw.includes('complet') || raw.includes('archived')) state.status = 'complete';
    }
  }

  return state;
}

/**
 * Format GSD state into display string.
 * Format: "v1.9 Code Quality · executing · fix-deployment (1/5)"
 */
function formatGsdState(s) {
  const parts = [];

  if (s.milestone || s.milestoneName) {
    const ver = s.milestone || '';
    const name = (s.milestoneName && s.milestoneName !== 'milestone') ? s.milestoneName : '';
    const ms = [ver, name].filter(Boolean).join(' ');
    if (ms) parts.push(ms);
  }

  if (s.status) parts.push(s.status);

  if (s.phaseNum && s.phaseTotal) {
    const phase = s.phaseName
      ? `${s.phaseName} (${s.phaseNum}/${s.phaseTotal})`
      : `ph ${s.phaseNum}/${s.phaseTotal}`;
    parts.push(phase);
  }

  return parts.join(' \u00b7 ');
}

// ── Statusline ────────────────────────────────────────────────────

function runStatusline() {
  let input = '';
  // Timeout guard: if stdin doesn't close within 3s, exit silently
  const stdinTimeout = setTimeout(() => process.exit(0), 3000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    clearTimeout(stdinTimeout);
    try {
      const data = JSON.parse(input);
      const model = data.model?.display_name || 'Claude';
      const dir = data.workspace?.current_dir || process.cwd();
      const session = data.session_id || '';
      const remaining = data.context_window?.remaining_percentage;

      // ── CDS version segment ──
      let cdsVersion = '0.0.0';
      try {
        const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
        cdsVersion = pkg.version || '0.0.0';
      } catch {}

      let updateAvailable = false;
      let latestVersion = null;
      const cacheFile = join(homedir(), '.cds', 'update-check.json');
      if (existsSync(cacheFile)) {
        try {
          const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
          if (cache.updateAvailable) {
            updateAvailable = true;
            latestVersion = cache.latest;
          }
        } catch {}
      }

      const cdsVer = updateAvailable
        ? `\x1b[33mcds v${cdsVersion} \u2192 v${latestVersion} \u2b06\x1b[0m`
        : `\x1b[2mcds v${cdsVersion}\x1b[0m`;

      // ── Context window bar ──
      const AUTO_COMPACT_BUFFER_PCT = 16.5;
      let ctx = '';
      if (remaining != null) {
        const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
        const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

        // Write bridge file for context-monitor and budget hooks
        const sessionSafe = session && !/[/\\]|\.\./.test(session);
        if (sessionSafe) {
          try {
            const bridgePath = join(tmpdir(), `claude-ctx-${session}.json`);
            const bridgeData = JSON.stringify({
              session_id: session,
              remaining_percentage: remaining,
              used_pct: used,
              timestamp: Math.floor(Date.now() / 1000),
            });
            writeFileSync(bridgePath, bridgeData);
          } catch {
            // Silent fail — bridge is best-effort
          }
        }

        // Build progress bar (10 segments)
        const filled = Math.floor(used / 10);
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

        // Color based on usable context thresholds
        if (used < 50) {
          ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
        } else if (used < 65) {
          ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
        } else if (used < 80) {
          ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
        } else {
          ctx = ` \x1b[5;31m\ud83d\udc80 ${bar} ${used}%\x1b[0m`;
        }
      }

      // ── Active task from todos ──
      let task = '';
      const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
      const todosDir = join(claudeDir, 'todos');
      if (session && existsSync(todosDir)) {
        try {
          const files = readdirSync(todosDir)
            .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: statSync(join(todosDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            try {
              const todos = JSON.parse(readFileSync(join(todosDir, files[0].name), 'utf8'));
              const inProgress = todos.find(t => t.status === 'in_progress');
              if (inProgress) task = inProgress.activeForm || '';
            } catch {}
          }
        } catch {}
      }

      // ── GSD project state (shown when no active todo task) ──
      const gsdStateStr = task ? '' : formatGsdState(readGsdState(dir) || {});

      // ── Compose output ──
      const dirName = basename(dir);
      const middle = task
        ? `\x1b[1m${task}\x1b[0m`
        : gsdStateStr
          ? `\x1b[2m${gsdStateStr}\x1b[0m`
          : null;

      if (middle) {
        process.stdout.write(`${cdsVer} \u2502 \x1b[2m${model}\x1b[0m \u2502 ${middle} \u2502 \x1b[2m${dirName}\x1b[0m${ctx}`);
      } else {
        process.stdout.write(`${cdsVer} \u2502 \x1b[2m${model}\x1b[0m \u2502 \x1b[2m${dirName}\x1b[0m${ctx}`);
      }
    } catch {
      // Silent fail — don't break statusline on parse errors
    }
  });
}

// Export helpers for unit tests
export { readGsdState, parseStateMd, formatGsdState };

runStatusline();
