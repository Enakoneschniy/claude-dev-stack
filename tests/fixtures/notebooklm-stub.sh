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

if [ -n "$STDERR" ]; then
  printf '%s\n' "$STDERR" >&2
fi
if [ -n "$STDOUT" ]; then
  printf '%s\n' "$STDOUT"
fi

exit "$EXIT"
