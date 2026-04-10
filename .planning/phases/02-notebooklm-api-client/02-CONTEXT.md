# Phase 2: NotebookLM CLI Wrapper - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Scope anchor:** ADR-0001 (`vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md`) — Phase 2 pivoted from "HTTP client with API key" to "thin wrapper over `notebooklm-py` CLI" during this discuss session. All decisions below assume the pivoted scope.

<domain>
## Phase Boundary

Build `lib/notebooklm.mjs` — a thin JavaScript wrapper that exposes 6 functions (`createNotebook`, `listSources`, `uploadSource`, `deleteSource`, `deleteSourceByTitle`, `updateSource`) by delegating to the `notebooklm-py` CLI via `spawnSync`. The module translates CLI JSON output into return values, translates non-zero exit codes and known stderr patterns into typed Errors, and fails fast with an install hint when the `notebooklm` binary is missing from `PATH`.

**In scope:** module code, typed error classes, binary detection (lazy + cached), JSON parse + minimal schema validation, hardcoded rate-limit pattern detection, `tests/notebooklm.test.mjs` with a fake bash-stub binary, and updated PROJECT.md stack intel (system dep documented).

**Out of scope:** auth handling (fully delegated to `notebooklm-py`), retry loops (delegated to `--retry` flag on upstream CLI), wizard/doctor integration (that's Phase 5), sync pipeline logic (that's Phase 4), CLI subcommand routing (that's Phase 5).

**Explicit non-goals per ADR-0001:** HTTP requests, credential storage, `NOTEBOOKLM_API_KEY` handling, `playwright` or any npm dep addition, reimplementation of `notebooklm-py`'s RPC protocol.

</domain>

<decisions>
## Implementation Decisions

### A. Binary invocation helper
- **D-01:** Private helper `runNotebooklm(args, options)` inside `lib/notebooklm.mjs` is the single invocation point. All 6 public functions go through it. The helper encapsulates: binary detection, `spawnSync` call with consistent stdio/encoding, JSON parse of stdout, non-zero exit handling, stderr pattern matching for rate limits, typed error construction.
- **D-02:** The helper is a **module-private function**, not exported. It is not reused from `lib/shared.mjs::runCmd` because `runCmd` is too generic — it has no knowledge of JSON parsing, no knowledge of `notebooklm-py`-specific stderr patterns, and wrapping it would require passing callback options for NotebookLM-specific logic. A dedicated private helper is clearer than a universal helper with NotebookLM extension points.
- **D-03:** Functions are plain exported `async function` declarations (not a class). Claude-dev-stack codebase convention (per `.planning/codebase/CONVENTIONS.md`) uses functional modules, not class-based clients. A class would be overkill for a 6-method stateless wrapper.

### B. Binary detection timing
- **D-04:** **Lazy detection with per-process cache.** On the first call to any exported function, `runNotebooklm` invokes `hasCommand('notebooklm')` from `lib/shared.mjs`. The result is stored in a module-scoped `_binaryChecked` boolean and `_binaryAvailable` boolean. Subsequent calls skip the check and trust the cache.
- **D-05:** Rationale — importing `lib/notebooklm.mjs` on a machine without `notebooklm-py` installed must NOT throw. Callers that conditionally use NotebookLM (e.g., Phase 5 session-end trigger, which skips sync if NotebookLM isn't set up) import the module unconditionally and rely on the lazy check.
- **D-06:** If `_binaryAvailable` is false when a function is called, throw a `NotebooklmNotInstalledError` whose `.message` includes: the function that was called, the binary name being searched for (`notebooklm`), and the install hint `pipx install notebooklm-py` (with a secondary mention of `pip install --user notebooklm-py` as a fallback for machines without `pipx`).
- **D-07:** The cache does NOT survive across process boundaries and is NOT persisted. Tests that manipulate `PATH` at runtime (e.g., adding a fake binary) must rely on `importModule` fresh per test case, OR the module must expose a test-only `_resetBinaryCache()` function. **Planner decides which** — test ergonomics drive the choice.

### C. JSON parsing & schema normalization
- **D-08:** **Normalize + minimal validation.** Each function extracts only the fields downstream code (Phase 4 sync pipeline) will use, throws `NotebooklmCliError` if any expected field is missing from the parsed JSON. Full raw CLI output is NOT passed through unchanged.
- **D-09:** Concrete expected shapes (per `~/.claude/skills/notebooklm/SKILL.md` documentation):
  - `createNotebook(name)` → parses `{"id": "...", "title": "..."}`, returns `{ id, title }`
  - `listSources(notebookId)` → parses `{"sources": [{"id", "title", "status"}, ...]}`, returns the `sources` array with each source normalized to `{ id, title, status }`
  - `uploadSource(notebookId, filepath)` → parses `{"source_id": "...", "title": "...", "status": "processing"}`, returns `{ sourceId, title, status }` (note: camelCase in JS, snake_case in CLI output)
  - `deleteSource(notebookId, sourceId)` → parses confirmation response, returns `{ deleted: true, sourceId }` on success
  - `deleteSourceByTitle(notebookId, title)` → same as `deleteSource` but uses `notebooklm source delete-by-title "exact title" -n {notebookId}`
  - `updateSource(notebookId, sourceId, filepath)` → delete-then-upload wrapper since `notebooklm-py` doesn't have a single-call update. Returns the same shape as `uploadSource`.
- **D-10:** Raw stdout is preserved on the thrown `NotebooklmCliError` in a `.rawOutput` field when parsing fails, so debugging is possible without re-running.
- **D-11:** JSON parse is strict — `JSON.parse(stdout)` wrapped in try/catch. Any `SyntaxError` becomes `NotebooklmCliError` with message `"failed to parse notebooklm --json output from '{command}': {original syntax error}"`.

### D. Rate-limit stderr pattern detection
- **D-12:** **Hardcoded regex list** `RATE_LIMIT_PATTERNS` as a module-level `const`. Initial patterns derived from `~/.claude/skills/notebooklm/SKILL.md` Error Handling section:
  ```js
  const RATE_LIMIT_PATTERNS = [
    /No result found for RPC ID/i,
    /GENERATION_FAILED/,
    /rate[\s_-]?limit/i,
    /quota\s+exceeded/i,
    /too many requests/i,
  ];
  ```
- **D-13:** On non-zero exit, `runNotebooklm` tests captured stderr against every pattern in `RATE_LIMIT_PATTERNS`. If any match → throw `NotebooklmRateLimitError` (subclass of `NotebooklmCliError`) with the matched pattern in a `.matchedPattern` field and the stderr snippet in `.stderr`.
- **D-14:** If no rate-limit pattern matches → throw generic `NotebooklmCliError` with `.command`, `.exitCode`, and `.stderr` fields (no `.matchedPattern`).
- **D-15:** Claude-dev-stack does NOT implement its own retry loop. NBLM-05 explicitly delegates retry to upstream: callers can pass `retry: N` as an option to exported functions, and the wrapper forwards it as `--retry N` to `notebooklm-py` for generate-class commands. For the 6 Phase 2 functions (which are all notebook/source CRUD, not generate-class), the `retry` option is a no-op and documented as such in jsdoc. Phase 2 surface area doesn't include generate commands.

### Claude's Discretion
- The exact name of the module-private helper (`runNotebooklm` proposed, planner can pick a clearer name like `invokeCli` or `callNotebooklmCli`)
- Whether the typed error classes live in `lib/notebooklm.mjs` directly or in a separate `lib/notebooklm-errors.mjs` file — decide based on file length. If `notebooklm.mjs` stays under ~300 LoC with errors inline, inline them. Otherwise, extract.
- The precise string format of `NotebooklmNotInstalledError.message` — content from D-06 is required, formatting is flexible
- Whether the fake bash binary for tests is a single parameterized stub or multiple per-scenario stubs (e.g., `tests/fixtures/notebooklm-success.sh`, `tests/fixtures/notebooklm-ratelimit.sh`). Either works; planner picks based on test readability.
- Whether `tests/notebooklm.test.mjs` uses `describe`/`it` blocks (existing pattern in `tests/hooks.test.mjs`) or flat `test()` calls — just match whatever is most common in the current tests directory
- Implementation of `updateSource` as delete-then-upload vs two separate CLI calls orchestrated from inside one function — same outcome, different code style. Planner picks.

### Folded Todos
None — no relevant todos matched Phase 2 during `cross_reference_todos` step.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone-level architectural decision (newest, highest priority)
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — **ADR-0001**, the full rationale for the pivot. Contains context (why the original REST-client scope was invalid), decision (CLI wrapper approach), alternatives considered (rejected B and C), and consequences (Python system dep, fragility inheritance, testing complexity). **Read this first.**

### Phase scope & requirements (post-pivot versions)
- `.planning/ROADMAP.md` §Phase 2 — goal statement and 5 pivoted success criteria
- `.planning/REQUIREMENTS.md` §NotebookLM Client Module — NBLM-01..06 in their post-pivot formulation (NBLM-02 delegates auth, NBLM-03 documents system dep, NBLM-05 delegates retry, etc.)
- `.planning/PROJECT.md` §Constraints — JavaScript single-dep rule, new "System dependencies (NotebookLM feature only)" entry, delegated-auth secrets rule
- `.planning/PROJECT.md` §Key Decisions table — new row "NotebookLM integration via `notebooklm-py` CLI wrapper, not a custom HTTP client (ADR-0001)"

### Upstream reference (the thing we are wrapping)
- `~/.claude/skills/notebooklm/SKILL.md` — `notebooklm-py v0.3.4` full documentation. Sections most relevant to Phase 2:
  - **Quick Reference table** (lines 119-177) — concrete CLI commands each of our 6 exported functions will invoke
  - **Command Output Formats** (lines 182-225) — JSON shapes that `runNotebooklm` must parse
  - **Error Handling** section (lines 432-449) — the error decision tree; source for `RATE_LIMIT_PATTERNS` regex values
  - **Exit Codes** section (lines 451-465) — exit 0 = success, 1 = generic error, 2 = timeout. Our wrapper only deals with 0/1 for Phase 2 functions (no `wait` commands in scope).
  - **Parallel safety** (lines 57-63, 178) — why we must always pass `-n <notebookId>` explicitly and never rely on `notebooklm use` for context setting

### Codebase integration points
- `lib/shared.mjs` — exports `hasCommand(cmd)` (used for lazy binary detection D-04), `runCmd(command, opts)` (reference implementation of `spawnSync` wrapping, NOT used directly per D-02), color helpers (`c.red`, `c.yellow`, etc.) for test output formatting if needed
- `lib/doctor.mjs` — existing health-check patterns using `ok`/`fail`/`warn`/`info` helpers. Phase 5 will add a `notebooklm` check to this file; Phase 2 doesn't touch it but the check shape is a downstream concern
- `tests/hooks.test.mjs` — reference for `execFileSync('bash', ...)` pattern. Closest existing precedent for testing external binary invocation, though hooks.test.mjs tests `.sh` files directly while Phase 2 tests a fake `notebooklm` binary in `PATH`
- `tests/project-setup.test.mjs` — reference for testing `lib/*.mjs` modules via direct `import` with assertions on returned values. Phase 2 test will follow this pattern for the unit-level assertions, combined with hooks.test.mjs-style PATH manipulation

### System-level verification (already done, retain for record)
- `/opt/anaconda3/bin/notebooklm --version` → `NotebookLM CLI, version 0.3.4` (checked during discuss session on dev machine)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/shared.mjs::hasCommand(cmd)`** — already implemented binary-in-PATH check used by `doctor.mjs` (for `claude`, `git`, `npx`) and `update.mjs`. Phase 2 uses this for D-04 lazy detection. No need to add a new PATH-check implementation.
- **`lib/shared.mjs` color helpers (`c.red`, `c.yellow`, etc.)** — available for test output if the planner wants readable assertion failure messages, though not required for the test logic itself.
- **`child_process.spawnSync`** (Node.js builtin) — used directly in `runNotebooklm` helper. Already imported by other `lib/` modules.

### Established Patterns
- **Functional modules over classes** — `lib/*.mjs` files export plain functions, not class instances. `lib/notebooklm.mjs` follows this pattern (D-03).
- **`c.X` ANSI color strings (never functions)** — applies to any console output in Phase 2 tests. Phase 2 module itself produces no console output; it throws or returns.
- **Error propagation via throw** — `lib/*.mjs` helpers throw `Error` subclasses on failure; callers are expected to catch and decide UX. `lib/notebooklm.mjs` throws typed error subclasses (`NotebooklmNotInstalledError`, `NotebooklmCliError`, `NotebooklmRateLimitError`) so callers can `instanceof`-match on specific failure types.
- **`node:test` + `node:assert/strict` only** — no test frameworks, no spies, no mocking libraries. The "mock binary in PATH" technique is how this codebase sidesteps the lack of a mocking library.
- **`process.env.PATH` manipulation for tests** — not yet a precedent in existing tests (`tests/hooks.test.mjs` doesn't modify `PATH`). Phase 2 introduces this technique; the plan should document it clearly so future phases can reuse.

### Integration Points
- **New module:** `lib/notebooklm.mjs` — exports 6 functions + 3 typed error classes. No CLI entry point (Phase 5 adds `claude-dev-stack notebooklm <subcommand>` routing separately).
- **New test:** `tests/notebooklm.test.mjs` — covers all 6 functions + 3 error scenarios (binary missing, non-zero exit with generic error, non-zero exit matching rate-limit pattern).
- **New test fixture(s):** `tests/fixtures/notebooklm-stub.sh` (or per-scenario variants, planner decides per D-15 Claude's Discretion). Bash script(s) that emit canned JSON on stdout or controlled exit codes, placed at the front of `PATH` during test setup.
- **No modifications to existing files** in Phase 2 scope. `bin/cli.mjs` routing, `lib/doctor.mjs` checks, and `lib/install.mjs` wizard integration are all **Phase 5**, not Phase 2.
- **`package.json`** — must NOT gain any new `dependencies` entries during Phase 2. Verified in Phase 2 Success Criterion #2.

</code_context>

<specifics>
## Specific Ideas

- User accepted the `variant A` pivot (CLI wrapper) decisively after being presented with evidence that the original REST-client scope was invalid. The alternative options (B: custom playwright-based reimplementation, C: pivot to different service) were explicitly reviewed and rejected during this session.
- User accepted all 4 gray-area recommendations (A#2, B#2, C#4, D#1) in a single turn after reviewing the pre-analysis. No deviations.
- User flagged that `vault/projects/claude-dev-stack/decisions/` folder was unused before this session. ADR-0001 bootstraps its use as the first file in the folder. This is captured as an open observation in Claude's memory for a future "reconcile vault/decisions with GSD .planning/" cleanup phase (user's words: "это будет уже следующий этап развития проекта"). Not part of this phase's scope.
- `notebooklm-py v0.3.4` is already installed and authenticated on the dev machine (`/opt/anaconda3/bin/notebooklm`). This means Phase 2 can be tested manually end-to-end with a real notebook without going through the Phase 5 install wizard. The planner should note this as an opportunity for a dev-only smoke test (not part of the automated test suite).
- The `notebooklm` CLI is parallel-agent-unsafe when using implicit context via `notebooklm use` — `~/.notebooklm/context.json` is shared across processes. **Phase 2 wrapper must always pass explicit notebook ID** via `-n <notebookId>` or `--notebook <notebookId>` flags. This is a non-negotiable per the upstream skill's "Parallel safety" section. It's captured in D-09 shape definitions but also worth highlighting for the planner.
- NBLM-07 and NBLM-08 in REQUIREMENTS describe Phase 4's sync pipeline operations: walking `vault/*/sessions/`, `vault/*/decisions/`, etc. and calling our exported functions. Phase 2's return shape (D-09) must be stable enough that Phase 4 can consume it without additional translation layers. The 6 functions and their shapes form Phase 4's implicit contract.

</specifics>

<deferred>
## Deferred Ideas

- **Retry loop in Phase 2 wrapper** — explicitly delegated to upstream `--retry` flag per D-15. If Phase 4 discovers rate limits are a practical blocker even with upstream retry, a JS-side retry wrapper can be considered in a v2 or dedicated sub-phase. Not now.
- **Generate commands surface** (`generateAudio`, `generateReport`, etc.) — Phase 2 covers only notebook/source CRUD (6 functions). NotebookLM's `generate` family (audio/video/slide-deck/report/quiz/etc.) is NOT in scope for v0.8 milestone. If dev-research skill or a future milestone wants them, add to v2 requirements. Deferred.
- **Binary version pinning / version check** — Phase 2 does not verify that the installed `notebooklm-py` version matches `>= 0.3.4`. It trusts that `hasCommand('notebooklm')` returning true means the binary works. If `notebooklm-py` upstream introduces breaking changes in a minor version, Phase 2 might start failing silently. A version check could be added in Phase 5 doctor, but is deferred from Phase 2 scope to keep the wrapper minimal.
- **Parallel agent safety enforcement in wrapper** — per the upstream docs, using `notebooklm use` for implicit context is unsafe in parallel. Phase 2 mitigates this by always passing explicit `-n <notebookId>` in every function. Phase 2 does NOT go further and actively detect/block callers from invoking the `use` subcommand, because Phase 2 doesn't expose `use` at all. If a future phase adds a more liberal API surface, parallel safety guards become relevant.
- **Output format fallback for non-JSON modes** — Phase 2 always invokes `notebooklm` with `--json` to get machine-readable output. Some `notebooklm-py` subcommands may not support `--json` (planner should verify per command during research). If a command doesn't support `--json`, the planner may need to fall back to stdout text parsing for that one command, or pick a different CLI subcommand. Noted but not pre-decided.
- **Caching of `listSources` results** — would reduce API calls for sync pipeline in Phase 4, but adds cache invalidation complexity. Deferred to Phase 4 if it turns out to be a bottleneck.
- **Structured logging hook** — a `setLogger(fn)` export so callers can observe all CLI invocations for debugging. Useful but adds surface area. Deferred to v2.
- **Config flag to point at a different `notebooklm` binary path** (e.g., `NOTEBOOKLM_BIN=/custom/path/notebooklm`) — could be useful for advanced users with non-standard installs. Deferred because `PATH`-based discovery covers 99% of cases. Revisit if Phase 5 doctor check reveals frequent PATH-detection failures.

</deferred>

---

*Phase: 02-notebooklm-api-client*
*Context gathered: 2026-04-10 (post-pivot, see ADR-0001)*
