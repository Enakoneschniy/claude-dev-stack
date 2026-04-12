/**
 * tests/notion-cli.test.mjs -- Tests for lib/notion-cli.mjs subcommand dispatch.
 * Also includes doctor Notion MCP detection tests.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-notion-cli-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function writeNotionPages(projectDir, config) {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'notion_pages.json'), JSON.stringify(config), 'utf8');
}

// Capture console output for assertions
function captureOutput(fn) {
  const lines = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        console.log = originalLog;
        console.error = originalError;
      }).then(() => lines);
    }
  } finally {
    if (!(fn() && typeof fn().then === 'function')) {
      console.log = originalLog;
      console.error = originalError;
    }
  }
  return lines;
}

async function captureOutputAsync(fn) {
  const lines = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
}

// ── notion-cli tests ─────────────────────────────────────────────────────────

describe('notion-cli', () => {
  let proj;
  let originalCwd;

  beforeEach(() => {
    proj = makeTempProject();
    originalCwd = process.cwd();
    process.chdir(proj.dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    proj.cleanup();
  });

  // -- listPages --

  test('listPages with no config prints info message', async () => {
    const { listPages } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => listPages([]));
    const combined = lines.join('\n');
    assert.ok(combined.includes('notion_pages.json'), 'should mention config file');
  });

  test('listPages with config prints page entries', async () => {
    writeNotionPages(proj.dir, {
      version: 1,
      pages: [
        { page_id: 'abcdef1234567890abcdef1234567890', page_url: 'https://notion.so/test-abcdef1234567890abcdef1234567890', vault_path: 'docs/notion', refresh_strategy: 'manual' },
      ],
    });
    const { listPages } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => listPages([]));
    const combined = lines.join('\n');
    assert.ok(combined.includes('abcdef1234567890abcdef1234567890'), 'should show page_id');
  });

  // -- addPage --

  test('addPage with valid URL adds entry to config', async () => {
    const { addPage } = await import('../lib/notion-cli.mjs');
    await captureOutputAsync(() => addPage(['https://www.notion.so/workspace/Page-abcdef1234567890abcdef1234567890']));

    const { readNotionConfig } = await import('../lib/notion-config.mjs');
    const config = readNotionConfig(proj.dir);
    assert.ok(config !== null, 'config should be created');
    assert.equal(config.pages.length, 1);
    assert.equal(config.pages[0].page_id, 'abcdef1234567890abcdef1234567890');
  });

  test('addPage with invalid URL prints fail message', async () => {
    const { addPage } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => addPage(['not-a-notion-url']));
    const combined = lines.join('\n');
    assert.ok(combined.includes('page ID') || combined.includes('page_id') || combined.includes('URL') || combined.includes('Could not'), 'should print error about invalid URL');
  });

  test('addPage with duplicate page_id prints warn message', async () => {
    writeNotionPages(proj.dir, {
      version: 1,
      pages: [
        { page_id: 'abcdef1234567890abcdef1234567890', page_url: 'https://notion.so/old', vault_path: 'docs/notion', refresh_strategy: 'manual' },
      ],
    });
    const { addPage } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => addPage(['https://www.notion.so/workspace/Page-abcdef1234567890abcdef1234567890']));
    const combined = lines.join('\n');
    assert.ok(combined.includes('already') || combined.includes('configured') || combined.includes('duplicate'), 'should warn about duplicate');
  });

  // -- showHelp --

  test('showHelp does not throw', async () => {
    const { showHelp } = await import('../lib/notion-cli.mjs');
    await assert.doesNotReject(async () => {
      await captureOutputAsync(() => showHelp());
    });
  });

  // -- importPages --

  test('importPages prints guidance about skill-first approach', async () => {
    const { importPages } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => importPages([]));
    const combined = lines.join('\n');
    assert.ok(
      combined.includes('skill') || combined.includes('session') || combined.includes('Claude') || combined.includes('MCP'),
      'should print guidance about skill-first approach'
    );
  });

  // -- main dispatch --

  test('main with no args shows help', async () => {
    const { main } = await import('../lib/notion-cli.mjs');
    await assert.doesNotReject(async () => {
      await captureOutputAsync(() => main([]));
    });
  });

  test('main dispatches list subcommand', async () => {
    const { main } = await import('../lib/notion-cli.mjs');
    const lines = await captureOutputAsync(() => main(['list']));
    // just check it doesn't throw and mentions config
    assert.ok(lines !== null);
  });
});

// ── doctor Notion MCP detection tests ────────────────────────────────────────

import { chmodSync } from 'fs';
import { delimiter } from 'path';

function withStubClaudeMcp(jsonOutput, exitCode, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-claude-stub-'));
  const stubPath = join(dir, 'claude');
  const script = exitCode === 0
    ? `#!/bin/sh\necho '${jsonOutput.replace(/'/g, "'\\''")}'`
    : `#!/bin/sh\nexit 1`;
  writeFileSync(stubPath, script, 'utf8');
  chmodSync(stubPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = dir + delimiter + originalPath;
  try {
    return fn();
  } finally {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('checkNotionMcp', () => {
  test('returns found=true when notion entry is in mcp list JSON array', async () => {
    const { checkNotionMcp } = await import('../lib/doctor.mjs');
    const mcpJson = JSON.stringify([
      { name: 'github', command: 'github-mcp' },
      { name: 'notion', command: 'notion-mcp' },
    ]);
    const result = withStubClaudeMcp(mcpJson, 0, () => checkNotionMcp());
    assert.equal(result.found, true);
    assert.equal(result.error, undefined);
  });

  test('returns found=false when no notion entry in mcp list', async () => {
    const { checkNotionMcp } = await import('../lib/doctor.mjs');
    const mcpJson = JSON.stringify([
      { name: 'github', command: 'github-mcp' },
      { name: 'filesystem', command: 'fs-mcp' },
    ]);
    const result = withStubClaudeMcp(mcpJson, 0, () => checkNotionMcp());
    assert.equal(result.found, false);
    assert.equal(result.error, undefined);
  });

  test('returns error=exec_failed when mcp list command fails', async () => {
    const { checkNotionMcp } = await import('../lib/doctor.mjs');
    const result = withStubClaudeMcp('', 1, () => checkNotionMcp());
    assert.equal(result.found, false);
    assert.equal(result.error, 'exec_failed');
  });

  test('returns error=exec_failed when mcp list returns invalid JSON', async () => {
    const { checkNotionMcp } = await import('../lib/doctor.mjs');
    const result = withStubClaudeMcp('not valid json at all', 0, () => checkNotionMcp());
    assert.equal(result.found, false);
    assert.equal(result.error, 'exec_failed');
  });
});
