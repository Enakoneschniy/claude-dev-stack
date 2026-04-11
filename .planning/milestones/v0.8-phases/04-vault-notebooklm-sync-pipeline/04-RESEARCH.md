# Phase 4: Vault → NotebookLM Sync Pipeline — Research

**Researched:** 2026-04-11
**Domain:** Vault filesystem walking + NotebookLM CLI orchestration + manifest-driven change detection
**Confidence:** HIGH (runtime-verified against live CLI and real vault)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-20 — all implementation decisions are locked. See `04-CONTEXT.md §decisions` for full text.
Key locked choices relevant to planning:
- Filename generation: D-01 sessions pass-through, D-02 ADRs regex, D-03 docs prefix, D-04 context.md fixed
- Error orchestration: D-07 per-file continue, D-08 rate-limit abort, D-09 listNotebooks+find+create
- Session semantics: D-12 presence-not-hash for sessions, D-13 delete-then-upload for non-sessions
- Module API: D-15 single export `syncVault({vaultRoot?,notebookName?,dryRun?})`, D-16 stats return shape
- Walker: D-17 inline readdirSync, D-18 four category walk, D-19 hard-skip shared/meta, D-20 dryRun

### Claude's Discretion
- Exact names of private helpers (`walkProjectFiles`, `buildTitle`, `ensureNotebook`, `syncOneFile`)
- How `errors[].reason` is derived from thrown errors
- Whether to memoize `hashFile` results within a single sync run
- How `dryRun` interacts with notebook existence (call listNotebooks or skip entirely)
- Test fixture layout for multi-project vaults
- Whether `findVault()` null handling throws or returns special stats shape
- How `listNotebooks` handles >1 notebook with the same title

### Deferred Ideas (OUT OF SCOPE)
- CLI subcommand routing (Phase 5)
- Session-end trigger (Phase 5)
- Install wizard integration (Phase 5)
- doctor.mjs health check (Phase 5)
- Log file (Phase 5)
- Auth precondition check (Phase 5)
- Progress streaming
- Parallel uploads (deferred to v2)
- Notebook cleanup / stale source removal (deferred)
- Session re-sync command (deferred)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-07 | Walk `vault/projects/*/sessions/*.md`, upload each as `{project}__{YYYY-MM-DD}-{slug}.md`; session-present check not hash | D-01/D-12: verified session filenames match convention; `readdirSync` + `.endsWith('.md')` filter |
| NBLM-08 | Walk `vault/projects/*/decisions/*.md` (ADRs), upload as `{project}__ADR-{NNNN}-{slug}.md` with replace-by-filename | D-02: regex `^(\d{4})-(.+)\.md$`; delete-then-upload verified against live CLI |
| NBLM-09 | Walk `vault/projects/*/docs/*.md`, upload as `{project}__doc-{basename}` with replace-by-filename | D-03: deterministic double-prefix accepted |
| NBLM-10 | Upload `vault/projects/*/context.md` as `{project}__context.md` with replace-by-filename | D-04: fixed path, no parsing |
| NBLM-11 | `shared/` and `meta/` never synced; non-.md files silently ignored | D-19: walker only descends `vault/projects/*/`, `.md` filter |
| NBLM-12 | Auto-create target notebook if absent; use single shared `claude-dev-stack-vault` notebook | D-09/D-10: listNotebooks (7th fn) + createNotebook; verified create returns correct shape |
| NBLM-13 | Notebook name configurable via `NOTEBOOKLM_NOTEBOOK_NAME` env var | D-15: defaulted in syncVault options; env var read at call time |
</phase_requirements>

---

## Summary

