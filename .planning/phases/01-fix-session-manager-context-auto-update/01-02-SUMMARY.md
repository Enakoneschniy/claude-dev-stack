---
phase: 01-fix-session-manager-context-auto-update
plan: 02
subsystem: skills+hooks
tags: [skills, hooks, vault, integration, wiring]
wave: 2
depends_on: [01]
requires:
  - lib/session-context.mjs::updateContextHistory (from Plan 01-01)
  - hooks/session-end-check.sh (existing Stop hook)
  - skills/session-manager/SKILL.md (existing skill file)
provides:
  - hooks/update-context.mjs (new thin wrapper invoking the helper)
  - wired Stop hook that updates context.md before vault auto-push
  - wired skill /end block that calls the same wrapper as the hook
  - end-to-end integration test of the full chain
affects:
  - users who have session-manager skill installed (hook/skill now actually updates context.md)
tech-stack:
  added: []
  patterns:
    - "Thin CLI wrapper pattern: bash hook -> node subprocess -> pure helper"
    - "Silent-failure semantics in Stop hooks (2>/dev/null || true)"
    - "Integration test via execFileSync('bash', ...) against fixture vault"
key-files:
  created:
    - hooks/update-context.mjs
  modified:
    - hooks/session-end-check.sh
    - skills/session-manager/SKILL.md
    - tests/hooks.test.mjs
decisions:
  - D-02 (dual invocation — skill + hook both call wrapper, idempotent by filename)
  - D-03 (thin Node.js wrapper instead of inline node -e in bash)
  - D-14 (silent failure semantics — exit 0 on non-fatal, stderr diagnostics only)
metrics:
  duration: ~25 minutes
  completed: 2026-04-10
  tasks: 3
  commits: 3
  tests_before: 66
  tests_after: 68
  tests_delta: +2
---

# Phase 1 Plan 02: Wire Context Updater Into Hook + Skill Summary

**One-liner:** Thin Node.js wrapper (`hooks/update-context.mjs`) bridges the bash Stop hook and the skill `/end` block to the pure `updateContextHistory` helper delivered in Plan 01-01, with end-to-end integration test proving context.md gets a linked Session History entry after running the hook against a fixture vault.

## What was built

### `hooks/update-context.mjs` (new, 67 lines, executable)

Thin CLI wrapper around `lib/session-context.mjs::updateContextHistory`. Its one job: parse env vars (`VAULT_PATH`, `CDS_PROJECT_NAME`) and argv (session log filename, optional title), call the helper, exit 0 on success or non-fatal skip, exit 2 only on programmer errors (missing required args). All diagnostic output goes to stderr; the process never propagates errors to the user's terminal on filesystem conditions (D-14).

### `hooks/session-end-check.sh` (modified)

Inside the "session logged" branch (where `ls "$SESSION_DIR/$TODAY"*.md` succeeds), added a new block BEFORE the vault auto-push that:

1. Picks the newest session log for today via `ls -t | head -1`
2. Extracts its basename
3. Resolves the wrapper path via `$(cd "$(dirname "$0")" && pwd)` (co-located with the hook)
4. Invokes `node "$SCRIPT_DIR/update-context.mjs" "$SESSION_LOG_FILENAME"` with `VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME"` exported
5. Suppresses stderr via `2>/dev/null` and catches any non-zero exit via `|| true`

The ordering is critical: context.md is updated BEFORE the `git -C "$VAULT" add -A` line so the mutation is staged by the same Session commit. Verified by acceptance criterion: `node_line=38 git_line=46` (node call precedes git add).

### `skills/session-manager/SKILL.md` (modified)

Replaced the two prose-comment lines at the original lines 80-81:

```bash
# Update context.md "Session History" section
# Add link to new session log
```

with a real, executable bash snippet that invokes the same wrapper the hook uses:

```bash
# Update context.md "Session History" section (D-01, D-02)
# Invokes the same Node wrapper the Stop hook uses — idempotent by filename.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pwd)"
UPDATER="$REPO_ROOT/hooks/update-context.mjs"
if [ -f "$UPDATER" ]; then
  VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME" \
    node "$UPDATER" "$(basename "$SESSION_FILE")" 2>/dev/null || true
fi
```

All other sections of SKILL.md (frontmatter, /resume, /handoff, /status, ADR Creation, Best Practices) are preserved byte-for-byte — only those two prose lines were touched.

