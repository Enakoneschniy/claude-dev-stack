# Phase 50: GSD Fork + Vendor - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fork the GSD workflow engine (`~/.claude/get-shit-done/`) into `vendor/cds-workflow/` in the CDS repo. Full copy of all files (workflows, bin, templates, references, contexts). Remove upstream `get-shit-done-cc` dependency. Add `NOTICES.md` with MIT license attribution. Update CDS install wizard to copy from `vendor/` instead of from upstream npm. All existing `/gsd-*` commands must work identically after vendor.

</domain>

<decisions>
## Implementation Decisions

### Vendor Location
- **D-01:** GSD fork lives at `vendor/cds-workflow/` in the CDS repo root. NOT in `packages/` (it's not a TS monorepo package), NOT in `~/.claude/` (that's user-level, not under CDS version control).
- **D-02:** `vendor/cds-workflow/` is committed to git and included in the npm package via `package.json` `files` field.

### Distribution
- **D-03:** Bundled in npm — `vendor/` is included in the published `claude-dev-stack` package. `npx claude-dev-stack` installs everything in one step.
- **D-04:** CDS install wizard (`bin/install.mjs`) copies `vendor/cds-workflow/` to `~/.claude/cds-workflow/` during setup. This is the user-level working copy that Claude Code reads.
- **D-05:** `cds update` command updates `~/.claude/cds-workflow/` from the installed npm package's `vendor/` directory (not from upstream GSD).

### Fork Scope
- **D-06:** Full copy: `workflows/`, `bin/`, `templates/`, `references/`, `contexts/`, `VERSION`. Everything that's in `~/.claude/get-shit-done/` today.
- **D-07:** GSD skills (`~/.claude/skills/gsd-*`) stay separate — they're already managed by CDS install wizard, not by GSD itself.
- **D-08:** GSD agents (`~/.claude/agents/gsd-*`) — also copy these. They're referenced by workflow files.

### Legal
- **D-09:** `NOTICES.md` in repo root with MIT attribution: "Workflow engine based on get-shit-done by TÂCHES (MIT License)".
- **D-10:** Preserve original `LICENSE` file inside `vendor/cds-workflow/`.

### Cutover Strategy
- **D-11:** After vendor copy, all paths in CDS codebase that reference `~/.claude/get-shit-done/` update to `~/.claude/cds-workflow/`. This includes skills, hooks, CLAUDE.md references.
- **D-12:** `bin/gsd-tools.cjs` stays as the entry point (renamed later in Phase 52 when CDS CLI commands replace GSD).
- **D-13:** Backward compat: if `~/.claude/get-shit-done/` still exists (user hasn't re-run install), commands still work. New install creates `~/.claude/cds-workflow/` instead.

### Claude's Discretion
- Whether to add a `.npmignore` for vendor/ test files (if any)
- Exact `NOTICES.md` formatting
- Whether `cds update` shows a diff of what changed vs previous version
- How to handle the gsd-patches mechanism (Phase 27 workaround) — probably dissolves since we own the code now

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SEED-002 (Fork Strategy)
- `.planning/seeds/SEED-002-cds-core-independence.md` — Original fork decision, DO NOT TOUCH list, TARGET REFACTORS list, legal analysis, GSD-2/Pi SDK evaluation

### Current GSD Installation
- `~/.claude/get-shit-done/` — Current GSD location (source of copy)
- `~/.claude/get-shit-done/bin/gsd-tools.cjs` — Main entry point (1158 lines)
- `~/.claude/get-shit-done/workflows/` — 70+ workflow files
- `~/.claude/get-shit-done/VERSION` — Currently `1.36.0`

### CDS Install Wizard
- `bin/install.mjs` — Setup wizard that currently installs GSD from upstream npm
- `lib/update.mjs` — Update flow that refreshes GSD

### GSD Skills (separate from GSD core)
- `~/.claude/skills/gsd-*/SKILL.md` — 40+ skill files that reference GSD paths

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/install.mjs` — already has GSD install logic; needs path update from upstream to `vendor/`
- `lib/update.mjs` — GSD update logic; needs path update
- Phase 27 `gsd-patches` workaround — becomes unnecessary after fork (we own the code)

### Established Patterns
- `vendor/` directory is standard Node.js convention for vendored dependencies
- npm `files` field in `package.json` controls what gets published

### Integration Points
- `bin/install.mjs` — GSD install section needs rewrite
- `lib/update.mjs` — GSD update section needs rewrite
- `~/.claude/skills/gsd-*/SKILL.md` — path references need update
- `CLAUDE.md` — GSD path references
- `.claude/settings.json` — hook paths that reference `get-shit-done`

</code_context>

<specifics>
## Specific Ideas

- The `gsd-patches` mechanism (Phase 27) dissolves entirely — no more SHA-diff re-apply on update since we control the source.
- GSD VERSION file should be updated to reflect CDS fork version (e.g., `1.36.0-cds.1`).

</specifics>

<deferred>
## Deferred Ideas

- **Renaming `/gsd-*` to `/cds-*`** — that's Phase 52, not this phase
- **TypeScript rewrite of gsd-tools.cjs** — deferred, works as-is
- **Cherry-picking upstream GSD improvements** — evaluate case-by-case after fork stabilizes

</deferred>

---

*Phase: 50-gsd-fork-vendor*
*Context gathered: 2026-04-18*
