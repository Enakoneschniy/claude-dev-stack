/**
 * Tests for lib/notion-config.mjs — schema validation, URL parsing, read/write.
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  validateNotionConfig,
  parseNotionUrl,
  readNotionConfig,
  writeNotionConfig,
} from '../lib/notion-config.mjs';

import { cleanNotionFilename } from '../lib/docs.mjs';

// ── Helpers ───────────────────────────────────────────────────────

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-notion-cfg-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── parseNotionUrl ────────────────────────────────────────────────

describe('parseNotionUrl', () => {
  it('extracts 32-char undashed hex from end of slug', () => {
    const result = parseNotionUrl(
      'https://www.notion.so/workspace/Page-Name-abc123def456abc123def456abc123de'
    );
    assert.equal(result, 'abc123def456abc123def456abc123de');
  });

  it('normalises dashed UUID to undashed 32-char hex', () => {
    const result = parseNotionUrl(
      'https://www.notion.so/workspace/Page-Name-abc123de-f456-abc1-23de-f456abc123de'
    );
    assert.equal(result, 'abc123def456abc123def456abc123de');
  });

  it('handles bare 32-char ID path', () => {
    const result = parseNotionUrl(
      'https://notion.so/abc123def456abc123def456abc123de'
    );
    assert.equal(result, 'abc123def456abc123def456abc123de');
  });

  it('strips query params before parsing', () => {
    const result = parseNotionUrl(
      'https://www.notion.so/workspace/Page-Name-abc123def456abc123def456abc123de?v=1234'
    );
    assert.equal(result, 'abc123def456abc123def456abc123de');
  });

  it('returns null for non-URL string', () => {
    assert.equal(parseNotionUrl('not-a-url'), null);
  });

  it('returns null for URL with no valid page_id', () => {
    assert.equal(parseNotionUrl('https://www.notion.so/'), null);
  });

  it('returns null for URL with non-hex segment', () => {
    assert.equal(parseNotionUrl('https://www.notion.so/Page-Name-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'), null);
  });
});

// ── validateNotionConfig ──────────────────────────────────────────

describe('validateNotionConfig', () => {
  it('accepts valid config with one page', () => {
    const result = validateNotionConfig({
      version: 1,
      pages: [{ page_id: 'abc123def456abc123def456abc123de', page_url: 'https://notion.so/abc123def456abc123def456abc123de', vault_path: 'docs/notion', refresh_strategy: 'manual' }],
    });
    assert.equal(result.valid, true);
  });

  it('rejects missing version', () => {
    const result = validateNotionConfig({});
    assert.equal(result.valid, false);
    assert.match(result.reason, /version/i);
  });

  it('rejects unsupported version (v2)', () => {
    const result = validateNotionConfig({ version: 2, pages: [] });
    assert.equal(result.valid, false);
    assert.match(result.reason, /version/i);
  });

  it('rejects pages as non-array', () => {
    const result = validateNotionConfig({ version: 1, pages: 'not-array' });
    assert.equal(result.valid, false);
    assert.match(result.reason, /array/i);
  });

  it('accepts empty pages array', () => {
    const result = validateNotionConfig({ version: 1, pages: [] });
    assert.equal(result.valid, true);
  });

  it('rejects page missing page_id', () => {
    const result = validateNotionConfig({
      version: 1,
      pages: [{ page_url: 'https://notion.so/x' }],
    });
    assert.equal(result.valid, false);
    assert.match(result.reason, /page_id/i);
  });

  it('rejects page with invalid page_id (non-hex)', () => {
    const result = validateNotionConfig({
      version: 1,
      pages: [{ page_id: 'not-hex', page_url: 'https://notion.so/x' }],
    });
    assert.equal(result.valid, false);
    assert.match(result.reason, /page_id/i);
  });
});

// ── readNotionConfig / writeNotionConfig ──────────────────────────

describe('readNotionConfig', () => {
  it('returns null when config file is missing', () => {
    const { dir, cleanup } = makeTempDir();
    try {
      const result = readNotionConfig(dir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });

  it('round-trips write then read', () => {
    const { dir, cleanup } = makeTempDir();
    try {
      const config = {
        version: 1,
        pages: [
          { page_id: 'aabbccddeeff00112233445566778899', page_url: 'https://notion.so/aabbccddeeff00112233445566778899' },
        ],
      };
      writeNotionConfig(dir, config);
      const read = readNotionConfig(dir);
      assert.deepEqual(read, config);
    } finally {
      cleanup();
    }
  });

  it('returns null for invalid JSON in config file', () => {
    const { dir, cleanup } = makeTempDir();
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'notion_pages.json'), 'invalid json', 'utf8');
      const result = readNotionConfig(dir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });

  it('returns null for invalid config schema', () => {
    const { dir, cleanup } = makeTempDir();
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'notion_pages.json'), JSON.stringify({ version: 99, pages: [] }), 'utf8');
      const result = readNotionConfig(dir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });
});

describe('writeNotionConfig', () => {
  it('creates .claude dir if missing and writes file', () => {
    const { dir, cleanup } = makeTempDir();
    try {
      const config = { version: 1, pages: [] };
      writeNotionConfig(dir, config);
      const filePath = join(dir, '.claude', 'notion_pages.json');
      assert.ok(existsSync(filePath), 'config file should exist');
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      assert.deepEqual(parsed, config);
    } finally {
      cleanup();
    }
  });
});

// ── cleanNotionFilename export check ─────────────────────────────

describe('cleanNotionFilename (re-exported from lib/docs.mjs)', () => {
  it('is importable and removes UUID suffix from Notion filenames', () => {
    const input = 'My Page abc123def456abc123def456abc123de.md';
    const result = cleanNotionFilename(input);
    assert.equal(result, 'my-page.md');
  });
});
