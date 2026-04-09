import { describe, it } from 'node:test';
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
