#!/bin/bash
#
# Argv-aware fake notebooklm binary for tests/notebooklm-sync.test.mjs (Phase 4).
#
# Unlike tests/fixtures/notebooklm-stub.sh (Phase 2, argv-blind), this stub
# branches on the first argument ($1 = the subcommand) and selects a response
# from a per-mode env var with a sensible default. Phase 4 sync tests chain
# multiple CLI calls in one syncVault() invocation (list -> create? -> upload*
# -> delete-by-title*) and need different canned responses per subcommand
# without env resets between calls.
#
# Per-mode overrides:
#   NOTEBOOKLM_SYNC_STUB_LIST_STDOUT     -- stdout for `notebooklm list --json`
#   NOTEBOOKLM_SYNC_STUB_LIST_EXIT       -- exit code for `list` (default 0)
#   NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT   -- stdout for `notebooklm create <name> --json`
#   NOTEBOOKLM_SYNC_STUB_CREATE_EXIT     -- exit code for `create` (default 0)
#   NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT   -- stdout for `notebooklm source add ...`
#   NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT     -- exit code for `source add` (default 0)
#   NOTEBOOKLM_SYNC_STUB_UPLOAD_STDERR   -- stderr for `source add` (optional, for rate-limit tests)
#   NOTEBOOKLM_SYNC_STUB_DELETE_STDOUT   -- stdout for `notebooklm source delete-by-title ...`
#   NOTEBOOKLM_SYNC_STUB_DELETE_EXIT     -- exit code for `source delete-by-title` (default 0)
#   NOTEBOOKLM_SYNC_STUB_DELETE_STDERR   -- stderr for `source delete-by-title` (optional)
#
# Global fallbacks (used when per-mode override is unset):
#   NOTEBOOKLM_SYNC_STUB_DEFAULT_STDOUT -- catch-all stdout
#   NOTEBOOKLM_SYNC_STUB_DEFAULT_EXIT   -- catch-all exit code
#
# Each invocation is independent; no persistent state between calls.

CMD="$1"
SUB="$2"

# Select stdout/stderr/exit per mode, fall through to defaults.
# NOTE: defaults are set via explicit if-unset checks (not ${VAR:-default}) to
# avoid a bash quoting ambiguity where a value ending in } causes the shell to
# emit an extra literal } from the ${...} expansion closing brace.
STDOUT=""
STDERR=""
EXIT=0

# auth check mode — must appear before wildcard to prevent fall-through.
# Controlled by NOTEBOOKLM_SYNC_STUB_AUTH_EXIT (default 0 = authenticated).
if [ "$CMD" = "auth" ] && [ "$SUB" = "check" ]; then
  AUTH_EXIT="${NOTEBOOKLM_SYNC_STUB_AUTH_EXIT:-0}"
  if [ "$AUTH_EXIT" = "0" ]; then
    printf '%s\n' '{"status":"ok","checks":{}}'
    exit 0
  else
    printf '%s\n' "Authentication failed" >&2
    exit "$AUTH_EXIT"
  fi
fi

case "$CMD" in
  list)
    if [ -z "${NOTEBOOKLM_SYNC_STUB_LIST_STDOUT+x}" ]; then
      STDOUT='{"notebooks":[],"count":0}'
    else
      STDOUT="$NOTEBOOKLM_SYNC_STUB_LIST_STDOUT"
    fi
    EXIT="${NOTEBOOKLM_SYNC_STUB_LIST_EXIT:-0}"
    ;;
  create)
    if [ -z "${NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT+x}" ]; then
      STDOUT='{"notebook":{"id":"stub-nb-1","title":"stub-vault","created_at":null}}'
    else
      STDOUT="$NOTEBOOKLM_SYNC_STUB_CREATE_STDOUT"
    fi
    EXIT="${NOTEBOOKLM_SYNC_STUB_CREATE_EXIT:-0}"
    ;;
  source)
    if [ "$SUB" = "add" ]; then
      if [ -z "${NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT+x}" ]; then
        STDOUT='{"source":{"id":"stub-src-1","title":"stub-upload"}}'
      else
        STDOUT="$NOTEBOOKLM_SYNC_STUB_UPLOAD_STDOUT"
      fi
      STDERR="${NOTEBOOKLM_SYNC_STUB_UPLOAD_STDERR:-}"
      EXIT="${NOTEBOOKLM_SYNC_STUB_UPLOAD_EXIT:-0}"
    elif [ "$SUB" = "delete-by-title" ]; then
      if [ -z "${NOTEBOOKLM_SYNC_STUB_DELETE_STDOUT+x}" ]; then
        STDOUT="Deleted source: stub-src-1"
      else
        STDOUT="$NOTEBOOKLM_SYNC_STUB_DELETE_STDOUT"
      fi
      STDERR="${NOTEBOOKLM_SYNC_STUB_DELETE_STDERR:-}"
      EXIT="${NOTEBOOKLM_SYNC_STUB_DELETE_EXIT:-0}"
    else
      STDOUT="${NOTEBOOKLM_SYNC_STUB_DEFAULT_STDOUT:-}"
      EXIT="${NOTEBOOKLM_SYNC_STUB_DEFAULT_EXIT:-0}"
    fi
    ;;
  *)
    STDOUT="${NOTEBOOKLM_SYNC_STUB_DEFAULT_STDOUT:-}"
    EXIT="${NOTEBOOKLM_SYNC_STUB_DEFAULT_EXIT:-0}"
    ;;
esac

if [ -n "$STDERR" ]; then
  printf '%s\n' "$STDERR" >&2
fi
if [ -n "$STDOUT" ]; then
  printf '%s\n' "$STDOUT"
fi
exit "$EXIT"
