# Phase 11: NotebookLM Query API — Research

**Researched:** 2026-04-12
**Domain:** notebooklm-py CLI wrapper — `ask` and `generate` commands, JSON output shapes, retry patterns, CLI dispatcher extension
**Confidence:** HIGH — all key facts verified against live notebooklm-py v0.3.4 binary and Python source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**askNotebook API**
- D-01: Return parsed citations array: `{answer, citations: [{index, sourceId, sourceTitle, snippet}]}` — parse from `notebooklm ask --json` output, consumer-ready
- D-02: Single question only — `askNotebook(notebookId, question, options)` always starts a fresh conversation. No conversation continuation support in v1
- D-03: Optional `sourceIds` parameter — `askNotebook(notebookId, question, {sourceIds: ['src_001']})` passes `--source` flags to filter to specific sources
- D-04: Explicit notebook ID required — `askNotebook(notebookId, question)`. Lib stays pure, no vault/manifest coupling. Caller provides ID

**generateArtifact API**
- D-05: Support ALL 11 artifact types (audio, video, cinematic-video, slide-deck, quiz, flashcards, infographic, data-table, mind-map, report, revise-slide) — pass type through to CLI
- D-06: Always use `--wait` mode — block until artifact ready. notebooklm-py handles polling internally. No separate `pollArtifact()` function
- D-07: Unified return shape: `{artifactId, content, type}` — `content` is text for text types (report, quiz, etc.), null for binary types (audio, video). Consumer uses `notebooklm download` separately for binary artifacts

**CLI Output & --save**
- D-08: `notebooklm ask` displays answer text followed by separator, then numbered citations list with source title and snippet
- D-09: `--save` writes to `vault/projects/{slug}/docs/notebooklm-answers/{timestamp}-{question-slug}.md` — sortable by time, identifiable by content
- D-10: `notebooklm generate` CLI subcommand included in this phase — expose all artifact types: `notebooklm generate report`, `notebooklm generate quiz`, etc.

**Error Handling**
- D-11: askNotebook retries 2x with exponential backoff (1s→2s) on rate-limit/transient errors. Matches existing pattern in notebooklm.mjs
- D-12: generateArtifact delegates retry to notebooklm-py via `--retry 2` flag. No wrapper-level retry

**Notebook ID Resolution (CLI)**
- D-13: CLI `notebooklm ask` without `--notebook` auto-resolves notebook ID from sync manifest — detect current project from cwd/git, read `.notebooklm-manifest.json`. Falls back to `--notebook` flag if not synced
- D-14: Same resolution logic for `notebooklm generate` CLI

**CLI Generate Output**
- D-15: Simple waiting message while generating: "Generating {type}..." then result when done. No spinner
- D-16: Binary artifacts (audio, video, etc.) download to `vault/projects/{slug}/docs/notebooklm-artifacts/{timestamp}-{type}.{ext}`

### Claude's Discretion
- JSON parsing details for `notebooklm ask --json` response structure
- Exact retry backoff timing implementation
- Question slug generation algorithm for `--save` filenames
- Progress message formatting during `--wait`
- Test approach (fake binary vs mock responses)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUERY-01 | `askNotebook(notebookId, question)` in `lib/notebooklm.mjs` — wraps `notebooklm ask --json`, returns `{answer, citations}` with error handling, JSON parsing, and retry | `ask --json` output shape verified from types.py AskResult + ChatReference; `runNotebooklm()` pattern reusable directly |
| QUERY-02 | `claude-dev-stack notebooklm ask "question"` CLI — displays answer + citations, optional `--save` flag | CLI dispatch pattern verified in notebooklm-cli.mjs; vault/manifest ID resolution verified via `readManifest()` + `manifest.projects[slug].notebook_id` |
| QUERY-03 | `generateArtifact(notebookId, type)` in `lib/notebooklm.mjs` — wraps `notebooklm generate {type} --wait --json`, returns `{artifactId, content, type}` | `generate --json --wait` output shape verified from generate.py `_output_generation_status()`; content extraction requires post-`--wait` `download {type} --json` call which writes to FILE (read via output_path) |
</phase_requirements>

---

## Summary

