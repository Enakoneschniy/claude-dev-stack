// packages/cds-cli/tests/helpers/temp-home.ts
// Per-test HOME override via mkdtempSync. Returns { tempHome, restore }.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TempHome {
  tempHome: string;
  restore: () => void;
}

export function setupTempHome(): TempHome {
  const tempHome = mkdtempSync(path.join(tmpdir(), 'cds-quick-home-'));
  const originalHome = process.env.HOME;
  const originalUserprofile = process.env.USERPROFILE;
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  return {
    tempHome,
    restore: () => {
      if (originalHome !== undefined) process.env.HOME = originalHome;
      else delete process.env.HOME;
      if (originalUserprofile !== undefined) process.env.USERPROFILE = originalUserprofile;
      else delete process.env.USERPROFILE;
      try {
        rmSync(tempHome, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; don't fail the test if rm fails on Windows.
      }
    },
  };
}
