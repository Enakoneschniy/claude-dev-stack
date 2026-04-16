/**
 * tests/notebooklm-search.test.mjs — unit tests for runSearch() in lib/notebooklm-cli.mjs.
 *
 * Covers all 5 D-10 behavior cases:
 *   Case 1 — Happy path: 2 notebooks, both succeed
 *   Case 2 — Partial failure: 2 notebooks, 1 fails
 *   Case 3 — All-fail: 2 notebooks, both fail
 *   Case 4 — Zero notebooks (no cds__ notebooks)
 *   Case 5 — --json flag output
 *
 * Uses injectable _listFn and _askFn — no live CLI calls.
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import assert from 'node:assert/strict';

import { runSearch } from '../lib/notebooklm-cli.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_NOTEBOOKS = [
  { id: 'nb-001', title: 'cds__project-alpha', createdAt: null },
  { id: 'nb-002', title: 'cds__project-beta', createdAt: null },
  { id: 'nb-999', title: 'personal-notebook', createdAt: null }, // non-cds__ filtered out
];

const FAKE_ANSWER = {
  answer: 'Here is the answer text.',
  citations: [{ index: 1, sourceId: 'src-abc', sourceTitle: null, snippet: 'relevant snippet' }],
};

// ── Console capture helper ────────────────────────────────────────────────────

function captureConsole() {
  const lines = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push('[stderr] ' + args.join(' '));
  return {
    lines,
    restore() {
      console.log = origLog;
      console.error = origError;
    },
  };
}

// ── Case 1: Happy path ────────────────────────────────────────────────────────

describe('runSearch: Case 1 — happy path (2 notebooks, both succeed)', () => {
  let cap;

  beforeEach(() => {
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
  });

  it('returns results from both notebooks and does not throw', async () => {
    const _listFn = async () => FAKE_NOTEBOOKS;
    const _askFn = async (_id, _q) => FAKE_ANSWER;

    await runSearch(['what is this project?'], { _listFn, _askFn });

    const joined = cap.lines.join('\n');
    // Both cds__ notebooks appear by slug
    assert.ok(joined.includes('project-alpha'), `Expected "project-alpha" in output:\n${joined}`);
    assert.ok(joined.includes('project-beta'), `Expected "project-beta" in output:\n${joined}`);
    // Answer text appears
    assert.ok(joined.includes('Here is the answer text.'), `Expected answer text in output:\n${joined}`);
    // Non-cds__ notebook does NOT appear
    assert.ok(!joined.includes('personal-notebook'), `personal-notebook should be filtered out:\n${joined}`);
  });
});

// ── Case 2: Partial failure ───────────────────────────────────────────────────

describe('runSearch: Case 2 — partial failure (1 succeeds, 1 fails)', () => {
  let cap;

  beforeEach(() => {
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
  });

  it('prints successful result and warning for failed notebook, does not throw', async () => {
    const _listFn = async () => [
      { id: 'nb-001', title: 'cds__project-alpha', createdAt: null },
      { id: 'nb-002', title: 'cds__project-beta', createdAt: null },
    ];
    const _askFn = async (id, _q) => {
      if (id === 'nb-002') throw new Error('API error');
      return FAKE_ANSWER;
    };

    // Should NOT throw — at least one succeeded
    await runSearch(['what is this project?'], { _listFn, _askFn });

    const joined = cap.lines.join('\n');
    // Alpha's answer appears
    assert.ok(joined.includes('Here is the answer text.'), `Expected alpha's answer:\n${joined}`);
    // Beta warning appears
    assert.ok(joined.includes('project-beta'), `Expected beta warning in output:\n${joined}`);
  });
});

// ── Case 3: All-fail ──────────────────────────────────────────────────────────

describe('runSearch: Case 3 — all notebooks fail', () => {
  let cap;

  beforeEach(() => {
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
  });

  it('throws and prints warning lines for both failed notebooks', async () => {
    const _listFn = async () => [
      { id: 'nb-001', title: 'cds__project-alpha', createdAt: null },
      { id: 'nb-002', title: 'cds__project-beta', createdAt: null },
    ];
    const _askFn = async (_id, _q) => { throw new Error('Service unavailable'); };

    await assert.rejects(
      () => runSearch(['what is this project?'], { _listFn, _askFn }),
      /All 2 notebook queries failed/
    );

    const joined = cap.lines.join('\n');
    // Both projects mentioned in warnings
    assert.ok(joined.includes('project-alpha'), `Expected alpha warning:\n${joined}`);
    assert.ok(joined.includes('project-beta'), `Expected beta warning:\n${joined}`);
  });
});

// ── Case 4: Zero notebooks ────────────────────────────────────────────────────

describe('runSearch: Case 4 — zero project notebooks', () => {
  let cap;

  beforeEach(() => {
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
  });

  it('prints info message and does not throw when no cds__ notebooks exist', async () => {
    // Only non-cds__ notebooks — all filtered out
    const _listFn = async () => [
      { id: 'nb-999', title: 'personal-notebook', createdAt: null },
    ];
    const _askFn = async () => { throw new Error('Should not be called'); };

    await runSearch(['what is this project?'], { _listFn, _askFn });

    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('No project notebooks configured'), `Expected zero-notebooks message:\n${joined}`);
  });

  it('prints info message when listFn returns empty array', async () => {
    const _listFn = async () => [];
    const _askFn = async () => { throw new Error('Should not be called'); };

    await runSearch(['what is this project?'], { _listFn, _askFn });

    const joined = cap.lines.join('\n');
    assert.ok(joined.includes('No project notebooks configured'), `Expected zero-notebooks message:\n${joined}`);
  });
});

// ── Case 5: --json flag ───────────────────────────────────────────────────────

describe('runSearch: Case 5 — --json flag', () => {
  let cap;

  beforeEach(() => {
    cap = captureConsole();
  });

  afterEach(() => {
    cap.restore();
  });

  it('outputs valid JSON with query/results/errors keys', async () => {
    const _listFn = async () => [
      { id: 'nb-001', title: 'cds__project-alpha', createdAt: null },
    ];
    const _askFn = async (_id, _q) => FAKE_ANSWER;

    await runSearch(['--json', 'what is this project?'], { _listFn, _askFn });

    // Find the JSON line (non-empty, parseable)
    const jsonLine = cap.lines.find(l => {
      try { JSON.parse(l); return true; } catch { return false; }
    });
    assert.ok(jsonLine, `Expected a JSON line in output. Got:\n${cap.lines.join('\n')}`);

    const parsed = JSON.parse(jsonLine);
    assert.ok(Array.isArray(parsed.results), 'Expected results array');
    assert.ok(Array.isArray(parsed.errors), 'Expected errors array');
    assert.strictEqual(typeof parsed.query, 'string', 'Expected query string');

    assert.strictEqual(parsed.results.length, 1);
    assert.strictEqual(parsed.results[0].project, 'project-alpha');
    assert.strictEqual(parsed.results[0].answer, FAKE_ANSWER.answer);
    assert.strictEqual(parsed.errors.length, 0);
  });

  it('does not output formatted divider or Citations header in json mode', async () => {
    const _listFn = async () => [
      { id: 'nb-001', title: 'cds__project-alpha', createdAt: null },
    ];
    const _askFn = async (_id, _q) => FAKE_ANSWER;

    await runSearch(['--json', 'what is this project?'], { _listFn, _askFn });

    const joined = cap.lines.join('\n');
    assert.ok(!joined.includes('Citations'), `Citations header should not appear in json mode:\n${joined}`);
    assert.ok(!joined.includes('──────'), `Divider should not appear in json mode:\n${joined}`);
  });
});
