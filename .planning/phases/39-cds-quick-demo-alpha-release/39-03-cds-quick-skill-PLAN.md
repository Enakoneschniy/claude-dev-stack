---
plan_id: 39-03-cds-quick-skill
phase: 39
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - skills/cds-quick/SKILL.md
  - tests/skill-cds-quick.test.mjs
autonomous: true
requirements:
  - DEMO-01
user_setup: []
must_haves:
  truths:
    - "`skills/cds-quick/SKILL.md` exists with YAML frontmatter containing `name: cds-quick`, `description:`, and `trigger_phrases:` list"
    - "Skill body invokes `claude-dev-stack quick \"$ARGUMENTS\" --json` via the Bash tool (shell-fenced code block)"
    - "Skill body parses the JSON result and instructs Claude to display output + cost + sessionId"
    - "Skill body explicitly states that auto-capture happens via the Stop hook (no manual capture trigger from skill body)"
    - "`tests/skill-cds-quick.test.mjs` asserts SKILL.md frontmatter shape + body CLI reference + 4 body-content requirements"
  artifacts:
    - path: "skills/cds-quick/SKILL.md"
      provides: "Claude Code skill — /cds-quick slash command handler"
      contains: "claude-dev-stack quick"
      min_lines: 20
    - path: "tests/skill-cds-quick.test.mjs"
      provides: "Structural tests on SKILL.md"
      contains: "cds-quick"
  key_links:
    - from: "skills/cds-quick/SKILL.md"
      to: "packages/cds-cli/src/quick.ts (via claude-dev-stack quick CLI)"
      via: "Bash tool invocation inside skill body"
      pattern: "claude-dev-stack quick"
    - from: "skills/cds-quick/SKILL.md frontmatter"
      to: "Claude Code dev-router trigger phrase matcher"
      via: "auto-invocation on /cds-quick or 'quick task:' prefix"
      pattern: "trigger_phrases:"
---

<objective>
Create the `/cds-quick` Claude Code skill — a Markdown file at `skills/cds-quick/SKILL.md` with frontmatter + body that invokes the Plan 02 CLI via Bash tool and displays the structured result.

Purpose: satisfy DEMO-01 user-facing deliverable — user types `/cds-quick "<task>"` in Claude Code and sees a result summary with cost.

Output: 1 skill file (ships to `~/.claude/skills/cds-quick/SKILL.md` via wizard copy) + 1 test file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md

<interfaces>
Claude Code skill convention (reference: existing skills/session-manager/SKILL.md + ~/.claude/skills/dev-research/SKILL.md):

```
---
name: <slug>
description: |
  <what the skill does, who triggers it, when to use>
trigger_phrases:
  - /<slug>
  - <fallback phrases>
---

# <Title>

<Instructions to Claude — natural language. Can include $ARGUMENTS (the raw prompt after the trigger).>

Optional: fenced bash blocks to invoke CLI tools.
```

Wizard picks up `skills/*/SKILL.md` during install and copies to `~/.claude/skills/<slug>/` (existing pattern in lib/install/skills.mjs — Phase 15+).

