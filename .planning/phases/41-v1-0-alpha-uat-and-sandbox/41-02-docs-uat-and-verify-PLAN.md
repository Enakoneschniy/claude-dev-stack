---
plan_id: 41-02-docs-uat-and-verify
phase: 41
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - docs/uat.md
autonomous: true
requirements:
  - RELEASE-01
user_setup: []
must_haves:
  truths:
    - "`docs/uat.md` exists with sections: Prerequisites, Quick run, What it checks, Debugging, Manual host smoke"
    - "Document explicitly warns: NEVER run wizard on your active CC setup for UAT"
---

<objective>
Create `docs/uat.md` procedure document. After this plan, the UAT procedure is fully documented and reproducible by any maintainer.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/41-v1-0-alpha-uat-and-sandbox/41-CONTEXT.md
@./CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create docs/uat.md</name>
  <files>
    - docs/uat.md (new)
  </files>
  <action>
  Create the UAT procedure doc:

  ```markdown
  # UAT Procedure — claude-dev-stack

  ## Prerequisites

  - Docker installed and running (`docker --version`)
  - `pnpm install` completed at repo root
  - `pnpm tsup` has been run (produces `dist/`)

  ## Quick run

  ```sh
  pnpm uat
  ```

  This single command:
  1. Packs the tarball (`pnpm pack`)
  2. Builds a Docker image from `docker/uat/Dockerfile` (node:20-slim + git + build tools)
  3. Runs 14 smoke checks inside the container
  4. Exits 0 if all pass, 1 if any fail

  ## What it checks

  The smoke test validates the **shipped tarball** (not the dev tree):
  - Global npm install from `.tgz` succeeds
  - `claude-dev-stack --version` returns the expected version
  - All CLI subcommands (`help`, `doctor`, `skills`, `version`) exit cleanly
  - `doctor --gsd-permissions` creates `.claude/settings.local.json`
  - Tarball includes required files: `dist/core/index.js`, `skills/cds-quick/SKILL.md`, `CHANGELOG.md`, `hooks/session-end-capture.sh`, SQL migrations
  - Tarball excludes dev artifacts: `packages/`, `tests/`, `.planning/`
  - `dist/core/index.js` is importable as ESM without crash

  ## What it does NOT check

  - Real Claude Code session (Stop hook firing, MCP tool invocation) — requires CC binary + auth
  - Live `/cds-quick` dispatch — requires `ANTHROPIC_API_KEY` (covered by `INTEGRATION=1` gated test)
  - Wizard interactive flow — requires TTY; container uses non-interactive mode

  ## Debugging failures

  ```sh
  # Interactive shell inside the UAT container:
  docker run --rm -it cds-uat bash

  # Re-run individual checks:
  claude-dev-stack doctor
  claude-dev-stack --version
  tar tzf /app/claude-dev-stack-*.tgz | grep dist/core/
  ```

  ## Manual host smoke (CAUTION)

  > **WARNING:** NEVER run `claude-dev-stack` (the wizard) on your active Claude Code
  > setup for UAT purposes. The wizard modifies `~/.claude/settings.json`, `~/vault/`,
  > and hook registrations — this WILL affect your working development sessions.

  If you must test on a real machine (e.g., to verify Stop hook firing with real CC):
  1. Create a **dedicated macOS/Linux user account** for UAT
  2. Log in as that user
  3. Install Claude Code, authenticate, install `claude-dev-stack@alpha`
  4. Run the wizard in a test project under that user's HOME
  5. Your main account's `~/.claude/` and `~/vault/` are untouched

  Do NOT rely on `CLAUDE_CONFIG_DIR` or `HOME` env overrides — Claude Code's behavior
  with non-standard config paths is not guaranteed.
  ```
  </action>
  <verify>
    <automated>test -f docs/uat.md && grep -q "pnpm uat" docs/uat.md && grep -q "NEVER run" docs/uat.md && grep -q "docker" docs/uat.md</automated>
  </verify>
  <done>docs/uat.md created with 5 sections + explicit warnings.</done>
</task>

</tasks>

<verification>
```sh
test -f docs/uat.md
grep -c "Prerequisites" docs/uat.md   # >= 1
grep -c "Quick run" docs/uat.md        # >= 1
grep -c "Debugging" docs/uat.md        # >= 1
grep -c "NEVER" docs/uat.md            # >= 1
```
</verification>
