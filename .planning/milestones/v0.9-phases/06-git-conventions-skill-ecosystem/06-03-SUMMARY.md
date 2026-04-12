---
phase: 06-git-conventions-skill-ecosystem
plan: "03"
subsystem: wizard-and-doctor
tags: [git-conventions, install-wizard, doctor, health-check, GIT-08, GIT-09, GIT-10]
dependency_graph:
  requires:
    - 06-01 (atomicWriteJson, fixtures)
    - 06-02 (lib/git-scopes.mjs exports)
  provides:
    - installGitConventions wizard step in bin/install.mjs
    - Git Conventions health section in lib/doctor.mjs
  affects:
    - bin/install.mjs (new step, new import)
    - lib/doctor.mjs (new section, new import)
    - tests/install.test.mjs (9 new structural tests)
    - tests/doctor.test.mjs (5 new functional tests)
tech_stack:
  added: []
  patterns:
    - structural grep-based tests for wizard body verification
    - subprocess doctor tests with temp vault + project-map.json
key_files:
  created: []
  modified:
    - bin/install.mjs
    - lib/doctor.mjs
    - tests/install.test.mjs
    - tests/doctor.test.mjs
decisions:
  - installGitConventions is always-on (not component-gated) — git conventions benefit every project
  - projectsData.projects array shape (not object) used — matches actual wizard collect flow
  - doctor warns at WARN severity (not ERROR) for missing git-scopes.json — actionable not critical
metrics:
  duration: "~10 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  tests_added: 14
  tests_total: 313
---

# Phase 06 Plan 03: Wizard Integration & Doctor Health Check Summary

## One-liner

Wired git-conventions into setup wizard (`installGitConventions` step with auto-detection + print-only commitlint) and doctor health check (Git Conventions section with WARN for missing configs and actionable `scopes init` guidance).

## What Was Built

### Task 1: installGitConventions in bin/install.mjs

Added `installGitConventions(projectsData, stepNum, totalSteps)` async function that:

1. Iterates mapped projects with valid paths
2. Auto-detects stack via `detectStack()` — logs source and confidence
3. Detects main branch via `detectMainBranch()`
4. Builds default config via `createDefaultConfig()` — `co_authored_by` defaults to `false`
5. Prompts user to confirm scopes (4 questions: scopes, branch, optional commitlint, skip hint)
6. Commitlint prompt only appears when `package.json` exists in project dir
7. Commitlint is print-only via `printCommitlintInstructions()` — never spawns `npm install`
8. Writes `.claude/git-scopes.json` atomically and installs git-conventions skill

The step is always-on (not behind a component flag) and inserted after NotebookLM, before `generateClaudeMD`. `totalSteps` incremented by 2 (was +1 for CLAUDE.md, now +2).

Import added at top:
```javascript
import {
  detectStack, detectMainBranch, writeScopes, installSkill,
  createDefaultConfig, printCommitlintInstructions,
} from '../lib/git-scopes.mjs';
```

### Task 2: Git Conventions section in lib/doctor.mjs

Added `import { validateScopes } from './git-scopes.mjs'` and a new "Git Conventions" section (section 6) that:

- Reads `project-map.json` from vault (T-06-09: JSON.parse wrapped in try/catch)
- For each mapped project directory that exists:
  - Checks for `.claude/git-scopes.json`
  - If missing: `warn("${projectName}: .claude/git-scopes.json missing")` + `info("Run: claude-dev-stack scopes init in ${dirPath}")`
  - If present but invalid schema: `warn("... invalid (${reason})")` + guidance
  - If present but malformed JSON: `warn("... malformed")` + guidance (T-06-10)
  - If valid: `ok("${projectName}: git-scopes.json (${N} scopes)")`
- Graceful skips: no vault → `info("No vault found...")`, no project-map.json → `info("No project-map.json...")`
- All missing/invalid cases increment `warnings` (WARN severity per ADR-0012)

## Tests

### install.test.mjs — 9 new structural tests (GIT-08/GIT-09/GIT-10)

| Test | Assertion |
|------|-----------|
| imports from ../lib/git-scopes.mjs | import line present |
| imports detectStack | symbol present |
| imports installSkill | symbol present |
| contains installGitConventions | async function defined |
| prints info when no projects mapped | graceful empty-projects path |
| uses printCommitlintInstructions | print-only commitlint |
| does NOT call spawnSync npm install | T-06-11 elevation guard |
| co_authored_by defaults to false | createDefaultConfig used, no override |
| commitlint prompt guarded by package.json | existsSync('package.json') check |

### doctor.test.mjs — 5 new functional tests (GIT-08/GIT-09/GIT-10)

| Test | Scenario |
|------|----------|
| warns for missing git-scopes.json | project dir exists, no .claude/git-scopes.json |
| shows OK for valid git-scopes.json | valid schema, 2 scopes |
| warns for invalid git-scopes.json | version: 99 → unknown-version |
| skips when no project-map.json | vault without map |
| exits 0 even when config missing | health check never crashes |

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-06-09: project-map.json tampering | JSON.parse in try/catch, warn and continue on error |
| T-06-10: git-scopes.json tampering | validateScopes + try/catch around JSON.parse |
| T-06-11: npm install elevation | printCommitlintInstructions is console.log-only; structural test asserts no spawnSync('npm', ['install'...)) |

## Deviations from Plan

### Auto-adapted: projectsData.projects array vs object

**Found during:** Task 1

**Issue:** The plan pseudocode used `Object.entries(projects)` treating `projectsData.projects` as `{[dirPath]: projectName}`. The actual wizard data shape is `[{name, path}]` (array of objects), as established by `collectProjects()` and used throughout `generateClaudeMD`.

**Fix:** Adapted `installGitConventions` to iterate `projects.filter(p => p.path && existsSync(p.path))` and destructure `{ name: projectName, path: dirPath }` — semantically equivalent, correct for actual data shape.

**Rule:** Rule 1 (auto-fix bug / incorrect assumption in plan pseudocode).

## Self-Check: PASSED

- [x] bin/install.mjs contains `async function installGitConventions(`
- [x] bin/install.mjs contains `from '../lib/git-scopes.mjs'`
- [x] bin/install.mjs contains `detectStack`
- [x] bin/install.mjs contains `installSkill`
- [x] bin/install.mjs does NOT contain `spawnSync('npm', ['install'`
- [x] bin/install.mjs contains `printCommitlintInstructions`
- [x] `node --check bin/install.mjs` exits 0
- [x] lib/doctor.mjs contains `Git Conventions` header
- [x] lib/doctor.mjs contains `git-scopes.json missing`
- [x] lib/doctor.mjs contains `claude-dev-stack scopes init`
- [x] lib/doctor.mjs contains `import { validateScopes } from './git-scopes.mjs'`
- [x] `node --check lib/doctor.mjs` exits 0
- [x] `node --test tests/install.test.mjs` exits 0 (20 tests, 9 new)
- [x] `node --test tests/doctor.test.mjs` exits 0 (17 tests, 5 new)
- [x] `npm test` exits 0 (313 tests, 0 failures)

## Commits

- `452671e` — feat(06-03): add installGitConventions wizard step + structural tests
- `1264b70` — feat(06-03): add Git Conventions section to doctor + 5 tests
