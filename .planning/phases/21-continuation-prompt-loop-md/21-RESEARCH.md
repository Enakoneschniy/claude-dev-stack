# Phase 21: Continuation Prompt & loop.md — Research

**Researched:** 2026-04-14
**Domain:** Claude Code scheduling tools (CronCreate, RemoteTrigger), skill invocation patterns, budget hook output
**Confidence:** MEDIUM — CronCreate schema HIGH (official docs), RemoteTrigger schema LOW (deferred tool, no public spec found)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `hooks/budget-check.mjs` adds a hint line to the warning output:
  `→ /budget-continue — choose what to do`
  Appended as a separate line after the existing `⚠ BUDGET WARNING: ...` output so Claude sees it in session context.
- **D-02:** Hint appears ONLY when the warning fires (same condition as today).
- **D-03:** `skills/budget-continue/SKILL.md` is rewritten so Claude invokes scheduling tools **directly** when the user selects an option — no copy-paste instructions.
- **D-04:** Tool mapping:
  - Option 1 "Remind me later" → `CronCreate`
  - Option 2 "Auto-continue locally" → `RemoteTrigger` (desktop variant)
  - Option 3 "Auto-continue in cloud" → `RemoteTrigger` (cloud variant)
  - Option 4 "Continue now" → no tool call
- **D-05:** Researcher reads RemoteTrigger docs to determine desktop vs cloud parameter distinction.
- **D-06:** `lib/continuation.mjs` remains unchanged — CLI fallback only, not modified in Phase 21.
- **D-07:** `installLoopMd()` already satisfies LIMIT-03 — no new code needed.
- **D-08:** Phase 21 verification task: run wizard and confirm LIMIT-03 success criterion #5 is met.

### Claude's Discretion

- Exact CronCreate parameters (title, prompt string, repeat flag)
- RemoteTrigger parameter schema for desktop vs cloud (researcher resolves from CC docs)
- Delay options presented to user in the skill (current +1h/+2h/+4h is acceptable)

### Deferred Ideas (OUT OF SCOPE)

- "At budget reset" timing option in the continuation prompt
- loop.md template customization via wizard UI
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIMIT-02 | When budget warning fires, user is presented with 4 continuation options triggering CronCreate / RemoteTrigger / no-op | CronCreate schema documented (HIGH). RemoteTrigger schema partially inferred (LOW). Skill rewrite pattern established from codebase study. |
| LIMIT-03 | Install wizard offers loop.md template installed to project `.claude/` directory | `installLoopMd()` already complete. `templates/loop.md` already exists. Verification-only. |
</phase_requirements>

---

## Summary

Phase 21 has two parallel workstreams: (1) wire the budget warning hook to surface `/budget-continue` to Claude so the skill can be invoked, and (2) verify the already-implemented loop.md install path satisfies LIMIT-03.

For LIMIT-02, the hook change is minimal — a single `process.stdout.write` line appended after the existing warning. The skill rewrite is the substantive work: `skills/budget-continue/SKILL.md` must be rewritten from "print instructions for the user" to "Claude invokes tools directly." CronCreate schema is well-documented in official CC docs. RemoteTrigger is a deferred tool with no public schema — the current SKILL.md already contains a pragmatic approximation that matches what is known from GitHub issues and changelog entries.

For LIMIT-03, `installLoopMd()` in `lib/install/components.mjs` (lines 99–215) is complete and already wired at `bin/install.mjs` line 132. The `templates/loop.md` source file exists. The verification task is a manual UAT run.

**Primary recommendation:** Rewrite SKILL.md to call tools directly using the patterns documented below; keep the hint-line change to budget-check.mjs minimal. Do not modify lib/continuation.mjs.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | — | File I/O in budget-check.mjs | Already used throughout project |
| `prompts` | ^2.4.2 | Select menus in CLI | Project single-dep constraint |

**No new dependencies.** The project enforces a single-dep constraint (`prompts@^2.4.2` only). [VERIFIED: STATE.md `## Decisions`]

### CC Tools Available in Session (LIMIT-02)

