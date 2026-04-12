# Phase 7: NotebookLM Manifest v2 + Per-Project Sync Loop — Research

**Researched:** 2026-04-12
**Domain:** In-process manifest schema migration + per-project NotebookLM sync loop
**Confidence:** HIGH (all findings verified against live codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Unmappable v1 entries (files outside `projects/*/`) go into a `projects._shared` bucket — no data loss. Phase 8 migration can handle `_shared` entries separately.
- **D-02:** `readManifest()` detects v1, writes `.v1.backup.json` + v2 manifest to disk immediately (in-place at read time). No lazy/deferred write — if sync crashes after read, manifest is already v2.
- **D-03:** `isValidManifestShape()` is split into `{valid: bool, reason: 'ok' | 'unknown-version' | 'malformed'}`. `readManifest()` calls `migrateV1ToV2()` on `unknown-version` when version === 1 specifically. Version > 2 still triggers corrupt recovery (future-proofing).
- **D-04:** CRITICAL FIRST-COMMIT GATE: `isValidManifestShape()` split + `migrateV1ToV2()` + `tests/notebooklm-manifest-migration.test.mjs` (v1 with 3 entries → v2 reads as 3 migrated) must land in a single atomic commit BEFORE any `MANIFEST_VERSION` bump.
- **D-05:** `syncVault()` uses per-project continue strategy: error in project B is logged, sync continues with C, D, E. End summary reports `4/5 ok, 1 failed`. Re-run sync idempotently catches up project B.
- **D-06:** Pre-flight conflict: if `cds__{slug}` notebook already exists and wasn't created by CDS, abort with actionable message: `"Notebook cds__X already exists. Use --force-adopt to claim it."` The `--force-adopt` flag is a sync-level option.
- **D-07:** `buildTitle(category, projectSlug, basename, opts)` — add optional 4th parameter `{projectScoped: true}`. When `projectScoped === true`, return `basename` without `{project}__` prefix. Without opts or `projectScoped: false` — existing behavior preserved. Backward compatible, zero breaking changes.
- **D-08:** Doctor NotebookLM section shows summary line (`3 notebooks, 27 sources total`) plus per-project breakdown (`claude-dev-stack: 21 sources, nmp: 3 sources, ...`). Compact, inline with existing doctor style.
- **D-09:** `NOTEBOOKLM_NOTEBOOK_NAME` deprecation warning appears only in doctor, not during sync. Message: `"NOTEBOOKLM_NOTEBOOK_NAME is deprecated. Per-project notebooks (cds__{slug}) are now used. Will be removed in v1.0."`

### Claude's Discretion

- v2 manifest schema exact field names and nesting
- `ensureNotebook()` caching strategy (memoize per sync run vs re-check each time)
- Per-project stats aggregation shape (`{perProject: {[slug]: {...}}, total: {...}}`)
- Error message wording for partial sync failures

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-V2-01 | `isValidManifestShape()` split + `migrateV1ToV2()` + in-place backup — FIRST commit gate | `isValidManifestShape()` at line 136 is a simple boolean today; split to `{valid, reason}` is surgical. `readManifest()` at line 191 gets one extra branch after the `isValidManifestShape()` call. |
| NBLM-V2-02 | `syncVault()` loops per-project, calls `ensureNotebook('cds__{slug}')` per project, uses `manifest.projects[slug]` as scoped sub-object | `syncVault()` at line 381; `walkProjectFiles()` already groups by slug; `syncOneFile()` already accepts manifest as parameter. Refactor is additive. |
| NBLM-V2-03 | `cds__{slug}` naming + pre-flight conflict scan + `--force-adopt` abort | `ensureNotebook()` at line 193 already calls `listNotebooks()`; conflict scan is a filter pass over that list before the per-project loop. |
| NBLM-V2-04 | `buildTitle(..., { projectScoped: true })` drops `{project}__` prefix | `buildTitle()` at line 59 is a simple switch; 4th-param opts addition is backward-compatible. |
| NBLM-V2-08 | Doctor: deprecation warning for `NOTEBOOKLM_NOTEBOOK_NAME` env var | `lib/doctor.mjs` NotebookLM section starts at line 74; one `if (process.env.NOTEBOOKLM_NOTEBOOK_NAME)` check + `warn()` is sufficient. |
| NBLM-V2-09 | Doctor: per-project notebook count + total sources + per-project breakdown | Requires calling `listNotebooks()` + `listSources()` per notebook — these are already in `lib/notebooklm.mjs`'s public API. |
| TEST-04 | `tests/notebooklm-manifest-migration.test.mjs` in same first commit as NBLM-V2-01 | Uses existing test patterns from `tests/notebooklm-manifest.test.mjs`; no new infra needed. |
</phase_requirements>

---

## Summary

Phase 7 is a refactoring phase operating on two existing modules (`lib/notebooklm-manifest.mjs` and `lib/notebooklm-sync.mjs`) and extending one (`lib/doctor.mjs`). The module under D-03 boundary (`lib/notebooklm.mjs`) is NOT modified at all — its public API (`listNotebooks`, `listSources`, `createNotebook`, `uploadSource`, `deleteSourceByTitle`) provides all the primitives Phase 7 needs.

The highest-risk item is the **critical first-commit gate (D-04)**: `isValidManifestShape()` must be split BEFORE `MANIFEST_VERSION` is bumped to 2. The existing test at line 184 (`version:2 manifest is treated as corrupt`) explicitly tests the old behavior that WILL BREAK if `MANIFEST_VERSION` bumps before the split. That test becomes the "before" fixture for the migration test.

The second concern is the v2 schema design. The planner has full discretion on exact field names; the research section below documents the constraints that the schema must satisfy and provides a concrete recommended shape.

**Primary recommendation:** Three commits / three plans — (1) manifest v2 foundation + migration + test gate, (2) per-project `syncVault()` loop, (3) doctor stats + deprecation warning.

---

## Standard Stack

### Core (all verified against live codebase)

| Module | Current state | Phase 7 role | Change type |
|--------|--------------|--------------|-------------|
| `lib/notebooklm-manifest.mjs` | 333 LOC, v1 flat shape | Primary refactor target | Surgical edits to `isValidManifestShape`, `readManifest`, `writeManifest`, add `migrateV1ToV2` |
| `lib/notebooklm-sync.mjs` | 522 LOC, single-notebook loop | Refactor target | `syncVault()` per-project loop, `buildTitle()` 4th param, `ensureNotebook()` caching |
| `lib/doctor.mjs` | 365 LOC, NotebookLM section at line 74 | Extension target | Add per-project stats block + deprecation check |
| `lib/notebooklm.mjs` | 577 LOC | D-03 boundary — DO NOT MODIFY | Read-only reference |
| `lib/shared.mjs` | exports `atomicWriteJson` at line 134 | Reuse for backup write | No changes |
| `tests/helpers/fixtures.mjs` | Phase 6 output — `withStubBinary`, `makeTempVault` | Reuse for sync tests | No changes |

[VERIFIED: codebase grep + file reads 2026-04-12]

### Supporting

| Item | Source | Purpose |
|------|--------|---------|
| `atomicWriteJson(path, obj)` | `lib/shared.mjs:134` | Write `.v1.backup.json` during migration |
| `withStubBinary(name, script, fn)` | `tests/helpers/fixtures.mjs:100` | Stub `notebooklm` binary in sync tests |
| `makeTempVault()` | `tests/helpers/fixtures.mjs:12` | Temp vault with `meta/` + `projects/` for manifest tests |
| `node:test` + `node:assert/strict` | Node.js builtins | Test framework (single-dep constraint enforced) |

[VERIFIED: file reads 2026-04-12]

**No new npm dependencies.** Single-dep constraint (`prompts@^2.4.2`) preserved. [VERIFIED: CLAUDE.md + package.json]

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
lib/
  notebooklm-manifest.mjs    # MODIFIED: isValidManifestShape split + migrateV1ToV2
  notebooklm-sync.mjs        # MODIFIED: per-project loop, buildTitle opts, conflict scan
  doctor.mjs                 # MODIFIED: per-project stats + deprecation warning
tests/
  notebooklm-manifest-migration.test.mjs   # NEW: first-commit gate tests (D-04 + TEST-04)
  notebooklm-sync-per-project.test.mjs     # NEW: per-project loop tests (Plan 2)
```

### Pattern 1: isValidManifestShape() Split (D-03)

**What:** Change the boolean return to a `{valid, reason}` object so callers can distinguish "unknown-version" from "malformed" without re-inspecting the parsed object.

**Current code (line 136–141):**
```javascript
function isValidManifestShape(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (parsed.version !== MANIFEST_VERSION) return false;
  if (parsed.files === null || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) return false;
  return true;
}
```

**Required new behavior:**
```javascript
// Returns {valid: true, reason: 'ok'} | {valid: false, reason: 'unknown-version'} | {valid: false, reason: 'malformed'}
function isValidManifestShape(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (parsed.version !== MANIFEST_VERSION) {
    return { valid: false, reason: 'unknown-version' };
  }
  if (parsed.files === null || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    return { valid: false, reason: 'malformed' };
  }
  return { valid: true, reason: 'ok' };
}
```

[VERIFIED: source file line 136–141, 2026-04-12]

**CRITICAL:** `readManifest()` currently calls `if (!isValidManifestShape(parsed))`. After the split, this becomes two branches:
- `reason === 'unknown-version' && parsed.version === 1` → call `migrateV1ToV2()`
- `reason === 'unknown-version' && parsed.version > 2` → corrupt recovery (future-proofing)
- `reason === 'malformed'` → corrupt recovery (same as before)

### Pattern 2: migrateV1ToV2() In-Place (D-01, D-02)

**What:** Pure data transformation — v1 flat `files` map → v2 per-project `projects` map. Runs synchronously inside `readManifest()`. Writes backup + new v2 manifest to disk before returning.

**v2 manifest schema (Claude's discretion — recommended):**
```javascript
// v2 shape
{
  version: 2,
  generated_at: "<ISO timestamp>",
  projects: {
    "<slug>": {
      notebook_id: "<string | null>",   // null until first sync
      files: {
        "<vault-relative-path>": {
          hash: "<64-char hex>",
          notebook_source_id: "<string>",
          uploaded_at: "<ISO string>"
        }
      }
    },
    "_shared": {   // D-01: v1 entries not under projects/*/
      notebook_id: null,
      files: { ... }
    }
  }
}
```

**Migration algorithm:**
1. Write `.v1.backup.json` via `atomicWriteJson` (from `lib/shared.mjs`)
2. Group v1 `files` entries by slug: for key `projects/{slug}/...` → put under `projects[slug].files`; for anything else → put under `projects._shared.files`
3. Extract slug from `key.split('/')[1]` when `key.startsWith('projects/')`
4. Produce v2 object in-memory
5. Call `writeManifest(vaultRoot, v2manifest)` — this bumps `MANIFEST_VERSION` and writes atomically
6. Return v2 manifest

**Sequencing constraint:** Steps 1–5 must complete before `MANIFEST_VERSION = 2` is set as the module constant. D-04 mandates this is the FIRST commit. The `MANIFEST_VERSION` constant stays at `1` in the first commit; it is bumped to `2` in a subsequent commit (Plan 2 or a dedicated step within Plan 1).

**Clarification on the first-commit gate:** The test `tests/notebooklm-manifest-migration.test.mjs` must be able to write a `version: 1` manifest, call `readManifest()`, and observe v2 output. For this to work in the first commit, `readManifest()` needs to be able to call `migrateV1ToV2()` — which means `writeManifest()` must be able to write v2 shape (the `projects` field). This means `writeManifest()` must also be extended to accept v2 shape before `MANIFEST_VERSION` is bumped. The bump itself is what makes fresh manifests v2 by default.

[ASSUMED: the sequencing detail — first commit writes the migration machinery, second commit bumps `MANIFEST_VERSION` so new/empty manifests start as v2]

### Pattern 3: Per-Project syncVault() Loop (D-05, D-06, D-07)

**What:** Replace the current single-notebook `syncVault()` with a per-project loop. Each project gets its own `cds__{slug}` notebook. Stats are aggregated per-project and totalled.

**Current `syncVault()` structure (lines 381–466):**
- Resolves vault root + notebook name
- Calls `ensureNotebook(notebookName)` once
- Walks all files via `walkProjectFiles(vaultRoot)` (flat list)
- Loads manifest once → iterates flat files list

**New structure:**
1. Pre-flight: `listNotebooks()` once → scan for any `cds__{slug}` that exists but has no matching `manifest.projects[slug].notebook_id` entry → abort with actionable message (or continue if `--force-adopt`)
2. Walk projects via `walkProjectFiles(vaultRoot)` as today, but group by `projectSlug`
3. Per-project loop:
   - `notebookId = await ensureNotebook('cds__' + slug)` — memoized per run
   - `projectManifest = manifest.projects[slug]` (scoped sub-object)
   - Run existing `syncOneFile()` with `projectManifest.files` instead of `manifest.files`
   - After project loop, write updated manifest back
   - Collect `perProject[slug]` stats
4. Build `total` stats by summing all per-project stats
5. Return `{perProject, total, ...existing fields}`

**ensureNotebook() caching (Claude's discretion):** Memoize per sync run using a `Map` keyed by notebook name. This avoids `O(n)` calls to `listNotebooks()` when the vault has many projects — one `listNotebooks()` call per run is sufficient. Pass the pre-fetched notebook list into a modified `ensureNotebook()` or close over it.

[VERIFIED: `syncVault()` source lines 381–466, `walkProjectFiles()` lines 101–133, 2026-04-12]

### Pattern 4: buildTitle() 4th Parameter (D-07)

**What:** Add optional `opts = {}` 4th parameter. When `opts.projectScoped === true`, strip the `{projectSlug}__` prefix from all return values.

**Current signature (line 59):**
```javascript
export function buildTitle(category, projectSlug, basename)
```

**New signature:**
```javascript
export function buildTitle(category, projectSlug, basename, opts = {})
```

**Change to switch cases:** each case prepends `projectSlug + '__'` only if `!opts.projectScoped`. The `null` return for ADR mismatch is unchanged.

This is a pure additive change. All existing callers pass 3 args; they are unaffected.

[VERIFIED: `buildTitle()` source lines 59–83, 2026-04-12]

### Pattern 5: Doctor Stats + Deprecation (D-08, D-09)

**What:** Extend the NotebookLM section in `lib/doctor.mjs` (currently lines 74–125) to:
1. When `notebooklm` is available and vault exists: call `listNotebooks()`, filter to `cds__` prefix, call `listSources()` per notebook, aggregate stats
2. Print summary line + per-project breakdown inline
3. Check `process.env.NOTEBOOKLM_NOTEBOOK_NAME` → emit deprecation warning if set

**Current doctor pattern** for reference (lines 93–119): `ok()`, `warn()`, `info()` calls after async operations. The stats section follows the same inline style.

**Deprecation message (D-09, verbatim):**
```
NOTEBOOKLM_NOTEBOOK_NAME is deprecated. Per-project notebooks (cds__{slug}) are now used. Will be removed in v1.0.
```

[VERIFIED: `lib/doctor.mjs` lines 74–125, 2026-04-12]

### Anti-Patterns to Avoid

- **Bumping `MANIFEST_VERSION` before the migration guard is in place.** The existing test `version:2 manifest is treated as corrupt (T2-09)` at line 184 in `tests/notebooklm-manifest.test.mjs` will break immediately if `MANIFEST_VERSION` is set to `2` without the new `isValidManifestShape()` split in place. D-04 exists precisely to prevent this.
- **Calling `listNotebooks()` once per project.** The pre-flight conflict scan must call it ONCE, build a lookup map, and pass that into `ensureNotebook()` for the rest of the run.
- **Passing `manifest` (entire object) to `syncOneFile()` after v2 upgrade.** `syncOneFile()` must receive `manifest.projects[slug]` (the scoped per-project sub-object), not the full v2 manifest. The `files` field is `manifest.projects[slug].files`, not `manifest.files`.
- **Writing to `lib/notebooklm.mjs`.** D-03 boundary. Any diff on that file is a phase failure.
- **Using Co-Authored-By in commits.** CLAUDE.md + MEMORY.md are explicit on this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON write (backup + manifest) | Custom `writeFileSync` | `atomicWriteJson()` from `lib/shared.mjs` | Already ship it; POSIX-atomic via rename |
| Stub `notebooklm` binary in tests | Custom PATH manipulation | `withStubBinary()` from `tests/helpers/fixtures.mjs` | Phase 6 built this; handles cleanup |
| Temp vault structure | `mkdirSync` boilerplate | `makeTempVault()` from `tests/helpers/fixtures.mjs` | Already ship it |
| Listing notebooks | Direct `spawnSync` | `listNotebooks()` from `lib/notebooklm.mjs` | Wrapper handles error normalization |
| Creating notebooks | Direct `spawnSync` | `createNotebook()` from `lib/notebooklm.mjs` | Wrapper handles rate-limit detection |
| Listing sources | Direct `spawnSync` | `listSources(notebookId)` from `lib/notebooklm.mjs` | Wrapper normalizes shape |

---

## Common Pitfalls

### Pitfall C-2: The Manifest Version Bump Wipes All Tracking History (CRITICAL)

**What goes wrong:** Bumping `MANIFEST_VERSION` from `1` to `2` before adding the migration guard causes `isValidManifestShape()` to treat every existing v1 manifest as corrupt. Existing users lose all their SHA-256 hash history and every file gets re-uploaded on next sync.

**Why it happens:** The current `isValidManifestShape()` (line 137) does a strict `parsed.version !== MANIFEST_VERSION` check. If `MANIFEST_VERSION` becomes `2`, any `{version: 1, ...}` manifest fails the check → `recoverCorruptManifest()` is called → the manifest is renamed to `.corrupt-<timestamp>` and an empty manifest is returned.

**Evidence in existing tests:** `tests/notebooklm-manifest.test.mjs` line 184 (`version:2 manifest is treated as corrupt`) directly encodes this behavior. This test will PASS correctly before the split and would FAIL (or corrupt real data) if `MANIFEST_VERSION` bumped without the split.

**How to avoid:** Strict commit ordering per D-04. The split must exist and be tested BEFORE the bump. The first commit includes: split + `migrateV1ToV2()` + migration test. A subsequent commit bumps `MANIFEST_VERSION = 2`.

**Warning signs:** If any commit diff shows `MANIFEST_VERSION = 2` without simultaneously containing the `isValidManifestShape` split — that commit is wrong.

[VERIFIED: source code + existing test 2026-04-12]

### Pitfall C-3: syncOneFile() Receives Full v2 Manifest (File Entries Not Found)

**What goes wrong:** `syncOneFile()` reads `manifest.files[vaultRelativePath]` at line 253. In v2, `manifest.files` no longer exists — entries are at `manifest.projects[slug].files[vaultRelativePath]`. If the full manifest is passed, all files appear as "new" (no existing entry) and every file gets re-uploaded on first v2 sync.

**How to avoid:** Pass `manifest.projects[slug]` as the `manifest` parameter to `syncOneFile()`. The sub-object shape is `{notebook_id, files: {...}}`. `syncOneFile()` accesses `manifest.files[vaultRelativePath]` which maps correctly to `manifest.projects[slug].files[vaultRelativePath]`.

**Warning signs:** If integration test shows all files re-uploaded on v2 first-run despite existing hash entries.

[VERIFIED: `syncOneFile()` line 253, manifest shape analysis 2026-04-12]

### Pitfall C-4: Conflict Scan Catches CDS-Created Notebooks as Conflicts

**What goes wrong:** The pre-flight conflict scan checks `listNotebooks()` for any `cds__{slug}` match. If the scan runs on a re-run (Phase 8 or idempotent re-sync), the CDS-created notebooks from the previous run look like "external conflicts."

**How to avoid:** The conflict scan should only abort if `cds__{slug}` exists AND `manifest.projects[slug].notebook_id` is null or absent (meaning CDS didn't create it). If `notebook_id` is already recorded in the manifest, the notebook is CDS-owned → no conflict.

[ASSUMED: based on code analysis — needs verification in implementation]

### Pitfall C-5: Doctor Stats Slow on Large Vaults (listSources() per notebook)

**What goes wrong:** The doctor stats block calls `listSources(notebookId)` for each `cds__*` notebook. Each call is a `spawnSync('notebooklm', ...)` — synchronous CLI invocation. With 7+ projects this could add 7+ seconds to `claude-dev-stack doctor`.

**How to avoid:** Only run the per-project stats block when `notebooklm` binary is available and authenticated (already gated by `hasNotebooklm` at doctor line 79). Consider adding a timeout or a `--fast` flag. For v0.9 with 7 projects, the latency is acceptable. Document as a known limitation.

[ASSUMED: timing estimate based on CLI wrapper architecture]

---

## Code Examples

### isValidManifestShape() Split (verified pattern)

```javascript
// Source: lib/notebooklm-manifest.mjs (current line 136) — REPLACE THIS
function isValidManifestShape(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (parsed.version !== MANIFEST_VERSION) {
    // Distinguish known-old (v1) from unknown-future (v3+) or missing
    return { valid: false, reason: 'unknown-version' };
  }
  if (parsed.files !== undefined) {
    // v1 shape still present — malformed for v2
    return { valid: false, reason: 'malformed' };
  }
  if (parsed.projects === null || typeof parsed.projects !== 'object' || Array.isArray(parsed.projects)) {
    return { valid: false, reason: 'malformed' };
  }
  return { valid: true, reason: 'ok' };
}
```

**Note:** Once `MANIFEST_VERSION = 2`, the `files` field check becomes relevant. In the first commit (version still 1), the shape of a valid v1 manifest is `{version:1, files:{...}}` — so the split just needs to return `{valid, reason}` shapes instead of boolean. The full v2 shape validation (`projects` field) belongs in the second commit alongside the bump.

### readManifest() Migration Branch (verified integration point)

```javascript
// Replaces the existing: if (!isValidManifestShape(parsed)) { return recoverCorruptManifest(...) }
const shapeResult = isValidManifestShape(parsed);
if (!shapeResult.valid) {
  if (shapeResult.reason === 'unknown-version' && parsed.version === 1) {
    // D-02: in-place migration — writes backup + v2 manifest
    return migrateV1ToV2(vaultRoot, parsed, path);
  }
  // version > MANIFEST_VERSION or malformed → corrupt recovery as before
  return recoverCorruptManifest(path, `manifest shape invalid (${shapeResult.reason})`);
}
```

### migrateV1ToV2() Skeleton

```javascript
function migrateV1ToV2(vaultRoot, v1manifest, manifestPath) {
  // 1. Write backup
  const backupPath = manifestPath.replace(/\.json$/, '.v1.backup.json');
  atomicWriteJson(backupPath, v1manifest);

  // 2. Group v1 files by project slug
  const projects = {};
  for (const [key, entry] of Object.entries(v1manifest.files || {})) {
    const parts = key.split('/');
    // e.g. 'projects/claude-dev-stack/sessions/2026-04-10.md' → slug = 'claude-dev-stack'
    const slug = (parts[0] === 'projects' && parts.length >= 3) ? parts[1] : '_shared';
    if (!projects[slug]) {
      projects[slug] = { notebook_id: null, files: {} };
    }
    projects[slug].files[key] = entry;
  }

  // 3. Build v2 manifest
  const v2 = {
    version: 2,               // explicit — writeManifest enforces MANIFEST_VERSION normally
    generated_at: new Date().toISOString(),
    projects,
  };

  // 4. Write atomically (v2 shape — writeManifest must accept v2 shape by this point)
  writeManifestV2(vaultRoot, v2);  // or extend writeManifest to handle both shapes
  return v2;
}
```

### withStubBinary() Pattern for Sync Tests (verified from fixtures.mjs)

```javascript
// Pattern from tests/helpers/fixtures.mjs:100
import { withStubBinary, makeTempVault } from './helpers/fixtures.mjs';

it('per-project sync creates one notebook per slug', async () => {
  const { dir: vaultRoot, cleanup } = makeTempVault();
  try {
    await withStubBinary('notebooklm', `
      case "$1" in
        list) echo '{"notebooks":[]}' ;;
        create) echo '{"notebook":{"id":"nb-1","title":"'"$2"'"}}' ;;
        source) echo '{"source":{"id":"src-1","title":"test"}}' ;;
      esac
    `, async () => {
      // ... test body using syncVault({ vaultRoot })
    });
  } finally {
    cleanup();
  }
});
```

[VERIFIED: `tests/helpers/fixtures.mjs` lines 100–117, `tests/notebooklm.test.mjs` lines 24–36, 2026-04-12]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single shared `claude-dev-stack-vault` notebook | Per-project `cds__{slug}` notebooks | Phase 7 (this phase) | Sources titled without `{project}__` prefix in notebook; cleaner NotebookLM UI |
| v1 flat manifest `{version:1, files:{...}}` | v2 per-project manifest `{version:2, projects:{[slug]:{notebook_id, files:{...}}}}` | Phase 7 (this phase) | Manifest tracks notebook_id per project; manifest is authoritative for conflict detection |
| `NOTEBOOKLM_NOTEBOOK_NAME` env var selects notebook | Deprecated; per-project notebooks always used | Phase 7 (deprecation warning in doctor) | Env var still read during sync for backward compat (v1.0 drops it) |

**Still current from v0.8:**
- `notebooklm-py` CLI wrapper (browser OAuth, no REST API) — unchanged
- D-03 boundary: `lib/notebooklm.mjs` is not modified in this phase
- Upload title workaround: `cp-to-tmp` for title control (in `uploadSource()`) — unchanged
- Per-file atomic manifest write after each successful upload — preserved in v2

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The first-commit can bump MANIFEST_VERSION in a second step within the same PR (not same commit) — the gate is per-commit, not per-PR | Architecture Patterns §Pattern 2 | If `MANIFEST_VERSION` bump must be in a separate PR, plan structure changes |
| A2 | `writeManifest()` can be extended to accept v2 shape (`projects` instead of `files`) without breaking existing tests by making `files` optional when `projects` is present | Architecture Patterns §Pattern 2 | If `writeManifest()` strictly validates `files` field, it must be split into `writeManifestV1()` + `writeManifestV2()` — more code but same logic |
| A3 | Conflict scan should skip CDS-owned notebooks (those already in manifest) to avoid false positives on re-run | Pitfall C-4 | If not handled, idempotent re-runs abort unnecessarily |
| A4 | Doctor stats calling `listSources()` per notebook adds acceptable latency (<7s for 7 projects) in v0.9 | Pitfall C-5 | If latency is unacceptable, a lazy/cached approach is needed |

---

## Open Questions

1. **writeManifest() v2 shape validation**
   - What we know: `writeManifest()` currently throws if `manifest.files` is null/not-object (lines 237–239)
   - What's unclear: Should `writeManifest()` be extended to handle both v1 (`files`) and v2 (`projects`) shapes, or should a new `writeManifestV2()` be added?
   - Recommendation: Extend `writeManifest()` — accept `projects` field when `files` is absent; validate `projects` as a plain object. This preserves the single-write-function invariant. The version the function stamps is always `MANIFEST_VERSION`.

2. **MANIFEST_VERSION bump commit ordering**
   - What we know: D-04 says the split + migration + test must be ONE atomic commit. D-04 does NOT specify whether the MANIFEST_VERSION bump must be a separate commit or can be a second commit in the same plan.
   - What's unclear: Can Plan 1 have two commits (migration machinery, then bump) or must the bump be Plan 2?
   - Recommendation: Plan 1 has exactly 2 commits — commit 1 is the D-04 gate (split + migration + test), commit 2 bumps `MANIFEST_VERSION` and extends `writeManifest()`. This matches the ROADMAP success criterion 1 literally.

3. **Per-project stats shape (Claude's discretion)**
   - Recommendation: `{perProject: {[slug]: {uploaded, skipped, failed, notebookId}}, total: {uploaded, skipped, failed, notebooks}}`

---

## Environment Availability

Phase 7 is a code + test change — no new external dependencies introduced beyond what Phase 6 already established.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `notebooklm` binary | Integration tests (stubbed) | ✓ (stubbed via `withStubBinary`) | N/A — stubbed | — |
| `node:test` + `node:assert/strict` | Test framework | ✓ | Node 18+ builtins | — |
| `atomicWriteJson` from `lib/shared.mjs` | Backup write in `migrateV1ToV2()` | ✓ | Phase 6 output | — |
| `withStubBinary`, `makeTempVault` | Sync tests | ✓ | Phase 6 output | — |

[VERIFIED: Phase 6 SUMMARY.md exists + `tests/helpers/fixtures.mjs` confirmed in codebase, 2026-04-12]

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`. Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node.js native) |
| Config file | none — invoked via `npm test` → `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm-manifest-migration.test.mjs` |
| Full suite command | `npm test` |

