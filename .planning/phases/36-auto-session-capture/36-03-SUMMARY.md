# Plan 36-03 — Wizard Migration — SUMMARY

**Commit:** `2388e20` — `feat(36): wizard migration + session-manager narrowing (Plan 36-03)`

## Files modified
- `lib/install/hooks.mjs` — copy loops + `_writeSettingsFile` signature + Stop-hook block rewrite
- `skills/session-manager/SKILL.md` — frontmatter `description` narrowed to fallback-only

## Files created
- `tests/install/hooks-migration.test.mjs` — 7 regression tests

## Test count + pass count
- New tests: **7** (all passing in 130ms)
  - `replaces` — legacy session-end-check.sh entry dropped, capture entry added
  - `idempotent` (second run) — zero diff, no duplicate entries
  - `custom-preserved` — user's custom Stop hook kept with warning
  - `executable-bit` — wrapper chmod 0o755
  - (plus companion test) `.mjs` Node-logic file copied
  - `migration-message` (first run) — info line emitted exactly once
  - `migration-message` (idempotent) — no duplicate info line

## Deviations from plan text

1. **No `CDS_HOOKS_DIR` env var** — the plan suggested introducing one for testability. I tested via `process.env.HOME` override instead (simpler; installSessionHook calls `homedir()` at runtime so HOME redirect is sufficient). No env-var addition.

2. **Signature change summary** — `_writeSettingsFile(settingsPath, startDest, endDest, endCaptureDest, pushDest, vaultPath)` — inserted `endCaptureDest` between `endDest` and `pushDest` as planner recommended. Both call sites updated.

3. **Legacy file `hooks/session-end-check.sh`** — stays in the copy loop so existing user settings.json files that still reference it don't break immediately on wizard run (the shell file itself remains valid). The wizard removes the SETTINGS entry; file-on-disk cleanup deferred to a post-v1.0 cleanup phase.

## Next

Plan 04 adds end-to-end integration tests, success-criteria audit test, and the migration doc.
