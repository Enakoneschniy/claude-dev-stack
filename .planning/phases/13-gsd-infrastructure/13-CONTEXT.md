# Phase 13: GSD Infrastructure - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two independent GSD workflow improvements:
1. **ADR Bridge** (INFRA-03) — Auto-populate vault/decisions/ from CONTEXT.md locked decisions (D-XX entries) during phase transitions
2. **Parallel Phase Execution** (INFRA-04) — Offer to run independent phases concurrently via TeamCreate with explicit user consent

Both are pure GSD tooling — no NotebookLM or CLI changes.

</domain>

<decisions>
## Implementation Decisions

### ADR Bridge (INFRA-03)

- **D-01:** Bridge fires during phase transition — after verification passes and phase is marked complete. Integrated into the execute-phase workflow's `update_roadmap` step or a new post-completion step.
- **D-02:** ADR format matches existing vault convention — `NNNN-slug.md` with YAML frontmatter (date, status, context, decision, consequences). Consistent with `vault/projects/{slug}/decisions/` structure.
- **D-03:** ADR numbering auto-increments from highest existing NNNN in `vault/decisions/` for the project. If no ADRs exist, starts at 0001.
- **D-04:** Provenance marking via YAML frontmatter fields: `source: gsd-bridge`, `phase: {N}`, `decision_ids: [D-01, D-02, ...]`. Machine-readable, allows filtering auto-generated vs manual ADRs.
- **D-05:** Idempotent — skip if ADR with same phase+decision ID combination already exists. Re-running bridge on same phase produces no duplicates.
- **D-06:** One ADR per CONTEXT.md, not one per D-XX entry. Each ADR aggregates all decisions from a single phase discussion into one file, matching the "one decision document per discussion" pattern.
- **D-07:** Bridge reads vault path from existing `findVault()` in `lib/projects.mjs` — no new vault discovery logic.

### Parallel Phase Execution (INFRA-04)

- **D-08:** Detection parses ROADMAP.md `depends_on` fields. Two or more phases with no shared `depends_on` overlap AND both in "pending" status qualify for parallel execution.
- **D-09:** Cost estimate shows: number of parallel phases, estimated token usage per phase (based on plan count × average executor cost), total estimated cost. Presented before consent prompt.
- **D-10:** Explicit consent required every time — `AskUserQuestion` with "Run N phases in parallel (est. Xk tokens)" / "Run sequentially (default)". No config to auto-approve.
- **D-11:** If one parallel phase fails, other phases continue. Failed phase is reported with options: retry, skip, or investigate. Partial success is valid.
- **D-12:** Sequential execution (decline parallel) preserves existing GSD behavior exactly — phases run in numbered order, one at a time. This is the default and must never break.
- **D-13:** Uses Claude Code's `TeamCreate` tool for spawning parallel executors. Each team member gets its own worktree via `isolation: "worktree"`.

### Claude's Discretion

- ADR slug generation algorithm (from phase name or decision content)
- Cost estimation heuristics (can be rough — used for user information, not billing)
- Where in GSD workflow to surface parallel execution option (likely in execute-phase or a new transition step)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vault ADR Structure
- `vault/projects/{slug}/decisions/` — Existing ADR directory convention
- `skills/session-manager/SKILL.md` §ADR Creation — Existing ADR template format

### GSD Workflow
- `$HOME/.claude/get-shit-done/workflows/execute-phase.md` — Phase execution workflow (ADR bridge integration point)
- `$HOME/.claude/get-shit-done/workflows/transition.md` — Phase transition workflow (alternative integration point)
- `.planning/ROADMAP.md` — `depends_on` fields for parallel detection

### Requirements
- `.planning/REQUIREMENTS.md` — INFRA-03, INFRA-04 specs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/projects.mjs::findVault()` — Vault path discovery (used by ADR bridge for target directory)
- `lib/session-context.mjs` — Context.md parsing patterns (can inform CONTEXT.md D-XX extraction)
- `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs` — Has `phase-plan-index`, `roadmap` commands (can inform parallel detection)

### Established Patterns
- CONTEXT.md decisions use `D-XX:` prefix consistently across all phases
- Vault ADR files use `NNNN-slug.md` naming in `decisions/` directory
- GSD tools use `node` subcommands for workflow operations

### Integration Points
- execute-phase workflow `update_roadmap` step — natural point to trigger ADR bridge after phase completion
- ROADMAP.md `depends_on` parsing — already done by `gsd-tools` for plan indexing
- TeamCreate tool — available in Claude Code runtime for parallel agent spawning

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for both ADR bridge and parallel execution.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-gsd-infrastructure*
*Context gathered: 2026-04-13*
