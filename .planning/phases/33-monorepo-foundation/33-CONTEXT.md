# Phase 33: Monorepo Foundation - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert single-package repository into a pnpm workspaces monorepo with TypeScript project references and vitest, **without migrating existing feature code**. Deliverables:

- `pnpm-workspace.yaml` declaring `packages/cds-core/`, `packages/cds-cli/`, `packages/cds-migrate/`, `packages/cds-s3-backend/`
- 4 scaffolded packages with `package.json` (private `@cds/*` names), `tsconfig.json` (solution-style references), `src/` stub + vitest sanity test per package
- Root `tsconfig.base.json` + root `tsconfig.json` solution file with references to all packages
- Root vitest config running both existing `tests/*.test.mjs` (via node:test compat) and per-package tests
- GitHub Actions workflow: Node 18/20/22 matrix using `pnpm --filter '...[origin/main]'` native affected detection
- `pnpm install`, `pnpm tsc --build`, `pnpm test` all green with existing 928/931 tests preserved

**Explicitly NOT in scope for Phase 33** (deferred to Phase 34+):
- Moving `lib/*.mjs` → `packages/cds-cli/src/`
- Converting `.mjs` → `.ts`
- Rewriting tests to vitest idioms (we keep assertions; only imports change)
- Introducing bundler (tsup/esbuild)
- Publishing config beyond `"private": true` posture
- Any new runtime behavior

</domain>

<decisions>
## Implementation Decisions

### Migration Scope (D-01 … D-03)
- **D-01:** Phase 33 is **scaffold-only**. Root `lib/`, `bin/`, `tests/`, `hooks/`, `skills/`, `templates/` stay exactly as today (36 lib modules, 13 install submodules, 48 test files, 335-line `bin/install.mjs`). The 4 new `packages/*/src/` directories contain only stubs + one sanity test each. Real feature-code migration is Phase 34+.
- **D-02:** All migrated code will stay `.mjs` → `.ts` decision is pushed to Phase 34 per module. Phase 33 does not perform any conversion; TS is only used in new scaffold stubs inside `packages/*/src/*.ts`.
- **D-03:** `bin/cli.mjs` remains the published entry point at `package.json` `"bin"`. Root `package.json` keeps `"name": "claude-dev-stack"` and `"files"` array unchanged. No breaking changes for `npx claude-dev-stack` users.

### Test Runner (D-04 … D-06)
- **D-04:** vitest becomes the single test runner across root + packages. Existing `tests/*.test.mjs` stay where they are — we add `vitest.config.ts` that matches `tests/**/*.test.mjs` + `packages/*/src/**/*.test.ts`.
- **D-05:** Migration tactic = **node:test compat**. Every `tests/*.test.mjs` file gets its imports swapped from `node:test` / `node:assert/strict` to vitest. Use `vitest`'s `describe`, `it`, `expect` (or `globals: true` config). Assertion-by-assertion changes only where `assert.deepStrictEqual`/`assert.throws` have different vitest equivalents. Target: zero test body rewrites, only import + assertion surface changes.
- **D-06:** MONO-03's literal "zero behavior change" is interpreted as: every test currently passing on `node --test` must pass on vitest after migration. The 3 pre-existing `detect.test.mjs` failures stay untouched (as per REQUIREMENTS `Test baseline`).

### Distribution Posture (D-07 … D-09)
- **D-07:** All 4 `packages/*/package.json` are `"private": true` with names `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`. They are **never published to npm** — internal workspace deps only.
- **D-08:** Root `claude-dev-stack` remains the single public npm artifact. In Phase 39 (alpha release), a bundler will inline internal `@cds/*` deps into one tarball. Bundler choice (tsup vs esbuild vs raw tsc+rollup) deferred to Phase 39 discuss-phase.
- **D-09:** If downstream phases (34+) later need external consumption of `@cds/core` primitives, we revisit D-07 at that phase boundary — NOT retroactively in Phase 33. Option-open is preserved: private scope can flip to public with a rename sweep only.

