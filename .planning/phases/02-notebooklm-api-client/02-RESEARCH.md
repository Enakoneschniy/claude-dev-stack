# Phase 2: NotebookLM CLI Wrapper — Research

**Researched:** 2026-04-10
**Model:** claude-sonnet-4-6 (balanced profile)
**Scope:** Tactical unknowns only — architectural decisions already locked in CONTEXT.md + ADR-0001

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Private helper `runNotebooklm(args, options)` is the single invocation point for all 6 public functions. Encapsulates binary detection, spawnSync, JSON parse, error construction, rate-limit pattern matching.
- **D-02:** Helper is module-private (not exported), not reused from `lib/shared.mjs::runCmd` (too generic).
- **D-03:** Plain exported `async function` declarations, not a class.
- **D-04:** Lazy detection with per-process cache — `_binaryChecked` / `_binaryAvailable` module-scoped booleans.
- **D-05:** Importing `lib/notebooklm.mjs` on a machine without `notebooklm-py` must NOT throw.
- **D-06:** Missing binary → throw `NotebooklmNotInstalledError` with function name, binary name, and install hint `pipx install notebooklm-py` (+ `pip install --user notebooklm-py` fallback).
- **D-07:** Cache does not survive process boundaries. Tests need `_resetBinaryCache()` or dynamic import. Planner decides.
- **D-08:** Normalize + minimal validation. Extract only Phase 4-needed fields. Throw `NotebooklmCliError` if expected fields missing.
- **D-09:** Return shapes per function (see CLI Command Reference below).
- **D-10:** Raw stdout preserved on `NotebooklmCliError` in `.rawOutput` field.
- **D-11:** JSON parse via `JSON.parse(stdout)` wrapped in try/catch. SyntaxError → `NotebooklmCliError`.
- **D-12:** Hardcoded `RATE_LIMIT_PATTERNS` regex list at module level.
- **D-13:** On non-zero exit: test stderr against `RATE_LIMIT_PATTERNS`. Match → `NotebooklmRateLimitError` with `.matchedPattern` and `.stderr`.
- **D-14:** No match → generic `NotebooklmCliError` with `.command`, `.exitCode`, `.stderr`.
- **D-15:** No JS retry loop. `retry: N` option forwarded as `--retry N` on generate-class commands only (no-op for Phase 2 CRUD).

### Claude's Discretion

- Exact name of the module-private helper.
- Whether typed error classes live inline or in separate `lib/notebooklm-errors.mjs`.
- Precise format of `NotebooklmNotInstalledError.message`.
- Single parameterized stub vs multiple per-scenario stubs.
- `describe`/`it` vs flat `test()` calls in test file.
- `updateSource` orchestration style.

### Deferred Ideas (OUT OF SCOPE)

- Retry loop in Phase 2 wrapper
- `generate` family commands (audio, video, etc.)
- Binary version pinning / version check
- Output format fallback for commands without `--json`
- `listSources` result caching
- Structured logging hook
- `NOTEBOOKLM_BIN` env var
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-01 | `lib/notebooklm.mjs` exports 6 functions; each wraps spawnSync, parses JSON, returns shape or throws typed Error | CLI Command Reference provides exact invocations + verified JSON shapes |
| NBLM-02 | Binary detection via hasCommand on first call; missing → NotebooklmNotInstalledError; auth delegated | Binary Detection section; hasCommand cross-platform analysis |
| NBLM-03 | package.json stays single-dep; notebooklm-py documented as system dep | Install Matrix; verified no npm deps needed |
| NBLM-04 | Non-zero exit caught; NotebooklmCliError with .command/.exitCode/.stderr | Exit Code Matrix; verified live |
| NBLM-05 | Rate-limit detection via stderr patterns; NotebooklmRateLimitError thrown | Rate-Limit Pattern section; verified from Python source |
| NBLM-06 | tests/notebooklm.test.mjs with fake binary in PATH; covers 4 scenarios | Fake Binary Test Pattern section; verified PATH injection works |
| TEST-01 | Tests cover all exported functions | Validation Architecture section |
</phase_requirements>

