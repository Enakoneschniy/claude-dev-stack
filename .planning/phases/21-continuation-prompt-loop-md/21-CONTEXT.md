# Phase 21: Continuation Prompt & loop.md — Context

**Gathered:** 2026-04-13 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

When the budget-check hook (Phase 20, LIMIT-01) fires a warning, the user must be able to choose one of 4 continuation paths. Additionally, the install wizard gains an opt-in step to install `loop.md` to the project's `.claude/` directory.

Two independent sub-features in this phase:
1. **LIMIT-02**: 4-option continuation prompt (triggered by budget warning)
2. **LIMIT-03**: loop.md template installation via wizard

Both sub-features are safe to implement in parallel during planning.

</domain>

<prior_decisions>
## Project-Level Constraints

- Single-dep constraint: `prompts@^2.4.2` only — no new JS runtime dependencies.
- All new `lib/*.mjs` files need matching `tests/*.test.mjs` (test baseline: 558).
- Hooks must be self-contained (no arbitrary lib imports except via relative path from within the package).
- Branching strategy: `gsd/phase-21-*` branches.
- No Co-Authored-By in commits.

## From Phase 20 (Budget Detection)

- Budget check runs as a PostToolUse hook (`hooks/budget-check.mjs`).
- Warning fires once per session per threshold crossing (state in `~/.claude/budget-state.json`).
- `lib/budget.mjs` — budget utilities: `parseUsage`, `computePercent`, `shouldWarn`, `formatWarning`, `loadState`, `saveState`, `loadThreshold`.
- Warning is printed to stdout from the hook — Claude Code renders it to the user.
- The budget hook does NOT currently block execution — it just prints a warning.

## From Phase 18.1 (TeamCreate / Parallel Execution)

- Pattern for consent before action: transition.md shows how to offer parallel execution choices before spawning. Same "AskUserQuestion/choose an option" pattern applies here.

</prior_decisions>

<decisions>
## Implementation Decisions

### LIMIT-02: 4-Option Continuation Prompt

**D-01: Trigger mechanism**
[auto] The continuation prompt is a separate skill/command (`claude-dev-stack budget continue` or `/budget-continue`) that the user invokes manually, OR that is printed as a suggested next step at the end of the budget warning message from `budget-check.mjs`. The hook appends a line like: "Run `claude-dev-stack budget continue` to choose your next step." This keeps the hook non-interactive (hooks cannot use AskUserQuestion) while still making the continuation prompt discoverable.

**D-02: Prompt mechanism**
[auto] The continuation prompt is implemented as a Node.js ESM CLI command (`claude-dev-stack budget continue`) in `lib/budget-cli.mjs` (extending existing module). It uses `prompts` (existing dep) for interactive selection. When running inside a Claude Code session, it can also be invoked as a skill (`/budget-continue`) if a corresponding skill file is created.

**D-03: 4 options — exact behavior**
[auto] Following SEED-001 design exactly:
1. **Remind me later** — Uses `CronCreate` to set a one-shot reminder (user provides time or defaults to "+1h"). The reminder fires and notifies: "Session limit was reached. Resume your GSD session."
2. **Auto-continue locally** — Creates a Desktop scheduled task that fires at reset time and runs `claude --dangerously-skip-permissions -p "/gsd-resume-work"` (or equivalent GSD resume command). Machine must be on.
3. **Auto-continue in cloud** — Creates a Cloud scheduled task that clones the repo (git URL from git remote) and runs the GSD resume command autonomously. Works when machine is off.
4. **Continue now** — No scheduling action. Prints: "Continuing with extra usage. Consider compressing context soon." Returns without further action.

**D-04: CronCreate / Desktop / Cloud task wiring**
[auto] Use Claude Code's native scheduling primitives:
- `CronCreate` for the reminder (option 1) — one-shot with `repeat: false` or a near-future datetime.
- Desktop task (option 2) — scheduled via Claude Code's Desktop task API (fires on local machine).
- Cloud task (option 3) — scheduled via Claude Code's Cloud task API (fires on Anthropic infra, fresh clone).
- All scheduling is invoked from within the skill/CLI command using the appropriate tool calls.

**D-05: What the scheduled task runs (options 2 and 3)**
[auto] The scheduled task prompt is: `/gsd-resume-work` (or the full GSD resume instruction). STATE.md is already in git with `stopped_at` and `resume_file` — Phase 22 handles the actual state-reading logic. Phase 21's job is to schedule the task correctly and pass the right prompt.

**D-06: User input during prompt**
[auto] For option 1 (remind later): ask for delay (e.g., "in 1 hour", "in 2 hours", "when reset happens"). Default: 1 hour.
For options 2 and 3: ask for schedule time. Default: 1 hour from now (approximating session reset window).
For option 4: no input needed.

**D-07: Implementation file structure**
[auto]
- Extend `lib/budget-cli.mjs` with a `continue` subcommand handler (`budgetContinue()`).
- New `lib/continuation.mjs` — contains `showContinuationPrompt()`, option handlers, scheduling logic. Keeps budget-cli.mjs thin.
- New skill file (if needed): `skills/budget-continue/` — thin wrapper calling `claude-dev-stack budget continue`.
- Extend `hooks/budget-check.mjs` to append the "Run ... to choose" suggestion to the warning message (or add it to `formatWarning()` in `lib/budget.mjs`).

