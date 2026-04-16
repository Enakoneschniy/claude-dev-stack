---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: CDS-Core Independence (Phase A)
status: blocked
stopped_at: Phase 34 Plan 01 Task 3 — LGPL transitive via sharp platform binding
last_updated: "2026-04-16T17:00:00.000Z"
last_activity: 2026-04-16
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 8
  completed_plans: 4
  percent: 50
blockers:
  - id: 34-01-lgpl-sharp
    phase: 34
    plan: 34-01
    file: .planning/phases/34-sdk-integration-core-primitives/34-01-BLOCKER.md
    summary: "@img/sharp-libvips-darwin-arm64 (LGPL-3.0-or-later) pulled via SDK optionalDependencies; plan audit hard-blocks LGPL but Pitfall 6 only names GPL/AGPL/SSPL. Needs user decision on allowlist vs replan."
---

# Project State: claude-dev-stack

**Last updated:** 2026-04-16 — v1.0 CDS-Core Independence (Phase A) roadmap created (7 phases 33–39, 19 v1 requirements, 100% coverage).

**Last activity:** 2026-04-16

---

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-16 after v0.12)

**Core value:** Claude Code can resume work across sessions as if it remembered everything.
**Current focus:** Phase 34 — sdk-integration-core-primitives

---

## Current Position

Phase: 34 (sdk-integration-core-primitives) — BLOCKED mid-Plan-01
Plan: 1 of 4 (Task 3 halted on transitive license audit)
Status: Blocked — LGPL-3.0-or-later via `@img/sharp-libvips-darwin-arm64` (optional SDK binding)
Last activity: 2026-04-16 -- Phase 34 execution paused, blocker artifact written

### Blocker detail

See `.planning/phases/34-sdk-integration-core-primitives/34-01-BLOCKER.md` for full context and decision options. tl;dr: the SDK pulls `sharp` platform bindings as `optionalDependencies`; one of those is LGPL-3.0-or-later. Plan 01's forbidden-license list widened Pitfall 6 (GPL/AGPL/SSPL) to include LGPL, so the audit blocked. User decision needed on: allowlist LGPL with NOTICES disclosure, drop LGPL from the blocklist, exclude sharp via pnpm overrides, or replan.

### Active Milestone Phases (v1.0 Phase A)

| # | Phase | Reqs | Status |
|---|-------|------|--------|
| 33 | Monorepo Foundation | MONO-01..04 | Not started |
| 34 | SDK Integration & Core Primitives | SDK-01, SDK-02, CORE-01, CORE-02 | Not started |
| 35 | Tiered Vault — Tier 2 SQLite | VAULT-01..03 | Not started |
| 36 | Auto Session Capture | CAPTURE-05, CAPTURE-06 | Not started |
| 37 | MCP Adapter | MCP-01, MCP-02 | Not started |
| 38 | Backfill Migration | MIGRATE-01, MIGRATE-02 | Not started |
| 39 | `/cds-quick` Demo & Alpha Release | DEMO-01, RELEASE-01 | Not started |

### Critical Risks Surfaced During Planning

- **SDK-01 license verification is a soft blocker on every downstream phase.** Phase 34 must start with the license check before any SDK import — if non-MIT/Apache-2.0, escalate before code lands.
- **CAPTURE-05 closes v0.12 ADR-02 Known Gap retroactively.** The failing `claude -p` subprocess pattern is replaced by SDK in Phase 36 — call out in Phase 36 SUMMARY + v1.0 release notes.
- **DEMO-01 gates RELEASE-01.** Phase 39 cannot ship `1.0.0-alpha.1` without a working `/cds-quick` round-trip.
- **VAULT-01 driver choice (`better-sqlite3`) is locked** per SEED-004 + REQUIREMENTS. Do NOT re-open during Phase 35 planning.

### Known Gaps from v0.12 (still carried)

- **ADR-02 UAT** — closed retroactively by Phase 36 (auto-capture replaces failing `claude -p` subprocess pattern).
- **SSR-01 UAT** — SessionStart marker mtime + 60-min skip-reload not live-verified. Route to v1.x quick task.
- **Phase 21 / Phase 25 SUMMARY.md backfill** — accepted tech debt, not blocking.
- **`detect.test.mjs` pre-existing failures** — 3 subtests fail on `profile must be null in v1`; route to bugfix quick task in v1.x.
- **NotebookLM recursive `docs/*/` scan bug** — discovered during SEED migration. Surface in v1.x planning.

---

## Accumulated Context

### Decisions (carried forward + new for v1.0)

- **Single-dep constraint preserved**: `prompts@^2.4.2` only on the CLI surface. SDK is internal infrastructure dep on `cds-core`.
- **NotebookLM via `notebooklm-py` CLI wrapper** — ADR-0001.
- **Branching strategy**: `phase` → `gsd/phase-{phase}-{slug}`. PR-only to main (never direct commit).
- **Hooks architecture**: Project-level `.claude/settings.json`, never global.
- **v1.0 architecture**: pnpm workspaces monorepo + TS project references + vitest + Pi SDK port. See `docs/cds-core-independence-plan.md`.
- **Tiered vault**: Tier 1 (markdown docs/decisions/planning) + Tier 2 (SQLite sessions, **better-sqlite3 locked**) + Tier 3 (markdown context.md/STATE.md). SEED-004.
- **Auto-capture cutover**: from v1.0, Stop hook writes ONLY to SQLite. Manual `/end` deprecated but kept as fallback. Markdown sessions backfilled (Phase 38), originals frozen on disk.
- **Alpha release tag**: `npm publish --tag alpha` so existing v0.12.x users on `@latest` are NOT auto-upgraded.

### Quick Tasks Completed (v0.12)

| # | Description | Date | Commit |
|---|-------------|------|--------|
| 260415-pga | Fix adr-bridge test traversal assertion for Linux CI | 2026-04-15 | d18fc30 |
| 260415-ps8 | v0.12 bookkeeping backfill (ROADMAP/REQUIREMENTS/VERIFICATION stubs) | 2026-04-15 | 95f7111 |

---

## Session Continuity

Last session: 2026-04-16T13:01:32.627Z
Stopped at: Phase 34 context gathered (Phase 33 executing in background)
Resume file: .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md
