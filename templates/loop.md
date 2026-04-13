# GSD Maintenance Loop

This file is executed by scheduled Claude Code tasks (Desktop tasks or Cloud tasks) to continue unfinished work or run maintenance.

## Instructions for Claude

When this loop runs, follow these steps in order:

### Step 1: Check for stopped work

Read `.planning/STATE.md`. Look for `stopped_at` and `resume_file` fields.

If `stopped_at` is present and non-empty:
- Load `resume_file` if specified (provides additional context about what was in progress)
- Run `/gsd-resume-work` to continue from where the session stopped
- Report: "Resumed from: {stopped_at}"

If `stopped_at` is absent or empty (no interrupted work):
- Continue to Step 2 (maintenance tasks)

### Step 2: Maintenance tasks (if no stopped work)

Run in order:

1. **Check open PRs** — Review any open pull requests in the repository:
   - Run: `gh pr list` to see open PRs
   - For each ready PR: check CI status, merge if green and approved, close if stale
   - Report PR status summary

2. **Advance milestone** — Run `/gsd-next` to check if there are pending phases to plan or execute

3. **Health check** — Run `/gsd-health` to verify project health (test baseline, coverage, known issues)

### Step 3: Report

After completing steps above, output a summary:
- Work resumed: yes/no (and what was resumed)
- PRs handled: N merged, N closed, N pending
- Milestone status: next phase or "milestone complete"
- Health: green/warnings/issues

## Notes

- This file is managed by claude-dev-stack. Edit to customize your maintenance loop.
- Scheduled tasks run autonomously — all state must be in git (GSD guarantees this).
- Cloud tasks start from a fresh git clone — no local-only state is available.
- To reschedule: run `claude-dev-stack budget continue` and choose Auto-continue option.
