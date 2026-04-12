# Phase 11: NotebookLM Query API - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn NotebookLM from a write-only sync target into a queryable knowledge base. Adds two new library functions (`askNotebook`, `generateArtifact`) to `lib/notebooklm.mjs` and corresponding CLI subcommands (`notebooklm ask`, `notebooklm generate`) to `lib/notebooklm-cli.mjs`.

</domain>

<decisions>
## Implementation Decisions

### askNotebook API
- **D-01:** Return parsed citations array: `{answer, citations: [{index, sourceId, sourceTitle, snippet}]}` — parse from `notebooklm ask --json` output, consumer-ready
- **D-02:** Single question only — `askNotebook(notebookId, question, options)` always starts a fresh conversation. No conversation continuation support in v1
- **D-03:** Optional `sourceIds` parameter — `askNotebook(notebookId, question, {sourceIds: ['src_001']})` passes `--source` flags to filter to specific sources
- **D-04:** Explicit notebook ID required — `askNotebook(notebookId, question)`. Lib stays pure, no vault/manifest coupling. Caller provides ID

### generateArtifact API
- **D-05:** Support ALL 11 artifact types (audio, video, cinematic-video, slide-deck, quiz, flashcards, infographic, data-table, mind-map, report, revise-slide) — pass type through to CLI
- **D-06:** Always use `--wait` mode — block until artifact ready. notebooklm-py handles polling internally. No separate `pollArtifact()` function
- **D-07:** Unified return shape: `{artifactId, content, type}` — `content` is text for text types (report, quiz, etc.), null for binary types (audio, video). Consumer uses `notebooklm download` separately for binary artifacts

### CLI Output & --save
- **D-08:** `notebooklm ask` displays answer text followed by separator, then numbered citations list with source title and snippet
- **D-09:** `--save` writes to `vault/projects/{slug}/docs/notebooklm-answers/{timestamp}-{question-slug}.md` — sortable by time, identifiable by content
- **D-10:** `notebooklm generate` CLI subcommand included in this phase — expose all artifact types: `notebooklm generate report`, `notebooklm generate quiz`, etc.

### Error Handling
- **D-11:** askNotebook retries 2x with exponential backoff (1s→2s) on rate-limit/transient errors. Matches existing pattern in notebooklm.mjs
- **D-12:** generateArtifact delegates retry to notebooklm-py via `--retry 2` flag. No wrapper-level retry

### Notebook ID Resolution (CLI)
- **D-13:** CLI `notebooklm ask` without `--notebook` auto-resolves notebook ID from sync manifest — detect current project from cwd/git, read `.notebooklm-manifest.json`. Falls back to `--notebook` flag if not synced
- **D-14:** Same resolution logic for `notebooklm generate` CLI

### CLI Generate Output
- **D-15:** Simple waiting message while generating: "Generating {type}..." then result when done. No spinner
- **D-16:** Binary artifacts (audio, video, etc.) download to `vault/projects/{slug}/docs/notebooklm-artifacts/{timestamp}-{type}.{ext}`

### Claude's Discretion
- JSON parsing details for `notebooklm ask --json` response structure
- Exact retry backoff timing implementation
- Question slug generation algorithm for `--save` filenames
- Progress message formatting during `--wait`
- Test approach (fake binary vs mock responses)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NotebookLM Integration
- `lib/notebooklm.mjs` — Existing wrapper with 7 functions, error classes, `runNotebooklm()` helper pattern
- `lib/notebooklm-cli.mjs` — CLI dispatcher for sync/status/migrate, new subcommands go here
- `lib/notebooklm-manifest.mjs` — Manifest with notebook IDs per project (for D-13 resolution)
- `lib/notebooklm-sync.mjs` — Sync pipeline (reference for vault/project discovery patterns)

### ADRs
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — ADR-0001: why CLI wrapper, not HTTP client

### CLI Routing
- `bin/cli.mjs` — Entry point, add `ask` and `generate` routing
- `lib/shared.mjs` — Colors, helpers, `hasCommand()` used by lazy binary detection

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runNotebooklm(args, {jsonMode, functionName})` — internal helper for all CLI invocations with JSON parse, rate-limit detection, error normalization
- `_ensureBinary(functionName)` — lazy binary detection with `NotebooklmNotInstalledError`
- Three error classes: `NotebooklmCliError`, `NotebooklmRateLimitError`, `NotebooklmNotInstalledError`
- `RATE_LIMIT_PATTERNS` — regex catalog for stderr rate-limit detection

### Established Patterns
- All public functions in `notebooklm.mjs` are async, use `runNotebooklm()`, throw typed errors
- CLI dispatcher in `notebooklm-cli.mjs` uses switch/case on subcommand, delegates to private `run*()` functions
- Error truncation to ≤200 chars for CLI output (security: prevents vault content leak via stderr)
- Tests use fake `notebooklm` binary fixture (bash scripts that echo canned JSON)

### Integration Points
- `bin/cli.mjs` routes `notebooklm` → `notebooklm-cli.mjs::main(args)`
- `findVault()` from `projects.mjs` for vault root discovery
- `readManifest()` from `notebooklm-manifest.mjs` for notebook ID lookup

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-notebooklm-query-api*
*Context gathered: 2026-04-12*
