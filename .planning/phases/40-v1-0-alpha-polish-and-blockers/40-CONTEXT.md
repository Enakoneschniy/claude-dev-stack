# Phase 40 Context

**Phase:** 40 — v1.0 Alpha Implementation Polish
**Mode:** auto-discussion (decisions inferred from ROADMAP scope + Phase 39 outcomes + scout)
**Created:** 2026-04-16
**Source:** ROADMAP.md `### Phase 40`

## Goal recap

Close all implementation blockers for v1.0.0-alpha.1 release. After this phase the codebase is ready for the formal UAT cycle in Phase 41 (sandbox + verify-work).

Implementation only — testing/UAT is explicitly out of scope (lives in Phase 41).

## Canonical refs

- `.planning/ROADMAP.md` — Phase 40 + Phase 41 entries
- `.planning/REQUIREMENTS.md` — RELEASE-01 + carried v0.12 detect.test gap
- `.planning/phases/39-cds-quick-demo-alpha-release/39-*-SUMMARY.md` — what just shipped + 4 deviations log
- `.planning/phases/999.2-cc-2-1-subagent-permission-hardening/.gitkeep` — backlog source (PROMOTED → 40)
- `~/.claude/get-shit-done/workflows/execute-phase.md` — GSD workflow file modified by patch
- `lib/install/hooks.mjs` — wizard hook installer (host of `registerCaptureHook` from Phase 39 Plan 04)
- `lib/install/node-check.mjs` — Phase 39 Plan 04 helper (precedent for `lib/install/permission-config.mjs`)
- `lib/doctor.mjs` — host for new `--gsd-permissions` subcommand
- `lib/install/gsd.mjs` — host for GSD patch application
- `packages/cds-core/src/vault/sessions.ts` — host of `openSessionsDB` / underlying `openRawDb` for busy_timeout fix
- `tests/detect.test.mjs` — 3 failing tests carried from v0.12 (profile-not-null root cause)
- `README.md` — needs v1.0 install instructions + cross-link
- `CHANGELOG.md` — already exists from Phase 39 Plan 04

## Decisions (locked — downstream agents act on these)

### D-126: GSD workflow patches via existing patch infrastructure

**Decision:** Modifications to `~/.claude/get-shit-done/workflows/execute-phase.md` ship as a `.patch` file under `patches/` and are applied by the install wizard via the existing `lib/install/gsd.mjs` patch flow (Phase 27 SHA-diff infrastructure).

**Why not direct edit:** The user's local `~/.claude/get-shit-done/` is shared across all GSD projects, not just claude-dev-stack. We cannot mutate it from a project-scoped install without an opt-in mechanism. The patch infrastructure already handles SHA-diff survival across `/gsd-update`.

**How to apply:** New patch file `patches/gsd-execute-phase-bypassperms.patch`; existing `lib/install/gsd.mjs` finds and applies all `*.patch` files at install time.

### D-127: detect.test.mjs root cause is `profile !== null` from real vault

**Decision:** The 3 failing tests assert `state.profile === null` ("v1 deferred") but `detectInstallState()` reads `profile.json` from the real `~/vault/meta/profile.json`. Fix at the test level: set `process.env.HOME = mkdtempSync(...)` in `beforeAll` so VAULT_CANDIDATES (which call `homedir()`) resolve under a temp dir that has no vault.

**Why not change `detect.mjs`:** `readInstallProfile()` is a deliberate exported function for future v1.x use. The "v1 deferred" semantics belong at the consumer level (wizard already ignores `profile`). Changing detect to always return `profile: null` would break the future intended use.

**How to apply:** Add `beforeAll` + `afterAll` HOME override at top of `tests/detect.test.mjs`. Same pattern that `packages/cds-cli/tests/helpers/temp-home.ts` (Phase 39 Plan 02) already established.

### D-128: doctor `--gsd-permissions` subcommand pattern

**Decision:** Extend `lib/doctor.mjs` with a `--gsd-permissions` flag that idempotently writes the GSD-required Bash patterns into the **current project's** `.claude/settings.local.json` `permissions.allow` array. No prompts — pure write-or-skip. Patterns:
- `Bash(pnpm:*)`, `Bash(npx:*)`, `Bash(node:*)`, `Bash(node --check *)`
- `Bash(git merge-base:*)`, `Bash(git reset:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git rev-parse:*)`
- `Bash(tsc:*)`, `Bash(vitest:*)`

**Why current project only (not global `~/.claude/settings.json`):** Global settings affect all the user's projects — surprise side effects unacceptable. Project-scoped means `claude-dev-stack doctor --gsd-permissions` is a per-project opt-in.

