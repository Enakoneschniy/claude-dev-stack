#!/bin/sh
# hooks/session-end-capture.sh
# Phase 36 D-64: double-fork wrapper. Launches Node detached, returns in <100ms.
# Mirrors the proven pattern from hooks/notebooklm-sync-trigger.mjs.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Inner subshell backgrounds Node; outer backgrounds + disowns to orphan
# the Node process from Claude's hook subprocess job table.
# stdout+stderr discarded; Node writes its own log to ~/.claude/cds-capture.log.
(node "$SCRIPT_DIR/session-end-capture.mjs" >/dev/null 2>&1 &) &
disown 2>/dev/null || true

exit 0
