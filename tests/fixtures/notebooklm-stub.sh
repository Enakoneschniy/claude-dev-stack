#!/bin/bash
#
# Fake notebooklm binary for tests/notebooklm.test.mjs.
#
# Behavior is driven by three env vars (not argv — the stub ignores argv
# entirely and lets the test decide the scenario):
#
#   NOTEBOOKLM_STUB_STDOUT  - text to emit on stdout (printf verbatim)
#   NOTEBOOKLM_STUB_STDERR  - text to emit on stderr (printf verbatim)
#   NOTEBOOKLM_STUB_EXIT    - exit code (default: 0)
#
# Empty values produce no output on that stream. The test harness prepends
# the directory containing this script to PATH before exercising
# lib/notebooklm.mjs, so spawnSync('notebooklm', ...) resolves here.

STDOUT="${NOTEBOOKLM_STUB_STDOUT:-}"
STDERR="${NOTEBOOKLM_STUB_STDERR:-}"
EXIT="${NOTEBOOKLM_STUB_EXIT:-0}"
ARGV_LOG="${NOTEBOOKLM_STUB_ARGV_LOG:-}"

# Optional argv-logging mode. When NOTEBOOKLM_STUB_ARGV_LOG is set to a
# writable file path, the behavior depends on NOTEBOOKLM_STUB_ARGV_LOG_MODE:
#
#   arg3 (default) — append $3 (file path from `notebooklm source add <path> ...`).
#                    Used by uploadSource tests.
#   all            — append all argv joined with spaces as a single line.
#                    Used by tests that need to verify flag ordering (askNotebook, etc.).
#
# Existing tests that do not set NOTEBOOKLM_STUB_ARGV_LOG get unchanged
# behavior (no log file written, no other side effect).
ARGV_LOG_MODE="${NOTEBOOKLM_STUB_ARGV_LOG_MODE:-arg3}"
if [ -n "$ARGV_LOG" ]; then
  if [ "$ARGV_LOG_MODE" = "all" ]; then
    printf '%s\n' "$*" >> "$ARGV_LOG"
  else
    printf '%s\n' "$3" >> "$ARGV_LOG"
  fi
fi

if [ -n "$STDERR" ]; then
  printf '%s\n' "$STDERR" >&2
fi
if [ -n "$STDOUT" ]; then
  printf '%s\n' "$STDOUT"
fi

exit "$EXIT"
