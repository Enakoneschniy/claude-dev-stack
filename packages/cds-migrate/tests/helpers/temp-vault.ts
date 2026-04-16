// Phase 38 Plan 02 Task 38-02-00 — tmp vault fixture helper.
//
// Creates a throwaway vault layout at
//   `<tmpdir>/cds-migrate-test-<hex>/projects/<projectName>/sessions/*.md`
// copying the requested fixtures from tests/fixtures/backfill/. The returned
// cleanup() handler rm -rf's the whole tmp root.

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = join(__dirname, '..', 'fixtures', 'backfill');

export interface TempVault {
  vaultPath: string;
  projectName: string;
  sessionsDir: string;
  cleanup: () => void;
}

export function createTempVault(
  opts: { projectName?: string; fixtures?: string[] } = {},
): TempVault {
  const projectName = opts.projectName ?? 'demo';
  const vaultPath = mkdtempSync(join(tmpdir(), 'cds-migrate-test-'));
  const sessionsDir = join(vaultPath, 'projects', projectName, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });

  if (opts.fixtures) {
    for (const fixture of opts.fixtures) {
      const src = join(FIXTURES_ROOT, fixture);
      const dst = join(sessionsDir, fixture);
      copyFileSync(src, dst);
    }
  }

  return {
    vaultPath,
    projectName,
    sessionsDir,
    cleanup: () => rmSync(vaultPath, { recursive: true, force: true }),
  };
}

/** Overwrite a fixture file's content (for hash-changed tests). */
export function mutateFixture(
  vault: TempVault,
  filename: string,
  newContent: string,
): void {
  writeFileSync(join(vault.sessionsDir, filename), newContent);
}
