# Migration Guide: claude-dev-stack v0.12.x → v1.0.0-alpha.1

## Quick checklist

- [ ] Node version is 20 or higher (`node --version`). Node 18 is not supported.
- [ ] Install: `npm install -g claude-dev-stack@alpha`
- [ ] Re-run the wizard on each project: `cd <project> && claude-dev-stack`
- [ ] Expect one-time Stop hook replacement (wizard prompts for confirmation).
- [ ] Expect new MCP entry `cds` in `.claude/settings.json` under `mcp.servers`.
- [ ] Optional: `claude-dev-stack migrate sessions --dry-run` to preview backfill of past sessions into SQLite.

## Breaking Changes

### Node 18 → Node 20+

**What changed:** minimum Node is now 20. `package.json` has `"engines": { "node": ">=20" }`.

**Why:** Node 18 reached EOL April 2025. `better-sqlite3` 12.x requires Node 20+ for N-API 9 prebuilds.

**What to do:**
- Upgrade Node via `nvm install 20 && nvm use 20` (macOS/Linux) or the Node installer (Windows).
- If you cannot upgrade, stay on `claude-dev-stack@0.12.x` (which remains `@latest` on npm).

### Stop hook: `session-end-check.sh` → `session-end-capture.sh`

**What changed:** the old manual-/end Stop hook is replaced by an auto-capture hook that writes session observations to SQLite.

**Why:** The `/end` skill was a fallback workaround for v0.12's limited session memory. v1.0 captures every session automatically.

**What to do:**
- The install wizard detects the old registration and prompts you to replace it.
- Your custom additions to the old hook (if any) are NOT carried over — the wizard shows a warning. Review manually.
- Use `/end` only as a fallback if auto-capture fails (it logs to `~/.claude/cds-capture.log`).

### New MCP server registration: `mcp.servers.cds`

**What changed:** each project's `.claude/settings.json` gets a new `mcp.servers.cds` entry that the wizard writes.

**Why:** enables `sessions.search`, `sessions.timeline`, `sessions.get_observations`, `docs.search`, and `planning.status` MCP tools in Claude Code.

**What to do:**
- Run `claude-dev-stack` in each project to register. The wizard is idempotent.

### New runtime dependencies

**What changed:** v1.0 adds three deps to `package.json`: `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`.

**Why:** SQLite persistence (SEED-004), SDK-based agent dispatch (replaces `claude -p` subprocess), MCP protocol exposure.

**What to do:**
- First install compiles `better-sqlite3` native bindings. Prebuilds cover macOS (arm64/x64), Linux (x64), Windows (x64) on Node 20/22. If your platform lacks a prebuild, install `python3` + `make` + C++ toolchain.
- The single-dep constraint from v0.12 PROJECT.md is relaxed for v1.0 — these three are infrastructure, not user-facing.

### `/end` skill is fallback-only

**What changed:** `skills/session-manager/SKILL.md` description is narrower; `/end` no longer auto-invokes on "done"/"хватит"/etc.

**Why:** auto-capture covers routine usage; `/end` remains for forced captures.

**What to do:** nothing — behavior change is transparent. Invoke `/end` explicitly if auto-capture fails.

### Native compile note

`better-sqlite3` ships prebuilt binaries for the major platforms but compiles from C++ on uncommon ones (e.g., FreeBSD, Alpine musl, ARM Linux without prebuilds). If `npm install` fails on the `better-sqlite3` postinstall step, install `python3`, `make`, and a C++ toolchain (`build-essential` on Debian/Ubuntu, Xcode CLT on macOS) and retry.

## Rollback

To revert to v0.12.x:

```sh
npm install -g claude-dev-stack@latest
```

This installs the last `@latest`-tagged version (0.12.x). Then:

1. Re-run the wizard on each project to remove v1.0 MCP entries (optional — harmless if left).
2. Your **markdown sessions** under `~/vault/projects/*/sessions/*.md` are intact — SQLite was derived from them and they remain the **source of truth**.
3. If the SQLite file (`~/vault/projects/*/sessions.db`) was created, you can delete it safely; v0.12.x does not read it.

## Feedback

Alpha caveats:
- Auto-capture is the canonical session writer; manual `/end` is fallback only.
- MCP tools are new — filing issues at https://github.com/Enakoneschniy/claude-dev-stack/issues is appreciated.
- Migration command `claude-dev-stack migrate sessions` has a `--dry-run` mode — always use it first to estimate cost (~$0.01 per session).
