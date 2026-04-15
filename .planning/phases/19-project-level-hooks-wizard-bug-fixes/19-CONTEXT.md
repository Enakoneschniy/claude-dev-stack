# Phase 19: Project-Level Hooks & Wizard Bug Fixes - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Move session hooks (SessionStart, Stop) and allowedTools from global `~/.claude/settings.json` to project-level `.claude/settings.json`. Implement GSD patch survival mechanism so transition.md TeamCreate patch survives `/gsd-update`.

Note: BUG-03 (collectProjects pre-select), BUG-04 (selectComponents "(installed)"), BUG-05 (git-conventions skip existing) were **already fixed in Phase 23** — do NOT re-implement.

Remaining scope: BUG-01, BUG-02, BUG-06 only.

</domain>

<decisions>
## Implementation Decisions

### Hook migration strategy (BUG-01)
- **D-01:** Global hooks in `~/.claude/settings.json` are left **untouched** — no auto-migration, no removal, no warning to user.
- **D-02:** Wizard writes new hooks (SessionStart, Stop) only to project `.claude/settings.json` — never to global settings.
- **D-03:** If project `.claude/settings.json` already exists, wizard merges hooks into it (idempotent, does not overwrite user content).

### allowedTools scope (BUG-02)
- **D-04:** allowedTools written to project `.claude/settings.json` includes:
  - `Bash` patterns covering `~/vault/**` read/write (and `~/Vault/**` for macOS case-insensitive FS)
  - Safe git commands: `git status`, `git branch -d`, `git remote prune`, `git log`, `git diff`
- **D-05:** Patterns must be specific enough to not allow arbitrary bash — follow principle of least privilege.

### GSD patch survival (BUG-06)
- **D-06:** `patches/` directory shipped inside the claude-dev-stack npm package. Contains `transition.md` — the patched version with TeamCreate always-on execution.
- **D-07:** Install wizard copies patches to `~/.claude/gsd-local-patches/` (idempotent copy — only overwrite if source is newer).
- **D-08:** SessionStart hook (`session-start-context.sh`) checks if `~/.claude/get-shit-done/workflows/transition.md` hash differs from `~/.claude/gsd-local-patches/transition.md`. If different, overwrites GSD file with patch and prints `GSD patches auto-reapplied`.
- **D-09:** User sees the "GSD patches auto-reapplied" message in SessionStart output (only shown when reapply actually happened).

### Claude's Discretion
- Exact allowedTools pattern syntax (glob vs regex — whatever Claude Code settings.json supports)
- How to detect if hooks are already present before writing (to ensure idempotency)
- Hash comparison implementation in session-start-context.sh (md5/sha1/checksum)

</decisions>

<specifics>
## Specific Ideas

- The "auto-reapplied" message should only appear when the patch was actually re-applied, not on every session start
- The patch mechanism should work even if GSD is installed fresh (first-time) — not just after updates

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §BUG-01, §BUG-02, §BUG-06 — Full requirement specs with acceptance criteria

### Existing implementation (what already exists)
- `lib/install/hooks.mjs` — Current hook installation logic (writes to global settings today)
- `hooks/session-start-context.sh` — SessionStart hook (candidate for patch-check logic)
- `bin/install.mjs` — Wizard entry point, wires up all install steps

### GSD patch context
- `.planning/phases/18-git-conventions-notebooklm-analytics-teamcreate/` — Phase 18.1 context where transition.md patch was originally created
- `~/.claude/get-shit-done/workflows/transition.md` — The file that gets overwritten by /gsd-update (runtime path, read for current content)

### Claude Code settings format
- No external spec — Claude Code `settings.json` format is: `{ "hooks": { "EventName": [{ "matcher": "...", "hooks": [{ "type": "command", "command": "..." }] }] }, "permissions": { "allow": [...], "deny": [...] } }`

</canonical_refs>

<deferred>
## Deferred Ideas

- Auto-migration of existing global hooks to project-level (add to backlog — would help users with existing setups)
- Per-project allowedTools customization UI in wizard (backlog)

</deferred>

---

*Phase: 19-project-level-hooks-wizard-bug-fixes*
*Context gathered: 2026-04-14*
