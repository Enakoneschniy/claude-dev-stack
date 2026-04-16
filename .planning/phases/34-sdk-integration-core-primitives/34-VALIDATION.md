---
phase: 34
slug: sdk-integration-core-primitives
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
notes: Wave 0 is self-satisfied by Plan 01 (NOTICES.md + SDK dep + errors.ts + REQUIREMENTS correction) and then populated by Plans 02-04 (each plan creates its own source + test file in Wave 1). Mock-based default suite; INTEGRATION=1 env unlocks one live SDK test per plan where applicable.
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (inherited from Phase 33 Plan 03) |
| **Config file** | `packages/cds-core/vitest.config.ts` (inherits from root `vitest.config.ts` via Phase 33 `projects` array) |
| **Quick run command** | `pnpm --filter @cds/core vitest run` (single-package, ~5 seconds once Plans 02-04 ship tests) |
| **Full suite command** | `pnpm test` (root vitest aggregates all projects — should remain at Phase 33 baseline 928 root + new @cds/core tests) |
| **Integration suite command** | `INTEGRATION=1 ANTHROPIC_API_KEY=sk-... pnpm --filter @cds/core vitest run` |
| **Estimated runtime** | ~10 seconds quick-run (after all plans ship); ~60 seconds full-suite; ~30 seconds integration (3 live SDK calls × ~10s each) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cds/core vitest run` (fast; <10s; catches broken imports, type errors, unit regressions in the plan being executed)
- **After every plan wave:** Run `pnpm test` (full suite; validates Phase 33 baseline of 928 root tests still passes + all @cds/core plans compose cleanly via the shared `index.ts` re-exports)
- **Before `/gsd-verify-work`:** Full suite MUST be green AND `INTEGRATION=1 pnpm --filter @cds/core vitest run` MUST be green (live SDK hello-world hits Anthropic API for SDK-02 acceptance)
- **Max feedback latency:** 60 seconds for full suite; 10 seconds for package-scoped run

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 0 | SDK-01 | T-34-L1 | Transitive license audit fails on GPL/AGPL/SSPL | structural | `pnpm --filter @cds/core install && pnpm licenses list --prod --json --filter @cds/core > /tmp/licenses.json && node -e "const l=require('/tmp/licenses.json'); const bad=['GPL-3.0','AGPL-3.0','SSPL-1.0','UNKNOWN']; for (const k of bad) if (l[k] && l[k].length) { console.error('FAIL license='+k); process.exit(1); } console.log('OK');"` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 0 | SDK-01 | T-34-S1 | NOTICES.md exists + lists SDK + Commercial ToS + transitive deps | structural | `test -f NOTICES.md && grep -q '@anthropic-ai/claude-agent-sdk' NOTICES.md && grep -q 'Anthropic Commercial Terms of Service' NOTICES.md && grep -q 'prompts' NOTICES.md` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 0 | SDK-01 | — | NOTICES.md auto-included in npm pack | structural | `npm pack --dry-run 2>&1 \| grep -q 'NOTICES.md'` | ❌ W0 | ⬜ pending |
| 34-01-04 | 01 | 0 | SDK-01 | — | REQUIREMENTS.md SDK-01 carries D-15 correction note | structural | `grep -q 'Anthropic Commercial ToS' .planning/REQUIREMENTS.md && grep -q 'correction' .planning/REQUIREMENTS.md` | ❌ W0 | ⬜ pending |
| 34-01-05 | 01 | 0 | SDK-01 | — | `@cds/core` package.json has SDK dep; root does not | structural | `jq -r '.dependencies["@anthropic-ai/claude-agent-sdk"]' packages/cds-core/package.json \| grep -qE '^\^?[0-9]' && [ "$(jq -r '.dependencies \| keys \| length' package.json)" = "1" ] && jq -e '.dependencies.prompts' package.json > /dev/null` | ❌ W0 | ⬜ pending |
| 34-01-06 | 01 | 0 | SDK-01 | — | `errors.ts` scaffold with `DispatchError` base + `LicenseKeyError` exists | structural | `test -f packages/cds-core/src/errors.ts && grep -q 'class DispatchError' packages/cds-core/src/errors.ts && grep -q 'class LicenseKeyError' packages/cds-core/src/errors.ts` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 1 | SDK-02 | T-34-L2 | `models.ts` resolves `'haiku'`/`'sonnet'`/`'opus'` aliases | unit | `pnpm --filter @cds/core vitest run models.test.ts` | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 1 | SDK-02 | T-34-L2 | `dispatchAgent` against mock SDK returns `{ output, tokens, cost_usd }` with correct shapes | unit | `pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "mock"` | ❌ W0 | ⬜ pending |
| 34-02-03 | 02 | 1 | SDK-02 | T-34-L3 | `AbortSignal` → `AbortController` bridge cancels mid-iterator | unit | `pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "abort"` | ❌ W0 | ⬜ pending |
| 34-02-04 | 02 | 1 | SDK-02 | T-34-S2 | Live SDK hello-world returns non-zero `tokens.input` and `tokens.output` | integration | `INTEGRATION=1 pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "live SDK"` | ❌ W0 | ⬜ manual (API key required) |
| 34-02-05 | 02 | 1 | SDK-02 | — | Default `pnpm test` passes WITHOUT `ANTHROPIC_API_KEY` set | structural | `unset ANTHROPIC_API_KEY; pnpm --filter @cds/core vitest run` exits 0 | ❌ W0 | ⬜ pending |
| 34-03-01 | 03 | 1 | CORE-01 | — | `Context.add()` appends to readonly `messages` array | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "add accumulates"` | ❌ W0 | ⬜ pending |
| 34-03-02 | 03 | 1 | CORE-01 | T-34-I1 | `sessionId` resolution order (arg → env → uuid) frozen after construction | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "sessionId resolution"` | ❌ W0 | ⬜ pending |
| 34-03-03 | 03 | 1 | CORE-01 | T-34-I2 | `save()` → `load(id)` roundtrips messages; file written atomically | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "save/load roundtrip"` | ❌ W0 | ⬜ pending |
| 34-03-04 | 03 | 1 | CORE-01 | T-34-I3 | `save()` writes to `~/.claude/cds-context-{sessionId}.json` with mode 0600 | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "persist path and mode"` (uses HOME redirect) | ❌ W0 | ⬜ pending |
| 34-03-05 | 03 | 1 | CORE-01 | — | `_v: 1` version rejection throws on future version | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "unsupported schema version throws"` | ❌ W0 | ⬜ pending |
| 34-04-01 | 04 | 1 | CORE-02 | — | `record()` + `total()` aggregates tokens per session | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "aggregation"` | ❌ W0 | ⬜ pending |
| 34-04-02 | 04 | 1 | CORE-02 | — | Bundled pricing table loads for `haiku`/`sonnet`/`opus` model IDs | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "bundled pricing"` | ❌ W0 | ⬜ pending |
| 34-04-03 | 04 | 1 | CORE-02 | T-34-S3 | `~/.claude/anthropic-pricing.json` overrides bundled values | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "override"` (uses HOME redirect) | ❌ W0 | ⬜ pending |
| 34-04-04 | 04 | 1 | CORE-02 | — | `record()` throws `UnknownModelError` for unknown model | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "unknown model throws"` | ❌ W0 | ⬜ pending |
| 34-04-05 | 04 | 1 | CORE-02 | — | `dump()` renders human-readable table | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "dump format"` | ❌ W0 | ⬜ pending |
| 34-04-06 | 04 | 2 | SDK-01/02, CORE-01/02 | — | `packages/cds-core/src/index.ts` re-exports `dispatchAgent`, `Context`, `CostTracker`, `Tool`, `DispatchError`, `UnknownModelError`, `LicenseKeyError`, `MODEL_ALIASES` | unit | `pnpm --filter @cds/core vitest run index.test.ts` (smoke: type-check public surface via `import * as cdsCore`) | ❌ W0 | ⬜ pending |
| 34-04-07 | 04 | 2 | all | — | Phase 33 baseline preserved: full root test suite still green | regression | `pnpm test 2>&1 \| tee /tmp/full.log && grep -qE '928 passed' /tmp/full.log` | ✅ (if Phase 33 green at start) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · manual — requires human credentials or observation*

---

## Wave 0 Requirements

> Wave 0 "requirements" for Phase 34 are self-satisfied by Plan 01 (which is itself Wave 0 in the plan DAG). All plans after Plan 01 assume these Wave 0 outputs are in place.

- [ ] `NOTICES.md` at repo root (Plan 01 Task 2)
- [ ] `packages/cds-core/package.json` with `@anthropic-ai/claude-agent-sdk: ^0.2.110` in `dependencies` (Plan 01 Task 3)
- [ ] `packages/cds-core/src/errors.ts` with `DispatchError` + `LicenseKeyError` scaffold (Plan 01 Task 4; Plans 02/04 append subtypes `UnknownModelError`)
- [ ] `.planning/REQUIREMENTS.md` SDK-01 correction note per D-15 (Plan 01 Task 5)
- [ ] Transitive runtime license audit clean (no GPL/AGPL/SSPL/UNKNOWN) (Plan 01 Task 1)

*After Plan 01 ships: Plans 02/03/04 can run in Wave 1 in parallel.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `INTEGRATION=1` live SDK hello-world succeeds with a real API key | SDK-02 ROADMAP SC#2 | Requires `ANTHROPIC_API_KEY` — cannot run in public CI without Anthropic secret | Developer runs `INTEGRATION=1 ANTHROPIC_API_KEY=sk-... pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "live SDK"`; expects `✓ returns non-zero tokens for Haiku`; verifies dollar cost of the run is < $0.01 via CostTracker.dump() |
| Transitive license review: any new transitive lands under a license not already listed in NOTICES.md | SDK-01 | New transitive entering the tree between phase start and phase ship is a compliance blind spot | Plan 01 Task 3 emits full license list to `/tmp/licenses.json`; developer reviews and appends any new license entries to NOTICES.md before Plan 01 commit |
| Pricing table values match https://www.anthropic.com/pricing at phase-ship time | CORE-02 | Pricing drifts; manual check ensures what CDS ships matches Anthropic's published rates at release | Plan 04 Task 1 asks developer to fetch current pricing page, record values in `pricing.ts` constants + comment the retrieval date |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has `automated`; only 3 are `manual` and they are non-consecutive across plans)
- [x] Wave 0 covers all MISSING references (NOTICES.md, package.json SDK dep, errors.ts, REQUIREMENTS correction)
- [x] No watch-mode flags (all commands use `vitest run`, not `vitest` or `vitest watch`)
- [x] Feedback latency < 60s (package-scoped quick-run is ~5-10s; full-suite is ~60s; integration-only is manual)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-16 (plan-phase orchestrator, autonomous mode — matches Phase 33 precedent of author-approval during plan-phase workflow)
