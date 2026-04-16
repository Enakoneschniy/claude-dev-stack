import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

describe('silent-session-start (Phase 28 / SSR-01)', () => {
  describe('lib/install/claude-md.mjs', () => {
    const src = readFileSync(join(repoRoot, 'lib', 'install', 'claude-md.mjs'), 'utf8');

    it('Knowledge Base section instructs Claude NOT to re-read context.md on first message', () => {
      assert.match(src, /Knowledge Base/);
      assert.match(src, /Do NOT re-read/i);
    });

    it('references the SessionStart hook as the context loader', () => {
      assert.match(src, /SessionStart hook/);
      assert.match(src, /session-start-context\.sh/);
    });

    it('references the 60-minute marker window', () => {
      assert.match(src, /60 min/);
      assert.match(src, /\.claude\/\.session-loaded/);
    });

    it('does NOT contain the legacy "ALWAYS read" instruction in managedBody', () => {
      // Make sure the template no longer tells Claude to ALWAYS cat context.md.
      // Match is case-sensitive: we look for the exact pre-Phase-28 wording.
      const legacy = /Before starting, ALWAYS read:\s*\n\s*1\.\s*`cat/;
      assert.ok(!legacy.test(src), 'legacy "ALWAYS read" template block still present');
    });
  });

  describe('skills/session-manager/SKILL.md', () => {
    const src = readFileSync(join(repoRoot, 'skills', 'session-manager', 'SKILL.md'), 'utf8');
    // Split frontmatter from body for targeted assertions.
    const fmMatch = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    assert.ok(fmMatch, 'SKILL.md frontmatter parse failed');
    const frontmatter = fmMatch[1];
    const body = fmMatch[2];

    it('frontmatter omits "привет" greeting trigger', () => {
      assert.ok(!frontmatter.includes('"привет"'), 'frontmatter still references "привет"');
    });

    it('frontmatter omits bare "hi" greeting trigger', () => {
      // Allow the substring inside other words (history, this) but not the quoted token.
      assert.ok(!frontmatter.includes('"hi"'), 'frontmatter still references "hi"');
    });

    it('frontmatter omits "начинаем" greeting trigger', () => {
      assert.ok(!frontmatter.includes('"начинаем"'), 'frontmatter still references "начинаем"');
    });

    it('frontmatter omits "FIRST message" / "first message" auto-activation clause', () => {
      assert.ok(
        !/first message/i.test(frontmatter.replace(/Do NOT auto-activate on greetings or the first message of a session/i, '')),
        'frontmatter still auto-activates on first message outside the negation clause'
      );
    });

    it('frontmatter keeps end-trigger vocabulary', () => {
      for (const token of ['"done"', '"end"', '"всё"', '"хватит"', '"finish"']) {
        assert.ok(frontmatter.includes(token), `frontmatter missing end trigger ${token}`);
      }
    });

    it('frontmatter keeps explicit resume-intent triggers', () => {
      for (const token of ['"resume"', '"продолжи"', '"что делали"', '"handoff"']) {
        assert.ok(frontmatter.includes(token), `frontmatter missing resume trigger ${token}`);
      }
    });

    it('/resume body checks .claude/.session-loaded marker mtime', () => {
      assert.match(body, /\.claude\/\.session-loaded/);
      // Portable stat check (macOS + Linux)
      assert.match(body, /stat -f %m/);
      assert.match(body, /stat -c %Y/);
      // Uses 3600-second threshold
      assert.match(body, /-lt 3600/);
    });

    it('body no longer contains the "FIRST message in a Claude Code session" auto-activation paragraph', () => {
      assert.ok(
        !/detects this is the FIRST message/i.test(body),
        'FIRST-message auto-activation paragraph still present in body'
      );
    });

    it('/end Auto-ADR capture block is unchanged', () => {
      assert.match(body, /Auto-ADR Capture \(Phase 26, ADR-02\)/);
      assert.match(body, /lib\/adr-bridge-session\.mjs/);
      assert.match(body, /ADR_BRIDGE="\$REPO_ROOT\/lib\/adr-bridge-session\.mjs"/);
    });

    it('/end bash block still invokes update-context.mjs via VAULT_PATH+CDS_PROJECT_NAME', () => {
      assert.match(body, /VAULT_PATH="\$VAULT" CDS_PROJECT_NAME="\$PROJECT_NAME"/);
      assert.match(body, /hooks\/update-context\.mjs/);
    });
  });
});