---

## CLI Command Reference (per exported function)

All commands verified against `notebooklm v0.3.4` at `/opt/anaconda3/bin/notebooklm`.
[VERIFIED: live CLI execution on dev machine]

### CRITICAL: --json flag is per-command, not global

Not all commands support `--json`. This changes the strategy for `deleteSource` and `deleteSourceByTitle`.

| Function | CLI Command | --json supported | Notebook flag |
|----------|-------------|-----------------|---------------|
| createNotebook(name) | `notebooklm create "Title" --json` | YES | N/A |
| listSources(notebookId) | `notebooklm source list -n <id> --json` | YES | `-n` |
| uploadSource(notebookId, filepath) | `notebooklm source add <path> -n <id> --json` | YES | `-n` |
| deleteSource(notebookId, sourceId) | `notebooklm source delete <sourceId> -n <id> -y` | **NO** | `-n` |
| deleteSourceByTitle(notebookId, title) | `notebooklm source delete-by-title "Title" -n <id> -y` | **NO** | `-n` |
| updateSource(notebookId, sourceId, filepath) | delete + upload (two calls) | Mixed | `-n` both |

[VERIFIED: --help for each command; attempting --json on delete → "Error: No such option: --json", exit 2]

### createNotebook(name)

Command: `notebooklm create "Title" --json`

Success stdout (exit 0):
```json
{
  "notebook": {
    "id": "5710ab9f-9c71-495d-a6bf-794df28315f8",
    "title": "Title",
    "created_at": null
  }
}
```

Notes:
- `created_at` is ALWAYS `null` in JSON output — do not validate it.
- No `-n` notebook flag — create is not notebook-scoped.

Normalized return: `{ id, title }` — extract from `.notebook`.

### listSources(notebookId)

Command: `notebooklm source list -n <notebookId> --json`

Success stdout (exit 0, with sources):
```json
{
  "notebook_id": "5710ab9f-...",
  "notebook_title": "Test Notebook",
  "sources": [
    {
      "index": 1,
      "id": "8ca147aa-...",
      "title": "file.md",
      "type": "SourceType.MARKDOWN",
      "url": null,
      "status": "processing",
      "status_id": 1,
      "created_at": "2026-04-10T21:05:26"
    }
  ],
  "count": 1
}
```

Empty notebook stdout (exit 0): `{"notebook_id": "...", "notebook_title": "...", "sources": [], "count": 0}`

IMPORTANT: On a fresh/empty notebook, `notebooklm-py` emits a WARNING to STDERR:
```
WARNING [notebooklm._sources] Sources data for ... is not a list (type=NoneType), returning empty list
```
Exit code is still 0 and JSON is valid. The wrapper must NOT treat this WARNING as an error.
[VERIFIED: live CLI test — WARNING goes to stderr, JSON on stdout, exit 0]

Normalized return: `sources` array with each element as `{ id, title, status }`. Strip: `index`, `type`, `url`, `status_id`, `created_at`, `notebook_id`, `notebook_title`, `count`.

### uploadSource(notebookId, filepath)

Command: `notebooklm source add <filepath> -n <notebookId> --json`

Actual success stdout (exit 0):
```json
{
  "source": {
    "id": "8ca147aa-3267-490e-bfdc-d899ae16976f",
    "title": "file.md",
    "type": "SourceType.UNKNOWN",
    "url": null
  }
}
```

CRITICAL: SKILL.md documentation (line 198) shows a DIFFERENT shape:
```json
{"source_id": "...", "title": "...", "status": "processing"}
```
This is WRONG for v0.3.4 file sources. The actual shape:
- Is nested under `"source"` key
- Uses `"id"` (not `"source_id"` at top level)
- Does NOT include `"status"` — status is not returned at upload time
- `type` is always `"SourceType.UNKNOWN"` right after upload (before processing)
[VERIFIED: live CLI execution — corrects SKILL.md]

