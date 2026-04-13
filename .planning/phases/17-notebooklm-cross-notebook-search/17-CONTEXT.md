# Phase 17: NotebookLM Cross-Notebook Search - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements **NBLM-01**: a single `claude-dev-stack notebooklm search "query"` command that fans out to all per-project notebooks simultaneously, merges results, and prints them attributed by project name.

**In scope:**
- New `search` subcommand in `lib/notebooklm-cli.mjs`
- Cross-notebook discovery via `listNotebooks()` + `cds__` prefix filter
- Parallel execution via `Promise.allSettled`
- Structured result output (human-readable + `--json` flag)
- Zero-notebooks and partial-failure UX
- Test coverage in `tests/notebooklm-cli.test.mjs`

**Out of scope:**
- Source-level fulltext retrieval (NBLM-FUT-02, deferred)
- Caching or local indexing of past results
- Streaming results as each notebook returns
- Interactive notebook selection
- NotebookLM binary installation (handled by Phase 5 doctor)

</domain>

<decisions>
## Implementation Decisions

### D-01: Notebook Discovery Strategy

Use `listNotebooks()` (already exported from `lib/notebooklm.mjs`) to fetch all notebooks owned by the authenticated user. Filter to those whose `title` starts with the `cds__` prefix — this is the canonical per-project naming convention established in Phase 7 (`lib/notebooklm-sync.mjs:234`). Extract the project slug by stripping the first 5 characters (`nb.title.slice(5)`). Do NOT read the manifest for notebook IDs — `listNotebooks()` returns live IDs from the API, avoiding stale manifest state.

### D-02: Parallel Execution via Promise.allSettled

