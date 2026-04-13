# Phase 21 Research: Continuation Prompt & loop.md

**Phase:** 21 — Continuation Prompt & loop.md
**Requirements:** LIMIT-02, LIMIT-03
**Date:** 2026-04-13

## Summary

Phase 21 builds on Phase 20's budget detection hook. The hook already fires a warning (stdout) when usage crosses the threshold. Phase 21 adds: (1) a 4-option continuation prompt surfaced after the warning, and (2) a `loop.md` template installable via the wizard. Both sub-features are independent and can be planned in parallel waves.

---

## Codebase Findings

### Phase 20 Outputs (What We're Building On)

**`hooks/budget-check.mjs`** (96 lines)
- PostToolUse hook, reads stdin JSON payload
- Calls `lib/budget.mjs` utilities via relative import
- Prints warning to stdout via `formatWarning()`
- Exits 0 always (never disrupts session)
- Currently does NOT suggest any follow-up command

**`lib/budget.mjs`** (187 lines)
- `formatWarning(percent, threshold, usedTokens, totalTokens)` → returns multi-line string
- `loadThreshold()`, `saveThreshold(threshold)`
- `loadState()`, `saveState(state)`, `clearState()`
- `parseUsage(hookPayload)`, `computePercent()`, `shouldWarn()`
- `currentSessionId()` → UTC date string

**`lib/budget-cli.mjs`**
- CLI handler: `budget`, `budget set <pct>`, `budget reset`
- Exported as `main(args)` — called from `bin/cli.mjs` `case 'budget'`
- Uses switch on `args[0]`: `'set'`, `'reset'`, default (status)

### Install Wizard

**`bin/install.mjs`** (189 lines)
- Calls `selectComponents()` then `installSessionHook()` etc.
- `PKG_ROOT` = dirname of install.mjs → package root
- Skills dir: `join(homedir(), '.claude', 'skills')`

**`lib/install/components.mjs`**
- `selectComponents(totalSteps, hasPip)` returns `{ vault, gsd, obsidianSkills, customSkills, deepResearch, notebooklm }`
- Uses `prompts` multiselect — one call, returns `selected` array
- After GSD is confirmed, subsequent install steps check `sel.includes('gsd')`

**`lib/install/detect.mjs`**
- `detectInstallState()` returns `{ vaultExists, vaultPath, hooksInstalled, gitRemote, projects, profile }`
- Does NOT currently detect GSD install or loop.md presence
- Can be extended with `gsdInstalled: existsSync(join(homedir(), '.claude', 'get-shit-done'))` check

**`lib/install/hooks.mjs`** (120 lines)
- `installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath, projectsData)`
- Writes PostToolUse hooks for budget-check to each project's `.claude/settings.json`
- Pattern for copying files: `cpSync(src, dest)`

### Templates Directory

`templates/` contains: `context-template.md`, `infra.md`, `patterns.md`, `project-map.json`, `project-registry.md`, `session-protocol.md`, `skills/`
- No `loop.md` yet — we add it here
- Template is copied by wizard using `cpSync` or `writeFileSync` pattern

### Test Infrastructure

- Runner: `node --test tests/*.test.mjs`
- All test files use `node:test` + `node:assert/strict`
- Budget tests: `tests/budget.test.mjs` — imports from `../lib/budget.mjs`
- New modules need: `tests/continuation.test.mjs` and extended `tests/budget.test.mjs`

### CLI Routing (bin/cli.mjs)

- `case 'budget':` → `import('../lib/budget-cli.mjs')` → `main(args.slice(1))`
- To add `budget continue`: extend `budget-cli.mjs` switch with `case 'continue':`
- No changes needed to `bin/cli.mjs` or `bin/install.mjs` for the `continue` subcommand

### Scheduling Primitives Available

From SEED-001 research (confirmed 2026-04-13):
- `CronCreate` — Claude Code tool for creating scheduled tasks
- Desktop task scheduling — fires on local machine (machine must be on)
- Cloud task scheduling — fires on Anthropic infra (fresh git clone, machine can be off)
- These are Claude Code tools invoked via tool calls in skills/agents

**Key constraint:** Hooks (`hooks/*.mjs`) cannot interactively invoke tools. They can only print to stdout. The continuation prompt must be a CLI command or skill that the user invokes separately.

---

## Technical Approach

### LIMIT-02: Continuation Prompt

