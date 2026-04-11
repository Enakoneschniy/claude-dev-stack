# Phase 5: CLI Integration, Trigger & Wizard - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 is the **glue layer** that makes already-shipped Phase 4 sync pipeline discoverable and usable by end users. The phase has 3 entry points: (1) manual CLI via `claude-dev-stack notebooklm sync|status`, (2) automatic session-end background trigger, (3) install wizard setup flow with `pipx install notebooklm-py` + `notebooklm login` + first sync, plus doctor health check integration. All sync orchestration logic is done (Phase 4 `syncVault`) — this phase only wires it up.

**In scope:**
- `lib/notebooklm-cli.mjs` (new) — `main(args)` routes `sync` / `status` subcommands, imports from `lib/notebooklm-sync.mjs` and `lib/notebooklm-manifest.mjs`
- `bin/cli.mjs` — add `case 'notebooklm':` routing to `lib/notebooklm-cli.mjs::main(args.slice(1))`, extend help text
- `hooks/notebooklm-sync-trigger.mjs` (new) — Node wrapper invoked from `hooks/session-end-check.sh`. Does `hasCommand` check, spawns detached runner, exits immediately
- `hooks/notebooklm-sync-runner.mjs` (new) — the detached subprocess. Runs `notebooklm auth check`, calls `syncVault`, appends to `~/vault/.notebooklm-sync.log`
- `hooks/session-end-check.sh` — extend to call `notebooklm-sync-trigger.mjs` (order: context update first per Phase 1, then sync trigger)
- `bin/install.mjs` — REPLACE the placeholder at lines 1103-1114 with a real wizard step: detect binary → offer `pipx install notebooklm-py` (fallback `pip install --user`) → run `notebooklm login` interactively → run `notebooklm auth check` to verify → offer "Run first sync now?" (inline blocking)
- `lib/doctor.mjs` — add 3-line NotebookLM section: binary presence + auth check + last sync status (parsed from log)
- `lib/notebooklm-manifest.mjs` — extend `ensureManifestGitignored` managed block to include `.notebooklm-sync.log`
- `tests/project-setup.test.mjs` — add smoke test per TEST-02: `claude-dev-stack notebooklm status` exits 0 on fresh vault (no sync yet)
- `tests/notebooklm-cli.test.mjs` (new) — unit tests for routing, argument parsing, error handling
- `tests/hooks.test.mjs` — extend with trigger + runner integration tests (fake notebooklm binary)

**Out of scope (v2 or never):**
- Cron-based periodic sync (deferred to v2)
- Per-project notebooks (deferred to v2)
- Sync log rotation / size limits (noted in deferred)
- Concurrent sync lock (deferred — single vault + single user assumption)
- Authentication handling beyond subprocess delegation
- Any handling of `NOTEBOOKLM_API_KEY` (ADR-0001 forbids this — auth fully delegated)
- Reading or modifying `~/.notebooklm/storage_state.json`
- Notebook name change migration (if user edits `NOTEBOOKLM_NOTEBOOK_NAME`, old notebook is abandoned; documented but no code)
- Progress streaming during sync (stats-only return shape from Phase 4 is the contract)