### CI Strategy (D-10 … D-12)
- **D-10:** CI uses pnpm native affected detection: `pnpm --filter '...[origin/main]' run <task>` for packages. Requires GitHub Actions `actions/checkout@v4` with `fetch-depth: 0` to resolve `origin/main`.
- **D-11:** Root `tests/*.test.mjs` are not in any workspace package, so their run is guarded separately via `dorny/paths-filter@v4` watching `lib/**`, `bin/**`, `hooks/**`, `tests/**`, `package.json`, `pnpm-lock.yaml`. When any of those change, CI runs `pnpm -w vitest run --project root` as an additional job. When only `packages/**` change, root-tests-job is skipped.
- **D-12:** Matrix = `[node 18, 20, 22] × [packages-job, root-tests-job]`. Both jobs cache pnpm store via `actions/setup-node@v4` `cache: 'pnpm'`. Fails build on any TS error or test failure. Replaces existing `.github/workflows/ci.yml` in place (not duplicated).

> **Correction note (2026-04-16, during plan-phase verification):** The original discuss-phase draft of D-11 said `@v3` and D-12 referenced `test.yml`. Both were factual errors in auto-filled values. Real existing workflow filename is `.github/workflows/ci.yml` (verified), and `dorny/paths-filter@v4.0.1` is current stable (per RESEARCH.md §Supporting Stack). Corrections do not change the intent of the decisions — only the factual values they were pointing at.

### Claude's Discretion
- Exact `tsconfig.base.json` compiler options: ESM output (`"module": "ES2022"`, `"moduleResolution": "Bundler"`), strict mode on (`"strict": true`), `"declaration": true`, `"composite": true`. Final values left to planner.
- Structure of stub `src/index.ts` per package: one placeholder named export + JSDoc describing phase-34+ intent. Planner decides exact stub shape.
- One-sanity-test per package: a trivial `expect(true).toBe(true)` in `src/index.test.ts` just to prove vitest runs in each workspace. Planner may design something slightly more meaningful.
- Whether root `tests/` directory becomes a workspace "test-harness" package or stays ambient — planner decides based on what produces less churn.
- `package.json` root `scripts` composition: `"test": "pnpm -r run test && vitest run tests/"` (or equivalent). Planner picks exact invocation.

### Folded Todos

None — phase-matched todo count was 0. Open questions from PROJECT.md (SDK license, SQLite driver) already belong to Phase 34/35 respectively and stay there.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §MONO-01..04 — acceptance criteria, what "zero behavior change" means for test suite
- `.planning/ROADMAP.md` §"Phase 33: Monorepo Foundation" — Success Criteria 1-4 + Risks
- `.planning/PROJECT.md` §Current Milestone + §Constraints — npx/single-dep constraints (prompts stays CLI-only, SDK is internal infra), ESM-only, Node 18+, commit style

### Plan & Seed Sources
- `vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md` §D-28 Phase A scope — package layout + rationale for 4-package split
- `.planning/seeds/SEED-004-tiered-vault-sessions-auto-capture.md` — why this milestone; context on why `cds-core` primitives matter downstream (Phase 34)

### State & Prior Context
- `.planning/STATE.md` §"Current Position" + §"Critical Risks" — test baseline 928/931, locked decisions, Known Gaps carried from v0.12
- `.planning/codebase/STRUCTURE.md` — directory layout (note: `.planning/codebase/*.md` predates v0.12 refactors; verify `bin/install.mjs` is 335 lines today, NOT 1287 as written)
- `.planning/codebase/STACK.md`, `.planning/codebase/TESTING.md`, `.planning/codebase/CONVENTIONS.md` — read before touching CI / test runner config

### Prior Phase Context (Phases 19–32)
- v0.12 milestone (Phases 19–32) closed 2026-04-16. Key carryovers relevant to Phase 33:
  - `.planning/milestones/v0.12-ROADMAP.md` — branching strategy enforcement (D-11 reinforces `phase` → `gsd/phase-{N}-{slug}` + PR-only)
  - Memory feedback: `branching_strategy must stay "phase"`, `PR-only merge to main`, `No Co-Authored-By`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (stay at root in Phase 33, migrated in Phase 34+)
