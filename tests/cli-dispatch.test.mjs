// tests/cli-dispatch.test.mjs
// Asserts bin/cli.mjs routing for quick/mcp/migrate to dist/*/*.js (and CDS_DEV=1 -> packages/).
// Source: Phase 39 VALIDATION §Task 39-01-06
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cli = path.join(root, 'bin', 'cli.mjs');

const cliText = readFileSync(cli, 'utf8');

describe('bin/cli.mjs routing shape', () => {
  it('has resolveDistPath helper', () => {
    expect(cliText).toMatch(/function resolveDistPath\s*\(/);
    expect(cliText).toMatch(/CDS_DEV/);
  });

  it('case "quick" routes to resolveDistPath("cli/quick.js")', () => {
    expect(cliText).toMatch(/case 'quick':/);
    expect(cliText).toMatch(/resolveDistPath\('cli\/quick\.js'\)/);
  });

  it('case "mcp" serve subcommand routes to resolveDistPath("cli/mcp-server.js")', () => {
    expect(cliText).toMatch(/case 'mcp':/);
    expect(cliText).toMatch(/args\[1\] === 'serve'/);
    expect(cliText).toMatch(/resolveDistPath\('cli\/mcp-server\.js'\)/);
  });

  it('case "migrate" routes to resolveDistPath("migrate/cli.js")', () => {
    expect(cliText).toMatch(/case 'migrate':/);
    expect(cliText).toMatch(/resolveDistPath\('migrate\/cli\.js'\)/);
  });

  it('__dirname derived from fileURLToPath', () => {
    expect(cliText).toMatch(/fileURLToPath/);
    expect(cliText).toMatch(/__dirname\s*=\s*path\.dirname/);
  });

  it('existing cases preserved (projects, docs, skills)', () => {
    expect(cliText).toMatch(/case 'projects':/);
    expect(cliText).toMatch(/case 'docs':/);
    expect(cliText).toMatch(/case 'skills':/);
  });
});

describe('bin/cli.mjs runtime invocation', () => {
  it('claude-dev-stack --version prints 1.0.0-alpha.1', () => {
    const result = spawnSync('node', [cli, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('1.0.0-alpha.1');
  });

  it('claude-dev-stack help includes "quick" command', () => {
    const result = spawnSync('node', [cli, 'help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/claude-dev-stack quick/);
  });

  it('claude-dev-stack quick with no args prints usage to stderr and exits non-zero (after quick.js exists)', () => {
    if (!existsSync(path.join(root, 'dist', 'cli', 'quick.js'))) {
      return; // dist not yet built; skip runtime assertion
    }
    const result = spawnSync('node', [cli, 'quick'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Usage|not yet implemented/i);
  });
});
