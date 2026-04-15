# 28-01-SUMMARY.md — CLAUDE.md template + session-manager skill

**Phase**: 28 — Silent Session Start
**Plan**: 01
**Requirement**: SSR-01 (SC#1, SC#2, SC#5 client side)
**Status**: code complete, automated tests pass; manual UAT pending.

## What changed

### `lib/install/claude-md.mjs`
Replaced the 3-line "Knowledge Base" section in `managedBody` with a block
that explicitly tells Claude NOT to re-read `context.md` / session logs on
the first message, and references the SessionStart hook plus the
`.claude/.session-loaded` 60-minute marker window. Drives all future
wizard runs and per-project installs.

### `skills/session-manager/SKILL.md`
- Frontmatter `description`: removed greeting triggers (`"привет"`,
  `"hi"`, `"начинаем"`) and the "ALWAYS trigger on first message" clause.
  Kept all `/end` triggers and all explicit resume-intent triggers. Added
  a negation clause: "Do NOT auto-activate on greetings or the first
  message of a session".
- `/resume or /start` body: wrapped the existing `cat context.md` +
  last-3 sessions block with a marker-mtime check. When
  `.claude/.session-loaded` is <3600 s old, prints a one-line
  `Context pre-loaded ... skipping redundant cat` and returns/exits 0.
  Uses portable `stat -f %m` (BSD/macOS) with `stat -c %Y` (GNU/Linux)
  fallback.
- Removed the "Automatic Behavior / FIRST message" paragraph. Kept the
  `/end` block and added a short note that the SessionStart hook owns
  first-message context loading.

### `tests/silent-session-start.test.mjs` (new)
14 string-level assertions against the two source files:
- CLAUDE.md template contains "Do NOT re-read" + hook/marker references
  and no longer contains the legacy "ALWAYS read" block.
- SKILL.md frontmatter omits the three greeting triggers and any
  "first message" auto-activation language (outside the negation clause).
- SKILL.md frontmatter keeps end + resume triggers.
- `/resume` body has the marker check, the portable `stat` fallback,
  and the 3600-second threshold.
- `/end` Auto-ADR capture block is intact (guard against accidental
  regression from earlier edits).

## Verification

- `node --test tests/silent-session-start.test.mjs` → 14/14 pass.
- `npm test` (full suite) → 860 pass, 0 fail, 1 pre-existing skip.

## Manual UAT — pending (human-verify)

- [ ] Fresh wizard install into a test project → open Claude Code
  session → first greeting does NOT cause a `cat context.md` permission
  prompt (SessionStart hook provides context alone).
- [ ] After >60 min idle in same session, explicit `/resume` falls
  through to the `cat` block (verify by `touch -d '-2 hour'
  .claude/.session-loaded` and running `/resume`).
- [ ] Existing project with Phase 28 installed: re-running `/resume`
  within 60 min of session start shows the "skipping redundant cat"
  message and no double-load.

## Files touched

- `lib/install/claude-md.mjs`
- `skills/session-manager/SKILL.md`
- `tests/silent-session-start.test.mjs` (new)

## Commits

- `2c8a7f5` — feat(ssr-01): silent session start — CLAUDE.md template +
  session-manager skill