Normalized return: `{ sourceId, title }` — camelCase `sourceId` from `source.id`. Do NOT extract `status` (absent from upload response).

### deleteSource(notebookId, sourceId)

Command: `notebooklm source delete <sourceId> -n <notebookId> -y`

No `--json` support. Always produces text output.

Success stdout (exit 0):
```
Deleted source: 8ca147aa-3267-490e-bfdc-d899ae16976f
```

Not-found stderr (exit 1):
```
Error: No source found starting with '<sourceId>'. Run 'notebooklm source list' to see available sources.
```

Wrapper strategy:
1. Run spawnSync without `--json`
2. On exit 0: check `stdout.trim().startsWith('Deleted source:')` → extract ID → return `{ deleted: true, sourceId }`
3. On exit 1: read stderr, test against RATE_LIMIT_PATTERNS, throw appropriate error

[VERIFIED: live CLI test of both success and not-found cases]

### deleteSourceByTitle(notebookId, title)

Command: `notebooklm source delete-by-title "Exact Title" -n <notebookId> -y`

No `--json` support. Same text output format as deleteSource.

Success stdout (exit 0): `Deleted source: <id>`
Not-found stderr (exit 1): `Error: No source found with title '<title>'. Run 'notebooklm source list' to see available sources.`

Normalized return: `{ deleted: true, sourceId }` — extract ID from "Deleted source: {id}" text.

[VERIFIED: live CLI test]

### updateSource(notebookId, sourceId, filepath) — delete-then-upload

No single-call update in notebooklm-py v0.3.4. Implementation:
1. Call `spawnSync` for delete: `notebooklm source delete <sourceId> -n <notebookId> -y`
2. If delete succeeds: call `spawnSync` for add: `notebooklm source add <filepath> -n <notebookId> --json`
3. Return `uploadSource` shape: `{ sourceId, title }`

---

## updateSource Strategy Analysis

### Atomicity

This is NOT atomic. NotebookLM has no transactions.

| Scenario | Result | Recovery |
|----------|--------|----------|
| Delete succeeds, upload fails | Old source gone, new not uploaded | Phase 4 manifest marks as "not synced" → re-attempt next sync |
| Delete fails (source not found) | NotebooklmCliError thrown, upload not attempted | Safe — no data loss |
| Delete fails (rate limit) | NotebooklmRateLimitError thrown | Safe |
| Both succeed | Returns uploadSource shape | Normal |

### Risk: LOW for Phase 2 use case

Phase 4 manifest provides crash-recovery semantics. If updateSource fails mid-flight, the manifest retains the old source state and will re-attempt on next sync. No permanent data loss is possible.

### Alternative: upload-first

Upload new source first, then delete old. If delete fails → two sources with similar titles exist. Safer for data preservation but complicates the API signature (need both old-source info and new-file info). Not recommended for Phase 2 given D-09 locks delete-first.

**Recommendation:** Keep delete-first per D-09. Document partial-failure behavior in jsdoc.

---

## CLI Flag Consistency (-n / --notebook)

`-n` short form works for all source subcommands. Both `-n` and `--notebook` are accepted.

| Command | Flag | Form to use |
|---------|------|-------------|
| source list | `-n <id>` | Use `-n` |
| source add | `-n <id>` | Use `-n` |
| source delete | `-n <id>` | Use `-n` |
| source delete-by-title | `-n <id>` | Use `-n` |
| create | N/A | No notebook flag needed |

Recommendation: Use `-n` (short form) consistently for all source commands. Pass as a separate element in the args array: `['source', 'list', '-n', notebookId, '--json']`.

[VERIFIED: --help for all commands]

---

## JSON Schema Stability

### Field stability per command

