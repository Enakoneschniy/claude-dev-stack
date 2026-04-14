# Phase 31: Skills to Hooks Migration — Research

**Researched:** 2026-04-15
**Domain:** Claude Code hooks (UserPromptSubmit, PreToolUse), skill-to-hook migration patterns, conventional commits
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration scope (4 items):**
- D-01/02/03: dev-router → `hooks/dev-router.mjs` at `UserPromptSubmit` matcher `"*"`, emits `additionalContext`, fail-silent
- D-04/05/06: session-manager trimming — remove start-path body block, retain `/end` + `/resume`, add one-line note about hook
- D-07/08/09: project-switcher → `hooks/project-switcher.mjs` at `UserPromptSubmit` matcher `"*"`, parses vault/meta/project-registry.md, fail-silent when registry absent
- D-10/11/12/13: git-conventions → `hooks/git-conventions-check.mjs` at `PreToolUse` matcher `"Bash"`, warn-only default, configurable via `.planning/config.json` `workflow.commit_validation: "warn"|"strict"`

**Skill removal:**
- D-14: Remove `skills/dev-router/SKILL.md`, `skills/project-switcher/SKILL.md` entirely
- D-15: Remove `dev-router` and `project-switcher` from `lib/install/skills.mjs` `skillNames` array
- D-16: Wizard re-run installs new hooks + no longer copies deleted skills
- D-17: Cleanup prompt in wizard: "Remove deprecated skills: dev-router, project-switcher? (Migrated to hooks in v0.12)". Default: Yes.

**Requirements backfill:**
- D-20: Add `### Skills→Hooks (SKL)` section to REQUIREMENTS.md with SKL-01..04

**Documentation:**
- D-18: Add section to `vault/shared/patterns.md` — Skills vs Hooks migration decision matrix
- D-19: ADR captured by Phase 26 Auto-ADR during execution

### Claude's Discretion
- Exact regex keyword lists for dev-router (built from SKILL.md description)
- Whether project-switcher regex is word-boundary based or fuzzy
- Cache strategy for project-registry.md reads (in-hook memoization vs re-read)
- Whether strict mode for git-conventions gets a per-commit bypass option

### Deferred Ideas (OUT OF SCOPE)
- Migrate gsd-* skills (LLM-backed, GSD-owned)
- Migrate research-*, notebooklm, obsidian skills (LLM interaction required)
- Per-project regex customization for dev-router
- Metrics on hook emission rate
- Bi-directional skill-hook fallback
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKL-01 | dev-router skill replaced by UserPromptSubmit hook | Hook schema verified; keyword list extracted from SKILL.md |
| SKL-02 | session-manager start-path fully migrated to SessionStart hook | Phase 28 already removed greeting triggers; Phase 31 removes body block |
| SKL-03 | project-switcher replaced by UserPromptSubmit hook | Registry format verified; project name list extracted |
| SKL-04 | git-conventions replaced by PreToolUse Bash hook (warn mode default) | GSD's existing gsd-validate-commit.sh is a near-identical precedent |
</phase_requirements>

---

## Summary

Phase 31 migrates four deterministic skills (dev-router, session-manager start-path, project-switcher, git-conventions) from LLM-invoked skills to Claude Code hooks. The hooks run before Claude sees the message (UserPromptSubmit) or before a tool executes (PreToolUse), eliminating token consumption for purely deterministic routing decisions.

The key architectural discovery is that `UserPromptSubmit` hooks output plain text to stdout which Claude receives as context, OR can emit a structured JSON `hookSpecificOutput.additionalContext` field. Both work, but the JSON format allows pairing with `sessionTitle`. For simple routing hints, plain stdout is sufficient and matches the existing `budget-check.mjs` pattern already registered at `UserPromptSubmit` in the global `~/.claude/settings.json`.

