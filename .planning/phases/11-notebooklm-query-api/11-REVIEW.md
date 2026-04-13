---
phase: 11-notebooklm-query-api
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - lib/notebooklm.mjs
  - lib/notebooklm-cli.mjs
  - tests/notebooklm.test.mjs
  - tests/notebooklm-cli.test.mjs
  - tests/fixtures/notebooklm-stub.sh
  - bin/cli.mjs
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 11 adds `askNotebook` and `generateArtifact` to `lib/notebooklm.mjs`, corresponding CLI subcommands to `lib/notebooklm-cli.mjs`, and 39 new tests. The architecture is sound: shell-out via args array (no injection surface), retry logic, structured error hierarchy. No critical security issues were found.

Four warnings were identified: (1) a temp directory created but never used in `generateArtifact`, (2) `generateArtifact` treats a missing `artifactId` (null `task_id`) as valid, (3) shell-injection risk in inline stub scripts used in tests, and (4) `runGenerate` silently discards unknown flag-prefixed arguments. Three info-level items cover minor code quality points.

---

## Warnings

### WR-01: Unused temp directory created in `generateArtifact`

**File:** `lib/notebooklm.mjs:717`
**Issue:** `mkdtempSync(join(tmpdir(), 'notebooklm-'))` creates a temp directory on every text-artifact generation call. The directory is created at line 717, but `content` is read from `dlResult.output_path` — a path in the *caller's* filesystem that the CLI already placed there. The `tmpDir` variable is never written to or used as a download target; `rmSync(tmpDir, ...)` in the `finally` block removes a directory that was never populated. This wastes an `fs.mkdtempSync` call on every invocation and signals a design mismatch: either `tmpDir` was intended as the download destination (and `--output` should have been passed to the CLI), or the block should not exist.

```javascript
// Current (lib/notebooklm.mjs ~716-730):
if (!BINARY_ARTIFACT_TYPES.has(type)) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'notebooklm-'));  // created, never used
  try {
    const dlArgs = ['download', type, '--json', '--latest', '-n', notebookId];
    const dlResult = run(dlArgs, { jsonMode: true, functionName: 'generateArtifact' });
    const filePath = dlResult?.output_path;
    if (filePath) {
      content = readFileSync(filePath, 'utf8');  // reads from notebooklm-py's chosen path
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });  // removes empty dir
  }
}

// Fix — remove tmpDir creation and the finally block entirely:
if (!BINARY_ARTIFACT_TYPES.has(type)) {
  const dlArgs = ['download', type, '--json', '--latest', '-n', notebookId];
  const dlResult = run(dlArgs, { jsonMode: true, functionName: 'generateArtifact' });
  const filePath = dlResult?.output_path;
  if (filePath) {
    content = readFileSync(filePath, 'utf8');
  }
}
```

If the intent was to control the download destination, pass `--output <tmpDir/filename>` in `dlArgs` and then read from `tmpDir`. Either way the current code is incorrect.

---

### WR-02: `artifactId` is set from `task_id` without a null/undefined guard

**File:** `lib/notebooklm.mjs:711`
**Issue:** `const artifactId = genResult.task_id;` — if `notebooklm-py` returns a `completed` status but omits `task_id` (or returns `null`), `artifactId` is silently `undefined`/`null` and the function returns `{ artifactId: undefined, content, type }` without throwing. Callers that use `result.artifactId` for download or logging will get a misleading result. The schema validation for `genResult.status` already has a guard pattern — the same should apply to `task_id`.

```javascript
// Current (line 711):
const artifactId = genResult.task_id;

// Fix — validate before proceeding:
const artifactId = genResult.task_id;
if (!artifactId) {
  throw new NotebooklmCliError(
    'generateArtifact: completed response missing task_id',
    { command: genArgs, exitCode: 0, stderr: '' }
  );
}
```

---

### WR-03: Shell injection in inline test stub scripts (notebooklm-cli.test.mjs)

**File:** `tests/notebooklm-cli.test.mjs:338-365, 430-434, 543-558`
**Issue:** Several `makeAskStub` / `makeGenerateStub` / inline stub writers embed dynamic values directly into shell script strings via template literals:

