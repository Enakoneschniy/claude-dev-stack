---
id: SEED-002
status: dormant
planted: 2026-04-14
planted_during: v0.12 Hooks & Limits (mid-milestone, during Phase 25 planning)
trigger_when: "After v0.12 release ships (phases 21-31 merged); when planning v0.13+ or starting CDS-Core Independence milestone"
scope: Large
---

# SEED-002: CDS-Core Independence — Vendored Fork of GSD

## Why This Matters

GSD (`get-shit-done-cc`) is currently a **third-party npm dependency**. CDS (claude-dev-stack) is a product for OTHER PEOPLE, not personal toolkit, so dependency risk is critical.

**The risk is real, not theoretical:**
- GSD repo audit (gsd-build/get-shit-done): 52,906 stars, 4,417 forks, updated daily, **NOT abandoned** — but **NOT stable** either
- 45 open issues, 7+ are about a single regression cluster (#2206, #2213, #2217, #2218): version 1.36.0 broke `.sh` hook stale-detection across ALL installations with no warning
- One upstream regression = broken release for every CDS user, with zero control over reaction window
- Multiple users have warned about GSD as dependency; warnings now validated by data
- Phase 27 (gsd-patches) exists precisely because GSD updates already break local modifications — an ongoing tax

**What independence buys:**
- No upstream surprises — version cadence is yours
- No more "GSD broke our wizard, hold release" incidents
- Free to refactor architectural pain points without forking workarounds
- Full control over feature roadmap (no waiting for upstream PR merges)

## When to Surface

**Trigger:** After v0.12 release (phases 21-31 shipped). User explicitly said: "сейчас все таки завершим все фазы которые есть и сделаем релиз. далее я думаю что есть смысл отказаться от GSD полностью."

This seed should auto-surface during `/gsd-new-milestone` when:
- New milestone is v0.13 or later
- Milestone scope mentions: "fork", "independence", "vendor", "GSD replacement", "stack architecture", "self-hosted"
- User pain matrix references any of: `.planning` location, branching strategy, teams parallelization, config flexibility

## Scope Estimate

**Large** — 1-2 milestones (4-8 weeks) with strict scope discipline. Without discipline, easily becomes 3-6 months and morale-crushing.

## Legal Foundation

GSD is **MIT-licensed** (verified 2026-04-14 via GitHub API). Full freedom to fork, modify, sell, close. Obligations:
- Preserve `LICENSE` file from upstream
- Keep copyright headers in source files
- Add `NOTICES.md` with attribution: "Based on get-shit-done by TÂCHES"

## Strategy: Vendored Fork (NOT Full Rewrite)

Decision rationale documented during 2026-04-14 conversation:
- Full rewrite (option 1): 3-6 months, throws away working parts. Rejected.
- Hard fork as separate repo (option 2): More ceremony, two codebases. Possible.
- **Vendored copy in CDS repo (option 3): Selected.** Simpler, single install, single repo. Can extract to standalone repo later if needed.

Rule established: **"works — don't touch", "doesn't fit requirements — improve"**.

## Scope Discipline (CRITICAL — Prevents Scope Explosion)

### DO NOT TOUCH (works well, leave alone)
- discuss engine (adaptive question generation)
- planner agent + verification loop
- roadmap engine
- goal-backward verification
- code-review + fix pipeline
- research workflows
- subagent infrastructure (planner/executor/researcher/verifier/etc)

### TARGET REFACTORS (specific pain accumulated through v0.12 work)

1. **`.planning/` location** — currently hardcoded to `$PWD`, pollutes project git with planning commits. Requires `/gsd-pr-branch` workaround. Move to `vault/projects/X/planning/` with `cds.config.json` pointer in project repo. Side benefit: state survives between machines if vault is synced.

2. **Branching strategy** — currently rigid. Setting `branching_strategy: none` broke Phase 6 (commits went to main). Make per-project configurable, auto-detect from branch protection rules.

3. **Teams/parallel execute** — `gsd-manager` is orchestrator without true task topology. Build proper teams-aware agent dispatch with dependency graph.

4. **Skills/hooks boundary** — eliminate duplication. Phase 31 already targets `dev-router`, `session-manager` (start), `project-switcher` (detection), `git-conventions`. Extend after fork.

5. **Config system** — `gsd-settings` is narrow toggle set. Need flexible per-project config surface (think `cds.config.json` schema with override layers).

6. **Statusline replacement** — Phase 25 already in flight (`cds-statusline.js`); ensure update-notification parity for both GSD-legacy and CDS-native.

7. **Session end** — currently hybrid (Stop hook does deterministic side-effects, skill writes summary). See note `2026-04-14-silent-session-end-hook.md` for variant A (detached Anthropic API call from Stop hook, billing separate from plan).

8. **Update notification** — replicate `gsd-check-update.js` pattern for claude-dev-stack itself: detached `npm view` (or GitHub releases API) → cache file → statusline reads.

9. **GSD update mechanism** — currently breaks local patches (Phase 27 `gsd-patches` is the workaround). After fork, problem dissolves: version control is yours.

## Pain Matrix Source — GSD Issues to Consult During Audit

From 21/45 open GSD issues that touch our pain areas:
- **#2204** — mandatory code review gate after each phase (we want this; implement ourselves)
- **#2213** — Socratic spec refinement before discuss (good idea; implement)
- **#2191** — one-way GitHub Issues/Milestones sync for phases (relevant if going product-public)
- **#2201** — read-time prompt injection scanner (security feature)
- **#2206/#2213/#2217/#2218** — the regression cluster proving dependency risk (evidence, not features)

Full audit during Phase B (see Execution Plan) — read remaining ~14 relevant issues, classify keep/drop/defer.

## Execution Plan (Rough — Expand During Milestone Planning)

**Phase A — Vendor + Legal**
- Copy GSD source into `vendor/cds-core/` (or `src/core/`)
- Preserve `LICENSE`, add `NOTICES.md`, copyright headers
- Wire CDS to use vendored copy instead of npm `get-shit-done-cc` dependency
- Verify nothing breaks (run existing test baseline 558+)

**Phase B — Audit + Pain Matrix**
- Read all 45 open GSD issues, classify (relevant/irrelevant/dropped)
- Cross-reference with our accumulated v0.12 pain
- Produce consolidated `pain-matrix.md` doc
- Decide cutover scope (what to refactor in this milestone, what to defer)

**Phases C–N — Targeted Refactors**
One phase per item from Target Refactors list, in priority order (suggested: 1 → 2 → 4 → 5 → 8 → 7 → 3 → 6 → 9, but resequence based on Phase B findings)

**Cutover Release** — CDS independent of GSD upstream, own versioning, own release cycle. Likely v1.0.0 of cds-core to mark independence.

## Out of Scope (Explicitly)

- Full rewrite from scratch (3-6 months, throws working parts away)
- Bidirectional compatibility with upstream GSD (one-way fork, no merge-back)
- Replacing things in DO NOT TOUCH list
- Maintaining backward compatibility with users running CDS+npm-GSD beyond migration window

## Open Questions (Resolve During Planning)

- **Repo structure:** vendored in main CDS repo vs standalone `claude-dev-stack-core` repo? Vendored is simpler, separate repo cleaner. Lean vendored.
- **Migration path:** users currently running CDS with npm `get-shit-done-cc` installed — how do they upgrade? Wizard step? Auto-detect-and-replace?
- **Versioning scheme:** continue from current GSD version + suffix (e.g. `1.34.2-cds.1`), or reset cds-core to `1.0.0` at cutover? Reset is cleaner for marketing "we're independent now".
- **Ongoing GSD watch:** still monitor upstream for security fixes? Cherry-pick policy?

## Conviction Notes

- User has been warned by **multiple people** about GSD dependency risk
- User explicitly chose CDS as **product for others**, not personal toolkit
- User decision recorded 2026-04-14: "если сделать форк и там все сделать под себя - не думаю что это плохо если это законно. и поддерживать это самому."
- License check completed same day: MIT, green light
- All target refactors come from REAL accumulated pain (not speculation)
- Estimated effort: **1-2 milestones (4-8 weeks)** if scope discipline maintained

## Breadcrumbs

Files relevant to this seed in current codebase:
- `~/.claude/hooks/gsd-check-update.js` — pattern to replicate for cds update notification
- `~/.claude/hooks/gsd-statusline.js` — being replaced by Phase 25 `cds-statusline.js`
- `~/.claude/hooks/session-end-check.sh` — Stop hook, foundation for silent session end
- `.planning/notes/2026-04-14-silent-session-end-hook.md` — note on session end strategy
- `.planning/phases/25-budget-aware-execution-gate/25-CONTEXT.md` — statusline replacement scope
- `.planning/phases/27-*` — gsd-patches workaround (will become obsolete after fork)
- `.planning/phases/31-skills-to-hooks-migration-*/` — first wave of skills→hooks (will continue post-fork)
- `CLAUDE.md` (project) — branching_strategy + GSD multi-phase workflow rules
- Upstream: `https://github.com/gsd-build/get-shit-done` (MIT, 52k stars, active)

## Notes

This seed captures the strategic decision made in conversation on 2026-04-14 between user and Claude. The full conversation transcript (in `~/.claude/projects/-Users-eugenenakoneschniy-Projects-claude-dev-stack/`) contains the reasoning chain — consult if uncertain about any decision recorded here.

When this seed surfaces during a future `/gsd-new-milestone`, present it BEFORE asking the user about milestone scope — it's likely the milestone they're planning IS this one.
