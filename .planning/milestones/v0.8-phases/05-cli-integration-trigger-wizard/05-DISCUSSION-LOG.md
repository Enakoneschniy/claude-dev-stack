# Phase 5: CLI Integration, Trigger & Wizard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 05-cli-integration-trigger-wizard
**Areas discussed:** Module structure & CLI routing, Session-end trigger mechanism, Install wizard UX flow, Status + doctor + logging

---

## Gray Area Selection (first turn)

User selected all 4 gray areas from the initial multi-select (Module structure, Session-end trigger, Install wizard, Status + doctor + logging).

---

## Area 1: Module Structure & CLI Routing

### Q1 — Where does `main(args)` for notebooklm subcommands live?

| Option | Description | Selected |
|--------|-------------|----------|
| New `lib/notebooklm-cli.mjs` | Dedicated CLI file, library files stay pure, NBLM-24 satisfied in spirit | ✓ |
| Add main() to lib/notebooklm.mjs literally | NBLM-24 literal, library pollution | |
| Inline in bin/cli.mjs | Shortest, breaks existing lazy-import pattern | |

**User's choice:** New `lib/notebooklm-cli.mjs` (recommended default).
**Notes:** Same semantic drift pattern as Phase 4 SC5 `reverseProjectMap`. Requirement wording was drafted with a slightly wrong assumption about where CLI dispatch lives. CONTEXT D-01 resolves in spirit with a rationale.

---

## Area 2: Session-end Trigger Mechanism

### Q2 — Detached spawn implementation

| Option | Description | Selected |
|--------|-------------|----------|
| `hooks/notebooklm-sync-trigger.mjs` Node wrapper | Mirrors Phase 1 pattern, cross-platform, testable | ✓ |
| Bash `(cmd &) &` in session-end-check.sh | Shell-only, fragile, auth check blocks | |
| Background npm script `&` | Uses public CLI, PATH assumption, lifecycle hard to track | |

**User's choice:** Node wrapper (recommended default).
**Notes:** Chose to split trigger (fire-and-forget launcher, fast) from runner (actual sync, detached subprocess). Trigger does the `hasCommand` check and spawns runner with `{detached: true, stdio: 'ignore'}.unref()`, exits immediately. Runner does auth check + syncVault + log write.

### Q3 — Precondition checks and vaultRoot/notebookName propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Env vars + findVault() fallback | Reuses Phase 1 plumbing, zero new config | ✓ |
| Config file `~/.claude/notebooklm-sync.json` | New persistence surface, duplicates env var | |
| CLI flag passing from shell | Verbose, redundant with env | |

**User's choice:** Env vars + findVault() fallback (recommended default).
**Notes:** `VAULT_PATH` and `NOTEBOOKLM_NOTEBOOK_NAME` are passed via env from shell hook. Trigger/runner reads them, falls back to `findVault()` if absent. Auth check runs in detached subprocess — doesn't block shell hook.

---

## Area 3: Install Wizard UX Flow

### Q4 — Python package install strategy

| Option | Description | Selected |
|--------|-------------|----------|
| pipx first, pip --user fallback | Matches NBLM-26 literal, pipx isolated env | ✓ |
| Skip install, print instructions | Safe but violates NBLM-26 "offers to install" | |
| uv first | Modern tool, not yet widely installed in 2026 | |

**User's choice:** pipx first, pip --user fallback (recommended default).
**Notes:** Resolves carried-over TODO from 3+ prior sessions ("Cross-platform install strategy for notebooklm-py"). `uv` explicitly deferred — not enough adoption yet. Wizard shows exact command before running, prompts for confirm.

### Q5 — `notebooklm login` interactive + post-login verification

| Option | Description | Selected |
|--------|-------------|----------|
| spawn stdin-inherited + auth check + first sync prompt | Full validation loop, user sees end-to-end success | ✓ |
| spawn login only, don't verify | Violates NBLM-26 (e) literal | |
| Full verify without first sync prompt | User has to wait for session-end to see it work | |

