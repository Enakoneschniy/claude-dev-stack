---
plan_id: 41-01-docker-uat-harness
phase: 41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docker/uat/Dockerfile
  - docker/uat/run-smoke.sh
  - package.json
  - .dockerignore
autonomous: true
requirements:
  - RELEASE-01
user_setup: []
must_haves:
  truths:
    - "`docker/uat/Dockerfile` builds from `node:20-slim`, installs git + build tools, copies tarball, runs `npm install -g`, then invokes `run-smoke.sh`"
    - "`docker/uat/run-smoke.sh` runs 11 checks (install, version, help, doctor, gsd-permissions, skills, tarball audit dist+skills+changelog, tarball exclusion audit, SQL migrations, ESM import) and exits 0 only if all pass"
    - "`pnpm uat` script in root package.json runs `pnpm pack && docker build -t cds-uat -f docker/uat/Dockerfile . && docker run --rm cds-uat`"
    - "`.dockerignore` excludes node_modules, .git, .planning to keep build context small"
  artifacts:
    - path: "docker/uat/Dockerfile"
      provides: "Docker image for isolated UAT of the npm tarball"
      contains: "node:20-slim"
    - path: "docker/uat/run-smoke.sh"
      provides: "11-check smoke test script for containerized UAT"
      contains: "PASS"
    - path: "package.json"
      provides: "pnpm uat script"
      contains: "uat"
---

<objective>
Create the Docker-based UAT harness that validates `claude-dev-stack@1.0.0-alpha.1` tarball in complete isolation from the maintainer's machine. Single command `pnpm uat` builds the image, installs from tarball, runs 11 smoke checks, reports results.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/41-v1-0-alpha-uat-and-sandbox/41-CONTEXT.md
@./CLAUDE.md
@./package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create .dockerignore</name>
  <files>
    - .dockerignore (new)
  </files>
  <action>
  Create `.dockerignore` to keep Docker build context small:

  ```
  node_modules
  .git
  .planning
  dist
  *.tgz
  ```

  Note: the Dockerfile will COPY only the tarball (produced by `pnpm pack` before build), not the whole repo. But Docker sends the build context first, so ignoring large dirs speeds up the build.
  </action>
  <verify>
    <automated>test -f .dockerignore && grep -q "node_modules" .dockerignore && grep -q ".planning" .dockerignore</automated>
  </verify>
  <done>.dockerignore created.</done>
</task>