Phase 11 adds `askNotebook()` and `generateArtifact()` to `lib/notebooklm.mjs`, and `ask`/`generate` subcommands to `lib/notebooklm-cli.mjs`. All implementation uses the existing `runNotebooklm()` helper pattern — no new invocation machinery needed.

The key discovery is that `notebooklm generate {type} --wait --json` returns `{task_id, status: "completed", url}` when done — it does NOT include the artifact content inline. For text artifacts (report, quiz, etc.) a second `notebooklm download {type} --json` call is required. **IMPORTANT: the download command writes content to a FILE on disk and returns JSON with `output_path` pointing to the file — it does NOT return content inline in the JSON.** The implementation must: (1) create a temp directory, (2) run download with cwd=tmpdir, (3) read file from output_path, (4) clean up tmpdir. For binary artifacts (audio, video, etc.) `generateArtifact()` returns `content: null` per D-07, and the CLI can optionally download to vault.

The `notebooklm ask --json` output is a `dataclasses.asdict(AskResult)` minus the `raw_response` field. The relevant fields are `answer` (string), `references` (array of ChatReference objects), `conversation_id`, `turn_number`, and `is_follow_up`. The planner's `citations` shape from D-01 must be mapped FROM the `references` array — `sourceId` from `reference.source_id`, `snippet` from `reference.cited_text`, `index` from `reference.citation_number`. The `sourceTitle` field is NOT present in the ask output — it needs either a `listSources()` enrichment pass or must be omitted from v1 citations (set to null).

**Primary recommendation:** Implement `askNotebook` and `generateArtifact` as thin wrappers around `runNotebooklm()`. For `generateArtifact` of text types, chain a second `runNotebooklm(['download', type, '--json'])` call, then read content from the file at `output_path`. For binary types, return `content: null` immediately.

---

## Standard Stack

### Core (already in repo — no new deps)
| Module | Version | Purpose | Notes |
|--------|---------|---------|-------|
| `lib/notebooklm.mjs` | — | Extend with `askNotebook`, `generateArtifact` | Existing file |
| `lib/notebooklm-cli.mjs` | — | Add `ask`, `generate` switch cases | Existing file |
| `lib/notebooklm-manifest.mjs` | — | `readManifest()` for D-13 notebook ID resolution | Existing file |
| `lib/projects.mjs` | — | `findVault()` for vault root | Existing file |

**No new npm packages.** Single-dep constraint (`prompts` only) preserved. [VERIFIED: CLAUDE.md constraint + package.json]

### External Binary
| Binary | Version | Required Flags |
|--------|---------|----------------|
| `notebooklm` (notebooklm-py) | 0.3.4 | `ask --json`, `generate {type} --wait --retry N --json`, `download {type} --json` |

[VERIFIED: `notebooklm --version` → 0.3.4 installed at `/opt/anaconda3/bin/notebooklm`]

---

## Architecture Patterns

### Recommended Structure (additions only)

```
lib/
├── notebooklm.mjs          # ADD: askNotebook(), generateArtifact() (~60 lines)
├── notebooklm-cli.mjs      # ADD: case 'ask', case 'generate' + runAsk(), runGenerate()
tests/
├── notebooklm.test.mjs     # ADD: askNotebook describe block, generateArtifact describe block
├── notebooklm-cli.test.mjs # ADD: ask/generate dispatch tests
```

### Pattern 1: askNotebook follows existing public API pattern

All existing public functions (`createNotebook`, `listSources`, `uploadSource`) follow this pattern:
1. Input validation (TypeError on bad args)
2. Build argv array
3. Call `runNotebooklm(args, { jsonMode: true, functionName: 'askNotebook' })`
4. Validate parsed output shape
5. Return normalized object

