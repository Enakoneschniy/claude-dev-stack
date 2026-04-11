# Quick Task 260411-tgg — SUMMARY

**Status:** ✅ Shipped
**Date:** 2026-04-11
**Branch:** main (no quick-task branch — trivial deps bump)

## What changed

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5` |
| `.github/workflows/publish.yml` | `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5` |

**Total:** 4 line changes, 2 files.

## Commits

- `a30045b chore(ci): bump GitHub Actions to v5 (checkout, setup-node)`

## Verification

- ✅ `npm test` — 247/247 passing locally (no regressions; workflows don't affect runtime tests anyway)
- ⏳ CI matrix on next push — must go green on Node 18/20/22 with v5 actions
- ⏳ Publish workflow on next release — verify Node 20 deprecation warning is gone

## Research validated assumptions

- `actions/checkout@v5.0.1` (released 2024-11-17) — only breaking change is runner v2.327.1+ requirement, irrelevant for GitHub-hosted runners
- `actions/setup-node@v5.0.0` (released 2024-09-04) — auto-cache only triggers when `package.json` has `packageManager` field; we don't have it, so no behavior change
- Both v5 actions internally run on Node 24, fixing the deprecation warning observed on publish run 24289179199

## Backlog item closed

P2-#1 from `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md`:
> **GitHub Actions workflows — update to v5** (deadline: Node 20 deprecation June 2026)

## Follow-up (not blocking)

- After next push to main, confirm CI matrix is green and the deprecation warning no longer appears in workflow logs.
- If a future release lands before June 2026, manually verify publish workflow logs to confirm zero warnings.