Plan 02's CLI output in --json mode:
```json
{ "output": "<agent text>", "cost": { "cost_usd": 0.0041, "tokens": {"input":50,"output":25} }, "sessionId": "uuid" }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create skills/cds-quick/SKILL.md</name>
  <read_first>
    - ./skills/session-manager/SKILL.md (analog — if exists)
    - ./skills/budget-continue/SKILL.md (analog)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"skills/cds-quick/SKILL.md"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-110, D-111"
  </read_first>
  <files>
    - skills/cds-quick/SKILL.md (new)
  </files>
  <action>
  Create directory `skills/cds-quick/` then write `SKILL.md` with EXACTLY:

  ```markdown
  ---
  name: cds-quick
  description: |
    Run a quick one-shot task via the Claude Agent SDK and auto-capture the session to SQLite.
    Single-dispatch agent run (no multi-turn). Returns a structured result summary with cost
    and session ID. For multi-turn work, use Claude Code normally instead of /cds-quick.
  trigger_phrases:
    - /cds-quick
    - cds-quick
    - quick task:
  ---

  # /cds-quick — One-shot agent dispatch with cost reporting

  **Task:** $ARGUMENTS

  Run the quick CLI and capture its JSON output. Use the Bash tool:

  ```bash
  claude-dev-stack quick "$ARGUMENTS" --json
  ```

  Parse the JSON output. It has three fields:

  - `output` — the agent's text response. Display this verbatim to the user, preserving
    formatting. Do not paraphrase.
  - `cost` — an object `{ cost_usd: number, tokens: { input: number, output: number } }`.
    Format as a short footer line:
    `── cost: $<cost_usd to 4 decimals> · input <input> tokens · output <output> tokens`
  - `sessionId` — a UUID. Display as: `session: <uuid>`

  ## Output format

  Show the response to the user as:

  ```
  <output field verbatim>

  ── cost: $0.0041 · input 50 tokens · output 25 tokens · session: abc-123
  ```

  ## Capture behavior

  When this skill runs inside Claude Code, session auto-capture fires on the next session-end
  via the Stop hook (`~/.claude/hooks/session-end-capture.sh`, installed by the
  `claude-dev-stack` wizard). **Do NOT trigger capture manually** from this skill body.
  The capture writes structured observations to `~/vault/projects/<project>/sessions.db` and
  makes them queryable via the `sessions.search` MCP tool.

  ## When to use vs not

  Use `/cds-quick` for:
  - Short one-shot questions that don't need follow-up ("summarize X", "what's in this file",
    "draft a commit message")
  - Cost-conscious prompts where Haiku is sufficient
  - Demoing the claude-dev-stack pipeline end-to-end

  Do NOT use for:
  - Multi-turn debugging conversations (use Claude Code normally)
  - Code edits that need file context (use Claude Code with the Edit/Write tools)
  - Long-running analysis that benefits from tool use (use the full agent loop)

  ## Alpha notes

  This skill is part of `claude-dev-stack@1.0.0-alpha.1`. Feedback welcomed at
  [github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues).
  ```

  Preserve the exact frontmatter shape — name/description/trigger_phrases are machine-read by the wizard and dev-router.
  </action>
  <verify>
    <automated>test -f skills/cds-quick/SKILL.md && head -20 skills/cds-quick/SKILL.md | grep -q "^name: cds-quick$" && head -20 skills/cds-quick/SKILL.md | grep -q "trigger_phrases:" && grep -q '/cds-quick' skills/cds-quick/SKILL.md && grep -q 'claude-dev-stack quick' skills/cds-quick/SKILL.md && grep -q '\$ARGUMENTS' skills/cds-quick/SKILL.md && grep -q 'session-end-capture' skills/cds-quick/SKILL.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f skills/cds-quick/SKILL.md` -> exits 0
    - `head -20 skills/cds-quick/SKILL.md | grep -c "^name: cds-quick$"` -> 1
    - `head -20 skills/cds-quick/SKILL.md | grep -c "^description:"` -> 1
    - `head -20 skills/cds-quick/SKILL.md | grep -c "^trigger_phrases:"` -> 1
    - `grep -c "/cds-quick" skills/cds-quick/SKILL.md` -> >= 2 (trigger phrase + title)
    - `grep -c "cds-quick" skills/cds-quick/SKILL.md` -> >= 3
    - `grep -c "quick task:" skills/cds-quick/SKILL.md` -> 1
    - `grep -c 'claude-dev-stack quick' skills/cds-quick/SKILL.md` -> >= 1
    - `grep -c '\$ARGUMENTS' skills/cds-quick/SKILL.md` -> >= 1
    - `grep -c "session-end-capture" skills/cds-quick/SKILL.md` -> 1
    - `grep -c "Do NOT trigger capture manually" skills/cds-quick/SKILL.md` -> 1
    - `wc -l skills/cds-quick/SKILL.md | awk '{print $1}'` -> >= 40
  </acceptance_criteria>
  <done>
  SKILL.md exists with full frontmatter + body per PATTERNS.md spec. Ready for wizard copy.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create tests/skill-cds-quick.test.mjs</name>
  <read_first>
    - ./skills/cds-quick/SKILL.md (created in Task 1)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-03-01, 39-03-02
  </read_first>
  <files>
    - tests/skill-cds-quick.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/skill-cds-quick.test.mjs
  // Structural tests on skills/cds-quick/SKILL.md.
  // Source: Phase 39 VALIDATION §Task 39-03-01, 39-03-02
  import { describe, it, expect } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const skillPath = path.join(__dirname, '..', 'skills', 'cds-quick', 'SKILL.md');

  describe('skills/cds-quick/SKILL.md', () => {
    it('file exists', () => {
      expect(existsSync(skillPath)).toBe(true);
    });

    const content = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';

    it('has YAML frontmatter delimiters', () => {
      const lines = content.split('\n');
      expect(lines[0]).toBe('---');
      const closingIdx = lines.slice(1).findIndex((l) => l === '---');
      expect(closingIdx).toBeGreaterThan(0);
    });

    it('frontmatter declares name: cds-quick', () => {
      expect(content).toMatch(/^name:\s*cds-quick\s*$/m);
    });

    it('frontmatter has description', () => {
      expect(content).toMatch(/^description:/m);
    });

    it('frontmatter declares trigger_phrases list including /cds-quick and "quick task:"', () => {
      expect(content).toMatch(/^trigger_phrases:/m);
      expect(content).toMatch(/-\s*\/cds-quick/);
      expect(content).toMatch(/-\s*quick task:/);
    });

    it('body references the claude-dev-stack quick CLI command', () => {
      expect(content).toMatch(/claude-dev-stack quick\s+"\$ARGUMENTS"\s+--json/);
    });

    it('body uses $ARGUMENTS placeholder', () => {
      expect(content).toMatch(/\$ARGUMENTS/);
    });

    it('body references session-end-capture (auto-capture explanation)', () => {
      expect(content).toMatch(/session-end-capture/);
    });

    it('body instructs to NOT trigger capture manually', () => {
      expect(content).toMatch(/Do NOT trigger capture manually/i);
    });

    it('body mentions cost output format ($ USD + tokens)', () => {
      expect(content).toMatch(/cost_usd/);
      expect(content).toMatch(/tokens/);
    });

    it('body has a bash code fence for the CLI invocation', () => {
      expect(content).toMatch(/```bash[\s\S]+claude-dev-stack quick[\s\S]+```/);
    });

    it('body notes alpha status and issue tracker link', () => {
      expect(content).toMatch(/1\.0\.0-alpha\.1/);
      expect(content).toMatch(/github\.com\/Enakoneschniy\/claude-dev-stack/);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/skill-cds-quick.test.mjs && pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/skill-cds-quick.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs` -> exits 0 + all 12 tests pass
    - `grep -c "describe.*cds-quick.*SKILL" tests/skill-cds-quick.test.mjs` -> 1
  </acceptance_criteria>
  <done>
  Skill structural tests pass — frontmatter shape, body content, CLI reference all verified.
  </done>
</task>

</tasks>

<verification>
Before marking this plan complete, executor MUST pass:

```sh
pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs
```

Manual verification:
- `cat skills/cds-quick/SKILL.md` — visually inspect for clarity + correctness
- When Plan 05's smoke install runs, the skill ships in tarball and copies to `~/.claude/skills/cds-quick/` via wizard
- When real Claude Code invokes `/cds-quick`, dev-router recognizes the trigger phrase and dispatches to this skill
</verification>
