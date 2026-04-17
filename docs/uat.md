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