**D-08: Error handling**
[auto] If CronCreate / Desktop task / Cloud task fails (tool unavailable, permission denied):
- Print a clear error message explaining what failed.
- Offer fallback: "Copy this command to run manually: ..."
- Never crash — always exit 0.

**D-09: Skill vs CLI-only**
[auto] Implement as CLI first (`claude-dev-stack budget continue`). Also create a thin skill file `/budget-continue` that runs `claude-dev-stack budget continue` so users can invoke it from within a Claude Code session. Skill file lives in the package's `skills/` directory.

### LIMIT-03: loop.md Template

**D-10: loop.md content**
[auto] The template provides a GSD-aware maintenance loop for scheduled/recurring tasks. Contents:
- Check GSD state: read `.planning/STATE.md` for `stopped_at` and `resume_file`.
- If stopped work found: resume from `stopped_at` using `resume_file` as context.
- If no stopped work: run maintenance tasks in order: (1) check open PRs → merge/close, (2) run `/gsd-next` to advance current milestone, (3) run `/gsd-health` to check project health.
- Loop completes and exits cleanly (scheduled tasks are one-shot by nature).

**D-11: Installation mechanism**
[auto] The install wizard gets a new optional step in `selectComponents` (or after GSD selection): "Install loop.md for scheduled tasks?". If yes, copy `templates/loop.md` from the package to `{projectDir}/.claude/loop.md`. If file already exists, offer: "(already installed) — overwrite?".

**D-12: Template location in package**
[auto] Ship as `templates/loop.md` in the package root (alongside existing templates). Wizard reads it from `PKG_ROOT/templates/loop.md` and copies to the project.

**D-13: loop.md only offered when GSD is installed**
[auto] The loop.md install option should only be shown if GSD component was selected (or already installed). A loop.md without GSD is meaningless. Wizard checks `installState.gsdInstalled` before showing the option.

**D-14: When to install loop.md during wizard**
[auto] Offer it at the end of the wizard, after GSD is confirmed installed, as a final "optional extras" step. Keeps wizard flow clean — don't interrupt the main component selection flow.

### Claude's Discretion

- Exact `prompts` call structure for the 4-option menu (single-select)
- Whether `continuation.mjs` uses named exports or a single default
- Exact wording of the reminder / task prompt strings
- Whether the skill wraps the CLI call via `bash` or via `node` directly

</decisions>

<canonical_refs>
## Canonical References

### Phase 20 — Budget Detection (baseline)
- `hooks/budget-check.mjs` — PostToolUse hook (extend to add "run budget continue" suggestion)
- `lib/budget.mjs` — budget utilities (extend `formatWarning`)
- `lib/budget-cli.mjs` — CLI entry (add `continue` subcommand)
- `tests/budget.test.mjs` — existing tests (do not break)

### Install Wizard
- `bin/install.mjs` — main wizard orchestrator
- `lib/install/components.mjs` — `selectComponents()` (add loop.md step)
- `lib/install/detect.mjs` — `detectInstallState()` (check if loop.md already installed)

### Templates
- `templates/` — existing templates directory (add `loop.md` here)

### Scheduling Primitives (Claude Code native tools)
- `CronCreate` — one-shot or recurring reminder
- Desktop task — local scheduled execution
- Cloud task — remote scheduled execution (fresh git clone)

### SEED-001 Design Reference
- `.planning/seeds/SEED-001-delegated-execution-service.md` — 4-option UX design, scheduling tier table

### Prior Phase Context
- `.planning/phases/18.1-always-on-teamcreate-execution/18.1-CONTEXT.md` — consent-before-action pattern

</canonical_refs>

<deferred>
## Deferred / Out of Scope

- Per-project budget thresholds (deferred to future requirements)
- Web dashboard for monitoring scheduled tasks (SEED-001 future scope)
- Budget prediction — estimate remaining phases vs remaining budget (future)
- Two-way sync with external schedulers (out of scope)
- Managed Agents integration (SEED-001 notes: deferred until GA and stable)

</deferred>

<auto_log>
## Auto-Selected Choices (--auto mode)

- [auto] No existing CONTEXT.md found — proceeding with fresh context capture.
- [auto] No existing plans found — proceeding directly to context capture.
- [auto] No matching todos found for Phase 21.
- [auto] D-01: Hook appends CLI suggestion to warning (non-interactive hook constraint).
- [auto] D-02: CLI + skill dual-surface approach using existing `prompts` dep.
- [auto] D-03: 4-option prompt following SEED-001 spec exactly.
- [auto] D-04: Native Claude Code scheduling primitives (CronCreate, Desktop, Cloud).
- [auto] D-05: Scheduled task runs `/gsd-resume-work` — STATE.md handling deferred to Phase 22.
- [auto] D-09: CLI-first, skill as thin wrapper.
- [auto] D-11: New wizard step in selectComponents / post-GSD install.
- [auto] D-13: loop.md only offered when GSD is installed.

</auto_log>
