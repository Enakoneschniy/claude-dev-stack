# Phase 4: Vault → NotebookLM Sync Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 04-vault-notebooklm-sync-pipeline
**Areas discussed:** Filename normalization, Error handling & orchestration, Session append-only semantics, Module API surface & return shape

---

## Gray Area Selection (first turn)

User selected all 4 gray areas from the initial multi-select (Filename normalization, Error handling & orchestration, Session append-only semantics, Module API surface & return shape).

---

## Area 1: Filename Normalization

### Q1 — Session filename strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pass-through prefix | `${project}__${basename}`, zero parsing, zero failure modes | ✓ |
| Parse + reconstruct | Regex extract date+slug, rebuild per NBLM-07 strict format | |
| Use file mtime as date | Ignore filename, extract from `statSync().mtime` | |

**User's choice:** Pass-through prefix (recommended default).
**Notes:** Sessions already follow `YYYY-MM-DD-slug.md` convention enforced by session-manager skill. Non-conforming sessions treated as user error.

### Q2 — ADR filename extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Regex parse | `^(\d{4})-(.+)\.md$` → NNNN + slug | ✓ |
| Frontmatter-driven | Require YAML `number:`, `slug:` fields | |
| Pass-through prefix | `${project}__ADR-${basename}` — violates NBLM-08 literal format | |

**User's choice:** Regex parse (recommended default).
**Notes:** ADR-0001 in vault has no frontmatter, so the frontmatter-driven option would have needed retroactive frontmatter addition. Regex matches existing convention and emits warn+skip on files without NNNN prefix (like READMEs that might live in `decisions/`).

### Q3 — Docs filename handling

| Option | Description | Selected |
|--------|-------------|----------|
| Always prepend `doc-` | `${project}__doc-${basename}` — deterministic, zero conditionals | ✓ |
| Smart: skip prefix if already has it | `if basename.startsWith('doc-')` branch | |
| Strip extension, reformat | `${project}__doc-${slug}.md` via rebuild | |

**User's choice:** Always prepend `doc-` (recommended default).
**Notes:** Current vault has no `doc-` prefixed files in `docs/`, so the theoretical `doc-doc-` double prefix is not visible in practice. Zero conditional logic favored.

### Q4 — Project slug sanitization

| Option | Description | Selected |
|--------|-------------|----------|
| Trust directory name | `readdirSync` entry used as-is | ✓ |
| Re-sanitize defensively | New `sanitizeSlug` helper in `lib/projects.mjs` | |

**User's choice:** Trust directory name (recommended default).
**Notes:** `lib/add-project.mjs:118` already sanitizes at creation time. Re-sanitizing would create a situation where the directory name and sync title differ, breaking the vault-filesystem-to-notebook-title identity relationship.

---

## Area 2: Error Handling & Orchestration

### Q5 — Per-file failure mode

| Option | Description | Selected |
|--------|-------------|----------|
| Continue, collect errors | Append to `stats.errors[]`, manifest untouched for failed files, continue with next | ✓ |
| Abort on first error | Halt whole sync, throw aggregated | |
| Continue until N consecutive errors | Threshold-based abort | |

**User's choice:** Continue, collect errors (recommended default).
**Notes:** Aligns with NBLM-23 "best-effort" philosophy. Next run retries any file without a manifest entry.

### Q6 — Rate-limit behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Abort sync, return partial stats | Stop walk, finalize stats with `rateLimited: true`, return | ✓ |
| Skip file, continue | Treat rate limit like per-file failure | |
| Retry with exponential backoff | In-loop backoff | |

**User's choice:** Abort sync, return partial stats (recommended default).
**Notes:** `notebooklm-py` has `--retry` flag per Phase 2 D-15 which handles upstream retry. In-loop retry would compound and waste quota. Manifest entries for previously-succeeded files persist because of per-file write policy (D-14).

### Q7 — Notebook existence check strategy

| Option | Description | Selected |
|--------|-------------|----------|
| `listNotebooks` → find by title | Call `listNotebooks`, search for `title === notebookName`, create if missing | ✓ |
| Cache ID in manifest | Store `notebook_id` at top level of manifest | |
| `createNotebook` + catch 'already exists' | Always call create, handle duplicate | |

**User's choice:** `listNotebooks` → find by title (recommended default).
**Notes:** Manifest-cache option risks corruption if notebook deleted in NotebookLM UI. Try-create option causes duplicate notebooks because `notebooklm-py create` doesn't dedupe on title. Consequence: Phase 4 must add `listNotebooks()` as 7th function to `lib/notebooklm.mjs` — minimal additive expansion of Phase 2 module.

### Q8 — Walk order

| Option | Description | Selected |
|--------|-------------|----------|
| Stable alphabetical | context → decisions → docs → sessions, alphabetical within | ✓ |
| mtime desc (newest first) | Most recently modified first | |
| Manifest-guided priority | New files first, then changed, then unchanged | |

**User's choice:** Stable alphabetical (recommended default).
**Notes:** Deterministic, trivially testable. Priority is implicit: context.md syncs first (most important), sessions last (append-only, lowest risk if missed on rate limit).

---

## Area 3: Session Append-Only Semantics

### Q9 — What does "append-only" mean in code?

