---
phase: 33
slug: monorepo-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
notes: Wave 0 items are self-satisfied by Plan 01 (workspace/package/tsconfig/vitest-config creation) and Plan 03 (sanity test files). Approved for plan execution 2026-04-16.
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (replaces `node:test`) |
| **Config file** | `vitest.config.ts` (root) + per-package `vitest.config.ts` (optional, extends root) |
| **Quick run command** | `pnpm -w vitest run --project root` (root tests only) |
| **Full suite command** | `pnpm test` (all packages + root via `test.projects`) |
| **Estimated runtime** | ~45 seconds (928 root tests + ~1s per empty-package sanity tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -w vitest run --project root` (fast, validates test-migration tasks don't break anything)
- **After every plan wave:** Run `pnpm test` (full suite including package sanity tests)
- **Before `/gsd-verify-work`:** Full suite must be green across Node 18/20/22 locally (or trust CI to validate cross-version)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Fleshed out by planner during Step 8 — each task row filled when plan is generated. Template below.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 0 | MONO-01 | — | workspace file parses | structural | `test -f pnpm-workspace.yaml && pnpm install --frozen-lockfile=false` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 0 | MONO-01 | — | 4 packages scaffolded | structural | `for p in cds-core cds-cli cds-migrate cds-s3-backend; do test -d packages/$p/src; done` | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 1 | MONO-02 | — | composite build succeeds | build | `pnpm tsc --build --dry` exits 0 | ❌ W0 | ⬜ pending |
| 33-02-02 | 02 | 1 | MONO-02 | — | ESM declarations emitted | build | `test -f packages/cds-core/dist/index.d.ts` after `pnpm tsc --build` | ❌ W0 | ⬜ pending |
| 33-03-01 | 03 | 2 | MONO-03 | — | vitest runs existing tests | test | `pnpm -w vitest run --project root 2>&1 \| tee /tmp/vt.log; grep -qE "928 passed" /tmp/vt.log && grep -qE "3 failed" /tmp/vt.log` (strict baseline: 928 passing + 3 pre-existing detect.test.mjs failures preserved per D-06) | ❌ W0 | ⬜ pending |
| 33-03-02 | 03 | 2 | MONO-03 | — | per-package sanity test runs | test | `pnpm -w vitest run --project cds-core` exits 0 | ❌ W0 | ⬜ pending |
| 33-04-01 | 04 | 3 | MONO-04 | — | CI workflow valid YAML | structural | `cat .github/workflows/ci.yml \| yq '.jobs'` succeeds | ❌ W0 | ⬜ pending |
| 33-04-02 | 04 | 3 | MONO-04 | — | CI fires on push with matrix | runtime | Pushed feature branch triggers matrix `[node 18, 20, 22] × [packages-job, root-tests-job]` (observable via GitHub Actions UI) | ❌ W0 | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — root test projects config (supports `test.projects` for multi-workspace sampling)
- [ ] `tsconfig.base.json` — shared TS compiler options (composite, declaration, ESM NodeNext)
- [ ] `pnpm-workspace.yaml` — declares `packages/*`
- [ ] `packages/cds-core/src/index.test.ts`, `packages/cds-cli/src/index.test.ts`, `packages/cds-migrate/src/index.test.ts`, `packages/cds-s3-backend/src/index.test.ts` — sanity tests (trivial) that prove vitest runs in each workspace
- [ ] `devDependencies` installed: `vitest@4.1.4`, `typescript@latest`, `@types/node@latest`, `pnpm@latest`
- [ ] Corepack/packageManager field in root package.json pins pnpm version

*Every verification task depends on Wave 0 items being in place.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Actions matrix fires correctly on push | MONO-04 SC#4 | Requires live PR/push; cannot be verified locally without ACT or equivalent | Push branch `gsd/phase-33-monorepo-foundation` → verify Actions UI shows 3 workflow jobs; packages-job and root-tests-job each spawn 3 matrix runs (Node 18/20/22) = 6 total runs, all green |
| `pnpm --filter '...[origin/main]'` correctly skips unchanged packages | MONO-04 SC#4 | Requires live PR with scoped changes to observe skip behavior | Modify only `packages/cds-core/src/index.ts` on a branch → CI should run only cds-core job, not cds-cli/migrate/s3-backend |
| `npx claude-dev-stack --version` still works unchanged for v0.12.x users | Implicit from CONTEXT.md D-03 (no breaking changes) | Requires tarball pack + install test | `npm pack && npm install -g ./claude-dev-stack-*.tgz && claude-dev-stack --help` exits 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest config, tsconfig, workspace file)
- [ ] No watch-mode flags in CI or automated commands
- [ ] Feedback latency < 60s for quick run
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills verification map

**Approval:** pending