**Non-goals:**
- New error classes (reuse Phase 2's `NotebooklmNotInstalledError`, `NotebooklmCliError`, `NotebooklmRateLimitError`)
- Modification of Phase 2-4 shipped code beyond the gitignore block extension in `ensureManifestGitignored`
- New dependencies (package.json stays `{"prompts": "^2.4.2"}`)
- Interactive `notebooklm` wrapper commands beyond `sync` and `status` (no `notebooklm create`, `notebooklm list` etc. — those are internal Phase 4 usage)

</domain>

<decisions>
## Implementation Decisions

### A. Module structure & CLI routing

- **D-01:** **New `lib/notebooklm-cli.mjs` file with `main(args)` handler.** Exports `export async function main(args)` with a switch on `args[0]` dispatching to `runSync(args)` or `runStatus(args)` or `printHelp()`. Imports from `lib/notebooklm-sync.mjs` (syncVault), `lib/notebooklm-manifest.mjs` (readManifest for status), `lib/notebooklm.mjs` (error classes for instanceof checks), and `lib/shared.mjs` (`c`, `ok`, `fail`, `warn`, `info`, `hasCommand`). Library files (`notebooklm.mjs`, `notebooklm-sync.mjs`) stay pure — no CLI logic pollution.

  **NBLM-24 semantic drift acknowledged** (same pattern as Phase 4 §SC5 `reverseProjectMap`). NBLM-24 literally says "routes `notebooklm` subcommand to `lib/notebooklm.mjs::main(args)`" but `lib/notebooklm.mjs` was designed in Phase 2 as a pure thin wrapper (6 + 1 functions, 3 error classes). Adding a `main()` CLI dispatcher contradicts Phase 2 D-03 ("Functional modules over classes — and no UI in lib/*") and Phase 2 CONTEXT §D-02 rationale ("private helper, not reused from runCmd because too generic"). The CLI-in-library pattern was a drafting convenience in the requirements, not a design intent. D-01 resolves this by putting the dispatcher in a dedicated file. Requirement satisfied in spirit.

- **D-02:** **`bin/cli.mjs` adds `case 'notebooklm':` branch.** Follows existing lazy-import pattern (line 80 `case 'projects':` is the template). ~6 lines added. Also extends `printHelp()` with a new "NotebookLM" section listing `notebooklm sync` and `notebooklm status` per NBLM-25.

- **D-03:** **`lib/notebooklm-cli.mjs::main(args)` subcommand routing:**
  - `args[0] === 'sync'` → `runSync(args.slice(1))` — interactive, stats printed to stdout, calls `syncVault(opts)` inline (not detached), exits 0 on completion regardless of per-file failures (matches NBLM-23 best-effort philosophy but with visible output)
  - `args[0] === 'status'` → `runStatus(args.slice(1))` — reuses `syncVault({ dryRun: true })` (Phase 4 D-20) to compute stale count + file count, reads `manifest.generated_at` for last sync, prints 3-4 line summary
  - `args[0] === 'help' || !args[0]` → `printNotebooklmHelp()`
  - Unknown subcommand → error + help text

### B. Session-end trigger mechanism (NBLM-21, NBLM-22)

- **D-04:** **New `hooks/notebooklm-sync-trigger.mjs` Node wrapper, not bash.** Pattern mirrors Phase 1 `hooks/update-context.mjs` (same shell-hook architecture). Implementation sequence:
  1. Resolve env vars (`VAULT_PATH` from shell, `NOTEBOOKLM_NOTEBOOK_NAME` optional)
  2. Call `hasCommand('notebooklm')` synchronously — if false, exit 0 silently (feature not configured, NBLM-23)
  3. Spawn detached runner: `spawn(process.execPath, [runnerPath], { detached: true, stdio: ['ignore', logFd, logFd], env: {...process.env} })`
  4. Call `.unref()` on the child to detach it from the parent event loop
  5. Exit 0 immediately — session-end flow not blocked

  The bash hook invocation wraps the trigger in `2>/dev/null || true` to absolutely guarantee no session-end noise even if the trigger itself crashes.

- **D-05:** **Separate `hooks/notebooklm-sync-runner.mjs` for the detached subprocess.** Splitting trigger (fire-and-forget launcher) from runner (actual sync execution) keeps the trigger path minimal and testable. Runner responsibilities:
  1. Append a start-line to `~/vault/.notebooklm-sync.log`: `{ISO timestamp} [info] sync start project={name}`
  2. Run `notebooklm auth check` via Phase 2 error-typed spawn — if fails, log `[info] sync skipped reason=auth-check-failed` and exit 0 (NBLM-23: auth failure is "not configured", not error)
  3. Call `await syncVault({ vaultRoot, notebookName })` — catches any thrown error (including `NotebooklmNotInstalledError` as defense-in-depth though trigger already filtered it)
  4. Write a result line to the log: `{ISO} [info] sync done uploaded=N skipped=M failed=K duration=Tms` or `{ISO} [error] sync failed reason="..."`
  5. Exit 0 always — NEVER throw, NEVER propagate

- **D-06:** **Env var propagation from shell hook.** `hooks/session-end-check.sh` already uses `VAULT="${VAULT_PATH:-$HOME/vault}"` (line 6). Pass to trigger via existing `VAULT_PATH=... node $wrapper` idiom. `NOTEBOOKLM_NOTEBOOK_NAME` passes through `env` inheritance naturally. Trigger and runner both fall back to `findVault()` if env absent (robustness). No new config file, no new persistence — reuses Phase 1 plumbing.

- **D-07:** **Trigger invocation ordering in `session-end-check.sh`.** Current hook (Phase 1) does: (1) check session log exists, (2) invoke `update-context.mjs` wrapper, (3) git add/commit/push vault. Phase 5 inserts trigger invocation AFTER step 2 but BEFORE step 3 — context.md must be up to date before sync reads it, and trigger exits <100ms so it doesn't delay vault auto-push.

### C. Install wizard UX flow (NBLM-26)

- **D-08:** **Replace placeholder in `bin/install.mjs:1103-1114`.** Current placeholder just prints "to use, run `notebooklm login` manually" in final-screen instructions. Replace with a real active wizard step that runs BEFORE the final summary. Exact insertion point: after the vault setup step, before "Daily workflow" summary. The existing `components.notebooklm` flag from `selectComponents` (line 400+) gates the step — if user unchecks NotebookLM in component selection, the step is skipped entirely.

- **D-09:** **pipx first, pip --user fallback.** Detection + install sequence:
  1. `hasCommand('notebooklm')` → if already in PATH, skip to login step (idempotent install)
  2. Else `hasCommand('pipx')` → offer `pipx install notebooklm-py` via prompt confirmation. Show exact command before running.
  3. Else offer `python3 -m pip install --user notebooklm-py`. Show exact command before running.
  4. If neither pipx nor python3 available → print manual-install instructions and skip remaining wizard step (feature not available until user installs Python)
  5. After install, verify `hasCommand('notebooklm')` returns true before proceeding to login. If false (install failed silently) → error message + skip

  **NBLM-26 (c) satisfied:** offers install via pipx first, pip fallback second. `uv` is NOT tried (deferred as too-early-adoption for 2026 user base; noted in deferred ideas).

- **D-10:** **`notebooklm login` interactive via `spawnSync` with stdio inheritance.** Call: `spawnSync('notebooklm', ['login'], { stdio: 'inherit' })`. This lets the user interact directly with `notebooklm-py`'s browser OAuth flow — terminal output, URL prompts, browser handoff all work naturally. The wizard blocks waiting for login to complete.

  **Post-login verification (NBLM-26 (e)):**
  - Run `spawnSync('notebooklm', ['auth', 'check'])` with `stdio: ['ignore', 'pipe', 'pipe']` to capture output
  - Parse exit code: 0 = success, other = failure
  - On success → `ok('NotebookLM authenticated')` + proceed to first-sync prompt
  - On failure → `warn('Login may not have completed — you can re-run \`notebooklm login\` manually later')` + skip first-sync

- **D-11:** **First sync after verification is INLINE blocking, not detached.** User who just finished wizard wants to see the feature working end-to-end. After `auth check` passes, prompt `"Run first sync now? (Y/n)"`. If Y:
  - Call `await syncVault({ vaultRoot, notebookName })` inline — blocks wizard ~5-30s on small vault
  - Print stats directly: `Uploaded 42 files, skipped 0, failed 0, notebook: claude-dev-stack-vault (id=abc123)`
  - If errors → print them (not silent like trigger mode, because user is actively watching)
  - Exits to next wizard step only after sync completes

  This is the ONLY code path where `syncVault` runs inline in Phase 5. Session-end trigger uses detached runner (D-04/D-05). Manual `notebooklm sync` CLI also runs inline (D-03). Three call sites, two concurrency modes, single function.

### D. Status, doctor, and logging (NBLM-20, NBLM-23, NBLM-27)

- **D-12:** **`notebooklm status` reuses `syncVault({ dryRun: true })` (Phase 4 D-20).** No new sync-inspecting code in Phase 5. Implementation in `lib/notebooklm-cli.mjs::runStatus`:
  1. Read manifest via `readManifest(vaultRoot)` for `generated_at` + `files.size`
  2. Call `const plan = await syncVault({ dryRun: true })` → uses Phase 4's `planned[]` array
  3. Compute: `fileCount = manifest.files.size`, `staleCount = plan.planned.filter(p => p.action !== 'skip').length`, `lastSync = manifest.generated_at ?? 'never'`
  4. Print 3-4 lines:
     - `Last sync: 2 hours ago (2026-04-11T14:22:00Z)` or `Last sync: never`
     - `Files tracked: 47`
     - `Files stale: 3 (2 changed, 1 new)`
     - `Notebook: claude-dev-stack-vault`
  5. Fresh vault (no manifest) → prints `Last sync: never` + `Files tracked: 0` + `Run 'claude-dev-stack notebooklm sync' to start` and exits 0 — satisfies TEST-02 smoke test

- **D-13:** **Doctor 3 lines for NotebookLM section in `lib/doctor.mjs`.** Inserted after the existing prerequisites section (~line 63). Each line has 3 possible states:
  - **Line 1 — Binary:** `ok(`notebooklm-py (${version})`)` / `info('notebooklm-py — not installed (optional, run claude-dev-stack install to set up)')` / `fail` only if binary present but broken (shouldn't happen)
  - **Line 2 — Auth:** `ok('notebooklm auth — ok')` / `warn('notebooklm auth — login required, run: notebooklm login')` / `info('notebooklm auth — skipped (binary not installed)')`
  - **Line 3 — Last sync:** `ok('last sync: 2 hours ago, 42 files tracked')` / `warn('last sync: 3 days ago (consider running manually)')` / `info('last sync: never')` / `info('last sync: unknown (no vault)')`
  
  **Critical rule:** binary absence is `info` level (NOT `fail`), because NotebookLM is an **optional** feature. Doctor should report only real problems as failures — a user who never opted into NotebookLM must not see red X marks. This aligns with NBLM-23 "treated as 'feature not configured'".

- **D-14:** **Log format: plain text, single line per entry, append-only, no rotation.** Location: `~/vault/.notebooklm-sync.log`. Format:
  ```
  {ISO timestamp} [level] message key1=val1 key2=val2
  ```
  Example entries:
  ```
  2026-04-11T15:30:12.345Z [info] sync start project=claude-dev-stack
  2026-04-11T15:30:15.892Z [info] sync done uploaded=3 skipped=44 failed=0 duration=3547ms
  2026-04-11T16:42:03.101Z [info] sync skipped reason=auth-check-failed
  2026-04-11T17:15:22.000Z [error] sync failed reason="NotebooklmCliError: ..."
  ```
  Levels used: `info` (normal operation, auth skip, rate limit), `warn` (partial failure), `error` (unexpected throw). Doctor parses the last 10 lines to determine "last sync status" for D-13 Line 3.
  
  **No rotation in Phase 5.** User can `truncate` or delete the file manually. If the log grows unreasonably (deferred idea), a future phase adds rotation.

- **D-15:** **Extend Phase 3 `ensureManifestGitignored` managed block to include `.notebooklm-sync.log`.** The Phase 3 helper already manages 3 lines (`.notebooklm-sync.json`, `.notebooklm-sync.json.tmp`, `.notebooklm-sync.corrupt-*`). Phase 5 adds a 4th line `.notebooklm-sync.log` to the same managed block. The idempotency invariant still holds (calling twice leaves exactly one occurrence of each line). No new migration helper — one place to manage all vault-sync gitignore entries.

  **Implementation note:** This is the ONLY modification to Phase 3 shipped code in Phase 5. Contract: extending the managed block set is additive and safe, but Phase 3 tests must be re-run to ensure all Phase 3 must_haves still hold (specifically: "managed block contains all three lines" becomes "managed block contains all four lines", D-18/D-22 wording updates). Phase 5 plan must include both the helper change and the corresponding test updates in the same task.

### Claude's Discretion

- **Exact `notebooklm sync` CLI output format** — tabular vs line-per-file vs summary-only. Planner picks based on common CLI UX patterns in the codebase (see `lib/export.mjs` for reference).
- **Wizard step number in `bin/install.mjs`** — depends on where other optional steps shuffle; planner determines based on existing numbering at Step 1..6.
- **How `runStatus` reports stale files** — just count, or listed with paths, or truncated list. Planner picks for UX brevity.
- **Whether `notebooklm-sync-runner.mjs` imports Phase 4 directly or shell out to `claude-dev-stack notebooklm sync`** — direct import is faster and avoids PATH assumption; shelling out is simpler but adds runtime dependency on the CLI being installed globally. Direct import is lightly preferred but planner confirms after considering import graph.
- **Whether to add `notebooklm help` subcommand explicitly or fold it into `-h`/`--help` convention** — both work. Match existing `lib/projects.mjs` convention.
- **Fixture strategy for trigger + runner tests** — existing `tests/fixtures/notebooklm-stub.sh` (Phase 2) and `notebooklm-sync-stub.sh` (Phase 4) are candidates. Planner picks — may need a new `notebooklm-auth-stub.sh` for auth-check cases.
- **Doctor "Last sync" parse logic** — simple regex on last matching `sync done` line vs reading manifest `generated_at`. Latter is cleaner; planner confirms.
- **Error handling if `hooks/notebooklm-sync-runner.mjs` itself crashes** — default behavior of `stdio: 'ignore'` already drops output, but the exit code is lost. Planner considers whether to write a crash-report line to the log before exit (via `process.on('uncaughtException')`).
- **Whether the install wizard remembers "user skipped NotebookLM" across runs** — could add a flag to `~/.claude/config.json` or similar to avoid re-prompting. But the existing component selection flow (`selectComponents`) already lets user uncheck — re-running the wizard with the same answer is idempotent. Planner decides if "remember skip" is worth the complexity or adds to deferred.

### Folded Todos

**From session TODO backlog (carried through 3+ sessions):**
- **"Cross-platform install strategy for `notebooklm-py`"** — FOLDED. D-09 resolves this with pipx-first + pip-user fallback. Windows path still untested but the strategy is the same (`py -m pip install --user` works on Windows too).
- **"`notebooklm login` UX inside install.mjs wizard — subprocess inheritance of stdin for browser OAuth flow"** — FOLDED. D-10 resolves this with `spawnSync(..., { stdio: 'inherit' })`.

These two were explicitly deferred to Phase 5 research during Phase 2 discuss. Now resolved in CONTEXT.md without needing a separate research track.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone-level architectural decision
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — **ADR-0001**: all NotebookLM auth delegated to `notebooklm-py`. Phase 5 install wizard wraps `notebooklm login` as subprocess, NEVER touches credentials or env vars related to auth. **Read this first.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 5 (lines 86-97) — goal statement + 5 success criteria
- `.planning/REQUIREMENTS.md` §NBLM-19..27 + TEST-02 — full text of 10 requirements this phase closes
- `.planning/PROJECT.md` §Key Decisions — "Authentication is delegated entirely to `notebooklm-py`" constraint (NBLM-26 and this phase uphold it)
- `.planning/PROJECT.md` §Constraints §System dependencies — `notebooklm-py >= 0.3.4` (Phase 5 wizard installs this)

### Shipped upstream phases (all required)
- `.planning/phases/01-fix-session-manager-context-auto-update/01-CONTEXT.md` — Phase 1 decisions (session-end hook architecture, wrapper script pattern). **Phase 5 trigger mirrors this pattern exactly.**
- `.planning/phases/01-fix-session-manager-context-auto-update/01-02-SUMMARY.md` — what actually shipped: `hooks/update-context.mjs` wrapper + `hooks/session-end-check.sh` modifications. Phase 5 extends the same shell hook and mirrors the wrapper file pattern.
- `.planning/phases/02-notebooklm-api-client/02-CONTEXT.md` — D-02 (library purity), D-06 (install hint in error message), D-15 (retry delegated to upstream). Phase 5 respects all three.
- `.planning/phases/02-notebooklm-api-client/02-02-SUMMARY.md` — 6 Phase 2 functions + 3 error classes. Phase 5 consumes `NotebooklmNotInstalledError` (for pre-filter), `NotebooklmRateLimitError` (runner catches, logs, exits 0), `NotebooklmCliError` (runner catches, logs, exits 0), `hasCommand` (trigger precondition).
- `.planning/phases/03-sync-manifest-change-detection/03-CONTEXT.md` — D-18/D-19/D-22 (managed block shape). Phase 5 D-15 extends the managed block with `.notebooklm-sync.log` — read D-22 carefully for the corrupt-glob pattern compatibility.
- `.planning/phases/03-sync-manifest-change-detection/03-01-SUMMARY.md` — `ensureManifestGitignored` implementation. Phase 5 modifies this function — must preserve all existing must_haves (idempotency, CRLF safety, trailing-newline repair).
- `.planning/phases/04-vault-notebooklm-sync-pipeline/04-CONTEXT.md` — D-15 (single `syncVault` export), D-16 (stats shape), D-20 (dryRun mode). Phase 5 D-12 heavily depends on D-20.
- `.planning/phases/04-vault-notebooklm-sync-pipeline/04-02-SUMMARY.md` — `syncVault` implementation, stats object shape, notebook ensure logic. Phase 5 consumes all of this through a single import.

### Shipped module code (what Phase 5 consumes)
- `lib/notebooklm.mjs` — Phase 2 + 4 (7 functions, 3 error classes). Phase 5 imports error classes for `instanceof` checks.
- `lib/notebooklm-sync.mjs` — Phase 4 (single `syncVault` export). Phase 5's primary consumer.
- `lib/notebooklm-manifest.mjs` — Phase 3 (5 exports). Phase 5 imports `readManifest` (for status), `ensureManifestGitignored` (extends the managed block).
- `lib/projects.mjs` — `findVault()` used by trigger, runner, and status.
- `lib/shared.mjs` — `hasCommand`, `c`, `ok`/`fail`/`warn`/`info`, `runCmd`, `spawnSync`.
- `lib/doctor.mjs` — extended in Phase 5 with NotebookLM section.
- `bin/cli.mjs` — extended in Phase 5 with `notebooklm` routing and help text.
- `bin/install.mjs` — placeholder replaced at lines 1103-1114 (preserve rest of file).
- `hooks/session-end-check.sh` — extended with trigger invocation.
- `hooks/update-context.mjs` (Phase 1) — **architectural template** for new `hooks/notebooklm-sync-trigger.mjs` + `notebooklm-sync-runner.mjs`. Read Phase 1 to understand env-var-driven wrapper pattern.
- `tests/fixtures/notebooklm-stub.sh` — Phase 2 fake binary for `list`/`source` commands. May be extended or supplemented for auth-check and login testing.
- `tests/fixtures/notebooklm-sync-stub.sh` — Phase 4 argv-aware fake for full sync flow. Can be reused for integration tests.
- `tests/project-setup.test.mjs` — Phase 1 + Phase 5 both extend this. TEST-02 adds a smoke test for `notebooklm status` on fresh vault.

### Upstream CLI reference (unchanged)
- `~/.claude/skills/notebooklm/SKILL.md` — `notebooklm-py v0.3.4`. Relevant sections:
  - `notebooklm login` (Authentication section) — interactive browser OAuth flow
  - `notebooklm auth check` — exit code semantics for Phase 5 trigger precondition and wizard verification
  - `notebooklm --version` — used by doctor Line 1 to report version

### Runtime verification notes (dev machine)
- `/opt/anaconda3/bin/notebooklm --version` → `NotebookLM CLI, version 0.3.4` (still current)
- `notebooklm auth check` on dev machine returns exit 0 (authenticated) — smoke test for Phase 5 trigger + runner can use real binary in dev-only tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`lib/notebooklm-sync.mjs::syncVault`** (Phase 4) — the single function this entire phase glues around. Called inline in `notebooklm-cli.mjs::runSync` and `runStatus` (via dryRun), called inline in install wizard's first-sync step (D-11), called in detached runner subprocess (D-05).

- **`lib/notebooklm.mjs::hasCommand` and `lib/shared.mjs::hasCommand`** — already implemented binary-in-PATH check. Phase 5 uses this in the trigger, wizard, doctor, and `runStatus`.

- **`lib/notebooklm.mjs`'s error classes** — `NotebooklmNotInstalledError`, `NotebooklmCliError`, `NotebooklmRateLimitError`. The runner catches all three with different log levels (per D-14).

- **`lib/notebooklm-manifest.mjs::ensureManifestGitignored`** (Phase 3) — Phase 5 extends the managed block to include `.notebooklm-sync.log`. The idempotency invariant is reinforced — extending is safer than creating a separate helper.

- **`hooks/session-end-check.sh`** (Phase 1) — already has env var plumbing (`VAULT_PATH`), project resolution (`MAP_FILE` + `project-map.json`), conditional invocation (`SESSION_DIR exists`). Phase 5 adds 3-5 lines to invoke the trigger wrapper between Phase 1's context update and the existing vault auto-push.

- **`hooks/update-context.mjs`** (Phase 1) — **architectural template** for `notebooklm-sync-trigger.mjs`. Same pattern: env vars → sanity check → fire the action → exit 0 silently on any failure.

- **`bin/install.mjs`'s step-by-step wizard pattern** — functions like `collectProjects(totalSteps)`, `selectComponents(totalSteps, hasPip)`, `collectProfile(totalSteps)`. Phase 5 adds `setupNotebookLm(totalSteps)` following the same signature convention.

- **`bin/install.mjs::selectComponents`** (line 400+) — already has `components.notebooklm` flag. Phase 5 replaces the placeholder at lines 1103-1114 with real logic gated by this flag.

- **`lib/doctor.mjs::main`** (228 lines, line 28 entry) — Phase 5 inserts a new section (3 lines per D-13) after the Prerequisites section.

- **`tests/fixtures/notebooklm-stub.sh` + `notebooklm-sync-stub.sh`** — existing fake binary fixtures from Phase 2 and Phase 4. Phase 5 can extend with auth-check mode OR add a new `notebooklm-auth-stub.sh` — planner picks.

### Established Patterns

- **Lazy imports in `bin/cli.mjs`** — every subcommand does `const { main } = await import('../lib/X.mjs')`. Phase 5 follows this exactly.

- **Stats-as-return-value vs stdout pollution** — Phase 4 D-16 established that `syncVault` is silent by default (returns stats). Phase 5 `runSync` prints the stats AFTER the call returns (not during). `runStatus` does the same with dryRun plan. The runner writes to a log file, never stdout.

- **Env var driven configuration** — `VAULT_PATH`, `NOTEBOOKLM_NOTEBOOK_NAME` are the two inputs. No CLI flag parsing complexity. Install wizard sets neither explicitly (relies on defaults).

- **`fail` vs `warn` vs `info` severity discipline** — Phase 5 strictly: `info` for "feature not configured" states (missing binary, user opted out), `warn` for "feature partially working" (auth failing, last sync stale), `fail` reserved for "claude-dev-stack itself broken" (nothing in Phase 5 qualifies).

- **No Node 20+ APIs** — no `fetch`, no `structuredClone`, no `navigator`. Phase 5 uses `spawn`, `spawnSync`, `child_process.spawn`, and `fs` only.

- **No new npm dependencies** — `package.json` stays `{"prompts": "^2.4.2"}` exactly. Verified with grep in plan acceptance criteria.

- **Conventional commits** — `feat(05-XX)`, `test(05-XX)`, `docs(05)`, `chore(05)`. NO `Co-Authored-By`.

### Integration Points

- **New files:**
  - `lib/notebooklm-cli.mjs` (~150-200 LoC estimated) — routing + runSync + runStatus + printHelp
  - `hooks/notebooklm-sync-trigger.mjs` (~60-80 LoC) — detached spawn launcher
  - `hooks/notebooklm-sync-runner.mjs` (~100-150 LoC) — auth check + syncVault + log
  - `tests/notebooklm-cli.test.mjs` (~200-300 LoC) — 15-20 unit tests

- **Modified files:**
  - `bin/cli.mjs` — add `case 'notebooklm':` + help text update (~15 LoC change)
  - `bin/install.mjs` — replace lines 1103-1114 with ~80-120 LoC real wizard step
  - `hooks/session-end-check.sh` — add 5-10 lines for trigger invocation
  - `lib/doctor.mjs` — add NotebookLM section ~40 LoC
  - `lib/notebooklm-manifest.mjs` — extend managed block (1-2 line change + test updates)
  - `tests/notebooklm-manifest.test.mjs` — update tests to reflect 4-line managed block (~3 test expectation updates)
  - `tests/project-setup.test.mjs` — add TEST-02 smoke test (~15-30 LoC)
  - `tests/hooks.test.mjs` — add trigger + runner integration tests (~60-100 LoC)

- **Unchanged files** (Phase 5 does NOT modify):
  - `lib/notebooklm.mjs` — Phase 2/4 sacred
  - `lib/notebooklm-sync.mjs` — Phase 4 sacred
  - `lib/notebooklm-manifest.mjs` EXCEPT managed block — careful surgical edit

### Constraints on Integration

- **`package.json`** — must remain `{"prompts": "^2.4.2"}` exactly. Grep acceptance criterion on every plan.
- **Node 18+** — no Node 20+ APIs.
- **No new system dependencies** — `notebooklm-py` already documented from Phase 2. No new env vars required (all optional).
- **Secrets discipline** — zero handling of `NOTEBOOKLM_API_KEY`, zero reads of `~/.notebooklm/storage_state.json`, zero writes to credential paths. Delegated to `notebooklm-py login`.
- **Best-effort trigger** — NBLM-23 absolutely prohibits session-end UI noise from sync failures. Runner catches everything and exits 0.

</code_context>

<specifics>
## Specific Ideas

- **User accepted all 9 recommended defaults** across 4 gray areas + 1 follow-up question. This matches the Phase 1/2/3/4 pattern — calibrated user who understands the tradeoffs and aligns with Claude's reasoning when it matches prior locked decisions and PROJECT.md vision.

- **NBLM-24 semantic drift** (same class as Phase 4 ROADMAP SC5 `reverseProjectMap`) — handled cleanly. Requirements drafted with a slightly wrong assumption about the library file's role, CONTEXT.md resolves in spirit with rationale. Plan-checker and verifier should NOT block on the literal text.

- **Session-end trigger mirrors Phase 1 architecture.** `hooks/update-context.mjs` pattern is reused for `notebooklm-sync-trigger.mjs`: env var inputs, silent fail, exit 0 on any error. This is the cleanest way to integrate because reviewers already understand Phase 1.

- **Three invocation modes of `syncVault`.** Phase 5 introduces no new syncVault functionality — it just creates 3 call sites with 2 concurrency patterns:
  1. `runSync` (CLI) — inline, stdout stats
  2. Install wizard "first sync" — inline, stdout stats
  3. Trigger runner — detached subprocess, log file output
  
  All three call the identical function with the identical arguments. Phase 4 D-16 stats shape is the contract.

- **Log parsing is the ONLY non-trivial Phase 5 logic.** Doctor Line 3 ("last sync: N time ago") needs to tail the log and find the last `sync done` line. Could also read `manifest.generated_at` for freshness (cleaner, avoids log parsing). Claude's Discretion flagged this — planner to decide.

- **Install wizard replaces placeholder that already exists.** `bin/install.mjs:1103-1114` currently has a skeleton that just prints "to use, run `notebooklm login` manually" in the final summary screen. Phase 5 replaces this with a full interactive wizard step that runs BEFORE the summary screen. The `components.notebooklm` flag infrastructure from `selectComponents` is already in place — Phase 5 just adds real behavior to it.

- **No breaking changes to Phase 3's `ensureManifestGitignored`.** Adding `.notebooklm-sync.log` to the managed block is additive. Existing vaults that have the 3-line block will get it expanded to 4 lines on next sync run (idempotency guarantee holds). Phase 3 tests for "managed block contains .notebooklm-sync.json" still pass — they just get a 4th assertion added. The change is surgical and low-risk.

- **TEST-02 smoke test is pure Phase 5 scope.** Fresh vault `claude-dev-stack notebooklm status` must exit 0 with "no sync yet" message. This is proved by `runStatus` graceful handling of absent manifest (D-12). Add test to `tests/project-setup.test.mjs` per the requirement.

- **Runtime testability:** dev machine has `notebooklm-py v0.3.4` authenticated. Phase 5 plan can include an optional smoke test section that runs the wizard or the trigger against real `notebooklm` binary for manual validation. NOT part of automated test suite (would touch real notebook).

</specifics>

<deferred>
## Deferred Ideas

- **`uv tool install notebooklm-py`** — modern Python tool, not yet ubiquitous in 2026. Revisit in v2 when uv adoption is higher. Phase 5 supports pipx + pip only (D-09).

- **Sync log rotation** — if `.notebooklm-sync.log` grows large (e.g., user syncs 100× per day for a year), manual truncation is the current answer. v2 feature: rotate at 10MB or keep last 1000 entries.

- **Structured JSON log** — plain text is easier to tail and grep. JSON Lines offers programmatic parsing but adds complexity. Current choice (D-14) is plain text; revisit if Phase 5+ consumers need to parse the log programmatically.

- **Concurrent sync prevention** — what if session-end trigger fires while manual `notebooklm sync` is running? Currently both call `syncVault`, which uses manifest file locking (Phase 3 atomic write). Worst case: two processes race on manifest, second write wins. No data loss (both read same vault, both upload same sources, replace-by-filename is idempotent). A formal lock-file would prevent redundant API calls — deferred to v2.

- **Notebook name change migration** — if user edits `NOTEBOOKLM_NOTEBOOK_NAME` between sync runs, the old notebook is abandoned (no cleanup) and a new notebook is created. Documented in CLI help. v2: offer migration flow in wizard or CLI.

- **`notebooklm list` / `notebooklm delete` CLI subcommands** — Phase 5 exposes only `sync` and `status`. If users want to see what's in the notebook or delete stale entries, they use `notebooklm list` directly (Phase 2 wrapper available via `listNotebooks` but no CLI exposure). v2 could add `notebooklm list-notebooks`, `notebooklm list-sources`, `notebooklm prune`.

- **Auth check caching in the trigger** — currently trigger runs `notebooklm auth check` every session end. On a fast machine this is ~200ms. Could cache the result for N minutes. Deferred — premature optimization.

- **Wizard "skip NotebookLM" memory** — `components.notebooklm` flag could be persisted so re-running `claude-dev-stack` doesn't re-prompt. Currently the wizard re-asks every time. Deferred — idempotent re-runs are fine, memory adds complexity.

- **`notebooklm sync --project foo`** — sync a single project. Currently sync does all projects. v2.

- **`notebooklm sync --dry-run` CLI flag** — aliases for `notebooklm status` semantics. Deferred — status serves the use case.

- **Concurrent auth check + syncVault pre-flight** — speed up trigger by parallelizing. Deferred — trigger latency is not a user complaint.

- **Cross-machine log sync** — `.notebooklm-sync.log` is local-only. Multi-machine users won't see unified history. Matches Phase 3's manifest locality (gitignored). Deferred to v2 multi-machine story.

- **Cron-based periodic sync** — explicitly deferred to v2 (PROJECT.md and Phase 5 scope boundary).

- **Reviewed Todos (not folded):** None — all 2 carried-forward todos from prior sessions (cross-platform install, login UX) were folded in D-09 and D-10.

</deferred>

---

*Phase: 05-cli-integration-trigger-wizard*
*Context gathered: 2026-04-11*
