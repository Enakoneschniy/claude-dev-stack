# Phase 1: Fix Session-Manager Context Auto-Update - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `~/vault/projects/{name}/context.md` reliably gain a linked "Session History" entry every time a user ends a session via `session-manager /end`. The current skill contains a prose comment where executable code should be, so no update ever happens — `context.md` drifts stale while session logs pile up in `sessions/`. This phase replaces the comment with real code, wires it into both the skill and the Stop hook for reliability, and preserves every other section of `context.md` byte-for-byte.

**In scope:** helper module, skill wiring, Stop hook wiring, idempotent marker-based section update, test coverage.

**Out of scope:** changing session-log format, migrating existing vault entries, NotebookLM integration (that is Phases 2-5).

</domain>

<decisions>
## Implementation Decisions

### Implementation site & language
- **D-01:** New module `lib/session-context.mjs` exports a pure function `updateContextHistory({ vaultPath, projectName, sessionLogFilename, sessionTitle, cap })` that mutates `context.md` in place and returns a status object `{ action: 'created' | 'updated' | 'noop', entriesCount }`. Pure so it is directly unit-testable via `import`.
- **D-02:** The helper is invoked from **two sites** — the skill `/end` code block (primary path) and `hooks/session-end-check.sh` (safety net). Dual invocation is safe because the helper is idempotent: if today's session log is already linked between the markers, it exits with `action: 'noop'`. This closes the known P3 risk from the 2026-04-10 session log: "session-manager skill может быть проигнорирован Claude — Stop hook компенсирует."
- **D-03:** The hook invokes the helper via a thin wrapper `hooks/update-context.mjs` (Node.js shebang script) that parses env/args and calls `updateContextHistory`. This keeps the bash hook free of inline `node -e` string escaping, and mirrors the existing pattern where `hooks/*.sh` delegate to specialized files.

### Entry format
- **D-04:** Portable **markdown link** format — never Obsidian wiki-links. Canonical template per session log:
  ```
  - [YYYY-MM-DD — {session title}](sessions/YYYY-MM-DD-{slug}.md)
  ```
  where `{session title}` is the text after the em-dash in the session log's `# Session: YYYY-MM-DD — {title}` header line, and the filename matches what the skill just wrote.
- **D-05:** Rationale lock — this decision is downstream-critical: **Phase 4** will upload `context.md` as a NotebookLM source, and wiki-links render as literal `[[slug]]` text in NotebookLM, degrading recall quality. Markdown links render correctly in NotebookLM, GitHub, Obsidian, and any mdast tool. Wiki-link format is explicitly rejected for the MVP.

### Section find mechanism & migration
- **D-06:** Marker pair `<!-- @claude-dev-stack:session-history:start -->` / `<!-- @claude-dev-stack:session-history:end -->` is the authoritative anchor the helper reads and writes. This follows the established precedent in `lib/project-setup.mjs:27-28` (`<!-- @claude-dev-stack:start/end -->` for CLAUDE.md injection) — **same naming convention, scoped namespace**.
- **D-07:** First-run migration strategy (idempotent):
  1. If both markers already exist → parse the list between them, append the new entry, enforce cap, write back.
  2. If a `## Session History` header exists but no markers → wrap the existing list with markers, append the new entry, enforce cap, write back. Preserves whatever entries were already there.
  3. If neither markers nor header exist → create a new `## Session History` section **before the first `---` horizontal rule** (which in `templates/context-template.md` is the conventional footer separator). If no horizontal rule exists, append at EOF.
- **D-08:** SKILL-02 byte-for-byte preservation is enforced by only mutating the content between the markers (or the freshly created section block). Other sections are never touched, read-only.

### Cap behavior
- **D-09:** Enforce a **hard cap of 5 entries** inside the markers. Oldest entry dropped when exceeded (LIFO append / FIFO drop). Matches the existing `(last 5)` header label in `templates/context-template.md:69` — rejecting option D#4 (auto-rename header count) because it adds mutation to the header line itself and risks tripping SKILL-02.
- **D-10:** The cap value `5` is a named constant `SESSION_HISTORY_CAP` exported from `lib/session-context.mjs`, not a magic number. Not env-configurable for MVP — a config flag belongs in v2 if anyone ever asks.

