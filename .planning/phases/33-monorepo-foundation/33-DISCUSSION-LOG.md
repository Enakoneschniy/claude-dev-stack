# Phase 33: Monorepo Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 33-monorepo-foundation
**Areas discussed:** Migration scope & TS conversion, Test migration tactic, Distribution model, CI changed-only implementation

---

## Gray Area Selection

**Question:** Какие gray areas обсудим для Phase 33 (Monorepo Foundation)?

| Option | Description | Selected |
|--------|-------------|----------|
| Migration scope & TS conversion | Scaffold vs big-bang code move; .mjs kept vs .ts conversion | ✓ |
| Test migration tactic | 48 node:test files → vitest; rewrite vs shim vs dual-runner | ✓ |
| Distribution model | Single published tarball (bundled) vs multi-package npm | ✓ |
| CI changed-only implementation | pnpm --filter vs paths filter vs turbo/nx | ✓ |

**User's choice:** All four areas selected.

---

## Migration Scope & TS Conversion

| Option | Description | Selected |
|--------|-------------|----------|
| Scaffold-only (Recommended) | 4 empty packages, root lib/bin/tests untouched, migration deferred to Phase 34+ | ✓ |
| Full move, stay .mjs | Move 36 modules to packages/cds-cli/src/*.mjs, keep JS, use allowJs | |
| Full move + TS conversion | Move + convert everything to .ts in one phase — high risk, huge scope | |
| Hybrid skeleton + pilot move | Scaffold + 1-2 module TS pilot as proof-of-concept | |

**User's choice:** Scaffold-only.
**Notes:** Low risk, preserves 928/931 test baseline, fits single-phase scope. Real migration happens Phase 34+ per module as code actually needs to be touched.

---

## Test Runner Conflict Resolution

**Context:** With scaffold-only, root tests/ stays on node:test, but MONO-03 requires vitest + "928 tests port over with zero behavior change". How to resolve?

| Option | Description | Selected |
|--------|-------------|----------|
| Dual runner: node:test + vitest | Run both in `pnpm test`; reframe MONO-03 to allow node:test legacy in tests/ | |
| vitest with node:test compat (Recommended) | vitest runs existing tests/*.test.mjs after import swap, globals:true config | ✓ |
| Rewrite tests/ on vitest syntax | Full assert→expect + describe/it rewrite, clean but huge diff | |

**User's choice:** vitest with node:test compat.
**Notes:** Minimum diff across 48 files (imports + occasional assertion rewrites), keeps MONO-03 satisfied without wholesale rewrite. Test bodies untouched.

---

## Distribution Model

| Option | Description | Selected |
|--------|-------------|----------|
| Private @cds/* + bundle root (Recommended) | All 4 packages `"private": true`, root stays single published tarball | ✓ |
| Public @claude-dev-stack/* packages | Publish all 4 as real npm scoped packages, root becomes meta-pkg | |
| Defer decision to Phase 39 | Set `"private": true` now with no final posture decision | |

**User's choice:** Private @cds/* + bundle root.
**Notes:** Preserves `npx claude-dev-stack` invariant, option-open for future external consumption (flip private→public via rename sweep), no scope reservation overhead now. Bundler selection (tsup vs esbuild) deferred to Phase 39 when real code lives in packages/*/dist/.

---

## CI Changed-Only Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm --filter native (Recommended) | `pnpm --filter '...[origin/main]'` uses pnpm's built-in affected detection | ✓ |
| Always run all | Skip changed-only in Phase 33 — packages are empty, no benefit | |
| paths-filter + pnpm filter hybrid | dorny/paths-filter for root + pnpm filter for packages, maximum efficiency | |

**User's choice:** pnpm --filter native.
**Notes:** Zero added deps, accurate dep graph traversal, requires `fetch-depth: 0` in checkout. Root tests/ guarded separately with paths-filter (not a workspace package) — hybrid-ish but only one external action dep.

---

## Readiness Check

**Question:** Ready for CONTEXT.md or more questions?

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for CONTEXT.md (Recommended) | Remaining tsconfig/scripts/bundler questions are Claude's discretion at planning time | ✓ |
| Discuss tsconfig/scripts/bundler | One more round on base config and test script composition | |
| Chat — have a question | Freeform follow-up | |

**User's choice:** Ready for CONTEXT.md.

---

## Claude's Discretion

- `tsconfig.base.json` compiler options (exact values: module target, moduleResolution strategy, strict mode nuance)
- Stub `src/index.ts` shape per package (placeholder export + JSDoc)
- Sanity test shape per package (trivial `expect(true).toBe(true)` vs slightly more meaningful)
- Root vs workspace harness for `tests/` directory
- Root `package.json` `scripts` final composition

## Deferred Ideas

- **Phase 34:** First TS port pilot (`lib/shared.mjs` → `@cds/core/src/shared.ts`), adr-bridge SDK refactor path
- **Phase 39:** Bundler choice (tsup/esbuild/tsc+rollup), public-vs-private posture revisit for `@cds/*`
- **v1.1+:** `.planning/` location migration, config system overhaul, teams v2

---

*Generated: 2026-04-16*
