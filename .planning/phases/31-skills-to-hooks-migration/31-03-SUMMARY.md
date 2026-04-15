---
phase: 31-skills-to-hooks-migration
plan: 03
subsystem: skills
tags: [skill-trim, session-manager, patterns-docs]
requires: []
provides:
  - SKL-02 D-04 start-path body removed from session-manager
  - SKL-02 D-06 hook-pointer note
  - D-18 Skills vs Hooks decision matrix (vault/shared/patterns.md)
affects:
  - skills/session-manager/SKILL.md
  - tests/skills.test.mjs
  - vault/shared/patterns.md (external repo)
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - skills/session-manager/SKILL.md
    - tests/skills.test.mjs
    - vault/shared/patterns.md (auto-committed by vault-auto-push)
decisions:
  - D-04 Delete `### /resume or /start` section and `## Automatic Behavior` block
  - D-05 Retain `/end`, `/handoff`, `/status`, `## ADR Creation`, `## Best Practices`
  - D-06 Add hook-pointer note immediately after H1
  - D-18 Skills vs Hooks decision matrix documented in vault
metrics:
  test_delta: +3 (SKL-02 describe block)
  commits: 2 (repo) + 1 (auto-sync in vault repo)
---

# Phase 31 Plan 03: session-manager Skill Trim Summary

Completes SKL-02 migration. Phase 28 described removing greeting-trigger keywords;
Phase 31 also trims the body sections that implemented the auto-load behavior,
leaving the skill responsible only for `/end`, `/handoff`, `/status`, and
explicit `/resume`.

## Tasks Completed

### Task 1: Trim session-manager SKILL.md (D-04, D-05, D-06)
- **Commit:** `refactor(31): trim session-manager start-path body — owned by hook now (SKL-02 D-04/D-06)` (fc66863)
- Removed: `### /resume or /start` heading + bash block + "After reading context" paragraph
- Removed: `## Automatic Behavior` section entirely
- Added: D-06 note block immediately after H1 pointing to `hooks/session-start-context.sh`
- Added: minimal `### /resume` stub — explicit command only; notes hook does the auto-load
- Also updated frontmatter `description` (Phase 28 had NOT trimmed greeting triggers before
  this phase ran): removed first-message keywords so the skill stops auto-activating on greetings
- Also updated Best Practice #1 from "Always use /resume at session start" to the new
  "Context loads automatically at SessionStart" wording

Retained sections: `/end`, `/handoff`, `/status`, `## ADR Creation`, `## Best Practices`.

### Task 2: SKL-02 assertions in tests/skills.test.mjs
- **Commit:** `test(31): assert session-manager SKL-02 trim + D-06 note` (b5e0449)
- Added `describe('session-manager — SKL-02 migration (Phase 31)', ...)` with 3 tests:
  - start-path body is removed (D-04)
  - D-06 note present and references `session-start-context.sh`
  - `/end`, `/handoff`, `## ADR Creation` retained (D-05)

### Task 3: D-18 patterns.md update
- Edited `/Users/eugenenakoneschniy/vault/shared/patterns.md` directly (vault is outside this repo)
- Appended "## Skills vs Hooks" section with decision matrix table, migration guideline,
  and Phase 31 migration list
- vault auto-sync hook committed as `6994ee9 Auto-sync: 2026-04-15 16:18` — no manual commit needed

## Test Delta
- Before Plan 03: 766 → After Plan 03: 769 (+3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Phase 28 never trimmed the skill's frontmatter greeting triggers**
- **Found during:** Task 1 (reading SKILL.md to confirm line ranges)
- **Issue:** Plan 31-03 assumed Phase 28 had already removed greeting-trigger keywords
  from the skill description. It had not — the file still contained
  `ALWAYS trigger on first message in any session (greetings, "привет", "hi", "начинаем")`.
  Without trimming this, the skill would continue to auto-activate on greetings and
  defeat the SessionStart hook's silent-load behavior.
- **Fix:** Rewrote the frontmatter description to list only end-of-session + explicit
  resume/handoff triggers.
- **Files modified:** skills/session-manager/SKILL.md frontmatter (lines 1-10)
- **Commit:** folded into fc66863

**2. [Rule 2 — Missing critical] Best Practice #1 contradicted the new hook-owned flow**
- **Found during:** Task 1 final review
- **Issue:** "Best Practices 1. Always use /resume at session start" would mislead future
  readers into manually running /resume when the hook already did the work.
- **Fix:** Updated to "Context loads automatically at SessionStart — use /resume only to
  force a re-read mid-session".
- **Commit:** folded into fc66863

## Auth Gates
None.

## Self-Check: PASSED
- skills/session-manager/SKILL.md: `### /resume or /start` removed, `## Automatic Behavior` removed, D-06 note present
- tests/skills.test.mjs: SKL-02 describe passes (3/3)
- vault/shared/patterns.md: "## Skills vs Hooks" present, "Phase 31 migrations" present
- Commits fc66863, b5e0449 (repo) + 6994ee9 (vault auto-sync): ALL FOUND
