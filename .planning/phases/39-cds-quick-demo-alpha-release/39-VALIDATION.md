---
phase: 39
slug: cds-quick-demo-alpha-release
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-16
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1+ (matches Phase 33 MONO-03 baseline) |
| **Package test configs** | `packages/cds-cli/vitest.config.ts` (extends root shared config from Phase 33) |
| **Root test runner** | `pnpm -w vitest run --project root` (existing Phase 33 workspace config) |
| **Quick run command** | `pnpm --filter @cds/cli vitest run --reporter=default` for CLI tests; `pnpm -w vitest run --project root` for root integration tests |
| **Full suite command** | `pnpm test` (runs all packages + root) |
| **Estimated runtime** | ~4 seconds for cds-cli only, ~5 seconds for root tests, ~35s full monorepo |
| **Real-SDK gate** | `INTEGRATION=1` env var enables the single live-Haiku smoke test in `packages/cds-cli/src/quick.integration.test.ts` |
| **Vault isolation** | `CDS_TEST_VAULT` env var set by every test `beforeEach` to a `mkdtempSync`'d path; production code path-resolves vault root from `process.env.CDS_TEST_VAULT ?? homedir() + '/vault'` |
| **Bundler build command** | `pnpm tsup` (produces `dist/`) |
| **Tarball check command** | `pnpm pack --dry-run --json` + size assertion |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <pkg> vitest run src/<file>.test.ts --reporter=default` (per-file) OR `pnpm -w vitest run --project root tests/<file>.test.mjs` for root tests.
- **After every plan wave:** Run the targeted package/root suite.
- **Before `/gsd-verify-work`:** `pnpm test && pnpm tsup && pnpm pack --dry-run` must all succeed.
- **Max feedback latency:** 10 seconds for targeted file, 35s full suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | RELEASE-01 | — | `tsup.config.ts` declares three externals; no accidental bundling | unit | `pnpm -w vitest run --project root tests/tsup-config.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | RELEASE-01 | — | `pnpm tsup` produces `dist/cli/quick.js`, `dist/cli/mcp-server.js`, `dist/migrate/cli.js`, `dist/core/index.js` | unit | `pnpm -w vitest run --project root tests/tsup-build.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | RELEASE-01 | — | Root `package.json` version is `1.0.0-alpha.1` + `engines.node >= 20` + externals in dependencies | unit | `pnpm -w vitest run --project root tests/version-bump.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-04 | 01 | 1 | RELEASE-01 | — | `"files"` array contains `dist/` but NOT `packages/`; `.planning/` never in tarball | unit | `pnpm -w vitest run --project root tests/pack-files-array.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-05 | 01 | 1 | RELEASE-01 | — | `pnpm pack --json` tarball size < 5 MB | unit | `pnpm -w vitest run --project root tests/pack-size.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-06 | 01 | 1 | RELEASE-01 | — | `bin/cli.mjs` routes `case 'mcp'` (serve), `case 'migrate'`, `case 'quick'` to `dist/*/*.js`; `CDS_DEV=1` routes to `packages/*/dist/` | unit | `pnpm -w vitest run --project root tests/cli-dispatch.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-07 | 01 | 1 | RELEASE-01 | — | No remaining `node: 18` or `"node": ">=18"` strings in config files or workflows (D-128) | unit | `pnpm -w vitest run --project root tests/node-version-scan.test.mjs` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | DEMO-01 | — | `quick.ts main()` parses args, calls dispatchAgent with haiku default, honors `--model` override | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "arg parsing"` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 2 | DEMO-01 | — | `--json` mode produces `{ output, cost, sessionId }` JSON to stdout | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "json output"` | ❌ W0 | ⬜ pending |
| 39-02-03 | 02 | 2 | DEMO-01 | — | Text mode prints result then cost footer `── cost: $X.XXXX · session: <uuid>` | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "text output"` | ❌ W0 | ⬜ pending |
| 39-02-04 | 02 | 2 | DEMO-01 | — | Claude Code context (CLAUDE_SESSION_ID set): skips captureStandalone | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "claude-code path"` | ❌ W0 | ⬜ pending |
| 39-02-05 | 02 | 2 | DEMO-01 | — | Standalone context (no CLAUDE_SESSION_ID): writes synthetic transcript AND spawns capture wrapper | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "standalone capture"` | ❌ W0 | ⬜ pending |
| 39-02-06 | 02 | 2 | DEMO-01 | — | Empty task arg → prints usage to stderr, exits 1 | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "usage"` | ❌ W0 | ⬜ pending |
| 39-02-07 | 02 | 2 | DEMO-01 | — | dispatchAgent throw → prints error + cost partial, exits 1 | unit | `pnpm --filter @cds/cli vitest run src/quick.test.ts -t "error handling"` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 2 | DEMO-01 | — | `skills/cds-quick/SKILL.md` frontmatter has `name: cds-quick` + `description` + `trigger_phrases` | unit | `pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs` | ❌ W0 | ⬜ pending |
| 39-03-02 | 03 | 2 | DEMO-01 | — | Skill body references `claude-dev-stack quick` CLI command | unit | `pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs -t "cli reference"` | ❌ W0 | ⬜ pending |
| 39-04-01 | 04 | 3 | RELEASE-01 | — | `docs/migration-v0-to-v1-alpha.md` exists with required headings (Quick checklist, Breaking Changes, Rollback) | unit | `pnpm -w vitest run --project root tests/migration-guide.test.mjs` | ❌ W0 | ⬜ pending |
| 39-04-02 | 04 | 3 | RELEASE-01 | — | Migration guide mentions Node 20+ requirement, `session-end-capture` hook name, SQLite dep | unit | `pnpm -w vitest run --project root tests/migration-guide.test.mjs -t "breaking changes content"` | ❌ W0 | ⬜ pending |
| 39-04-03 | 04 | 3 | RELEASE-01 | — | Wizard Node check aborts install when Node < 20 | unit | `pnpm -w vitest run --project root tests/install-node-check.test.mjs` | ❌ W0 | ⬜ pending |
| 39-04-04 | 04 | 3 | RELEASE-01 | — | Wizard detects existing `session-end-check.sh` registration and prompts for replacement | unit | `pnpm -w vitest run --project root tests/install-hook-migration.test.mjs` | ❌ W0 | ⬜ pending |
| 39-04-05 | 04 | 3 | RELEASE-01 | — | `CHANGELOG.md` has 1.0.0-alpha.1 entry with Added/Changed/Security sections | unit | `pnpm -w vitest run --project root tests/changelog.test.mjs` | ❌ W0 | ⬜ pending |
| 39-05-01 | 05 | 4 | RELEASE-01 | — | `.github/workflows/publish.yml` has prerelease-detection step + dist-tag output | unit | `pnpm -w vitest run --project root tests/publish-workflow.test.mjs` | ❌ W0 | ⬜ pending |
| 39-05-02 | 05 | 4 | RELEASE-01 | — | Publish step uses `--tag ${{ steps.meta.outputs.tag }}` + `--provenance` + `--access public` | unit | `pnpm -w vitest run --project root tests/publish-workflow.test.mjs -t "publish step"` | ❌ W0 | ⬜ pending |
| 39-05-03 | 05 | 4 | RELEASE-01 | — | Workflow preserves `id-token: write` OIDC permission | unit | `pnpm -w vitest run --project root tests/publish-workflow.test.mjs -t "oidc"` | ❌ W0 | ⬜ pending |
| 39-05-04 | 05 | 4 | RELEASE-01 | — | Pre-flight steps: `pnpm install`, `pnpm tsup`, `pnpm test`, `pnpm pack --dry-run`, smoke install | unit | `pnpm -w vitest run --project root tests/publish-workflow.test.mjs -t "preflight"` | ❌ W0 | ⬜ pending |
| 39-05-05 | 05 | 4 | RELEASE-01 | — | GitHub release notes template doc exists at `docs/release-notes-template.md` | unit | `pnpm -w vitest run --project root tests/release-notes-template.test.mjs` | ❌ W0 | ⬜ pending |
| 39-05-06 | 05 | 4 | DEMO-01 + RELEASE-01 | — | End-to-end: live Haiku + standalone `/cds-quick` writes session row to temp vault DB | integration | `INTEGRATION=1 pnpm --filter @cds/cli vitest run src/quick.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-cli/vitest.config.ts` — extends root shared vitest config (created in Phase 33 MONO-03). If already present, re-use as-is.
- [ ] `packages/cds-cli/tests/fixtures/synthetic-transcript.jsonl` — reference 2-message transcript fixture for quick.test.ts to assert `writeSyntheticTranscript` output shape against.
- [ ] `packages/cds-cli/tests/helpers/mock-dispatch-agent.ts` — shared mock of `@cds/core/dispatchAgent` returning pre-canned `{ output, tokens }` keyed by prompt sha256. Re-uses Phase 38's pattern if already created.
- [ ] `packages/cds-cli/tests/helpers/temp-home.ts` — per-test `mkdtempSync` setup for HOME dir + teardown; quick.test.ts uses to verify synthetic transcript path.
- [ ] `tests/helpers/read-package-json.mjs` — utility that imports repo-root package.json via fs.readFile (not require) for version assertions.
- [ ] Phase 34 `dispatchAgent` and `CostTracker` are live on disk (Plan 02 verifies; fails loud with STATE.md blocker if not).
- [ ] Phase 36 `hooks/session-end-capture.sh` + `.mjs` are live on disk (Plan 02 verifies for captureStandalone; fails loud with STATE.md blocker if not).
- [ ] Phase 37 `packages/cds-cli/src/mcp-server.ts` is live on disk (Plan 01 verifies for tsup entry; fails loud with STATE.md blocker if not).
- [ ] Phase 38 `packages/cds-migrate/src/cli.ts` is live on disk (Plan 01 verifies for tsup entry; fails loud with STATE.md blocker if not).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| npm publish actually publishes under `@alpha` dist-tag | RELEASE-01 | Requires npm registry write + OIDC session. Done via GitHub release creation UI. | 1. Merge phase PR. 2. Create GitHub release with tag `v1.0.0-alpha.1`, MUST check "Set as pre-release". 3. Wait for publish.yml to complete. 4. Verify: `npm dist-tag ls claude-dev-stack` shows `alpha: 1.0.0-alpha.1` + `latest: 0.12.1` (or latest 0.12.x). 5. Verify: `npm info claude-dev-stack@alpha version` → `1.0.0-alpha.1`. 6. Verify: `npm info claude-dev-stack@latest version` → `0.12.x` (unchanged). Document in `39-VERIFICATION.md`. |
| `npm install -g claude-dev-stack@alpha` works on clean machine | DEMO-01 + RELEASE-01 | Requires clean Node 20+ install, not available in CI matrix without major setup. | 1. On a clean VM or Docker container with Node 20: `npm install -g claude-dev-stack@alpha`. 2. `claude-dev-stack --version` → `1.0.0-alpha.1`. 3. `claude-dev-stack quick "explain what this repo does" --json` → valid JSON with `output`, `cost`, `sessionId`. 4. Confirm `~/.claude/projects/.../{sessionId}.jsonl` was written. 5. (INTEGRATION) Verify session row in `~/vault/projects/<basename>/sessions.db`. Document in `39-VERIFICATION.md`. |
| `/cds-quick "summarize current planning state"` from inside Claude Code | DEMO-01 (ROADMAP SC#1) | Requires real Claude Code session + real Haiku API. | 1. Open Claude Code in claude-dev-stack project. 2. Run `/cds-quick "summarize current planning state"`. 3. Claude invokes Bash tool → `claude-dev-stack quick "..." --json`. 4. Result summary + cost block visible in Claude Code. 5. Close session. 6. Verify the Stop hook captured the session into sessions.db (observations table has rows for the just-ended session). 7. `sessions.search('planning')` via MCP returns the session. Document in `39-VERIFICATION.md`. |
| Migration guide readability | RELEASE-01 (SC#3) | Requires human review. | 1. Read `docs/migration-v0-to-v1-alpha.md` cover to cover. 2. Verify "Quick checklist" is <2 min read. 3. Verify every breaking change in the detail section has: what / why / what-to-do triplet. 4. Verify rollback instructions work on test machine: `npm install -g claude-dev-stack@latest` reverts to 0.12.x. Document feedback in `39-VERIFICATION.md`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixtures, mocks, helpers)
- [ ] No watch-mode flags (all tests use `vitest run`, not `vitest`)
- [ ] Feedback latency < 10s per file, 35s full suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (auto-approved on plan-checker PASS)