**createNotebook → `notebook` object**

| Field | Always present | Action |
|-------|---------------|--------|
| `notebook.id` | YES | Extract — required |
| `notebook.title` | YES | Extract — required |
| `notebook.created_at` | YES (always null) | Strip — never validate |

**listSources → `sources` array**

| Field | Always present | Action |
|-------|---------------|--------|
| `sources` | YES (may be []) | Extract — validate is array |
| `sources[].id` | YES | Extract — required |
| `sources[].title` | YES | Extract — required |
| `sources[].status` | YES | Extract — Phase 4 needs this |
| `sources[].index` | YES | Strip |
| `sources[].type` | YES | Strip |
| `sources[].url` | YES (null for files) | Strip |
| `sources[].status_id` | YES | Strip |
| `sources[].created_at` | YES | Strip |

**uploadSource → `source` object**

| Field | Always present | Action |
|-------|---------------|--------|
| `source.id` | YES | Extract as `sourceId` (camelCase) |
| `source.title` | YES | Extract |
| `source.type` | YES (SourceType.UNKNOWN at upload) | Strip |
| `source.url` | YES (null for files) | Strip |
| `status` | NOT PRESENT | Do not extract — will throw if validated |

**Error JSON (for --json commands on failure)**

```json
{"error": true, "code": "RATE_LIMITED", "message": "..."}
```

Known `code` values (from Python source): `ERROR`, `RATE_LIMITED`, `AUTH_ERROR`, `VALIDATION_ERROR`, `CONFIG_ERROR`, `NETWORK_ERROR`, `NOTEBOOKLM_ERROR`, `UNEXPECTED_ERROR`, `GENERATION_FAILED`

[VERIFIED: cli/error_handler.py + live tests]

---

## Binary Detection Cross-Platform

### Current hasCommand (lib/shared.mjs)

```js
export function hasCommand(name) {
  return runCmd(`which ${name}`) !== null;
}
```

Uses `which` via `execSync`. POSIX-only.

| Platform | Behavior | Note |
|----------|----------|------|
| macOS | Correct — `/usr/bin/which` built-in | Verified on dev machine |
| Linux | Correct — `which` available | Standard on all distros |
| Windows | BROKEN — `which` not available | Returns null even if binary in PATH |

[VERIFIED: hasCommand correctly finds notebooklm at /opt/anaconda3/bin/notebooklm on dev machine]
[ASSUMED: Windows behavior — no Windows test environment available]

### ENOENT fallback

If `hasCommand` returns false but cache is stale, `spawnSync` returns `{status: null, error: {code: 'ENOENT'}}`.
The `runNotebooklm` helper should also check `result.error && result.error.code === 'ENOENT'` as a secondary guard.
[VERIFIED: live Node.js test — spawnSync with missing binary returns ENOENT in error.code]

### Recommendation

Use existing `hasCommand` as-is per D-04. Add Windows caveat in jsdoc. Phase 5 doctor can improve cross-platform detection.

---

## Fake Binary Test Fixture Pattern

### Verified approach: bash stub + PATH prepend

[VERIFIED: live test — spawnSync respects process.env.PATH modification; fake binary returns canned output]

### Binary creation

```js
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FIXTURE_DIR = join(tmpdir(), `notebooklm-stub-${process.pid}`);
const STUB_PATH = join(FIXTURE_DIR, 'notebooklm');

function setupStub(exitCode, stdout, stderr = '') {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const lines = [
    '#!/bin/bash',
    stderr ? `printf '%s\\n' '${stderr}' >&2` : '',
    `printf '%s\\n' '${stdout}'`,
    `exit ${exitCode}`,
  ].filter(Boolean).join('\n');
  writeFileSync(STUB_PATH, lines);
  chmodSync(STUB_PATH, 0o755);
}
```

### PATH injection — when to do it

The module caches binary detection on first call. Tests must set PATH BEFORE the module's first call, or reset the cache between scenarios.