```javascript
// Line 430-433 (makeAskStub):
const jsonOut = JSON.stringify({ answer, references });
writeFileSync(stubPath, `#!/bin/sh\necho '${jsonOut}'\n`, 'utf8');
```

`JSON.stringify` output can contain single quotes (e.g., if `answer` contains `"it's"`). A single quote in `jsonOut` will break the `echo '...'` shell quoting and could execute unintended shell commands if test inputs are ever user-controlled or fuzzed. The same pattern appears in `makeGenerateStub` (lines 543–558) and the inline sync stub (lines 338–365).

This is a test file, so real-world impact is low, but it is a reliability issue: tests with apostrophes in strings will silently produce malformed stubs and fail with confusing errors.

```javascript
// Fix — write the JSON to a separate file and have the stub cat it:
const contentFile = join(stubDir, 'response.json');
writeFileSync(contentFile, jsonOut, 'utf8');
writeFileSync(stubPath, `#!/bin/sh\ncat '${contentFile}'\n`, 'utf8');
// Or use printf with %s and heredoc-safe approach via a .json sidecar file.
```

---

### WR-04: `runGenerate` silently drops unknown flags starting with `-`

**File:** `lib/notebooklm-cli.mjs:281-287`
**Issue:** The positional-arg extraction loop filters out all tokens starting with `-` that are not `--notebook`/`-n`:

```javascript
} else if (!filteredArgs[i].startsWith('-')) {
  positionalArgs.push(filteredArgs[i]);
}
```

An unrecognized flag like `--verbose` or a mistyped `--noteboook nb-123` will be silently ignored. The notebook ID value `nb-123` is a positional token that doesn't start with `-`, so it would be treated as the artifact type. This can produce confusing behavior: `notebooklm generate --noteboook nb-123 report` would set `typeArg = 'nb-123'` and attempt to generate an artifact of type `'nb-123'`.

This is mitigated by the fact that `resolveNotebookId` validates the notebook ID independently, but the silent discard of the flag makes debugging harder.

```javascript
// Fix — collect unrecognized flags and warn or pass them through:
} else if (!filteredArgs[i].startsWith('-')) {
  positionalArgs.push(filteredArgs[i]);
} else {
  warn(`Unknown flag ignored: ${filteredArgs[i]}`);
}
```

---

## Info

### IN-01: `askNotebook` retry loop exits via `throw lastErr` which is always set after the loop

**File:** `lib/notebooklm.mjs:634-663`
**Issue:** The `throw lastErr` at line 663 (after the `for` loop) is only reachable when all three attempts throw `NotebooklmRateLimitError`. In that case `lastErr` is always set because the loop condition `attempt <= 2` combined with the `continue` ensures `lastErr` is populated before falling through. However, if `attempt < 2` guard were ever changed to `attempt < 0` by mistake, `lastErr` would be `undefined` and `throw undefined` would produce a confusing non-Error throw. A defensive `throw lastErr ?? new NotebooklmRateLimitError(...)` or a comment noting the invariant would make this clearer.

No code change strictly required — the current logic is correct — but worth documenting.

---

### IN-02: `bin/cli.mjs` help text omits `notebooklm migrate` subcommand

**File:** `bin/cli.mjs:67-72`
**Issue:** The global help printout lists `sync`, `status`, `ask`, and `generate` under "NotebookLM Sync" but not `migrate`. The `notebooklm-cli.mjs` help (line 492) does include `migrate`. Users relying on `claude-dev-stack help` will not discover the migration subcommand. Minor discoverability gap.

```javascript
// Add to bin/cli.mjs printHelp(), after line 71:
console.log(`    ${c.white}claude-dev-stack notebooklm migrate${c.reset} ${c.dim}Migrate shared notebook to per-project notebooks${c.reset}`);
```

---

### IN-03: `generateArtifact` test "passes --wait in generate args" is a duplicate

**File:** `tests/notebooklm.test.mjs:637-648`
**Issue:** The test at line 637 ("passes --wait in generate args") asserts only `--wait` presence. The immediately preceding test at line 619 ("passes --retry 2 and --wait in generate args") already asserts both `--wait` and `--retry 2` using identical setup code and the same `video` type. The second test adds no additional coverage and will always pass or fail together with the first. It can be removed without reducing coverage.

---

_Reviewed: 2026-04-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