Phase 4 builds `lib/notebooklm-sync.mjs`, the orchestration layer that connects the vault filesystem (via Phase 3 manifest primitives) to the NotebookLM CLI wrapper (via Phase 2's six public functions plus a new seventh `listNotebooks`). All 20 implementation decisions are locked; research focuses on runtime-verifying CLI behaviors that were previously only documented, resolving "Claude's Discretion" questions, and mapping the test strategy.

The most important empirical finding: `notebooklm source delete-by-title` on a nonexistent title exits with code 1 and writes the error to **stdout** (not stderr), and the current Phase 2 wrapper (`runNotebooklm` text-mode) will throw a generic `NotebooklmCliError` in this case. The swallow-and-continue policy (D-13 step 5) is implementable by catching `NotebooklmCliError` (excluding rate-limit) from `deleteSourceByTitle` before calling `uploadSource`. Additionally, `notebooklm create` silently creates duplicate notebooks with the same title, making the D-09 first-match or newest-match decision non-trivial — research recommends throwing loudly on multiple matches.

**Primary recommendation:** Implement `syncOneFile` with a `try/catch NotebooklmCliError` wrapper around `deleteSourceByTitle`, and implement `listNotebooks` to throw `NotebooklmCliError` when multiple notebooks share the same title (not silent first-match).

---

## Runtime-Verified Findings

### 1. `notebooklm list --json` exact output shape

**Command run:** `/opt/anaconda3/bin/notebooklm list --json`

**Empty vault (0 notebooks):**
```json
{
  "notebooks": [],
  "count": 0
}
```
Exit code: 0. [VERIFIED: live CLI run 2026-04-11]

**With notebooks:**
```json
{
  "notebooks": [
    {
      "index": 1,
      "id": "25d59f31-61fd-49a6-8c65-b5f4eb6f1f43",
      "title": "phase4-research-test-1775909139",
      "is_owner": true,
      "created_at": "2026-04-11T14:05:40"
    }
  ],
  "count": 1
}
```

**SKILL.md documentation discrepancy:** SKILL.md §Command Output Formats (line 408) claims the schema is `{"notebooks": [{"id", "title", "created_at"}]}`. The actual output adds `index` (integer, 1-based position in list) and `is_owner` (boolean). The `created_at` field is present in list output as a timestamp string, but is `null` in `create --json` output (as research confirmed during Phase 2). Normalization for `listNotebooks` should strip `index` and `is_owner`, and must handle `created_at` being either a string or null.

**Auth failure (exit 1, stdout):**
```json
{
  "error": true,
  "code": "AUTH_REQUIRED",
  "message": "Auth not found. Run 'notebooklm login' first.",
  "checked_paths": { ... },
  "help": "Run 'notebooklm login' or set NOTEBOOKLM_AUTH_JSON"
}
```
Auth errors are emitted to **stdout** (not stderr) as JSON with exit code 1. Phase 2's `runNotebooklm` JSON-mode non-zero exit path parses stdout JSON first, finds `error: true` with code `AUTH_REQUIRED` (not `RATE_LIMITED`), and throws `NotebooklmCliError`. [VERIFIED: live CLI run 2026-04-11]

### 2. `notebooklm source delete-by-title` with nonexistent title

**Command run:** `notebooklm source delete-by-title "NONEXISTENT_TITLE_12345" -n <notebookId> -y`

**stdout:**
```
Error: No source found with title 'NONEXISTENT_TITLE_12345'.
Run 'notebooklm source list' to see available sources.
```

**stderr:**
```
14:06:01 WARNING [notebooklm._sources] Sources data for <id> is not a list (type=NoneType), returning empty list (API structure may have changed)
```

**Exit code:** 1

[VERIFIED: live CLI run 2026-04-11]

**Phase 2 wrapper behavior analysis:**
Phase 2's `deleteSourceByTitle` uses `jsonMode: false` (text mode). In text mode with exit code 1, `runNotebooklm` scans **stderr** (not stdout) for `RATE_LIMIT_PATTERNS`. The stderr text is the WARNING line, which matches no rate-limit pattern. Therefore `deleteSourceByTitle` throws `NotebooklmCliError` with:
- `.exitCode = 1`
- `.stderr = "14:06:XX WARNING [notebooklm._sources] Sources data..."` (the WARNING line)
- `.command = ['source', 'delete-by-title', title, '-n', notebookId, '-y']`

**Consequence for Phase 4:** The D-13 "swallow if title doesn't exist" policy is implementable by:
```js
try {
  await deleteSourceByTitle(notebookId, title);
} catch (err) {
  if (err instanceof NotebooklmRateLimitError) throw err; // propagate rate limit
  // Swallow NotebooklmCliError — title did not exist in notebook
}
```
This is safe because the only other `NotebooklmCliError` from `deleteSourceByTitle` on exit 1 would be a genuine upstream error (auth failure, network issue), which would also produce a non-null `stderr`. If needed, the caller can inspect `err.stderr` for the WARNING pattern to distinguish "not found" from auth errors, but for Phase 4's best-effort semantics, swallowing all non-rate-limit errors is correct.

### 3. `notebooklm create` duplicate-name behavior

**Command run:** `notebooklm create "phase4-research-dup-test" --json` (twice)

**First call:** Returns `{"notebook": {"id": "5b2c5729...", "title": "phase4-research-dup-test", "created_at": null}}` exit 0
**Second call:** Returns `{"notebook": {"id": "8b55da4a...", "title": "phase4-research-dup-test", "created_at": null}}` exit 0 — **different UUID**, no error.

[VERIFIED: live CLI run 2026-04-11]

**Impact:** NotebookLM silently creates two notebooks with the same title. Subsequent `list --json` returned both in the `notebooks` array. This is a real risk for the D-09 "find by title" logic: if a user has previously created a notebook named `claude-dev-stack-vault` manually, and Phase 4 creates another one, the user ends up with two. On the next run, `listNotebooks()` finds both and must decide which to use.

**Recommendation for planner (Claude's Discretion §"How `listNotebooks` handles >1 notebook with same title"):** Throw `NotebooklmCliError` loudly with a clear message: `'Multiple notebooks found with title "${notebookName}". Delete duplicates and retry.'`. Do NOT silently pick first or newest — that would upload vault content into an unexpected notebook without user awareness. This failure is surfaced to Phase 5 CLI which can show the error to the user.

### 4. `notebooklm source list -n <id> --json` on empty notebook

During testing of `delete-by-title` on the freshly created test notebook, `notebooklm-py` emitted the WARNING:
```
WARNING [notebooklm._sources] Sources data for <id> is not a list (type=NoneType), returning empty list
```
on stderr even for empty notebooks. This is a known benign condition — Phase 2 already handles it (see `tests/notebooklm.test.mjs` line 171-179: `listSources` returns `[]` even with this WARNING present). Phase 4 does not call `listSources` directly (manifest tracks source IDs), so this is a documentation note only.

### 5. Vault walk performance benchmark

**Setup:** Synthetic vault, 5 projects × (1 context.md + 4 sessions + 4 decisions + 3 docs) = 60 files, content 50–100 lines each.

**Benchmark:** Full walk + `readFileSync` + SHA-256 hash all 60 files.

**Result:** 3ms total, 0.05ms per file average.

[VERIFIED: Node.js runtime benchmark on dev machine 2026-04-11]

**Conclusion:** For 100 files (the D-14 estimate), hash computation takes ≤5ms total. Even adding 100 `writeManifest` atomic renames (each ~0.5ms on APFS), total per-run overhead excluding API calls is well under 100ms. Performance is not a concern.

---

## Cross-Platform Path Handling

**Verified on macOS (dev machine):**
```js
import { posix } from 'node:path';
posix.relative('/Users/foo/vault', '/Users/foo/vault/projects/my-proj/sessions/2026-04-10-test.md')
// → 'projects/my-proj/sessions/2026-04-10-test.md'
```
Output matches the Phase 3 manifest key format exactly (confirmed by matching `'projects/foo/context.md'` used in Phase 3 test T2-07). [VERIFIED: live Node.js run 2026-04-11]

**Windows failure mode (NOT verified on Windows, analyzed from docs):**
`path.posix.relative('C:\\Users\\foo\\vault', 'C:\\Users\\foo\\vault\\projects\\bar\\baz.md')` returns `'../C:\\Users\\foo\\vault\\projects\\bar\\baz.md'` — completely wrong because `path.posix` does not understand Windows drive letters. [VERIFIED: Node.js REPL simulation 2026-04-11]

**Correct cross-platform approach (two options):**

Option A — `path.posix.relative` from `node:path/posix` (ESM import):
```js
import { relative } from 'node:path/posix';
// Works correctly on macOS/Linux. On Windows, vaultRoot and absPath
// must already be POSIX strings — which they are if computed from
// path.posix.join() or manually normalized.
```

Option B — `path.relative` + normalize (always safe):
```js
import { relative, sep } from 'node:path';
const key = relative(vaultRoot, absPath).split(sep).join('/');
```

The 04-CONTEXT.md D-05 says "use `path.posix.relative` or equivalent manual conversion". Both options are equivalent on macOS/Linux. Option B is recommended because it uses the platform-native `path.relative` (which correctly handles Windows drive letters) and then normalizes separators. This matches Phase 3's established pattern (03-CONTEXT.md §D-05 references `pathKey.split(sep).join('/')` as the cross-platform approach).

**Recommendation for planner:** Use `path.relative(vaultRoot, absPath).split(path.sep).join('/')`. Import `{ relative, sep } from 'node:path'` alongside `{ join }`. The `path/posix` import is an alternative but adds a second path module import for no added benefit on macOS.

---

## Phase 2 API Surface Review

**What Phase 4 directly consumes from `lib/notebooklm.mjs`:**

| Function | Called By | Return Shape | File:Line |
|----------|-----------|--------------|-----------|
| `createNotebook(name)` | `ensureNotebook` helper | `{ id, title }` | `lib/notebooklm.mjs:310` |
| `uploadSource(notebookId, filepath)` | `syncOneFile` | `{ sourceId, title }` | `lib/notebooklm.mjs:383` |
| `deleteSourceByTitle(notebookId, title)` | `syncOneFile` | `{ deleted: true, sourceId }` or throws | `lib/notebooklm.mjs:450` |
| `listNotebooks()` | `ensureNotebook` | `Array<{id, title, createdAt}>` | NEW — to add at end of `lib/notebooklm.mjs` |

**NOT used by Phase 4:**
- `listSources` — manifest tracks source IDs; no need to enumerate remote sources
- `deleteSource` — replaced by `deleteSourceByTitle` (we have the title, not the ID, after create)
- `updateSource` — Phase 4 orchestrates delete-then-upload itself (D-13) because it needs to control manifest write timing

**Error classes consumed by Phase 4 (all exported at top of `lib/notebooklm.mjs`):**
- `NotebooklmRateLimitError` — Phase 4 D-08: abort sync on this, `rateLimited: true` in stats
- `NotebooklmCliError` — Phase 4 D-07: collect in `stats.errors[]`, continue to next file
- `NotebooklmNotInstalledError` — Phase 4 propagates upward (Phase 5 handles graceful degradation)

**`runNotebooklm` helper (private, `lib/notebooklm.mjs:173`):** Phase 4 does NOT call this directly. It is module-private (no `export`). Phase 4 only calls the public exported functions.

**`_resetBinaryCache()` (exported test hook, `lib/notebooklm.mjs:145`):** Phase 4 tests MUST call this in `beforeEach`, same as Phase 2 tests (`tests/notebooklm.test.mjs:45`).

**`listNotebooks` implementation plan (adding 7th function):**
```js
export async function listNotebooks() {
  const parsed = runNotebooklm(['list', '--json'], {
    jsonMode: true,
    functionName: 'listNotebooks',
  });

  if (!parsed || !Array.isArray(parsed.notebooks)) {
    throw new NotebooklmCliError(
      'listNotebooks: expected { notebooks: [...] } in --json output',
      { command: ['list', '--json'], exitCode: 0, stderr: '' }
    );
  }

  return parsed.notebooks.map((nb) => {
    if (typeof nb.id !== 'string' || typeof nb.title !== 'string') {
      throw new NotebooklmCliError(
        'listNotebooks: notebook entry missing required id/title fields',
        { command: ['list', '--json'], exitCode: 0, stderr: '' }
      );
    }
    return {
      id: nb.id,
      title: nb.title,
      createdAt: nb.created_at ?? null,  // present in list, null in create
    };
  });
}
```

Pattern follows `listSources` at `lib/notebooklm.mjs:339-366`. The `index` and `is_owner` fields from the real API response are stripped (normalization per Phase 2 D-08).

---

## Phase 3 Manifest Contract

**What Phase 4 must call and preserve:**

| Function | When | Contract | File:Line |
|----------|------|----------|-----------|
| `readManifest(vaultRoot)` | Once at sync start | Never throws for missing/corrupt; returns `{version:1, generated_at, files:{}}` on fresh vault | `lib/notebooklm-manifest.mjs:191` |
| `hashFile(absolutePath)` | Per non-session file | 64-char lowercase hex SHA-256 of raw bytes; deterministic | `lib/notebooklm-manifest.mjs:95` |
| `writeManifest(vaultRoot, manifest)` | After each successful upload | Atomic `.tmp + renameSync`; mutates `manifest.version` and `manifest.generated_at` | `lib/notebooklm-manifest.mjs:231` |
| `ensureManifestGitignored(vaultRoot)` | NOT Phase 4's job | Phase 5 install wizard calls this; Phase 4 assumes already done (04-CONTEXT.md §code_context) | `lib/notebooklm-manifest.mjs:280` |

**Manifest key format (MUST match exactly):**
```
"projects/{project-slug}/{category}/{filename.md}"
```
Example: `"projects/claude-dev-stack/sessions/2026-04-10-test.md"`
Computed as: `path.relative(vaultRoot, absolutePath).split(path.sep).join('/')`
[VERIFIED: matches Phase 3 test T2-07 fixture keys at `tests/notebooklm-manifest.test.mjs:160-163`]

**Manifest file entry shape (Phase 4 writes this after upload):**
```js
manifest.files[vaultRelativePath] = {
  hash: hexDigest,                    // from hashFile()
  notebook_source_id: sourceId,       // from uploadSource() return value .sourceId
  uploaded_at: new Date().toISOString()
};
```
The `writeManifest` call mutates `manifest` in place (adds `version` + `generated_at`). Phase 4 should pass the same manifest object throughout the sync run (not deep-clone it) — this matches how Phase 3 designed it. [VERIFIED: `lib/notebooklm-manifest.mjs:241-243`]

**Session files — presence check, NOT hash check (D-12):**
```js
// For files in sessions/:
const isAlreadySynced = manifest.files[vaultRelativePath] !== undefined;
if (isAlreadySynced) { stats.skipped++; continue; }
// Upload, then write manifest entry
```
The manifest entry for a session records `hash` (computed at upload time) but the **decision to upload or skip** ignores the hash and looks only at key presence.

**Empty manifest treatment:** `readManifest` returns `{ version: 1, generated_at: now, files: {} }` for both fresh vault AND corrupt recovery. Phase 4 treats empty `files` as "re-sync everything" — all files are absent from the manifest, so all will be uploaded on first run. [VERIFIED: Phase 3 VERIFICATION.md §D-17]

---

## Pitfalls Identified

### Pitfall 1: `listNotebooks` schema has extra fields — naive schema check will reject valid responses

**What goes wrong:** A planner who reads only SKILL.md §Command Output Formats (line 408) and implements `listNotebooks` to validate that each notebook has exactly `{id, title, created_at}` will fail in production because the real API returns `{index, id, title, is_owner, created_at}`.

**Why it happens:** SKILL.md documentation was written before or without the `index` and `is_owner` fields being added to the API. The validator in `listSources` (`lib/notebooklm.mjs:350-352`) checks for `id` and `title` presence only, which is the correct pattern.

**How to avoid:** Implement the schema check as "must have `id` (string) and `title` (string)" — not "must have exactly these fields". Strip `index`, `is_owner` during normalization. Confirmed by live API run.

**Warning signs:** Test passes with stub JSON `{"notebooks":[{"id":"x","title":"y"}]}` but fails against live API. If using strict `Object.keys(nb).sort()` comparison, it will fail.

### Pitfall 2: `deleteSourceByTitle` error is on stdout (not stderr) — manual error detection is unreliable

**What goes wrong:** Phase 4 code that tries to detect "not found" by checking `err.stderr.includes('No source found')` will NEVER match, because the "No source found" text goes to **stdout**, not stderr. The `runNotebooklm` text-mode non-zero exit only scans **stderr** for errors (after failing to get a match from stdout in text mode).

**Why it happens:** `notebooklm-py` sends the human-readable error to stdout (because stdout is the normal output channel for all responses), but the Phase 2 wrapper in text mode doesn't parse stdout on non-zero exit — it only scans stderr for rate-limit patterns, then throws with the first line of stderr (which is the WARNING line).

**How to avoid:** D-13 says "swallow the error if title doesn't exist." The correct implementation is to catch ALL `NotebooklmCliError` (excluding `NotebooklmRateLimitError`) from `deleteSourceByTitle` and continue to the upload step. Do NOT try to distinguish "not found" from other errors by inspecting the error message or stderr. The non-rate-limit errors from delete-by-title are all safely swallowable in Phase 4's best-effort model.

**Warning signs:** Code like `if (err.stderr.includes('No source found'))` — this never matches.

### Pitfall 3: Duplicate notebook creation is silent — `listNotebooks` + filter = multiple matches possible

**What goes wrong:** `notebooklm create "claude-dev-stack-vault"` succeeds with a new UUID every time, even if a notebook with that name already exists. After two sync runs on a fresh machine (if `ensureNotebook` creates instead of reusing), the user has two notebooks. On the third run, `listNotebooks` finds two matches for `claude-dev-stack-vault`, and a naive "use first" policy silently uploads to the wrong notebook.

**Why it happens:** NotebookLM has no unique constraint on notebook titles. The Phase 4 D-09 plan calls `listNotebooks()` first and only creates if not found — this is correct. But if the lookup is done with a prefix match or case-insensitive match instead of strict `===`, it may find a false positive and skip creation. Or if two concurrent sync runs race at first-run time, both will create notebooks.

**How to avoid:** In `ensureNotebook`: use strict `title === notebookName` equality for lookup. If `listNotebooks()` returns 0 matches, create. If 1 match, use its ID. If ≥2 matches, throw `NotebooklmCliError` with message `'Multiple notebooks found with title "${notebookName}"...'`. Never silently pick one.

**Warning signs:** User reports "vault content is split across two notebooks" — classic symptom of this race.

### Pitfall 4 (non-obvious): `writeManifest` mutates its argument — passing a cached manifest causes `generated_at` drift

**What goes wrong:** If Phase 4 calls `const manifest = readManifest(vaultRoot)` once and then modifies `manifest.files[path] = entry` and calls `writeManifest(vaultRoot, manifest)` after each upload, the `manifest` object accumulates all entries correctly — this is the intended use. However, if any code tries to keep a "pre-sync snapshot" of the manifest by referencing the same object (not a clone), the snapshot will reflect post-sync state because `writeManifest` mutates `manifest.version` and `manifest.generated_at` in place (`lib/notebooklm-manifest.mjs:241-243`).

**Why it happens:** Phase 3 D-03 documents that `writeManifest` sets `generated_at` on every write. This is by design (cheap, makes the file human-readable). But it means the manifest object is mutated.

**How to avoid:** Never try to snapshot the manifest object for comparison. If diff-tracking is needed, clone the relevant field values before passing to `writeManifest`. In normal Phase 4 usage (single-pass sequential loop), this is not an issue — the mutation is exactly what we want.

### Pitfall 5 (non-obvious): `notebooklm-stub.sh` ignores argv — multi-command test scenarios require careful stub reset

**What goes wrong:** A test that exercises a full `syncVault` path makes multiple sequential CLI calls (e.g., `listNotebooks` → `uploadSource` → `uploadSource` → ...). The current stub at `tests/fixtures/notebooklm-stub.sh:16-27` ignores ALL argv and returns whatever `NOTEBOOKLM_STUB_STDOUT/STDERR/EXIT` are set to at the moment of each invocation. A test that sets `NOTEBOOKLM_STUB_STDOUT` for the `list --json` call and then doesn't update it before `uploadSource` calls will get the wrong response for every subsequent call.

**Why it happens:** Phase 2 tests each cover a single function invocation. Phase 4 integration tests need to simulate multiple sequential CLI calls within one `syncVault()` invocation. The current stub design doesn't support this without resetting env vars between calls.

**How to avoid:** Extend the stub to be argv-aware OR create scenario-specific stub scripts. Recommended approach (Claude's Discretion): create a mode-aware `tests/fixtures/notebooklm-sync-stub.sh` that branches on `$1` (the subcommand argument): returns list JSON for `list`, returns upload JSON for `source add`, returns success text for `source delete-by-title`. Environment variables override for specific failure scenarios within each mode.

Example mode-aware stub:
```bash
#!/bin/bash
CMD_MODE="$1"  # 'list', 'source', 'create', etc.

case "$CMD_MODE" in
  list)  printf '%s\n' "${NOTEBOOKLM_STUB_LIST_STDOUT:-{\"notebooks\":[]}}" ;;
  source) printf '%s\n' "${NOTEBOOKLM_STUB_SOURCE_STDOUT:-{\"source\":{\"id\":\"s1\",\"title\":\"test\"}}}" ;;
  create) printf '%s\n' "${NOTEBOOKLM_STUB_CREATE_STDOUT:-{\"notebook\":{\"id\":\"nb1\",\"title\":\"test\"}}}" ;;
  *) printf '%s\n' "${NOTEBOOKLM_STUB_STDOUT:-}" ;;
esac
exit "${NOTEBOOKLM_STUB_EXIT:-0}"
```

---

## Test Strategy Recommendations

### Vault Fixture Setup Pattern

Extend Phase 3's `mkdtempSync + process.pid` pattern (`tests/notebooklm-manifest.test.mjs:18-20`) to build multi-project vault fixtures:

```js
const tmpBase = join(tmpdir(), `claude-test-sync-${process.pid}`);
const vaultRoot = join(tmpBase, 'vault');

function makeVaultFixture(projects) {
  mkdirSync(join(vaultRoot, 'projects'), { recursive: true });
  for (const [slug, files] of Object.entries(projects)) {
    const projDir = join(vaultRoot, 'projects', slug);
    if (files.context) {
      writeFileSync(join(projDir, 'context.md'), files.context);
    }
    if (files.sessions) {
      mkdirSync(join(projDir, 'sessions'), { recursive: true });
      for (const [name, content] of Object.entries(files.sessions)) {
        writeFileSync(join(projDir, 'sessions', name), content);
      }
    }
    // ... decisions, docs
  }
}
```

### What to Stub vs What to Use Real

| Component | Approach | Reason |
|-----------|----------|--------|
| `notebooklm` CLI binary | Fake stub (mode-aware) | Cannot call real API in CI; stub is already established pattern |
| `lib/notebooklm.mjs` | Real (import it) | Tests exercise the full Phase 2 wrapper integration |
| `lib/notebooklm-manifest.mjs` | Real (import it) | Tests verify manifest is actually written to disk |
| Filesystem vault | Real temp dir | `hashFile` reads real bytes; no in-memory mocking |
| `findVault()` | Override via `syncVault({ vaultRoot: tmpVault })` | Pass vaultRoot directly to avoid vault discovery |

### Test Coverage Map

| Scenario | Test Type | Key Assertion |
|----------|-----------|---------------|
| Fresh vault, all files new → all uploaded | Integration | `stats.uploaded === totalFileCount`, manifest populated |
| Second run, no changes → all skipped | Integration | `stats.skipped === totalFileCount`, zero stub calls to `source add` |
| ADR regex mismatch (no NNNN prefix) → warn + skip | Unit | `warn()` called, file absent from manifest |
| Session already in manifest → skipped regardless of content change | Integration | Even after file edit, `stats.skipped` includes session count |
| Rate-limit mid-run → abort, partial stats, `rateLimited: true` | Integration | Stub returns rate-limit JSON on Nth `source add`; verify manifest has (N-1) entries |
| `deleteSourceByTitle` throws `NotebooklmCliError` (not found) → swallow, upload proceeds | Integration | Stats shows `uploaded: 1`, not `failed: 1` |
| `listNotebooks` returns 0 matches → `createNotebook` called | Integration | Stub for `create` returns valid JSON; `notebookId` in stats |
| `listNotebooks` returns 2 matches same title → throw error | Unit | `syncVault` rejects with message containing "Multiple notebooks" |
| `dryRun: true` → no stub calls to `source add` or `source delete-by-title` | Integration | Zero network calls; `planned` array populated |
| `findVault()` returns null, no `vaultRoot` passed → behavior per planner's decision | Unit | Either throws or returns error stats |

### Anti-Sampling Note

If tests only use 1-project vaults, the walk-ordering guarantee from D-11 (alphabetical across projects) is never exercised. At least one test MUST use a 2–3 project vault with known file counts per project to verify that:
1. Projects are processed alphabetically
2. Within each project, `context.md` is uploaded before `decisions/*.md` before `docs/*.md` before `sessions/*.md`
3. A rate-limit abort on project N does not corrupt the manifest for projects 1..N-1 already synced

---

## Validation Architecture

This section is provided for Nyquist VALIDATION.md generation. `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (Node 18+ native) |
| Config file | none — run via `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm-sync.test.mjs tests/notebooklm.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NBLM-07 | Sessions uploaded once with `{project}__` prefix; second run skips them | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-08 | ADRs replace-by-filename; regex mismatch skips with warn | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-09 | Docs replace-by-filename with `doc-` prefix | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-10 | context.md replace-by-filename as `{project}__context.md` | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-11 | shared/ and meta/ never walked; non-.md silently skipped | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-12 | Notebook auto-created on first sync if absent | integration | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |
| NBLM-13 | `NOTEBOOKLM_NOTEBOOK_NAME` env var overrides default notebook name | unit | `node --test tests/notebooklm-sync.test.mjs` | ❌ Wave 0 |

**Also required (listNotebooks — 7th function):**

| Behavior | Test Type | Command | File Exists? |
|----------|-----------|---------|-------------|
| listNotebooks returns normalized array on success | unit | `node --test tests/notebooklm.test.mjs` | ❌ extend existing |
| listNotebooks returns [] on empty vault | unit | same | ❌ extend existing |
| listNotebooks throws NotebooklmCliError on malformed JSON | unit | same | ❌ extend existing |
| listNotebooks throws NotebooklmNotInstalledError on missing binary | unit | same | ❌ extend existing |

### Per-Requirement Validation Rationale

**NBLM-07 (sessions upload-once):**
Null hypothesis: a broken implementation re-uploads sessions on every run (hash-based instead of presence-based). Proof: run `syncVault` twice on vault with 2 sessions. First run: `stats.uploaded` includes sessions. Edit a session file. Second run: `stats.skipped` includes the session (NOT `stats.uploaded`). Data: vault fixture with `projects/proj-a/sessions/2026-04-10-test.md`. The test must write a manifest entry for the session after the first run and verify the second run reads the manifest, finds the presence entry, and skips.

**NBLM-08 (ADRs replace-by-filename + regex skip):**
Null hypothesis: broken implementation either re-uploads unchanged ADRs (no hash check) or fails silently on regex mismatch. Two test cases needed: (a) ADR with correct `NNNN-slug.md` format — first run uploads, second run skips (hash match); after content edit, third run deletes-then-uploads. (b) ADR with wrong filename `README.md` in `decisions/` — verify `warn()` is called and file is absent from manifest.

**NBLM-09/10 (docs + context replace-by-filename):**
Same pattern as NBLM-08. Null hypothesis: upload creates duplicates instead of replacing. Test: stub `source delete-by-title` to return success, `source add` to return new source ID. Verify manifest entry `notebook_source_id` is updated to the new source ID after replace.

**NBLM-11 (hard-skip shared/meta):**
Null hypothesis: broken implementation walks `vault/shared/` or `vault/meta/`. Fixture: create `vault/shared/patterns.md` and `vault/meta/project-registry.md`. After `syncVault`, assert these paths are absent from `manifest.files`. Also assert no stub `source add` calls for these paths.

**NBLM-12 (auto-create notebook):**
Null hypothesis: broken implementation crashes if notebook doesn't exist (e.g., uses hardcoded ID). Stub: `list --json` returns `{"notebooks":[],"count":0}` on first call, `create` returns `{"notebook":{"id":"nb1","title":"claude-dev-stack-vault"}}`. Assert `stats.notebookId === 'nb1'` and that the create stub was called.

**NBLM-13 (env var override):**
Set `process.env.NOTEBOOKLM_NOTEBOOK_NAME = 'my-custom-vault'` before calling `syncVault`. Stub `list --json` to return a notebook with title `'my-custom-vault'`. Assert `syncVault` uses that notebook's ID (not the default `claude-dev-stack-vault`). Cleanup: delete env var after test.

### How We Know We Didn't Over-Mock

The fake stub binary (`notebooklm-stub.sh`) is an actual bash executable placed on `PATH` and invoked via `spawnSync`. This is NOT an in-process mock — the full Phase 2 `runNotebooklm → spawnSync → bash → exit` chain executes. The manifest reads/writes hit real temp-dir files on the local filesystem. Only the `notebooklm-py` Python CLI is replaced with a bash stub that emits canned JSON. This is as realistic as possible short of calling the live API.

The test suite validates that `lib/notebooklm-sync.mjs` produces correct manifest state on disk, not just that it calls the right internal functions.

### Anti-Sampling Checklist

The test suite is incomplete if:
- [ ] All tests use single-project vaults → walking order across multiple projects is untested
- [ ] All tests assume stub always succeeds → rate-limit abort path is untested
- [ ] All tests run with pre-populated manifests → first-run (empty manifest) path is untested
- [ ] All tests assume `deleteSourceByTitle` succeeds → "not found" swallow path is untested
- [ ] All tests use stub that ignores argv → wrong responses returned for wrong commands

---

## Claude's Discretion Resolutions

For each area flagged as "Claude's Discretion" in 04-CONTEXT.md:

### Names of private helpers
**Resolution:** Names proposed in CONTEXT.md (`walkProjectFiles`, `buildTitle`, `ensureNotebook`, `syncOneFile`) are clear and conventional. Use them. `buildTitle(vaultRelativePath, projectSlug)` is the name that most clearly communicates the round-trippable invariant from D-06.

### How `errors[].reason` is derived
**Resolution:** Use `error.message` as `reason` (short string) with truncation at 200 chars. Rationale: `NotebooklmCliError.message` is already human-readable (`"notebooklm exited 1 in deleteSourceByTitle: WARNING..."`). Phase 5 CLI renders this directly. Alternatives (code, structured) add complexity for no benefit at Phase 4 layer.

### Whether to memoize `hashFile` within a sync run
**Resolution:** No memoization. The walk structure visits each file exactly once (D-11 ordering guarantees no file appears in two categories), so a file can never be hashed twice in one run. Memoization adds complexity for a case that never occurs. If D-18's walker ever adds overlapping category rules, the memoization decision should be revisited.

### How `dryRun` interacts with notebook existence
**Resolution:** Use **option (b) — `dryRun: true` bypasses ALL API calls including `listNotebooks`**. Rationale: the primary use case for `dryRun` is offline inspection ("what would sync?"), and requiring a live API call for existence check defeats that purpose. The `planned[]` array can include a `notebookId: null` entry to signal "notebook not yet resolved". Phase 5 `status` command can handle null notebookId gracefully by displaying "notebook will be auto-created on first sync".

### Test fixture layout for multi-project vaults
**Resolution:** Create a new `tests/fixtures/notebooklm-sync-stub.sh` that is argv-aware (branches on first argument = subcommand: `list`, `source`, `create`). Keep the existing `notebooklm-stub.sh` unchanged for Phase 2 backward compatibility. The sync-specific stub can be installed as the fake binary in Phase 4 tests without breaking Phase 2 tests (each test file sets up its own stub dir in `before()`).

### `findVault()` null handling in `syncVault`
**Resolution:** **Throw `Error('Vault not found')`** — consistent with Phase 3 `assertVaultRoot` (which also throws) and with the principle that a missing vault is a caller-side programming error when `syncVault` is invoked deliberately. Phase 5 CLI catches this error and renders it as a user-facing failure. Do NOT return a special stats shape — that would silently succeed with `uploaded: 0, failed: 1, errors: [{reason: 'no vault'}]`, making it easy for callers to miss the critical failure.

### How `listNotebooks` handles >1 notebook with same title
**Resolution:** **Throw `NotebooklmCliError`** with message: `'listNotebooks: multiple notebooks found with title "${notebookName}" (found ${count}). Delete duplicate notebooks and retry.'`. As verified empirically, NotebookLM allows duplicate notebook names. The sync pipeline must fail loudly — not silently pick one — because using the wrong notebook would upload vault content into an unintended location. The error propagates to Phase 5 CLI which shows it to the user.

---

## Architecture Patterns

### Module Structure
```
lib/notebooklm-sync.mjs (~300-400 LoC)
├── Imports: notebooklm.mjs (createNotebook, uploadSource, deleteSourceByTitle, listNotebooks, NotebooklmRateLimitError, NotebooklmCliError)
│            notebooklm-manifest.mjs (readManifest, writeManifest, hashFile)
│            projects.mjs (findVault)
│            shared.mjs (warn)
│            node:fs (readdirSync, existsSync)
│            node:path (join, relative, sep)
│            node:os (not needed if findVault used)
│
├── buildTitle(vaultRelativePath, projectSlug) — PRIVATE, single source of truth for D-06
├── walkProjectFiles(vaultRoot) → Array<{absPath, vaultRelativePath, category, projectSlug, title}>
├── ensureNotebook(notebookName) → notebookId — calls listNotebooks + createNotebook
├── syncOneFile(opts) → 'uploaded'|'skipped'|'failed' — per D-07/D-12/D-13 logic
└── export syncVault({vaultRoot?, notebookName?, dryRun?}) → stats object
```

### Walk Order (D-11 — deterministic for testing)
```
For each project (sorted alphabetically):
  1. context.md (if exists)
  2. decisions/*.md (sorted ascending by filename — NNNN prefix gives natural order)
  3. docs/*.md (sorted ascending)
  4. sessions/*.md (sorted ascending — date prefix gives chronological)
```

### Error Handling Flow (D-07/D-08)
```
syncOneFile():
  try:
    deleteSourceByTitle()  → catch NotebooklmCliError (non-rate-limit) → swallow
    uploadSource()         → throws on failure
    writeManifest()        → update manifest entry
  catch NotebooklmRateLimitError:
    re-throw → caught by syncVault loop → abort with rateLimited: true
  catch NotebooklmCliError:
    append to stats.errors[], stats.failed++, continue
```

---

## State of the Art

| Old Approach (SKILL.md documentation) | Actual v0.3.4 Behavior | Impact |
|----------------------------------------|------------------------|--------|
| `list --json` returns `{notebooks: [{id, title, created_at}]}` | Returns `{notebooks: [{index, id, title, is_owner, created_at}], count: N}` | `listNotebooks` validator must accept extra fields |
| `create --json` returns `{id, title}` flat | Returns `{notebook: {id, title, created_at}}` nested | Phase 2 already corrected: validates `parsed.notebook.id` at `notebooklm.mjs:320` |
| `source add --json` returns `{source_id, title, status}` flat | Returns `{source: {id, title, ...}}` nested | Phase 2 already corrected: validates `parsed.source.id` at `notebooklm.mjs:399` |
| `delete-by-title` error on nonexistent: unknown | Exits 1; error text goes to stdout (not stderr) | Phase 4 cannot detect "not found" via stderr; must catch all `NotebooklmCliError` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `delete-by-title` for EXISTING source returns `"Deleted source: <id>"` on stdout, exit 0 | Phase 2 API Surface | deleteSourceByTitle would throw NotebooklmCliError on successful delete — Phase 2 tests cover this [ASSUMED: not directly re-verified in Phase 4 session, covered by Phase 2 test suite] |
| A2 | `notebooklm source add <file> -n <id> --json` on a file that already exists as a source creates a duplicate (not updates) | Architecture Patterns | If NBLM dedupes by content hash, delete-then-upload becomes unnecessary; current Phase 2 design is conservative | [ASSUMED] |
| A3 | Windows path behavior of `path.posix.relative` with Windows drive letters | Cross-platform | Would produce wrong manifest keys on Windows; only affects Windows users (project is macOS-first) | [VERIFIED via Node.js simulation that Windows paths break; ASSUMED that the `path.relative + sep.join('/')` workaround works on real Windows] |

**Empty ASSUMED claims:** A1 and A2 are acceptable risks because they are covered by Phase 2 tests and the overall design is conservative (idempotent by replace-by-filename).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| notebooklm-py CLI | uploadSource, deleteSourceByTitle, listNotebooks, createNotebook | ✓ | 0.3.4 | — (required, no fallback; Phase 5 guards with auth check) |
| node:crypto | hashFile (via Phase 3) | ✓ | built-in Node 18+ | — |
| node:fs | vault walking | ✓ | built-in | — |
| node:path | vault-relative path generation | ✓ | built-in | — |

[VERIFIED: `notebooklm --version` → `NotebookLM CLI, version 0.3.4` at `/opt/anaconda3/bin/notebooklm`]

---

## Sources

### Primary (HIGH confidence — runtime verified)
- Live `notebooklm-py v0.3.4` CLI at `/opt/anaconda3/bin/notebooklm` — all CLI behavior findings in §Runtime-Verified Findings
- `lib/notebooklm.mjs` (507 lines, Phase 2) — exact function signatures and error handling logic
- `lib/notebooklm-manifest.mjs` (318 lines, Phase 3) — manifest contract
- `tests/notebooklm.test.mjs` (329 lines) — reference test patterns
- `tests/notebooklm-manifest.test.mjs` (331 lines) — reference fixture patterns
- `tests/fixtures/notebooklm-stub.sh` — existing stub behavior (argv-blind)
- `.planning/phases/03-sync-manifest-change-detection/VERIFICATION.md` — Phase 3 verified behavior

### Secondary (MEDIUM confidence — official skill documentation)
- `~/.claude/skills/notebooklm/SKILL.md` — notebooklm-py v0.3.4 documentation (partially outdated re: actual JSON shapes)

### Tertiary (LOW confidence — training knowledge)
- Cross-platform path handling on Windows (simulation verified, not on real Windows machine)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all consumed modules are shipped and verified
- Architecture: HIGH — all patterns derived from locked decisions + runtime verification
- Pitfalls: HIGH — three of five pitfalls empirically confirmed; two derived from code analysis
- CLI behavior: HIGH — verified against live notebooklm-py v0.3.4

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (notebooklm-py API surfaces are versioned; check if v0.3.5+ changes JSON shapes)