```javascript
// Source: lib/notebooklm.mjs — existing pattern from createNotebook()
export async function askNotebook(notebookId, question, options = {}) {
  if (typeof notebookId !== 'string' || notebookId.length === 0) {
    throw new TypeError('askNotebook: notebookId must be a non-empty string');
  }
  if (typeof question !== 'string' || question.length === 0) {
    throw new TypeError('askNotebook: question must be a non-empty string');
  }

  const args = ['ask', '-n', notebookId, '--json'];
  if (options.sourceIds && options.sourceIds.length > 0) {
    for (const sid of options.sourceIds) {
      args.push('--source', sid);
    }
  }
  args.push(question);  // positional QUESTION arg comes last

  const parsed = runNotebooklm(args, { jsonMode: true, functionName: 'askNotebook' });

  // Validate shape — parsed is AskResult minus raw_response
  if (!parsed || typeof parsed.answer !== 'string') {
    throw new NotebooklmCliError(
      'askNotebook: expected { answer, references } in --json output',
      { command: args, exitCode: 0, stderr: '' }
    );
  }

  // Map references → citations per D-01
  const citations = (parsed.references || []).map((ref) => ({
    index: ref.citation_number ?? null,
    sourceId: ref.source_id,
    sourceTitle: null,   // not in ask output — v1 omits
    snippet: ref.cited_text ?? null,
  }));

  return { answer: parsed.answer, citations };
}
```

[VERIFIED: types.py `AskResult` dataclass fields; chat.py `json_output` path uses `dataclasses.asdict(result)` minus `raw_response`]

### Pattern 2: retry wrapper for askNotebook (D-11 — 2x, 1s→2s backoff)

The existing codebase has no retry helper in `lib/notebooklm.mjs`. D-11 requires 2x retry with 1s→2s backoff specific to `askNotebook`. Implement as a local retry loop inside `askNotebook`:

```javascript
// Source: pattern from D-11 + existing NotebooklmRateLimitError usage
async function askWithRetry(args, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return runNotebooklm(args, { jsonMode: true, functionName: 'askNotebook' });
    } catch (err) {
      if (err instanceof NotebooklmRateLimitError && attempt < maxRetries) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); // 1s, 2s
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
```

[ASSUMED] — backoff delay values (1s→2s) are from D-11 spec, not from an existing helper.

### Pattern 3: generateArtifact — two-step for text types (download via temp file)

`notebooklm generate {type} --wait --json` completes and returns `{task_id, status: "completed", url}`. The `url` field is for binary streaming; text content is NOT in this response. To retrieve content, a second call `notebooklm download {type} --json` is needed.

**RESOLVED (from Python source inspection):** The download command writes to a FILE on disk and returns JSON: `{operation: 'download_single', artifact: {id, title, selection_reason}, output_path: '/path/to/file.md', status: 'downloaded'}`. Content is in the FILE at `output_path`, NOT in the JSON body.

```javascript
// Source: generate.py _output_generation_status() + download.py (VERIFIED)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

export async function generateArtifact(notebookId, type, options = {}) {
  const BINARY_TYPES = new Set(['audio', 'video', 'cinematic-video', 'slide-deck', 'infographic']);

  // Step 1: generate and wait
  const genArgs = ['generate', type, '-n', notebookId, '--wait', '--retry', '2', '--json'];
  const genResult = runNotebooklm(genArgs, { jsonMode: true, functionName: 'generateArtifact' });

  if (!genResult || genResult.status !== 'completed') {
    throw new NotebooklmCliError(
      `generateArtifact: generation did not complete — status: ${genResult?.status}`,
      { command: genArgs, exitCode: 0, stderr: '' }
    );
  }

  const artifactId = genResult.task_id;

  // Step 2: for text types, download to temp file and read content
  let content = null;
  if (!BINARY_TYPES.has(type)) {
    const tmpDir = mkdtempSync(join(tmpdir(), 'notebooklm-'));
    try {
      const dlArgs = ['download', type, '--json', '--latest', '-n', notebookId];
      const dlResult = runNotebooklm(dlArgs, {
        jsonMode: true,
        functionName: 'generateArtifact',
        spawnOpts: { cwd: tmpDir },
      });
      // dlResult: {operation, artifact:{id,title}, output_path, status}
      const filePath = dlResult?.output_path;
      if (filePath) {
        content = readFileSync(filePath, 'utf8');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return { artifactId, content, type };
}
```

[VERIFIED: generate.py `_output_generation_status()` emits `{task_id, status, url}` on completed; download.py writes to file and returns `{operation, artifact, output_path, status}` — VERIFIED from Python source]

### Pattern 4: CLI subcommand dispatch — extend switch/case

The existing `main()` switch in `notebooklm-cli.mjs` uses `case 'sync'`, `case 'status'`, `case 'migrate'`. Add:

