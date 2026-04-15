# Phase 22: Post-Reset Handoff — Research

## Validation Architecture

**Phase goal:** Scheduled tasks (local or cloud) pick up where the previous session stopped by reading `.planning/STATE.md` at startup.

**Requirement:** LIMIT-04 — reads `stopped_at` + `resume_file` from STATE.md; clear error if missing.

---

## Codebase Analysis

### Existing patterns to follow

**`lib/budget.mjs`** — canonical utility module pattern:
- Pure functions, sync where possible, named exports
- Uses only `node:fs`, `node:path`, `node:os` — no new deps
- Clear `HandoffError`-style error types: budget uses return null + guard, handoff should throw typed errors

**`lib/budget-cli.mjs`** — CLI subcommand pattern:
- `export async function main(args)` entry point
- Switch on `args[0]` for subcommands
- Imports lib module lazily via dynamic import or statically
- Registered in `bin/cli.mjs` switch block

**`tests/budget.test.mjs`** — test pattern:
- `import { describe, it, before, after } from 'node:test'` + `import assert from 'node:assert/strict'`
- Fixture files in `tests/fixtures/` (currently just `.sh` files — can add `.md` state files)
- Tests import lib directly: `await import('../lib/budget.mjs')`
- Tests are sync where possible, async only when needed

**`tests/continuation.test.mjs`** — lightweight test pattern:
- Tests exports and non-throwing behavior (no side-effects)
- Good model for `tests/handoff.test.mjs`

### STATE.md structure

Current STATE.md uses YAML frontmatter between `---` delimiters:

```yaml
---
gsd_state_version: 1.0
milestone: v0.12
milestone_name: Hooks & Limits
status: in_progress
stopped_at: Phase 21 complete — ready to plan Phase 22
last_updated: "2026-04-13"
last_activity: 2026-04-13
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 50
---
```

Key fields for Phase 22:
- `stopped_at` — string describing where execution stopped (e.g., "Phase 22 plan 01 task 3")
- `resume_file` — relative path to a context file (may be absent or "None")

Current STATE.md does NOT have `resume_file` in frontmatter — it's in the body section ("Resume file: None"). Need to check if this is always in frontmatter or body.

**Parsing strategy:** Parse YAML frontmatter between the first two `---` delimiters. Simple line-split: no external YAML parser needed since frontmatter is simple key: value pairs (no nested maps except `progress:`).

### `loop.md` already references this behavior

`templates/loop.md` (Phase 21) documents:
```
Read `.planning/STATE.md`. Look for `stopped_at` and `resume_file` fields.
If `stopped_at` is present and non-empty:
  - Run `/gsd-resume-work` to continue from where the session stopped
```

Phase 22's `lib/handoff.mjs` provides the backing implementation.

### CLI registration

`bin/cli.mjs` registers commands via `switch (command)`. Pattern:
```js
case 'handoff': {
  const { main } = await import('../lib/handoff-cli.mjs');
  await main(args.slice(1));
  break;
}
```

Also needs a `printHelp()` entry.

---

## Implementation Plan

### New files
1. **`lib/handoff.mjs`** — state reader utility (pure, sync)
2. **`lib/handoff-cli.mjs`** — CLI command handler (`handoff status`)
3. **`tests/handoff.test.mjs`** — unit + integration tests
4. **`tests/fixtures/state/`** — STATE.md fixtures for test scenarios

### Changes to existing files
1. **`bin/cli.mjs`** — add `handoff` case + help text
2. **`templates/loop.md`** — no changes needed (already correct)

### `lib/handoff.mjs` API

```js
// Error class
export class HandoffError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// error codes
export const MISSING_STATE = 'MISSING_STATE';
export const MISSING_STOPPED_AT = 'MISSING_STOPPED_AT';

// Read + parse STATE.md
// Throws HandoffError if file missing or stopped_at absent
export function readHandoffState(projectRoot = process.cwd())
// Returns: { stopped_at: string, resume_file: string|null }

// Parse YAML frontmatter from STATE.md content string
// Returns raw frontmatter fields object
export function parseFrontmatter(content)

// Format human-readable summary
export function formatHandoffSummary(state)
// Returns: multiline string
```

### `lib/handoff-cli.mjs` API

```js
export async function main(args)
// args[0] === 'status' → print handoff state, exit 0 if resumable, exit 1 if not
// default → show help
```

### Test fixtures needed

```
tests/fixtures/state/
  valid-with-resume-file.md     — stopped_at set, resume_file set
  valid-no-resume-file.md       — stopped_at set, resume_file absent
  valid-resume-file-none.md     — stopped_at set, resume_file: None
  missing-stopped-at.md         — STATE.md exists but stopped_at absent
  empty-stopped-at.md           — stopped_at: ""
```

---

## Validation Architecture

### Test coverage plan

| Test | What it covers | Command |
|------|---------------|---------|
| `readHandoffState` happy path (with resume_file) | LIMIT-04 core | unit |
| `readHandoffState` happy path (no resume_file) | resume_file optional | unit |
| `readHandoffState` STATE.md missing → HandoffError MISSING_STATE | SC-3 | unit |
| `readHandoffState` stopped_at absent → HandoffError MISSING_STOPPED_AT | SC-3 | unit |
| `readHandoffState` stopped_at empty string → HandoffError | SC-3 | unit |
| `resume_file: None` treated as null | edge case | unit |
| `parseFrontmatter` parses key: value pairs | parsing correctness | unit |
| `formatHandoffSummary` output contains stopped_at | output format | unit |
| `HandoffError` has code property | error typing | unit |
| `handoff status` CLI exits 0 when resumable | SC-1 | integration |
| `handoff status` CLI exits 1 when no STATE.md | SC-3 | integration |
| All exports present on module | API contract | unit |

**Quick run:** `node --test tests/handoff.test.mjs`
**Full suite:** `node --test tests/*.test.mjs` (must stay ≥ 578 pass, ≤ 1 fail)

### Acceptance criteria for LIMIT-04

1. `lib/handoff.mjs` exports `readHandoffState`, `parseFrontmatter`, `formatHandoffSummary`, `HandoffError`, `MISSING_STATE`, `MISSING_STOPPED_AT`
2. Given a valid STATE.md with `stopped_at: "Phase X complete"`, `readHandoffState()` returns `{ stopped_at: 'Phase X complete', resume_file: null }`
3. Given missing STATE.md, `readHandoffState()` throws `HandoffError` with `code === 'MISSING_STATE'`
4. Given STATE.md with no `stopped_at`, `readHandoffState()` throws `HandoffError` with `code === 'MISSING_STOPPED_AT'`
5. `claude-dev-stack handoff status` exits 0 when resumable, 1 when not
6. All new tests pass: `node --test tests/handoff.test.mjs` shows ≥ 12 passing

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| STATE.md frontmatter evolves (nested fields) | Parse only top-level `stopped_at` and `resume_file`; ignore nested YAML |
| `resume_file` path is relative — may not resolve from cloud task cwd | Document: resolve relative to projectRoot; cloud task clones to project root |
| pre-existing install.test.mjs failure (1 fail) | Pre-existing; do not count against Phase 22 |

## RESEARCH COMPLETE
