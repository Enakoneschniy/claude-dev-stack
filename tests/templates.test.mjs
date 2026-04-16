import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, '..', 'templates');

describe('vault templates', () => {
  const expectedFiles = [
    'context-template.md',
    'infra.md',
    'patterns.md',
    'project-registry.md',
    'session-protocol.md',
  ];

  for (const file of expectedFiles) {
    it(`${file} exists`, () => {
      assert.ok(existsSync(join(templatesDir, file)));
    });
  }

  it('context-template.md has required sections', () => {
    const content = readFileSync(join(templatesDir, 'context-template.md'), 'utf8');
    assert.ok(content.includes('## Overview'));
    assert.ok(content.includes('## Stack'));
    assert.ok(content.includes('## Current State'));
  });

  it('context-template.md has placeholder variables', () => {
    const content = readFileSync(join(templatesDir, 'context-template.md'), 'utf8');
    assert.ok(content.includes('{{PROJECT_NAME}}') || content.includes('{{DATE}}'));
  });
});

describe('stack templates (in lib/templates.mjs)', () => {
  it('module can be imported', async () => {
    const mod = await import('../lib/templates.mjs');
    assert.ok(typeof mod.main === 'function');
  });
});

describe('templates/loop.md', () => {
  const projectRoot = join(__dirname, '..');

  it('exists in package templates directory', () => {
    assert.ok(existsSync(join(projectRoot, 'templates', 'loop.md')), 'templates/loop.md should exist');
  });

  it('references STATE.md for state detection', () => {
    const content = readFileSync(join(projectRoot, 'templates', 'loop.md'), 'utf8');
    assert.ok(content.includes('STATE.md'), 'should reference STATE.md');
  });

  it('references gsd-resume-work for resumption', () => {
    const content = readFileSync(join(projectRoot, 'templates', 'loop.md'), 'utf8');
    assert.ok(content.includes('gsd-resume-work'), 'should reference /gsd-resume-work');
  });

  it('references gsd-next for milestone advancement', () => {
    const content = readFileSync(join(projectRoot, 'templates', 'loop.md'), 'utf8');
    assert.ok(content.includes('gsd-next'), 'should reference /gsd-next');
  });

  it('references gsd-health for health checking', () => {
    const content = readFileSync(join(projectRoot, 'templates', 'loop.md'), 'utf8');
    assert.ok(content.includes('gsd-health'), 'should reference /gsd-health');
  });
});
