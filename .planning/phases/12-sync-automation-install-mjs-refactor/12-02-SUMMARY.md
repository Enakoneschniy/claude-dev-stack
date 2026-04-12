---
phase: 12-sync-automation-install-mjs-refactor
plan: "02"
subsystem: install-wizard
tags: [refactor, install, modules, lib]
dependency_graph:
  requires: []
  provides: [lib/install/*.mjs]
  affects: [bin/install.mjs]
tech_stack:
  added: []
  patterns: [module-extraction, explicit-params, shared-imports]
key_files:
  created:
    - lib/install/prereqs.mjs
    - lib/install/profile.mjs
    - lib/install/projects.mjs
    - lib/install/components.mjs
    - lib/install/plugins.mjs
    - lib/install/vault.mjs
    - lib/install/gsd.mjs
    - lib/install/skills.mjs
    - lib/install/notebooklm.mjs
    - lib/install/git-conventions.mjs
    - lib/install/claude-md.mjs
    - lib/install/hooks.mjs
    - lib/install/summary.mjs
  modified: []
decisions:
  - "Each extracted module imports from ../shared.mjs (no duplication of c, ok, fail, warn, info, prompt, runCmd, hasCommand, mkdirp, step)"
  - "PKG_ROOT passed as explicit param to installVault, installCustomSkills, installObsidianSkills, installSessionHook, generateClaudeMD — eliminates implicit module-level path resolution"
  - "addProjectsManually kept private (not exported) — only collectProjects is public API"
  - "loadPluginData kept private — only selectAndInstallPlugins is public API"
  - "Dynamic import in claude-md.mjs uses ../add-project.mjs (correct relative path from lib/install/)"
metrics:
  duration: "5 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 13
  files_modified: 0
---

# Phase 12 Plan 02: install.mjs Extraction — Focused Modules Summary

13 wizard-section functions extracted from `bin/install.mjs` into focused modules under `lib/install/`, each importing utilities from `lib/shared.mjs` instead of duplicating them.

## Objective

Extract the 1471-line `bin/install.mjs` monolith wizard sections into 13 separately importable ESM modules under `lib/install/`. Per D-03, D-06, and D-09 — break the monolith, eliminate utility duplication, use explicit params.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extract first 7 modules (prereqs through gsd) | 6617fd2 | 7 new files |
| 2 | Extract remaining 6 modules (skills through summary) | 087a2e9 | 6 new files |

## Modules Created

### Task 1

| Module | Exports | Source Lines |
|--------|---------|-------------|
| `lib/install/prereqs.mjs` | `printHeader`, `checkPrerequisites`, `getInstallHint`, `INSTALL_HINTS` | ~131–246 |
| `lib/install/profile.mjs` | `collectProfile` | ~249–278 |
| `lib/install/projects.mjs` | `collectProjects` | ~281–402 |
| `lib/install/components.mjs` | `selectComponents` | ~405–448 |
| `lib/install/plugins.mjs` | `selectAndInstallPlugins` | ~452–624 |
| `lib/install/vault.mjs` | `getVaultPath`, `installVault` | ~627–701 |
| `lib/install/gsd.mjs` | `installGSD` | ~704–720 |

### Task 2

| Module | Exports | Source Lines |
|--------|---------|-------------|
| `lib/install/skills.mjs` | `installObsidianSkills`, `installCustomSkills`, `installDeepResearch` | ~723–817 |
| `lib/install/notebooklm.mjs` | `installNotebookLM` | ~822–929 |
| `lib/install/git-conventions.mjs` | `installGitConventions` | ~935–1013 |
| `lib/install/claude-md.mjs` | `generateClaudeMD` | ~1016–1110 |
| `lib/install/hooks.mjs` | `installSessionHook` | ~1113–1204 |
| `lib/install/summary.mjs` | `printSummary` | ~1207–1316 |

## Design Decisions

- **No duplicate utilities**: All modules import from `../shared.mjs` — zero local redefinitions of `c`, `ok`, `fail`, `warn`, `info`, `prompt`, `runCmd`, `hasCommand`, `mkdirp`, `step`, etc.
- **Explicit params**: Functions like `installVault(vaultPath, projectsData, stepNum, totalSteps, pkgRoot)` receive all their data explicitly — no module-level mutable state.
- **PKG_ROOT via param**: The orchestrator (bin/install.mjs) resolves `PKG_ROOT` once and passes it to modules that need it (`installVault`, `installCustomSkills`, `installObsidianSkills`, `installSessionHook`, `generateClaudeMD`). Makes modules testable without relying on file system structure.
- **Private helpers stay private**: `addProjectsManually` and `loadPluginData` are not exported — they are called only by their parent exported functions.
- **Dynamic import path fixed**: `claude-md.mjs` uses `'../add-project.mjs'` (one level up from `lib/install/`) — correctly resolves to `lib/add-project.mjs`.
- **hasCommand safety**: All modules use `hasCommand` from `lib/shared.mjs` which uses safe `spawnSync('which', [name])` — eliminates the shell injection vulnerability present in the original `bin/install.mjs` local `hasCommand` (fixes T-12-02 silently per plan's threat model).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all modules contain real extracted logic, no placeholders.

## Threat Flags

None — no new trust boundaries introduced. `hasCommand` migration from shell interpolation to `spawnSync` is a security improvement (T-12-02 mitigated).

## Self-Check: PASSED

All 13 files exist and syntax-check clean. Both commits verified in git log.
