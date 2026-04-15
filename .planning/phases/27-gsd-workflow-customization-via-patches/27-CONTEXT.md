# 27-CONTEXT.md — GSD Workflow Customization via Patches

**Phase**: 27 — GSD Workflow Customization via Patches
**Requirement**: GSD-01
**Mode**: `--auto` (recommended defaults locked without interactive questions)
**Depends on**: Nothing (umbrella: feat/v0.12-hooks-and-limits)

---

## 1. Phase intent (one paragraph)

Projects in the claude-dev-stack ecosystem have to tolerate upstream GSD workflow
defaults that don't always match local preferences (auto-push, unconditional PR
creation, rigid agent prompts). GSD owns `~/.claude/get-shit-done/workflows/`
globally, so any local edit is wiped on `/gsd-update`. Phase 27 formalizes the
*already-implemented* patches mechanism that makes local modifications to GSD
workflow files durable across updates, and documents it so it becomes a first-
class, maintained feature instead of an undocumented side-effect of BUG-06.

## 2. Existing implementation — what already works

This phase is NOT greenfield. The following artifacts already exist and are in
production use on this branch:

- `patches/manager.md` — package-shipped full-file replacement of
  `workflows/manager.md` (re-merged against GSD v1.36.0 in commit 240b84f).
- `patches/transition.md` — package-shipped full-file replacement of
  `workflows/transition.md` (carries the TeamCreate customization from BUG-06).
- `hooks/gsd-auto-reapply-patches.sh` — SessionStart hook. Iterates over every
  `*.md` in the resolved patches directory and copies it over
  `~/.claude/get-shit-done/workflows/<name>.md` when the SHA-256 differs.
  Output: `GSD patches auto-reapplied (N file(s) updated)` when anything was
  written; silent otherwise.
- `lib/install/hooks.mjs` (lines 16–24) — install wizard copies the shipped
  `patches/` tree to `~/.claude/gsd-local-patches/` at install time. This is
  the authoritative, version-pinned source the hook prefers (BUG-06 D-07
  precedence).
- Resolution precedence inside the hook:
  1. `$PATCHES_DIR` env var (test/dev override),
  2. `~/.claude/gsd-local-patches/` (wizard-pinned, authoritative),
  3. npm global `claude-dev-stack/patches`,
  4. well-known dev checkouts (`~/Projects/claude-dev-stack/patches`, etc.).

SHA-256 helper is portable (`sha256sum` on Linux, `shasum -a 256` on macOS),
with a safe-fallback that force-applies when no SHA tool is available.

## 3. Locked decisions (auto-mode)

### D-1. Scope discipline — formalize, don't redesign

**Decision:** Treat Phase 27 as *formalization* of the existing mechanism, not
the maximalist spec in ROADMAP.md success criteria #1–#7 (three-tier resolver
with `.planning/gsd-overrides/`, `gsd customize` CLI, diff-based patches,
config-aware `auto_push`/`auto_pr`/`merge_strategy` gates).

**Rationale:** The shipped mechanism already solves GSD-01's *stated goal*
("projects can override GSD workflow behavior that survives /gsd-update").
The extended criteria (project-level overrides dir, CLI scaffolder, diff
patches) are speculative ergonomic wins with large surface area and no
pull signal yet. Parent brief explicitly narrows scope to
"FORMALIZING this existing work: writing CONTEXT/RESEARCH/PLAN docs, adding
proper tests, documenting in vault/shared/patterns.md".

**Concrete cut-line for plans:**
- IN: tests for the existing hook + wizard copy behavior; REQUIREMENTS
  backfill; `vault/shared/patterns.md` entry; any small bug the test suite
  uncovers.
- DEFERRED to backlog (999.x): per-project `.planning/gsd-overrides/`,
  `gsd customize` CLI, diff-based patches, `config.json`
  `workflow.auto_push`/`auto_pr`/`merge_strategy` gates.

### D-2. Package-shipped patches stay in `patches/` at repo root

**Decision:** No relocation. Keep `patches/*.md` at repo root.

**Rationale:** Already referenced by `lib/install/hooks.mjs`, hook resolver,
and prior patch-maintenance commits (9cb9a6f, 240b84f). Moving would break
install + reapply. No user pain reported from the current layout.

### D-3. Patch format stays full-file replacement

**Decision:** Patches remain full `.md` files that replace the same-named
file under `workflows/`. No diff/patch(1) format in this phase.