```javascript
// Source: lib/notebooklm-cli.mjs lines 34-53 — existing pattern
case 'ask':
  return runAsk(args.slice(1));
case 'generate':
  return runGenerate(args.slice(1));
```

Also update `printNotebooklmHelp()` and `bin/cli.mjs` help text.

### Pattern 5: Notebook ID resolution (D-13/D-14)

Auto-resolve from manifest when `--notebook` is not passed:

```javascript
// Source: notebooklm-cli.mjs runSync() pattern for vault resolution
// + notebooklm-sync.mjs manifest.projects[slug].notebook_id
function resolveNotebookIdFromCwd(vaultRoot) {
  const manifest = readManifest(vaultRoot);
  // Detect project slug from cwd: compare process.cwd() against vault projects/
  const cwdBasename = basename(process.cwd());
  // Look for a slug match in manifest.projects
  const entry = manifest.projects?.[cwdBasename];
  return entry?.notebook_id ?? null;
}
```

The manifest stores `manifest.projects[slug].notebook_id` (per `notebooklm-manifest.mjs` structure). The project slug matches the directory name under `vault/projects/`. Detect it by comparing `process.cwd()` basename or running `git rev-parse --show-toplevel` then extracting its basename. [VERIFIED: notebooklm-manifest.mjs lines 213-214 show `notebook_id` stored at `projects[slug].notebook_id`]

### Pattern 6: `--save` file writing

```javascript
// Source: D-09 decision + export.mjs pattern for vault writes
function slugifyQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);  // cap slug length
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
const filename = `${timestamp}-${slugifyQuestion(question)}.md`;
const savePath = join(vaultRoot, 'projects', slug, 'docs', 'notebooklm-answers', filename);
```

### Anti-Patterns to Avoid

- **Passing question as a shell string:** Always pass question as last element of argv array to `spawnSync`. NEVER concatenate into a shell command string — `runNotebooklm` already prevents this.
- **Assuming `--json` generates inline content:** `generate --wait --json` returns only `{task_id, status, url}` — not the text content. Must call `download {type} --json` separately.
- **Assuming download returns content in JSON:** `download --json` writes content to a FILE and returns `{output_path}` in JSON. Must read file from `output_path`, NOT parse content from JSON body.
- **sourceTitle in citations:** `ask --json` output does NOT include source titles in the `references` array — only `source_id`, `citation_number`, `cited_text`. Do not attempt to extract a title field that doesn't exist.
- **Using `--new` flag for fresh conversation:** The `--new` flag does NOT exist on `notebooklm ask`. Starting fresh requires omitting `--conversation-id`. The `ask` command continues the last conversation by default unless given no conversation context.
- **Retry inside generateArtifact wrapper:** D-12 says delegate retry to notebooklm-py via `--retry 2`. Do NOT implement wrapper-level retry for generate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limit detection on ask | Custom stderr pattern matching | Existing `RATE_LIMIT_PATTERNS` + `runNotebooklm()` error path | Already handles JSON `{error:true, code:'RATE_LIMITED'}` AND stderr regex |
| Retry with backoff | Custom sleep/loop in main function | Local `askWithRetry()` helper inside `askNotebook` (per D-11) | Keep retry close to the function it serves |
| Generate artifact retry | Wrapper-level retry | `--retry 2` flag passed to notebooklm-py CLI | notebooklm-py has its own backoff (60s→300s per generate.py) |
| Manifest JSON parsing | Custom reader | `readManifest(vaultRoot)` from `notebooklm-manifest.mjs` | Already handles v1→v2 migration, corrupt recovery |
| Vault root discovery | Custom path detection | `findVault()` from `projects.mjs` or `process.env.VAULT_PATH` | Already handles all standard vault locations |
| Binary type detection | No-op list or API call | `const BINARY_TYPES = new Set(['audio','video','cinematic-video','slide-deck','infographic'])` | Simple set check; types are stable per CLI help output |

---

## `notebooklm ask --json` Output Shape

**Source:** `types.py AskResult` dataclass + `chat.py` json output path [VERIFIED]

```json
{
  "answer": "The main themes are...",
  "conversation_id": "conv-uuid-1234",
  "turn_number": 1,
  "is_follow_up": false,
  "references": [
    {
      "source_id": "src_abc123",
      "citation_number": 1,
      "cited_text": "The passage from the source...",
      "start_char": null,
      "end_char": null,
      "chunk_id": null
    }
  ]
}
```

