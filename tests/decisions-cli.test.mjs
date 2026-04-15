import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  main,
  parseAdrFile,
  listDecisions,
  findDecision,
  searchDecisions,
  resolveProject,
} from '../lib/decisions-cli.mjs';

// ─── Fixtures ──────────────────────────────────────────────────────

function setupTmpVault() {
  const dir = mkdtempSync(join(tmpdir(), 'decisions-cli-'));
  const vault = join(dir, 'vault');
  const projDir = join(vault, 'projects', 'test-project', 'decisions');
  mkdirSync(projDir, { recursive: true });
  return { dir, vault, projDir };
}

const ADR_NEW = `---
id: 0013
topic: logging-strategy
status: accepted
date: 2026-04-14
source:
  session_log: 2026-04-14-phase-26.md
  commit: a3f9c21
---

# ADR 0013: Use pino for structured logging

## Context
We need JSON logs.

## Decision
Use pino.

## Consequences
faster, smaller
`;

const ADR_OLD = `# ADR-0005: Use pino for structured logging

**Дата**: 2026-03-15
**Статус**: accepted

## Контекст
Why
## Решение
Use pino
## Последствия
json logs
`;

const ADR_OTHER = `---
id: 0008
topic: cache-layer
status: proposed
date: 2026-03-20
source:
  session_log: old.md
---

# ADR 0008: Maybe use redis

## Context
we need cache.

## Decision
redis candidate.

## Consequences
investigate.
`;

// ─── Stdout capture helper ────────────────────────────────────────
function captureStdout(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    return Promise.resolve(fn()).then((r) => {
      console.log = orig;
      return { result: r, out: lines.join('\n') };
    }, (e) => { console.log = orig; throw e; });
  } catch (e) {
    console.log = orig;
    throw e;
  }
}

// Patch process.exit so we can assert exit code without killing test runner
function withExitStub(fn) {
  const origExit = process.exit;
  const captured = {};
  process.exit = (code) => { captured.code = code; throw new Error('__exit__'); };
  try {
    return Promise.resolve(fn(captured)).finally(() => { process.exit = origExit; });
  } catch (e) {
    process.exit = origExit;
    throw e;
  }
}

