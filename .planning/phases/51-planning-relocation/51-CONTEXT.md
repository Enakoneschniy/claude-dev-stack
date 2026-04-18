# Phase 51: Planning Relocation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Move `.planning/` directory from project git into `vault/projects/{name}/planning/`. Add `.planning/` to `.gitignore`. Create `.cds/config.json` in project root as pointer to vault planning location. Update vendored GSD workflow engine (`vendor/cds-workflow/`) to resolve planning path from config instead of hardcoded `$PWD/.planning/`. Auto-migration on first run.

</domain>

<decisions>
## Implementation Decisions

### New Location
- **D-01:** Planning artifacts move to `vault/projects/{project-name}/planning/` — same vault root as `sessions/`, `docs/`, `decisions/`.
- **D-02:** This location syncs with S3 if vault is S3-backed (Phase 44) — planning state survives between machines.
- **D-03:** GSD/CDS resolves planning path: read `.cds/config.json` → `planning` field → resolve vault path. Fallback to `$PWD/.planning/` if no config exists (backward compat).

### Migration Strategy
- **D-04:** `mv .planning/ vault/projects/{name}/planning/` — physical move, not copy.
- **D-05:** Add `.planning/` to project's `.gitignore` after move. Planning commits no longer pollute project git.
- **D-06:** Git history of old `.planning/` commits stays in git log — no rewrite. Just stops adding new ones.
- **D-07:** Migration runs automatically on first `cds` command if `.planning/` exists locally AND `.cds/config.json` doesn't have a `planning` pointer yet. Prompts user before moving.

### Config Pointer
- **D-08:** `.cds/config.json` in project root. Format: `{ "planning": "vault://planning" }`. The `vault://` prefix means "resolve relative to vault/projects/{name}/".
- **D-09:** `.cds/` directory is committed to git (it's part of project config, like `.claude/`). `.cds/config.json` is small and stable — no frequent commits.
- **D-10:** Phase 53 (Config System) will extend `.cds/config.json` with more fields. This phase only adds the `planning` pointer.

### GSD/CDS Path Resolution
- **D-11:** Update `vendor/cds-workflow/bin/gsd-tools.cjs` to read `.cds/config.json` at startup. New resolution order: `.cds/config.json` planning field → `$PWD/.planning/` fallback.
- **D-12:** `vault://planning` resolves to `{VAULT_PATH}/projects/{project-name}/planning/` using the same vault discovery chain as existing code (env var → default paths).

### Claude's Discretion
- Whether migration prompt is interactive (AskUserQuestion) or auto-approve with notice
- Exact `.cds/config.json` schema beyond the `planning` field
- Whether to create `.cds/.gitkeep` or rely on `config.json` for directory existence
- Error handling when vault path not configured

</decisions>

<canonical_refs>
## Canonical References

### GSD Tools (path resolution)
- `vendor/cds-workflow/bin/gsd-tools.cjs` — Main entry point that resolves `.planning/` path. Needs update.
- `vendor/cds-workflow/bin/lib/` — Helper modules that may reference `.planning/`

### SEED-002
- `.planning/seeds/SEED-002-cds-core-independence.md` — Target Refactor #1: `.planning/` location

### Vault Discovery
- `lib/projects.mjs` — Vault path discovery chain (`VAULT_PATH`, `~/vault`, etc.)
- `lib/shared.mjs` — Path helpers

### Phase 50 (dependency)
- `.planning/phases/50-gsd-fork-vendor/50-CONTEXT.md` — GSD now vendored, paths under our control

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vault path discovery in `lib/projects.mjs` — reuse for resolving `vault://` prefix
- `gsd-tools.cjs` init functions — already parse `.planning/config.json`, extend to read `.cds/config.json`

### Established Patterns
- `.claude/settings.json` in project root — same pattern as `.cds/config.json`
- `cpSync` + `mkdirSync` for file operations (used in Phase 50)

### Integration Points
- `vendor/cds-workflow/bin/gsd-tools.cjs` — primary file to modify for path resolution
- `.gitignore` — add `.planning/` entry
- Project root — create `.cds/config.json`

</code_context>

<specifics>
## Specific Ideas

- `vault://` is a convenient shorthand — avoids hardcoding absolute paths that differ between machines.
- The migration should be a one-time operation with clear output: "Moving .planning/ to vault/projects/claude-dev-stack/planning/ — project git will no longer receive planning commits."

</specifics>

<deferred>
## Deferred Ideas

- **Full config system** — Phase 53 extends `.cds/config.json` with all settings
- **Remote planning via S3** — works automatically once vault S3 backend + planning relocation are both done

</deferred>

---

*Phase: 51-planning-relocation*
*Context gathered: 2026-04-18*
