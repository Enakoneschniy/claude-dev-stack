# 28-CONTEXT.md — Silent Session Start

**Phase**: 28 — Silent Session Start (move vault context loading to SessionStart hook)
**Requirement**: SSR-01
**Mode**: `--auto` (recommended defaults locked without interactive questions)
**Depends on**: Phase 27 (patches mechanism — parallel, non-blocking). Recommended post-30 for best user-content preservation on CLAUDE.md merges; not gating.

---

## 1. Phase intent (one paragraph)

Today, starting a new Claude Code session on a project configured by the
claude-dev-stack install wizard triggers a double-load of vault context: the
`session-start-context.sh` hook prints the project summary + last-session TODOs
into the prompt, AND the `session-manager` skill's description tells Claude to
auto-activate on any greeting ("hi", "привет", first message), which then
re-`cat`s `context.md` and the last three session logs. The second load is
redundant (the hook already injected it), noisy (permission prompts for `cat`
under `$VAULT_PATH/...`), and defeats the purpose of the SessionStart hook.
Phase 28 makes the hook the single source of truth for session-start context,
demotes the skill to explicit `/end` / `/resume` triggers only, and writes a
marker file (`.claude/.session-loaded`) so the skill's `/resume` path can tell
whether the hook already did the work.

## 2. Existing implementation — what works today, what's wrong

**What works:**
- `hooks/session-start-context.sh` (repo) — already reads
  `~/vault/projects/<name>/context.md` + last session TODOs and echoes them to
  stdout. Output becomes prompt context for Claude (SessionStart hook API).
- `lib/install/hooks.mjs` — already copies this hook to `~/.claude/hooks/` and
  registers it under `settings.json` `hooks.SessionStart` per-project.
- `skills/session-manager/SKILL.md` — `/end` bash block is correct; auto-ADR
  capture (Phase 26) wires through `$ADR_RESULT`. The `/end` path is not
  changing.
- `lib/install/claude-md.mjs` generates CLAUDE.md template with a "Knowledge
  Base" section currently instructing Claude to `cat` context + session logs
  on EVERY session start — the exact redundant behavior we're killing.

**What's wrong:**
- **SKILL.md description** (lines 3–8) enumerates first-message / greeting
  triggers ("привет", "hi", "начинаем") which cause auto-activation and
  unwanted `cat` calls on top of the hook output.
- **SKILL.md `/resume` body** (lines 22–39) unconditionally `cat`s context +
  last three session logs with no check for whether the hook already ran.
- **CLAUDE.md template "Knowledge Base" section** (lib/install/claude-md.mjs
  lines 80–83) tells Claude to ALWAYS `cat` context.md and last 3 session
  logs — contradicts the hook.
- **No marker file** exists today — there's no way for `/resume` (or any
  future consumer) to detect that the hook already loaded context in this
  session.
- **Install wizard does not add `.claude/.session-loaded` to project
  `.gitignore`** — without this, the marker would get committed.

## 3. Locked decisions (auto-mode)

### D-01. Marker file — path, format, atomic-write contract

**Decision:** Marker is `.claude/.session-loaded` relative to the project root
(same `.claude/` dir where `settings.json` lives). Contents: a single line
with an ISO 8601 UTC timestamp, e.g. `2026-04-15T14:32:10Z\n`. Write is
atomic: write to `.claude/.session-loaded.tmp` then `mv` over the final name.

**Rationale:** Co-locating with `settings.json` reuses a dir the install
wizard already creates per-project. Atomic rename avoids partial reads when
a concurrent `/resume` fires mid-write. ISO 8601 UTC is parseable by
`date -d` (GNU) and portable Node `Date.parse`. Per-project (not global)
because multiple Claude Code sessions can run in different checkouts with
different ages — a single global marker would lie.

### D-02. Mtime-based staleness threshold — 60 minutes

**Decision:** `/resume` path checks marker `mtime`. If `now - mtime < 60 min`,
treat context as pre-loaded by the hook and skip the `cat` block (print one
line: `📋 Context loaded by SessionStart hook at <mtime>`). Otherwise, fall
through to the explicit `cat` behavior (existing body).

**Rationale:** 60 min is long enough to cover a paused session resumed after
lunch; short enough that an hours-old marker triggers a re-read of
potentially-updated context.md. File-mtime check is cheap (`stat`); no
parsing the ISO timestamp inside needed for staleness — the timestamp inside
is for humans / logs. Mtime is the authoritative clock.