### `tests/hooks.test.mjs` (modified)

Added a new `describe('session-end-check.sh integration (updates context.md)', ...)` block with two tests:

1. **Full chain assertion** — seeds a fixture vault at `$TMPDIR/claude-test-hook-integration-$PID/` with a project dir, a `context.md`, a session log dated today (`# Session: YYYY-MM-DD — Integration run`), and a `project-map.json`. Runs the hook via `execFileSync('bash', [hookPath], { env: { VAULT_PATH, HOME }, cwd: projectDir })`. Asserts that after the hook runs, `context.md` contains both session-history markers, the expected `(sessions/YYYY-MM-DD-integration-run.md)` link, and the extracted title `YYYY-MM-DD — Integration run`.

2. **Silent stdout** — re-runs the hook and asserts `result === ''` (the hook prints nothing to stdout on the "session logged" branch).

New imports added: `before, after` from `node:test`; `mkdirSync, rmSync, writeFileSync` from `fs`; `tmpdir` from `os`.

## Commits

- `cd83b02` — `feat(01): add hooks/update-context.mjs wrapper`
- `c8dde4d` — `fix(01): wire context.md updater into hook and skill /end block`
- `8738d83` — `test(01): add hooks integration test for context.md updater`

## Verification

- `node --check hooks/update-context.mjs` → exits 0
- `bash -n hooks/session-end-check.sh` → exits 0
- `node --check tests/hooks.test.mjs` → exits 0
- `test -x hooks/update-context.mjs` → passes (executable bit set)
- Smoke test 1: `node hooks/update-context.mjs; echo $?` → exit 2 (missing args)
- Smoke test 2: `VAULT_PATH=/tmp/nonexistent-$$ CDS_PROJECT_NAME=demo node hooks/update-context.mjs 2026-04-10-x.md; echo $?` → exit 0 with stderr diagnostic
- Prose comment removal: `grep -c '^# Update context.md "Session History" section$' skills/session-manager/SKILL.md` → 0; `grep -c '^# Add link to new session log$' skills/session-manager/SKILL.md` → 0
- Hook ordering: `awk '/update-context.mjs/{n=NR} /git -C "\$VAULT" add -A/{g=NR} END{exit !(n<g)}'` → exit 0 (node call at line 38, git add at line 46)
- SKILL.md preservation: `grep -q "### /resume or /start|### /handoff|### /status|## ADR Creation"` → all pass
- **`npm test` → 68 passed, 0 failed, 0 skipped** (66 baseline + 2 new integration tests)

## Decisions encoded

| D | How implemented |
|---|---|
| **D-02** | Dual invocation — `hooks/session-end-check.sh` (safety net) and `skills/session-manager/SKILL.md` /end block (primary) both call the same `hooks/update-context.mjs` wrapper. Helper idempotency (from Plan 01-01) makes running both in sequence safe — second call returns `noop`. |
| **D-03** | Thin Node.js wrapper (`hooks/update-context.mjs`) instead of inline `node -e "..."` in bash. Keeps the hook free of shell-quoting hazards and mirrors the `lib/*.mjs` pure helper + thin CLI wrapper pattern. |
| **D-14** | Silent failure semantics — wrapper exits 0 on all non-fatal conditions (missing vault/project/context.md, unexpected errors), only exits 2 on programmer errors (missing required args). Hook adds belt via `2>/dev/null` AND suspenders via `|| true` on the node call so git push still runs even on wrapper malfunction. |

## Requirements fulfilled

| ID | Status | Where |
|---|---|---|
| **SKILL-01** | done | Hook + skill both invoke the wrapper; integration test proves `context.md` gains a linked entry after the hook runs |
| **SKILL-03** | done | Logic lives in `lib/session-context.mjs` + `hooks/update-context.mjs`, not as prose inside SKILL.md; the two dead-comment lines are replaced with an executable snippet |
| **SKILL-05** | done | Integration test simulates session end (runs the real hook against a fixture vault) and asserts `context.md` was modified |
| **TEST-03** (integration portion) | done | `tests/hooks.test.mjs::session-end-check.sh integration (updates context.md)` describe block with 2 new tests; full chain covered |
| SKILL-02, SKILL-04 | already done in Plan 01-01 | Unit tests in `tests/session-context.test.mjs` |