**Idempotency:** Existing patterns in the allowlist are not duplicated.

### D-129: Wizard CC 2.x detection — auto-call doctor at install time

**Decision:** New helper `lib/install/permission-config.mjs` exports `setupGsdPermissions(projectPath)`. Wired into `bin/install.mjs` per-project loop, called when GSD is detected for that project. Internally calls the same writer as `claude-dev-stack doctor --gsd-permissions` but scoped to the wizard's project iteration.

**CC version detection:** Read `process.versions.node` is not enough — need Claude Code version. Use `which claude` + `claude --version` parse. If CC < 2.x, skip (legacy permission model). If CC >= 2.x, write the allowlist.

**Why a new module:** Keeps `lib/install/hooks.mjs` focused on Stop/SessionStart hooks; permission setup is a separate concern with its own test surface.

### D-130: README v1.0 update — additive

**Decision:** Append a new top section "### v1.0.0-alpha.1 (Pre-release)" with install command (`npm install claude-dev-stack@alpha`), CHANGELOG link, migration guide link. Existing v0.12 sections are NOT removed (alpha hasn't replaced latest yet).

**Order:** v1.0 alpha section above v0.12 install instructions. Alpha is forward-looking; legacy is reference.

### D-131: Phase 35 follow-up scope

**Decision:** Add `db.pragma('busy_timeout = 5000')` immediately after WAL pragma in `openRawDb` (or wherever `new Database(path)` is opened in `packages/cds-core/src/vault/sessions.ts`). Plus one regression test asserting the pragma persists across reopens.

**Why 5000ms:** Standard SQLite recommendation for SQLITE_BUSY backoff with concurrent writers; matches typical hook firing windows.

### D-132: gsd-code-review of Phase 39 — separate plan, last in sequence

**Decision:** `/gsd-code-review` runs as the FINAL plan of Phase 40 (so it can review all Phase 40's own changes too if scope allows — but primary target is Phase 39 new code). Findings from REVIEW.md auto-fixed via `/gsd-code-review-fix` if any `severity: high` items surface. Low/medium findings deferred to v1.0 GA.

**Files in scope (primary):**
- `packages/cds-cli/src/quick.ts`
- `packages/cds-cli/src/capture-standalone.ts`
- `lib/install/hooks.mjs::registerCaptureHook` block
- `bin/install.mjs` Node check wiring
- `bin/cli.mjs` migrate exit-code + resolveDistPath block (Phase 39 Plan 01)

## Plan structure (preview for plan-phase)

| # | Plan | Wave | Deps |
|---|------|------|------|
| 01 | Fix `detect.test.mjs` (3 failures via HOME override) | 1 | — |
| 02 | GSD workflow patch — `patches/gsd-execute-phase-bypassperms.patch` + integrate via `lib/install/gsd.mjs` | 1 | — |
| 03 | `claude-dev-stack doctor --gsd-permissions` subcommand + wizard helper `lib/install/permission-config.mjs` + tests | 2 | 02 (patch must apply first conceptually, but no file overlap so could parallelize) |
| 04 | `db.pragma('busy_timeout = 5000')` in `openRawDb` + regression test | 2 | — |
| 05 | README v1.0 update + CHANGELOG cross-reference + migration guide cross-link | 3 | 01-04 (mentions all of them) |
| 06 | `/gsd-code-review` for Phase 39 + Phase 40 code → REVIEW.md → optional `/gsd-code-review-fix` | 4 | all prior |

## Deferred (NOT in Phase 40 scope)

- **Docker UAT harness** → Phase 41
- **`/gsd-verify-work`** for Phases 39 + 40 → Phase 41
- **Manual smoke wizard** on clean machine → Phase 41
- **`CLAUDE_CONFIG_DIR` audit** for Claude Code → Phase 41
- **MCP server install command** improvements → v1.1
- **merge-entities tool, streaming dispatchAgentStream, FTS5 docs.db** → v1.1+ backlog (already noted)

## Anti-patterns to avoid

- **Don't** modify `~/.claude/get-shit-done/` files directly from project install — always via patch infrastructure (D-126)
- **Don't** make `detectInstallState()` return `profile: null` unconditionally — that breaks v1.x future use; fix the test instead (D-127)
- **Don't** write to global `~/.claude/settings.json` from doctor command — project-scope only (D-128)
- **Don't** spawn `gsd-executor` subagents in worktree mode for this phase — until Plan 02 ships, executors will silently block on Bash. Inline-execute Phase 40 plans directly (memory: feedback_executor_bypass_permissions.md)
- **Don't** run wizard in dev environment for testing — Phase 41 owns sandbox; don't leak test side effects into maintainer's working `~/.claude/`
