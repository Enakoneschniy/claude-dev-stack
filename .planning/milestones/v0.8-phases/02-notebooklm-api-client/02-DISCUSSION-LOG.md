# Phase 2: NotebookLM CLI Wrapper - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 02-notebooklm-api-client
**Areas discussed:** Scope pivot (milestone-level), Binary invocation helper, Binary detection timing, JSON parsing & schema, Rate-limit stderr detection
**Mode:** Milestone-level pivot decision via evidence presentation + batched acceptance of tactical gray areas

---

## Pre-Discussion: Milestone-Level Pivot

Before presenting gray areas, the discuss session uncovered that the phase's locked requirements (NBLM-01..06 as written in the pre-pivot REQUIREMENTS.md) were based on a false premise: that Google NotebookLM has a public REST API with API-key auth. Investigation of `~/.claude/skills/notebooklm/SKILL.md` (notebooklm-py v0.3.4 documentation) established:

1. `notebooklm-py` is a Python CLI, not an HTTP client library
2. Auth is browser-based OAuth via Playwright, not API-key-based
3. Under the hood are reverse-engineered RPC calls to Google internals, not documented endpoints
4. `NOTEBOOKLM_API_KEY` does not exist as a concept

Three variants were presented to resolve the contradiction:

| Variant | Description | Selected |
|---------|-------------|----------|
| A. CLI wrapper around `notebooklm-py` | Thin `spawnSync` wrapper, delegate auth entirely, add Python system dep | ✓ |
| B. Reimplement browser auth + RPC in Node.js | Own playwright-based client, breaks single-dep constraint | |
| C. Pivot milestone to different service (e.g., OpenAI + vector DB) | Scope explosion, breaks original thesis | |

**User's choice:** Variant A
**User's rationale:** "вараинт А однозначно"
**Follow-up action:** Execute atomic pivot of planning artifacts before proceeding with Phase 2 gray areas.

Pivot artifacts written (commit `e6c21b7`):
- ADR-0001 created in `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` (also documented the vault `decisions/` folder usage pattern — first file in that folder)
- `.planning/REQUIREMENTS.md` — NBLM-01..06 rewritten, NBLM-21/23/26/27 updated, count mismatch 37→36 corrected, Out of Scope section gained ADR-referencing rows
- `.planning/ROADMAP.md` — Phase 2 title, goal, success criteria rewritten; Phase 5 goal + success criteria #3, #4, #5 updated for new auth/trigger model; phase headline in Phases list updated
- `.planning/PROJECT.md` — Constraints section gained "System dependencies" entry and delegated-auth secrets rule; Active section annotated with ADR reference; Key Decisions table gained pivot row; Last updated footer bumped

Side observation flagged by user during pivot: vault `decisions/` folder is unused because GSD captures decisions in `.planning/phases/*/CONTEXT.md` instead. This is a parallel system to `.planning/phases/*/CONTEXT.md`. Recorded as a memory entry for a future "reconcile" cleanup phase. Not part of this phase's scope.

---

## Tactical Gray Areas (post-pivot)

After the pivot was committed, the session presented 4 tactical gray areas scoped to the new CLI-wrapper approach. User accepted all recommendations in a single turn after reviewing the pre-analysis.

---

## A. Binary invocation helper

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Raw `spawnSync` inline in each function | Direct child_process calls, each function has its own pipe/error handling. Explicit but repetitive. | |
| 2. Private helper `runNotebooklm(args, options)` inside the module | All 6 functions go through one private helper that handles binary detection, spawn, JSON parse, error construction. DRY. | ✓ |
| 3. Reuse `lib/shared.mjs::runCmd` | Existing generic helper, but too universal — doesn't know about NotebookLM-specific JSON parsing or stderr patterns. Wrapping would require extension points. | |
| 4. Class-based `NotebooklmClient` with methods | More structure, stateful (cached binary path). Overkill for a thin functional wrapper. | |

**User's choice:** Option 2 (recommended default)
**Rationale:** Single source of truth for JSON parsing + error detection logic. Keeps `shared.mjs::runCmd` generic for other use cases. Claude-dev-stack codebase convention (per `.planning/codebase/CONVENTIONS.md`) uses functional modules over classes — a class-based client would be architecturally inconsistent.

