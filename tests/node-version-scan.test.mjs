// tests/node-version-scan.test.mjs
// Regression guard: no "node: 18" / ">=18" references in active repo config (D-128).
// Uses execFileSync + git ls-files to enumerate tracked files (safer than shell glob).
// Source: Phase 39 VALIDATION §Task 39-01-07
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function repoFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

describe('D-128 Node 18 sweep', () => {
  const BANNED_PATTERNS = [
    /node-version:\s*18\b/,
    /node-version:\s*\[\s*18\b/,
    /"node":\s*">=18"/,
    /"node":\s*"18/,
  ];

  const ALLOWED_PATHS = [
    /^\.planning\/phases\//,          // historical phase context
    /^\.planning\/milestones\//,      // archived roadmaps
    /^\.planning\/research\//,        // historical research docs (may quote pre-v1.0 config snippets)
    /^CHANGELOG\.md$/,                // documents Node 18 -> 20 break
    /^docs\/migration-v0-to-v1-alpha\.md$/,  // migration guide intentionally references Node 18
    /^docs\/release-notes-template\.md$/,    // release template may describe Node 18 users
    /^tests\/node-version-scan\.test\.mjs$/, // this very test file
  ];

  const relevantFiles = repoFiles().filter((f) => {
    if (!/\.(yml|yaml|json|mjs|ts|md)$/.test(f)) return false;
    if (ALLOWED_PATHS.some((rx) => rx.test(f))) return false;
    return true;
  });

  for (const f of relevantFiles) {
    it(`${f} has no Node 18 references`, () => {
      const text = readFileSync(path.join(root, f), 'utf8');
      for (const pat of BANNED_PATTERNS) {
        expect(text, `Expected ${f} to NOT match ${pat}`).not.toMatch(pat);
      }
    });
  }
});