**Current baseline:** 313 tests passing (verified 2026-04-12 via `npm test`).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NBLM-V2-01 | v1 manifest with 3 entries reads as v2 with 3 migrated entries | unit | `node --test tests/notebooklm-manifest-migration.test.mjs` | ❌ Wave 0 |
| NBLM-V2-01 | `isValidManifestShape()` returns `{valid, reason}` object not boolean | unit | `node --test tests/notebooklm-manifest-migration.test.mjs` | ❌ Wave 0 |
| NBLM-V2-01 | `.v1.backup.json` is written on first v2 upgrade | unit | `node --test tests/notebooklm-manifest-migration.test.mjs` | ❌ Wave 0 |
| NBLM-V2-02 | `syncVault()` creates `cds__slug` notebook per project | integration | `node --test tests/notebooklm-sync-per-project.test.mjs` | ❌ Wave 0 |
| NBLM-V2-02 | Per-project stats aggregated as `{perProject, total}` | unit | `node --test tests/notebooklm-sync-per-project.test.mjs` | ❌ Wave 0 |
| NBLM-V2-03 | Pre-flight conflict scan aborts when `cds__slug` exists without manifest entry | unit | `node --test tests/notebooklm-sync-per-project.test.mjs` | ❌ Wave 0 |
| NBLM-V2-04 | `buildTitle(..., {projectScoped:true})` drops `{project}__` prefix for all categories | unit | `node --test tests/notebooklm-sync.test.mjs` (extend existing) | ❌ Wave 0 |
| NBLM-V2-08 | Doctor warns when `NOTEBOOKLM_NOTEBOOK_NAME` is set | unit | `node --test tests/doctor.test.mjs` (extend existing) | ✅ (existing file, new test) |
| NBLM-V2-09 | Doctor reports per-project stats when `notebooklm` available | integration | manual / `node --test tests/doctor.test.mjs` | ✅ (existing file, new test) |
| TEST-04 | Migration test file in same commit as NBLM-V2-01 | — | structural (commit-level requirement) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/notebooklm-manifest-migration.test.mjs tests/notebooklm-manifest.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/notebooklm-manifest-migration.test.mjs` — covers NBLM-V2-01 + TEST-04 (new file, first commit gate)
- [ ] `tests/notebooklm-sync-per-project.test.mjs` — covers NBLM-V2-02, NBLM-V2-03 (new file, Plan 2)
- [ ] Extend `tests/notebooklm-sync.test.mjs` (if exists) or create — covers NBLM-V2-04 `buildTitle` opts

---

## Security Domain

Phase 7 makes no authentication changes, introduces no new secrets handling, and does not add any network calls beyond what `lib/notebooklm.mjs` already performs (D-03 boundary). ASVS categories are not directly applicable to this internal refactor.

| ASVS Category | Applies | Note |
|---------------|---------|------|
| V2 Authentication | no | Auth entirely in `notebooklm-py`; Phase 7 does not touch auth |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | partial | `migrateV1ToV2()` must validate v1 manifest entries before processing (no unchecked property access on untrusted JSON shapes) |
| V6 Cryptography | no | SHA-256 via `hashFile()` is unchanged; no new crypto added |

**Shell injection risk:** Zero — `lib/notebooklm.mjs` always uses `spawnSync` with args array, never shell string. Phase 7 does not add any new `spawnSync` calls (D-03 boundary).

---

## Sources

### Primary (HIGH confidence)

- `lib/notebooklm-manifest.mjs` — full source read, 2026-04-12 — all function signatures, line numbers, current boolean behavior of `isValidManifestShape()`
- `lib/notebooklm-sync.mjs` — full source read, 2026-04-12 — `syncVault()`, `buildTitle()`, `ensureNotebook()`, `syncOneFile()` signatures and behavior
- `lib/notebooklm.mjs` — full source read, 2026-04-12 — D-03 boundary confirmed; `listNotebooks()`, `listSources()`, `createNotebook()` API shapes verified
- `lib/doctor.mjs` — full source read, 2026-04-12 — NotebookLM section line 74 confirmed; `ok()`/`warn()`/`info()` output style
- `tests/notebooklm-manifest.test.mjs` — full source read, 2026-04-12 — critical T2-09 test (line 184) confirmed as direct conflict with MANIFEST_VERSION bump
- `tests/helpers/fixtures.mjs` — full source read, 2026-04-12 — `withStubBinary()`, `makeTempVault()` APIs confirmed
- `lib/shared.mjs:134` — `atomicWriteJson()` implementation confirmed
- `.planning/config.json` — `nyquist_validation: true` confirmed
- `npm test` output — 313 tests passing baseline confirmed, 2026-04-12

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — NBLM-V2-01 through NBLM-V2-09 + TEST-04 requirement text
- `.planning/ROADMAP.md` — Phase 7 success criteria (5 items)
- `07-CONTEXT.md` — All 9 locked decisions (D-01..D-09)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all modules verified via direct source reads
- Architecture: HIGH — all integration points traced through live source
- Pitfalls: HIGH — C-2 verified via existing test evidence; C-3/C-4 verified via source analysis; C-5 assumed
- Test gaps: HIGH — existing test at T2-09 is definitive evidence of the bump-without-split hazard

**Research date:** 2026-04-12
**Valid until:** Stable — this phase targets a fixed, already-written codebase. Research does not expire until Phase 7 begins.