**Critical pre-existing asset:** `~/.claude/hooks/gsd-validate-commit.sh` already implements conventional commits validation as a PreToolUse hook (with `matcher: "Bash"`), shipped by GSD. SKL-04 (`hooks/git-conventions-check.mjs`) must NOT duplicate this — it must supersede it with warn-only mode and project-level installation. The GSD hook uses `exit 2` (blocking); the Phase 31 hook defaults to warn-only (exit 0 with message).

**Primary recommendation:** Follow decisions verbatim. The hook schema is confirmed. The `if` field in hook registration allows narrowing `Bash` matcher to `Bash(git commit*)` without catching every Bash call.

---

## Standard Stack

### Core
| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| Node.js ESM (`.mjs`) | 20.12.2 (verified) | Hook runtime for dev-router, project-switcher, git-conventions-check | [VERIFIED: `node --version`] |
| `process.stdin` async read | built-in | Parsing hook JSON input — same pattern as `budget-check.mjs` | [VERIFIED: codebase inspection] |
| `fs.readFileSync` | built-in | Reading vault/meta/project-registry.md and .planning/config.json | [VERIFIED: codebase pattern] |

### No External Dependencies
All four hooks must be zero-dep Node scripts per project decision (Specifics section of CONTEXT.md). Pattern established by `hooks/budget-check.mjs` and `hooks/budget-check-status.mjs`. [VERIFIED: codebase inspection]

---

## Architecture Patterns

### UserPromptSubmit Hook — Stdin/Stdout Schema

**Stdin JSON (confirmed via official docs):** [CITED: https://code.claude.com/docs/en/hooks]

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../session.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "the user's message text"
}
```

Key field for routing: `input.prompt` — the raw user text.

**Output options (two approaches):**

Option A — Plain text stdout (simplest, matches existing budget-check pattern):
```javascript
process.stdout.write("Route to GSD: this looks like a dev task.");
```

Option B — Structured JSON with additionalContext:
```javascript
const out = {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "Route to GSD: this looks like a dev task."
  }
};
process.stdout.write(JSON.stringify(out));
```

**Recommendation (Claude's Discretion — resolved):** Use plain text stdout (Option A). It matches `budget-check.mjs` which already uses `process.stdout.write(warning)` at line 80. Simpler, less JSON overhead, same effect. [VERIFIED: budget-check.mjs line 80]

### PreToolUse Hook — Stdin/Stdout Schema

**Stdin JSON for Bash tool:** [CITED: https://code.claude.com/docs/en/hooks]

```json
{
  "session_id": "abc123",
  "cwd": "/Users/...",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "git commit -m 'fix stuff'",
    "description": "...",
    "timeout": 120000
  },
  "tool_use_id": "toolu_01..."
}
```

Key field: `input.tool_input.command` — the bash command string. [CITED: https://code.claude.com/docs/en/hooks]

**Output for warn-only (exit 0 with message to Claude):**
```javascript
// Warn-only: write message to stdout so Claude sees it, exit 0 (no block)
process.stdout.write(`Warning: commit message 'fix stuff' doesn't match conventional commits. Try: 'fix: stuff'`);
process.exit(0);
```

**Output for strict block (exit 2 with JSON):**
```javascript
const out = JSON.stringify({
  decision: "block",
  reason: "Commit message must follow Conventional Commits: type(scope): description"
});
process.stdout.write(out);
process.exit(2);
```

### PreToolUse Registration — `if` field for Bash(git commit*)

**Registration format in `.claude/settings.json`:** [CITED: https://code.claude.com/docs/en/hooks]

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "if": "Bash(git commit*)",
          "command": "node ~/.claude/hooks/git-conventions-check.mjs",
          "timeout": 5
        }
      ]
    }
  ]
}
```

