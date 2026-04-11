# Phase 1: Fix Session-Manager Context Auto-Update - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 01-fix-session-manager-context-auto-update
**Areas discussed:** Implementation site & language, Entry format, Section find & migration, Cap behavior
**Mode:** Batched single-turn acceptance of all recommended defaults

---

## Discussion Flow

All 4 gray areas were presented in a single pre-analysis turn with full option tables and recommendations. The user accepted all recommendations in one reply (`1`), meaning "accept all defaults and write CONTEXT.md". No per-area follow-up was needed, no deviations from recommendations.

---

## A. Implementation site + language

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Bash helper in `hooks/update-context-md.sh`, invoked from Stop hook + skill | Consistent with existing `hooks/*.sh` style, no Node.js needed in hook runtime. Test ergonomics suffer — `execFileSync` + side-effect assertions only. | |
| 2. Node.js helper in `lib/session-context.mjs`, invoked from Stop hook + skill via wrapper | Testable via direct `import` using `node:test`. Consistent with `lib/*.mjs` pattern. Adds one `node` invocation to the shell hook path (~20ms cost). | ✓ |
| 3. Node.js helper, invoked from skill `/end` only | Simpler, single call site. Reproduces known P3 risk: if Claude forgets to invoke the skill, `context.md` stays stale. | |
| 4. Bash helper, invoked from Stop hook only | Reliable (hook always fires) but splits the logic across two places — skill writes the session log, hook writes the context entry. Harder to reason about. | |

**User's choice:** Option 2 (recommended default)
**Rationale:** Testability via direct `import` aligned with the project's `node:test` + `lib/*.mjs` conventions. Dual invocation (skill primary + hook safety net) closes the documented P3 risk without splitting logic. The ~20ms node startup cost in the hook is acceptable given the hook already runs `git add/commit/push` which dwarfs it.

---

## B. Entry format (template vs actual practice mismatch)

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Markdown link (template style) | `- [2026-04-10 — description](sessions/2026-04-10-slug.md)` — portable, renders in NotebookLM / GitHub / Obsidian / any markdown tool. | ✓ |
| 2. Obsidian wiki-link (current actual practice) | `- [[2026-04-10-slug]] — description` — renders only in Obsidian; shows as literal `[[...]]` text elsewhere. | |
| 3. Both forms in one line | `- [[slug]] [sessions/slug.md] — description` — universal but ugly and wastes horizontal space. | |
| 4. Config flag | `sessionHistoryFormat: "markdown" \| "wiki"` in user config — flexibility at the cost of MVP complexity. | |

**User's choice:** Option 1 (recommended default)
**Rationale:** Phase 4 will upload `context.md` to NotebookLM, and wiki-links would render as literal `[[slug]]` text, degrading recall quality for the very feature this milestone is building. The template already uses markdown link format, so this is also the path of least resistance. Wiki-links in the user's existing `context.md` entries will self-heal over 5 sessions as the cap pushes them out.

---

## C. Section find + migration

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Marker pair `<!-- @claude-dev-stack:session-history:start/end -->` | Consistent with the CLAUDE.md pattern in `lib/project-setup.mjs`. Requires first-run migration — wrap existing section with markers. | |
| 2. Header regex (`/^## Session History/m`) | Works with existing `context.md` without migration, but fragile if the user renames the section. | |
| 3. Marker pair + fallback to header regex (belt-and-suspenders) | On first run: check markers; if absent, find `## Session History` header and wrap it; if that's absent, create a new section before the trailing `---` footer. | ✓ |

**User's choice:** Option 3 (recommended default)
**Rationale:** Idempotent migrate-on-first-run strategy respects the established marker convention without breaking legacy `context.md` files. The 3-level fallback (markers → header → create before footer) handles every state a user's file might be in, including files that were never created from the template.

---

## D. Cap behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Enforce cap of 5 | Drop oldest entries, header label `(last 5)` remains truthful. | ✓ |
| 2. Unbounded append | Entries accumulate forever, header label becomes a lie. | |
| 3. Configurable via env var `CONTEXT_HISTORY_LIMIT` | Flexibility, but adds config surface for MVP. | |
| 4. Enforce cap + auto-rewrite `(last N)` in header to actual count | Header always truthful, but mutates the header line, risking SKILL-02 byte-for-byte preservation violations. | |

**User's choice:** Option 1 (recommended default)
**Rationale:** Simplest option that honors the existing `(last 5)` label promise. Source of truth for full history is the `sessions/` directory, not `context.md` — the cap is a quick-glance ceiling, not a data store. Avoids mutating the header line and thereby keeps SKILL-02 trivial to prove in tests.

---

## Claude's Discretion

- Exact regex patterns for marker, header, and horizontal-rule detection (multiline regex vs line-by-line parsing)
- Whether to use atomic `.tmp + rename` write vs direct `writeFileSync` for the helper
- Exact filename of the hook wrapper (`hooks/update-context.mjs` proposed, planner may choose a clearer name)

## Deferred Ideas

- Config flag for entry format (markdown vs wiki) — v2 if requested
- Auto-rewriting `(last N)` header to match actual count — rejected (SKILL-02 risk)
- Env-configurable cap size — deferred (named constant in code for MVP)
- Migration of existing user vaults with `[[wiki-link]]` entries — not in scope, self-heals over 5 sessions
- Session-start `context.md` touch / `last_opened_at` timestamp — out of scope
- Session log header format linting — D-12 fallback handles it silently