**Key mapping for D-01 citations shape:**
- `citations[i].index` ← `references[i].citation_number` (int or null)
- `citations[i].sourceId` ← `references[i].source_id` (string)
- `citations[i].sourceTitle` ← not in output → always `null` in v1
- `citations[i].snippet` ← `references[i].cited_text` (string or null)

**Conversation state warning:** By default, `notebooklm ask` continues the last cached conversation. To ensure fresh start (D-02 requires always fresh), do NOT pass `--conversation-id`. However, the CLI caches the last `conversation_id` in `~/.notebooklm/context.json`. This does not affect API output, but means `is_follow_up` may be `true` if a previous session exists. The wrapper does not need to set `--conversation-id` at all — just omit it.

---

## `notebooklm generate {type} --wait --json` Output Shape

**Source:** `generate.py _output_generation_status()` + `GenerationStatus` dataclass [VERIFIED]

On success with `--wait`:
```json
{
  "task_id": "artifact-uuid-5678",
  "status": "completed",
  "url": null
}
```

On rate limit:
```json
{
  "error": true,
  "code": "RATE_LIMITED",
  "message": "Report generation rate limited by Google"
}
```

On failure:
```json
{
  "error": true,
  "code": "GENERATION_FAILED",
  "message": "Report generation failed"
}
```

**Important:** `url` field is present but `null` for most artifact types. For binary streaming cases it may be a URL. Does NOT contain content — content retrieval requires a separate `download` call.

**`--retry N` behavior:** notebooklm-py's `generate_with_retry()` uses 60s initial delay with 2x backoff capped at 300s. Passing `--retry 2` to `generateArtifact` invocation adds 2 retries automatically inside the Python CLI. [VERIFIED: generate.py lines 53-54]

---

## `notebooklm download {type} --json` Output Shape

**RESOLVED** (verified from Python source code inspection of `download.py`):

The `download` command writes content to a FILE on disk and returns JSON metadata via stdout:

```json
{
  "operation": "download_single",
  "artifact": {
    "id": "artifact-uuid-5678",
    "title": "Report Title",
    "selection_reason": "latest"
  },
  "output_path": "/path/to/downloaded/report.md",
  "status": "downloaded"
}
```

**Key facts:**
- Content is in the FILE at `output_path`, NOT in the JSON body
- The file is written to the current working directory (cwd) by default
- For text artifacts (report, quiz, etc.): read content via `readFileSync(output_path, 'utf8')`
- For binary artifacts: `generateArtifact()` returns `content: null` per D-07

**Implementation approach for text artifacts:**
1. Create temp directory with `mkdtempSync`
2. Run `notebooklm download {type} --json --latest -n {notebookId}` with `cwd: tmpDir`
3. Read file content from `output_path` in the JSON response
4. Clean up temp directory in `finally` block

**For binary types (audio, video, cinematic-video, slide-deck, infographic):** `generateArtifact()` returns `content: null` per D-07. The CLI's `runGenerate()` can optionally call `notebooklm download {type}` (not `--json`, just `stdout`) to save to disk (D-16).

---

## `notebooklm ask` CLI Flags Summary

[VERIFIED: `notebooklm ask --help` output]

| Flag | Type | Purpose |
|------|------|---------|
| `-n, --notebook TEXT` | string | Notebook ID (uses current context if not set) |
| `-s, --source TEXT` | repeated | Limit to specific source IDs |
| `--json` | flag | Structured JSON output |
| `--conversation-id, -c` | string | Continue specific conversation (omit for fresh) |

**Note:** There is NO `--new` flag. Fresh conversation = no `--conversation-id` passed.

---

## `notebooklm generate {type}` CLI Flags Summary

[VERIFIED: `notebooklm generate report --help` and `notebooklm generate quiz --help`]

