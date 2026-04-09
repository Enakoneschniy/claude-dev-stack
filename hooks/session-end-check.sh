#!/bin/bash
# Stop hook: reminds Claude to log the session if vault exists.
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
  exit 0
fi

echo "⚠️ SESSION NOT LOGGED: No session log found for $PROJECT_NAME today ($TODAY)."
echo "Before ending, create a session log at: $SESSION_DIR/${TODAY}-<slug>.md"
echo "Include: what was done, decisions made, TODO for next session, changed files."
echo "Use the session-manager skill: summarize this session and write the log."
