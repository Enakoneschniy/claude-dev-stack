# Phase 39: /cds-quick Demo & Alpha Release - Discussion Log

> **Audit trail only. FINAL phase of v1.0 milestone.**

**Date:** 2026-04-16
**Phase:** 39-cds-quick-demo-alpha-release
**Areas:** /cds-quick design, Bundler + distribution, Migration guide + comms, Release mechanics

---

## Pre-Discussion

Confirmed current state: `@latest = 0.12.1`. Publish workflow uses OIDC + `--provenance` but no `--tag` handling. 4 existing skills (budget-continue, dev-research, notion-importer, session-manager). `/cds-quick` is new skill (+ CLI).

---

## Gray Area Selection

All 4 selected.

---

## `/cds-quick` Design

| Option | Selected |
|--------|----------|
| Claude Code skill (Recommended — dual entry) | ✓ |
| CLI-only subcommand | |
| Skill only, no CLI | |

**User's choice:** Skill + CLI (dual entry).
**Notes:** Skill auto-invokes on `/cds-quick` in Claude Code; calls `claude-dev-stack quick 'task' --json` via Bash tool. Standalone CLI triggers synthetic-transcript captureStandalone for users outside Claude Code. One-shot (not multi-turn). Haiku default model.

---

## Bundler Choice + Distribution Mechanics

| Option | Selected |
|--------|----------|
| tsup + external better-sqlite3 (Recommended) | ✓ |
| Raw esbuild + all bundled except native | |
| No bundler, ship dist/ per package | |

**User's choice:** tsup + external better-sqlite3.
**Notes:** tsup.config.ts at repo root. Externals: `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`. Root package.json adds them as `dependencies`. Single-dep constraint relaxed for v1.0 — documented in migration guide. Tarball target < 5 MB.

---

## Migration Guide + Breaking Change Comms

| Option | Selected |
|--------|----------|
| Tiered guide + wizard warnings (Recommended) | ✓ |
| Quick-only checklist | |
| Deep guide + npm deprecation warning on v0.12.x | |

**User's choice:** Tiered guide + wizard warnings.
**Notes:** `docs/migration-v0-to-v1-alpha.md` = 3 sections (quick checklist + breaking detail + rollback). Wizard warns on Node version + Stop hook migration. No npm deprecate on v0.12.x (respects Node 18 users).

---

## Alpha Release Mechanics

| Option | Selected |
|--------|----------|
| Prerelease flag → --tag alpha + rollback 1.0.0-alpha.N (Recommended) | ✓ |
| Auto-alpha via version field detection | |
| Manual alpha publish | |

**User's choice:** Prerelease flag → --tag alpha.
**Notes:** `.github/workflows/publish.yml` detects `github.event.release.prerelease` flag, routes to `--tag alpha` or `--tag latest`. OIDC preserved. Pre-flight: build+test+pack+smoke install. Rollback = 1.0.0-alpha.2 (avoid unpublish). GitHub release manual draft.

---

## Claude's Discretion

- tsup config options (sourcemaps yes, minification no)
- `/cds-quick` `--model` flag default (`'haiku'` cheap demo)
- Wizard Stop-hook migration UX details (diff preview optional)
- Migration guide rollback command exact wording
- CHANGELOG.md update inclusion (likely yes)

## Deferred Ideas

- **v1.0 GA (post-alpha):** Promote @alpha to @latest, CHANGELOG automation, Windows smoke tests
- **v1.1+:** `/cds-quick --stream`, multi-turn quick mode, tarball slimming, `/cds-query` skill for sessions.search, Homebrew/Scoop packaging

---

*Generated: 2026-04-16*