**Architecture:**
```
hooks/budget-check.mjs
  └─ printWarning() + append suggestion line:
     "Run `claude-dev-stack budget continue` to choose next steps."

lib/continuation.mjs  (NEW)
  └─ showContinuationPrompt()
     ├─ option 1: scheduleReminder() → CronCreate
     ├─ option 2: scheduleLocalTask() → Desktop task
     ├─ option 3: scheduleCloudTask() → Cloud task
     └─ option 4: continueNow() → print message

lib/budget-cli.mjs   (EXTEND)
  └─ case 'continue': budgetContinue(args)
     └─ calls showContinuationPrompt()

skills/budget-continue/  (NEW)
  └─ SKILL.md → description + invocation hint
  └─ skill.md → `claude-dev-stack budget continue`
```

**Prompts usage (existing dep):**
```js
import { prompt } from '../lib/shared.mjs'; // re-exports prompts
// Single-select from 4 options
const { choice } = await prompt({
  type: 'select',
  name: 'choice',
  message: 'Session budget is low. What would you like to do?',
  choices: [
    { title: '⏰  Remind me later', value: 'remind' },
    { title: '💻  Auto-continue locally (Desktop task)', value: 'local' },
    { title: '☁️   Auto-continue in cloud (Cloud task)', value: 'cloud' },
    { title: '▶️   Continue now (accept extra usage)', value: 'now' },
  ],
});
```

**CronCreate / scheduling:** Since these are Claude Code agent tools, they can only be invoked from within a Claude Code session (skill context), not from a bare Node.js CLI. The `budget continue` CLI command handles the interactive prompt and prints the appropriate tool call instruction or the skill handles scheduling when run within a session.

**Design resolution:** 
- CLI (`claude-dev-stack budget continue`) — handles the interactive choice + prints instructions for scheduling (tells the user what will happen).
- Skill (`/budget-continue`) — when invoked inside Claude Code, actually calls CronCreate/Desktop task/Cloud task tools after getting user choice.
- Both surfaces use the same `lib/continuation.mjs` module for option handling.

**For options 1–3 in skill context:**
- Option 1 (CronCreate): `CronCreate({ title: "Resume GSD session", prompt: "/gsd-resume-work", schedule: "+1h" })`
- Option 2 (Desktop): Desktop task via appropriate Claude Code scheduling tool
- Option 3 (Cloud): Cloud task with repo URL + `/gsd-resume-work` prompt

### LIMIT-03: loop.md Template

**Template content:**
```markdown
# GSD Maintenance Loop

Purpose: Run by scheduled tasks (local or cloud) to continue unfinished work.

Instructions for Claude:
1. Read .planning/STATE.md
2. If stopped_at exists → run /gsd-resume-work
3. If no stopped work → check open PRs → run /gsd-next → run /gsd-health
4. Report completion status
```

**Wizard integration:**
- Extend `lib/install/components.mjs` or add a new `lib/install/loop.mjs` module
- Offered after GSD component is confirmed installed
- Uses `cpSync(join(PKG_ROOT, 'templates', 'loop.md'), join(projectPath, '.claude', 'loop.md'))`
- Check: `existsSync(join(projectPath, '.claude', 'loop.md'))` before overwriting

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| CronCreate tool not available in CLI context | LOW | Skill handles tool calls; CLI just prints instructions |
| `prompts` single-select in non-TTY env | LOW | Same pattern as existing install wizard |
| loop.md install overwrites user customization | LOW | Check exists + offer "overwrite?" |
| budget-check.mjs grows too large | LOW | Just append one line to formatWarning |
| New test files miss edge cases | LOW | Follow budget.test.mjs patterns |

---

## Validation Architecture

### Test Coverage Plan

**`tests/continuation.test.mjs`** (NEW):
- `showContinuationPrompt()` exports callable option handlers
- Test `handleRemind()` — verify it calls scheduling correctly
- Test `handleLocal()` — verify Desktop task prompt
- Test `handleCloud()` — verify Cloud task prompt  
- Test `handleNow()` — verify returns without error
- Test option handlers work without TTY (unit-testable pure functions)

**`tests/budget.test.mjs`** (EXTEND):
- Add tests for the new suggestion line in `formatWarning` output

**`tests/templates.test.mjs`** (EXTEND or separate):
- Verify `templates/loop.md` exists in package
- Verify wizard loop.md copy works correctly

### Acceptance Test Commands
```bash
# Verify continuation module exports
node -e "import('./lib/continuation.mjs').then(m => console.log(Object.keys(m)))"

# Verify budget continue subcommand exists
node bin/cli.mjs budget continue --help 2>&1 | grep -i "continue\|remind\|local\|cloud"

# Verify loop.md template exists
test -f templates/loop.md && echo "PASS" || echo "FAIL"

# Verify skill file exists
test -f skills/budget-continue/SKILL.md && echo "PASS" || echo "FAIL"

# Run all tests
node --test tests/*.test.mjs
```

## RESEARCH COMPLETE
