# Release Notes Template — claude-dev-stack 1.0.0-alpha.1

> This is the manual-draft template for the GitHub release body when creating
> `v1.0.0-alpha.1` (and by extension future `-alpha.N`, `-beta.N` prereleases).
>
> **IMPORTANT:** When creating the GitHub release, you MUST check the
> "Set as a pre-release" checkbox. The `publish.yml` workflow uses
> `github.event.release.prerelease` to decide between `--tag alpha` and
> `--tag latest`. Missing the checkbox will publish the alpha as `latest` and
> clobber v0.12.x users on the `@latest` dist-tag.

---

# claude-dev-stack 1.0.0-alpha.1

First alpha of v1.0 — "CDS-Core Independence."

> **This is a prerelease.** `npm install claude-dev-stack@latest` still installs the
> stable v0.12.x branch.
> To install this alpha: `npm install claude-dev-stack@alpha`

## Highlights

- pnpm monorepo with `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`
- Claude Agent SDK integration via `dispatchAgent` — replaces the v0.12 `claude -p` subprocess
- Tiered vault: SQLite Tier 2 session memory with FTS5 search
- Auto session capture — `/end` no longer required for routine sessions
- MCP adapter exposing `sessions.*`, `docs.search`, `planning.status` to Claude Code
- Backfill: `claude-dev-stack migrate sessions` ports historical markdown sessions to SQLite
- `/cds-quick "<task>"` Claude Code skill + CLI subcommand — one-shot agent dispatch with cost

## Breaking Changes

Node 20+ required. Full details in the
[migration guide](./docs/migration-v0-to-v1-alpha.md).

Summary:
- Node 18 -> Node 20+ (Node 18 EOL + `better-sqlite3` 12.x N-API 9 requirement)
- Stop hook `session-end-check.sh` -> `session-end-capture.sh` (wizard prompts for migration)
- `/end` skill is fallback-only (auto-capture is the canonical session writer now)
- Root `package.json` adds 3 runtime deps: `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`,
  `@modelcontextprotocol/sdk` (single-dep constraint relaxed for v1.0)
- `"files"` array ships `dist/` (bundled output); `packages/` is not distributed

## Alpha Caveats

- **Auto-capture is canonical.** Manual `/end` remains as a fallback when auto-capture fails.
- **MCP tools are new.** `sessions.search`, `sessions.timeline`, `sessions.get_observations`,
  `docs.search`, `planning.status` — filing issues at
  [github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues)
  is appreciated.
- **Migration cost.** `claude-dev-stack migrate sessions --dry-run` estimates Haiku cost
  (~$0.01 per session) before you commit to `--apply`. Always dry-run first.
- **Platform coverage.** macOS (arm64/x64), Linux (x64), Windows (x64) on Node 20/22.
  Windows user testing is thin — reports welcome.

## Full Changelog

See [CHANGELOG.md](./CHANGELOG.md#100-alpha1) for the full list of Added / Changed / Deprecated /
Removed / Security changes.

---

**Feedback:** open issues at
[github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues)
or reach out in the relevant channels. Alpha feedback directly shapes the 1.0.0 GA.
