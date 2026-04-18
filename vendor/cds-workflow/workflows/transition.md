<internal_workflow>

**This is an INTERNAL workflow — NOT a user-facing command.**

There is no `/cds-transition` command. This workflow is invoked automatically by
`execute-phase` during auto-advance, or inline by the orchestrator after phase
verification. Users should never be told to run `/cds-transition`.

**Valid user commands for phase progression:**
- `/cds-discuss-phase {N}` — discuss a phase before planning
- `/cds-plan-phase {N}` — plan a phase
- `/cds-execute-phase {N}` — execute a phase
- `/cds-progress` — see roadmap progress

</internal_workflow>

<required_reading>

**Read these files NOW:**

1. `.planning/STATE.md`
2. `.planning/PROJECT.md`
3. `.planning/ROADMAP.md`
4. Current phase's plan files (`*-PLAN.md`)
5. Current phase's summary files (`*-SUMMARY.md`)

</required_reading>

<purpose>

Mark current phase complete and advance to next. This is the natural point where progress tracking and PROJECT.md evolution happen.

"Planning next phase" = "current phase is done"

</purpose>

<process>

<step name="load_project_state" priority="first">

Before transition, read project state:

```bash
cat .planning/STATE.md 2>/dev/null || true
cat .planning/PROJECT.md 2>/dev/null || true
```

Parse current position to verify we're transitioning the right phase.
Note accumulated context that may need updating after transition.

</step>

<step name="verify_completion">

Check current phase has all plan summaries:

```bash
(ls .planning/phases/XX-current/*-PLAN.md 2>/dev/null || true) | sort
(ls .planning/phases/XX-current/*-SUMMARY.md 2>/dev/null || true) | sort
```

**Verification logic:**

- Count PLAN files
- Count SUMMARY files
- If counts match: all plans complete
- If counts don't match: incomplete

<config-check>

```bash
cat .planning/config.json 2>/dev/null || true
```

</config-check>

**Check for verification debt in this phase:**

```bash
# Count outstanding items in current phase
OUTSTANDING=""
for f in .planning/phases/XX-current/*-UAT.md .planning/phases/XX-current/*-VERIFICATION.md; do
  [ -f "$f" ] || continue
  grep -q "result: pending\|result: blocked\|status: partial\|status: human_needed\|status: diagnosed" "$f" && OUTSTANDING="$OUTSTANDING\n$(basename $f)"
done
```

**If OUTSTANDING is not empty:**

Append to the completion confirmation message (regardless of mode):

```
Outstanding verification items in this phase:
{list filenames}

These will carry forward as debt. Review: `/cds-audit-uat`
```

This does NOT block transition — it ensures the user sees the debt before confirming.

**If all plans complete:**

<if mode="yolo">

```
⚡ Auto-approved: Transition Phase [X] → Phase [X+1]
Phase [X] complete — all [Y] plans finished.

Proceeding to mark done and advance...
```

Proceed directly to cleanup_handoff step.

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

Ask: "Phase [X] complete — all [Y] plans finished. Ready to mark done and move to Phase [X+1]?"

Wait for confirmation before proceeding.

</if>

**If plans incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete plans is destructive — ALWAYS prompt regardless of mode.

Present:

```
Phase [X] has incomplete plans:
- {phase}-01-SUMMARY.md ✓ Complete
- {phase}-02-SUMMARY.md ✗ Missing
- {phase}-03-SUMMARY.md ✗ Missing

⚠️ Safety rail: Skipping plans requires confirmation (destructive action)

Options:
1. Continue current phase (execute remaining plans)
2. Mark complete anyway (skip remaining plans)
3. Review what's left
```

Wait for user decision.

</step>

<step name="cleanup_handoff">

Check for lingering handoffs:

```bash
ls .planning/phases/XX-current/.continue-here*.md 2>/dev/null || true
```

If found, delete them — phase is complete, handoffs are stale.

</step>

<step name="update_roadmap_and_state">

**Delegate ROADMAP.md and STATE.md updates to gsd-tools:**

```bash
TRANSITION=$(node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" phase complete "${current_phase}")
```

The CLI handles:
- Marking the phase checkbox as `[x]` complete with today's date
- Updating plan count to final (e.g., "3/3 plans complete")
- Updating the Progress table (Status → Complete, adding date)
- Advancing STATE.md to next phase (Current Phase, Status → Ready to plan, Current Plan → Not started)
- Detecting if this is the last phase in the milestone

