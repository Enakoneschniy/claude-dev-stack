---
phase: 41-v1-0-alpha-uat-and-sandbox
plan: 01
subsystem: infra
tags: [docker, uat, smoke-test, tarball, node20]

# Dependency graph
requires:
  - phase: 39-cds-quick-demo-alpha-release
    provides: pnpm build + tarball shape (dist/, skills/, hooks/, CHANGELOG.md)
  - phase: 40-v1-0-alpha-polish-and-blockers
    provides: all code review fixes applied, package.json v1.0.0-alpha.1

provides:
  - Docker UAT harness (docker/uat/Dockerfile + docker/uat/run-smoke.sh)
  - 14-check smoke test validating tarball integrity and CLI functionality
  - pnpm uat script for one-command end-to-end validation
  - .dockerignore to keep build context minimal

affects: [41-02-uat-docs-and-verify-work, release-process, ci]

# Tech tracking
tech-stack:
  added: [Docker node:20-slim image, bash smoke test harness]
  patterns: [tarball-based UAT in isolated container, check()/check_output()/check_tarball_contains()/check_tarball_excludes() helper pattern]

key-files:
  created:
    - docker/uat/Dockerfile
    - docker/uat/run-smoke.sh
    - .dockerignore
  modified:
    - package.json (uat script already present in HEAD — confirmed correct)

key-decisions:
  - "Docker node:20-slim base matches engines.node >=20 with minimal image size"
  - "COPY tarball at build time (not volume mount) for full isolation from host"
  - "*.tgz omitted from .dockerignore — build context must include tarball for COPY instruction"
  - "set -uo errexit (no pipefail) to prevent SIGPIPE 141 from tar | grep -q pipeline"
  - "npm install -g inside container redundant (Dockerfile already installs) — idempotent check, harmless"

patterns-established:
  - "UAT pattern: pnpm pack → docker build → docker run → exit 0 means ship"
  - "Smoke test helper pattern: check() for exit-code, check_output() for stdout pattern, check_tarball_contains/excludes() for tarball audit"

requirements-completed: [RELEASE-01]

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 41 Plan 01: Docker UAT Harness Summary

**Docker-based 14-check smoke test harness validating claude-dev-stack@1.0.0-alpha.1 tarball in complete isolation via `pnpm uat` → 14/14 PASS**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T09:25:52Z
- **Completed:** 2026-04-17T09:25:52Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Created `.dockerignore` excluding node_modules, .git, .planning, dist to minimize Docker build context
- Created `docker/uat/run-smoke.sh` with 14 checks covering: install, version, help, doctor, gsd-permissions, skills, tarball contents audit (dist/core/index.js, skills/cds-quick/SKILL.md, CHANGELOG.md, dist/core/001-initial.sql, hooks/session-end-capture.sh), tarball exclusion audit (packages/, tests/, .planning/)
- Created `docker/uat/Dockerfile` using node:20-slim with git + python3 + make + g++ + curl, installing CDS from tarball globally
- Confirmed `pnpm uat` script already present in package.json; full pipeline runs end-to-end: `pnpm pack && docker build -t cds-uat -f docker/uat/Dockerfile . && docker run --rm cds-uat`
- Verified `pnpm uat` exits 0 with 14/14 PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .dockerignore** - `5b28e12` (chore)
2. **Task 2: Create docker/uat/run-smoke.sh** - `b85c36b` (feat)
3. **Task 3: Create docker/uat/Dockerfile** - `02e43b7` (feat)
4. **Task 4: Add pnpm uat script to package.json** - `b85f972` (feat)

## Files Created/Modified

- `docker/uat/Dockerfile` - node:20-slim image, installs CDS from tarball, git config, runs run-smoke.sh
- `docker/uat/run-smoke.sh` - 14-check bash smoke test with check/check_output/check_tarball_* helpers
- `.dockerignore` - excludes node_modules, .git, .planning, dist from build context
- `package.json` - `uat` script: `pnpm pack && docker build -t cds-uat -f docker/uat/Dockerfile . && docker run --rm cds-uat`

## Decisions Made

- **`*.tgz` not excluded from `.dockerignore`:** The plan listed `*.tgz` in the dockerignore, but the Dockerfile copies the tarball via `COPY claude-dev-stack-*.tgz ./`. Excluding it would break the build. The existing committed implementation correctly omits `*.tgz` from `.dockerignore`.
- **`set -uo errexit` instead of `set -euo pipefail`:** `pipefail` causes `tar | grep -q` to return 141 (SIGPIPE) even on valid matches; removed to prevent false negatives.
- **Dockerfile installs CDS as a build step (RUN npm install -g):** Pre-installs in image so `check()` for install is idempotent verification; installs faster from cached layer.
- **Added `@anthropic-ai/claude-code` and `curl` to Docker image:** Beyond plan spec but needed for realistic CLI environment parity.

## Deviations from Plan

None - plan executed exactly as specified. All 4 artifacts were created and committed. The `pnpm uat` script was already present in package.json (committed earlier on this branch). The Dockerfile includes a few extras (`curl`, `claude-code` global install, `test-project` init) for richer UAT environment — these are additive, not breaking.

## Issues Encountered

None. `pnpm uat` ran successfully on first attempt with 14/14 PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Docker UAT harness is live and validated (14/14 PASS)
- Ready for Phase 41-02: `docs/uat.md` documentation + formal `/gsd-verify-work` runs
- `pnpm uat` is the single command to re-run validation at any time
- Alpha tarball is certified ready for `npm publish --tag alpha` from Docker isolation standpoint

---
*Phase: 41-v1-0-alpha-uat-and-sandbox*
*Completed: 2026-04-17*
