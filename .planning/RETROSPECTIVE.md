# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.12 — Hooks & Limits

**Shipped:** 2026-04-16
**Phases:** 13 (19–32, including decimal 18.1 carry-over) | **Plans:** 32 | **Tests:** 912 (+354 from v0.11 baseline 558)

### What Was Built

- **Project-level hooks architecture** — session hooks + `allowedTools` moved from global to per-project `.claude/settings.json` (Phase 19, BUG-01..06)
- **Real OAuth budget detection** — `api.anthropic.com/api/oauth/usage` + Keychain token + SessionStart display + statusline footer (Phases 20 + 25, LIMIT-01/05)
- **Limit-aware execution primitives** — 4-option continuation prompt, `loop.md` GSD-aware template, post-reset handoff via STATE.md `stopped_at` (Phases 21 + 22, LIMIT-02..04)
- **Smart re-install wizard** — pre-fill for language/projects/use-case, GSD/NotebookLM version checks, bulk prompts (Phases 23 + 24, DX-07..13 + UX-01..07)
- **Skills→Hooks migration** — `dev-router`, `project-switcher`, `session-manager` start-path, `git-conventions` converted from LLM-invoked skills to deterministic hooks (Phase 31, SKL-01..04)
- **GSD workflow customization** — SHA-diff patch re-apply via SessionStart hook surviving `/gsd-update` (Phase 27, GSD-01). Workflow enforcer hook prevents per-phase execute when 2+ pending (Phase 29, WF-01)
- **CLAUDE.md idempotent merge** — delegated to `updateProjectClaudeMd()` with `<!-- @claude-dev-stack:start/end -->` markers (Phase 30, BUG-07)
- **Capture-automation hotfix (v0.12.1)** — idea-trigger UserPromptSubmit hook, RU + EN regex, ReDoS-safe, telemetry counter (Phase 32, CAPTURE-01..04)
- **Auto-ADR capture code (UAT pending)** — Haiku subprocess bridge, duplicate detection, supersede logic, `claude-dev-stack decisions` CLI (Phase 26, ADR-02)

### What Worked

- **Inline hotfix pattern** — Phase 20 (budget detection) shipped entirely during Phase 23 session without a formal plan. Velocity bonus but created bookkeeping debt (see below).
- **TDD for hooks** — Phase 32 idea-capture hook landed clean with 15 failing → passing tests; zero regressions on merge.
- **Atomic planning phases** — Phase 27 (GSD patches) explicitly narrowed scope to "formalization cut" and deferred extended features (per-project overrides, diff-based patches) to backlog. Shipped fast, unblocked other work.
- **Traceability table as source of truth** — quick task 260415-ps8 successfully reconciled shipped-but-unmarked state by flipping traceability rows; the v1 checkboxes followed at milestone close.
- **Phase 32 as hotfix release track** — Released as `@0.12.1` on separate PR without blocking v0.12.0 cut. Good release hygiene.

### What Was Inefficient

- **Phase 21 and Phase 25 shipped without SUMMARY.md** — inline delivery during adjacent sessions. No retrospective captured; had to be accepted as tech debt at close.
- **ADR-02 and SSR-01 UAT deferred** — both phases have `checkpoint:human-verify` gates that cannot run in background/parallel execution. Code shipped but verification loop not closed; carried forward as Known Gaps.
- **gsd-tools CLI bugs surfaced at milestone close** — `audit-open` threw `ReferenceError: output is not defined`; `milestone complete` polluted `STATE.md status:` field with a multi-line string; accomplishments extractor produced `One-liner:` literal strings instead of content. All worked around manually but should be reported upstream.
- **Parallel execute shared-worktree race** — during Phase 30 execution, a concurrent `gsd-execute-phase` on Phase 29 force-switched the shared checkout 5 times and caused a merge conflict on `claude-md.mjs`. Follow-up: default to worktrees for parallel execute.
- **v0.12 scope drift from 4 phases to 13** — original roadmap (2026-04-13) mapped 9 requirements to 4 phases (19–22). By close, 38 requirements across 13 phases. Not necessarily bad — emergent scope was real user value — but worth noting for v1.0 planning discipline.

### Patterns Established

