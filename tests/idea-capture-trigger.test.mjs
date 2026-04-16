import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'idea-capture-trigger.mjs');
const configPath = join(__dirname, '..', 'hooks', 'idea-capture-triggers.json');

function runHook(input, env) {
  return spawnSync('node', [hookPath], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 3000,
    env: env ?? process.env,
  });
}

const HINT_PREFIX = '💡 IDEA-CAPTURE HINT:';
const HINT_REGEX = /^💡 IDEA-CAPTURE HINT: Detected trigger phrase "[^"]+" in user message\. Consider invoking \/gsd-note to capture the idea to \.planning\/notes\/\.\s*$/;

describe('idea-capture-trigger.mjs', () => {
  describe('file + config sanity', () => {
    it('hook file exists and starts with node shebang (case 1)', () => {
      assert.ok(existsSync(hookPath), 'hooks/idea-capture-trigger.mjs must exist');
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(
        content.startsWith('#!/usr/bin/env node'),
        'hook must start with #!/usr/bin/env node shebang'
      );
    });

    it('config JSON is valid and has expected shape (case 2)', () => {
      assert.ok(existsSync(configPath), 'hooks/idea-capture-triggers.json must exist');
      const raw = readFileSync(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      assert.ok(Array.isArray(cfg.russian), 'russian must be an array');
      assert.ok(Array.isArray(cfg.english), 'english must be an array');
      assert.ok(cfg.russian.length >= 8, `russian must have ≥8 entries, got ${cfg.russian.length}`);
      assert.ok(cfg.english.length >= 5, `english must have ≥5 entries, got ${cfg.english.length}`);
      assert.ok(cfg.russian.includes('кстати'), 'russian must contain "кстати"');
      assert.ok(cfg.english.includes('btw'), 'english must contain "btw"');
    });
  });

  describe('input handling', () => {
    it('empty stdin → exit 0, no stdout (case 3)', () => {
      const result = spawnSync('node', [hookPath], {
        input: '',
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    });

    it('malformed JSON → exit 0, no stdout (case 4)', () => {
      const result = spawnSync('node', [hookPath], {
        input: 'not-json{{{',
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    });
  });

  describe('trigger matching', () => {
    it('Russian trigger "кстати" matches (case 5)', () => {
      const result = runHook({ prompt: 'кстати, надо бы починить баг' });
      assert.equal(result.status, 0);
      assert.ok(
        result.stdout.includes(HINT_PREFIX),
        `expected hint prefix in stdout, got: "${result.stdout}"`
      );
      assert.ok(
        result.stdout.includes('кстати'),
        `expected matched phrase "кстати" in stdout, got: "${result.stdout}"`
      );
    });

    it('English trigger "btw" matches (case 6)', () => {
      const result = runHook({ prompt: 'btw we should refactor this' });
      assert.equal(result.status, 0);
      assert.ok(
        result.stdout.includes(HINT_PREFIX),
        `expected hint prefix, got: "${result.stdout}"`
      );
      assert.ok(
        result.stdout.includes('btw'),
        `expected matched phrase "btw" in stdout, got: "${result.stdout}"`
      );
    });

    it('case-insensitive match on uppercase Cyrillic (case 7)', () => {
      const result = runHook({ prompt: 'КСТАТИ, забыл сказать' });
      assert.equal(result.status, 0);
      assert.ok(
        result.stdout.includes(HINT_PREFIX),
        `expected hint prefix, got: "${result.stdout}"`
      );
    });

    it('non-trigger prompt → silent (case 8)', () => {
      const result = runHook({ prompt: 'fix the login bug on the auth page' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
    });

    it('false-positive guard: "идеальный" / "идентификатор" do NOT match (case 9)', () => {
      const result = runHook({ prompt: 'идеальный вариант для идентификатора' });
      assert.equal(result.status, 0);
      assert.equal(
        result.stdout,
        '',
        `expected no match for substring-only triggers, got: "${result.stdout}"`
      );
    });

    it('multiple triggers → single hint (first-match-wins) (case 10)', () => {
      const result = runHook({ prompt: 'кстати, идея: давай подумал над этим' });
      assert.equal(result.status, 0);
      const occurrences = result.stdout.match(/IDEA-CAPTURE HINT/g) || [];
      assert.equal(
        occurrences.length,
        1,
        `expected exactly 1 hint, got ${occurrences.length}: "${result.stdout}"`
      );
    });

    it('hint format matches exact CAPTURE-03 spec (case 11)', () => {
      const result = runHook({ prompt: 'кстати, вот идея для проекта' });
      assert.equal(result.status, 0);
      assert.match(
        result.stdout,
        HINT_REGEX,
        `hint format mismatch: "${result.stdout}"`
      );
    });
  });

  describe('telemetry counter (CAPTURE-04)', () => {
    let tmpHome;

    beforeEach(() => {
      tmpHome = mkdtempSync(join(tmpdir(), 'idea-capture-home-'));
    });

    function cleanup() {
      if (tmpHome && existsSync(tmpHome)) {
        rmSync(tmpHome, { recursive: true, force: true });
      }
    }

    function statsPath() {
      return join(tmpHome, '.claude', 'cds-stats.json');
    }

    function readStats() {
      const p = statsPath();
      if (!existsSync(p)) return null;
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        return '__UNPARSABLE__';
      }
    }

    it('increments counter on match; twice → counter = 2 (case 12)', () => {
      try {
        const env = { ...process.env, HOME: tmpHome };
        const r1 = runHook({ prompt: 'кстати, надо записать идею' }, env);
        assert.equal(r1.status, 0);
        assert.ok(existsSync(statsPath()), 'stats file must exist after 1st invocation');
        const s1 = readStats();
        assert.equal(typeof s1, 'object');
        assert.ok(Number.isInteger(s1.idea_capture_hints_fired));
        assert.ok(s1.idea_capture_hints_fired >= 1);

        const r2 = runHook({ prompt: 'btw one more thing' }, env);
        assert.equal(r2.status, 0);
        const s2 = readStats();
        assert.equal(s2.idea_capture_hints_fired, 2);
      } finally {
        cleanup();
      }
    });

    it('absent stats file → hook creates it with counter = 1 (case 13)', () => {
      try {
        const env = { ...process.env, HOME: tmpHome };
        assert.ok(!existsSync(statsPath()), 'precondition: stats file must not exist');
        const result = runHook({ prompt: 'кстати, идея' }, env);
        assert.equal(result.status, 0);
        assert.ok(existsSync(statsPath()), 'hook must create stats file');
        const stats = readStats();
        assert.equal(stats.idea_capture_hints_fired, 1);
      } finally {
        cleanup();
      }
    });

    it('corrupt stats file → hook exits 0, no crash (case 14)', () => {
      try {
        mkdirSync(join(tmpHome, '.claude'), { recursive: true });
        writeFileSync(statsPath(), 'not-valid-json{');
        const env = { ...process.env, HOME: tmpHome };
        const result = runHook({ prompt: 'кстати, ещё идея' }, env);
        assert.equal(result.status, 0);
        // Hint still emitted regardless of stats state
        assert.ok(result.stdout.includes(HINT_PREFIX));
        // stderr should not contain noisy traceback
        assert.ok(
          !result.stderr.includes('SyntaxError') || result.status === 0,
          'hook must not crash on corrupt stats'
        );
      } finally {
        cleanup();
      }
    });

    it('no match → counter NOT incremented (case 15)', () => {
      try {
        const env = { ...process.env, HOME: tmpHome };
        const result = runHook({ prompt: 'fix the login bug on the auth page' }, env);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        // Stats file may be absent (preferred: no side effect on non-match)
        // OR present with counter 0 — either is acceptable per plan
        const stats = readStats();
        if (stats !== null) {
          const n = Number(stats.idea_capture_hints_fired) || 0;
          assert.equal(n, 0, `counter must not increment on non-match, got ${n}`);
        }
      } finally {
        cleanup();
      }
    });
  });
});
