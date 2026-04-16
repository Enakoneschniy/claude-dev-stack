// lib/install/mcp.mjs — Phase 37 Plan 04 Task 37-04-03
//
// Registers the CDS MCP server in each configured project's
// `.claude/settings.json` under the flat `mcp.servers` key (per RESEARCH §4.1
// verification of Claude Code's settings format).
//
// Idempotent (D-90):
// - Missing file      → create with just the cds entry
// - Missing key       → add cds entry, preserve rest
// - Exact match       → no-op (mtime unchanged)
// - Different shape   → overwrite + warn (user customized)
// - Corrupt JSON      → skip with warning, never clobber
// - Other mcp.servers.* entries are NEVER touched

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { c, ok, warn, info } from '../shared.mjs';

const CDS_SERVER_KEY = 'cds';
const CDS_SERVER_CONFIG = Object.freeze({
  command: 'claude-dev-stack',
  args: Object.freeze(['mcp', 'serve']),
});
const MCP_SERVERS_KEY = 'mcp.servers';

export function installCdsMcpServer(stepNum, totalSteps, projectsData) {
  info(`Step ${stepNum}/${totalSteps}: Register CDS MCP server`);
  const projects = (projectsData?.projects || []).filter(
    (p) => p.path && existsSync(p.path),
  );

  if (projects.length === 0) {
    warn('No projects to configure — skipping CDS MCP server registration');
    return;
  }

  for (const project of projects) {
    const projectClaudeDir = join(project.path, '.claude');
    const settingsPath = join(projectClaudeDir, 'settings.json');
    const result = _writeMcpEntry(settingsPath);
    if (result === 'added') {
      ok(`CDS MCP server registered for ${c.cyan}${project.name}${c.reset}`);
    } else if (result === 'updated') {
      warn(
        `Updated existing 'cds' MCP entry in ${project.name} to current recommended configuration`,
      );
    } else if (result === 'skipped-corrupt') {
      warn(`settings.json corrupt in ${project.name} — skipped MCP registration`);
    } else if (result === 'no-op') {
      info(`CDS MCP server already registered for ${project.name} — no change`);
    }
  }
}

function canonicalConfig() {
  return { command: CDS_SERVER_CONFIG.command, args: [...CDS_SERVER_CONFIG.args] };
}

function entryMatches(existing) {
  if (!existing || typeof existing !== 'object') return false;
  if (existing.command !== CDS_SERVER_CONFIG.command) return false;
  if (!Array.isArray(existing.args)) return false;
  if (existing.args.length !== CDS_SERVER_CONFIG.args.length) return false;
  for (let i = 0; i < CDS_SERVER_CONFIG.args.length; i += 1) {
    if (existing.args[i] !== CDS_SERVER_CONFIG.args[i]) return false;
  }
  return true;
}

/**
 * Writes / updates the `cds` entry under `mcp.servers` in `settingsPath`.
 * Returns one of 'added' | 'no-op' | 'updated' | 'skipped-corrupt'.
 * Exported for unit tests.
 */
export function _writeMcpEntry(settingsPath) {
  if (!existsSync(settingsPath)) {
    const newSettings = {
      [MCP_SERVERS_KEY]: { [CDS_SERVER_KEY]: canonicalConfig() },
    };
    writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2) + '\n');
    return 'added';
  }

  let raw;
  try {
    raw = readFileSync(settingsPath, 'utf8');
  } catch {
    return 'skipped-corrupt';
  }

  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    return 'skipped-corrupt';
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return 'skipped-corrupt';
  }

  let changed = false;
  if (!settings[MCP_SERVERS_KEY] || typeof settings[MCP_SERVERS_KEY] !== 'object') {
    settings[MCP_SERVERS_KEY] = {};
    changed = true;
  }

  const servers = settings[MCP_SERVERS_KEY];
  const existing = servers[CDS_SERVER_KEY];

  if (existing) {
    if (entryMatches(existing) && !changed) {
      return 'no-op';
    }
    servers[CDS_SERVER_KEY] = canonicalConfig();
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    return entryMatches(existing) ? 'added' : 'updated';
  }

  servers[CDS_SERVER_KEY] = canonicalConfig();
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return 'added';
}