### D-03. CLAUDE.md template — "Knowledge Base" section rewrite

**Decision:** Replace the existing 3-line "Knowledge Base" section in
`lib/install/claude-md.mjs` (`managedBody` template) with text that
EXPLICITLY instructs Claude NOT to `cat` context.md or session logs on
first message — the SessionStart hook already injected them. Only re-read
if user explicitly asks ("напомни про проект", "что делали", `/resume`).

**Rationale:** The template drives all future installs + re-runs of the
wizard. Leaving the old text would undo the hook's work on every fresh
install. Explicit "do not re-read" beats silence.

**Concrete replacement text** (goes into `managedBody`):

```
## Knowledge Base
Project context is auto-loaded at session start by the SessionStart hook
(`hooks/session-start-context.sh`). Do NOT re-read `context.md` or session
logs on the first user message — they are already in your prompt.
Re-read only on explicit user request ("напомни про проект", "что делали",
`/resume`) or when more than 60 min have passed since the `.claude/.session-loaded`
marker was written.
```

### D-04. session-manager SKILL.md description — trigger set

**Decision:** Rewrite the `description:` frontmatter block to:
- REMOVE greeting triggers: `"привет"`, `"hi"`, `"начинаем"`, and the whole
  "ALWAYS trigger on first message in any session" clause.
- KEEP explicit end signals: `"всё"`, `"хватит"`, `"заканчиваем"`, `"done"`,
  `"end"`, `"конец"`, `"на сегодня всё"`, `"finish"`.
- KEEP explicit resume-intent triggers: `"что делали"`, `"где остановились"`,
  `"last time"`, `"resume"`, `"продолжи"`, `"handoff"`, `"передай контекст"`,
  `"what did we do"`, `"continue where we left off"`.

Also remove the "Automatic Behavior / When the skill detects this is the
FIRST message" paragraph from the body (lines 160–164).

**Rationale:** Success Criterion #2 is literal. The greeting triggers are
the root cause of the redundant-load bug; they have to go. End + resume
triggers are explicit user intent and must remain.

### D-05. SessionStart hook — marker writer integration

**Decision:** Extend `hooks/session-start-context.sh` to ALWAYS write the
marker on every successful run (i.e. every time the script reaches the end
without early-exit from "vault project not found"). Write happens after the
context+TODO echo block, before budget-check. Use portable bash:

```bash
# SSR-01: write marker so session-manager /resume can detect pre-loaded context
MARKER_DIR="$CURRENT_DIR/.claude"
if [ -d "$MARKER_DIR" ] || mkdir -p "$MARKER_DIR" 2>/dev/null; then
  TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  TMP="$MARKER_DIR/.session-loaded.tmp"
  FINAL="$MARKER_DIR/.session-loaded"
  printf '%s\n' "$TS" > "$TMP" 2>/dev/null && mv "$TMP" "$FINAL" 2>/dev/null
fi
```

Failure to write is silent — never breaks session start.

**Rationale:** SC #3 requires atomic write + ISO 8601 UTC. The `printf >
tmp && mv tmp final` pattern is the POSIX-portable atomic-rename idiom. `date
-u +%Y-%m-%dT%H:%M:%SZ` works on both BSD and GNU date. Fail-silent matches
the hook's existing error-handling philosophy (pull errors, budget errors,
etc. are all swallowed).

### D-06. SKILL.md `/resume` path — marker check

**Decision:** Wrap the existing `cat "$PROJECT_DIR/context.md"` + last-3
session-logs block in a conditional. Check `.claude/.session-loaded` mtime:
- If < 60 min old → print `📋 Context pre-loaded at <mtime> — skipping
  redundant cat` and return.
- Otherwise → run the existing body unchanged.

Concrete bash:

```bash
MARKER="$CURRENT_DIR/.claude/.session-loaded"
if [ -f "$MARKER" ]; then
  MARKER_AGE=$(( $(date +%s) - $(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null || echo 0) ))
  if [ "$MARKER_AGE" -lt 3600 ] && [ "$MARKER_AGE" -gt 0 ]; then
    echo "📋 Context pre-loaded at $(cat "$MARKER" 2>/dev/null) — skipping redundant cat."
    return 0 2>/dev/null || exit 0
  fi
