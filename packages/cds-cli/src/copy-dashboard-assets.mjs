#!/usr/bin/env node
// Post-build script: copies dashboard-assets/ from src/ to dist/.
// Phase 48 — mirrors the copy-migrations.mjs pattern.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, 'dashboard-assets');
const dest = join(__dirname, '..', 'dist', 'dashboard-assets');

if (!existsSync(src)) {
  console.error('Dashboard assets source not found:', src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('Dashboard assets copied to', dest);
