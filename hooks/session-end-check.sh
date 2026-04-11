#!/bin/bash
# Stop hook: reminds Claude to log session + auto-pushes vault to remote.
# This fires when Claude is about to stop responding.
# Output is fed back to Claude as system feedback.

VAULT="${VAULT_PATH:-$HOME/vault}"
MAP_FILE="$VAULT/project-map.json"
CURRENT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Resolve project name from mapping or fallback to basename
PROJECT_NAME=""
if [ -f "$MAP_FILE" ]; then
  ESCAPED_DIR=$(echo "$CURRENT_DIR" | sed 's/[\/&]/\\&/g')
  PROJECT_NAME=$(grep -o "\"${ESCAPED_DIR}\": *\"[^\"]*\"" "$MAP_FILE" 2>/dev/null | sed 's/.*: *"\([^"]*\)"/\1/')
fi
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$CURRENT_DIR")
fi

SESSION_DIR="$VAULT/projects/$PROJECT_NAME/sessions"
TODAY=$(date +%Y-%m-%d)

# Only trigger if vault and project exist
if [ ! -d "$SESSION_DIR" ]; then
  exit 0
fi

# Check if session was already logged today
if ls "$SESSION_DIR/$TODAY"*.md 1>/dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

  # Update context.md Session History via the Node wrapper (D-02 safety net)
  # Pick the newest session log for today as the one to link.
  SESSION_LOG=$(ls -t "$SESSION_DIR/$TODAY"*.md 2>/dev/null | head -1)
  if [ -n "$SESSION_LOG" ]; then
    SESSION_LOG_FILENAME=$(basename "$SESSION_LOG")
    if [ -f "$SCRIPT_DIR/update-context.mjs" ]; then
      VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME" \
        node "$SCRIPT_DIR/update-context.mjs" "$SESSION_LOG_FILENAME" 2>/dev/null || true
    fi
  fi

  # Trigger NotebookLM background sync (D-04 fire-and-forget).
  # NBLM-21/22/23: silent skip if binary absent or auth fails; detached spawn;
  # never blocks session-end UI; bash 2>/dev/null || true as double-safety.
  TRIGGER="$SCRIPT_DIR/notebooklm-sync-trigger.mjs"
  if [ -f "$TRIGGER" ]; then
    VAULT_PATH="$VAULT" node "$TRIGGER" 2>/dev/null || true
  fi

  # Session logged — auto-push vault if remote configured
  if [ -d "$VAULT/.git" ]; then
    HAS_REMOTE=$(git -C "$VAULT" remote 2>/dev/null)
    if [ -n "$HAS_REMOTE" ]; then
      git -C "$VAULT" add -A 2>/dev/null
      git -C "$VAULT" commit -m "Session: $PROJECT_NAME $TODAY" --quiet 2>/dev/null
      git -C "$VAULT" push --quiet 2>/dev/null
    fi
  fi
  exit 0
fi

# No session log — remind Claude
echo "⚠️ SESSION NOT LOGGED: No session log found for $PROJECT_NAME today ($TODAY)."
echo "Before ending, create a session log at: $SESSION_DIR/${TODAY}-<slug>.md"
echo "Include: what was done, decisions made, TODO for next session, changed files."
echo "Use the session-manager skill: summarize this session and write the log."
