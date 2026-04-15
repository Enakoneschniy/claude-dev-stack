# 28-02-SUMMARY.md — SessionStart marker writer + install .gitignore helper

**Phase**: 28 — Silent Session Start
**Plan**: 02
**Requirement**: SSR-01 (SC#3, SC#4)
**Status**: code complete, automated tests pass; manual UAT pending.

## What changed

### `hooks/session-start-context.sh`
Added an atomic marker-write block between the context echo / budget-check
blocks. The new block is placed AFTER the `CURRENT_DIR=...` assignment and
runs unconditionally on every successful hook execution (it does NOT
early-exit when the vault project is missing — the marker is useful even
without a vault project, so the skill's `/resume` path can still detect
pre-loaded prompt state).

Write sequence (fail-silent at every step):
1. `mkdir -p "$CURRENT_DIR/.claude"` if not already present.
2. `TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"`.
3. `printf '%s\n' "$TS" > .claude/.session-loaded.tmp`.
4. `mv .claude/.session-loaded.tmp .claude/.session-loaded` (atomic
   rename on POSIX).
5. Falls through to existing budget-check echo.

### `lib/install/hooks.mjs`
Added new exported helper `addSessionMarkerToGitignore(projectPath)`:
- No-op (returns `false`) when `.gitignore` already contains the exact
  line `.claude/.session-loaded`.
- Creates `.gitignore` with header comment + marker line when missing.
- Appends under a `# claude-dev-stack: session marker (Phase 28)` header
  when the file exists but the line is absent. Handles the
  no-trailing-newline edge case.
- Returns `true` when a change was written.

Wired into `installSessionHook()` inside the per-project loop, called
after `_writeSettingsFile(...)`. Wrapped in try/catch with a `warn(...)`
on failure so install never aborts on a gitignore write error.

### `tests/session-start-marker.test.mjs` (new)
6 hermetic tests executing the hook in `mkdtempSync` fixtures with
`git init`, vault project seeded, `HOME` overridden:
- Marker exists after successful run.
- Single-line ISO 8601 UTC timestamp regex.
- Mtime within 5 s of now.
- No `.session-loaded.tmp` leftover.
- Re-run advances mtime (atomic rewrite works).
- Hook exits 0 when `.claude` dir cannot be created (file-where-dir
  edge case) — marker absent but no throw.

### `tests/install-gitignore-marker.test.mjs` (new)
5 tests against the exported helper:
- Missing .gitignore → creates file with header + marker.
- Existing .gitignore without marker → appends.
- Existing .gitignore with marker → idempotent (returns `false`, byte
  identical).
- Two consecutive calls → marker appears exactly once.
- .gitignore without trailing newline → correctly separates prior
  content from header.

## Verification

- `node --test tests/session-start-marker.test.mjs tests/install-gitignore-marker.test.mjs` → 11/11 pass.
- `bash -n hooks/session-start-context.sh` → syntax OK.
- `npm test` (full suite) → 860 pass, 0 fail, 1 pre-existing skip.

## Decision log note

The marker writer is NOT gated on `$PROJECT_DIR` existing. Rationale:
the marker tells the session-manager skill "context was already loaded
into the prompt". Even when the vault doesn't have a project directory,
the `/resume` path should still know a greeting already happened — so
the skill can print "no vault context configured for this project"
instead of a redundant `cat`. The marker write placement reflects this:
AFTER the `CURRENT_DIR` assignment, BEFORE budget-check, outside the
early-exit branch.

## Manual UAT — pending (human-verify)

- [ ] Fresh install of the wizard into a test project → inspect
  `<project>/.gitignore` → see header comment + `.claude/.session-loaded`
  line. Re-run wizard → verify the line appears exactly once.
- [ ] Open a fresh Claude Code session in a project with the hook
  configured → `ls -la .claude/.session-loaded` → file exists with ISO
  timestamp inside, mtime ≈ now.

## Files touched

- `hooks/session-start-context.sh`
- `lib/install/hooks.mjs`
- `tests/session-start-marker.test.mjs` (new)
- `tests/install-gitignore-marker.test.mjs` (new)

## Commits

- `82e9b27` — feat(ssr-01): SessionStart marker writer + install wizard
  .gitignore helper