Fan out one `askNotebook(notebookId, query)` call per discovered notebook using `Promise.allSettled`. This ensures:
- All notebooks are queried concurrently (success criterion #2: not 5x slower than a single query)
- A failure in one notebook does not cancel in-flight requests to others
- `settled` results are always an array — no try/catch needed around the fan-out itself

Do NOT use `Promise.all` — it rejects on the first failure, breaking partial-result delivery.

### D-03: Result Shape

Each successful result is a plain object:
```js
{
  project: string,      // slug extracted from cds__{slug}
  answer: string,       // full answer text from askNotebook
  citations: Array<{    // from askNotebook citations array
    index: number|null,
    sourceId: string,
    sourceTitle: null,  // askNotebook v1 omits this field
    snippet: string|null
  }>
}
```

Failed notebook queries produce a warning entry:
```js
{ project: string, error: string }  // error message truncated to 200 chars (T-05-01)
```

### D-04: Error Handling — Partial Results

When `Promise.allSettled` completes, separate fulfilled from rejected settlements. Print all fulfilled results first, then print one `warn()` line per rejected project. The command exits 0 as long as at least one result was returned. If ALL notebooks fail, print all warnings and exit non-zero by throwing (same pattern as `runSync`).

Rate-limit errors (`NotebooklmRateLimitError`) on individual notebooks are treated as normal failures — warn and continue. If the `listNotebooks()` call itself throws `NotebooklmRateLimitError` or `NotebooklmNotInstalledError`, propagate immediately (abort the whole command, same as `runSync`).

### D-05: Zero-Notebooks Case

If `listNotebooks()` returns no notebooks matching the `cds__` prefix, print a clear info message:

```
ℹ No project notebooks configured.
ℹ Run: claude-dev-stack notebooklm sync  (to create per-project notebooks)
```

Then return without error (exit 0). Do NOT throw — this is a valid empty state.

### D-06: CLI UX — Human-Readable Output

Default output groups results by project, separated by a dim divider line:

```
  ──────────────────────────────────────────────
  claude-dev-stack
  ──────────────────────────────────────────────

  <answer text>

  Citations
  [-] <sourceId> — <snippet>

  ──────────────────────────────────────────────
  my-other-project
  ...
```

Each project block uses the same visual style as `runAsk` (white answer text, dim divider, cyan "Citations" header, dim citation lines). Failed projects print a yellow `warn()` line after all successful results.

### D-07: --json Flag

When `--json` is passed, skip all formatted output and print a single JSON object to stdout:

```json
{
  "query": "the original query string",
  "results": [
    { "project": "claude-dev-stack", "answer": "...", "citations": [...] }
  ],
  "errors": [
    { "project": "other-project", "error": "rate limited" }
  ]
}
```

Exit code follows the same rule as human mode: 0 if any result succeeded, non-zero only if all failed.

### D-08: Unrecognized Flag Handling

Following the `runSync`/`runStatus` pattern (WR-04 fix from Phase 14): any flag starting with `-` that is not `--json` triggers a `warn()` and is ignored. This prevents silent flag discard.

### D-09: New Subcommand Registration

Add `case 'search': return runSearch(args.slice(1));` to the `switch` block in `lib/notebooklm-cli.mjs::main()`. Add a `search` line to `printNotebooklmHelp()`. No changes needed in `bin/cli.mjs` — `notebooklm` already routes all subcommands to `notebooklm-cli.mjs::main()`.

### D-10: Test Strategy

Add tests to `tests/notebooklm-cli.test.mjs` (or a new `tests/notebooklm-search.test.mjs` if the existing file is getting long). Use injectable `_listFn` and `_askFn` parameters (same injection pattern as `generateArtifact`'s `_runFn`) to avoid live CLI calls. Test cases must cover:
- Happy path: 2 notebooks, both succeed → 2 results printed
- Partial failure: 2 notebooks, 1 fails → 1 result + 1 warning
- All-fail: 2 notebooks, both fail → exit non-zero
- Zero notebooks: filtered list empty → info message, exit 0
- `--json` flag: output is valid JSON, no formatted text

### D-11: Error Reason Truncation

All error messages printed to the user are truncated to ≤200 chars via the existing `truncateReason()` helper already in `lib/notebooklm-cli.mjs` (T-05-01 security mitigation). This applies to per-notebook failure messages.

### D-12: Vault Dependency

`runSearch` does NOT require a vault to be present. Notebook discovery is live via `listNotebooks()` — no manifest read, no `findVault()` call. This matches the success criterion that the command works as long as `notebooklm-py` is installed and authenticated.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing API Surface
- `lib/notebooklm.mjs` — `listNotebooks()`, `askNotebook(notebookId, question, options)` (already exported)
- `lib/notebooklm-cli.mjs` — `main(args)`, `resolveNotebookId()`, `runAsk()`, `printNotebooklmHelp()`, `truncateReason()`
- `lib/shared.mjs` — `c`, `ok`, `fail`, `warn`, `info`

### Notebook Naming Convention
- Prefix: `cds__` (5 chars) — established in `lib/notebooklm-sync.mjs:234`
- Slug extraction: `nb.title.slice(5)` — used identically in `lib/doctor.mjs:158` and `lib/notebooklm-sync.mjs:235`

### Parallel Execution Precedent
- Phase 13 (`lib/adr-bridge.mjs`) uses `Promise.allSettled` for parallel GSD plan processing — same pattern applies here

### UX Pattern Reference
- `runAsk()` in `lib/notebooklm-cli.mjs` (lines 187–270) — canonical answer + citations display format
- `runSync()` in `lib/notebooklm-cli.mjs` (lines 71–132) — error propagation and warn/ok summary pattern

### CLI Router
- `bin/cli.mjs:146–149` — `case 'notebooklm':` routes to `lib/notebooklm-cli.mjs::main()` — no change needed here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `listNotebooks()` — returns `Array<{id, title, createdAt}>`. Filter: `nb.title.startsWith('cds__')`. No changes to this function needed.
- `askNotebook(notebookId, question, options)` — already handles rate-limit retry internally (up to 3 attempts with exponential backoff). Returns `{answer, citations}`. No changes needed.
- `truncateReason(reason)` — already defined in `lib/notebooklm-cli.mjs`. Reuse directly (it is NOT exported — `runSearch` must be added to the same file).
- `resolveNotebookId()` — NOT used by `runSearch` (search discovers notebooks itself via `listNotebooks`).
- `printNotebooklmHelp()` — add one line for `search` subcommand.

### Established Patterns

- All new CLI subcommands are `async function runX(args)` in `lib/notebooklm-cli.mjs`, registered in the `switch` in `main()`.
- Injectable functions for testing: `options._runFn` pattern used by `generateArtifact`. Apply same pattern to `runSearch` via `options._listFn` and `options._askFn`.
- 4-space indent on all `console.log` output lines (project-wide UI convention).
- `Promise.allSettled` returns `Array<{status: 'fulfilled'|'rejected', value?, reason?}>`.

### Integration Points

- `lib/notebooklm-cli.mjs::main()` — add `case 'search':`
- `lib/notebooklm-cli.mjs::printNotebooklmHelp()` — add search line
- `tests/notebooklm-cli.test.mjs` (or new `tests/notebooklm-search.test.mjs`) — add test suite

### Module Boundary

`runSearch` lives in `lib/notebooklm-cli.mjs`, not in `lib/notebooklm.mjs`. Per D-01 from Phase 11 context: CLI logic stays in `notebooklm-cli.mjs`; `notebooklm.mjs` is a pure wrapper with no UI. Cross-notebook fan-out is CLI orchestration, not a library primitive.

</code_context>

<specifics>
## Specific Ideas

- The `--json` output shape (D-07) should include both `results` and `errors` arrays at the top level — this makes it easy for scripts to check `errors.length > 0` without inspecting individual entries.
- Consider printing the query string at the top of human-readable output (`Searching ${N} notebooks for: "${query}"`) so the user knows how many notebooks are being queried before results appear.
- If `listNotebooks()` throws `NotebooklmNotInstalledError`, the error message already includes the install hint — just rethrow (same as `runSync`).

</specifics>

<deferred>
## Deferred Ideas

- Source-level fulltext retrieval per result (NBLM-FUT-02) — would require a second `listSources()` call per notebook to map `sourceId` → `sourceTitle`. Not in Phase 17 scope.
- `--save` flag for search results (mirroring `runAsk --save`) — deferred to a follow-up; vault directory naming for multi-notebook results is non-trivial.
- Progress indicator (spinner or "querying N notebooks...") — Node 18 has no built-in spinner; deferred to avoid adding a dependency.
- Filtering search to a subset of projects (`--project foo,bar`) — deferred; zero-value for single-user use case in v0.11.

</deferred>

---

*Phase: 17-notebooklm-cross-notebook-search*
*Context gathered: 2026-04-13*
