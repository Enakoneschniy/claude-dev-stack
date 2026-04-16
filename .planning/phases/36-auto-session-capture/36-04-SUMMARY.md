# Plan 36-04 — Integration Tests + Deprecation Doc — SUMMARY

**Commit:** `b00dc8c` — `feat(36): live integration test + SC audit + migration doc (Plan 36-04)`

## Files created
- `tests/hooks/session-end-capture.live.test.mjs` — INTEGRATION=1-gated end-to-end test (skipped by default)
- `tests/hooks/phase36-success-criteria.test.mjs` — 15-test cross-cutting SC audit
- `docs/migration/v1.0-auto-capture.md` — user-facing migration guide (~120 lines)

## Files modified
- `package.json` — added `test:live` script (INTEGRATION=1 vitest run ...live.test.mjs)
- `skills/session-manager/SKILL.md` — restored end-trigger + resume-intent vocabulary inside the narrowed description (required by Phase 28 silent-session-start tests, reconciled with Phase 36 fallback framing)

## Test count + pass count

- **SC audit tests:** 15 passing (all in default suite, no env gates)
  - SC#1 (3 tests): wrapper exists + exits <400ms; hook imports dispatchAgent + openSessionsDB; AbortController + 60s timeout present
  - SC#2 (2 tests): updateContextHistory imported; called with expected args
  - SC#3 (3 tests): classifyError tiers present; transaction wrapping present; log-tier append present
  - SC#4 (4 tests): wizard filters session-end-check; migration message present; both wrapper + .mjs copied; SKILL.md has "fallback"
  - Meta (3 tests): structural guard passes; node --check passes; pretest script wired
- **Live test:** 1 (skipped by default, runs when `INTEGRATION=1 ANTHROPIC_API_KEY=... pnpm test:live`)

**Final full-suite totals:** 1088 passing / 3 pre-existing baseline failures (`tests/detect.test.mjs`, unrelated to Phase 36) / 3 skipped / 1 todo.

## Deviations from plan text

1. **SC#2 regex adjusted** — plan had `/updateContextHistory.*from.*lib\/session-context\.mjs/s` but the hook uses dynamic `await import('../lib/session-context.mjs')` (no `from` keyword). Split into two string matches instead.

2. **SKILL.md description** — plan's narrowed description dropped the end-trigger vocabulary tokens that Phase 28 `tests/silent-session-start.test.mjs` locks in. Reconciled by keeping the vocabulary INSIDE the narrowed "fallback" description rather than dropping it. Skill still triggers on fallback paths as documented.

3. **Live test observation assertion** — `SessionsDB` public API doesn't expose a raw sessions-table query. The live test uses `searchObservations(...)` as a smoke check that SQLite is reachable + writes landed. Stronger assertions would require exposing a `listSessions` API — deferred to Phase 37 (sessions.search MCP tools).

4. **`cross-env` not added** — plan suggested `cross-env INTEGRATION=1 vitest run ...`. I used `INTEGRATION=1 vitest run ...` (POSIX-only) and noted the Windows caveat in the plan summary. Adding `cross-env` requires a fresh dep; deferred unless a Windows user needs it.

## Migration doc line count

~120 lines; covers: what changed, upgrade instructions, custom-hook preservation, opt-out via `~/.claude/cds-capture-config.json`, fallback `/end` skill, troubleshooting with log tiers, SQLite inspection, known v1.0 alpha limitations.

## Final Phase 36 state — ROADMAP SC#1-4 status

| SC | Status | Verified by |
|----|--------|-------------|
| **SC#1** (Stop hook detached, SQLite write within 60s) | ✓ GREEN | SC audit + hook mock-integration tests (Plan 02). Wrapper latency <200ms verified. Live test ready for confirmation. |
| **SC#2** (context.md pointer updated) | ✓ GREEN | SC audit asserts the imports + call signature. Behavior confirmed in Plan 02 happy-path test via `updateContextHistoryCalls` spy. |
| **SC#3** (forced throw → rollback, no user-visible error) | ✓ GREEN | Plan 02 forced-throw + rollback tests; SC audit confirms classifier + transaction + log tiers. |
| **SC#4** (wizard replaces hook + prints message) | ✓ GREEN | Plan 03 wizard migration tests (replaces/idempotent/custom-preserved/executable-bit/migration-message). |

## Recommendation

Run `INTEGRATION=1 ANTHROPIC_API_KEY=... pnpm test:live` once before tagging Phase 36 complete to confirm the live-API path works end-to-end. Not required for Phase 36 merge — the mock-integration coverage is sufficient for v1.0 alpha.

## Next

Phase 36 complete. PR merge to main unblocks Phase 37 (sessions.search MCP
tools), Phase 38 (backfill), and Phase 39 (release prep). The capture
subpackage's `mode: 'backfill'` parameter is already wired for Phase 38 consumption.
