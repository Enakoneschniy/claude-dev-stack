---
phase: 26-auto-adr-capture
plan: 02
subsystem: decisions-cli
tags: [cli, adr, browse]
requires:
  - lib/shared.mjs (ok/warn/info/fail helpers)
  - lib/adr-bridge.mjs (no hard dep; reuse of projectName traversal regex pattern)
provides:
  - lib/decisions-cli.mjs (list/show/search + --project flag)
  - bin/cli.mjs case 'decisions' wiring + printHelp entry
affects:
  - tests baseline: 804 -> 823 (+19)
tech-stack:
  added: []
  patterns:
    - match the handoff-cli / budget-cli subcommand dispatch style
    - dual-format ADR parser (YAML frontmatter + old-format bold labels)
key-files:
  created:
    - lib/decisions-cli.mjs
    - tests/decisions-cli.test.mjs
  modified:
    - bin/cli.mjs (+case 'decisions', +printHelp Decisions section)
decisions:
  - "D-12: three subcommands + --project flag"
  - "D-13: pure filesystem reads, no API calls, zero new deps"
metrics:
  duration: 25m
  completed: 2026-04-15
---

# Phase 26 Plan 02: decisions CLI — Summary

User-facing browser for auto-captured ADRs. Mirrors `claude-dev-stack handoff` and `claude-dev-stack budget` command style — dynamic import inside `bin/cli.mjs`, main dispatch by positional arg.

## What shipped

### CLI contract finalized

```
claude-dev-stack decisions list                     # sorted table (id, date, status, topic, title)
claude-dev-stack decisions show <id|slug>           # prints raw ADR content
claude-dev-stack decisions search <term>            # ranked matches
claude-dev-stack decisions --project <name>         # route to alt project dir
claude-dev-stack decisions                          # help block
```

Exit codes: `0` on success (including "No decisions found"), `1` when `show <id>` misses or `--project` fails traversal guard.

### Parser handles both formats

**New format** (frontmatter) — parses flat keys `id`, `topic`, `status`, `date`; nested `source:` block is recognized (skipped during flat-key scan) so it doesn't pollute top-level fields.

**Old format** (no frontmatter) — extracts `**Дата**:` / `**Date**:` and `**Статус**:` / `**Status**:` via regex. Russian inline labels are the current vault dialect (ADRs 0001–0012) and English labels work too for upstream ecosystem compatibility.

### Search ranking

| Match type             | Score |
| ---------------------- | ----- |
| topic exact match      | 100   |
| topic substring        | 80    |
| title substring        | 50    |
| raw content substring  | 10    |

Highest score per entry (not additive); deduplication via `Math.max`. Verified on real vault: `decisions search notebooklm` returns 0001 (topic match, 80) above content-only matches (10).

## Verification against live vault

```
$ node bin/cli.mjs decisions list --project claude-dev-stack
```

Listed all 12 existing ADRs (0001–0012) in a clean table. Old format parses correctly (Russian `Дата`, `Статус` labels). New format would coexist once Plan 01 runs on a session — none written yet since Plan 03 wiring is pending.

```
$ node bin/cli.mjs decisions show 0001
# ADR-0001: NotebookLM интеграция через CLI wrapper вокруг `notebooklm-py`
...
```

```
$ node bin/cli.mjs decisions search notebooklm
  [0001] notebooklm-integration-via-cli-wrapper — ... (score: 80)
  [0004] retry-delegation-to-upstream-cli — ... (score: 50)
  ...
```

## Parsing ambiguities resolved

**1. Russian vs English inline labels.** Old vault ADRs use `**Дата**:` / `**Статус**:`. Parser regex handles both: `\*\*(?:Дата|Date)\*\*` and `\*\*(?:Статус|Status)\*\*`. No new dialects expected.

**2. Nested YAML `source:` block.** Naive line-by-line frontmatter parser initially picked up `session_log:` and `commit:` as flat keys. Added an `inNested` flag that toggles on `^source:\s*$` and resets on next non-indented line. Tested by Plan 01's ADR output format — `id`, `topic`, `status`, `date` parsed, `source.*` ignored.

**3. Title extraction.** Both formats use `# ADR-NNNN: Title` or `# ADR NNNN: Title`. Regex `/^ADR[\s-]*\d+:\s*/` strips the prefix; fallback to `topicFromFilename` if no H1 found.

## Test count delta

`tests/decisions-cli.test.mjs` → 19 new tests. Suite 804 → 823. Zero regressions.

## Known deferred items

None. Plan fully self-contained — no checkpoints, no external wiring needed beyond the 4-line `case 'decisions'` block in `bin/cli.mjs`.

## Self-Check: PASSED

- `lib/decisions-cli.mjs` — FOUND
- `tests/decisions-cli.test.mjs` — FOUND
- `bin/cli.mjs` shows `case 'decisions'` and prints Decisions help section — VERIFIED
- Commits: `cbde0a2` (RED), `6cced28` (GREEN) — FOUND in git log.
