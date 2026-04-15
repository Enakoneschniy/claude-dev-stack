---
phase: 26-auto-adr-capture
plan: 03
subsystem: session-manager-skill-wiring
tags: [skill, session-manager, adr-wiring]
requires:
  - lib/adr-bridge-session.mjs (Plan 01)
  - skills/session-manager/SKILL.md (package-shipped)
  - ~/.claude/skills/session-manager/SKILL.md (installed)
provides:
  - /end flow auto-invokes adr-bridge-session after update-context.mjs
  - $ADR_RESULT JSON emission so Claude reports one-line ADR summary
affects:
  - tests baseline: 823 -> 828 (+5 script tests)
  - human UAT checkpoint: DEFERRED (cannot be exercised in background/parallel)
tech-stack:
  added: []
  patterns:
    - bash parameter expansion `${SESSION_ID:+--session-id "$SESSION_ID"}` for conditional flag
    - fallback JSON via `... || ADR_RESULT='{"newAdrs":[],"superseded":[],"error":"bridge failed"}'`
    - test extracts bash heredoc and executes via `execFileSync('bash', ['-c', snippet])`
key-files:
  created:
    - tests/fixtures/mock-adr-bridge.mjs
    - tests/session-manager-end-flow.test.mjs
  modified:
    - skills/session-manager/SKILL.md (+ADR-bridge block, +Auto-ADR Capture section)
    - ~/.claude/skills/session-manager/SKILL.md (byte-identical mirror; outside repo)
decisions:
  - "D-04: /end invokes adr-bridge-session after update-context.mjs (both copies)"
  - "D-05: Claude formats one-line summary from $ADR_RESULT JSON"
  - "D-06: fail-open — || fallback JSON ensures /end never blocks"
metrics:
  duration: 15m
  completed: 2026-04-15
---

# Phase 26 Plan 03: Session-manager SKILL.md wiring — Summary

Insertion of ADR bridge call after the `update-context.mjs` hook so any session's
/end path captures architectural decisions to the vault, not just GSD discuss-phase.

## What shipped

### SKILL.md edits (both copies byte-identical)

Insertion point: immediately AFTER the existing `if [ -f "$UPDATER" ]; then ... fi` block
in the `/end` bash code (was line ~88, now followed by a ~15-line ADR-bridge block).

Added content:

1. A new bash block inside the `/end` code fence:
   ```bash
   ADR_BRIDGE="$REPO_ROOT/lib/adr-bridge-session.mjs"
   if [ -f "$ADR_BRIDGE" ]; then
     ADR_RESULT=$(VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME" \
       node "$ADR_BRIDGE" \
       --session-log "$(basename "$SESSION_FILE")" \
       --cwd "$REPO_ROOT" \
       ${SESSION_ID:+--session-id "$SESSION_ID"} \
       2>/dev/null) || ADR_RESULT='{"newAdrs":[],"superseded":[],"error":"bridge failed"}'
     echo "$ADR_RESULT"
   fi
   ```
2. A new `## Auto-ADR Capture (Phase 26 — D-04, D-05)` section before `## ADR Creation`
   describing how Claude should format `$ADR_RESULT` into a user-facing summary.
3. A documentation line under `/end` pointing out that auto-capture runs last.

### Which copies updated

- `skills/session-manager/SKILL.md` (package-shipped) — committed in this repo.
- `~/.claude/skills/session-manager/SKILL.md` (installed) — byte-identical change applied
  directly; this file is not under git in this repo, so the change is captured only in
  the package version (future `npx claude-dev-stack install` re-propagates from the
  package-shipped copy). `diff` between the two reports zero differences after edit.

### Script tests (Task 2)

`tests/session-manager-end-flow.test.mjs` runs the ADR-bridge bash block in a sandbox:

| Test | Covers |
|---|---|
| 1 — bridge present + success | `ADR_RESULT` parses; contains `newAdrs[0].number === 13` |
| 2 — bridge absent | Block skips; no JSON output |
| 3 — bridge fails (exit 1) | Fallback JSON used; `error: 'bridge failed'` |
| 4 — `SESSION_ID` unset | argv MUST NOT contain `--session-id` (bash expansion) |
| 5 — `SESSION_ID` set | argv MUST contain `--session-id abc-123` |

`tests/fixtures/mock-adr-bridge.mjs` supports `MOCK_MODE = success|fail|silent` and
optionally writes argv to `MOCK_ARGV_FILE` for assertion.

All 5 pass. Suite 823 → 828, zero regressions.

### Bash syntax validation

All 5 `bash` fences in the installed SKILL.md pass `bash -n` after the edit.

## Line-number evidence

| Section | Before edit | After edit |
|---|---|---|
| `/end` code fence end | line 89 (`fi` + blank + triple-backtick) | line ~108 (adds ADR-bridge block + spacing) |
| `## Auto-ADR Capture` section | N/A | inserted before `## ADR Creation` |
| Total file length | 184 lines | ~216 lines |

## Deferred checkpoint — Task 3 (human-verify)

The plan includes `<task type="checkpoint:human-verify">` (Task 3) requiring a real
Claude Code session to exercise the end-to-end flow:

1. Have an architectural discussion in a new session.
2. Type `done`.
3. Confirm Claude reports `Session logged. 1 new ADR (#NNNN topic).`
4. Confirm `vault/projects/claude-dev-stack/decisions/NNNN-*.md` exists with YAML
   frontmatter and Context/Decision/Consequences sections.
5. Confirm `claude-dev-stack decisions list` shows it.
6. Second session with overlapping topic → `1 superseded` reported.
7. Empty session → `Session logged.` alone.

**Cannot be run in background/parallel execution.** This agent is invoked inline from
a parent; the user has not typed `done` in an actual interactive session yet.

**Status:** DEFERRED to user UAT after phase merge. Return signal: user reports
"approved" or lists failures.

## Gap-closure candidates for `/gsd-plan-phase 26 --gaps`

None identified pre-UAT. Known risks to re-check after UAT:

1. `$SESSION_ID` substitution — Claude may or may not populate this env var in the
   bash subprocess. The bridge handles missing session_id by falling back to
   most-recent-mtime JSONL (tested in Plan 01), so this is non-fatal either way.
2. `REPO_ROOT` derivation — if user runs `/end` in a non-git directory, `$REPO_ROOT`
   becomes `$(pwd)` and `"$REPO_ROOT/lib/adr-bridge-session.mjs"` won't exist;
   bridge call is skipped. Acceptable — user sees normal /end output.
3. Session transcript path derivation — bridge uses `slugify(cwd) = cwd with / → -`.
   Works for this repo (`-Users-eugenenakoneschniy-Projects-claude-dev-stack` exists).
   Other users' paths may have unusual characters; defer to UAT feedback.

## Self-Check: PASSED

- `skills/session-manager/SKILL.md` contains `adr-bridge-session.mjs` + `ADR_RESULT` + `## Auto-ADR Capture` — VERIFIED via grep
- `~/.claude/skills/session-manager/SKILL.md` is byte-identical — `diff` empty
- All 5 bash fences pass `bash -n`
- `tests/fixtures/mock-adr-bridge.mjs`, `tests/session-manager-end-flow.test.mjs` — FOUND
- Commits: `0d30901` (Tasks 1+2) — FOUND in git log
- Task 3 (human-verify) — DEFERRED to UAT sign-off
