// Phase 50: hook is no-op — CDS owns the source, patches unnecessary
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookPath = join(__dirname, '..', 'hooks', 'gsd-auto-reapply-patches.sh');

describe('gsd-auto-reapply-patches', () => {
  let workdir;

  beforeAll(() => {
    workdir = mkdtempSync(join(tmpdir(), 'gsd-patches-'));
  });

  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('hook exits 0 silently (patches dissolved)', () => {
    // Phase 50: hook is a no-op — CDS owns the workflow engine source
    const out = execFileSync('bash', [hookPath], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/tmp',
    });
    assert.equal(out, '', 'hook must be silent');
  });
});
