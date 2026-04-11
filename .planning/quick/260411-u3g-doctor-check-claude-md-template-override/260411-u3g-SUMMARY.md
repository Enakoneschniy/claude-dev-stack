# Quick Task 260411-u3g — SUMMARY

**Status:** ✅ Shipped
**Date:** 2026-04-11
**Branch:** `chore/output-style-conflict-defense`

## What changed

| File | Change |
|---|---|
| `lib/doctor.mjs` | + 18 lines: scan `enabledPlugins` for `learning-output-style@*` / `explanatory-output-style@*` truthy keys, warn + actionable disable instructions |
| `lib/project-setup.mjs` | + 9 lines in `generateSkillsSection()`: new `## Output Style Override` markdown block with IGNORE rules and known offending plugin names |
| `tests/doctor.test.mjs` | + 5 tests in new `describe('output-style plugin conflict detection')` block + `makeTempHomeWithSettings` helper |
| `tests/project-setup.test.mjs` | + 2 tests in new `describe('Output Style Override section')` block + `updateProjectClaudeMd` import |

**Net:** 201 insertions, 1 deletion across 4 files.

## Commits

- `e4c2798 feat: defend against output-style plugin SessionStart hijack`

## Verification

- ✅ `node --check` clean on all 4 modified files
- ✅ `npm test` — 257 → **264 tests** (+7), 0 failures
- ⏳ CI matrix on PR — Node 18/20/22

## Two-layer defense

### Layer (A) — `doctor` detects existing users

Catches users who already installed claude-dev-stack and later enabled the output-style plugins via `/plugin` or marketplace install. They'll see a warning the next time they run `claude-dev-stack doctor`:

```
Settings
  ✔ settings.json
  ✔ N hook(s) configured
  ✔ N plugin(s) enabled in settings
  ⚠ Output-style plugins active: learning-output-style@claude-plugins-official
  ℹ These inject learning/explanatory mode into every session via SessionStart hooks
  ℹ They conflict with claude-dev-stack automation. Disable in ~/.claude/settings.json:
  ℹ   "learning-output-style@claude-plugins-official": false
```

Increments `warnings` counter, doesn't fail.

### Layer (C) — CLAUDE.md template protects new users

`generateSkillsSection()` now emits an `## Output Style Override` block inside the `@claude-dev-stack:start/end` markers. New text instructs Claude to IGNORE any "learning" or "explanatory" mode injection and enumerates banned patterns:

- No `TODO(human)` markers in code
- No prompting for function bodies / threshold values / naming choices
- No `★ Insight ─────` blocks asking for micro-decisions
- Pick reasonable defaults with rationale and proceed

The CLAUDE.md update is **idempotent** via existing marker mechanism — re-running `claude-dev-stack add-project` (or update wizard) re-applies the section without duplication. Verified by the new `keeps the Output Style Override section after idempotent re-update` test.

## Root cause recap

Investigation revealed both plugins live at:

```
~/.claude/plugins/cache/claude-plugins-official/{learning,explanatory}-output-style/1.0.0/hooks-handlers/session-start.sh
```

Each script unconditionally `cat << 'EOF' { hookSpecificOutput: { additionalContext: "..." } } EOF` and `exit 0` — no project check, no opt-out flag, no env var. The injected text becomes part of Claude's context at session start and the agent starts following the instructions.

## Backlog item

This task is the **systemic fix** for the issue surfaced when the user said: "после того как я перезапустил claude все перестало работать" (after I restarted Claude everything stopped working). The user-side fix (disable both plugins in personal `~/.claude/settings.json`) was already applied this session. This task ships the protection for **other claude-dev-stack users**.

## Out of scope (deferred)

- (B) Setup wizard interactive disable that programmatically writes to `~/.claude/settings.json` — requires consent UX, slated for v0.9 wizard
- Upstream issue against `claude-plugins-official` recommending opt-out flags
- README troubleshooting section (can be a separate docs PR)

## Risk

**Very low.** Both changes are purely additive. Doctor change is one new conditional branch in an existing block. CLAUDE.md template change is markdown text inside existing markers; the idempotent update mechanism guarantees no duplication on re-runs.