- **Project-level over global hooks** — codified in BUG-01 success criteria, documented in `vault/shared/patterns.md`. Precedent for all future hook work.
- **Hooks over skills for deterministic routing** — Phase 31 doctrine: if the decision is keyword-based and doesn't need an LLM, it's a hook, not a skill. Saves tokens, fires silently.
- **SHA-diff patches surviving upstream updates** — `patches/*.md` + wizard copy to `~/.claude/gsd-local-patches/` + SessionStart re-apply. Applicable to any project consuming third-party workflows.
- **PR-only to main** — user feedback memory codified after direct-merge incident on 2026-04-15. Enforced on this milestone close via `chore/v0.12-milestone-close` branch.
- **Retroactive VERIFICATION.md stubs with `verification_type: shipped-release-backfill`** — lets bookkeeping catch up on phases that shipped inline without paperwork.

### Key Lessons

1. **Inline hotfixes save time but cost bookkeeping hygiene.** Phase 20/21/25 shipped without formal plans. They worked — but closing the milestone required a dedicated backfill task (260415-ps8). Trade-off is acceptable only if followed by a scheduled bookkeeping sweep.
2. **UAT gates need a named agent.** "Parent agent to surface to user" is not a procedure — it's a hope. Both ADR-02 and SSR-01 UAT sat idle for 2 days. Fix: every `checkpoint:human-verify` should be a TODO in STATE.md with an explicit resume trigger.
3. **gsd-tools CLI is not milestone-close-safe yet.** Multiple data-quality bugs (audit-open crash, STATE pollution, useless accomplishments extraction) turned a 10-min close into a 45-min manual reconstruction. Worth contributing upstream fixes.
4. **Phase numbering is decoupled from milestone numbering.** v0.12 spans phases 19–32; no reset. Verified good for cross-milestone dependency tracking but confusing for outsiders reading ROADMAP.md.
5. **pnpm monorepo pivot for v1.0 is the right forcing function.** The god-file `bin/install.mjs` (1287 lines) + 14 `lib/` feature modules have outgrown single-package structure. Carving `@cds/core` also forces interface boundaries that `lib/` doesn't have today.

### Cost Observations

- Model mix: ~50% Sonnet (execution), ~30% Opus (planning/review), ~20% Haiku (ADR extraction + statusline)
- Sessions: ~12 dedicated v0.12 sessions (2026-04-13 → 2026-04-16)
- Notable: Haiku subprocess for auto-ADR capture (Phase 26) was the first use of subagent-style extraction — UAT-deferred but the pattern is sound.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Tests Added | Key Change |
|-----------|--------|-------------|------------|
| v0.8 | 5 (1–5) | — | NotebookLM pipeline (via `notebooklm-py` wrapper) |
| v0.9 | 4 (6–9) | — | Per-project notebooks + git-conventions skill |
| v0.10 | 4 (10–13) | +77 → 483 | GSD infrastructure (ADR bridge + parallel execution) |
| v0.11 | 6 (14–18.1) | +75 → 558 | DX polish, smart re-install, cross-notebook search |
| v0.12 | 13 (19–32) | +354 → 912 | Hooks-first architecture, Skills→Hooks migration, budget detection |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Maintained | Published |
|-----------|-------|---------------------|-----------|
| v0.10 | 483 | ✓ (prompts@^2.4.2 only) | @0.10.0 |
| v0.11 | 558 | ✓ | @0.11.0 |
| v0.12 | 912 | ✓ | @0.12.0 + @0.12.1 |

### Top Lessons (Verified Across Milestones)

1. **Single-dep constraint pays off.** 3 milestones in, still zero runtime deps beyond `prompts`. Install UX stays instant; no supply chain surface area growth.
2. **Bookkeeping drift compounds.** Each milestone where a phase ships without SUMMARY.md or a requirement ships without a flipped checkbox creates debt that has to be paid at close. Fix: flip the box in the same session the code ships, not later.
3. **User feedback memory > repeated corrections.** "PR-only to main", "branching_strategy: phase", "no Co-Authored-By" — all codified in auto-memory after single incidents. Future sessions respect them automatically.
4. **Parallel execute is brittle on a single working tree.** Witnessed in v0.11 (ADR bridge path issue) and v0.12 (Phase 29/30 conflict). v1.0 should default to worktrees for any parallel `gsd-execute-phase`.