**Rationale:** Diff patches (success criterion #7) would require
`patch`/`git apply` availability assumptions, conflict resolution UX, and a
rebase-on-upstream-change story. Current full-file replacement has a simple
failure mode (re-merge like commit 240b84f when GSD upstream changes) and
`/gsd-reapply-patches` / manager.md re-merge is already a documented user
workflow. Defer to backlog.

### D-4. Authoritative source: `~/.claude/gsd-local-patches/` (wizard-pinned)

**Decision:** The hook's precedence order stays as-is. The wizard-pinned copy
under `~/.claude/gsd-local-patches/` is the authoritative source at runtime;
package `patches/` is only used as a fallback for dev checkouts.

**Rationale:** Already implemented (BUG-06 D-07). Pinning at install time
decouples "what patches apply" from "where is the npm cache today" —
important because `~/.npm/_npx/*/` paths churn across `npx` invocations.

### D-5. Testing strategy — shell test for the hook, Node test for wizard copy

**Decision:**
- Shell test (`tests/gsd-auto-reapply-patches.test.sh` or equivalent under
  existing test harness) that asserts:
  1. Hook applies a patch when target SHA differs.
  2. Hook is silent when SHAs match (idempotency).
  3. Hook prefers `~/.claude/gsd-local-patches/` over dev checkouts when both
     exist (precedence).
  4. Hook exits 0 silently when GSD is not installed.
- Node test (under `lib/install/` existing test style) that asserts the
  wizard's `installSessionHook` copies `patches/` to
  `~/.claude/gsd-local-patches/`.

**Rationale:** Matches existing test conventions in the repo. Shell test
covers the most brittle part (resolver precedence + SHA compare). Wizard test
covers regression if someone removes the `cpSync(patchesSrc, patchesDest)`
block.

### D-6. Documentation target: `vault/shared/patterns.md`

**Decision:** Add a single pattern entry titled "GSD Local Patches" to
`/Users/eugenenakoneschniy/vault/shared/patterns.md` with: when to use,
how to add a new patch, how precedence works, how `/gsd-update` interacts
with it, and a pointer to Phase 27 artifacts.

**Rationale:** Per CLAUDE.md, reusable patterns belong in
`vault/shared/patterns.md`. No new docs file needed in-repo; README stays
lean.

### D-7. REQUIREMENTS.md Traceability row

**Decision:** Add under a new `### GSD Workflow (GSD)` subsection:
- `GSD-01` — "Projects can override GSD workflow behavior via local patches
  that survive `/gsd-update`."
- Traceability row: `| GSD-01 | 27 | 27-04-PLAN.md | pending |`

**Rationale:** Roadmap ordering already says Phase 27 → GSD-01.
`27-04-PLAN.md` is the backfill plan per ROADMAP.

## 4. Plan skeleton (locked for planner)

Parent brief says narrow scope; ROADMAP lists 4 plans but the existing four
are scoped for the *maximalist* vision. For the formalization cut, plans
collapse to:

- **27-01-PLAN.md** — Tests for `gsd-auto-reapply-patches.sh`
  (shell-level, covering SHA compare, precedence, idempotency, no-GSD exit).
- **27-02-PLAN.md** — Test for `lib/install/hooks.mjs` wizard copy
  (node-level, asserts `patches/` → `~/.claude/gsd-local-patches/` copy).
- **27-03-PLAN.md** — Pattern entry in `vault/shared/patterns.md` +
  small in-repo README blurb under the existing docs layout pointing to
  the pattern.
- **27-04-PLAN.md** — REQUIREMENTS.md GSD-01 backfill + Traceability row
  (matches roadmap-stated plan 27-04).

The four maximalist plans from ROADMAP (three-tier resolver, config-aware
ship.md, customize CLI, GSD-01 backfill) remain referenced in ROADMAP but
the planner should produce plans matching the narrowed cut above. Plan 27-04
stays the same in both.

## 5. Deferred ideas (→ backlog 999.x)

Track as individual backlog items after this phase:

- **BACKLOG**: Per-project `.planning/gsd-overrides/` directory with
  file-name-matching override priority over `patches/`.
- **BACKLOG**: `claude-dev-stack gsd customize` CLI that scaffolds
  overrides dir with commented templates.
- **BACKLOG**: Diff-based patch format (less fragile across upstream
  workflow changes).
- **BACKLOG**: `workflow.auto_push` / `workflow.auto_pr` /
  `workflow.merge_strategy` config gates in `.planning/config.json`
  consumed by ship.md patch.

## 6. Open items / risks

- **Risk: upstream GSD workflow drift.** When GSD ships a new
  `manager.md` / `transition.md`, our patch goes stale and the hook
  silently replaces the new upstream version with our old one. Mitigation:
  the existing `/gsd-reapply-patches` skill + manual re-merge workflow
  (already used in commit 240b84f). Phase 27 does NOT attempt to solve
  drift detection — logged as a deferred concern.
- **No blockers.** All source dependencies (`patches/`, `hooks/`,
  `lib/install/hooks.mjs`) are in-tree and stable on this branch.

## 7. Next step

Run `gsd-plan-phase 27` to expand each plan file above.