Extract from result: `completed_phase`, `plans_executed`, `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
# Derive phase slug for bridge step
PHASE_DIR=$(ls -d .planning/phases/${completed_phase}-* 2>/dev/null | head -1)
completed_phase_slug=$(basename "$PHASE_DIR" | sed "s/^${completed_phase}-//")
completed_phase_name=$(echo "$completed_phase_slug" | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
```

</step>

<step name="bridge_decisions">

**Auto-populate vault ADR from phase decisions (non-blocking).**

If the completed phase has a CONTEXT.md with locked decisions (D-XX entries),
write them as an ADR file to the vault. This step is non-blocking — any failure
is logged but does not prevent transition.

**Detect project and vault:**

```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "")
```

**Invoke bridge:**

```javascript
// Run as inline ESM — transition.md operates within Claude Code's Node.js context
import { findVault } from './lib/projects.mjs';
import { bridgeDecisions } from './lib/adr-bridge.mjs';

const vaultPath = findVault();
const contextPath = `.planning/phases/${completed_phase_slug}/${completed_phase}-CONTEXT.md`;

try {
  const result = await bridgeDecisions({
    phaseNumber: completed_phase,
    phaseName: completed_phase_name,
    phaseSlug: completed_phase_slug,
    contextPath,
    vaultPath,
    projectName: PROJECT_NAME,
  });

  if (result.action === 'created') {
    info(`ADR bridge: wrote ${result.adrPath} (${result.decisionCount} decisions)`);
  } else if (result.action === 'noop') {
    info('ADR bridge: ADR already exists for this phase, skipping');
  }
  // 'skipped' is silent — no vault or no decisions
} catch (err) {
  warn(`ADR bridge failed (non-blocking): ${err.message}`);
}
```

**The bridge is invoked by reading the project's `lib/adr-bridge.mjs` relative to the git repo root.** The executor running transition.md has access to the project directory. Use `findVault()` from `lib/projects.mjs` per D-07. The completed phase number, name, and slug are available from the `update_roadmap_and_state` step result.

**Key constraints:**
- The try/catch ensures bridge failure NEVER blocks transition (per D-01 and research anti-patterns)
- Use `info()` for success, `warn()` for failure — consistent with GSD workflow output style
- The `completed_phase_slug` variable must be derived from the phase directory name (e.g., from `ls .planning/phases/{N}-*/ | head -1`)

</step>

<step name="archive_prompts">

If prompts were generated for the phase, they stay in place.
The `completed/` subfolder pattern from create-meta-prompts handles archival.

</step>

<step name="evolve_project">

Evolve PROJECT.md to reflect learnings from completed phase.

**Read phase summaries:**

```bash
cat .planning/phases/XX-current/*-SUMMARY.md
```

**Assess requirement changes:**

1. **Requirements validated?**
   - Any Active requirements shipped in this phase?
   - Move to Validated with phase reference: `- ✓ [Requirement] — Phase X`

2. **Requirements invalidated?**
   - Any Active requirements discovered to be unnecessary or wrong?
   - Move to Out of Scope with reason: `- [Requirement] — [why invalidated]`

3. **Requirements emerged?**
   - Any new requirements discovered during building?
   - Add to Active: `- [ ] [New requirement]`

4. **Decisions to log?**
   - Extract decisions from SUMMARY.md files
   - Add to Key Decisions table with outcome if known

5. **"What This Is" still accurate?**
   - If the product has meaningfully changed, update the description
   - Keep it current and accurate

**Update PROJECT.md:**

Make the edits inline. Update "Last updated" footer:

```markdown
---
*Last updated: [date] after Phase [X]*
```

**Example evolution:**

Before:

```markdown
### Active

- [ ] JWT authentication
- [ ] Real-time sync < 500ms
- [ ] Offline mode

### Out of Scope

- OAuth2 — complexity not needed for v1
```

After (Phase 2 shipped JWT auth, discovered rate limiting needed):

```markdown
### Validated

- ✓ JWT authentication — Phase 2

### Active

- [ ] Real-time sync < 500ms
- [ ] Offline mode
- [ ] Rate limiting on sync endpoint

### Out of Scope

- OAuth2 — complexity not needed for v1
```