---

## B. Binary detection timing

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Module load time (side effect at import) | Fails fast but breaks import on machines without the binary, even when caller never invokes any function. | |
| 2. First function call (lazy with cache) | Detection on first invoke, cached for subsequent calls. Module imports freely; errors only on actual use. | ✓ |
| 3. Every function call | Safe but wasteful — extra `which` call per operation. Overkill. | |
| 4. Skip explicit check, let `spawnSync` fail with `ENOENT` | Relies on Node's built-in error, but `ENOENT` is not descriptive. NBLM-02 requires a typed error with install hint. | |

**User's choice:** Option 2 (recommended default)
**Rationale:** Phase 5's session-end trigger will conditionally skip sync when NotebookLM isn't set up — importing `lib/notebooklm.mjs` must not throw on such machines. Lazy detection with per-process cache provides the best UX: zero cost when unused, fast-fail with descriptive error when called without the binary. Matches existing codebase patterns for external tool detection.

---

## C. JSON parsing & schema normalization

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Return raw parsed JSON, let caller destructure | Simple, no abstraction. Caller must know CLI-specific field shapes. | |
| 2. Normalize to consistent shape in wrapper | Hide CLI details. Cleaner API but throw-away layer when upstream shapes change. | |
| 3. Validate schema via manual checks, throw on unexpected shape | Defensive but adds code without clear benefit. | |
| 4. Combination: Normalize + minimal validation | Return clean camelCase shape with only needed fields; throw `NotebooklmCliError` if required fields missing from parsed JSON. Balanced. | ✓ |

**User's choice:** Option 4 (recommended default)
**Rationale:** Provides future-proofing against `notebooklm-py` minor-version schema drift — the wrapper either keeps working (if extra fields are added) or fails fast with an actionable error (if required fields are removed). Also converts snake_case (CLI) to camelCase (JS) at the boundary, so Phase 4 sync pipeline doesn't have to deal with naming style mismatches across languages.

---

## D. Rate-limit stderr pattern detection

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Hardcoded regex list as module constant | Simple, visible, easy to extend. Fragile if upstream changes stderr wording. | ✓ |
| 2. External config file `lib/notebooklm-stderr-patterns.json` | Externalized for easier updates without code touch. Overkill for MVP. | |
| 3. Duck-typing on exit code ranges | `notebooklm-py` uses exit 1 for everything — can't distinguish rate-limit from other failures. Insufficient granularity. | |
| 4. Rate-limit detection delegated to caller | Wrapper throws generic `NotebooklmCliError`, caller pattern-matches `.stderr`. Pushes complexity outward. | |

**User's choice:** Option 1 (recommended default)
**Rationale:** Matches scope of an MVP. Starting patterns derived from documented `notebooklm-py` error handling section in the skill. Maintenance burden (updating the constant when upstream wording changes) is acceptable given the constant lives in one place and is one line per pattern. When the list outgrows a module constant, it can be externalized in v2.

---

## Claude's Discretion

- Exact name of the module-private invocation helper (`runNotebooklm` proposed, planner may choose more descriptive alternative)
- Whether typed error classes live inline in `lib/notebooklm.mjs` or in separate `lib/notebooklm-errors.mjs` file (decide based on file length threshold)
- Precise formatting of `NotebooklmNotInstalledError.message` string
- Whether test fake binaries are one parameterized stub or multiple per-scenario stubs
- Whether `tests/notebooklm.test.mjs` uses `describe`/`it` or flat `test()` calls (match surrounding test directory conventions)
- Implementation of `updateSource` as delete-then-upload orchestration vs two separate CLI calls

## Deferred Ideas

- Retry loop in JS layer — delegated to upstream `--retry` flag
- `generate` family commands (audio, video, slide-deck, report, quiz, etc.) — not in v0.8 scope
- Binary version pinning / version check — trust `hasCommand` result; version verification could be added in Phase 5 doctor
- Output format fallback for commands without `--json` support — planner notes per-command during research
- `listSources` result caching — deferred to Phase 4 if proven a bottleneck
- Structured logging hook for observability — v2
- `NOTEBOOKLM_BIN` env var for custom binary path — PATH-based discovery covers 99% of cases
