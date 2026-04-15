---
phase: 26-auto-adr-capture
plan: 01
subsystem: auto-adr-capture
tags: [adr, session-capture, haiku]
requires:
  - lib/adr-bridge.mjs (existing — `nextAdrNumber`, `atomicWrite` now exported)
  - claude CLI (`-p --model haiku --bare`)
provides:
  - lib/adr-bridge-session.mjs (session transcript -> ADR engine)
  - exported `nextAdrNumber`, `atomicWrite` from lib/adr-bridge.mjs
affects:
  - tests baseline: 788 -> 804 (+16)
tech-stack:
  added: []
  patterns:
    - execFileSync + timeout (pattern from hooks/budget-check.mjs)
    - atomic write (tmp + rename) reused from adr-bridge.mjs
    - tail-truncation for oversized transcripts
    - YAML frontmatter ADR format with nested `source:` block
key-files:
  created:
    - lib/adr-bridge-session.mjs
    - tests/adr-bridge-session.test.mjs
    - tests/fixtures/session-transcript-sample.jsonl
    - .planning/phases/26-auto-adr-capture/wave0-notes.md
  modified:
    - lib/adr-bridge.mjs (2 named exports added; bodies unchanged)
decisions:
  - "D-01: Use Haiku via `claude -p --model haiku --bare` (text output-format, <decisions> XML tag)"
  - "D-02: JSON schema wrapped in <decisions>...</decisions>; malformed -> fail-open"
  - "D-03: confidence=low discarded, confidence=medium -> status: proposed, high -> status: accepted"
  - "D-06: fail-open — any error captured to {error}, no files written, CLI exit 0 always"
  - "D-07: dual-format topic match (YAML frontmatter + old-format filename)"
  - "D-08: supersede by appending to Consequences section; old-format gets promoted to new format"
  - "D-09: nextAdrNumber reuses lib/adr-bridge.mjs helper (max NNNN + 1)"
  - "D-10: YAML frontmatter template (id, topic, status, date, source.session_log, source.commit)"
  - "D-11: source fields recorded from session log path + `git rev-parse --short HEAD`"
metrics:
  duration: 45m
  completed: 2026-04-15
---

# Phase 26 Plan 01: Core ADR Bridge Engine — Summary

Session transcript -> Haiku -> vault ADR. Single source of truth for "any session produces ADRs" (not just GSD discuss-phase). Plans 02 and 03 consume this engine.

## What shipped

### `lib/adr-bridge-session.mjs` (448 lines)

Four named exports for Plan 03 + CLI:

```js
bridgeSession({transcriptPath, cwd, sessionId, vaultPath, projectName, sessionLogPath, callHaiku, now})
  -> { newAdrs, superseded, error }
extractTranscriptText(jsonlPath, maxChars=600_000) -> string
parseHaikuResponse(rawOutput) -> { decisions: [...] }
topicMatchesExistingAdr(topic, decisionsDir) -> { matched, filePath?, isOldFormat? }
```

### CLI mode

```
VAULT_PATH=... CDS_PROJECT_NAME=... node lib/adr-bridge-session.mjs \
  --session-log <basename.md> --cwd <repo-root> [--session-id <uuid>] [--transcript <path>]
```

Always prints a single-line JSON `{newAdrs, superseded, error}` and exits 0 (fail-open per D-06).

### Exact `claude -p` invocation (for Plan 03)

```
claude -p --model haiku --bare --output-format text
```

Prompt piped to stdin via `execFileSync(..., { input: prompt, timeout: 60_000 })`. Binary resolution order: `claude` on PATH -> `$CLAUDE_CODE_EXECPATH` fallback (set inside Claude Code sessions). No hardcoded binary paths.

### ADR file template (D-10)

```
---
id: 0013
topic: logging-strategy
status: accepted            # or "proposed" when confidence=medium
date: 2026-04-15
source:
  session_log: <value of --session-log>
  commit: a3f9c21           # omitted when git rev-parse fails
---

# ADR 0013: <title>

## Context
<haiku context>

## Decision
<haiku decision>

## Consequences
<haiku consequences>
```

On supersede, `## Consequences` gets a `---` separator + `**Superseded by revision on {date}** (topic, confidence)` block with the new consequences appended.

## Test coverage

13 describe blocks, 16 individual tests — all passing. Suite baseline 788 -> 804 (zero regressions).

| Suite | Covers |
|---|---|
| happy path (SC#1 + SC#4) | Full ADR creation with frontmatter + 3 sections |
| confidence gating (D-03) | medium->proposed, low->discarded |
| duplicate via frontmatter (D-08) | supersede existing new-format ADR |
| old-format filename match (D-07) | supersede + promote old ADR to new format |
| numbering (D-09) | max(existing) + 1, zero-padded |
| Haiku error fail-open (D-06) | throw -> {error} set, no files |
| malformed response | no `<decisions>` tag -> error, no files |
| extractTranscriptText | filters sidechain/system, concats text |
| topic path traversal (T-26-03) | `../../../etc/passwd` sanitized safely |
| projectName traversal | `foo/bar`, `foo..bar` -> error |
| source.commit fallback | non-git cwd -> no `commit:` line |
| parseHaikuResponse | robust to malformed input |
| topicMatchesExistingAdr | frontmatter > filename; min-4-char stem guard |

## Assumptions / worked-around issues

**1. No `--max-tokens` flag in Claude Code CLI.** Confirmed via `claude --help`. Dropped from the invocation; Haiku's default 32k output cap + the 600k char input cap are sufficient.

**2. Filename substring match was too permissive (Rule 1 — auto-fix).** Initial impl matched single-char filename stems (e.g., `0012-c.md`) to any topic containing the letter `c`. Fix: require both stem and topic >= 4 chars for substring matching; exact equality still allowed regardless of length. Test 6 (numbering) caught the issue — it now passes.

**3. Text output-format chosen over JSON.** JSON format wraps the model response in an envelope (`{type,result,...}`); extracting the raw `<decisions>` block is simpler in text mode. Both formats preserve the tagged block verbatim.

**4. `--bare` added to invocation.** Prevents SKILL.md/CLAUDE.md re-entrancy inside the bridge subprocess. The subprocess does no tool use — pure LLM call.

## Threat mitigations verified

- T-26-02 (projectName traversal) — existing guard reused, tested.
- T-26-03 (topic slug traversal) — `sanitizeTopicSlug` strips to `[a-z0-9-]+`, empty -> discard; tested with `../../../etc/passwd` input.
- T-26-04 (shell injection) — `execFileSync` with args array, no string interpolation.
- T-26-05 (oversized transcript) — hard cap 600k chars + 60s Haiku timeout.
- T-26-07 (Haiku unavailable blocks /end) — fail-open try/catch; CLI exit 0 always.

## Self-Check: PASSED

- `lib/adr-bridge-session.mjs` — FOUND
- `tests/adr-bridge-session.test.mjs` — FOUND
- `tests/fixtures/session-transcript-sample.jsonl` — FOUND
- `.planning/phases/26-auto-adr-capture/wave0-notes.md` — FOUND
- Commits: `73e1f6d` (wave0), `188379d` (RED), `8e262d5` (GREEN) — all FOUND in `git log`.