**Two viable approaches (planner decides per D-07):**

Option A — `_resetBinaryCache()` export (recommended):
```js
// lib/notebooklm.mjs
let _binaryChecked = false;
let _binaryAvailable = false;

/** @internal test-only */
export function _resetBinaryCache() {
  _binaryChecked = false;
  _binaryAvailable = false;
}
```
Test modifies `process.env.PATH`, calls `_resetBinaryCache()`, then calls the function under test.

Option B — Dynamic import with cache-busting:
```js
const mod = await import(`../lib/notebooklm.mjs?v=${Date.now()}`);
```
More expensive, leaves no test-only export. Works because Node.js ESM caches by resolved URL including query string.

### Single parameterized stub (recommended)

Use env vars to control stub behavior per test:

```bash
#!/bin/bash
# tests/fixtures/notebooklm-stub.sh
STDOUT="${NOTEBOOKLM_STUB_STDOUT:-{}}"
STDERR="${NOTEBOOKLM_STUB_STDERR:-}"
EXIT="${NOTEBOOKLM_STUB_EXIT:-0}"

[ -n "$STDERR" ] && printf '%s\n' "$STDERR" >&2
printf '%s\n' "$STDOUT"
exit "$EXIT"
```

Each test sets env vars on the spawnSync call or on process.env before invoking the function.

### Test fixture coverage needed

| Scenario | Stub behavior |
|----------|--------------|
| Success (--json command) | exit 0, valid JSON stdout |
| Binary missing | Remove from PATH, call function, check NotebooklmNotInstalledError |
| Non-zero exit (generic) | exit 1, stderr="Error: something went wrong" |
| Rate limit (JSON mode) | exit 1, stdout='{"error":true,"code":"RATE_LIMITED","message":"Rate limited."}' |
| Rate limit (text mode, delete) | exit 1, stderr="Error: Rate limited." |
| Delete success (text output) | exit 0, stdout="Deleted source: abc123" |

---

## Rate-Limit stderr Pattern Catalog

### Critical finding: --json changes where error info appears

[VERIFIED: live CLI test — with --json, errors go to STDOUT as JSON; STDERR is empty (only Python WARNING logs may appear)]

**With --json (create, listSources, uploadSource):**
- Errors appear as JSON on STDOUT: `{"error": true, "code": "RATE_LIMITED", "message": "..."}`
- STDERR is empty
- Exit code: 1

**Without --json (deleteSource, deleteSourceByTitle):**
- Errors appear as text on STDERR
- STDOUT may be empty or partial
- Exit code: 1

### Revised error detection strategy

For --json commands:
1. Parse stdout as JSON
2. If `parsed.error === true`, check `parsed.code`:
   - `"RATE_LIMITED"` → throw `NotebooklmRateLimitError`
   - Other → throw `NotebooklmCliError`
3. Also check stderr as secondary (for edge cases)

For non-JSON commands (delete, delete-by-title):
1. Check exit code
2. On non-zero: read stderr, test against RATE_LIMIT_PATTERNS
3. Match → `NotebooklmRateLimitError`; no match → `NotebooklmCliError`

### Authoritative error codes from Python source

[VERIFIED: cli/error_handler.py v0.3.4]

- `RateLimitError` exception → JSON code `"RATE_LIMITED"` → may include `retry_after` field
- Text format (non-JSON): `"Error: Rate limited. Retry after Xs."` or `"Error: Rate limited."`

### Recommended RATE_LIMIT_PATTERNS array

```js
const RATE_LIMIT_PATTERNS = [
  // For non-JSON commands (delete, delete-by-title): matches stderr text
  /rate[\s_-]?limit/i,          // "Error: Rate limited."
  /too many requests/i,          // HTTP 429 text
  /quota\s+exceeded/i,           // Quota exhaustion

  // Legacy patterns from SKILL.md error table (edge cases)
  /No result found for RPC ID/i, // Older upstream behavior
  /GENERATION_FAILED/,           // Generate commands (not Phase 2, but keep for safety)
];
```

