---
phase: 16-git-conventions-ecosystem
plan: 02
subsystem: git-conventions
tags: [git, git-action, migrate-claude-md, cli, yaml-generation, claude-md-parsing]
dependency_graph:
  requires: [16-01]
  provides: [cmdGitAction, cmdMigrateClaude, buildCommitlintYml, parseClauda, cli-routes]
  affects: [lib/git-scopes.mjs, lib/git-conventions.mjs, bin/cli.mjs, tests/git-conventions.test.mjs, tests/git-scopes.test.mjs]
tech_stack:
  added: []
  patterns: [array-join-yaml-generation, regex-extraction, overwrite-protection-prompt]
key_files:
  created: []
  modified:
    - lib/git-scopes.mjs
    - lib/git-conventions.mjs
    - bin/cli.mjs
    - tests/git-scopes.test.mjs
    - tests/git-conventions.test.mjs
decisions:
  - buildCommitlintYml uses array-of-lines join to avoid template literal escaping with ${{ }} GitHub Actions syntax
  - parseClauda uses P2/P3/P4 fallback priority for scope extraction with max 30 limit
  - cmdMigrateClaude does two-level review: full-accept prompt then individual field prompts if declined
  - overwrite protection on both commitlint.yml and git-scopes.json with default NO
metrics:
  duration: ~20min
  completed: 2026-04-13
  tasks_completed: 2
  files_changed: 5
---

# Phase 16 Plan 02: git-action + migrate-claude-md Commands Summary

Two new top-level CLI commands added: `git-action` generates a GitHub Actions commitlint workflow, `migrate-claude-md` parses prose CLAUDE.md and writes git-scopes.json.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add buildCommitlintYml and parseClauda to git-scopes.mjs | 4811e86 | lib/git-scopes.mjs, tests/git-scopes.test.mjs |
| 2 | Add cmdGitAction and cmdMigrateClaude, wire CLI routes and help | c8c80d8 | lib/git-conventions.mjs, bin/cli.mjs, tests/git-conventions.test.mjs |

## What Was Built

- `buildCommitlintYml(config)` in `lib/git-scopes.mjs` — pure function returning GitHub Actions YAML string. Uses array-of-lines join to avoid escaping `${{ }}` GitHub Actions expressions.
- `parseClauda(content)` in `lib/git-scopes.mjs` — pure function extracting `{ scopes, types, mainBranch, ticketPrefix }` from raw CLAUDE.md via P2/P3/P4 regex fallback strategy.
- `cmdGitAction(args)` exported from `lib/git-conventions.mjs` — reads git-scopes.json (guard if missing), creates `.github/workflows/` dir, writes `commitlint.yml` with overwrite prompt (default NO), prints instructions.
- `cmdMigrateClaude(args)` exported from `lib/git-conventions.mjs` — resolves CLAUDE.md path (args[0] → cwd/CLAUDE.md → cwd/.claude/CLAUDE.md), parses via parseClauda, shows interactive summary, two-level review (full accept or individual fields), overwrite protection, calls writeScopes + installSkill.
- `bin/cli.mjs` updated with `case 'git-action'` and `case 'migrate-claude-md'` routes.
- `printHelp()` in `bin/cli.mjs` now lists both commands under Git Conventions section.
- 12 new unit tests for buildCommitlintYml/parseClauda, 2 guard-path integration tests for new commands.
- All 558 tests pass (was 537 before this plan).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `lib/git-scopes.mjs` — `buildCommitlintYml` and `parseClauda` present
- `lib/git-conventions.mjs` — `cmdGitAction` and `cmdMigrateClaude` exported
- `bin/cli.mjs` — `git-action` and `migrate-claude-md` cases present (2+ matches each)
- Commits 4811e86 and c8c80d8 exist
- npm test: 558 pass, 0 fail