### Description source
- **D-11:** The description text for the entry is extracted from the session log file's first `#` heading, specifically the pattern `# Session: {date} — {description}`. The helper reads the file after the skill has already written it. Rationale: the skill's template (`skills/session-manager/SKILL.md:58-78`) already writes this header, so the source of truth is in one place — the session log itself — and the helper never has to ask Claude to pass the description through multiple layers.
- **D-12:** If the heading line is missing or malformed (e.g., Claude deviated from the template), fall back to the filename slug with dashes replaced by spaces. Never throw — this is a side-channel enhancement and must never block the hook from succeeding.

### Invocation contract
- **D-13:** `updateContextHistory` is **never** called with network I/O, never spawns subprocesses, never touches git. It is pure-filesystem on `context.md`. All reliability/rollback concerns are handled by a single `writeFileSync` at the end — partial writes are acceptable because a corrupted `context.md` is still recoverable from git history.
- **D-14:** Error contract — the helper logs to `stderr` and exits `0` on non-fatal errors (missing vault, missing project dir, malformed context.md). It only exits non-zero on programmer errors (missing required args). This keeps the Stop hook silent on user machines that don't have a vault set up.

### Claude's Discretion
- Exact regex patterns for marker detection, header detection, and horizontal-rule detection — the planner can choose multiline regex vs line-by-line parsing as long as SKILL-02 (byte-for-byte preservation of non-managed sections) holds in tests.
- Whether to use `writeFileSync` directly or an atomic `.tmp + rename` — the helper runs after `/end` and a crash there is not catastrophic, but atomic write is still preferred as a cheap belt. Planner decides.
- The exact wrapper filename — `hooks/update-context.mjs` is the proposed name but if the planner prefers `hooks/session-context-updater.mjs` or similar for clarity, that's fine.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 1 — goal statement and the 5 success criteria that gate this phase
- `.planning/REQUIREMENTS.md` §Skills and Hooks — definitions for SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, TEST-03
- `.planning/PROJECT.md` — single-dep constraint (no new npm dependencies), test framework constraint (`node:test` only)

### Current (broken) implementation — the code being replaced
- `skills/session-manager/SKILL.md` §`/end or /done` (lines 48-85) — the bash block with the prose comment `# Update context.md "Session History" section` at line 80-81 is the exact bug site
- `hooks/session-end-check.sh` — existing Stop hook; the new helper will be wired in **after** the session-log existence check at line 29

### Format & pattern precedents
- `templates/context-template.md` line 69 — canonical `## Session History (last 5)` section header and entry format template
- `lib/project-setup.mjs` lines 27-28, 115-125 — reference implementation of marker-based idempotent file updates (`MARKER_START`/`MARKER_END` + regex replace)

### Test style precedents
- `tests/hooks.test.mjs` — reference for testing bash hooks via `execFileSync` + `bash -n` syntax checks + side-effect assertions on temp dirs
- `tests/project-setup.test.mjs` — reference for testing `lib/*.mjs` helpers via direct `import` + assertions on returned values and mutated files