fi
# ...existing cat block...
```

Note: `stat -f %m` (BSD/macOS) vs `stat -c %Y` (GNU/Linux) — both tried.

**Rationale:** SC #5 explicit. `stat` fallback covers both platforms the
install wizard supports. `return 0 2>/dev/null || exit 0` works both when
the block is sourced (as part of a larger skill invocation) and when
executed standalone.

### D-07. Install wizard — idempotent `.gitignore` entry per-project

**Decision:** Extend `lib/install/hooks.mjs` `installSessionHook()` (or a new
helper invoked at the same point) to, for each project in `projectsData`:
1. Check if `<project.path>/.gitignore` exists; create empty if missing.
2. Read it; if `.claude/.session-loaded` is NOT already a line, append it
   under a header comment `# claude-dev-stack: session marker (Phase 28)`.
3. Write back only if changed (idempotent).

**Rationale:** SC #4 explicit. Keeping this in `hooks.mjs` co-locates
gitignore handling with the hook that writes the marker. Header comment
helps users recognize the entry as managed. Idempotent = re-running wizard
doesn't duplicate lines.

### D-08. REQUIREMENTS backfill — where & what

**Decision:** Add to `.planning/REQUIREMENTS.md`:
- New section `### Session Start/Resume (SSR)` placed AFTER `### GSD Workflow (GSD)` and BEFORE the `---` that precedes "Future Requirements".
- Requirement body:
  ```
  - [ ] **SSR-01**: SessionStart hook is the single source of vault context
    loading for configured projects. The session-manager skill does not
    auto-activate on greetings; its `/resume` path checks a
    `.claude/.session-loaded` marker (atomic, ISO 8601 UTC) and skips the
    redundant `cat` when marker is < 60 min old. CLAUDE.md template
    instructs Claude not to re-read context.md on first message. Install
    wizard adds the marker path to project `.gitignore` idempotently.
  ```
- Traceability row appended to the table: `| SSR-01 | 28 | — | pending |`.

**Rationale:** SC #6 explicit. Placement after GSD (most recent v1 section)
keeps ordering by phase introduction. Marking plan column `—` matches
existing convention for other rows.

## 4. Plan allocation (locked by ROADMAP)

Three plans, per ROADMAP.md:

- **28-01-PLAN.md** — CLAUDE.md template rewrite (D-03) + session-manager
  SKILL.md description + body + `/resume` marker check (D-04, D-06).
  Covers D-01 (marker contract) and D-02 (threshold) at the consumer side.
  Touches: `lib/install/claude-md.mjs`, `skills/session-manager/SKILL.md`.

- **28-02-PLAN.md** — SessionStart hook marker writer (D-05) + install wizard
  `.gitignore` helper (D-07). Touches:
  `hooks/session-start-context.sh`, `lib/install/hooks.mjs`.
  Tests: atomic-write behavior, ISO format, idempotent gitignore update.

- **28-03-PLAN.md** — REQUIREMENTS.md backfill (D-08). SSR section +
  Traceability row. No code changes.

## 5. Deferred (not this phase)

- Making the 60-min threshold configurable via `config.json` — no pull signal.
- A "force re-read" flag in the `/resume` skill — user can always just
  `cat context.md` manually.
- Similar marker for `/end` — not needed; the `/end` path is explicit-trigger
  only and user-initiated.
- Telemetry on marker write failures — the hook is fail-silent by design.

## 6. Verification hooks (what downstream plans must prove)

Each plan must include tests or UAT steps for its success criteria:

- SC #1 (CLAUDE.md text) → Plan 01 test asserts the generated `managedBody`
  contains the "Do NOT re-read" string and omits the old `cat` instruction.
- SC #2 (skill description) → Plan 01 test asserts SKILL.md frontmatter
  does NOT contain `"привет"`, `"hi"`, `"начинаем"`, or the
  "FIRST message" phrase.
- SC #3 (atomic marker write) → Plan 02 test: run the hook, assert
  `.claude/.session-loaded` exists, content matches
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`.
- SC #4 (gitignore idempotency) → Plan 02 test: run install helper twice,
  assert line appears exactly once.
- SC #5 (`/resume` marker check) → Plan 01: manual UAT (bash-in-skill is
  hard to unit-test in isolation; mark as `pending` UAT note).
- SC #6 (REQUIREMENTS backfill) → Plan 03: grep assertion in a test, or
  pure commit-diff review (no test needed — content-only change).
