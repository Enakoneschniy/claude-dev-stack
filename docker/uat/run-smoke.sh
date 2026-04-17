#!/bin/bash
# UAT smoke test — runs inside Docker container against installed tarball.
# Exit 0 = all pass, exit 1 = any failure.
# Source: Phase 41 Plan 01

set -uo errexit
# Note: pipefail is intentionally NOT set — grep -q causes SIGPIPE on tar
# which makes pipefail-enabled pipes return 141 even on valid matches.

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

# 11. Tarball includes hooks
check_tarball_contains "tarball has hooks/session-end-capture.sh" "package/hooks/session-end-capture.sh"

# 12. Tarball excludes packages/
check_tarball_excludes "tarball excludes packages/" "packages/"

# 13. Tarball excludes tests/
check_tarball_excludes "tarball excludes tests/" "tests/"

# 14. Tarball excludes .planning/
check_tarball_excludes "tarball excludes .planning/" ".planning/"

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
