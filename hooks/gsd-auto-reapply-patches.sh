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

# BUG-06 D-07: Prefer wizard-pinned ~/.claude/gsd-local-patches before any
# runtime resolution. This is the authoritative copy written by the install
# wizard and is version-pinned to the installed claude-dev-stack.
if [ -z "$PATCHES_DIR" ] && [ -d "$HOME/.claude/gsd-local-patches" ]; then
  PATCHES_DIR="$HOME/.claude/gsd-local-patches"
fi

# Locate the claude-dev-stack package patches/ directory (only if not already resolved above).
# 1. Try npm global location (npx installs)
if [ -z "$PATCHES_DIR" ]; then
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
fi

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

# Portable SHA-256: prefer sha256sum (Linux), fall back to shasum (macOS)
_sha256() { sha256sum "$1" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'; }

# Apply SHA-diff patches — iterate over all .md files in patches dir, map to GSD workflows/
for PATCH_FILE in "$PATCHES_DIR"/*.md; do
  [ -f "$PATCH_FILE" ] || continue
  PATCH_NAME="$(basename "$PATCH_FILE")"
  TARGET_FILE="$GSD_DIR/workflows/$PATCH_NAME"

  [ -f "$TARGET_FILE" ] || continue

  PATCH_SHA=$(_sha256 "$PATCH_FILE")
  TARGET_SHA=$(_sha256 "$TARGET_FILE")
  # Guard: if both SHAs are empty (no sha tool available), force apply to be safe
  if [ -z "$PATCH_SHA" ] || [ -z "$TARGET_SHA" ] || [ "$PATCH_SHA" != "$TARGET_SHA" ]; then
    cp "$PATCH_FILE" "$TARGET_FILE"
    APPLIED=$((APPLIED + 1))
  fi
done

# Phase 40 Plan 02: Apply unified-diff patches (*.patch files) via `patch -p1`.
# Idempotent: already-applied patches are detected via dry-run "Reversed" message
# and skipped silently. Hunk failures print a warning but do NOT abort the session.
for UNIFIED_PATCH in "$PATCHES_DIR"/*.patch; do
  [ -f "$UNIFIED_PATCH" ] || continue
  PATCH_NAME="$(basename "$UNIFIED_PATCH")"

  # Dry-run to detect state
  DRY_OUTPUT=$(patch --dry-run -p1 -d "$GSD_DIR" -i "$UNIFIED_PATCH" 2>&1)
  DRY_STATUS=$?
  DRY_LOWER=$(echo "$DRY_OUTPUT" | tr '[:upper:]' '[:lower:]')

  # Already applied — skip silently
  if echo "$DRY_LOWER" | grep -q "reversed\|previously applied"; then
    continue
  fi

  # Clean dry-run — apply for real
  if [ "$DRY_STATUS" -eq 0 ]; then
    patch -p1 -d "$GSD_DIR" -i "$UNIFIED_PATCH" > /dev/null 2>&1 && APPLIED=$((APPLIED + 1)) || \
      echo "GSD patch warning: $PATCH_NAME dry-run passed but real apply failed"
    continue
  fi

  # Hunk mismatch — warn and skip (fail-soft per Phase 27 philosophy)
  echo "GSD patch warning: $PATCH_NAME no longer applies cleanly — skipping (will retry after next /gsd-update)"
done

if [ "$APPLIED" -gt 0 ]; then
  echo "GSD patches auto-reapplied ($APPLIED file(s) updated)"
fi