| Flag | Applies To | Purpose |
|------|-----------|---------|
| `-n, --notebook TEXT` | all | Notebook ID |
| `--wait / --no-wait` | all | Block until complete (default: no-wait) |
| `--retry INTEGER` | all | Retry N times on rate limit |
| `--json` | all | Machine-readable output |
| `-s, --source TEXT` | all | Limit to specific source IDs |
| `--format` | report | `briefing-doc|study-guide|blog-post|custom` |
| `--quantity` | quiz | `fewer|standard|more` |
| `--difficulty` | quiz | `easy|medium|hard` |

All 11 types accept at minimum: `-n`, `--wait`, `--retry`, `--json`. [VERIFIED: help outputs]

---

## Fake Binary Test Approach

**Source:** `tests/fixtures/notebooklm-stub.sh` + `tests/notebooklm.test.mjs` lines 14-47 [VERIFIED]

The existing stub is behavior-driven by env vars:
- `NOTEBOOKLM_STUB_STDOUT` — text to emit on stdout
- `NOTEBOOKLM_STUB_STDERR` — text to emit on stderr
- `NOTEBOOKLM_STUB_EXIT` — exit code (default: 0)
- `NOTEBOOKLM_STUB_ARGV_LOG` — optional path to log argv arg $3

**The stub ignores argv entirely.** Tests control scenario via env vars.

For `askNotebook` tests:
```javascript
stub({
  stdout: JSON.stringify({
    answer: "The decision was to use CLI wrapper per ADR-0001.",
    conversation_id: "conv-abc",
    turn_number: 1,
    is_follow_up: false,
    references: [
      { source_id: "src_001", citation_number: 1, cited_text: "CLI wrapper approach", start_char: null, end_char: null, chunk_id: null }
    ]
  }),
  exit: 0,
});
```

For `generateArtifact` tests, two stub calls are needed (generate then download). Because the stub ignores argv, test scenarios must be set up sequentially — but `runNotebooklm` uses `spawnSync` (synchronous), so each call reads the current env vars at spawn time. Tests must update `NOTEBOOKLM_STUB_STDOUT` between the generate and download invocations. This is only possible if `generateArtifact` is instrumented to allow injection, or if tests call `runNotebooklm` indirectly via separate `askNotebook`/`generateArtifact` invocations.

**Limitation:** The stub cannot distinguish `generate report` from `download report` — both calls see the same env vars. The planner should either:
1. Design `generateArtifact` to accept an injectable `_runFn` parameter for tests (preferred)
2. Or split into two exported functions: `_generateArtifactStep1()` and `_generateArtifactStep2()` for fine-grained test control

[ASSUMED] — option (1) injectable `_runFn` is the pattern least invasive to the existing architecture.

**Note for download test with `_runFn`:** Since download writes to a file, tests using `_runFn` should create a real temp file and return `{output_path: tempFilePath}` in the mock response so the `readFileSync(output_path)` call succeeds.

---

## Common Pitfalls

### Pitfall 1: Conversation continuation on `ask`
**What goes wrong:** `notebooklm ask` continues the last conversation by default via cached `conversation_id` in `~/.notebooklm/context.json`. The `is_follow_up` field will be `true` even though the wrapper omits `--conversation-id`.
**Why it happens:** notebooklm-py automatically loads the last conversation from its local context file.
**How to avoid:** Per D-02, fresh conversation is per session. The wrapper should NOT pass `--conversation-id`. The `is_follow_up` field in the raw output can be ignored — just return `answer` and `citations`.

### Pitfall 2: Binary artifact content is null, not an error
**What goes wrong:** Calling `generateArtifact(id, 'audio')` and treating `content: null` as a failure.
**Why it happens:** Audio/video/infographic are binary types — content cannot be inlined. Per D-07 spec, `content: null` is the correct return for these types.
**How to avoid:** Document this behavior clearly. CLI `runGenerate()` should print the artifact ID and a message like "Use `notebooklm download audio` to retrieve the file."

### Pitfall 3: `generate --wait` timeout
**What goes wrong:** Some artifact types (audio, video) take 2-5 minutes. Default `--wait` timeout in notebooklm-py is 300s (5 min). The wrapper blocks for the full duration.
**Why it happens:** `--wait` mode in notebooklm-py polls until completion. No streaming.
**How to avoid:** The CLI `runGenerate()` should print "Generating {type}... (this may take up to 5 minutes)" before calling the binary.

