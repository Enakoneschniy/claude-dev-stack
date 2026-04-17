---
plan_id: 39-05-publish-release
phase: 39
plan: 05
subsystem: release-pipeline
tags: [publish-yml, prerelease, oidc, provenance, release-notes, alpha-release, d-123, d-124, d-125]
dependency_graph:
  requires:
    - phases/39-cds-quick-demo-alpha-release/39-01-bundler-and-distribution (tsup, version 1.0.0-alpha.1, files array)
    - phases/39-cds-quick-demo-alpha-release/39-02-cds-quick-cli (real CLI body for smoke install)
    - phases/39-cds-quick-demo-alpha-release/39-03-cds-quick-skill (SKILL.md in tarball)
    - phases/39-cds-quick-demo-alpha-release/39-04-migration-and-wizard (CHANGELOG.md, migration guide)
  provides:
    - .github/workflows/publish.yml (Phase 39 prerelease-aware pipeline)
    - docs/release-notes-template.md
  affects:
    - package.json (CHANGELOG.md added to files array — Plan 01 had missed it)
tech_stack:
  added: []
  patterns:
    - "GitHub Actions env-var binding for security-sensitive expressions: env.IS_PRERELEASE / env.DIST_TAG instead of inline ${{ ... }} in run: blocks (avoid expression injection)"
    - "OIDC + provenance preserved: id-token: write + --provenance flag"
    - "Smoke install pinned to literal version 1.0.0-alpha.1 — intentional safety net forcing workflow update on version bump"
key_files:
  created:
    - .github/workflows/publish.yml (full replacement of v0.12-era 7-line workflow)
    - docs/release-notes-template.md
    - tests/publish-workflow.test.mjs
    - tests/release-notes-template.test.mjs
  modified:
    - package.json (added CHANGELOG.md to files array — bug fix, Plan 01 omission)
decisions:
  - "Use env-var binding for ${{ github.event.release.prerelease }} and ${{ steps.meta.outputs.tag }} per GitHub security guidance — passes the security_reminder_hook PreToolUse check + better practice for any future user-controlled inputs"
  - "Smoke install version is hardcoded to 1.0.0-alpha.1 — when bumping to alpha.2, the workflow MUST be updated. This is intentional: prevents shipping a tarball whose contents don't match the version field"
  - "Test for npm publish step uses 2 assertions (env DIST_TAG binding + npm publish --tag \"\$DIST_TAG\") instead of single regex against the original ${{ ... }} pattern — accurately reflects the security-hardened implementation"
metrics:
  duration: ~7min (inline execution)
  completed: 2026-04-16
  tasks_completed: 5
  files_created: 4
  files_modified: 1
  test_results:
    plan_05_only: 29 passed (publish-workflow:19 + release-notes-template:10)
    full_phase_regression:
      total: 1685 tests
      passed: 1675
      failed: 3 (PRE-EXISTING tests/detect.test.mjs — confirmed on main, not Phase 39 regression)
      skipped: 6
      todo: 1
    final_tarball:
      filename: claude-dev-stack-1.0.0-alpha.1.tgz
      size_bytes: 400810 (391.4 KB)
      file_count: 110
      includes:
        - dist/cli/quick.js
        - skills/cds-quick/SKILL.md
        - hooks/session-end-capture.sh
        - CHANGELOG.md
      excludes: [packages/, .planning/, tests/]
---

# Phase 39 Plan 05: Publish & Release Summary

RELEASE-01 final deliverable: `.github/workflows/publish.yml` rewritten as the Phase 39
prerelease-aware pipeline + `docs/release-notes-template.md` for manual GitHub release
drafting + 2 test files locking down both.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | publish.yml replacement | 3929a40 | .github/workflows/publish.yml |
| 2 | release-notes-template.md | 1e0e6d9 | docs/release-notes-template.md |
| 3 | publish-workflow tests (19) | ddebc4f | tests/publish-workflow.test.mjs |
| 4 | release-notes-template tests (10) | f4039d4 | tests/release-notes-template.test.mjs |
| 5 | Full-phase regression sweep | (verification) | — |
| — | CHANGELOG.md tarball fix | 4e6a0b5 | package.json |

## Deviations from Plan

### Bug 1 — CHANGELOG.md missing from npm tarball

**Found during:** Task 5 final tarball verification
**Issue:** Plan 01 created `package.json` `files` array with 10 entries (bin, dist, hooks, lib, patches, skills, templates, README.md, LICENSE, NOTICES.md) but did NOT include CHANGELOG.md (which Plan 04 then created). Final tarball would ship without CHANGELOG.md → npm registry preview wouldn't show release notes.
**Fix:** Added `"CHANGELOG.md"` as the 11th entry in `package.json` files array.
**Commit:** 4e6a0b5.

### Adjustment 1 — GHA expression injection hardening

**Plan body:** Used `${{ github.event.release.prerelease }}` and `${{ steps.meta.outputs.tag }}` directly in `run:` shell blocks.
**What changed:** GHA security best practice (and a project PreToolUse security hook) requires passing such values through an `env:` binding so they cannot inject shell metacharacters. Changed to `env: IS_PRERELEASE: ${{ ... }}` + `env: DIST_TAG: ${{ ... }}` then `[ "$IS_PRERELEASE" = "true" ]` and `npm publish --tag "$DIST_TAG"`.
**Test impact:** publish-workflow.test.mjs adjusted to assert env-binding pattern (2 regexes instead of 1 inline `${{ ... }}` regex).

## Verification

```sh
$ npx vitest run tests/publish-workflow.test.mjs tests/release-notes-template.test.mjs
Test Files  2 passed (2)
     Tests  29 passed (29)

$ pnpm test
Test Files  1 failed | 96 passed | 3 skipped (100)
     Tests  3 failed | 1675 passed | 6 skipped | 1 todo (1685)
# 3 failed = pre-existing tests/detect.test.mjs failures (confirmed on main,
# documented in v0.12 Known Gaps; NOT Phase 39 regressions)

$ pnpm pack --json
# tarball: claude-dev-stack-1.0.0-alpha.1.tgz (400 810 bytes / 391.4 KB)
# 110 files
# ✓ dist/cli/quick.js, skills/cds-quick/SKILL.md, hooks/session-end-capture.sh, CHANGELOG.md
# ✓ NO packages/, .planning/, tests/
# ✓ Size budget (5 MB): OK (392 KB)
```

## Phase 39 — READY FOR RELEASE

This is the FINAL plan of the FINAL phase of v1.0 milestone.

**Manual release steps (next, owned by user):**
1. Merge this branch to main via PR
2. Create GitHub release: tag `v1.0.0-alpha.1`, **CHECK "Set as a pre-release" checkbox**
3. Workflow fires automatically: preflight + smoke + `npm publish --tag alpha`
4. Smoke verify: `npm info claude-dev-stack@alpha version` returns `1.0.0-alpha.1`
5. Confirm `@latest` UNCHANGED: `npm info claude-dev-stack@latest version` still `0.12.x`
