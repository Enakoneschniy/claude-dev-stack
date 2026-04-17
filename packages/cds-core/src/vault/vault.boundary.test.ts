// VAULT-03 boundary regression test. Locks two invariants:
//
//   1. The `@cds/core` runtime surface does NOT expose `openRawDb` or
//      `RawDatabase`. Only the sessions API and error hierarchy are public.
//   2. No consumer package or script imports from `@cds/core/vault/internal/*`
//      or the relative `vault/internal/*` path. A filesystem walk over every
//      sibling package and root helper directory checks for the offending
//      strings.

import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdsCore from '../index.js';

// Repo root = packages/cds-core/src/vault/../.. = packages/cds-core
// Go up two more levels to reach the monorepo root.
const PKG_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REPO_ROOT = dirname(dirname(PKG_DIR));

const CDS_CORE_VAULT_SRC = join(PKG_DIR, 'src', 'vault');

const SCAN_ROOTS = [
  join(REPO_ROOT, 'packages', 'cds-cli', 'src'),
  join(REPO_ROOT, 'packages', 'cds-migrate', 'src'),
  join(REPO_ROOT, 'packages', 'cds-s3-backend', 'src'),
  join(REPO_ROOT, 'lib'),
  join(REPO_ROOT, 'bin'),
  join(REPO_ROOT, 'hooks'),
];

const FILE_EXT_RE = /\.(ts|tsx|mts|cts|mjs|cjs|js)$/;

function walkAllFiles(dir: string, callback: (file: string) => void): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkAllFiles(p, callback);
    else callback(p);
  }
}

test('cds-core public surface does NOT expose openRawDb', () => {
  // Cast through unknown so TS doesn't object to the unknown-key lookup.
  expect(
    (cdsCore as unknown as Record<string, unknown>)['openRawDb'],
  ).toBeUndefined();
  expect(Object.keys(cdsCore)).not.toContain('openRawDb');
});

test('cds-core public surface does NOT expose RawDatabase runtime binding', () => {
  expect(Object.keys(cdsCore)).not.toContain('RawDatabase');
});

test('cds-core public surface DOES expose the documented sessions API', () => {
  const expected = [
    'openSessionsDB',
    'closeSessionsDB',
    'CANONICAL_ENTITY_TYPES',
    'VaultError',
    'SchemaVersionError',
    'MigrationError',
    'FtsUnavailableError',
    'DbOpenError',
    // Phase 43 additions
    'FsBackend',
    'ConflictStrategy',
    'getEntityGraph',
    'searchAllProjects',
  ];
  const keys = Object.keys(cdsCore);
  for (const name of expected) {
    expect(keys).toContain(name);
  }
  expect(typeof cdsCore.openSessionsDB).toBe('function');
  expect(typeof cdsCore.closeSessionsDB).toBe('function');
  expect(Array.isArray(cdsCore.CANONICAL_ENTITY_TYPES)).toBe(true);
});

test('cds-core public surface DOES expose Phase 43 vault primitives', () => {
  const keys = Object.keys(cdsCore);
  expect(keys).toContain('FsBackend');
  expect(keys).toContain('ConflictStrategy');
  expect(keys).toContain('getEntityGraph');
  expect(keys).toContain('searchAllProjects');
  expect(typeof cdsCore.getEntityGraph).toBe('function');
  expect(typeof cdsCore.searchAllProjects).toBe('function');
  expect(typeof cdsCore.FsBackend).toBe('function'); // class constructor
});

test('no consumer file imports from @cds/core/vault/internal/*', () => {
  const offenders: string[] = [];
  for (const root of SCAN_ROOTS) {
    walkAllFiles(root, (file) => {
      if (!FILE_EXT_RE.test(file)) return;
      const content = readFileSync(file, 'utf-8');
      if (content.includes('@cds/core/vault/internal')) {
        offenders.push(file);
      }
    });
  }
  expect(offenders).toEqual([]);
});

test('no consumer file imports directly from relative internal paths within @cds/core', () => {
  const offenders: string[] = [];
  for (const root of SCAN_ROOTS) {
    walkAllFiles(root, (file) => {
      if (!FILE_EXT_RE.test(file)) return;
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes('vault/internal/db') ||
        content.includes('vault/internal/migrations/runner')
      ) {
        offenders.push(file);
      }
    });
    // Sanity: the scan roots never include the cds-core source tree itself,
    // so any hit above is a real offender. We still guard against future
    // re-inclusion by skipping the cds-core vault directory explicitly.
  }
  const filtered = offenders.filter(
    (f) => !f.startsWith(CDS_CORE_VAULT_SRC),
  );
  expect(filtered).toEqual([]);
});