- `lib/shared.mjs` — colors, prompts wrappers, path helpers. First candidate for `@cds/core` migration in Phase 34.
- `bin/cli.mjs` — main command router; stays as published entry point, will later become a shim that imports from `packages/cds-cli/dist/`.
- `bin/install.mjs` (335 lines, not 1287 — refactored v0.10) + `lib/install/` 13 submodules (claude-md, components, detect, git-conventions, gsd, hooks, notebooklm, plugins, prereqs, profile, projects, skills, summary, vault). Future home: `@cds/cli`.

### Established Patterns (to preserve)
- ESM-only (`"type": "module"`), `.mjs` files with shebang in `bin/`
- Tests use `node:test` + `node:assert/strict`; 48 files at time of writing
- Single runtime dep (`prompts@^2.4.2`) — Phase 33 does NOT add any new runtime dep except devDeps: `vitest`, `typescript`, `@types/node`, `pnpm` (tooling-level, not shipped)
- Conventional Commits, No Co-Authored-By, English code / Russian comms

### Integration Points
- `package.json` root — `"workspaces"`-style field not used today; will add `pnpm-workspace.yaml` sibling file
- `.github/workflows/ci.yml` — replace in place, don't duplicate
- `.github/workflows/publish.yml` — untouched in Phase 33 (publish pipeline changes come with Phase 39 alpha)
- Root `package.json` `"files"` array controls what npm tarball ships — **must NOT change in Phase 33** so v0.12.x users on `@latest` keep working if a hotfix is needed mid-v1.0 development

### Constraints to Factor Into Planning
- `better-sqlite3` native compile will come in Phase 35; don't pre-install it in Phase 33 even as devDep
- No `allowJs` cross-boundary hacks in packages — stubs are pure `.ts`
- Root `bin/cli.mjs` must keep working via plain `node` (no TS transpile needed at runtime) until Phase 39 bundling

</code_context>

<specifics>
## Specific Ideas

- Test migration tactic is deliberately the **least invasive** reading of MONO-03 — the user chose `vitest with node:test compat` to avoid rewriting 48 test files and 928 assertions. Planner should honor this: imports change, bodies do not.
- Distribution posture is "option-preserving": `"private": true` + `@cds/` scope means if Phase 39 decides to flip to public, we only rename imports + remove `private` flag + claim scope. No architectural lock-in today.
- CI strategy split (packages via `pnpm --filter`, root tests via `paths-filter`) is intentional — it keeps root `tests/` alive without forcing it into a pseudo-workspace-package that would muddy the migration story in Phase 34.

</specifics>

<deferred>
## Deferred Ideas

### For Phase 34 (SDK Integration & Core Primitives)
- First real file migrations: `lib/shared.mjs` → `packages/cds-core/src/shared.ts` as TS port pilot. Validates the project-reference build end-to-end.
- `lib/adr-bridge-session.mjs` refactor — replaces `claude -p` subprocess with `dispatchAgent` from `@cds/core`. This closes v0.12 ADR-02 Known Gap (but via Phase 36, not 34).

### For Phase 39 (Alpha Release)
- **Bundler choice**: tsup vs esbuild vs tsc+rollup. Evaluate when real code lives in `packages/*/dist/` and tarball size becomes measurable.
- **Publishing posture revisit**: if external consumers (other projects) want to `import { dispatchAgent } from '@cds/core'`, flip `@cds/*` from `private: true` to public + scope claim. Decision deferred until alpha-feedback phase.

### Out of Scope (v1.1+)
- `.planning/` location migration out of project repos (Refactor #1 in plan doc)
- Teams / parallel execute v2 (Refactor #3)
- Config system `cds.config.json` overhaul (Refactor #5)

### Reviewed Todos (not folded)

None — `todo match-phase 33` returned zero matches. Outstanding session todos (SDK license check, SQLite driver, NotebookLM recursive scan bug, `detect.test.mjs` pre-existing failures) belong to later phases or dedicated quick tasks per STATE.md carry-over.

</deferred>

---

*Phase: 33-monorepo-foundation*
*Context gathered: 2026-04-16*