**Step complete when:**

- [ ] Phase summaries reviewed for learnings
- [ ] Validated requirements moved from Active
- [ ] Invalidated requirements moved to Out of Scope with reason
- [ ] Emerged requirements added to Active
- [ ] New decisions logged with rationale
- [ ] "What This Is" updated if product changed
- [ ] "Last updated" footer reflects this transition

</step>

<step name="update_current_position_after_transition">

**Note:** Basic position updates (Current Phase, Status, Current Plan, Last Activity) were already handled by `gsd-tools phase complete` in the update_roadmap_and_state step.

Verify the updates are correct by reading STATE.md. If the progress bar needs updating, use:

```bash
PROGRESS=$(node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" progress bar --raw)
```

Update the progress bar line in STATE.md with the result.

**Step complete when:**

- [ ] Phase number incremented to next phase (done by phase complete)
- [ ] Plan status reset to "Not started" (done by phase complete)
- [ ] Status shows "Ready to plan" (done by phase complete)
- [ ] Progress bar reflects total completed plans

</step>

<step name="update_project_reference">

Update Project Reference section in STATE.md.

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current core value from PROJECT.md]
**Current focus:** [Next phase name]
```

Update the date and current focus to reflect the transition.

</step>

<step name="review_accumulated_context">

Review and update Accumulated Context section in STATE.md.

**Decisions:**

- Note recent decisions from this phase (3-5 max)
- Full log lives in PROJECT.md Key Decisions table

**Blockers/Concerns:**

- Review blockers from completed phase
- If addressed in this phase: Remove from list
- If still relevant for future: Keep with "Phase X" prefix
- Add any new concerns from completed phase's summaries

**Example:**

Before:

```markdown
### Blockers/Concerns

- ⚠️ [Phase 1] Database schema not indexed for common queries
- ⚠️ [Phase 2] WebSocket reconnection behavior on flaky networks unknown
```

After (if database indexing was addressed in Phase 2):

```markdown
### Blockers/Concerns

