# Phase 32 — Deferred Items (out of scope)

## Pre-existing test failures (NOT caused by Phase 32 work)

During Phase 32 Plan 01 execution, `npm test` shows 3 failing subtests in
`tests/detect.test.mjs`, all related to the `profile` field returned by
`detectInstallState()`:

1. `detectInstallState() — no vault > profile is always null (v1 — CONTEXT.md deferred)`
2. `detectInstallState() — vault present (temp dir simulation) > profile is always null (v1 — CONTEXT.md deferred)`
3. `detectInstallState() — does not throw on missing resources > ...`

**Error:** `profile must be null in v1` — the test asserts `result.profile === null`
but the actual value is `{ lang: 'ru', codeLang: 'en', useCase: 'any' }`.

**Scope verdict:** Pre-existing on branch `gsd/phase-32-capture-automation-hotfix`
BEFORE any Phase 32 changes (verified via `git stash -u && node --test tests/detect.test.mjs`).
Caused by earlier work on this branch or an ancestor — not by the idea-capture-trigger hook.

**Disposition:** Leave untouched; route to a separate quick task or Phase 19-ish bugfix
plan. Out of scope per Phase 32 CONTEXT.md (strictly CAPTURE-01..04).
