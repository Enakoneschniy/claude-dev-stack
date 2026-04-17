# Changelog

All notable changes to `claude-dev-stack` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.1] — 2026-04-16

First alpha release of v1.0 — "CDS-Core Independence." Installable via
`npm install claude-dev-stack@alpha`. Does not disturb existing v0.12.x users on `@latest`.

See [migration guide](./docs/migration-v0-to-v1-alpha.md) for full breaking-change details.

### Added

- pnpm monorepo scaffolding: `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`
  (SEED-002, Phase 33)
- Claude Agent SDK integration via `dispatchAgent` primitive — replaces the `claude -p --bare`
  subprocess pattern (CAPTURE-05 closure of v0.12 ADR-02 Known Gap, Phase 34)
- Tiered vault: SQLite Tier 2 with FTS5 full-text search on observations (SEED-004, Phase 35)
- Auto session capture — `hooks/session-end-capture.mjs` Stop hook consolidates 4 prior behaviors
  (log-check, context.md update, NotebookLM sync, vault auto-push) into a single Node hook
  (Phase 36)
- MCP adapter exposing `sessions.search`, `sessions.timeline`, `sessions.get_observations`,
  `docs.search`, `planning.status` tools to Claude Code (MCP-01/02, Phase 37)
- `claude-dev-stack migrate sessions` CLI subcommand — ports historical markdown sessions to
  SQLite via Haiku extraction (MIGRATE-01/02, Phase 38)
- `/cds-quick "<task>"` Claude Code skill + `claude-dev-stack quick` CLI subcommand — one-shot
  agent dispatch with cost reporting (DEMO-01, Phase 39)
- tsup bundler producing `dist/` from `packages/cds-*/src/*.ts` with three externals:
  `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` (Phase 39)
- GitHub Actions publish workflow with automatic dist-tag selection: prerelease -> `alpha`,
  stable -> `latest`. OIDC Trusted Publishing preserved (Phase 39)

### Changed

- **BREAKING:** Minimum Node version bumped from 18 to 20 (Node 18 EOL + `better-sqlite3` 12.x
  N-API 9 requirement)
- **BREAKING:** `session-end-check.sh` Stop hook replaced by `session-end-capture.sh` (new
  consolidated auto-capture wrapper; wizard prompts for migration on existing projects)
- `/end` skill description narrowed: "fallback only (auto-capture replaces routine use)"
- Install wizard now writes `mcp.servers.cds` entry to each configured project's
  `.claude/settings.json`
- Root `package.json` single-dep constraint relaxed: adds `better-sqlite3`,
  `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` as runtime deps
- Root `package.json` `"files"` array ships `dist/` (bundled output) — `packages/` is NOT in
  the tarball
- Root `package.json` `scripts.build` is now `tsup` (was `tsc --build`); `scripts.typecheck`
  is the new home for `tsc --build`

### Deprecated

- None. v0.12.x remains `@latest` on npm until 1.0.0 GA graduates.

### Removed

- None in this release. Legacy `session-end-check.sh` is still available for rollback users
  but is no longer installed by the wizard.

### Security

- Migration preserves markdown sessions as the source of truth. SQLite (`sessions.db`) is
  derived and can be rebuilt from markdown via `claude-dev-stack migrate sessions`.
- No secret storage introduced. `ANTHROPIC_API_KEY` continues to be read from env only
  (Claude Agent SDK handles it internally).
- GitHub Actions `publish.yml` preserves OIDC Trusted Publishing (`id-token: write` +
  `--provenance`); no long-lived npm tokens stored.

---

[1.0.0-alpha.1]: https://github.com/Enakoneschniy/claude-dev-stack/releases/tag/v1.0.0-alpha.1