Note: For --json commands, the primary rate-limit check is `parsedOutput.code === 'RATE_LIMITED'` — not regex on stderr. RATE_LIMIT_PATTERNS is secondary for non-JSON commands and edge cases.

[VERIFIED: RATE_LIMITED code from error_handler.py source]
[ASSUMED: "No result found for RPC ID" — cited from SKILL.md, could not reproduce rate-limit live]

---

## Exit Code Matrix

[VERIFIED: live CLI testing + cli/error_handler.py source]

| Code | Meaning | Wrapper action |
|------|---------|----------------|
| 0 | Success | Parse stdout, return normalized shape |
| 1 | User/app error (validation, auth, rate limit, not-found) | Inspect stdout (JSON mode) or stderr (text mode), throw typed error |
| 2 | System error OR bad CLI args (e.g., passing --json to delete) | Throw NotebooklmCliError |
| 130 | Keyboard interrupt (unlikely in spawnSync) | Treat as exit 1 |

Per-function exit behavior:

| Function | Success | Error | Special |
|----------|---------|-------|---------|
| createNotebook | 0 | 1 | None |
| listSources | 0 | 1 | Exit 0 even with WARNING on stderr for empty notebook |
| uploadSource | 0 | 1 | None |
| deleteSource | 0 (text output) | 1 | No --json; parse text "Deleted source:" |
| deleteSourceByTitle | 0 (text output) | 1 | No --json; title-not-found → exit 1 on stderr |
| updateSource | 0 (if both steps succeed) | 1 (if either fails) | Partial failure possible |

**Ambiguity for delete commands:** On exit 0, verify stdout contains "Deleted source:" to catch future format changes.

---

## Install Matrix (for Phase 5 wizard prep)

For Phase 2: document as system dependency. Phase 5 will implement the wizard.

| Platform | Primary install | Fallback | Known gotchas |
|----------|----------------|----------|---------------|
| macOS (homebrew) | `pipx install notebooklm-py` | `pip install --user notebooklm-py` | pipx verified at /opt/homebrew/bin/pipx v1.7.1 |
| macOS (conda) | `pip install notebooklm-py` | `pipx install notebooklm-py` | Binary lands in conda env bin; disappears if env deactivated |
| Linux (Ubuntu/Debian) | `pipx install notebooklm-py` | `pip install --user notebooklm-py` | May need `apt install pipx` first |
| Linux (Fedora/RHEL) | `pipx install notebooklm-py` | `pip install --user notebooklm-py` | May need `dnf install pipx` |
| Windows | `pip install notebooklm-py` | `pipx install notebooklm-py` | `which` not available; `where notebooklm` is the Windows equivalent |

Key facts:
- PyPI package name: `notebooklm-py` (with hyphen)
- CLI binary name: `notebooklm` (no suffix) — this is what goes in PATH
- After install: user MUST run `notebooklm login` (interactive browser OAuth — cannot be automated)
- pipx installs to `~/.local/bin/notebooklm` — must be in PATH

[VERIFIED: dev machine macOS/conda — pipx 1.7.1, notebooklm 0.3.4]
[ASSUMED: Linux/Windows paths — training knowledge]

---

## Validation Architecture