<task type="auto">
  <name>Task 2: Create docker/uat/run-smoke.sh</name>
  <files>
    - docker/uat/run-smoke.sh (new)
  </files>
  <action>
  Create the smoke test script. Must be executable (`chmod +x`).

  ```bash
  #!/bin/bash
  set -euo pipefail

  PASS=0
  FAIL=0
  TOTAL=0

  check() {
    TOTAL=$((TOTAL + 1))
    local name="$1"; shift
    if "$@" > /dev/null 2>&1; then
      echo "[PASS] $name"
      PASS=$((PASS + 1))
    else
      echo "[FAIL] $name"
      FAIL=$((FAIL + 1))
    fi
  }

  check_output() {
    TOTAL=$((TOTAL + 1))
    local name="$1"; local pattern="$2"; shift 2
    local output
    output=$("$@" 2>&1) || true
    if echo "$output" | grep -q "$pattern"; then
      echo "[PASS] $name"
      PASS=$((PASS + 1))
    else
      echo "[FAIL] $name (expected '$pattern' in output)"
      FAIL=$((FAIL + 1))
    fi
  }

  check_tarball_contains() {
    TOTAL=$((TOTAL + 1))
    local name="$1"; local file="$2"
    if tar tzf /app/claude-dev-stack-*.tgz | grep -q "$file"; then
      echo "[PASS] $name"
      PASS=$((PASS + 1))
    else
      echo "[FAIL] $name (file '$file' not in tarball)"
      FAIL=$((FAIL + 1))
    fi
  }

  check_tarball_excludes() {
    TOTAL=$((TOTAL + 1))
    local name="$1"; local prefix="$2"
    if tar tzf /app/claude-dev-stack-*.tgz | grep -q "^package/$prefix"; then
      echo "[FAIL] $name ('$prefix' found in tarball)"
      FAIL=$((FAIL + 1))
    else
      echo "[PASS] $name"
      PASS=$((PASS + 1))
    fi
  }

  echo "=== Claude Dev Stack UAT Smoke Test ==="
  echo ""

  # 1. npm install from tarball
  check "npm install -g from tarball" npm install -g /app/claude-dev-stack-*.tgz

  # 2. Version check
  check_output "claude-dev-stack --version = 1.0.0-alpha.1" "1.0.0-alpha.1" claude-dev-stack version

  # 3. Help command
  check_output "claude-dev-stack help contains Setup" "Setup" claude-dev-stack help

  # 4. Doctor (may warn but must not crash)
  check "claude-dev-stack doctor exits 0" claude-dev-stack doctor

  # 5. Doctor --gsd-permissions
  mkdir -p /tmp/test-project/.claude
  cd /tmp/test-project
  check "doctor --gsd-permissions creates settings.local.json" bash -c 'claude-dev-stack doctor --gsd-permissions && test -f .claude/settings.local.json'
  cd /app

  # 6. Skills command
  check "claude-dev-stack skills exits 0" claude-dev-stack skills

  # 7. Tarball includes dist/core/index.js
  check_tarball_contains "tarball has dist/core/index.js" "package/dist/core/index.js"

  # 8. Tarball includes skills/cds-quick/SKILL.md
  check_tarball_contains "tarball has skills/cds-quick/SKILL.md" "package/skills/cds-quick/SKILL.md"

  # 9. Tarball includes CHANGELOG.md
  check_tarball_contains "tarball has CHANGELOG.md" "package/CHANGELOG.md"

  # 10. Tarball includes SQL migrations
  check_tarball_contains "tarball has dist/core/001-initial.sql" "package/dist/core/001-initial.sql"

  # 11. Tarball excludes packages/
  check_tarball_excludes "tarball excludes packages/" "packages/"

  # 12. Tarball excludes tests/
  check_tarball_excludes "tarball excludes tests/" "tests/"

  # 13. Tarball excludes .planning/
  check_tarball_excludes "tarball excludes .planning/" ".planning/"

  # 14. ESM import doesn't crash
  check "dist/core/index.js is importable" node --input-type=module -e "await import('/usr/local/lib/node_modules/claude-dev-stack/dist/core/index.js')"

  echo ""
  echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="

  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
  ```
  </action>
  <verify>
    <automated>test -f docker/uat/run-smoke.sh && test -x docker/uat/run-smoke.sh && grep -q "PASS" docker/uat/run-smoke.sh && grep -q "1.0.0-alpha.1" docker/uat/run-smoke.sh</automated>
  </verify>
  <done>Smoke test script with 14 checks created.</done>
</task>

<task type="auto">
  <name>Task 3: Create docker/uat/Dockerfile</name>
  <files>
    - docker/uat/Dockerfile (new)
  </files>
  <action>
  ```dockerfile
  FROM node:20-slim

  RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

  WORKDIR /app

  # Copy tarball + smoke script (built by pnpm pack before docker build)
  COPY claude-dev-stack-*.tgz ./
  COPY docker/uat/run-smoke.sh ./run-smoke.sh

  # Initialize a minimal git config (wizard needs git user.name/email)
  RUN git config --global user.name "UAT" && git config --global user.email "uat@test.local"

  CMD ["bash", "./run-smoke.sh"]
  ```
  </action>
  <verify>
    <automated>test -f docker/uat/Dockerfile && grep -q "node:20-slim" docker/uat/Dockerfile && grep -q "run-smoke.sh" docker/uat/Dockerfile</automated>
  </verify>
  <done>Dockerfile with node:20-slim + build tools + tarball copy.</done>
</task>

<task type="auto">
  <name>Task 4: Add pnpm uat script to package.json + run UAT</name>
  <files>
    - package.json (modified — add uat script)
  </files>
  <action>
  Add `"uat"` to package.json scripts:
  ```json
  "uat": "pnpm pack && docker build -t cds-uat -f docker/uat/Dockerfile . && docker run --rm cds-uat"
  ```

  Then run `pnpm uat` to verify the full pipeline works end-to-end.
  </action>
  <verify>
    <automated>grep -q '"uat"' package.json && pnpm uat</automated>
  </verify>
  <done>pnpm uat runs Docker UAT end-to-end and all 14 checks pass.</done>
</task>

</tasks>

<verification>
```sh
pnpm uat   # must exit 0 with 14/14 PASS
```
</verification>
