#!/bin/bash
# Stop hook: reminds Claude to log the session if vault exists.
# This fires when Claude is about to stop responding.
# Output is fed back to Claude as system feedback.

VAULT="${VAULT_PATH:-$HOME/vault}"
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
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

# Check if any meaningful work happened (at least a few tool calls in this session)
# If vault project exists but no session log for today — remind
echo "⚠️ SESSION NOT LOGGED: No session log found for $PROJECT_NAME today ($TODAY)."
echo "Before ending, create a session log at: $SESSION_DIR/${TODAY}-<slug>.md"
echo "Include: what was done, decisions made, TODO for next session, changed files."
echo "Use the session-manager skill: summarize this session and write the log."
