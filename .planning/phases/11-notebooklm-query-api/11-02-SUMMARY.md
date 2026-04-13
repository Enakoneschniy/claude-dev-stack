---
phase: 11-notebooklm-query-api
plan: 02
subsystem: notebooklm-cli
tags: [cli, notebooklm, query, ask, generate, vault]
dependency_graph:
  requires:
    - 11-01  # askNotebook, generateArtifact, BINARY_ARTIFACT_TYPES from lib/notebooklm.mjs
  provides:
    - notebooklm-ask-cli       # `claude-dev-stack notebooklm ask "question"` command
    - notebooklm-generate-cli  # `claude-dev-stack notebooklm generate <type>` command
    - notebook-id-resolution   # auto-resolution from manifest + --notebook flag override
  affects:
    - lib/notebooklm-cli.mjs
    - bin/cli.mjs
    - tests/notebooklm-cli.test.mjs
tech_stack:
  added: []
  patterns:
    - resolveNotebookId: manifest-first notebook ID resolution with --notebook override (D-13, D-14)
    - runAsk/runGenerate: TDD-driven CLI subcommand handlers following runSync/runStatus pattern
    - truncateReason in all catch blocks: T-11-04 info-disclosure mitigation
    - path.join for --save paths: T-11-05 path traversal mitigation
key_files:
  created: []
  modified:
    - lib/notebooklm-cli.mjs  # added resolveNotebookId, runAsk, runGenerate, updated printNotebooklmHelp
    - bin/cli.mjs              # updated help text with ask and generate entries
    - tests/notebooklm-cli.test.mjs  # added 10 new tests for ask and generate subcommands
    - lib/notebooklm.mjs       # pulled in from Plan 01 (askNotebook, generateArtifact, BINARY_ARTIFACT_TYPES)
    - tests/notebooklm.test.mjs  # pulled in from Plan 01
    - tests/fixtures/notebooklm-stub.sh  # pulled in from Plan 01 (ARGV_LOG_MODE=all support)
decisions:
  - type-detection-before-notebook-flag: strip --notebook/-n flag values before looking for artifact type positional arg — prevents notebook ID value being mistaken for artifact type
  - save-vault-resolution-order: vaultRoot from resolveNotebookId first, then process.env.VAULT_PATH, then findVault() — avoids redundant vault scan
  - binary-artifact-save-hint: binary --save prints download command hint (notebooklm download) rather than attempting download inline — keeps CLI thin
metrics:
  duration: ~15 minutes
  completed_date: "2026-04-12"
  tasks_completed: 1
  tests_added: 10
  tests_total: 445
  files_changed: 6
---

# Phase 11 Plan 02: NotebookLM Ask/Generate CLI Subcommands Summary

**One-liner:** `notebooklm ask "question"` and `notebooklm generate report` CLI subcommands with manifest-based notebook ID auto-resolution and --save vault integration.

## What Was Built

Extended `lib/notebooklm-cli.mjs` with two new subcommands that complete the user-facing query surface for QUERY-02:

### `notebooklm ask [--notebook <id>] [--source <id>...] [--save] "question"`

- Auto-resolves notebook ID from manifest via project slug (basename of cwd) when `--notebook` not provided
- Calls `askNotebook()` from Plan 01's lib/notebooklm.mjs
- Prints answer text + citations section (index, source ID, snippet)
- `--save` writes to `vault/projects/{slug}/docs/notebooklm-answers/{timestamp}-{question-slug}.md`

### `notebooklm generate [--notebook <id>] [--save] <type>`

- Same notebook ID resolution as `ask`
- Calls `generateArtifact()` from Plan 01's lib/notebooklm.mjs
- Text artifacts (report, quiz, etc.): displays content inline, confirms artifact ID
- Binary artifacts (audio, video, slide-deck, infographic): prints artifact ID + download hint
- `--save` writes text to `notebooklm-answers/`, prints download command hint for binary to `notebooklm-artifacts/`

### Supporting infrastructure

- `resolveNotebookId(args)`: shared helper for both subcommands — strips `--notebook/-n` flag, then falls back to manifest lookup
- `printNotebooklmHelp()` updated with `ask` and `generate` entries
- `bin/cli.mjs` help text updated

## Commits

| Hash | Description |
|------|-------------|
| `d8f79f9` | test(11-02): add failing tests for ask and generate subcommands (RED) |
| `32063fc` | feat(11-02): add ask and generate subcommands to notebooklm-cli (GREEN) |

## Test Results

- Tests before: 15 (notebooklm-cli.test.mjs suite)
- Tests after: 25 (notebooklm-cli.test.mjs) / 445 (full suite)
- Tests added: 10 new tests across 2 suites (runAsk, runGenerate)
- All 445 tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed artifact type detection skipping --notebook flag values**
- **Found during:** GREEN phase — test `main(['generate', '--notebook', 'nb-123'])` (no type) was detecting `nb-123` as the type
- **Issue:** `filteredArgs.find(a => !a.startsWith('-'))` found the notebook ID value (which doesn't start with `-`) before the `--notebook` flag was parsed
- **Fix:** Pre-scan args to strip `--notebook/-n` flag values before searching for the positional type arg
- **Files modified:** `lib/notebooklm-cli.mjs` (runGenerate function)
- **Commit:** `32063fc`

**2. [Rule 3 - Blocker] Pulled Plan 01 artifacts into worktree working tree**
- **Found during:** GREEN phase — `lib/notebooklm.mjs` in this worktree was pre-Plan-01 (no `askNotebook`, `generateArtifact`, `BINARY_ARTIFACT_TYPES`); `tests/fixtures/notebooklm-stub.sh` lacked `ARGV_LOG_MODE=all` support
- **Issue:** `git reset --soft` moved HEAD to Plan 01 completion commit but left working tree files at worktree's original state
- **Fix:** `git checkout 45bf3d1 -- lib/notebooklm.mjs tests/notebooklm.test.mjs tests/fixtures/notebooklm-stub.sh`
- **Files modified:** `lib/notebooklm.mjs`, `tests/notebooklm.test.mjs`, `tests/fixtures/notebooklm-stub.sh`
- **Commit:** `32063fc`

## Known Stubs

None — all data sources are wired:
- `askNotebook()` and `generateArtifact()` call real `notebooklm-py` CLI via Plan 01's lib functions
- `readManifest()` reads from real vault manifest file
- `--save` writes real files to vault

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. All STRIDE mitigations from plan applied:
- T-11-04: `truncateReason()` on all error messages in `runAsk` and `runGenerate` catch blocks
- T-11-05: question/type strings are slugified (non-alphanumeric stripped, max 50 chars) before use in filenames; `path.join()` used throughout

## Self-Check

Files exist:
- [x] `lib/notebooklm-cli.mjs` — contains `case 'ask':`, `case 'generate':`, `resolveNotebookId`, `runAsk`, `runGenerate`
- [x] `tests/notebooklm-cli.test.mjs` — contains ask and generate test suites

Commits exist:
- [x] `d8f79f9` — test RED phase
- [x] `32063fc` — implementation GREEN phase

## Self-Check: PASSED
