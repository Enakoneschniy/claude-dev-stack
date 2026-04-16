// Phase 37 Plan 03 Task 37-03-01 — fixture vault builder.
//
// Creates a tmpdir-scoped vault tree with projects/{name}/docs and
// projects/{name}/.planning/{ROADMAP.md, STATE.md} for docs.search and
// planning.status tests.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface VaultSeedProject {
  name: string;
  docs?: Record<string, string>;
  planning?: {
    roadmap?: string;
    state?: string;
  };
}

export interface VaultSeed {
  projects: VaultSeedProject[];
  /** Optional project-map.json contents (keyed by basename). */
  projectMap?: Record<string, { path: string; slug?: string }>;
}

export interface VaultFixture {
  vaultPath: string;
  cleanup: () => void;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export function buildFixtureVault(seed: VaultSeed): VaultFixture {
  const vaultPath = mkdtempSync(join(tmpdir(), 'cds-mcp-vault-'));
  mkdirSync(join(vaultPath, 'projects'), { recursive: true });

  for (const project of seed.projects) {
    const projectRoot = join(vaultPath, 'projects', project.name);
    mkdirSync(projectRoot, { recursive: true });

    if (project.docs) {
      const docsRoot = join(projectRoot, 'docs');
      mkdirSync(docsRoot, { recursive: true });
      for (const [relPath, contents] of Object.entries(project.docs)) {
        writeFile(join(docsRoot, relPath), contents);
      }
    }

    if (project.planning) {
      const planningRoot = join(projectRoot, '.planning');
      mkdirSync(planningRoot, { recursive: true });
      if (project.planning.roadmap !== undefined) {
        writeFileSync(join(planningRoot, 'ROADMAP.md'), project.planning.roadmap);
      }
      if (project.planning.state !== undefined) {
        writeFileSync(join(planningRoot, 'STATE.md'), project.planning.state);
      }
    }
  }

  if (seed.projectMap) {
    writeFileSync(
      join(vaultPath, 'project-map.json'),
      JSON.stringify(seed.projectMap, null, 2),
    );
  }

  return {
    vaultPath,
    cleanup: () => rmSync(vaultPath, { recursive: true, force: true }),
  };
}
