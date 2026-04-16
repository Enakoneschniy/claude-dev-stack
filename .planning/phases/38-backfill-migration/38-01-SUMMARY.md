# Phase 38 Plan 01 — SUMMARY

**Status:** executed
**Date:** 2026-04-16
**Branch:** `gsd/phase-38-backfill-migration`

## Scope

Cross-phase amendments to `@cds/core` so Plan 02's backfill migrator has a
stable surface to consume: migration 002 (adds `entities.display_name` +
`sessions.source_hash`), `upsertEntity` normalization, `buildExtractionPrompt`
with a flat-string shape + backfill preamble.

## Files

### Added

- `packages/cds-core/src/vault/internal/migrations/002-entity-display-name.sql`
  — ALTER TABLE migration (entities.display_name + sessions.source_hash) +
  display_name backfill for rows that pre-date Phase 38.
- `packages/cds-core/src/vault/migrations-002.test.ts` — 4 cases: column
  addition, backfill on v1→v2 upgrade, idempotent re-run, fresh-row NULL default.

### Modified in-place

- `packages/cds-core/src/vault/sessions.ts`
  - `Entity` type gains `display_name: string | null` field.
  - Prepared `upsertEntityStmt` rewritten: INSERT now includes `display_name`;
    ON CONFLICT path uses `COALESCE(entities.type, excluded.type)` so an
    existing non-null type is preserved (D-105). `RETURNING id, name,
    display_name, type, first_seen, last_updated`.
  - `upsertEntity({name, type})` body: `trim() → toLowerCase()` for the UNIQUE
    key, trimmed original casing for `display_name`, throws `VaultError` with
    message containing "cannot be empty" on empty/whitespace input.
- `packages/cds-core/src/capture/prompts.ts`
  - New module constant `BACKFILL_PREAMBLE` (verbatim D-92 text, em-dash
    preserved).
  - New exported `BuiltPrompt` interface + `buildExtractionPrompt({mode,
    input}): BuiltPrompt` function — the canonical Phase 38 entry.
- `packages/cds-core/src/capture/transcript.ts`
  - Phase 36's message-shaped builder renamed to
    `buildExtractionPromptFromMessages(messages, mode)` (same signature, new
    name) to free up `buildExtractionPrompt` for the Phase 38 flat-string
    entry. Body unchanged.
- `packages/cds-core/src/capture/prompts.test.ts` — 7 new cases under
  `describe('buildExtractionPrompt — mode: backfill')`.
- `packages/cds-core/src/capture/transcript.test.ts` — renamed 4 call sites
  `buildExtractionPrompt → buildExtractionPromptFromMessages` (no behavioural
  change).
- `packages/cds-core/src/capture/index.test.ts` — asserts both
  `buildExtractionPrompt` and `buildExtractionPromptFromMessages` are
  exported from the barrel.
- `packages/cds-core/src/vault/sessions.test.ts` — 6 new Phase 38 cases
  (normalization, first-seen display_name, whitespace trim, empty-guard,
  Cyrillic, COALESCE type-preservation).
- `packages/cds-core/src/vault/migration.test.ts` — two assertions bumped
  from `count === 1` to `count === 2` now that 002 ships alongside 001.
- `hooks/session-end-capture.mjs` — updated dynamic import to destructure
  `buildExtractionPromptFromMessages` instead of `buildExtractionPrompt`,
  and updated the single call site.

## Deviations from plan

All three deviations stem from the plan being written against an assumed
Phase 34/35/36 shape that differs slightly from what actually shipped. Each
is structurally equivalent to the planned API — the contract Plan 02
consumes is intact.

1. **Migrations directory is `internal/migrations/` not `migrations/`.**
   The plan's file path
   `packages/cds-core/src/vault/migrations/002-entity-display-name.sql`
   did not match the actual Phase 35 layout. Landed at
   `packages/cds-core/src/vault/internal/migrations/002-entity-display-name.sql`
   so the runner's `MIGRATIONS_DIR` (resolved from its own module URL)
   picks it up automatically. `copy-migrations.mjs` post-build step already
   globs `.sql` files under the correct directory.

2. **`buildExtractionPrompt` name collision in Phase 36.** Phase 36 put its
   message-shaped builder in `transcript.ts` with the same name Plan 01
   expected to add in `prompts.ts`. Resolution: renamed the Phase 36
   function to `buildExtractionPromptFromMessages` (purely internal — only
   the Stop hook + transcript.test.ts consumed it), and added the Phase 38
   flat-string `buildExtractionPrompt({mode, input})` in `prompts.ts` as
   the canonical unified entry. Both share the underlying
   `buildSystemPrompt()` + `emitObservationsTool` so sessions.db stays
   consistent across pathways (D-91/D-93 spirit preserved).

3. **`upsertEntity` signature stays object-arg.** Plan asked for
   `upsertEntity(rawName: string, type: string): number`; Phase 35
   actually ships `upsertEntity(input: { name: string; type: string }):
   Entity` as a method on the SessionsDB handle. Preserved the Phase 35
   call shape (no consumer churn) and applied the normalization inside the
   method body. Plan 02 PLAN.md explicitly permits this adaptation
   ("If Phase 35's `upsertEntity` is exposed as a method on a DB-wrapper
   object rather than a free function, adapt"). The normalization
   contract — trim + lowercase for the UNIQUE key, trimmed original for
   display_name, empty-input guard — is bit-identical to D-103/D-105.

## Preflight (Task 38-01-00)

All five prerequisites confirmed on disk before any writes:

- `packages/cds-core/src/vault/sessions.ts` exports `upsertEntity` (on the
  `SessionsDB` interface + inside `buildSessionsHandle`).
- `packages/cds-core/src/vault/internal/migrations/001-initial.sql` present
  (Phase 35 baseline — note the filename is `001-initial.sql` not the
  plan-assumed `001-initial-schema.sql`; runner matches by version prefix
  only).
- `packages/cds-core/src/vault/internal/migrations/runner.ts` present,
  exports `runPendingMigrations` + `MigrationError`.
- `packages/cds-core/src/capture/prompts.ts` exports
  `SYSTEM_PROMPT`, `buildSystemPrompt`, `emitObservationsTool`. (Phase 36
  did NOT ship `buildExtractionPrompt` in prompts.ts — that name was used
  by the sibling `transcript.ts`; addressed in deviation 2.)
- `packages/cds-core/src/agent-dispatcher.ts` exports `dispatchAgent`.

No blockers raised.

## Verification

- `pnpm --filter @cds/core exec tsc --noEmit` — zero errors.
- `pnpm --filter @cds/core test` — **127 passed / 1 skipped / 1 todo**
  (was 110 passed baseline; added 17 new: 6 sessions.test.ts, 4
  migrations-002.test.ts, 7 prompts.test.ts).
- `pnpm --filter @cds/core build` — clean; `copy-migrations.mjs` copies
  both 001-initial.sql and 002-entity-display-name.sql into
  `dist/vault/internal/migrations/`.

## Handoff to Plan 02

Plan 02's migrator can import from the Phase 38-ready surface:

```ts
import { buildExtractionPrompt } from '@cds/core/capture';
// or named: import { buildExtractionPrompt } from '@cds/core/capture/prompts';
// returns { systemPrompt, userPrompt, tools }

import { openSessionsDB } from '@cds/core';
// handle.upsertEntity({ name, type }) returns Entity with display_name populated

// Migration 002 has already applied on any fresh sessions.db open.
// sessions.source_hash is available for Plan 02 idempotency writes.
```
