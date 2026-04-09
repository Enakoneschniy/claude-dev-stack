#!/bin/bash
# SessionStart hook: pulls vault from remote + loads project context.
# Output is fed to Claude as context before the first message.
#
# Project resolution order:
# 1. Check project-map.json for current directory → project name mapping
# 2. Fall back to directory basename matching vault/projects/

VAULT="${VAULT_PATH:-$HOME/vault}"
MAP_FILE="$VAULT/project-map.json"
CURRENT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Auto-pull vault from remote if configured
if [ -d "$VAULT/.git" ]; then
  HAS_REMOTE=$(git -C "$VAULT" remote 2>/dev/null)
  if [ -n "$HAS_REMOTE" ]; then
    git -C "$VAULT" pull --quiet 2>/dev/null
  fi
fi

# Try to resolve project name from mapping file
PROJECT_NAME=""
if [ -f "$MAP_FILE" ]; then
  ESCAPED_DIR=$(echo "$CURRENT_DIR" | sed 's/[\/&]/\\&/g')
  PROJECT_NAME=$(grep -o "\"${ESCAPED_DIR}\": *\"[^\"]*\"" "$MAP_FILE" 2>/dev/null | sed 's/.*: *"\([^"]*\)"/\1/')
fi

# Fallback: use directory basename
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$CURRENT_DIR")
fi

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
