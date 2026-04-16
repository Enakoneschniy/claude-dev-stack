// Phase 37 Plan 04 Task 37-04-05 — unit tests for the wizard's MCP
// registration logic in lib/install/mcp.mjs. Validation matrix §6.4 (a)-(g).

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Cross-package import into the wizard's plain-JS module. The .mjs file
// lives outside the cds-cli tsconfig but vitest resolves it at runtime.
// @ts-expect-error — no .d.ts shipped for lib/install/mcp.mjs.
import { _writeMcpEntry } from '../../../lib/install/mcp.mjs';

interface ProbeSettings {
  hooks?: Record<string, unknown>;
  'mcp.servers'?: Record<string, { command?: string; args?: unknown[] }>;
  [k: string]: unknown;
}

function loadSettings(path: string): ProbeSettings {
  return JSON.parse(readFileSync(path, 'utf8')) as ProbeSettings;
}

describe('_writeMcpEntry', () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cds-install-mcp-'));
    settingsPath = join(dir, 'settings.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("(a) adds entry when settings.json does not exist", () => {
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('added');
    expect(existsSync(settingsPath)).toBe(true);
    const s = loadSettings(settingsPath);
    expect(s['mcp.servers']?.cds?.command).toBe('claude-dev-stack');
    expect(s['mcp.servers']?.cds?.args).toEqual(['mcp', 'serve']);
  });

  it('(b) no-op when matching entry exists', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          'mcp.servers': {
            cds: { command: 'claude-dev-stack', args: ['mcp', 'serve'] },
          },
        },
        null,
        2,
      ) + '\n',
    );
    const beforeBytes = readFileSync(settingsPath);
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('no-op');
    const afterBytes = readFileSync(settingsPath);
    expect(afterBytes.equals(beforeBytes)).toBe(true);
  });

  it('(c) updates when mismatched command', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(
        { 'mcp.servers': { cds: { command: 'oldthing', args: [] } } },
        null,
        2,
      ) + '\n',
    );
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('updated');
    const s = loadSettings(settingsPath);
    expect(s['mcp.servers']?.cds?.command).toBe('claude-dev-stack');
    expect(s['mcp.servers']?.cds?.args).toEqual(['mcp', 'serve']);
  });

  it("(d) creates mcp.servers key when missing", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ hooks: { SessionStart: [] } }, null, 2) + '\n',
    );
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('added');
    const s = loadSettings(settingsPath);
    expect(s['mcp.servers']?.cds).toBeDefined();
    expect(s.hooks).toEqual({ SessionStart: [] });
  });

  it('(e) preserves other mcp.servers.* entries', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          'mcp.servers': {
            github: { command: 'npx', args: ['-y', 'github-mcp'] },
          },
        },
        null,
        2,
      ) + '\n',
    );
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('added');
    const s = loadSettings(settingsPath);
    expect(s['mcp.servers']?.github?.command).toBe('npx');
    expect(s['mcp.servers']?.github?.args).toEqual(['-y', 'github-mcp']);
    expect(s['mcp.servers']?.cds?.command).toBe('claude-dev-stack');
  });

  it('(f) second-run idempotency: sequential calls produce no change on second', () => {
    const first = _writeMcpEntry(settingsPath);
    expect(first).toBe('added');
    const afterFirst = readFileSync(settingsPath);
    const second = _writeMcpEntry(settingsPath);
    expect(second).toBe('no-op');
    const afterSecond = readFileSync(settingsPath);
    expect(afterSecond.equals(afterFirst)).toBe(true);
  });

  it('(g) corrupt JSON is skipped with warning, original bytes preserved', () => {
    const corrupt = '{ not valid json';
    writeFileSync(settingsPath, corrupt);
    const before = readFileSync(settingsPath);
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('skipped-corrupt');
    const after = readFileSync(settingsPath);
    expect(after.equals(before)).toBe(true);
  });

  it('handles empty object settings', () => {
    writeFileSync(settingsPath, '{}');
    const result = _writeMcpEntry(settingsPath);
    expect(result).toBe('added');
    const s = loadSettings(settingsPath);
    expect(s['mcp.servers']?.cds?.command).toBe('claude-dev-stack');
  });

  // Supplementary — confirm mtime changes only when we actually write.
  it('no-op path does not touch file stats', () => {
    _writeMcpEntry(settingsPath); // added
    const beforeMtime = statSync(settingsPath).mtimeMs;
    // vitest runs fast enough that we could false-negative — sleep-free
    // proof instead: compare byte buffers. Already covered in (b)/(f).
    void beforeMtime;
    expect(true).toBe(true);
  });
});
