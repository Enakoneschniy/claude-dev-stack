---
phase: 32
type: context
status: locked
created: 2026-04-15
source: /Users/eugenenakoneschniy/vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md § D-18..D-22
---

# Phase 32 — Context (pointer-only)

All design decisions for this phase live in the vault master plan:

**Source of truth:** `/Users/eugenenakoneschniy/vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md`
**Section:** `### D-18..D-22: Idea capture-automation hotfix for v0.12.1 (2026-04-15)`

## Locked Decisions (non-negotiable)

- **D-18** Hook scope = project-level `.claude/settings.json` (NOT global `~/.claude/settings.json`). Per-project opt-in via wizard. Consistent with Phase 19 BUG-01 architecture.
- **D-19** Detection = simple regex in hook script. No LLM calls. Trigger phrase list lives in `hooks/idea-capture-triggers.json` for extensibility. Hybrid (hook + Claude validation) deferred to v1.0.
- **D-20** Capture flow = hint nudges → Claude invokes existing `/gsd-note`. No new capture infra. Hook emits hint only, NEVER writes files directly.
- **D-21** User feedback = Claude (not hook) emits one-line confirmation when `/gsd-note` fires: `📝 Captured: {topic}`. Out of scope for this phase — handled by existing `/gsd-note` skill.
- **D-22** Silent session-end hook = DEFERRED to v1.0. Not in this phase.

## Deferred (MUST NOT appear in plans)

- Hybrid Claude+regex detection — v1.0 only.
- Hook writes notes directly — explicitly rejected.
- Silent session-end detached Anthropic API call — v1.0 Refactor #7.
- Modifications to `/gsd-note` skill — unchanged.
- Two-stage stage-and-confirm capture flow — rejected as over-engineered.
- `/gsd-note` response confirmation format — already exists, not touched here.

## Discretion (planner chooses)

- Test file structure and naming within the `tests/idea-capture-trigger.test.mjs` umbrella.
- Whether telemetry counter (CAPTURE-04) is a separate task or folded into main hook implementation — planner picked: folded into hook (small scope, ~5 lines of code).
- Internal helper function names inside the hook.
- How to structure the trigger JSON (flat arrays vs nested categories) — planner picked: nested `{ russian: [...], english: [...] }` per original scope spec.

## New Requirements Added (backfilled into REQUIREMENTS.md by Plan 02)

- **CAPTURE-01** Hook installation wired into wizard at project-level `.claude/settings.json`.
- **CAPTURE-02** Trigger regex matches Russian + English phrases, case-insensitive, word-boundary-aware (no false-positive explosion — "идеальный" does NOT match trigger "идея").
- **CAPTURE-03** Hint format: `💡 IDEA-CAPTURE HINT: Detected trigger phrase "{phrase}" in user message. Consider invoking /gsd-note to capture the idea to .planning/notes/.` Emitted via Claude Code UserPromptSubmit JSON protocol (`hookSpecificOutput.additionalContext`) OR plain stdout (both are valid per Claude Code hook docs; match existing hook pattern in `hooks/dev-router.mjs` = plain stdout).
- **CAPTURE-04** (OPTIONAL) Telemetry counter in `~/.claude/cds-stats.json` tracks `idea_capture_hints_fired`. Opt-out = user deletes or zeroes the stats file.

## Target Release

**v0.12.1** — patch release on current v0.12.x base. Ships BEFORE v1.0 Pi SDK rewrite begins. Timeline: PR merge → 1-2 days to tagged release.

## Out-of-Scope Reminders (per vault master plan)

- NO changes to `/gsd-note` skill.
- NO new npm dependencies (single-dep `prompts@^2.4.2` constraint from PROJECT.md line 158).
- NO global `~/.claude/settings.json` writes.
- NO hook-direct note writing.
