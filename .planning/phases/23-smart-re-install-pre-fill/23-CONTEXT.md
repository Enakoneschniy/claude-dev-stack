# Phase 23: Smart Re-install Pre-fill - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Wizard re-install pre-fills all steps with existing configuration — no redundant prompts for already-configured values. Covers: language, projects directory, project names, use case, GSD version check, NotebookLM auth check, bulk prompts.

</domain>

<decisions>
## Implementation Decisions

### Profile Persistence (DX-07, DX-10)
- **D-01:** Store wizard profile in `vault/meta/profile.json` — alongside project-map.json. Syncs via vault git sync.
- **D-02:** Profile contains `lang`, `codeLang`, `useCase` fields. Wizard writes on first install, reads on re-install.
- **D-03:** `detectInstallState()` reads profile.json and returns profile object instead of `null`.

### Skip vs Confirm UX Pattern (DX-07..DX-10)
- **D-04:** Unified select prompt for all pre-filled values: "Language: ru — Keep current / Change". Consistent with UX-07 feedback (select over y/N).
- **D-05:** When user selects "Change" — show original prompt with `initial` set to current value. Same flow as fresh install.
- **D-06:** Already-registered projects (DX-09) — silent skip with info line "✔ claude-dev-stack (registered)". Prompt only for NEWLY selected dirs.

### Version Check (DX-11)
- **D-07:** GSD version check via `npx get-shit-done-cc --version` compared against `npm view get-shit-done-cc version`. Same for Obsidian Skills.
- **D-08:** If already latest — auto-skip with info line "GSD: up to date (v1.34.2) ✔". No prompt.
- **D-09:** If outdated — show "GSD: v1.33.0 → v1.34.2 available. Update / Skip" select.

### NotebookLM Auth (DX-12)
- **D-10:** Check `~/.notebooklm/storage_state.json` existence. If exists — considered authenticated.
- **D-11:** When authenticated — show "✔ NotebookLM: authenticated" then select: "Skip / Re-login / Run sync now".
- **D-12:** Replace "First sync" text with "Run sync now?" for re-installs.

### Bulk Prompts (DX-13)
- **D-13:** loop.md and git-conventions use "Install for all N projects? (Y/n)" bulk prompt instead of per-project confirms.

### Claude's Discretion
- Projects directory pre-fill (DX-08): Claude decides best source — `project-map.json` paths common prefix or stored in profile.json.
- Profile.json schema version: Claude decides if versioning is needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wizard Architecture
- `bin/install.mjs` — Main wizard orchestrator, passes installState to each step
- `lib/install/detect.mjs` — `detectInstallState()` that needs profile.json reading
- `lib/install/profile.mjs` — `collectProfile()` that needs pre-fill logic
- `lib/install/projects.mjs` — `collectProjects()` that needs silent skip for registered projects
- `lib/install/components.mjs` — `selectComponents()` + `installLoopMd()` for bulk prompts
- `lib/install/gsd.mjs` — `installGSD()` needs version check
- `lib/install/notebooklm.mjs` — `installNotebookLM()` needs auth check
- `lib/install/git-conventions.mjs` — needs bulk prompt

### Prior Attempt
- Commit `b2fe143` (reverted in `139c6a9`) — previous Phase 23 implementation. Researcher should `git show b2fe143` to understand what was tried and why it was reverted.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `detectInstallState()` already returns structured object with vault, hooks, projects, GSD, loopMd detection — extend with profile
- `lib/shared.mjs` exports `prompt`, `ok`, `info`, `warn`, `step` — all UI helpers needed
- `lib/project-naming.mjs` exports `toSlug()` — used in projects step

### Established Patterns
- Skip/reconfigure: vault and hooks steps already use select "Skip (keep existing) / Reconfigure" pattern (install.mjs lines 89-108, 133-152)
- Pre-select: BUG-03 pattern in projects.mjs — `registeredPaths.has(d.path)` for multiselect pre-check
- Component detection: `detectInstallState()` returns booleans for each component

### Integration Points
- `profile.json` write: end of wizard (after all steps) or during profile step
- `profile.json` read: `detectInstallState()` → returned as `profile` field
- Version check: `lib/install/gsd.mjs` currently just runs `npx get-shit-done-cc@latest` — needs conditional

</code_context>

<specifics>
## Specific Ideas

- Previous implementation (b2fe143) was reverted — something was broken. Researcher must check git diff to understand what failed and avoid repeating.
- Profile.json location: `{vaultPath}/meta/profile.json` — same directory as project-map.json.
- Select prompt format: "Language: ru — Keep current / Change" (not "(change? y/N)").

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-smart-re-install-pre-fill*
*Context gathered: 2026-04-13*