| Option | Description | Selected |
|--------|-------------|----------|
| Upload once, never re-upload | Manifest-presence check (not hash) — skip if entry exists | ✓ |
| Replace-by-filename like everything else | Hash compare, delete+upload on change (like ADRs) | |
| Upload-if-not-in-manifest, never update | Functionally identical to option A but emphasizes the branching | |

**User's choice:** Upload once, never re-upload (recommended default).
**Notes:** Literal interpretation of PROJECT.md Key Decisions "sessions are append-only". Retroactive session edits will NOT sync — intentional for historical-record semantics. Compromises 1 of 5 Phase 4 success criteria ("editing one file re-uploads only that file") but only for sessions, which are a special case per PROJECT.md.

### Q10 — Replace mechanism for non-sessions

| Option | Description | Selected |
|--------|-------------|----------|
| `deleteSourceByTitle` + upload only if hash changed | Phase 3 hash compare → delete-then-upload path for changes only | ✓ |
| Always `deleteSourceByTitle` + upload | No hash check, 2× API calls for unchanged files | |
| Use Phase 2 `updateSource` | Requires cached `sourceId` from manifest | |

**User's choice:** `deleteSourceByTitle` + upload only if hash changed (recommended default).
**Notes:** Leverages Phase 3 manifest fully. Idempotent on delete-not-found (if title doesn't exist, continue with upload). Preserves NBLM-15 "skip unchanged, no API calls".

---

## Area 4: Module API Surface & Return Shape

### Q11 — Module structure

| Option | Description | Selected |
|--------|-------------|----------|
| One `syncVault(opts)` + private helpers | Single public export, internals hidden | ✓ |
| Decomposed exports | Export `syncVault`, `buildTitle`, `walkVault`, `buildSyncPlan` | |
| Two exports: `syncVault` + `buildSyncPlan` | Public `buildSyncPlan` for Phase 5 status | |

**User's choice:** One `syncVault(opts)` + private helpers (recommended default).
**Notes:** Smaller surface = easier to refactor later. Dry-run option covered via D-20 (same function, different behavior). Status command in Phase 5 can call `syncVault({ dryRun: true })` for its planning data.

### Q12 — Return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Stats object | `{ uploaded, skipped, failed, errors[], durationMs, notebookId, rateLimited }` | ✓ |
| Async iterator / event stream | `for await (const event of syncVault())` | |
| Logger injection + void return | `syncVault({ logger: fn })`, caller aggregates | |

**User's choice:** Stats object (recommended default).
**Notes:** Phase 5 session-end trigger is silent background; streaming adds no value. Phase 5 `notebooklm status` reads the stats object directly.

---

## Follow-up Questions

### Q13 — Manifest update timing

| Option | Description | Selected |
|--------|-------------|----------|
| After each successful upload | `writeManifest()` per file, crash-resilient | ✓ |
| Batch at end of sync | Single write, cheaper but loses progress on crash | |
| Hybrid: every N files | Compromise with counter state machine | |

**User's choice:** After each successful upload (recommended default).
**Notes:** Phase 3's `.tmp + renameSync` makes per-file writes cheap (<5ms on SSD). Crash mid-sync preserves progress up to last successful upload.

### Q14 — `reverseProjectMap` gap handling

| Option | Description | Selected |
|--------|-------------|----------|
| Inline `readdirSync` in `notebooklm-sync.mjs` | Walker does vault/projects discovery inline | ✓ |
| Extract `listVaultProjects` helper to `projects.mjs` | New reusable helper for Phase 5 status/doctor | |
| Refactor `getProjects()` for export | Existing function is richer than needed | |

**User's choice:** Inline `readdirSync` in `notebooklm-sync.mjs` (recommended default).
**Notes:** ROADMAP §Phase 4 SC5 references `reverseProjectMap()` which doesn't exist as an exported function — only an inline variable in `mapProjects()` mapping source-code paths to vault project names (opposite direction). SC5 satisfied in spirit (no duplicated slug generation) but not literally. Project slug IS the directory name; no generation needed.

---

## Claude's Discretion

The following points were explicitly left to the planner in CONTEXT.md:

- Exact names of private helpers (`walkProjectFiles`, `buildTitle`, `ensureNotebook`, `syncOneFile`) — proposals only
- Format of `errors[].reason` string (short human vs `error.message` vs structured code)
- Whether to memoize `hashFile` results within a single sync run
- Whether `dryRun` bypasses `listNotebooks` entirely or still calls it for `notebookId` in return value
- Test fixture layout for multi-project vaults — extend existing `notebooklm-stub.sh` vs create scenario-specific stubs
- `findVault() null` handling in `syncVault` — throw vs return stats with `errors[]`
- Policy when `listNotebooks` returns multiple notebooks with the same title (SKILL.md is silent)

## Deferred Ideas

Captured in CONTEXT.md §Deferred. Highlights:
- Dry-run mode output format (Phase 5 concern)
- 0-byte file handling
- Parallel uploads (v2)
- Notebook cleanup / stale source removal
- Session re-sync command (to work around D-12 hard rule)
- Per-project notebooks (v2)
- Frontmatter-aware title extraction
- Content transformation before upload
- Streaming progress events
- Rate-limit retry with backoff
- Cross-machine manifest reconciliation (carried from Phase 3)
