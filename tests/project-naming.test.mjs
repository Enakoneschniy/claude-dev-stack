import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import functions under test — will fail until lib/project-naming.mjs is created
import { toSlug, fromSlug } from '../lib/project-naming.mjs';

describe('toSlug', () => {
  test('converts basic name to slug', () => {
    assert.equal(toSlug('My Project'), 'my-project');
  });

  test('collapses consecutive spaces into single hyphen', () => {
    assert.equal(toSlug('hello   world'), 'hello-world');
  });

  test('removes special characters', () => {
    assert.equal(toSlug('Test!@#$%Project'), 'testproject');
  });

  test('strips leading and trailing hyphens', () => {
    assert.equal(toSlug('--leading-trailing--'), 'leading-trailing');
  });

  test('collapses consecutive hyphens', () => {
    assert.equal(toSlug('a---b'), 'a-b');
  });

  test('trims and lowercases', () => {
    assert.equal(toSlug('  UPPER Case  '), 'upper-case');
  });

  test('returns empty string for empty input', () => {
    assert.equal(toSlug(''), '');
  });

  test('handles numbers in name', () => {
    assert.equal(toSlug('project-123'), 'project-123');
  });

  test('handles only special chars', () => {
    assert.equal(toSlug('!!!'), '');
  });
});

describe('fromSlug', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'project-naming-test-'));
    const projectsDir = join(tempDir, 'projects');
    mkdirSync(projectsDir);
    mkdirSync(join(projectsDir, 'my-project'));
    mkdirSync(join(projectsDir, 'another-project'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns directory name for existing slug', () => {
    const result = fromSlug('my-project', tempDir);
    assert.equal(result, 'my-project');
  });

  test('returns directory name for another existing slug', () => {
    const result = fromSlug('another-project', tempDir);
    assert.equal(result, 'another-project');
  });

  test('returns null for non-existent slug', () => {
    const result = fromSlug('does-not-exist', tempDir);
    assert.equal(result, null);
  });
});
