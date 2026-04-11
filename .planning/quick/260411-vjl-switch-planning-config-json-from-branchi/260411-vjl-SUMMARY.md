# Quick Task 260411-vjl — SUMMARY

**Status:** ✅ Shipped
**Date:** 2026-04-11
**Branch:** `chore/gsd-config-branching-none`

## What changed

| File | Change |
|---|---|
| `.planning/config.json` | `git.branching_strategy`: `"milestone"` → `"none"` |
| `.planning/config.json` | `git.quick_branch_template`: `null` → `"chore/{slug}"` |

**Net:** 2 insertions, 2 deletions in 1 file.

All other keys (`phase_branch_template`, `milestone_branch_template`, `model_profile`, `commit_docs`, `workflow.*`, `hooks.*`, etc.) byte-identical.

## Why

The v0.8 milestone was shipped under `branching_strategy: "milestone"`. Three separate quick tasks earlier today (260411-tgg, 260411-trq, 260411-u3g) hit the same upstream bug in `~/.claude/get-shit-done/bin/lib/commands.cjs:281-313`: `cmdCommit` unconditionally `git checkout`s the milestone branch on every commit, hijacking feature branches the orchestrator just created. Each incident required manual fast-forward recovery on `main`.

Root cause: `cmdCommit` branch-hijack logic only short-circuits when `branching_strategy === 'none'`. Setting it to `"none"` disables the hijack entirely. See session log `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md` TODO #3.

Secondary fix: `quick_branch_template: "chore/{slug}"` was de-facto broken under `milestone` strategy (the hijack would undo any pre-checkout the orchestrator did), so enabling it is only meaningful in combination with `branching_strategy: "none"`. Now `/gsd-quick` can auto-create per-task branches at init time and the manual `git checkout -b chore/...` pattern used in 260411-tgg/trq/u3g goes away.

These two settings only work together; flipping one without the other is pointless.

## Commits

- `a95e5ee chore(config): switch GSD branching to none + enable chore/{slug} quick branches` — config change, 1 file
- `(docs-commit-hash)` — SUMMARY + STATE + PLAN bookkeeping

## Verification

- ✅ JSON parses cleanly, all invariants hold (`node -e` invariant check)
- ✅ `gsd-tools config-get git.branching_strategy` → `"none"`
- ✅ `gsd-tools config-get git.quick_branch_template` → `"chore/{slug}"`
- ✅ `npm test` — **264/264 passing** (no regression)
- ✅ Feature branch preserved across `gsd-tools commit` (no hijack — validated the fix lives up to its claim)
- ⏳ Next `/gsd-quick` invocation will auto-create a `chore/<slug>` branch without manual intervention — to be observed.

## Deviations

One process hiccup during execution, not a plan deviation: initial `gsd-tools commit` invocation used positional `.planning/config.json` instead of `--files .planning/config.json`. That caused the positional to be parsed into the commit message (silently) and `files` to default to `['.planning/']`, which auto-staged the untracked PLAN.md directory into the config commit. Caught immediately via post-commit `git log -1 --stat`, soft-reset, unstaged PLAN.md, retried with correct `--files` syntax.

Lesson: `gsd-tools.cjs commit` requires `--files <path>` explicitly. Without it, the default target is `.planning/` (whole tree). The executor agent docs in `~/.claude/get-shit-done/` already document this, but the failure mode is silent (no warning about unknown positional args).

## Backlog item closed

TODO #3 from `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md`:
> **GSD cmdCommit branch-hijack bug** — needs workaround until upstream fix

Workaround applied locally. The upstream fix (making the hijack respect current branch, or at minimum logging a warning) is still pending and should be reported to the get-shit-done maintainer separately.

## Out of scope (deferred)

- Upstream bug report / PR to `commands.cjs:281-313` — local workaround is sufficient for this project; broader fix is a separate concern.
- Migrating `phase_branch_template` / `milestone_branch_template` removal — intentionally left in config.json as dead keys to document prior intent. Harmless under `strategy=none`.
- `/gsd-quick` orchestrator verification that the new template actually produces `chore/<slug>` branches at init time — will be verified organically on the next quick task invocation.

## Related

- Session log: `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md`
- Upstream code: `~/.claude/get-shit-done/bin/lib/commands.cjs:281-313` (cmdCommit hijack)
- Upstream code: `~/.claude/get-shit-done/bin/lib/init.cjs:466-471` (quick_branch_template consumer)
- Prior manual-branch-creation tasks: 260411-tgg, 260411-trq, 260411-u3g