### Related skills (for context, not modification)
- `.claude/skills/session-manager/SKILL.md` — project-level copy installed into this repo by `project-setup.mjs`; after the fix ships, `project-setup.mjs` will propagate the updated SKILL.md to any installed project on next `claude-dev-stack update`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/project-setup.mjs::updateProjectClaudeMd`** — reference implementation of the marker-pair update pattern. Same idempotent semantics: check if markers exist, if yes replace content between them, if no create the section. The new helper should mirror its structure but scope the namespace to `session-history:*` to avoid colliding with the CLAUDE.md markers.
- **`hooks/session-end-check.sh` `PROJECT_NAME` resolution** (lines 10-18) — already handles the `project-map.json` fallback to basename. The new `hooks/update-context.mjs` wrapper can read the same env vars (`VAULT_PATH`, `CURRENT_DIR`) and reuse the same resolution logic either via shell export or by importing from `lib/projects.mjs`.
- **`lib/shared.mjs`** — exports `mkdirp`, `ok`, `warn`, `info`, `fail` color helpers and path helpers. The new module and wrapper should `import` from here instead of reimplementing.

### Established Patterns
- **Marker-pair idempotent updates** — the only sanctioned way to mutate shared markdown files in this project. Direct regex-replace on headers is forbidden because it risks SKILL-02 violations on files users have edited manually.
- **`lib/*.mjs` pure helpers + thin CLI wrappers** — business logic lives in `lib/`, CLI entry points in `bin/cli.mjs` or `hooks/`. The new code should follow this split: `lib/session-context.mjs` is the pure helper, `hooks/update-context.mjs` is the invocation wrapper.
- **`node:test` only, no external frameworks** — every new `lib/*.mjs` module needs a matching `tests/*.test.mjs` file per `.planning/PROJECT.md` constraint. The test for this phase should be `tests/session-context.test.mjs`, plus additions to `tests/hooks.test.mjs` to cover the new wrapper.
- **ESM everywhere, `.mjs` extension** — no CommonJS.

### Integration Points
- **New file:** `lib/session-context.mjs` — pure helper, exports `updateContextHistory` and `SESSION_HISTORY_CAP`
- **New file:** `hooks/update-context.mjs` — thin Node.js wrapper with `#!/usr/bin/env node` shebang, parses env/args, calls the helper
- **Modified:** `skills/session-manager/SKILL.md` — replace the prose comment at lines 80-81 with a real code block that invokes `node hooks/update-context.mjs` (or inline-imports the helper, planner decides)
- **Modified:** `hooks/session-end-check.sh` — after the "session logged" branch (line 29+), add a call to `node hooks/update-context.mjs` before the vault auto-push. This ensures context.md is updated before git commits it.
- **New file:** `tests/session-context.test.mjs` — unit tests for the helper against temp-dir fixtures covering: fresh creation, marker-present append, header-present migration, cap enforcement, byte-for-byte preservation of other sections, malformed session log fallback.
- **Modified:** `tests/hooks.test.mjs` — add one integration test that runs `hooks/session-end-check.sh` against a fixture vault with a fake session log and asserts `context.md` gained the expected entry.
- **Propagation:** The fix lives in `skills/session-manager/SKILL.md` (the source copy in the package). `lib/project-setup.mjs::copyProjectSkills` already handles propagating the updated SKILL.md to installed projects on next `claude-dev-stack update`. No additional wiring needed.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly accepted the recommended default for all 4 gray areas in a single turn after reviewing the pre-analysis. No deviations, no custom follow-ups — the recommendations stand as captured here.
- Known P3 risk from `vault/projects/claude-dev-stack/sessions/2026-04-10-v08-milestone-gsd-init.md`: "session-manager skill может быть проигнорирован Claude — Stop hook компенсирует." This phase is the structural fix for that risk, not a workaround.
- Phase 4 dependency drives the wiki-link rejection: the canonical `context.md` will be uploaded to NotebookLM, and format portability is non-negotiable there.
- The "(last 5)" cap matches what the template already promises users — no new UX surface, just honoring an existing label.

</specifics>

<deferred>
## Deferred Ideas

- **Config flag for entry format** (`sessionHistoryFormat: "markdown" | "wiki"`) — considered in gray area B, rejected for MVP. Belongs in v2 if any user ever actively requests it.
- **Auto-rewriting `(last N)` header** to reflect current count — considered in gray area D (option #4), rejected because it mutates the header line and risks SKILL-02. Header label stays `(last 5)` forever.
- **Env-configurable cap size** (`CONTEXT_HISTORY_LIMIT=10`) — considered in gray area D (option #3), deferred. The constant lives in code; any user with strong feelings can fork or open an issue.
- **Migration of existing user vaults with `[[wiki-link]]` entries to markdown format** — not in scope. The helper appends new entries in markdown format; old wiki-link entries remain as-is until they fall off the bottom of the cap. Over 5 sessions, the list self-heals.
- **Session-start context.md touch** — e.g., bumping a `last_opened_at` timestamp. Not part of this phase; session-start is a read-only operation and should stay that way.
- **Session log linting** — validating the `# Session: DATE — DESCRIPTION` header format and warning if malformed. Deferred — the D-12 fallback handles this silently.

</deferred>

---

*Phase: 01-fix-session-manager-context-auto-update*
*Context gathered: 2026-04-10*