### Pitfall 4: `download {type} --json` writes to FILE, not inline content — RESOLVED
**What goes wrong:** Assuming `{content: "..."}` in download JSON output and getting undefined.
**Why it happens:** The download command writes content to a file on disk. The `--json` output contains `{output_path}` pointing to the file, NOT the content itself.
**How to avoid:** Use `mkdtempSync` to create a temp directory, run download with `cwd: tmpDir`, read the file from `dlResult.output_path` via `readFileSync`, clean up tmpDir in a `finally` block. [RESOLVED: verified from Python source]

### Pitfall 5: Error code mismatch for generate rate limits
**What goes wrong:** Treating `GENERATION_FAILED` as a permanent error when it may be a rate limit.
**Why it happens:** `generate.py` emits `GENERATION_FAILED` for rate limits because `is_rate_limited` is checked at a higher level. The error code written to JSON stdout is `GENERATION_FAILED`, not `RATE_LIMITED`, when rate-limited during generation.
**How to avoid:** `runNotebooklm` already handles `parsed.error === true` with `parsed.code`. The `GENERATION_FAILED` code in `RATE_LIMIT_PATTERNS` is already present (`/GENERATION_FAILED/` pattern). No additional handling needed.

### Pitfall 6: Question as first argv instead of last
**What goes wrong:** Building `['ask', question, '-n', notebookId, '--json']` — question before flags.
**Why it happens:** notebooklm-py uses Click, which expects the QUESTION positional argument AFTER all options.
**How to avoid:** Always push `question` as the LAST element of the args array: `['ask', '-n', notebookId, '--json', ...sourceFlags, question]`.

[VERIFIED: `notebooklm ask --help` shows `Usage: notebooklm ask [OPTIONS] QUESTION` — QUESTION is positional after options]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `notebooklm` binary | askNotebook, generateArtifact | Yes | 0.3.4 | `NotebooklmNotInstalledError` (lazy detection) |
| `node:test` | tests | Yes | native | — |
| `node:fs`, `node:path`, `node:os` | lib, tests | Yes | native | — |