// ─── parseAdrFile ─────────────────────────────────────────────────
describe('parseAdrFile', () => {
  let t; beforeEach(() => { t = setupTmpVault(); });
  afterEach(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('parses new format with frontmatter', () => {
    const fp = join(t.projDir, '0013-logging-strategy.md');
    writeFileSync(fp, ADR_NEW);
    const p = parseAdrFile(fp);
    assert.equal(p.id, 13);
    assert.equal(p.topic, 'logging-strategy');
    assert.equal(p.status, 'accepted');
    assert.equal(p.date, '2026-04-14');
    assert.equal(p.title, 'Use pino for structured logging');
  });

  it('parses old format without frontmatter', () => {
    const fp = join(t.projDir, '0005-logging-strategy.md');
    writeFileSync(fp, ADR_OLD);
    const p = parseAdrFile(fp);
    assert.equal(p.id, 5);
    assert.equal(p.topic, null);
    assert.equal(p.topicFromFilename, 'logging-strategy');
    assert.equal(p.status, 'accepted');
    assert.equal(p.date, '2026-03-15');
    assert.equal(p.title, 'Use pino for structured logging');
  });
});

// ─── listDecisions ────────────────────────────────────────────────
describe('listDecisions', () => {
  let t; beforeEach(() => { t = setupTmpVault(); });
  afterEach(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('returns entries sorted by id ascending', () => {
    writeFileSync(join(t.projDir, '0013-logging-strategy.md'), ADR_NEW);
    writeFileSync(join(t.projDir, '0005-logging-strategy.md'), ADR_OLD);
    writeFileSync(join(t.projDir, '0008-cache-layer.md'), ADR_OTHER);
    const all = listDecisions(t.projDir);
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((e) => e.id), [5, 8, 13]);
  });

  it('returns empty array when dir missing', () => {
    assert.deepEqual(listDecisions(join(t.dir, 'no-such-dir')), []);
  });
});

// ─── findDecision ─────────────────────────────────────────────────
describe('findDecision', () => {
  let t; beforeEach(() => {
    t = setupTmpVault();
    writeFileSync(join(t.projDir, '0013-logging-strategy.md'), ADR_NEW);
    writeFileSync(join(t.projDir, '0005-logging-strategy.md'), ADR_OLD);
    writeFileSync(join(t.projDir, '0008-cache-layer.md'), ADR_OTHER);
  });
  afterEach(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('finds by numeric with leading zeros', () => {
    const a = findDecision(t.projDir, '0005');
    const b = findDecision(t.projDir, '5');
    assert.ok(a, 'found by 0005');
    assert.ok(b, 'found by 5');
    assert.equal(a.id, 5);
    assert.equal(b.id, 5);
  });

  it('finds by topic slug', () => {
    const hit = findDecision(t.projDir, 'cache-layer');
    assert.ok(hit);
    assert.equal(hit.id, 8);
  });

  it('finds by partial substring', () => {
    const hit = findDecision(t.projDir, 'logging');
    assert.ok(hit);
    assert.ok([5, 13].includes(hit.id));
  });

  it('returns null when none', () => {
    assert.equal(findDecision(t.projDir, 'absent-nowhere'), null);
  });
});

// ─── searchDecisions ──────────────────────────────────────────────
describe('searchDecisions', () => {
  let t; beforeEach(() => {
    t = setupTmpVault();
    writeFileSync(join(t.projDir, '0013-logging-strategy.md'), ADR_NEW);
    writeFileSync(join(t.projDir, '0005-logging-strategy.md'), ADR_OLD);
    writeFileSync(join(t.projDir, '0008-cache-layer.md'), ADR_OTHER);
  });
  afterEach(() => { try { rmSync(t.dir, { recursive: true, force: true }); } catch {} });

  it('ranks topic exact > title > content', () => {
    const res = searchDecisions(t.projDir, 'logging');
    assert.ok(res.length >= 1);
    for (let i = 1; i < res.length; i++) {
      assert.ok(res[i - 1].score >= res[i].score, 'sorted desc');
    }
    assert.ok(res[0].score >= 50);
  });
});

// ─── resolveProject ───────────────────────────────────────────────
describe('resolveProject', () => {
  it('uses explicit project name when given', () => {
    process.env.VAULT_PATH = '/tmp/test-vault';
    const r = resolveProject('/any/cwd', 'myproj');
    assert.equal(r.projectName, 'myproj');
    assert.ok(r.decisionsDir.endsWith('/projects/myproj/decisions'));
    delete process.env.VAULT_PATH;
  });

  it('derives from cwd basename', () => {
    process.env.VAULT_PATH = '/tmp/test-vault';
    const tmp = mkdtempSync(join(tmpdir(), 'claude-dev-stack-fake-'));
    try {
      const r = resolveProject(tmp, null);
      assert.ok(typeof r.projectName === 'string');
      assert.ok(r.projectName.length > 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      delete process.env.VAULT_PATH;
    }
  });
});

// ─── main (CLI) ───────────────────────────────────────────────────
describe('main — CLI', () => {
  let t, origVault;
  beforeEach(() => {
    t = setupTmpVault();
    writeFileSync(join(t.projDir, '0013-logging-strategy.md'), ADR_NEW);
    writeFileSync(join(t.projDir, '0005-logging-strategy.md'), ADR_OLD);
    writeFileSync(join(t.projDir, '0008-cache-layer.md'), ADR_OTHER);
    origVault = process.env.VAULT_PATH;
    process.env.VAULT_PATH = t.vault;
  });
  afterEach(() => {
    if (origVault === undefined) delete process.env.VAULT_PATH;
    else process.env.VAULT_PATH = origVault;
    try { rmSync(t.dir, { recursive: true, force: true }); } catch {}
  });

  it('list prints a table with header + rows', async () => {
    const { out } = await captureStdout(() => main(['list', '--project', 'test-project']));
    assert.ok(/\bid\b/i.test(out));
    assert.ok(/\bdate\b/i.test(out));
    assert.ok(/\bstatus\b/i.test(out));
    assert.ok(/logging-strategy|cache-layer/.test(out));
  });

  it('show prints full content', async () => {
    const { out } = await captureStdout(() => main(['show', '5', '--project', 'test-project']));
    assert.ok(out.includes('ADR-0005'));
    assert.ok(out.includes('Use pino for structured logging'));
  });

  it('show not-found exits 1', async () => {
    await withExitStub(async (cap) => {
      try {
        await captureStdout(() => main(['show', '99', '--project', 'test-project']));
      } catch (e) {
        if (e.message !== '__exit__') throw e;
      }
      assert.equal(cap.code, 1);
    });
  });

  it('search prints ranked', async () => {
    const { out } = await captureStdout(() => main(['search', 'logging', '--project', 'test-project']));
    assert.ok(out.includes('logging'));
  });

  it('--project flag routes to alt project dir', async () => {
    const altDir = join(t.vault, 'projects', 'other-project', 'decisions');
    mkdirSync(altDir, { recursive: true });
    writeFileSync(join(altDir, '0001-alt.md'), '---\nid: 0001\ntopic: alt\nstatus: accepted\ndate: 2026-01-01\n---\n\n# ADR 0001: Alt');
    const { out } = await captureStdout(() => main(['list', '--project', 'other-project']));
    assert.ok(out.includes('alt'));
    assert.ok(!out.includes('logging-strategy'));
  });

  it('no subcommand prints help', async () => {
    const { out } = await captureStdout(() => main([]));
    assert.ok(/list/.test(out));
    assert.ok(/show/.test(out));
    assert.ok(/search/.test(out));
  });

  it('missing vault prints "No decisions" and exits 0', async () => {
    process.env.VAULT_PATH = join(t.dir, 'nonexistent-vault');
    const { out } = await captureStdout(() => main(['list', '--project', 'phantom']));
    assert.ok(/no decisions|No decisions/.test(out));
  });

  it('rejects path traversal on --project', async () => {
    await withExitStub(async (cap) => {
      let threw = false;
      try {
        await main(['list', '--project', '../../../etc']);
      } catch (e) {
        if (e.message === '__exit__') threw = true;
        else if (/projectName|traversal|invalid/i.test(e.message)) threw = true;
        else throw e;
      }
      assert.ok(threw || cap.code === 1, 'must reject path traversal');
    });
  });
});
