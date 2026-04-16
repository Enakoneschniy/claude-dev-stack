---
phase: 37
slug: mcp-adapter
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-16
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6+ (matches Phase 33 MONO-03 baseline) |
| **Config file** | `packages/cds-cli/vitest.config.ts` (extends root shared config from Phase 33) |
| **Quick run command** | `pnpm --filter @cds/cli vitest run --reporter=default` |
| **Full suite command** | `pnpm test` (runs all packages) |
| **Estimated runtime** | ~8 seconds for cds-cli only, ~25s full monorepo |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cds/cli vitest run src/mcp-tools/<file>.test.ts --reporter=default`
- **After every plan wave:** Run `pnpm --filter @cds/cli vitest run`
- **Before `/gsd-verify-work`:** `pnpm test` full suite must be green
- **Max feedback latency:** 10 seconds for targeted file, 25s full package

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | MCP-01 | — | N/A — dependency add | unit | `pnpm --filter @cds/cli test src/mcp-server.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 1 | MCP-01 | — | Server starts without throwing on missing optional deps | unit | `pnpm --filter @cds/cli test src/mcp-server.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-03 | 01 | 1 | MCP-01 | — | ListTools returns 5 tools with valid schemas | integration | `pnpm --filter @cds/cli test src/mcp-server.integration.test.ts` | ❌ W0 | ⬜ pending |
| 37-02-01 | 02 | 2 | MCP-01 | — | FTS5 search rejects malformed MATCH with InvalidFilterError | unit | `pnpm --filter @cds/cli test src/mcp-tools/sessions-search.test.ts` | ❌ W0 | ⬜ pending |
| 37-02-02 | 02 | 2 | MCP-01 | — | Timeline respects window clamps (max 20 each side) | unit | `pnpm --filter @cds/cli test src/mcp-tools/sessions-timeline.test.ts` | ❌ W0 | ⬜ pending |
| 37-02-03 | 02 | 2 | MCP-01 | — | get_observations ids array clamped to 50, missing IDs silently dropped | unit | `pnpm --filter @cds/cli test src/mcp-tools/sessions-get-observations.test.ts` | ❌ W0 | ⬜ pending |
| 37-03-01 | 03 | 2 | MCP-01 | T-37-01 | Path traversal (`..`, absolute, `~/...`) rejected at tool input | unit | `pnpm --filter @cds/cli test src/mcp-tools/docs-search.test.ts` | ❌ W0 | ⬜ pending |
| 37-03-02 | 03 | 2 | MCP-01 | — | rg missing → POSIX grep fallback produces identical shape | unit | `pnpm --filter @cds/cli test src/mcp-tools/docs-search.test.ts` | ❌ W0 | ⬜ pending |
| 37-03-03 | 03 | 2 | MCP-01 | — | planning.status lenient parser: malformed sections return partial shape | unit | `pnpm --filter @cds/cli test src/mcp-tools/planning-status.test.ts` | ❌ W0 | ⬜ pending |
| 37-03-04 | 03 | 2 | MCP-01 | — | planning.status on missing .planning/ throws NotAGsdProjectError | unit | `pnpm --filter @cds/cli test src/mcp-tools/planning-status.test.ts` | ❌ W0 | ⬜ pending |
| 37-04-01 | 04 | 3 | MCP-02 | T-37-02 | cli `mcp serve` routes to new server; other mcp subcommands route to catalog | unit | `pnpm --filter @cds/cli test src/cli-dispatch.test.ts` (plus integration via bin/cli.mjs) | ❌ W0 | ⬜ pending |
| 37-04-02 | 04 | 3 | MCP-02 | — | Wizard adds mcp.servers.cds idempotently (2nd run no-op) | unit | `pnpm --filter @cds/cli test src/install-mcp.test.ts` | ❌ W0 | ⬜ pending |
| 37-04-03 | 04 | 3 | MCP-02 | — | Wizard preserves user-added mcp.servers.* entries untouched | unit | `pnpm --filter @cds/cli test src/install-mcp.test.ts` | ❌ W0 | ⬜ pending |
| 37-04-04 | 04 | 3 | MCP-02 | — | Corrupt settings.json is skipped with warning (no clobber) | unit | `pnpm --filter @cds/cli test src/install-mcp.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-cli/vitest.config.ts` — extends root shared vitest config (created in Phase 33 MONO-03)
- [ ] `packages/cds-cli/src/mcp-tools/__fixtures__/build-sessions-db.ts` — fixture DB builder (shared across sessions-* tests)
- [ ] `packages/cds-cli/src/mcp-tools/__fixtures__/vault-tree.ts` — fixture vault directory builder (shared across docs.search + planning.status tests)
- [ ] `packages/cds-cli/src/mcp-tools/__fixtures__/sample.db` — checked-in small fixture DB for integration test (OR built on-the-fly — planner decides)
- [ ] `CDS_TEST_VAULT` env var honored by shared path-resolution helpers — avoids writes to real `~/vault`

*If none: "Existing infrastructure covers all phase requirements."* — NOT the case here, Wave 0 infrastructure needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end `cds mcp serve` invoked by real Claude Code session | MCP-01 | Requires running Claude Code client with `.claude/settings.json` pointing at our server; cannot be automated in our test harness | 1. Install via wizard on a project. 2. Open Claude Code in that project. 3. In a chat, ask Claude to use `sessions.search("test")`. 4. Verify structured results returned. Document outcome in `37-VERIFICATION.md`. |
| Wizard re-run idempotency on a real configured project | MCP-02 | Automated test uses synthetic settings.json; real project verification adds confidence | Run wizard twice on the same project. Diff `.claude/settings.json` between runs → zero lines differ. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixture builders + env override)
- [ ] No watch-mode flags (all tests use `vitest run`, not `vitest`)
- [ ] Feedback latency < 10s per file, 25s full suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (auto-approved on plan-checker PASS)
