# Phase 25: Budget-Aware Execution Gate — Research

**Researched:** 2026-04-14
**Domain:** Claude Code hooks (PreToolUse/PostToolUse), OAuth usage API, statusline bridge, hook installation
**Confidence:** HIGH (primary findings verified via source inspection; one confidence caveat on PreToolUse+Skill official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pre-execution gate integration (SC#1, SC#2)**
- D-01: Gate is a PreToolUse hook registered in project-level `.claude/settings.json` with `matcher: "Skill"`. No GSD patches, no core workflow changes.
- D-02: Hook script `hooks/budget-gate.mjs`: reads stdin JSON (includes `tool_input.skill_name`), filters to GSD skills, reads `budget-usage-cache.json`, estimates cost from `budget-history.json`, exits 0 silently if projected usage ≤ 80%, outputs 3-option prompt if > 80%.
- D-03: Wizard installs this hook into project `.claude/settings.json` via `lib/install/hooks.mjs` — same pattern as existing session hooks.

**Statusline full replacement (SC#4, SC#5)**
- D-04: Ship `hooks/cds-statusline.js` — full replacement for `gsd-statusline.js` with feature parity plus budget segment.
- D-05: Wizard writes `statusLine` in `~/.claude/settings.json` pointing to `~/.claude/hooks/cds-statusline.js`. Backs up previous value into `installState.previousStatusLine`.
- D-05 feature set: model display, current task from todos, directory name, context % progress bar with bridge file write, GSD update/stale-hooks notifications, NEW budget segment from `budget-usage-cache.json`.

**Operation cost estimation (SC#2)**
- D-06: Rolling-average tracker in `~/.claude/budget-history.json`. Schema: `{operation_type, baseline_pct, samples[], updated_at}`. Max 20 samples per type. Estimate = mean(samples).
- D-07: PostToolUse hook `hooks/budget-history.mjs` on GSD Skills: records delta before/after. No extra API calls.
- D-08: Bootstrap fallbacks: `execute-phase:15%`, `plan-phase:8%`, `discuss-phase:5%`, `research:3%`, `manager:25%`. Configurable in `~/.claude/budget-config.json`.

**Reset time detection (SC#3)**
- D-09: Researcher investigates OAuth API response to find reset-time field. (RESOLVED — see below.)
- D-10: If `five_hour.resets_at` available, "Schedule after reset" uses it as CronCreate schedule. Fallback: estimate from utilization.

**LIMIT-05 backfill (meta)**
- D-11: Plan 25-X includes task to add LIMIT-05 to `.planning/REQUIREMENTS.md` with exact success criteria from ROADMAP.md plus Traceability entry.

### Claude's Discretion
- Exact list of GSD skill names to gate (enumerated below)
- Whether to gate on `Task` (agent spawn) tool — research finding below
- Specific color codes / progress bar characters in cds-statusline.js
- Whether `budget-history.json` should live in `~/.claude/` or per-project

### Deferred Ideas (OUT OF SCOPE)
- Per-project budget thresholds (different 80% line per project)
- Web dashboard for scheduled tasks
- ML-based operation cost prediction (context-aware)
</user_constraints>

---

## Summary

Phase 25 adds a pre-execution budget gate and a full statusline replacement. The primary research questions are: (1) the exact OAuth API JSON schema — now fully documented from live cache inspection; (2) whether `matcher: "Skill"` works in PreToolUse — confirmed via Anthropic's own internal test scripts; (3) what `tool_input` contains for a Skill call — confirmed as `{ "skill": "<name>" }` from session transcript inspection; (4) what GSD's install.js does to `statusLine` on update — critically, it deletes `statusLine` only if the command contains `gsd-statusline`, so naming our file `cds-statusline.js` makes it invisible to GSD's cleanup and survives `/gsd-update`.

The one design note from D-02 needs correction: the CONTEXT.md says `tool_input.skill_name` but the actual schema uses `tool_input.skill` (not `skill_name`). The implementation must use `tool_input.skill`.

**Primary recommendation:** Proceed with decisions as documented. Fix `skill_name` → `skill` in hook code. Gate on `Task` only if filtering to Task descriptions that reference GSD commands — otherwise too broad.

---

## Research Findings

### 1. OAuth API JSON Schema (D-09 — RESOLVED)

**Source:** `~/.claude/budget-usage-cache.json` live read [VERIFIED: local file inspection]

The API response (cached at `budget-usage-cache.json`) has the following structure:

```json
{
  "timestamp": 1776183518455,
  "data": {
    "five_hour": {
      "utilization": 78,
      "resets_at": "2026-04-14T17:59:59.979618+00:00"
    },
    "seven_day": {
      "utilization": 79,
      "resets_at": "2026-04-17T18:00:00.979648+00:00"
    },
    "seven_day_oauth_apps": null,
    "seven_day_opus": null,
    "seven_day_sonnet": {
      "utilization": 6,
      "resets_at": "2026-04-20T20:59:59.979657+00:00"
    },
    "seven_day_cowork": null,
    "iguana_necktie": null,
    "extra_usage": {
      "is_enabled": true,
      "monthly_limit": 10000,
      "used_credits": 7506,
      "utilization": 75.06
    }
  }
}
```

**Key paths for Phase 25:**
- `data.five_hour.utilization` — integer percent (0–100)
- `data.five_hour.resets_at` — ISO 8601 timestamp string (the reset time for "Schedule after reset")
- `data.seven_day.utilization` — integer percent (0–100)
- `data.seven_day.resets_at` — ISO 8601 timestamp string
- `data.extra_usage.utilization` — float percent (e.g., 75.06)
- `data.extra_usage.used_credits` — integer dollar-cents equivalent
- `data.extra_usage.monthly_limit` — integer dollar-cents equivalent
- `data.extra_usage.is_enabled` — boolean

**D-10 answer:** `five_hour.resets_at` IS present in the response. Use `new Date(data.five_hour.resets_at)` to compute minutes until reset. For "Schedule after reset" in budget-gate.mjs, the schedule expression should be the reset ISO timestamp or a `+Xm` offset computed from `(new Date(resets_at) - Date.now()) / 60000`.

**Reset time display formula** (already used in `budget-check-status.mjs` line 60):
```js
new Date(data.five_hour.resets_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
// outputs "17:59"
```

**Minutes until reset** (for gate prompt):
```js
const msUntil = new Date(data.five_hour.resets_at) - Date.now();
const minsUntil = Math.max(0, Math.round(msUntil / 60000));
// "+Xm" schedule string: `+${minsUntil}m`
```

---

### 2. PreToolUse Hook with matcher: "Skill" (D-01)

**Source:** Anthropic's own `skill-creator` plugin test script [VERIFIED: local file inspection of `/Users/eugenenakoneschniy/.claude/plugins/cache/claude-plugins-official/skill-creator/unknown/skills/skill-creator/scripts/run_eval.py`]; session transcript inspection [VERIFIED: `.jsonl` transcript files].

**Finding:** When Claude invokes a skill, the underlying tool_use event has:
- `tool_name` / `name`: **`"Skill"`** (capital S)
- `tool_input` / `input`: `{ "skill": "<skill-name>" }` (optionally + `"args": "..."`)

Evidence from `run_eval.py` line 136–164:
```python
if tool_name in ("Skill", "Read"):
    pending_tool_name = tool_name
# ...
if tool_name == "Skill" and clean_name in tool_input.get("skill", ""):
    triggered = True
```

Evidence from actual session transcript:
```json
{
  "name": "Skill",
  "input": {
    "skill": "session-manager"
  }
}
```
and
```json
{
  "name": "Skill",
  "input": {
    "skill": "gsd-do",
    "args": "Реализовать NotebookLM auto-sync..."
  }
}
```

**D-02 CORRECTION:** The CONTEXT.md says `tool_input.skill_name` but the actual field is `tool_input.skill`. Implementation must use `data.tool_input?.skill` not `data.tool_input?.skill_name`.

**Official docs caveat:** The official Claude Code hooks docs at `code.claude.com/docs/en/hooks` do NOT list "Skill" in the documented matcher values (only Bash, Write, Edit, Read, Glob, Grep, WebFetch, WebSearch, Agent, AskUserQuestion, ExitPlanMode, mcp__). [CITED: https://code.claude.com/docs/en/hooks]. However, the internal Anthropic tooling and session transcripts confirm the Skill tool_name exists and fires hook events. This is a MEDIUM-confidence claim for hook matching specifically — if `matcher: "Skill"` does not fire PreToolUse, fallback is `matcher: "*"` with filtering in the hook script.

**stdin JSON for PreToolUse (Skill):** [VERIFIED: official docs + transcript]
```json
{
  "session_id": "...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Skill",
  "tool_input": {
    "skill": "gsd-execute-phase",
    "args": "26"
  },
  "tool_use_id": "toolu_..."
}
```

**How to block execution from PreToolUse:** [VERIFIED: official docs]

Option A — exit code 2 (simple block):
```js
process.stderr.write("Budget gate: 5h at 82%. Options: ...");
process.exit(2);
```

Option B — JSON hookSpecificOutput (structured, preferred):
```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "Budget gate: 5h at 82%..."
  }
}));
process.exit(0);
```

**Recommended approach for budget-gate.mjs:** Use stdout JSON output (Option B) for the 3-option prompt — but note that `permissionDecision: "deny"` simply blocks the tool call. To present a 3-option selection to the user, the hook should output the decision as `"ask"` with `permissionDecisionReason` containing the prompt text, OR output the multi-option text to stdout and return exit 0 (no deny) to let Claude present it in the session. Since the CONTEXT.md decision says "Claude sees this, surfaces to user, and acts accordingly", the correct approach is:

```js
// Output informational text to stdout (Claude sees it as hook context feedback)
process.stdout.write(multiLinePrompt);
process.exit(0);  // Don't block — let Claude present the options
```

This matches the existing `budget-check.mjs` pattern which outputs warning text and exits 0 for Claude to process. The CONTEXT.md describes the same flow ("Claude sees this, surfaces to user").

**Fallback if matcher: "Skill" does not work:** Use `matcher: "*"` and filter inside the hook:
```js
if (data.tool_name !== 'Skill') process.exit(0);
```

---

### 3. GSD Skills Enumeration — Gate vs. Lightweight Classification

[VERIFIED: `ls ~/.claude/skills/` inspection]

**EXPENSIVE (gate should trigger — spawn subagents or run long workflows):**
```
gsd-execute-phase    execute all plans in a phase (wave-based)
gsd-plan-phase       create PLAN.md with verification loop
gsd-discuss-phase    gather phase context (adaptive questioning)
gsd-research-phase   research phase domain
gsd-manager          interactive multi-phase command center
gsd-autonomous       run all phases autonomously
gsd-ship             ship milestone (full sequence)
gsd-audit-milestone  audit milestone completeness
gsd-code-review      full code review workflow
gsd-code-review-fix  apply code review fixes
gsd-secure-phase     security review
gsd-ui-phase         UI-specific phase execution
gsd-new-milestone    create new milestone
gsd-complete-milestone finalize and close milestone
```

**LIGHTWEIGHT (gate should NOT trigger — read-only or config-level operations):**
```
gsd-health           diagnose planning dir (read-only)
gsd-progress         check progress (Read-only tools)
gsd-stats            display statistics (Read-only)
gsd-check-todos      check todos (read-only)
gsd-help             show help
gsd-list-workspaces  list workspaces
gsd-list-phase-assumptions list assumptions
gsd-settings         show/edit config
gsd-note             add note
gsd-join-discord     open URL
gsd-add-todo         add a todo item
gsd-add-backlog      add backlog item
```

**MEDIUM (gate judgment call — can create state but short):**
```
gsd-add-phase        add phase to roadmap
gsd-insert-phase     insert phase
gsd-remove-phase     remove phase
gsd-next             determine next action
gsd-quick            quick focused task (gsd-fast/do variants)
gsd-fast             focused quick task
gsd-do               explicit task execution
gsd-pause-work       save state
gsd-resume-work      load state and continue
gsd-update           update GSD itself
```

**Recommended gate list (Claude's Discretion, planner decides final):**
```js
const GATED_SKILLS = new Set([
  'gsd-execute-phase', 'gsd-plan-phase', 'gsd-discuss-phase',
  'gsd-research-phase', 'gsd-manager', 'gsd-autonomous',
  'gsd-ship', 'gsd-audit-milestone', 'gsd-code-review',
  'gsd-code-review-fix', 'gsd-secure-phase', 'gsd-ui-phase',
  'gsd-new-milestone', 'gsd-complete-milestone',
]);
```

**On `Task` (agent spawn) tool gating:** [ASSUMED] GSD subagents are spawned via the `Task` tool (confirmed by `gsd-execute-phase` using Agent/Task). Gating `Task` with matcher `"Task"` would catch ALL task spawns (not just GSD), creating false positives for non-GSD use. The safer approach is to gate only via `matcher: "Skill"` — this catches the user-initiated skill invocation before the subagents spawn. The PreToolUse fires before the skill reads its SKILL.md and spawns subagents, so one gate intercepts the entire downstream chain.

---

### 4. budget-usage-cache.json Schema Summary

[VERIFIED: local file inspection]

Full schema:
```ts
interface BudgetUsageCache {
  timestamp: number;          // Unix ms (Date.now())
  data: {
    five_hour: { utilization: number; resets_at: string } | null;
    seven_day:  { utilization: number; resets_at: string } | null;
    seven_day_oauth_apps: null;
    seven_day_opus: null;
    seven_day_sonnet: { utilization: number; resets_at: string } | null;
    seven_day_cowork: null;
    iguana_necktie: null;
    extra_usage: {
      is_enabled: boolean;
      monthly_limit: number;
      used_credits: number;
      utilization: number;
    } | null;
  }
}
```

**TTL check in budget-gate.mjs:**
```js
const CACHE_TTL_MS = 60_000;
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
if (!cache || Date.now() - cache.timestamp >= CACHE_TTL_MS) {
  // Cache stale or missing — fail open (exit 0, proceed)
  process.exit(0);
}
const usage = cache.data;
```

**Fail-open rule (from CONTEXT.md specifics):** If cache missing, expired, or any field null — the gate MUST exit 0 silently. Never block when budget data is unavailable.

---

### 5. Statusline Bridge File Compatibility (D-04, cds-statusline.js)

[VERIFIED: `~/.claude/hooks/gsd-statusline.js` source inspection]

The `gsd-statusline.js` (1.34.2) writes the bridge file at:
```js
const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
const bridgeData = JSON.stringify({
  session_id: session,
  remaining_percentage: remaining,
  used_pct: used,
  timestamp: Math.floor(Date.now() / 1000)
});
fs.writeFileSync(bridgePath, bridgeData);
```

The `gsd-context-monitor.js` (registered in `~/.claude/settings.json` PostToolUse) reads this bridge file to inject context warnings.

**cds-statusline.js MUST replicate exactly:**
1. Bridge file path: `path.join(os.tmpdir(), 'claude-ctx-' + session + '.json')`
2. Bridge file fields: `{ session_id, remaining_percentage, used_pct, timestamp }`
3. Security check: reject session IDs containing `/`, `\`, or `..` (same as original)

Full feature parity checklist for cds-statusline.js from `gsd-statusline.js`:
- [x] Read JSON from stdin with 3s timeout guard
- [x] `data.model?.display_name` for model segment (dim)
- [x] `data.workspace?.current_dir` for directory
- [x] `data.session_id` for session
- [x] `data.context_window?.remaining_percentage` for context %
- [x] AUTO_COMPACT_BUFFER_PCT = 16.5 normalization
- [x] Context progress bar: `'█'.repeat(filled) + '░'.repeat(10 - filled)` (10 segments)
- [x] Color thresholds: <50 green, <65 yellow, <80 orange (208), >=80 red-blink 💀
- [x] Bridge file write (with security check)
- [x] Todos scan: `${claudeDir}/todos/${session}*-agent-*.json`, newest first, `in_progress` task
- [x] GSD update cache: `~/.cache/gsd/gsd-update-check.json` (prefer shared) + legacy `~/.claude/cache/gsd-update-check.json`
- [x] `cache.update_available` → yellow `⬆ /gsd-update │` prefix
- [x] `cache.stale_hooks` → red `⚠ stale hooks │` prefix
- [x] Output format: `${gsdUpdate}\x1b[2m${model}\x1b[0m │ [task │ ]\x1b[2m${dirname}\x1b[0m${ctx}${budget}`

**NEW budget segment to add:**
```js
// Budget segment (reads ~/.claude/budget-usage-cache.json — 60s TTL from budget-check.mjs)
let budget = '';
const BUDGET_CACHE_PATH = path.join(homeDir, '.claude', 'budget-usage-cache.json');
if (fs.existsSync(BUDGET_CACHE_PATH)) {
  try {
    const bc = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
    if (bc && Date.now() - bc.timestamp < 60_000 * 5) { // 5-min stale tolerance for statusline
      const d = bc.data;
      const parts = [];
      if (d.five_hour) {
        const u = d.five_hour.utilization;
        parts.push(colorize(u) + `5h:${u}%` + RESET);
      }
      if (d.seven_day) {
        const u = d.seven_day.utilization;
        parts.push(colorize(u) + `7d:${u}%` + RESET);
      }
      if (d.extra_usage?.used_credits > 0) {
        const dollars = (d.extra_usage.used_credits / 100).toFixed(0); // assuming cents
        parts.push(`extra:$${dollars}`);
      }
      if (parts.length) budget = ` │ ${parts.join(' ')}`;
    }
  } catch {}
}
```

Budget color thresholds (from CONTEXT.md specifics): <50 green, 50–70 yellow, 70–80 orange, >80 red.

---

### 6. GSD Update vs. cds-statusline.js Collision Risk (D-05)

[VERIFIED: GSD install.js inspection at `/Users/eugenenakoneschniy/.npm/_npx/9785a834b31d581d/node_modules/get-shit-done-cc/bin/install.js`]

**Critical finding:** GSD's `install.js` has cleanup logic at line 4436–4441:
```js
// Remove GSD statusline if it references our hook
if (settings.statusLine && settings.statusLine.command &&
  settings.statusLine.command.includes('gsd-statusline')) {
  delete settings.statusLine;
  settingsModified = true;
}
```

And then re-installs its statusLine via `handleStatusline()` at line 5877:
- If `settings.statusLine` is `null` → installs GSD's statusline
- If `settings.statusLine` exists AND command does NOT contain `gsd-statusline` → **skips** (outputs "Skipping statusline (already configured)")

**Conclusion:** Naming our replacement `cds-statusline.js` (not `gsd-statusline.js`) means:
1. GSD cleanup does NOT delete it (pattern check for `gsd-statusline` won't match)
2. GSD re-install SKIPS overwriting it ("already configured")
3. Our `cds-statusline.js` registration in `~/.claude/settings.json` survives `/gsd-update`

**No patches/ mechanism needed for statusLine.** The naming is sufficient protection.

**Wizard backup needed:** D-05 says "backs up previous value into `installState.previousStatusLine`". When wizard writes `~/.claude/settings.json` `statusLine`, it should read existing value first:
```js
const existing = globalSettings.statusLine || null;
// Save to installState or profile
installState.previousStatusLine = existing;
// Then write new value
globalSettings.statusLine = { type: 'command', command: cdsDest };
```

---

### 7. Hook Installation Pattern (lib/install/hooks.mjs extension)

[VERIFIED: `lib/install/hooks.mjs` source inspection]

Current `_writeSettingsFile()` adds hooks 1–5 (SessionStart context, Stop end-check, PostToolUse vault-push, SessionStart budget-reset, PostToolUse budget-check).

**New registrations Phase 25 adds to `_writeSettingsFile()`:**

**Hook 6: PreToolUse Skill matcher → budget-gate.mjs (project settings.json)**
```js
const budgetGateDest = join(hooksDir, 'budget-gate.mjs');
if (existsSync(budgetGateDest)) {
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  const hasGate = settings.hooks.PreToolUse.some(entry =>
    entry.hooks?.some(h => h.command?.includes('budget-gate'))
  );
  if (!hasGate) {
    settings.hooks.PreToolUse.push({
      matcher: 'Skill',
      hooks: [{ type: 'command', command: `node ${budgetGateDest}`, timeout: 10 }],
    });
    changed = true;
  }
}
```

**Hook 7: PostToolUse Skill matcher → budget-history.mjs (project settings.json)**
```js
const budgetHistoryDest = join(hooksDir, 'budget-history.mjs');
if (existsSync(budgetHistoryDest)) {
  const hasHistory = settings.hooks.PostToolUse.some(entry =>
    entry.hooks?.some(h => h.command?.includes('budget-history'))
  );
  if (!hasHistory) {
    settings.hooks.PostToolUse.push({
      matcher: 'Skill',
      hooks: [{ type: 'command', command: `node ${budgetHistoryDest}`, timeout: 10 }],
    });
    changed = true;
  }
}
```

**statusLine registration in `~/.claude/settings.json` (global, NOT project):**

This must be a SEPARATE step in `installSessionHook()` — the function currently only writes to project settings.json. A new call or a new exported function `installGlobalStatusline()` must write to `join(homedir(), '.claude', 'settings.json')`.

```js
export function installGlobalStatusline(pkgRoot) {
  const hooksDir = join(homedir(), '.claude', 'hooks');
  const cdsDest = join(hooksDir, 'cds-statusline.js');
  // Copy cds-statusline.js to ~/.claude/hooks/
  const src = join(pkgRoot, 'hooks', 'cds-statusline.js');
  if (existsSync(src)) {
    cpSync(src, cdsDest);
    try { chmodSync(cdsDest, 0o755); } catch {}
  }
  // Write to global settings.json
  const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(globalSettingsPath)) {
    try { settings = JSON.parse(readFileSync(globalSettingsPath, 'utf8')); } catch {}
  }
  // Backup previous value
  const previousStatusLine = settings.statusLine || null;
  settings.statusLine = { type: 'command', command: `node "${cdsDest}"` };
  writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2) + '\n');
  return previousStatusLine; // caller saves to installState
}
```

---

### 8. budget-history.json Schema (D-06)

[ASSUMED — schema described in CONTEXT.md D-06, no existing file found]

Proposed schema (Claude's Discretion for exact implementation):
```json
{
  "gsd-execute-phase": {
    "operation_type": "gsd-execute-phase",
    "baseline_pct": 15,
    "samples": [12.3, 18.1, 14.7, 16.2],
    "updated_at": "2026-04-14T17:00:00.000Z"
  },
  "gsd-plan-phase": {
    "operation_type": "gsd-plan-phase",
    "baseline_pct": 8,
    "samples": [],
    "updated_at": null
  }
}
```

`estimate(skillName)`:
```js
const entry = history[skillName];
if (!entry || entry.samples.length === 0) return FALLBACKS[skillName] || 10;
return entry.samples.reduce((a, b) => a + b, 0) / entry.samples.length;
```

`record(skillName, deltaPercent)`:
```js
if (!history[skillName]) history[skillName] = { operation_type: skillName, baseline_pct: FALLBACKS[skillName] || 10, samples: [], updated_at: null };
history[skillName].samples.push(deltaPercent);
if (history[skillName].samples.length > 20) history[skillName].samples.shift();
history[skillName].updated_at = new Date().toISOString();
```

**Global vs. project placement (Claude's Discretion):** `~/.claude/budget-history.json` is the simpler choice. History accumulates cross-project which gives more samples faster. Per-project would require reading project path from stdin context, adding complexity.

---

### 9. Phase 25 files to create

| File | Type | Purpose |
|------|------|---------|
| `hooks/budget-gate.mjs` | New | PreToolUse Skill hook — checks budget, outputs 3-option prompt |
| `hooks/budget-history.mjs` | New | PostToolUse Skill hook — records delta to budget-history.json |
| `hooks/cds-statusline.js` | New | Full statusline replacement (feature parity + budget segment) |
| `lib/install/hooks.mjs` | Modified | Add PreToolUse Skill + PostToolUse Skill registrations + `installGlobalStatusline()` |
| `bin/install.mjs` | Modified | Call `installGlobalStatusline()` in wizard flow |
| `.planning/REQUIREMENTS.md` | Modified | Add LIMIT-05 requirement + Traceability entry (D-11) |

---

### 10. CronCreate schedule for "Schedule after reset"

[VERIFIED: Phase 21 CONTEXT.md D-04; continuation.mjs source]

Phase 21 established the pattern for CronCreate:
```
Use CronCreate:
  Title:    "GSD: [skill-name] after budget reset"
  Prompt:   "[original command, e.g. /gsd-execute-phase 26]"
  Schedule: "+Xm"  (X = minutes until five_hour.resets_at)
  Repeat:   false
```

Phase 25 gate hook outputs this as instructions to Claude:
```
5h limit at 82% (est. reset in 47 min at 18:00), this operation needs ~15% (avg over 12 runs).
Options:
  [A] Execute now — continue despite tight budget
  [B] Schedule after reset — create reminder for /gsd-execute-phase 26 at 18:00
  [C] Cancel — stop and decide later
```

Claude receives this text from the hook output and presents the selection to the user, then invokes CronCreate with the computed schedule if [B] is chosen.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`fs`, `path`, `os`, `child_process`) | n/a | File I/O, path handling, process management | No deps, already used in all existing hooks |
| CommonJS (`require`) | n/a | cds-statusline.js must use CJS (same as gsd-statusline.js) | gsd-statusline.js uses `require` not ESM import |
| ESM (`import`) | n/a | budget-gate.mjs, budget-history.mjs use ESM | All Phase 20 hooks use `.mjs` with ESM |

### No New Dependencies
All Phase 25 files use only Node.js built-ins. No npm packages needed.

---

## Architecture Patterns

### Pattern 1: Hook reads stdin → JSON parse → fail-open
```js
// Used in budget-gate.mjs (same as budget-check.mjs pattern)
async function main() {
  let data;
  try {
    const raw = await readStdin(); // 500ms timeout
    data = JSON.parse(raw);
  } catch { process.exit(0); } // fail open on parse error

  const skillName = data?.tool_input?.skill; // NOTE: "skill" not "skill_name"
  if (!skillName || !GATED_SKILLS.has(skillName)) process.exit(0); // not a gated skill

  const cache = loadBudgetCache();
  if (!cache) process.exit(0); // no cache — fail open
  // ... gate logic
}
main().catch(() => {}).finally(() => process.exit(0));
```

### Pattern 2: PostToolUse history recording
```js
// budget-history.mjs
// stdin includes tool_name, tool_input.skill
// Records: read usage BEFORE (from pre-existing snapshot) and AFTER cache
// Delta = usage_after - usage_before
// Must handle: no pre-snapshot (first run), stale cache (60s TTL)
```

The challenge: PostToolUse fires AFTER the skill completes. To compute delta, budget-gate.mjs must save "usage at gate time" to a temp file, and budget-history.mjs reads that snapshot to compute delta.

**Snapshot mechanism:**
- budget-gate.mjs: writes `~/.claude/budget-gate-snapshot.json` = `{ skill, five_hour_pct, timestamp }`
- budget-history.mjs: reads snapshot, computes delta against current cache, appends to history

### Pattern 3: cds-statusline.js CJS module structure
```js
#!/usr/bin/env node
// Must use require() not import — cds-statusline.js is CJS (same as gsd-statusline.js)
const fs = require('fs');
const path = require('path');
const os = require('os');

// stdin reader with timeout guard (same 3s pattern)
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // ... feature parity + budget segment
    process.stdout.write(output);
  } catch {}
});
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Budget cache parsing | Custom TTL logic | Reuse `getUsage()` pattern from `budget-check.mjs` | Already handles error cases, same 60s TTL |
| OAuth token reading | New keychain reader | Reuse `getOAuthToken()` pattern from `budget-check.mjs` | macOS/Linux compat already handled |
| Reset time formatting | Custom date formatter | `new Date(resets_at).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})` | Already used in `budget-check-status.mjs` line 60 |
| Statusline bridge write | New bridge schema | Copy exact schema from `gsd-statusline.js` lines 44-50 | context-monitor depends on specific field names |

---

## Common Pitfalls

### Pitfall 1: tool_input.skill_name vs tool_input.skill
**What goes wrong:** Using `data.tool_input?.skill_name` returns `undefined` for every skill call — gate never triggers.
**Why it happens:** CONTEXT.md D-02 contains a typo. The actual field name in Claude's Skill tool is `skill` not `skill_name` (confirmed via session transcripts and Anthropic's own run_eval.py).
**How to avoid:** Use `data.tool_input?.skill` everywhere.
**Warning signs:** Gate exits 0 silently for all skills, no history records accumulate.

### Pitfall 2: cds-statusline.js named like gsd-statusline.js
**What goes wrong:** If the file is named `gsd-statusline-cds.js` or any variant containing `gsd-statusline`, GSD's `install.js` cleanup (line 4436-4441) deletes the statusLine registration on next `/gsd-update`.
**Why it happens:** GSD uses `command.includes('gsd-statusline')` pattern match.
**How to avoid:** File MUST be named `cds-statusline.js`. Never include `gsd-statusline` in the path.
**Warning signs:** After `/gsd-update`, statusline reverts to GSD's default or disappears.

### Pitfall 3: Budget gate blocking on missing cache
**What goes wrong:** Gate script throws or exits non-zero when `budget-usage-cache.json` doesn't exist, blocking ALL GSD skill invocations.
**Why it happens:** Missing try/catch around cache read.
**How to avoid:** Any exception in budget-gate.mjs must result in `process.exit(0)`. Wrap entire `main()` with `.catch(() => process.exit(0))`.
**Warning signs:** Skills stop working; Claude reports "PreToolUse hook blocked execution".

### Pitfall 4: Bridge file schema mismatch
**What goes wrong:** `gsd-context-monitor.js` stops injecting context warnings because bridge file fields changed.
**Why it happens:** cds-statusline.js writes different field names or structure.
**How to avoid:** Bridge file must have EXACTLY: `{ session_id, remaining_percentage, used_pct, timestamp }`. Verify against `budget.mjs` `parseUsage()` which reads `metrics.used_pct` and `metrics.remaining_percentage`.

### Pitfall 5: statusLine written to project settings.json instead of global
**What goes wrong:** Statusline only shows for one project; disappears in other projects.
**Why it happens:** `installSessionHook()` writes to project-level settings. statusLine is a global Claude Code setting.
**How to avoid:** statusLine registration MUST go to `~/.claude/settings.json` (global). Gate hook + history hook go to project `.claude/settings.json`.

### Pitfall 6: budget-history.mjs records negative deltas
**What goes wrong:** History gets polluted with negative values when cache refreshes between gate and history hook, making cost estimates appear negative.
**Why it happens:** API refreshes cache (new 60s window) between PreToolUse and PostToolUse.
**How to avoid:** budget-history.mjs should clamp delta to `Math.max(0, delta)`. If computed delta is unreasonably negative (< -5%), discard the sample.

---

## Code Examples

### budget-gate.mjs skeleton
```js
#!/usr/bin/env node
// hooks/budget-gate.mjs — PreToolUse hook: budget check before GSD skill execution
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = join(homedir(), '.claude');
const CACHE_PATH = join(CLAUDE_DIR, 'budget-usage-cache.json');
const HISTORY_PATH = join(CLAUDE_DIR, 'budget-history.json');
const SNAPSHOT_PATH = join(CLAUDE_DIR, 'budget-gate-snapshot.json');
const CONFIG_PATH = join(CLAUDE_DIR, 'budget-config.json');
const CACHE_TTL_MS = 60_000;

const FALLBACKS = {
  'gsd-execute-phase': 15, 'gsd-plan-phase': 8, 'gsd-discuss-phase': 5,
  'gsd-research-phase': 3, 'gsd-manager': 25,
};

const GATED_SKILLS = new Set([
  'gsd-execute-phase', 'gsd-plan-phase', 'gsd-discuss-phase', 'gsd-research-phase',
  'gsd-manager', 'gsd-autonomous', 'gsd-ship', 'gsd-code-review',
  // ... (planner finalizes list)
]);

async function main() {
  const raw = await readStdinWithTimeout(500);
  if (!raw) return;
  const data = JSON.parse(raw);

  const skillName = data?.tool_input?.skill; // CORRECT field name: "skill"
  if (!skillName || !GATED_SKILLS.has(skillName)) return;

  // Load cache — fail open if missing/stale
  if (!existsSync(CACHE_PATH)) return;
  let cache;
  try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { return; }
  if (!cache || Date.now() - cache.timestamp >= CACHE_TTL_MS * 2) return; // 2x TTL for gate

  const usage = cache.data;
  const fiveHour = usage?.five_hour;
  if (!fiveHour) return;

  // Save snapshot for budget-history.mjs
  try {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({
      skill: skillName, five_hour_pct: fiveHour.utilization, timestamp: Date.now()
    }));
  } catch {}

  // Load gate threshold (default 80% for gate, different from warning threshold)
  const gateThreshold = loadGateThreshold();
  const estimate = estimateCost(skillName);
  const projected = fiveHour.utilization + estimate;

  if (projected <= gateThreshold) return; // proceed silently

  // Compute reset time info
  const resets_at = fiveHour.resets_at;
  let resetInfo = '';
  if (resets_at) {
    const minsUntil = Math.max(0, Math.round((new Date(resets_at) - Date.now()) / 60000));
    const resetTime = new Date(resets_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    resetInfo = ` (est. reset in ${minsUntil}m at ${resetTime})`;
  }

  // Output 3-option prompt — Claude reads this and presents to user
  const sampleCount = getHistorySampleCount(skillName);
  const prompt = [
    ``,
    `  ⚠ BUDGET GATE: 5h at ${fiveHour.utilization}%${resetInfo}`,
    `     This operation (${skillName}) needs ~${estimate}% (${sampleCount > 0 ? `avg over ${sampleCount} runs` : 'bootstrap estimate'})`,
    `     Projected after: ${projected}% (threshold: ${gateThreshold}%)`,
    ``,
    `     Options:`,
    `     [A] Execute now — continue despite tight budget`,
    `     [B] Schedule after reset — create CronCreate reminder for this command at reset time`,
    `     [C] Cancel — stop and decide later`,
    ``,
  ].join('\n');

  process.stdout.write(prompt);
  // Exit 0 — Claude receives the prompt text and presents the choice to user
}

main().catch(() => {}).finally(() => process.exit(0));
```

### cds-statusline.js budget segment
```js
// After ctx segment, before final output:
let budget = '';
const BUDGET_CACHE_PATH = path.join(homeDir, '.claude', 'budget-usage-cache.json');
try {
  if (fs.existsSync(BUDGET_CACHE_PATH)) {
    const bc = JSON.parse(fs.readFileSync(BUDGET_CACHE_PATH, 'utf8'));
    // Use 5-minute stale tolerance for statusline (less critical than gate)
    if (bc && Date.now() - bc.timestamp < 300_000) {
      const d = bc.data;
      const budgetParts = [];
      const budgetColor = (pct) => {
        if (pct < 50) return '\x1b[32m';  // green
        if (pct < 70) return '\x1b[33m';  // yellow
        if (pct < 80) return '\x1b[38;5;208m'; // orange
        return '\x1b[31m'; // red
      };
      if (d.five_hour) {
        const u = d.five_hour.utilization;
        budgetParts.push(`${budgetColor(u)}5h:${u}%\x1b[0m`);
      }
      if (d.seven_day) {
        const u = d.seven_day.utilization;
        budgetParts.push(`${budgetColor(u)}7d:${u}%\x1b[0m`);
      }
      if (d.extra_usage?.used_credits > 0) {
        const dollars = Math.round(d.extra_usage.used_credits / 100);
        budgetParts.push(`extra:$${dollars}`);
      }
      if (budgetParts.length) budget = ` \x1b[2m│\x1b[0m ${budgetParts.join(' ')}`;
    }
  }
} catch {}
// output: `...${ctx}${budget}`
```

---

## Environment Availability

Phase 25 is code/config-only. All dependencies are Node.js built-ins already available.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All hooks | ✓ | v20.12.2 | — |
| `~/.claude/budget-usage-cache.json` | budget-gate.mjs, cds-statusline.js | ✓ (Phase 20) | — | fail-open |
| `~/.claude/budget-config.json` | loadGateThreshold() | ✓ | `{"threshold":70}` | default 80% gate |
| `~/.claude/hooks/gsd-context-monitor.js` | bridge file consumer | ✓ | 1.34.2 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner |
| Config file | none (inline) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIMIT-05 SC#1 | Gate queries usage before GSD ops | unit | `npm test -- --grep "budget-gate"` | ❌ Wave 0 |
| LIMIT-05 SC#2 | Gate shows options when tight | unit | `npm test -- --grep "budget-gate tight"` | ❌ Wave 0 |
| LIMIT-05 SC#3 | Schedule after reset creates CronCreate | manual-only | — | — |
| LIMIT-05 SC#4 | Statusline shows 5h/7d budget | unit | `npm test -- --grep "cds-statusline"` | ❌ Wave 0 |
| LIMIT-05 SC#5 | Statusline uses cached data, no extra API | unit | `npm test -- --grep "cds-statusline cache"` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `test/budget-gate.test.mjs` — covers LIMIT-05 SC#1, SC#2
- [ ] `test/cds-statusline.test.mjs` — covers LIMIT-05 SC#4, SC#5
- [ ] `test/budget-history.test.mjs` — covers delta recording logic

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `matcher: "Skill"` fires PreToolUse for Skill tool calls | Finding #2 | Gate never triggers; fallback is `matcher: "*"` + in-script filter |
| A2 | PostToolUse Skill fires after skill execution completes | Finding #2 | budget-history.mjs can't record post-skill usage |
| A3 | budget-history.json in `~/.claude/` is better than per-project | Finding #8 | If user uses multiple projects, estimates may be noisy |
| A4 | extra_usage.used_credits is in cents | Finding #1 | Dollar display off by 100x if in dollars |
| A5 | 5-minute stale tolerance is acceptable for statusline budget display | Finding #5 | Stale budget values in statusline; reduce to 2min if too stale |

---

## Open Questions

1. **`matcher: "Skill"` — does PreToolUse actually fire for Skill invocations?**
   - What we know: Official docs don't list "Skill" as a matcher. Anthropic's own test code treats it as a tool_name. Session transcripts confirm `name: "Skill"` in tool_use events.
   - What's unclear: Whether Claude Code's hook system intercepts the Skill tool call at PreToolUse stage specifically, or only fires for "real" tools.
   - Recommendation: Implement with `matcher: "Skill"` as primary. Add fallback in code: if `tool_name !== 'Skill'` exit 0. Test manually after first install — if gate never fires, switch to `matcher: "*"` with filter.

2. **Gate output mechanism — exit 0 with stdout text vs. JSON permissionDecision "ask"**
   - What we know: `permissionDecision: "deny"` blocks the tool. `exit 0` with stdout allows it. CONTEXT.md says "Claude sees this, surfaces to user, and acts accordingly."
   - What's unclear: Does Claude actually read PreToolUse hook stdout and present it to user? Or does stdout only apply for blocking decisions?
   - Recommendation: Mirror the existing budget-check.mjs pattern (exit 0, output text to stdout). If Claude ignores it, switch to JSON with `permissionDecision: "ask"` and encode the options in `permissionDecisionReason`.

---

## Sources

### Primary (HIGH confidence)
- `~/.claude/budget-usage-cache.json` — live API response schema inspection [VERIFIED]
- `hooks/budget-check-status.mjs` — `five_hour.resets_at` usage confirmed [VERIFIED]
- `~/.claude/hooks/gsd-statusline.js` v1.34.2 — full feature set documented [VERIFIED]
- `lib/install/hooks.mjs` — hook installation pattern [VERIFIED]
- Session transcripts `.jsonl` — Skill tool_input schema `{ "skill": "..." }` [VERIFIED]
- `/Users/eugenenakoneschniy/.claude/plugins/cache/claude-plugins-official/skill-creator/unknown/skills/skill-creator/scripts/run_eval.py` — Skill tool_name confirmation [VERIFIED]
- GSD `install.js` lines 4436-4441, 5877-5894 — statusLine collision behavior [VERIFIED]

### Secondary (MEDIUM confidence)
- [Claude Code hooks docs](https://code.claude.com/docs/en/hooks) — PreToolUse schema, exit codes, JSON hookSpecificOutput [CITED]
- Phase 21 CONTEXT.md D-04 — CronCreate pattern for "Schedule after reset" [CITED]
- Phase 20 `lib/budget.mjs` — threshold config, state persistence patterns [CITED]

### Tertiary (LOW confidence)
- `matcher: "Skill"` actually fires for PreToolUse — inferred from tool_name evidence, not directly tested [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- OAuth API schema: HIGH — verified from live cache file
- Skill tool_input.skill field: HIGH — verified from session transcripts and Anthropic test code
- GSD update collision safety: HIGH — verified from GSD install.js source
- PreToolUse Skill matcher works: MEDIUM — tool exists, hook behavior inferred not tested
- budget-history.json schema: MEDIUM — based on CONTEXT.md spec, no existing file to verify

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain, OAuth API schema rarely changes)