The `if` field at the hook level (NOT at the matcher level) narrows triggering to commands matching `Bash(git commit*)`. The `matcher: "Bash"` catches all Bash calls; `if: "Bash(git commit*)"` ensures only git commit commands spawn the validation script. [CITED: https://code.claude.com/docs/en/hooks]

**Existing precedent in project:** `~/.claude/settings.json` already registers `gsd-validate-commit.sh` at `matcher: "Bash"` without an `if` filter — it does the filtering internally via bash regex. Phase 31 hook can use the `if` field for cleaner registration, or do it internally. Either works. [VERIFIED: `~/.claude/settings.json` inspection]

### Fail-Silent Pattern (from budget-check.mjs)

```javascript
async function main() {
  let input;
  try {
    const chunks = [];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
    });
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    input = JSON.parse(raw);
  } catch {
    return; // fail-silent on parse error
  }
  // ... logic
}
main().catch(() => {}).finally(() => process.exit(0));
```

[VERIFIED: hooks/budget-check.mjs lines 36-53, 164]

### Settings.json Registration — `_writeSettingsFile` Extension Pattern

`lib/install/hooks.mjs` uses a deduplication guard for each hook:
```javascript
const hasX = settings.hooks.UserPromptSubmit?.some(entry =>
  entry.hooks?.some(h => h.command?.includes('dev-router'))
);
if (!hasX) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: `node ${dest}`, timeout: 5 }],
  });
}
```

For UserPromptSubmit, no `matcher` field is used (event fires on every user prompt). [VERIFIED: hooks.mjs pattern, global settings.json inspection]

---

## Research Findings by Migration

### SKL-01: dev-router Keywords

**Extracted from `~/.claude/skills/dev-router/SKILL.md` and `skills/dev-router/SKILL.md`** (identical files): [VERIFIED: codebase read]

**SESSION & CONTEXT triggers** (→ session-manager):
- Greetings: `hi`, `привет`, first message detection
- End signals: `done`, `end`, `всё`, `хватит`, `на сегодня всё`
- Resume: `что мы делали`, `resume`, `continue`, `продолжи`

**PROJECT SWITCHING triggers** (→ project-switcher):
- `switch to`, `переключись на`, `другой проект`, `работаем над`
- Mentions any project name in vault/projects/

**DEVELOPMENT triggers** (→ GSD):
- `build`, `implement`, `fix`, `сделай`, `исправь`, `create feature`
- `refactor`, `deploy`, `ship`, `plan`, `phase`

**RESEARCH triggers** (→ deep-research / dev-research):
- `research`, `compare`, `исследуй`, `сравни`, `what options`
- `check docs`, `по документации`, `ask notebooklm`

**STATUS triggers** (→ project-switcher /projects):
- `status`, `статус`, `list projects`, `покажи проекты`

**Hook additionalContext strategy:** The hook should NOT try to re-route the LLM. It emits a short hint like: `"[AUTO-ROUTING: development task detected. Use GSD workflow: /gsd:quick for trivial, /gsd:plan-phase for complex features.]"`. The SKILL.md logic says "NEVER ask which tool to use" — the hook reinforces this as pre-prompt context.

**Task size detection** (from SKILL.md body): FAST = single file / trivial fix; QUICK = 2-3 file bug; FULL GSD = multi-module architecture. Hook can include this in emitted context.

**Claude's Discretion resolved:** Regex should be word-boundary based (`/\b(fix|build|implement|...)\b/i`) to avoid false positives on "I fixed my coffee" etc. Multi-category overlap: if both SESSION+DEV, SESSION wins (first message check takes priority).

### SKL-02: session-manager Start-Path Body Removal

**Current state in `skills/session-manager/SKILL.md`:** [VERIFIED: codebase read]
- Lines 141-147: "## Automatic Behavior" section — "When the skill detects this is the FIRST message in a Claude Code session: Auto-run /resume logic..."
- Frontmatter `description:` still includes "ALWAYS trigger on first message in any session (greetings, 'привет', 'hi', 'начинаем')"

**Phase 28 already planned** (28-CONTEXT.md D-03/D-04): Remove greeting triggers from `description:` frontmatter, remove "ALWAYS trigger on first message" from body. Phase 31 D-06 adds one clarifying line: "Context is loaded at SessionStart by `hooks/session-start-context.sh`. This skill only handles end-of-session logging and explicit resume requests."

**What Phase 31 actually removes:** The "## Automatic Behavior" section first paragraph (lines 141-144). The second paragraph about end-of-session is retained. [VERIFIED: session-manager/SKILL.md lines 141-147]

**Important:** Phase 28 may have already shipped these changes or may not yet — the plan must check current state of `~/.claude/skills/session-manager/SKILL.md` and `skills/session-manager/SKILL.md` at execution time and apply only what's not already done.

### SKL-03: project-switcher Registry Detection

**Current skill detection logic** (from `skills/project-switcher/SKILL.md`): [VERIFIED: codebase read]
```bash
ls -d "$VAULT/projects"/*/ | xargs -I{} basename {} | grep -v _template
```
Uses `ls` to enumerate vault/projects/ directories — partial match against project names.

**vault/meta/project-registry.md format** (actual file): [VERIFIED: file read]
A markdown table with columns `Project | Status | Last Session`. Project names are in the first column. Example row: `| biko-pro | active | — |`

**Hook strategy:** Read `vault/meta/project-registry.md` OR fall back to `vault/project-map.json` (which maps paths to names). The `project-map.json` is more reliable (canonical, used by `session-start-context.sh`). Format: `{ "projects": { "/path": "name", ... } }`. [VERIFIED: vault/project-map.json]

**Recommendation (Claude's Discretion resolved):** Parse `vault/project-map.json` for project names (more reliable than markdown table parsing). Fall back to `vault/meta/project-registry.md` regex if map absent. Word-boundary match: `/\b(biko-pro|car-search|claude-dev-stack|...)\b/i` built dynamically from the registry at hook startup.

**Current project detection:** The hook must know the current project to suppress self-mentions. Use `process.cwd()` matched against `project-map.json` paths, or just parse `path.basename(process.cwd())`. [VERIFIED: session-start-context.sh project resolution logic]

**Cache strategy (Claude's Discretion resolved):** Re-read `project-map.json` on each invocation — it's a tiny JSON file (~400 bytes). No in-process memoization needed; the hook process is short-lived. Fail-silent when file absent.

### SKL-04: git-conventions-check vs Existing gsd-validate-commit.sh

**Critical finding:** `~/.claude/hooks/gsd-validate-commit.sh` is ALREADY installed globally (shipped by GSD). [VERIFIED: `ls ~/.claude/hooks/`] It:
- Uses `matcher: "Bash"` with NO `if` filter (does its own bash regex check)
- Uses `exit 2` to BLOCK non-conforming commits
- Is OPT-IN: requires `.planning/config.json` `hooks.community: true` to activate
- Uses the regex: `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?:[[:space:]].+`
- Missing `!` for breaking change notation
- Missing `revert` type (though in the `config.json` opt-in list)

**Phase 31 hook (`hooks/git-conventions-check.mjs`) differences:**
1. Warn-only by default (exit 0 with message) vs block-by-default in GSD hook
2. Strict mode via `.planning/config.json` `workflow.commit_validation: "strict"` (exits 2/blocks)
3. MJS (Node ESM) vs bash — more reliable JSON parsing, no regex edge cases
4. Richer regex covering `!` for breaking changes and `revert` type
5. Project-level installation (not global) per BUG-01 pattern

**Regex for conventional commits (D-11 from CONTEXT.md):**
```
^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\(.+\))?!?:\s.+
```
[VERIFIED: CONTEXT.md D-11; cross-checked against gsd-validate-commit.sh pattern]

**Edge cases to handle:**
- Multi-word scopes: `feat(api-gateway): ...` — the `\(.+\)` pattern covers this
- Breaking change: `feat!:` or `feat(scope)!:` — the `!?` after `)` handles `(scope)!` but `feat!:` needs the regex to allow `!` before `:` even without scope
- Correct regex: `^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([^)]+\))?!?:\s.+`
- Multi-line commit messages: only validate the first line (subject line). Extract via `cmd.match(/-m\s+["']([^"'\n]+)/)`
- `git commit -m "msg" --amend`: the `--amend` flag doesn't change the message extraction

**Co-existence with gsd-validate-commit.sh:** Both hooks can coexist. GSD hook is opt-in (disabled unless `hooks.community: true` — most users don't have that). Phase 31 hook is independent. No conflict.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Project list parsing | Custom markdown table parser | Parse `vault/project-map.json` (JSON) |
| Stdin timeout/buffering | Custom stream logic | Copy `budget-check.mjs` lines 36-53 verbatim |
| Settings.json merge | `JSON.parse` + manual merge | `_writeSettingsFile` in `hooks.mjs` — already handles dedup |
| Hook installation | New installer function | Extend `_writeSettingsFile` in `lib/install/hooks.mjs` |

---

## Common Pitfalls

### Pitfall 1: `additionalContext` length
**What goes wrong:** Emitting > ~500 chars floods Claude's context on every user message. At `UserPromptSubmit` matcher `"*"`, this hook fires on EVERY prompt.
**How to avoid:** Keep routing hints under 150 chars. Example: `[ROUTING: development task. Use /gsd:quick or /gsd:plan-phase]` not a full decision tree.
**Warning signs:** Session feels slow; Claude repeatedly references the routing hint instead of acting.

### Pitfall 2: False positive routing in dev-router
**What goes wrong:** Keyword `fix` in "fix me a cup of coffee" triggers GSD routing hint.
**How to avoid:** Use word-boundary regex AND require context: the message should be imperative + technical. Add a minimum token count filter (e.g., only emit if prompt has 3+ words AND matches a keyword).
**Better approach:** Only emit context when the message is clearly technical. Err toward silence — the SKILL.md says "if uncertain, prefer the faster one."

### Pitfall 3: project-switcher emits on current project
**What goes wrong:** User says "continue working on claude-dev-stack" while already in claude-dev-stack → hook emits "Switch cwd to claude-dev-stack" unnecessarily.
**How to avoid:** Detect current project (from `cwd` in stdin or `process.cwd()`) and suppress emission when the mentioned project matches current. [CONTEXT.md Specifics: "project-switcher must NOT emit context when prompt mentions the CURRENT project"]

### Pitfall 4: git-conventions regex doesn't cover `git commit -am`
**What goes wrong:** `git commit -am "fix stuff"` — message is in `-m "fix stuff"` substring within `-am`.
**How to avoid:** Extract message with a flexible regex: look for any `-m` flag anywhere in the command string, e.g., `/-m\s+(?:"([^"]+)"|'([^']+)')/`.

### Pitfall 5: skill removal breaks users mid-session
**What goes wrong:** Wizard removes skill files from `~/.claude/skills/dev-router/` and `~/.claude/skills/project-switcher/` while Claude Code has them in context — next message errors.
**How to avoid:** The cleanup step in wizard (D-17) should only run at wizard-invocation time, not silently. The "Remove deprecated skills?" prompt (D-17) is the right mechanism.

### Pitfall 6: `UserPromptSubmit` not in project `.claude/settings.json`
**What goes wrong:** Hook installer extends only `SessionStart`, `Stop`, `PostToolUse` (current `_writeSettingsFile` code). New hooks for `UserPromptSubmit` and `PreToolUse` (git-conventions) need new registration blocks.
**How to avoid:** `_writeSettingsFile` must be extended with two new blocks for `UserPromptSubmit` (dev-router, project-switcher) and one for `PreToolUse` (git-conventions-check). Follow exact dedup-guard pattern already used.

---

## Code Examples

### UserPromptSubmit stdin read pattern (from budget-check.mjs)
```javascript
// Source: hooks/budget-check.mjs lines 36-53 [VERIFIED]
async function main() {
  let input;
  try {
    const chunks = [];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
    });
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = input?.prompt;
  const sessionId = input?.session_id;
  // ...
}
main().catch(() => {}).finally(() => process.exit(0));
```

### hooks.mjs extension for UserPromptSubmit
```javascript
// Source: lib/install/hooks.mjs _writeSettingsFile extension pattern [VERIFIED]
if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
const hasDevRouter = settings.hooks.UserPromptSubmit.some(entry =>
  entry.hooks?.some(h => h.command?.includes('dev-router'))
);
if (!hasDevRouter) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: `node ${devRouterDest}`, timeout: 5 }],
  });
  changed = true;
}
```

### PreToolUse registration with `if` field
```javascript
// Source: Claude Code docs [CITED: https://code.claude.com/docs/en/hooks]
if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
const hasGitConventions = settings.hooks.PreToolUse.some(entry =>
  entry.hooks?.some(h => h.command?.includes('git-conventions-check'))
);
if (!hasGitConventions) {
  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [{
      type: 'command',
      if: 'Bash(git commit*)',
      command: `node ${gitConventionsDest}`,
      timeout: 5,
    }],
  });
  changed = true;
}
```

### Conventional commits validation (Node, warn-only)
```javascript
// Derived from gsd-validate-commit.sh + CONTEXT.md D-11 [VERIFIED: gsd-validate-commit.sh]
const REGEX = /^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([^)]+\))?!?:\s.+/;

function extractMessage(cmd) {
  const m = cmd.match(/-m\s+(?:"([^"]+)"|'([^']+)')/);
  return m ? (m[1] || m[2] || '').split('\n')[0].trim() : null;
}

function validate(cmd, strictMode) {
  const msg = extractMessage(cmd);
  if (!msg) return; // no -m flag or interactive commit — skip
  const subject = msg.split('\n')[0];
  if (REGEX.test(subject)) return; // valid

  const suggestion = `Try: 'type(scope): description' where type is feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert`;
  const warning = `Commit message "${subject}" doesn't match Conventional Commits.\n${suggestion}`;

  if (strictMode) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: warning }));
    process.exit(2);
  } else {
    process.stdout.write(warning);
    // exit 0 — warn only, do not block
  }
}
```

---

## Phase Interdependency Map

| Phase | Status | What Phase 31 Needs |
|-------|--------|---------------------|
| Phase 28 (Silent Session Start) | Has PLANS (28-01..03-PLAN.md, VALIDATION.md) | D-03/D-04: greeting triggers already removed from session-manager skill. Phase 31 builds on this. If 28 not shipped yet, Phase 31 plan must note dependency order. |
| Phase 29 (GSD Workflow Enforcer) | Has PLANS (29-01..02, VALIDATION.md) | No direct dependency. Same `_writeSettingsFile` extension pattern is the relevant artifact. |
| Phase 30 (CLAUDE.md Idempotent Merge) | Has PLANS (30-01..02-PLAN.md) | D-06 (session-manager SKILL.md update) is file write only, independent of CLAUDE.md logic. No dependency. |

**Dependency verdict:** Phase 31 depends on Phase 28 for session-manager start-path body being in a known state. If Phase 28 has not shipped, the planner must include a check step: verify `skills/session-manager/SKILL.md` greeting triggers status before removing the body block.

---

## Skill Removal: What Needs Cleanup

### Files in repo to delete
- `skills/dev-router/SKILL.md` (and dir) [VERIFIED: exists]
- `skills/project-switcher/SKILL.md` (and dir) [VERIFIED: exists]

### Files in user's `~/.claude/skills/` to offer cleanup
- `~/.claude/skills/dev-router/SKILL.md` [VERIFIED: exists at `~/.claude/skills/dev-router/SKILL.md`]
- `~/.claude/skills/project-switcher/SKILL.md` [VERIFIED: exists at `~/.claude/skills/project-switcher/SKILL.md`]

### `lib/install/skills.mjs` change
Current `skillNames` array: `['session-manager', 'project-switcher', 'dev-router', 'dev-research']` [VERIFIED: skills.mjs line 42]
After Phase 31: `['session-manager', 'dev-research']`

**Note:** `custom-skills.mjs` does NOT exist — the function `installCustomSkills` lives in `lib/install/skills.mjs`. CONTEXT.md D-15 refers to `lib/install/custom-skills.mjs` but the actual file is `lib/install/skills.mjs` function `installCustomSkills`. [VERIFIED: glob search, file read]

### Atomic safety (CONTEXT.md Specifics)
Hook install must complete before skill file removal. Plan task order: (1) write hook files, (2) register hooks in settings.json, (3) remove skill files, (4) remove from skills.mjs array, (5) offer user cleanup of `~/.claude/skills/`.

---

## project-registry.md vs project-map.json

**vault/meta/project-registry.md format:** [VERIFIED: file read]
Markdown table — project names in first column. Requires regex/markdown parsing. Updated manually or by session-manager.

**vault/project-map.json format:** [VERIFIED: file read]
```json
{ "projects": { "/path/to/project": "project-name", ... } }
```
Machine-readable JSON. Already used by `session-start-context.sh`. Contains 8 projects.

**Note discrepancy:** `project-registry.md` lists 7 projects, `project-map.json` has 8 (includes `sso`). The JSON file is authoritative for path→name mapping (written by wizard). The markdown is informational.

**Hook should:** Read `project-map.json` → extract `Object.values(data.projects)` for project name list. Fall back to parsing `project-registry.md` (first column of table rows matching `^\| [^|]+`). [CITED: project-registry.md structure; VERIFIED: project-map.json structure]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Plain text stdout from UserPromptSubmit is added as Claude context (same as JSON additionalContext) | Architecture Patterns | If wrong, need JSON output format instead — low risk, easy to change |
| A2 | `if` field at hook level correctly filters to `Bash(git commit*)` subcommands | Architecture Patterns | If wrong, the hook fires on all Bash calls — fallback is internal bash regex (same as gsd-validate-commit.sh) |
| A3 | Phase 28 removed greeting triggers from session-manager description frontmatter | Phase Interdependency | If 28 not shipped yet, Phase 31 plan must handle this itself |

---

## Open Questions

1. **Plain text vs JSON output for UserPromptSubmit**
   - What we know: docs show both approaches; `budget-check.mjs` uses plain `process.stdout.write(warning)`
   - What's unclear: whether plain text gets prepended silently or triggers a visible "Context added" UI element
   - Recommendation: Use plain text (simpler), match existing budget-check pattern

2. **Phase 28 completion state**
   - What we know: 28 has 3 PLAN files and a VALIDATION.md — appears planned, status unknown
   - What's unclear: Has Phase 28 shipped? Is session-manager skill already updated?
   - Recommendation: Plan task to verify current `skills/session-manager/SKILL.md` description frontmatter before removing start-path body block

3. **dev-router hook: emit on ALL messages or only when keyword matches?**
   - What we know: Current skill fires on ALL messages to classify them
   - What's unclear: Emitting on every message adds noise; emitting only on keyword matches misses first-message routing
   - Recommendation: Only emit when a keyword matches one of the 5 routing categories. First-message detection is now Phase 28/SessionStart's domain — don't replicate it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All 3 .mjs hooks | Yes | v20.12.2 | — |
| `vault/project-map.json` | project-switcher hook | Yes | — | Parse project-registry.md |
| `vault/meta/project-registry.md` | project-switcher hook | Yes | — | Skip project name matching |
| `.planning/config.json` | git-conventions strict mode | Assumed present (GSD project) | — | Default to warn mode |
| `~/.claude/hooks/` directory | Hook installation | Yes | — | Create in install step |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node test runner (existing pattern from Phase 25) |
| Config file | None found — inline test scripts |
| Quick run | `node --test tests/` or manual hook invocation |
| Full suite | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKL-01 | dev-router emits routing hint on dev keywords | unit | `echo '{"prompt":"fix the auth bug"}' \| node hooks/dev-router.mjs` | No — Wave 0 |
| SKL-01 | dev-router is silent on non-matching prompts | unit | `echo '{"prompt":"how are you"}' \| node hooks/dev-router.mjs` | No — Wave 0 |
| SKL-02 | session-manager SKILL.md has no start-path body | file check | `grep -c "FIRST message" skills/session-manager/SKILL.md` should return 0 | No — Wave 0 |
| SKL-03 | project-switcher emits on known project name | unit | `echo '{"prompt":"work on biko-pro","cwd":"/other"}' \| node hooks/project-switcher.mjs` | No — Wave 0 |
| SKL-03 | project-switcher silent on current project | unit | `echo '{"prompt":"work on claude-dev-stack","cwd":"/Users/.../claude-dev-stack"}' \| node hooks/project-switcher.mjs` | No — Wave 0 |
| SKL-04 | git-conventions warns on bad commit (warn mode) | unit | `echo '{"tool_input":{"command":"git commit -m \"fix stuff\""}}' \| node hooks/git-conventions-check.mjs` | No — Wave 0 |
| SKL-04 | git-conventions silent on valid commit | unit | `echo '{"tool_input":{"command":"git commit -m \"fix: correct auth flow\""}}' \| node hooks/git-conventions-check.mjs` | No — Wave 0 |

### Wave 0 Gaps
- [ ] Manual stdin pipe tests for all 3 new hooks (no test file framework needed — hook stdout is the test)
- [ ] Verify `settings.json` after wizard run: `cat .claude/settings.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(JSON.stringify(d.hooks,null,2))"`

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `hooks/budget-check.mjs` — stdin JSON parsing, fail-silent pattern, UserPromptSubmit output format
- [VERIFIED: codebase] `~/.claude/settings.json` — actual hook registration format for UserPromptSubmit, PreToolUse
- [VERIFIED: codebase] `~/.claude/hooks/gsd-validate-commit.sh` — existing conventional commits hook pattern
- [VERIFIED: codebase] `lib/install/skills.mjs` — `installCustomSkills` function, actual `skillNames` array
- [VERIFIED: codebase] `lib/install/hooks.mjs` — `_writeSettingsFile` extension pattern
- [VERIFIED: codebase] `~/.claude/skills/dev-router/SKILL.md`, `skills/dev-router/SKILL.md` — routing keyword lists
- [VERIFIED: codebase] `vault/project-map.json` — project names and paths
- [VERIFIED: codebase] `vault/meta/project-registry.md` — registry markdown format
- [CITED: https://code.claude.com/docs/en/hooks] — UserPromptSubmit/PreToolUse stdin schema, `if` field syntax, output formats

### Secondary (MEDIUM confidence)
- [CITED: 28-CONTEXT.md, 29-CONTEXT.md] — Phase interdependency and hook registration patterns confirmed from phase documents

---

## Metadata

**Confidence breakdown:**
- Hook schema (UserPromptSubmit/PreToolUse): HIGH — verified via official docs + existing working registrations
- Keyword extraction (dev-router): HIGH — verified from SKILL.md source file
- Skill file locations: HIGH — verified by glob search
- `lib/install/skills.mjs` target: HIGH — file inspected, skillNames array confirmed
- project-map.json parsing: HIGH — file format verified
- `if` field in settings.json: MEDIUM — cited from official docs but not seen in existing project settings

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (hook schema stable, official docs not changing rapidly)