Nyquist validation enabled (`nyquist_validation: true` in .planning/config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (Node.js native) |
| Config file | None |
| Quick run | `node --test tests/notebooklm.test.mjs` |
| Full suite | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NBLM-01 | createNotebook returns {id, title} | unit (fake binary) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-01 | listSources returns sources array | unit (fake binary) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-01 | uploadSource returns {sourceId, title} | unit (fake binary) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-01 | deleteSource returns {deleted, sourceId} | unit (fake binary text output) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-01 | deleteSourceByTitle returns {deleted, sourceId} | unit (fake binary text output) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-01 | updateSource returns uploadSource shape | unit (fake binary, two calls) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-02 | Missing binary → NotebooklmNotInstalledError with install hint | unit (empty PATH) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-03 | package.json still single-dep | static assertion | Manual grep or inline test assertion | No — Wave 0 |
| NBLM-04 | Non-zero exit → NotebooklmCliError with .command/.exitCode/.stderr | unit (fake binary exit 1) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-05 | RATE_LIMITED JSON code → NotebooklmRateLimitError | unit (fake binary rate-limit JSON) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |
| NBLM-05 | stderr rate-limit text → NotebooklmRateLimitError (delete path) | unit (fake binary rate-limit stderr) | `node --test tests/notebooklm.test.mjs` | No — Wave 0 |

### Success Criteria Observability

| Criterion | Observable Proof |
|-----------|-----------------|
| SC1: 6 exports exist | ESM import without error; each is a function |
| SC2: Single dep preserved | `JSON.parse(readFileSync('package.json')).dependencies` has exactly 1 key: `prompts` |
| SC3: Fake binary tests pass | npm test → notebooklm.test.mjs shows 0 failures |
| SC4: Missing binary → NotebooklmNotInstalledError | test asserts instanceof + message includes 'pipx install notebooklm-py' |
| SC5: No credential handling | grep for NOTEBOOKLM_API_KEY, storage_state, notebooklm login in lib/notebooklm.mjs → 0 matches |

### Boundary Conditions → Error Types

| Condition | Expected Error Type |
|-----------|-------------------|
| Binary absent from PATH | NotebooklmNotInstalledError |
| Auth expired (AUTH_ERROR code) | NotebooklmCliError |
| Rate limited (RATE_LIMITED code or pattern) | NotebooklmRateLimitError |
| Invalid JSON from CLI | NotebooklmCliError |
| Missing required field in JSON | NotebooklmCliError |
| Network offline | NotebooklmCliError |
| deleteSource: source not found | NotebooklmCliError |

### Invariants

1. package.json dependencies = {prompts: "^2.4.2"} after Phase 2
2. lib/notebooklm.mjs imports only Node builtins and lib/shared.mjs (no npm packages)
3. Importing lib/notebooklm.mjs produces no side effects (no hasCommand at import time)

### Wave 0 Gaps

- [ ] `tests/notebooklm.test.mjs` — new file, all 6 functions + error scenarios
- [ ] `tests/fixtures/notebooklm-stub.sh` — fake binary shell script
- [ ] `lib/notebooklm.mjs` — the deliverable module itself

### Sampling Rate

- Per task commit: `node --test tests/notebooklm.test.mjs`
- Per wave merge: `npm test` (must stay at 68+ passing, 0 failed)
- Phase gate: Full suite green before `/gsd-verify-work`

---

## Security Domain

security_enforcement not set to false in config — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Auth delegated entirely to notebooklm-py |
| V3 Session Management | No | Sessions in notebooklm-py storage_state.json |
| V4 Access Control | No | Single-user CLI tool |
| V5 Input Validation | Yes | notebookId/sourceId/filepath sanitization |
| V6 Cryptography | No | No crypto in Phase 2 |

### Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Command injection via notebookId/sourceId with shell metacharacters | Tampering | Use spawnSync with args array — never shell string interpolation. OS executes directly, no shell expansion. |
| Path traversal via filepath | Tampering | Resolve via path.resolve() before passing. Do not trust user-controlled strings. |
| Auth token leakage via .rawOutput on errors | Info Disclosure | rawOutput should not be logged by default; callers must opt-in. |

Key: spawnSync with args array is safe. runCmd (execSync with string) would be unsafe. This is exactly why D-02 mandates a dedicated helper — not runCmd.

---

## Project Constraints (from CLAUDE.md)

- Runtime: Node.js 18+
- Single npm dep: prompts only — no new dependencies
- ESM: .mjs extension, no build step
- Testing: node:test only, no external frameworks
- Commits: conventional commits, NO Co-Authored-By
- Code/commits: English; communication: Russian
- Style: 2-space indent, semicolons, camelCase functions, kebab-case files, c.X ANSI strings
- Errors: typed subclasses of Error, thrown not returned

---

## Open Questions

1. **--json error detection for delete commands**
   - What we know: delete and delete-by-title have no --json support; errors go to stderr as text
   - What's unclear: Can the `runNotebooklm` helper be unified, or must it branch on whether --json was passed?
   - Recommendation: Planner should have `runNotebooklm` accept a `jsonMode: boolean` option. When false, parse stdout as text and read stderr directly.

2. **Windows `which` compatibility**
   - What we know: `hasCommand` uses `which`; Windows doesn't have `which`
   - Recommendation: Use existing hasCommand as-is. Add comment. Phase 5 doctor can improve.

3. **_resetBinaryCache naming**
   - Recommendation: Use `_resetBinaryCache`. Prefix `_` signals internal use.

4. **WARNING log from source list on empty notebook**
   - What we know: notebooklm-py emits WARNING to stderr but exits 0 with valid JSON
   - Recommendation: Wrapper ignores benign stderr when exit code is 0 and stdout is valid JSON.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| notebooklm binary | All 6 functions | Yes | 0.3.4 (/opt/anaconda3/bin/notebooklm) | NotebooklmNotInstalledError |
| python3 | Install path | Yes | 3.12.7 | — |
| pipx | Install path | Yes | 1.7.1 | pip install --user |
| node 18+ | Runtime | Yes | v20.12.2 | — |
| bash | Test fixtures | Yes | macOS built-in | Windows: .bat stubs |

No blocking dependencies.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Windows: which returns null even if notebooklm in PATH | Binary Detection | Low — no Windows CI; Phase 5 can fix |
| A2 | Linux/Windows pip install paths work as documented | Install Matrix | Low for Phase 2 (just docs); Phase 5 validates |
| A3 | "No result found for RPC ID" pattern still applies in v0.3.4 | Rate-Limit Patterns | Low — RATE_LIMITED JSON code is primary detection; this is secondary |
| A4 | upload-first updateSource would be safer for atomicity | updateSource Analysis | Low — D-09 locks delete-first; only relevant if D-09 reconsidered |

---

## Sources

### Primary (HIGH confidence — verified by live execution)
- notebooklm v0.3.4 CLI at /opt/anaconda3/bin/notebooklm — all 6 commands tested live
- /opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/error_handler.py — authoritative error codes
- /opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/generate.py — GENERATION_FAILED and rate-limit patterns
- Node.js spawnSync ENOENT behavior — live test
- PATH injection for fake binary — live bash + Node.js test
- lib/shared.mjs — read directly; hasCommand confirmed

### Secondary (MEDIUM confidence — cited from upstream docs)
- ~/.claude/skills/notebooklm/SKILL.md — Quick Reference, Error Handling, Exit Codes
- .planning/phases/02-notebooklm-api-client/02-CONTEXT.md — 15 locked decisions
- ~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md — ADR-0001

### Tertiary (LOW confidence — ASSUMED)
- Windows `which` behavior
- Linux/Windows pip/pipx install paths

---

**Confidence breakdown:**
- CLI Command Reference: HIGH — all 6 commands tested live; critical discovery (no --json on delete commands) verified
- JSON Schema Stability: HIGH — verified live with correction to SKILL.md
- Error/rate-limit detection: HIGH — Python source code read directly from installed package
- Fake binary test pattern: HIGH — verified live
- Install matrix: MEDIUM (macOS verified; Linux/Windows assumed)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days — notebooklm-py is fast-moving; verify CLI flags if 2+ weeks pass)

---

## RESEARCH COMPLETE
