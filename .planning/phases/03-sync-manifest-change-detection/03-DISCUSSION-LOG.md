# Phase 3: Sync Manifest & Change Detection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 03-sync-manifest-change-detection
**Areas discussed:** Manifest file schema, Hash encoding & timestamp format, Atomic write mechanism, Corrupt manifest recovery policy, `.gitignore` migration semantics
**Mode:** Batched single-turn acceptance of all recommended defaults

---

## Discussion Flow

All 5 gray areas were presented in a single pre-analysis turn with full option tables and recommendations. The user accepted all recommendations in one reply (`1`), meaning "accept all defaults and write CONTEXT.md". No per-area follow-up was needed.

---

## A. Manifest file schema

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Flat map `{filepath: {hash, source_id, uploaded_at}}` | Exactly what NBLM-16 says, minimal. No version field, no metadata. | |
| 2. Versioned wrapper `{version, generated_at, files: {...}}` | One extra level of nesting but future-proof. Explicit schema version. | ✓ |
| 3. Versioned + generation counter | Adds `generation: N` incrementing each run. Useful for "which run uploaded this?" debug. | |
| 4. Flat with marker field `{__schema: "v1", "path": {...}}` | Avoids nesting but mixes metadata with data. Ugly. | |

**User's choice:** Option 2 (recommended default)
**Rationale:** One line of cost now prevents a migration nightmare later when v2 adds per-project notebook fields or other metadata. `generated_at` (ISO 8601) is useful for "last sync was when?" debugging without needing to call `notebooklm list`.

---

## B. Hash encoding & timestamp format

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Hex hash (64 chars) + ISO 8601 timestamp | Standard, human-readable in git diffs, searchable. | ✓ |
| 2. Base64 hash (44 chars) + Unix epoch ms | Smaller file, but harder to eyeball. | |
| 3. Hex hash + Unix epoch seconds | Standard Unix time, strips sub-second precision. | |
| 4. Truncated hex (first 16 chars) + ISO | 30% smaller file, but non-standard collision math. | |

**User's choice:** Option 1 (recommended default)
**Rationale:** Standards-aligned. Human-readable when user opens the file to debug. File size is not a concern for ~1000 entries. ISO 8601 timestamps are naturally sortable, unambiguous across timezones, and diff-friendly.

---

## C. Atomic write mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| 1. `writeFileSync(.tmp)` + `renameSync(.tmp, final)` | Standard POSIX atomic pattern, Node 18 cross-platform. | |
| 2. `writeFileSync` direct, accept corruption risk | Simpler code. Violates NBLM-17 and fails Success Criterion #4. Reject. | |
| 3. Atomic rename + CRC/checksum inside the file | Belt and suspenders. Adds a field that could itself get out of sync. | |
| 4. Atomic rename + version field as implicit validation | Leverages the `version: 1` field from decision A#2 as a magic number. Two validation layers without extra fields. | ✓ |

**User's choice:** Option 4 (recommended default)
**Rationale:** Combines elegantly with decision A#2 — the `version` field doubles as a corruption detector on read. Adding a separate CRC would be overkill when `JSON.parse` + shape check already give us two validation layers.

---

## D. Corrupt manifest recovery policy

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Throw hard on corrupt manifest | Safest but breaks "best-effort" session-end trigger philosophy from Phase 5 NBLM-23. | |
| 2. Log warning, return empty manifest | Next sync re-uploads everything. Cache philosophy. | |
| 3. Rename corrupt file to `.corrupt-{timestamp}`, start fresh | Preserves debugging context. | |
| 4. Combo of #2 and #3 — rename + warn + empty return | Best of both worlds. | ✓ |

**User's choice:** Option 4 (recommended default)
**Rationale:** Cheap, respects "best-effort" sync philosophy, never loses debugging context. The `.corrupt-*` sibling file helps bug reports — users can attach it without further intervention. Worst case on corruption is a one-time extra sync run, which is tolerable.

---

## E. `.gitignore` migration semantics

| Option | Description | Selected |
|--------|-------------|----------|
| 1. Append one line, create `.gitignore` if missing | Simple but mixes with user entries without namespace hint. | |
| 2. Append with comment header block | Discoverable and namespaced. | |
| 3. Idempotent: scan + add only if absent, with comment header | Handles already-migrated vaults safely. Matches "migrated idempotently" wording in success criterion. | ✓ |
| 4. Use marker pattern `@claude-dev-stack:gitignore:start/end` | Consistent with CLAUDE.md convention but overkill for 6 lines. | |

**User's choice:** Option 3 (recommended default)
**Rationale:** Idempotent with comment header strikes the right balance. Marker pattern from Option 4 is warranted for files with complex managed sections (like CLAUDE.md), not for a short `.gitignore` append. A comment line is sufficient attribution for discoverability.

---

## Claude's Discretion

- Exact module filename (`lib/notebooklm-manifest.mjs` vs `lib/sync-manifest.mjs`)
- Exact exported function names
- Whether to export the manifest path computation as a separate utility or keep it internal
- Whether `readManifest` returns `{manifest, wasCorrupt}` or just `manifest`
- Whether `.corrupt-*` timestamp format uses ISO 8601 or filesystem-safe format (filesystem-safe is probably wiser for Windows compatibility)

## Deferred Ideas

- Schema version 2 with per-project notebook IDs — migration path established via D-02
- Manifest compaction/vacuum for stale entries
- Streaming hash for large files — vault is markdown, not binaries
- Cross-machine manifest dedup — per-machine cache by design, mitigated by replace-by-filename in Phase 4
- Manifest encryption at rest — hashes alone not privacy-sensitive
- Configurable manifest location via env var
- `last_error` / `retry_count` per-file metadata — would bump to version 2 if Phase 4/5 needs it
- Cron-based sync scheduling — REQUIREMENTS v2 NBLM-V2-04