- ⚠️ [Phase 2] WebSocket reconnection behavior on flaky networks unknown
```

**Step complete when:**

- [ ] Recent decisions noted (full log in PROJECT.md)
- [ ] Resolved blockers removed from list
- [ ] Unresolved blockers kept with phase prefix
- [ ] New concerns from completed phase added

</step>

<step name="update_session_continuity_after_transition">

Update Session Continuity section in STATE.md to reflect transition completion.

**Format:**

```markdown
Last session: [today]
Stopped at: Phase [X] complete, ready to plan Phase [X+1]
Resume file: None
```

**Step complete when:**

- [ ] Last session timestamp updated to current date and time
- [ ] Stopped at describes phase completion and next phase
- [ ] Resume file confirmed as None (transitions don't use resume files)

</step>

<step name="offer_next_phase">

**MANDATORY: Verify milestone status before presenting next steps.**

**Use the transition result from `gsd-tools phase complete`:**

The `is_last_phase` field from the phase complete result tells you directly:
- `is_last_phase: false` → More phases remain → Go to **Route A**
- `is_last_phase: true` → Last phase done → **Check for workstream collisions first**

The `next_phase` and `next_phase_name` fields give you the next phase details.

If you need additional context, use:
```bash
ROADMAP=$(node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" roadmap analyze)
```

This returns all phases with goals, disk status, and completion info.

---

**Workstream collision check (when `is_last_phase: true`):**

Before routing to Route B, check whether other workstreams are still active.
This prevents one workstream from advancing or completing the milestone while
other workstreams are still working on their phases.

**Skip this check if NOT in workstream mode** (i.e., `GSD_WORKSTREAM` is not set / flat mode).
In flat mode, go directly to **Route B**.

```bash
# Only check if we're in workstream mode
if [ -n "$GSD_WORKSTREAM" ]; then
  WS_LIST=$(node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" workstream list --raw)
fi
```

Parse the JSON result. The output has `{ mode, workstreams: [...] }`.
Each workstream entry has: `name`, `status`, `current_phase`, `phase_count`, `completed_phases`.

Filter out the current workstream (`$GSD_WORKSTREAM`) and any workstreams with
status containing "milestone complete" or "archived" (case-insensitive).
The remaining entries are **other active workstreams**.

- **If other active workstreams exist** → Go to **Route B1**
- **If NO other active workstreams** (or flat mode) → Go to **Route B**

---

**Route A: More phases remain in milestone**

Read ROADMAP.md to get the next phase's name and goal.

**Always-on team execution (multi-phase):**

Detect all remaining pending phases and spawn a team to execute them with dependency-aware scheduling.

```bash
ROADMAP_DATA=$(node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" roadmap analyze)
```

Parse the JSON result. Collect all phases with status "pending" (not started, not complete) into a list called `PENDING_PHASES`. For each phase, extract:
- `number` — phase number (e.g., 15)
- `name` — phase name/slug
- `depends_on` — list of phase numbers this phase depends on
- `plan_count` — number of plans

**If 2+ pending phases found — spawn team:**

Use TeamCreate to create a milestone execution team. One member per pending phase.

**Step 1 — Create tasks with dependency mapping:**

For each pending phase, create a task via TaskCreate:
- `subject`: "Execute Phase {number}: {name}"
- `description`: "Run /cds-execute-phase {number}. Plans: {plan_count}. Depends on: {depends_on or 'nothing'}."

After creating all tasks, wire dependencies via TaskUpdate:
- For each phase whose `depends_on` includes another pending phase number, add `blockedBy` pointing to that phase's task ID.
- Phases that depend on already-completed phases have NO blockers (the dependency is already satisfied).
- Phases with no dependencies and no pending blockers start immediately.

**Step 2 — Spawn team members:**

Use TeamCreate with:
- `team_name`: "milestone-execution"
- `description`: "Execute all remaining milestone phases with dependency-aware scheduling"

For each pending phase, spawn a member via Agent tool:
- `name`: "phase-{number}-{slug}" (e.g., "phase-16-git-conventions")
- `isolation`: "worktree"
- `team_name`: "milestone-execution"
- `prompt`: "You are executing Phase {number}: {name}. Check your task status — if blocked, wait for dependencies to complete. When unblocked, run: /cds-execute-phase {number}. Report completion via SendMessage to the team lead when done."

Members with unblocked tasks start immediately. Members with blocked tasks idle until their blockers are marked complete.

**Step 3 — Team lead coordination:**

The team lead (this agent) monitors task completion:
- When a member completes its phase, mark its task as `completed` via TaskUpdate
- This automatically unblocks dependent members who were waiting
- Send completion notification to waiting members via SendMessage

**After team completion:**
- Collect results from all members
- Report successes: "Phase {X} completed successfully"
- Report failures: "Phase {Y} failed: {error}. Options: retry, skip, investigate"
- Partial success is valid (per D-08) — do not re-run successful phases
- User can retry failed phases individually (per D-09)

**If only 1 pending phase found — sequential execution:**

Skip team spawning. Fall through to the existing sequential Route A logic below (presenting next phase, yolo auto-continue, interactive prompt). This is the same behavior as before.

**If TeamCreate is not available in the runtime:**

Catch the error and fall back: `warn('Team execution not available in this runtime — running sequentially')`. Then proceed with existing sequential Route A logic below. This preserves backward compatibility with older Claude Code versions or restricted environments (per D-11).

**Check if next phase has CONTEXT.md:**

```bash
ls .planning/phases/*[X+1]*/*-CONTEXT.md 2>/dev/null || true
```

**If next phase exists:**

<if mode="yolo">

**If CONTEXT.md exists:**

```
Phase [X] marked complete.

Next: Phase [X+1] — [Name]

⚡ Auto-continuing: Plan Phase [X+1] in detail
```

Exit skill and invoke SlashCommand("/cds-plan-phase [X+1] --auto ${GSD_WS}")

**If CONTEXT.md does NOT exist:**

```
Phase [X] marked complete.

Next: Phase [X+1] — [Name]

⚡ Auto-continuing: Discuss Phase [X+1] first
```

Exit skill and invoke SlashCommand("/cds-discuss-phase [X+1] --auto ${GSD_WS}")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

**If CONTEXT.md does NOT exist:**

```
## ✓ Phase [X] Complete

---

## ▶ Next Up

**Phase [X+1]: [Name]** — [Goal from ROADMAP.md]

`/clear` then:

`/cds-discuss-phase [X+1] ${GSD_WS}` — gather context and clarify approach

---

**Also available:**
- `/cds-plan-phase [X+1] ${GSD_WS}` — skip discussion, plan directly
- `/cds-research-phase [X+1] ${GSD_WS}` — investigate unknowns

---
```

**If CONTEXT.md exists:**

```
## ✓ Phase [X] Complete

---

## ▶ Next Up

**Phase [X+1]: [Name]** — [Goal from ROADMAP.md]
<sub>✓ Context gathered, ready to plan</sub>

`/clear` then:

`/cds-plan-phase [X+1] ${GSD_WS}`

---

**Also available:**
- `/cds-discuss-phase [X+1] ${GSD_WS}` — revisit context
- `/cds-research-phase [X+1] ${GSD_WS}` — investigate unknowns

---
```

</if>

---

**Route B1: Workstream done, other workstreams still active**

This route is reached when `is_last_phase: true` AND the collision check found
other active workstreams. Do NOT suggest completing the milestone or advancing
to the next milestone — other workstreams are still working.

**Clear auto-advance chain flag** — workstream boundary is the natural stopping point:

```bash
node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" config-set workflow._auto_chain_active false
```

<if mode="yolo">

Override auto-advance: do NOT auto-continue to milestone completion.
Present the blocking information and stop.

</if>

Present (all modes):

```
## ✓ Phase {X}: {Phase Name} Complete

This workstream's phases are complete. Other workstreams are still active:

| Workstream | Status | Phase | Progress |
|------------|--------|-------|----------|
| {name}     | {status} | {current_phase} | {completed_phases}/{phase_count} |
| ...        | ...    | ...   | ...      |

---

## Next Steps

Archive this workstream:

`/cds-workstreams complete {current_ws_name} ${GSD_WS}`

See overall milestone progress:

`/cds-workstreams progress ${GSD_WS}`

<sub>Milestone completion will be available once all workstreams finish.</sub>

---
```

Do NOT suggest `/cds-complete-milestone` or `/cds-new-milestone`.
Do NOT auto-invoke any further slash commands.

**Stop here.** The user must explicitly decide what to do next.

---

**Route B: Milestone complete (all phases done)**

**This route is only reached when:**
- `is_last_phase: true` AND no other active workstreams exist (or flat mode)

**Clear auto-advance chain flag** — milestone boundary is the natural stopping point:

```bash
node "$HOME/.claude/cds-workflow/bin/cds-tools.cjs" config-set workflow._auto_chain_active false
```

<if mode="yolo">

```
Phase {X} marked complete.

🎉 Milestone {version} is 100% complete — all {N} phases finished!

⚡ Auto-continuing: Complete milestone and archive
```

Exit skill and invoke SlashCommand("/cds-complete-milestone {version} ${GSD_WS}")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

```
## ✓ Phase {X}: {Phase Name} Complete

🎉 Milestone {version} is 100% complete — all {N} phases finished!

---

## ▶ Next Up

**Complete Milestone {version}** — archive and prepare for next

`/clear` then:

`/cds-complete-milestone {version} ${GSD_WS}`

---

**Also available:**
- Review accomplishments before archiving

---
```

</if>

</step>

</process>

<implicit_tracking>
Progress tracking is IMPLICIT: planning phase N implies phases 1-(N-1) complete. No separate progress step—forward motion IS progress.
</implicit_tracking>

<partial_completion>

If user wants to move on but phase isn't fully complete:

```
Phase [X] has incomplete plans:
- {phase}-02-PLAN.md (not executed)
- {phase}-03-PLAN.md (not executed)

Options:
1. Mark complete anyway (plans weren't needed)
2. Defer work to later phase
3. Stay and finish current phase
```

Respect user judgment — they know if work matters.

**If marking complete with incomplete plans:**

- Update ROADMAP: "2/3 plans complete" (not "3/3")
- Note in transition message which plans were skipped

</partial_completion>

<success_criteria>

Transition is complete when:

- [ ] Current phase plan summaries verified (all exist or user chose to skip)
- [ ] Any stale handoffs deleted
- [ ] ROADMAP.md updated with completion status and plan count
- [ ] PROJECT.md evolved (requirements, decisions, description if needed)
- [ ] STATE.md updated (position, project reference, context, session)
- [ ] Progress table updated
- [ ] User knows next steps

</success_criteria>