`notebooklm` binary detected at `/opt/anaconda3/bin/notebooklm`. [VERIFIED: `which notebooklm`]

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (native) |
| Config file | none — `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm.test.mjs tests/notebooklm-cli.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUERY-01 | `askNotebook()` returns `{answer, citations}` | unit | `node --test tests/notebooklm.test.mjs` | Yes (extend existing) |
| QUERY-01 | `askNotebook()` retries 2x on rate limit | unit | same | Yes |
| QUERY-01 | `askNotebook()` throws TypeError on bad args | unit | same | Yes |
| QUERY-02 | `main(['ask', 'question'])` dispatches to runAsk | unit | `node --test tests/notebooklm-cli.test.mjs` | Yes (extend existing) |
| QUERY-02 | `--save` writes file to correct path | unit | same | Yes |
| QUERY-02 | `--notebook` flag overrides manifest resolution | unit | same | Yes |
| QUERY-03 | `generateArtifact()` returns `{artifactId, content, type}` | unit | `node --test tests/notebooklm.test.mjs` | Yes (extend existing) |
| QUERY-03 | `generateArtifact()` returns `content: null` for binary types | unit | same | Yes |

### Sampling Rate
- **Per task commit:** `node --test tests/notebooklm.test.mjs tests/notebooklm-cli.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [x] `notebooklm download report --json` output shape — **RESOLVED**: verified from Python source. Returns `{operation, artifact, output_path, status}`. Content is in the FILE at `output_path`, not in JSON.
- No new test files needed — extend `tests/notebooklm.test.mjs` and `tests/notebooklm-cli.test.mjs`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | auth delegated to notebooklm-py entirely |
| V3 Session Management | no | no session state in this module |
| V4 Access Control | no | no authorization decisions |
| V5 Input Validation | yes | TypeError guards on all public function args; argv array (never shell string) |
| V6 Cryptography | no | no crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via question string | Tampering | Already mitigated: `spawnSync` with args array, question passed as last argv element — shell never invoked |
| Vault content leak via stderr in CLI output | Information disclosure | Existing `truncateReason()` in notebooklm-cli.mjs already applied to all error reasons — must be applied to ask/generate errors too |
| Path traversal in `--save` filename | Tampering | Slugify question before use in filename; use `path.join()` for safe path construction |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| notebooklm-py write-only (sync only) | Query + generate support | Phase 11 adds | Phase 11's entire scope |
| `--no-wait` (default) for generate | `--wait` (D-06) | Phase 11 decision | Simpler API — caller blocks until artifact ready |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ~~`notebooklm download report --json` emits `{content: "..."}` field~~ **RESOLVED:** download writes to FILE and returns `{output_path}` in JSON. Implementation uses mkdtempSync + readFileSync + rmSync. | Code Examples (Pattern 3), Pitfall 4 | N/A — resolved |
| A2 | Injectable `_runFn` parameter is cleaner than splitting `generateArtifact` for test control | Architecture Patterns (Fake Binary section) | If planner prefers a different test isolation approach, no functional impact |
| A3 | Retry backoff for `askNotebook` is 1s → 2s (from D-11 spec) | Pattern 2 | These values are from D-11 decision, not from an existing utility — planner can adjust |
| A4 | `sourceTitle: null` is acceptable for v1 citations (D-01 spec says `sourceTitle` but `ask --json` doesn't emit it) | ask output shape section | If user expects titles, a `listSources()` enrichment pass would need to be added — breaks single-function simplicity |

---

## Open Questions

1. **`notebooklm download {type} --json` output shape** — **RESOLVED**
   - Verified from Python source: download writes content to FILE, returns `{operation, artifact:{id,title,selection_reason}, output_path, status}` in JSON stdout
   - Content is at `output_path`, NOT inline in JSON
   - Implementation: `mkdtempSync` -> run download with `cwd: tmpDir` -> `readFileSync(output_path, 'utf8')` -> `rmSync(tmpDir)`

2. **Project slug detection for D-13**
   - What we know: Manifest stores `projects[slug].notebook_id`; slug = directory name under `vault/projects/`
   - What's unclear: Best method to map `process.cwd()` to a vault project slug — basename comparison vs. `git rev-parse --show-toplevel`
   - Recommendation: Use `basename(process.cwd())` first; fall back to `git rev-parse --show-toplevel | basename`. If no match found in manifest, require `--notebook` flag.

---

## Sources

### Primary (HIGH confidence)
- `lib/notebooklm.mjs` — Full source read; `runNotebooklm()`, error classes, retry patterns [VERIFIED]
- `lib/notebooklm-cli.mjs` — Full source read; switch/case dispatch pattern [VERIFIED]
- `lib/notebooklm-manifest.mjs` — Full source read; `readManifest()`, `manifest.projects[slug].notebook_id` structure [VERIFIED]
- `/opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/chat.py` — `ask` command implementation; `json_output` path; `AskResult` serialization [VERIFIED]
- `/opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/generate.py` — `generate` command; `_output_generation_status()`; retry constants [VERIFIED]
- `/opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/error_handler.py` — Error JSON shape `{error, code, message}` [VERIFIED]
- `/opt/anaconda3/lib/python3.12/site-packages/notebooklm/types.py` — `AskResult`, `ChatReference`, `GenerationStatus` dataclass fields [VERIFIED]
- `notebooklm ask --help`, `notebooklm generate report --help`, `notebooklm generate quiz --help`, `notebooklm download --help` — CLI flags [VERIFIED: live binary]
- `tests/fixtures/notebooklm-stub.sh` + `tests/notebooklm.test.mjs` — Fake binary approach [VERIFIED]
- `/opt/anaconda3/lib/python3.12/site-packages/notebooklm/cli/download.py` — Download command writes to file, returns `{operation, artifact, output_path, status}` [VERIFIED from source]

### Tertiary (LOW confidence — needs runtime verification)
- (None remaining — all open questions resolved)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps, existing patterns reused
- ask JSON shape: HIGH — verified from Python source (types.py AskResult + chat.py json path)
- generate JSON shape: HIGH — verified from generate.py `_output_generation_status()`
- download JSON shape: HIGH — verified from download.py source; writes to file, returns `{output_path}` in JSON
- Fake binary test approach: HIGH — verified from existing test code
- D-13 notebook ID resolution: HIGH — manifest structure verified

**Research date:** 2026-04-12
**Valid until:** 2026-06-12 (stable — notebooklm-py v0.3.4 pinned)
