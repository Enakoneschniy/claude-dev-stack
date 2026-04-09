#!/bin/bash
# SessionStart hook: loads project context from vault at session start.
# Output is fed to Claude as context before the first message.

VAULT="${VAULT_PATH:-$HOME/vault}"
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
PROJECT_DIR="$VAULT/projects/$PROJECT_NAME"

# Only trigger if vault project exists
if [ ! -d "$PROJECT_DIR" ]; then
  exit 0
fi

CONTEXT="$PROJECT_DIR/context.md"

if [ -f "$CONTEXT" ]; then
  echo "📋 Project context loaded for: $PROJECT_NAME"
  echo "Vault: $PROJECT_DIR"

  # Show last session TODO if exists
  LAST_SESSION=$(ls -t "$PROJECT_DIR/sessions/"*.md 2>/dev/null | head -1)
  if [ -n "$LAST_SESSION" ]; then
    TODOS=$(grep -E '^\s*- \[ \]' "$LAST_SESSION" 2>/dev/null)
    if [ -n "$TODOS" ]; then
      echo ""
      echo "Outstanding TODOs from last session ($(basename "$LAST_SESSION")):"
      echo "$TODOS"
    fi
  fi
fi