**User's choice:** Full verify + first sync prompt (recommended default).
**Notes:** Resolves carried-over TODO from 3+ prior sessions ("notebooklm login UX inside install.mjs wizard — subprocess inheritance"). `spawnSync(..., {stdio: 'inherit'})` hands stdin/stdout to subprocess. After login, run `notebooklm auth check` captured, parse exit code. On success, offer "Run first sync now?" Y/n.

---

## Area 4: Status + Doctor + Logging

### Q6 — `notebooklm status` output and stale computation

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse syncVault dryRun mode | Honest stale count via full walk + hash | ✓ |
| Manifest-only (cheap) | Fast but misses edited files | |
| Separate buildSyncPlan helper | Contradicts Phase 4 D-15 single-export decision | |

**User's choice:** Reuse syncVault dryRun (recommended default).
**Notes:** Phase 4 D-20 already ships `dryRun: true` mode that returns `planned[]` without making API calls. Phase 5 reuses this directly — no new sync-inspecting code. Fresh vault: empty planned + empty manifest → "no sync yet" message + exit 0 (satisfies TEST-02).

### Q7 — Doctor 3 lines + logging + gitignore

| Option | Description | Selected |
|--------|-------------|----------|
| 3 states + extend Phase 3 gitignore block | Single migration helper, info-level for missing | ✓ |
| Separate ensureLogGitignored helper | Two migration helpers = tech debt | |
| Structured JSON log + rotation | Premature complexity | |

**User's choice:** 3 states + extend Phase 3 block (recommended default).
**Notes:** Binary absence is `info` (not `fail`) because NotebookLM is optional. Log format: single-line plain text with ISO timestamp + level + message + key=val pairs. Phase 3 `ensureManifestGitignored` managed block extended from 3 lines to 4 (adds `.notebooklm-sync.log`) — single place to manage vault-sync gitignore state.

---

## Follow-up Question

### Q8 — First sync after verification: inline or detached?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline blocking | User sees stats, end-to-end validation | ✓ |
| Detached + "check logs later" | Feels unfinished in wizard context | |
| Skip first sync prompt entirely | User has no proof setup worked | |

**User's choice:** Inline blocking (recommended default).
**Notes:** Wizard's "Run first sync now?" Y prompt does `await syncVault(opts)` inline — blocks ~5-30s on small vault, prints stats on completion. Session-end trigger stays detached per NBLM-22. Three call sites of `syncVault`, two concurrency modes: CLI + wizard = inline; trigger runner = detached subprocess. Single function, 3 paths.

---

## Claude's Discretion

The following items were explicitly left to the planner in CONTEXT.md:
- Exact `notebooklm sync` CLI output format (tabular / line-per-file / summary)
- Wizard step number in install.mjs ordering
- How `runStatus` reports stale files (count only / list with paths / truncated)
- Whether runner imports syncVault directly or shells to CLI
- Whether to add `notebooklm help` subcommand or fold into `-h`/`--help`
- Fixture strategy for trigger + runner tests
- Doctor "Last sync" parse logic (regex on log vs manifest `generated_at`)
- Crash reporting in runner (uncaughtException hook)
- "Remember skip" flag for wizard (vs rely on re-run idempotency)

## Deferred Ideas

Captured in CONTEXT.md §Deferred. Highlights:
- uv tool install fallback (v2)
- Sync log rotation (v2)
- Structured JSON log (not chosen over plain text)
- Concurrent sync lock (deferred — single user assumption)
- Notebook name change migration
- `notebooklm list` / `notebooklm delete` CLI subcommands
- Auth check caching
- Wizard skip memory
- `notebooklm sync --project foo`
- Cross-machine log sync
- Cron periodic sync (v2, roadmap-level)

## Folded Todos from Prior Sessions

- ✅ "Cross-platform install strategy for `notebooklm-py`" → resolved by D-09 (pipx first + pip --user fallback)
- ✅ "`notebooklm login` UX inside `install.mjs` wizard — subprocess inheritance" → resolved by D-10 (`spawnSync` with `stdio: 'inherit'`)

Both were carried through Phase 2/3/4 discuss phases as "Phase 5 research tasks". Now formally resolved in Phase 5 CONTEXT.md.