All 4 phase requirements (SKILL-01, SKILL-03, SKILL-05, TEST-03) scoped to this plan are now fulfilled. Combined with Plan 01-01's SKILL-02 and SKILL-04, **Phase 1 is complete** in terms of REQUIREMENTS coverage.

## Claude's Discretion calls

1. **Dropped unused imports** — the plan's example wrapper code imported `dirname`, `resolve`, and `fileURLToPath` but never used them after the removal of the `__dirname` computation. Kept the wrapper to just `homedir` and the helper import. This is a style tightening, not a behavioral change — all acceptance criteria still pass.
2. **Kept the `|| true` on the node call in the hook** — the plan said to use it, but the belt-and-suspenders nature (stderr suppression + exit-code catch) means the wrapper would have to malfunction catastrophically for the hook to even reach `|| true`. Kept it anyway per D-14 and the acceptance criterion grep.
3. **Commit style: single fix commit for both hook + skill** — the task brief said "OR split into two commits if cleaner"; went with one commit because both changes wire the same feature (context.md update) through different invocation sites. One commit captures the intent.
4. **Integration test fixture location** — used `tmpdir()/claude-test-hook-integration-${process.pid}` to match the unit-test fixture pattern in `tests/session-context.test.mjs`. PID suffix prevents collision with parallel test runs.
5. **Second integration test (stdout silence)** — the plan specified one integration test but called out the hook being silent on stdout as part of the "session logged" branch semantics. Added a second `it` block to pin that behavior down, bringing the delta to +2 tests (matching the "at least 2 new tests" acceptance criterion literally).

## Deviations from plan

None substantive. All three tasks executed as written. The only trim was removing unused imports from the wrapper (see Claude's Discretion #1) and consolidating Task 2 into a single commit (see Claude's Discretion #3). No Rule 1-3 auto-fixes were needed because the Plan 01-01 helper was rock-solid and the wiring pattern followed an established convention.

## Known Stubs

None. Every wired path is functional: the wrapper delegates to a real helper, the hook calls a real wrapper, the skill block calls a real wrapper, and the integration test exercises the full chain end-to-end against a real fixture vault.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced beyond those in the plan's `<threat_model>`. The wrapper runs in-process as a node subprocess of bash, with all inputs derived from the hook's own `basename` of a `ls`-matched path (T-02-01 mitigation) and the `$PROJECT_NAME` variable already resolved by the hook's existing logic.

## Notes for next phase

- Phase 1 is **complete** after this plan — both Wave 1 (Plan 01-01) and Wave 2 (Plan 01-02) shipped.
- The wrapper file `hooks/update-context.mjs` is NOT currently distributed by `lib/project-setup.mjs::copyProjectSkills` because that function only copies skill files, not hook files. If user-machines should get this wrapper as part of `claude-dev-stack update`, Phase 5 (install wizard) or a future plan needs to extend `project-setup.mjs` or the hooks-install flow to copy `hooks/update-context.mjs` alongside `hooks/session-end-check.sh`. For now the wrapper lives only in this repo; users running from a freshly-installed `claude-dev-stack` package will get it via the normal package distribution.
- The SKILL.md block uses `git rev-parse --show-toplevel` to locate `hooks/update-context.mjs` relative to the current repo. This works when the skill runs inside a git repo that has the wrapper. For vault-only scenarios (no repo, or repo without the wrapper) the `if [ -f "$UPDATER" ]` guard degrades gracefully — skill does nothing, hook still runs the wrapper via its own path resolution (which is co-located with the hook file via `$(dirname "$0")`).

## Self-Check: PASSED

- **Files claimed created — all exist:**
  - `hooks/update-context.mjs` ✓ FOUND
- **Files claimed modified — all exist with expected changes:**
  - `hooks/session-end-check.sh` ✓ FOUND (contains `update-context.mjs`, `CDS_PROJECT_NAME`, `|| true`)
  - `skills/session-manager/SKILL.md` ✓ FOUND (contains `update-context.mjs`, prose comments removed)
  - `tests/hooks.test.mjs` ✓ FOUND (contains `session-end-check.sh integration`)
- **Commits claimed — all exist in git log:**
  - `cd83b02` ✓ FOUND (feat(01): add hooks/update-context.mjs wrapper)
  - `c8dde4d` ✓ FOUND (fix(01): wire context.md updater into hook and skill /end block)
  - `8738d83` ✓ FOUND (test(01): add hooks integration test for context.md updater)
- **Test suite status:** 68 passing, 0 failing (verified via `npm test`)
