#!/bin/bash
# gsd-auto-reapply-patches.sh — Auto-reapply GSD patches after /gsd-update.
#
# Invoked by session-start-context.sh on SessionStart.
# Compares patch files shipped in the claude-dev-stack package against the
# currently installed GSD files and overwrites any that differ.
#
# Output: prints "GSD patches auto-reapplied" if any patch was applied.
# Silent on no-op.

GSD_DIR="${GSD_DIR:-$HOME/.claude/get-shit-done}"

# PATCHES_DIR can be overridden via env var (used in tests and dev installs)
if [ -z "${PATCHES_DIR:-}" ]; then
  PATCHES_DIR=""
else
  # Use provided PATCHES_DIR directly if it exists
  if [ ! -d "$PATCHES_DIR" ]; then
    PATCHES_DIR=""
  fi
fi

# Locate the claude-dev-stack package patches/ directory.
# 1. Try npm global location (npx installs)
for candidate in \
  "$(npm root -g 2>/dev/null)/claude-dev-stack/patches" \
  "$HOME/.npm/_npx/*/node_modules/claude-dev-stack/patches" \
  "$HOME/.local/share/npm/lib/node_modules/claude-dev-stack/patches"; do
  # Expand glob in candidate
  for expanded in $candidate; do
    if [ -d "$expanded" ]; then
      PATCHES_DIR="$expanded"
      break 2
    fi
  done
done

# 2. Try well-known dev locations (local checkouts)
if [ -z "$PATCHES_DIR" ]; then
  for dev_candidate in \
    "$HOME/Projects/claude-dev-stack/patches" \
    "$HOME/projects/claude-dev-stack/patches" \
    "$HOME/code/claude-dev-stack/patches"; do
    if [ -d "$dev_candidate" ]; then
      PATCHES_DIR="$dev_candidate"
      break
    fi
  done
fi

# If no patches dir found or GSD not installed, exit silently
if [ -z "$PATCHES_DIR" ] || [ ! -d "$GSD_DIR" ]; then
  exit 0
fi

APPLIED=0

# Apply patch: patches/transition.md → GSD workflows/transition.md
PATCH_FILE="$PATCHES_DIR/transition.md"
TARGET_FILE="$GSD_DIR/workflows/transition.md"

if [ -f "$PATCH_FILE" ] && [ -f "$TARGET_FILE" ]; then
  PATCH_SHA=$(shasum -a 256 "$PATCH_FILE" 2>/dev/null | awk '{print $1}')
  TARGET_SHA=$(shasum -a 256 "$TARGET_FILE" 2>/dev/null | awk '{print $1}')
  if [ "$PATCH_SHA" != "$TARGET_SHA" ]; then
    cp "$PATCH_FILE" "$TARGET_FILE"
    APPLIED=$((APPLIED + 1))
  fi
fi

if [ "$APPLIED" -gt 0 ]; then
  echo "GSD patches auto-reapplied ($APPLIED file(s) updated)"
fi
