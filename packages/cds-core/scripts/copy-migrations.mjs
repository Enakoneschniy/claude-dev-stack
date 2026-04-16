#!/usr/bin/env node
// Post-build helper: copy migration .sql files from src/ to dist/ so the
// runtime migration runner can readFileSync() them from the compiled output.
// tsc does not copy non-.ts assets — this script fills that gap.
//
// See Phase 35 Plan 02 Task 3 (CONTEXT.md D-39).

import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(PKG_ROOT, 'src', 'vault', 'internal', 'migrations');
const DEST = join(PKG_ROOT, 'dist', 'vault', 'internal', 'migrations');

if (!existsSync(SRC)) {
  console.error(`[copy-migrations] source directory missing: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

cpSync(SRC, DEST, {
  recursive: true,
  filter: (src) => {
    if (src.endsWith('.sql')) return true;
    if (/\.(ts|tsx|js|jsx|d\.ts|map)$/.test(src)) return false;
    return true;
  },
});

console.log(`[copy-migrations] copied SQL files from ${SRC} -> ${DEST}`);
