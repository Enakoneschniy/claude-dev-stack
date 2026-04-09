#!/bin/bash
# PostToolUse hook (Write|Edit): auto-pushes vault when files are written there.
# Checks if the modified file is inside the vault directory.
# Silent — runs in background, no output to avoid disrupting Claude.

VAULT="${VAULT_PATH:-$HOME/vault}"

# Only if vault is a git repo with remote
if [ ! -d "$VAULT/.git" ]; then
  exit 0
fi

HAS_REMOTE=$(git -C "$VAULT" remote 2>/dev/null)
if [ -z "$HAS_REMOTE" ]; then
  exit 0
fi

# Check if any vault files changed (unstaged or staged)
CHANGES=$(git -C "$VAULT" status --porcelain 2>/dev/null)
if [ -z "$CHANGES" ]; then
  exit 0
fi

# Commit and push silently
git -C "$VAULT" add -A 2>/dev/null
git -C "$VAULT" commit -m "Auto-sync: $(date +%Y-%m-%d\ %H:%M)" --quiet 2>/dev/null
git -C "$VAULT" push --quiet 2>/dev/null &
