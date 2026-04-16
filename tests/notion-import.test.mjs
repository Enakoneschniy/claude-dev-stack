/**
 * Tests for lib/notion-import.mjs — frontmatter stamps, hash checks, overwrite protection.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

import {
  contentHash,
  stampFrontmatter,
  parseFrontmatter,
  importPage,
  importAllPages,
} from '../lib/notion-import.mjs';

// ── Helpers ───────────────────────────────────────────────────────

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-notion-imp-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── contentHash ───────────────────────────────────────────────────

describe('contentHash', () => {
  it('returns SHA-256 hex of given text', () => {
    const expected = createHash('sha256').update('hello world', 'utf8').digest('hex');
    assert.equal(contentHash('hello world'), expected);
  });

  it('produces consistent results for same input', () => {
    assert.equal(contentHash('test'), contentHash('test'));
  });

  it('produces different results for different input', () => {
    assert.notEqual(contentHash('foo'), contentHash('bar'));
  });
});

// ── stampFrontmatter ──────────────────────────────────────────────

describe('stampFrontmatter', () => {
  it('includes notion_page_id in frontmatter', () => {
    const result = stampFrontmatter('# Page', { page_id: 'abc123' });
    assert.match(result, /notion_page_id: abc123/);
  });

  it('includes notion_last_synced ISO timestamp in frontmatter', () => {
    const result = stampFrontmatter('# Page', { page_id: 'abc123' });
    assert.match(result, /notion_last_synced: \d{4}-\d{2}-\d{2}T/);
  });

  it('includes notion_content_hash in frontmatter', () => {
    const body = '# Page';
    const hash = contentHash(body);
    const result = stampFrontmatter(body, { page_id: 'abc123' });
    assert.match(result, new RegExp(`notion_content_hash: ${hash}`));
  });

  it('wraps frontmatter in --- delimiters', () => {
    const result = stampFrontmatter('# Page', { page_id: 'abc123' });
    assert.ok(result.startsWith('---\n'), 'should start with ---');
    assert.match(result, /---\n\n# Page/);
  });

  it('body comes after the closing ---', () => {
    const result = stampFrontmatter('# My Page\n\nContent', { page_id: 'abc' });
    const afterFrontmatter = result.split('---\n\n')[1];
    assert.equal(afterFrontmatter, '# My Page\n\nContent');
  });
});

// ── parseFrontmatter ──────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('extracts notion_page_id from frontmatter', () => {
    const content = '---\nnotion_page_id: abc\nnotion_content_hash: def\n---\n\n# Page';
    const result = parseFrontmatter(content);
    assert.equal(result.notion_page_id, 'abc');
  });

  it('extracts notion_content_hash from frontmatter', () => {
    const content = '---\nnotion_page_id: abc\nnotion_content_hash: def\n---\n\n# Page';
    const result = parseFrontmatter(content);
    assert.equal(result.notion_content_hash, 'def');
  });

  it('extracts body after frontmatter', () => {
    const content = '---\nnotion_page_id: abc\nnotion_content_hash: def\n---\n\n# Page';
    const result = parseFrontmatter(content);
    assert.equal(result.body, '# Page');
  });

  it('returns body as-is when no frontmatter', () => {
    const content = '# No frontmatter\n\nSome content';
    const result = parseFrontmatter(content);
    assert.equal(result.body, content);
    assert.equal(result.notion_page_id, undefined);
    assert.equal(result.notion_content_hash, undefined);
  });

  it('round-trips with stampFrontmatter', () => {
    const body = '# Round-trip test\n\nContent here.';
    const stamped = stampFrontmatter(body, { page_id: 'aabbcc112233aabbcc112233aabbcc11' });
    const parsed = parseFrontmatter(stamped);
    assert.equal(parsed.notion_page_id, 'aabbcc112233aabbcc112233aabbcc11');
    assert.equal(parsed.body, body);
    assert.equal(parsed.notion_content_hash, contentHash(body));
  });
});

// ── importPage ────────────────────────────────────────────────────

describe('importPage', () => {
  let tmpDir, cleanup;

  beforeEach(() => {
    const t = makeTempDir();
    tmpDir = t.dir;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  const pageConfig = { page_id: 'aabbccddeeff00112233445566778899', page_url: 'https://notion.so/x' };

  it('creates file with frontmatter when file does not exist', async () => {
    const markdown = '# My Page\n\nSome content.';
    const result = await importPage(tmpDir, pageConfig, markdown);
    assert.equal(result.status, 'created');

    const files = (await import('fs')).readdirSync(tmpDir);
    assert.ok(files.length > 0, 'should have written a file');

    const written = (await import('fs')).readFileSync(join(tmpDir, files[0]), 'utf8');
    assert.match(written, /notion_page_id:/);
    assert.match(written, /notion_content_hash:/);
  });

  it('returns unchanged when Notion content hash matches stored hash', async () => {
    const markdown = '# Stable Page\n\nStable content.';
    // First import
    await importPage(tmpDir, pageConfig, markdown);

    // Re-import same content
    const result = await importPage(tmpDir, pageConfig, markdown);
    assert.equal(result.status, 'unchanged');
  });

  it('overwrites in place when local body was not edited (clean update)', async () => {
    const markdown1 = '# Page\n\nOriginal.';
    await importPage(tmpDir, pageConfig, markdown1);

    const markdown2 = '# Page\n\nUpdated by Notion.';
    const result = await importPage(tmpDir, pageConfig, markdown2);
    assert.equal(result.status, 'updated');

    // No .notion-update.md sibling should exist
    const files = (await import('fs')).readdirSync(tmpDir);
    assert.ok(!files.some(f => f.endsWith('.notion-update.md')), 'should not create sibling');

    // File should contain new content
    const written = (await import('fs')).readFileSync(join(tmpDir, files[0]), 'utf8');
    assert.match(written, /Updated by Notion/);
  });

  it('writes .notion-update.md sibling when local body was edited', async () => {
    const markdown = '# Page\n\nOriginal from Notion.';
    await importPage(tmpDir, pageConfig, markdown);

    // Simulate local edit: modify the stored file body
    const files = (await import('fs')).readdirSync(tmpDir);
    const filePath = join(tmpDir, files[0]);
    const parsed = parseFrontmatter((await import('fs')).readFileSync(filePath, 'utf8'));
    // Write back with modified body but keep original frontmatter
    (await import('fs')).writeFileSync(filePath,
      `---\nnotion_page_id: ${parsed.notion_page_id}\nnotion_last_synced: ${parsed.notion_last_synced}\nnotion_content_hash: ${parsed.notion_content_hash}\n---\n\n# Page\n\nLocally edited version.`,
      'utf8'
    );

    // Now import new Notion content
    const newMarkdown = '# Page\n\nNew version from Notion.';
    const result = await importPage(tmpDir, pageConfig, newMarkdown);
    assert.equal(result.status, 'conflict');

    // .notion-update.md sibling should exist
    const allFiles = (await import('fs')).readdirSync(tmpDir);
    assert.ok(allFiles.some(f => f.endsWith('.notion-update.md')), 'should create .notion-update.md sibling');
  });
});

// ── importAllPages ────────────────────────────────────────────────

describe('importAllPages', () => {
  let projectDir, vaultDir, cleanup;

  beforeEach(() => {
    const t = makeTempDir();
    projectDir = t.dir;
    cleanup = t.cleanup;

    // Set up project with notion_pages.json
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    writeFileSync(
      join(projectDir, '.claude', 'notion_pages.json'),
      JSON.stringify({
        version: 1,
        pages: [
          { page_id: 'aabbccddeeff00112233445566778899', page_url: 'https://notion.so/page1' },
          { page_id: 'bbbbccddeeff00112233445566778899', page_url: 'https://notion.so/page2' },
        ],
      }),
      'utf8'
    );

    // Set vault dir to a subdir of temp
    vaultDir = join(projectDir, 'vault');
    mkdirSync(vaultDir, { recursive: true });
  });

  afterEach(() => cleanup());

  it('calls fetchFn for each page and returns counts', async () => {
    const calls = [];
    const fetchFn = async (pageId) => {
      calls.push(pageId);
      // Use distinct titles so cleanNotionFilename produces different filenames
      const title = pageId === 'aabbccddeeff00112233445566778899' ? 'Alpha Doc' : 'Beta Doc';
      return `# ${title}\n\nContent for ${pageId}.`;
    };

    const counts = await importAllPages(projectDir, vaultDir, fetchFn);

    assert.equal(calls.length, 2, 'should call fetchFn twice');
    assert.ok(calls.includes('aabbccddeeff00112233445566778899'));
    assert.ok(calls.includes('bbbbccddeeff00112233445566778899'));
    assert.equal(typeof counts.created, 'number');
    assert.equal(typeof counts.updated, 'number');
    assert.equal(typeof counts.unchanged, 'number');
    assert.equal(typeof counts.conflict, 'number');
    assert.equal(counts.created, 2, 'should create 2 new files');
  });

  it('returns null counts when no notion_pages.json found', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'cds-no-cfg-'));
    try {
      const result = await importAllPages(emptyDir, vaultDir, async () => '');
      assert.equal(result, null);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