| Tool | Availability | Purpose |
|------|-------------|---------|
| `CronCreate` | Standard tool (always loaded) | Session-scoped one-shot reminder |
| `RemoteTrigger` | Deferred tool (load via ToolSearch first) | Desktop and cloud scheduled tasks |
| `AskUserQuestion` | Standard tool | Present 4-option menu to user |

---

## Architecture Patterns

### Pattern 1: Skill as Direct Tool Invocation (LIMIT-02)

The rewrite target is `skills/budget-continue/SKILL.md`. The pattern used by GSD skills (e.g., `gsd-resume-work`) is:

1. YAML frontmatter declares `allowed-tools` — this is the whitelist Claude uses.
2. The body is plain markdown that Claude reads as instructions.
3. Instructions say "use Tool X with parameters Y" — Claude then calls the tool directly.

There are **no** examples in the project's skills that invoke CronCreate or RemoteTrigger. The SKILL.md already has the correct prose structure; it needs to be upgraded from "print instructions" to "invoke tool directly."

**Pattern for CronCreate (one-shot reminder):**

The skill body instructs Claude to call `CronCreate` with:
- `cron`: a relative offset converted to the nearest cron expression (e.g., "+1h" → next full hour)
- `prompt`: `"/budget-continue"` — re-invokes the skill when the timer fires
- `recurring`: `false` — one-shot

[CITED: https://code.claude.com/docs/en/scheduled-tasks]

```
CronCreate parameters (from official docs + GitHub issue #40228):
  cron       (string, required)  — 5-field cron expression
  prompt     (string, required)  — what to run when the task fires
  recurring  (boolean)           — true for repeating, false for one-shot
  durable    (boolean)           — documented but NOT IMPLEMENTED (bug #40228)
```

**Important:** The `durable` parameter appears in the schema but is silently ignored at runtime — tasks always die when the session exits. Skill must NOT present CronCreate as "persisting across restarts." [VERIFIED: GitHub issue #40228]

**Schedule offset conversion table (for skill discretion):**

| User choice | Cron expression (approximately) |
|-------------|----------------------------------|
| +1h | `0 {next_hour} * * *` — Claude infers |
| +2h | natural language works ("in 2 hours") |
| +4h | natural language works ("in 4 hours") |

Official docs state: "For one-shot reminders, describe what you want in natural language instead of using `/loop`. Claude schedules a single-fire task." This means Claude can handle `"remind me in 1 hour"` — no need for the skill to compute a cron expression manually. [CITED: https://code.claude.com/docs/en/scheduled-tasks#set-a-one-time-reminder]

---

### Pattern 2: RemoteTrigger Tool (LIMIT-02 — LOW confidence)

**Critical finding:** `RemoteTrigger` is a **deferred tool** in Claude Code — its schema is NOT loaded at session start. The skill must instruct Claude to call `ToolSearch` first to load the schema before calling `RemoteTrigger`. [CITED: https://raw.githubusercontent.com/marckrenn/claude-code-changelog/main/cc-prompt.md — deferred tools section]

**Known facts about RemoteTrigger (from GitHub issues + changelog):**

| Fact | Source | Confidence |
|------|--------|------------|
| Tool name is `RemoteTrigger` | changelog v2.1.107 bugfix | HIGH |
| Has an `action` parameter | GitHub issue #43440 | MEDIUM |
| Supported actions include: `list`, `get`, `create`, `update` | GitHub issue #43440 | MEDIUM |
| Has a `run` action (recently fixed) | changelog v2.1.107 | HIGH |
| Creates cloud scheduled tasks (on `/v1/code/triggers` endpoint) | GitHub issue #43440 | MEDIUM |
| Desktop tasks use the Desktop app UI or `/schedule` CLI command | official docs | HIGH |
| RemoteTrigger authenticates via claude.ai OAuth (not API key) | GitHub issues #43802, #39404 | HIGH |

**Critical gap: Desktop vs Cloud distinction.**

Based on research findings:
- `RemoteTrigger` operates against Anthropic's cloud API (`/v1/code/triggers`) — it creates **cloud tasks only**.
- **Desktop (local) scheduled tasks** are created via: (a) Desktop app UI, (b) `/schedule` CLI command in a session, or (c) writing a SKILL.md to `~/.claude/scheduled-tasks/<task-name>/`. There is NO evidence of a `RemoteTrigger` parameter that creates local/desktop tasks. [CITED: https://code.claude.com/docs/en/desktop-scheduled-tasks]

**Implication for D-04:** The CONTEXT.md decision maps:
- Option 2 "Auto-continue locally" → `RemoteTrigger (desktop variant)`
- Option 3 "Auto-continue in cloud" → `RemoteTrigger (cloud variant)`

Research suggests these may map to **different mechanisms**, not one tool with a type parameter:
- Option 2 (local) → instruct Claude to use `/schedule` command (creates a Desktop task)
- Option 3 (cloud) → use `RemoteTrigger` tool with `action: "create"` (creates cloud trigger)

**Flag for planner:** D-04's "RemoteTrigger (desktop variant)" assumption needs fallback. If `/schedule` is the correct mechanism for Desktop tasks, the skill should call it. The `RemoteTrigger` tool likely only covers cloud tasks.

---

### Pattern 3: AskUserQuestion for Option Selection

The skill must present the 4-option menu. Official CC tool available: `AskUserQuestion` — asks multiple-choice questions. The SKILL.md should instruct Claude to use this tool before invoking any scheduling tool.

```
AskUserQuestion: present 4 options
  1. Remind me later (CronCreate)
  2. Auto-continue locally (Desktop task)
  3. Auto-continue in cloud (Cloud task)
  4. Continue now
```

---

### Pattern 4: Skill YAML Frontmatter

GSD skills use `allowed-tools` frontmatter. The rewritten `SKILL.md` must declare the tools Claude is allowed to use:

```yaml
---
name: budget-continue
description: >
  Show 4-option continuation prompt when session budget is low.
  [...]
allowed-tools:
  - AskUserQuestion
  - CronCreate
  - ToolSearch
  - Bash
---
```

`ToolSearch` must be in the list because RemoteTrigger is deferred.

[CITED: https://code.claude.com/docs/en/skills — allowed-tools frontmatter reference; verified against gsd-resume-work/SKILL.md pattern in codebase]

---

### Pattern 5: budget-check.mjs Hint Line (D-01)

Current output (line 79 in `hooks/budget-check.mjs`):
```javascript
const warning = `⚠ BUDGET WARNING: ${alerts.join(', ')} (threshold: ${threshold}%)`;
process.stdout.write(warning);
```

Target output (two separate lines, D-01):
```
⚠ BUDGET WARNING: 5h: 85%, 7d: 72% (threshold: 70%)
→ /budget-continue — choose what to do
```

Implementation: change `process.stdout.write(warning)` to:
```javascript
process.stdout.write(warning + '\n→ /budget-continue — choose what to do');
```

The hook already exits 0 always. No other changes needed. [VERIFIED: hooks/budget-check.mjs lines 79–83]

---

### Anti-Patterns to Avoid

- **Calling RemoteTrigger without ToolSearch first:** It is a deferred tool and will throw `InputValidationError`. The skill must call `ToolSearch` with `"select:RemoteTrigger"` before attempting to use it.
- **Presenting CronCreate as durable:** The `durable` parameter is a documented bug — it does nothing. CronCreate tasks are session-scoped only.
- **Modifying lib/continuation.mjs:** Locked as out of scope (D-06). The skill and the CLI are separate invocation paths.
- **Adding process.stdout.write newlines that break hook output:** UserPromptSubmit hooks pipe stdout back to Claude. Adding `\n` before the hint line is safe; Claude reads the full output as a block.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session-scoped reminders | Custom timer/interval loop | `CronCreate` | CC native, no file persistence needed |
| Cloud scheduled task creation | REST API calls to Anthropic | `RemoteTrigger` (after ToolSearch) | Native tool, handles auth |
| Desktop scheduled task creation | Writing SKILL.md to disk | `/schedule` CLI command | Creates task with proper registration |
| Multi-choice prompt in skill | Markdown numbered list | `AskUserQuestion` | Structured, enforces valid choice |

---

## LIMIT-03 Verification: What Already Exists

`installLoopMd()` is fully implemented. No code changes needed. [VERIFIED: lib/install/components.mjs lines 99–215]

**What the function does:**
1. Checks `projects` array for eligible paths.
2. Checks `templates/loop.md` exists in pkgRoot. [VERIFIED: templates/loop.md exists]
3. Splits into new vs already-installed projects (using `loopMdByProject` state).
4. Bulk select for new projects: "Install for all N?" → copies `templates/loop.md` to `{project}/.claude/loop.md`.
5. Bulk select for already-installed: "Overwrite?" prompt.

**Wiring in bin/install.mjs (lines 131–133):**
```javascript
if (components.gsd || installState.gsdInstalled) {
  await installLoopMd(stepNum++, totalSteps, PKG_ROOT, projectsData?.projects || [], installState.loopMdByProject || {});
}
```

**LIMIT-03 success criterion #5:** "User running the install wizard can choose to install `loop.md` to their project `.claude/` directory." This is satisfied when GSD is selected or already installed — the user gets a prompt (bulk or per-project). [VERIFIED: components.mjs lines 116–166]

**Verification task:** Run `npm run install` (or `node bin/install.mjs`), select GSD + at least one project, confirm loop.md prompt appears and file is created.

---

## Common Pitfalls

### Pitfall 1: RemoteTrigger is a Deferred Tool
**What goes wrong:** Skill instructs Claude to call `RemoteTrigger` directly → Claude gets `InputValidationError` because the tool schema is not loaded.
**Why it happens:** CC defers some tool schemas to reduce context window usage. RemoteTrigger is in the deferred set.
**How to avoid:** Skill must explicitly instruct: "First call `ToolSearch` with query `'select:RemoteTrigger'` to load the tool schema, then call `RemoteTrigger`."
**Warning signs:** `InputValidationError` on tool call, "tool schema not loaded" error in session.

### Pitfall 2: CronCreate durable Flag Does Nothing
**What goes wrong:** Skill says "set durable: true to persist across restarts" → user closes session → reminder is lost.
**Why it happens:** Known bug (GitHub #40228) — durable parameter is silently ignored.
**How to avoid:** Skill documentation must NOT mention durable persistence. CronCreate is session-scoped only.
**Warning signs:** User reports reminder never fired after restarting CC.

### Pitfall 3: Desktop vs Cloud Task Mechanism Confusion
**What goes wrong:** Skill instructs Claude to use `RemoteTrigger` for desktop tasks → tool creates a cloud task (if it even supports desktop tasks) or fails.
**Why it happens:** No official doc confirms RemoteTrigger can create local/desktop tasks. Desktop tasks are created differently (Desktop app UI, `/schedule` command, or direct file write).
**How to avoid:** For Option 2 (local), use `/schedule` command or instruct user to create via Desktop app. Only use RemoteTrigger for Option 3 (cloud).
**Warning signs:** "Local" task fires on cloud instead of local machine; machine-off behavior.

### Pitfall 4: Hint Line Breaking Hook Output Parsing
**What goes wrong:** Adding `\n` changes the hook's stdout format → downstream processing breaks.
**Why it happens:** UserPromptSubmit hooks have their stdout injected into the session transcript. Claude reads the full block.
**How to avoid:** Use `\n` as a line separator only (not double-newline). Test by checking hook output with `echo '{"session_id":"test"}' | node hooks/budget-check.mjs`.
**Warning signs:** Warning text appears garbled in session, hint line appears on wrong line.

### Pitfall 5: installLoopMd Called Without detectInstallState.loopMdByProject
**What goes wrong:** If `installState.loopMdByProject` is not populated, all projects appear as "new" even on re-install → duplicate installs.
**Why it happens:** The function depends on pre-populated install state. [VERIFIED: components.mjs line 116]
**How to avoid:** Verification must include a re-install scenario to confirm already-installed projects show overwrite prompt.

---

## Code Examples

### CronCreate invocation (in SKILL.md prose)

[CITED: https://code.claude.com/docs/en/scheduled-tasks#manage-scheduled-tasks]

```
Use CronCreate with these parameters:
  cron:       (natural language offset like "in 1 hour" — Claude converts to cron expression)
  prompt:     "/budget-continue"
  recurring:  false
```

### RemoteTrigger invocation (in SKILL.md prose)

[ASSUMED — based on GitHub issue #43440 action schema]

```
First use ToolSearch with query "select:RemoteTrigger" to load the tool schema.
Then use RemoteTrigger with:
  action: "create"
  body:   { prompt: "/gsd-resume-work", schedule: "+1h", repo: <git remote origin URL> }
```

### /schedule command for Desktop tasks (in SKILL.md prose)

[CITED: https://code.claude.com/docs/en/desktop-scheduled-tasks — tasks created via /schedule or Desktop app UI]

```
To create a Desktop (local) scheduled task, use the /schedule command:
  /schedule: "Run /gsd-resume-work in 1 hour on my local machine"
```

### budget-check.mjs hint line addition

[VERIFIED: hooks/budget-check.mjs line 79-80]

```javascript
// Before (line 79):
const warning = `⚠ BUDGET WARNING: ${alerts.join(', ')} (threshold: ${threshold}%)`;
process.stdout.write(warning);

// After:
const warning = `⚠ BUDGET WARNING: ${alerts.join(', ')} (threshold: ${threshold}%)`;
process.stdout.write(warning + '\n→ /budget-continue — choose what to do');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual copy-paste of scheduling instructions | Skill invokes tools directly | Phase 21 | User gets seamless tool invocation |
| Session-scoped only (CronCreate) | Cloud + Desktop durable tasks via separate mechanisms | v2.1.x | Different tools for different persistence needs |
| Separate loop.md at global level | Per-project `.claude/loop.md` takes precedence | CC v2.x | Project-specific maintenance loop possible |

**Deprecated/outdated:**
- `CronCreate durable: true` — documented in schema but never implemented. Treat as non-functional.
- Old SKILL.md pattern (print instructions) — Phase 21 replaces with direct tool invocation.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RemoteTrigger `action: "create"` with a `body` parameter creates cloud scheduled tasks | Architecture Patterns / Pattern 2 | Skill fails with InputValidationError or wrong parameter name; planner should include fallback prose option |
| A2 | RemoteTrigger does NOT support creating Desktop (local) tasks — those require `/schedule` command | Pattern 2 / Pitfall 3 | Option 2 "Auto-continue locally" maps to wrong tool; task ends up on cloud |
| A3 | `ToolSearch` with `"select:RemoteTrigger"` loads the RemoteTrigger schema correctly | Pattern 1 | Skill instructs ToolSearch but tool remains unavailable |
| A4 | `/schedule` command in a CC session creates a Desktop scheduled task | Pattern 3 / Don't Hand-Roll | Option 2 mechanism is wrong |
| A5 | `process.stdout.write(warning + '\n→ /budget-continue...')` is safe for UserPromptSubmit hook output | Code Examples | Hook output format breaks; hint line not visible to Claude |

---

## Open Questions

1. **Does RemoteTrigger support a "local/desktop" variant?**
   - What we know: RemoteTrigger operates against `/v1/code/triggers` API (cloud). Desktop tasks use Desktop app or `/schedule`.
   - What's unclear: Is there a `type: "local"` parameter in the `create` body that deploys to Desktop instead of cloud?
   - Recommendation: Planner should implement Option 2 via `/schedule` (well-documented) rather than RemoteTrigger. If RemoteTrigger supports desktop in the schema (discoverable via ToolSearch at runtime), Claude can use it.

2. **Does RemoteTrigger require a repo URL for cloud tasks?**
   - What we know: Cloud tasks select repositories during creation (web form). RemoteTrigger `create` body likely requires a `job_config` with repo info.
   - What's unclear: Is repo optional if Claude already has a git remote? What is the exact `job_config` structure?
   - Recommendation: Skill should instruct Claude to auto-detect `git remote get-url origin` and pass it. Use ToolSearch at runtime to confirm schema.

3. **CronCreate natural language schedule support?**
   - What we know: Official docs example: "remind me at 3pm to push the release branch" — Claude converts to cron.
   - What's unclear: Does natural language work when Claude invokes CronCreate directly from a skill, or only from freeform user prompts?
   - Recommendation: Use explicit offset strings in the skill (+1h, +2h, +4h) rather than relying on natural language conversion.

---

## Environment Availability

Step 2.6: SKIPPED for LIMIT-03 (no external dependencies — file copy operation only).

For LIMIT-02 (skill rewrite): No external dependencies. CronCreate is a standard CC tool. RemoteTrigger requires claude.ai OAuth authentication (not API key). Skill only executes inside a CC session where OAuth is already active.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| claude.ai OAuth | RemoteTrigger | Context-dependent | — | Skill notes API-key users cannot use RemoteTrigger |
| Desktop app | Option 2 local task | Context-dependent | — | Instruct user to create task manually via Desktop app |
| `git remote origin` | Cloud task repo URL | ✓ (in any git repo) | — | Prompt user to enter URL |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner |
| Config file | none (bare `node --test`) |
| Quick run command | `node --test tests/budget.test.mjs tests/continuation.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIMIT-02 | budget-check.mjs hint line appended | unit | `node --test tests/budget.test.mjs` | ✅ exists |
| LIMIT-02 | SKILL.md contains direct tool invocation prose | manual | inspect file content | N/A (markdown) |
| LIMIT-03 | installLoopMd() copies template file to project path | unit | `node --test tests/install.test.mjs` | ✅ exists |
| LIMIT-03 | Wizard prompts for loop.md when GSD selected | manual UAT | run wizard end-to-end | N/A |

### Sampling Rate

- **Per task commit:** `node --test tests/budget.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/budget.test.mjs` — verify hint line appears in hook output (test for the specific string `→ /budget-continue` in stdout). Check existing test to see if this case is already covered.

*(Existing `tests/continuation.test.mjs` covers `lib/continuation.mjs` exports — no changes needed there.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | RemoteTrigger requires OAuth but that is handled by CC runtime, not this code |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Hint line is static string (no interpolation of user input) |
| V6 Cryptography | no | — |

**Security note:** The hint line added to `budget-check.mjs` is a hardcoded string — no interpolation of session_id, user input, or any external data. No injection surface. The OAuth token handling already present in the file is unchanged (D-01 touches only the output section). [VERIFIED: budget-check.mjs lines 76–83]

---

## Sources

### Primary (HIGH confidence)

- [code.claude.com/docs/en/scheduled-tasks](https://code.claude.com/docs/en/scheduled-tasks) — CronCreate schema, session-scoped scheduling, natural language reminders
- [code.claude.com/docs/en/web-scheduled-tasks](https://code.claude.com/docs/en/web-scheduled-tasks) — Cloud scheduled tasks, RemoteTrigger context
- [code.claude.com/docs/en/desktop-scheduled-tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) — Desktop task creation, /schedule command, SKILL.md file path
- [code.claude.com/docs/en/tools-reference](https://code.claude.com/docs/en/tools-reference) — Standard tool table (CronCreate listed as standard, RemoteTrigger not listed → deferred)
- Codebase: `hooks/budget-check.mjs`, `skills/budget-continue/SKILL.md`, `lib/continuation.mjs`, `lib/install/components.mjs`, `bin/install.mjs`, `templates/loop.md`

### Secondary (MEDIUM confidence)

- [github.com/anthropics/claude-code/issues/43440](https://github.com/anthropics/claude-code/issues/43440) — RemoteTrigger `action` parameter values (list/get/create/update), `job_config` structure
- [github.com/anthropics/claude-code/issues/43802](https://github.com/anthropics/claude-code/issues/43802) — RemoteTrigger 401 issue; confirmed tool operates against cloud API, not desktop
- Claude Code changelog v2.1.107 — RemoteTrigger `run` action bugfix; confirms tool exists and has `run` action

### Tertiary (LOW confidence)

- [github.com/anthropics/claude-code/issues/40228](https://github.com/anthropics/claude-code/issues/40228) — CronCreate `durable` parameter documented but non-functional (open bug)
- claude-code-changelog cc-prompt.md — deferred tool note (RemoteTrigger schema not pre-loaded)

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new deps): HIGH — enforced by STATE.md constraint
- CronCreate schema: HIGH — official CC docs confirmed
- RemoteTrigger schema: LOW — deferred tool, schema only inferable from GitHub issues
- Architecture patterns (skill rewrite): MEDIUM — no existing examples in project, but CC docs confirm AskUserQuestion + direct tool call is the pattern
- LIMIT-03 verification: HIGH — code already fully implemented and confirmed in codebase

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (CC tooling changes frequently — verify RemoteTrigger schema via ToolSearch at implementation time)
