# Phase 3: Sync Manifest & Change Detection - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `lib/notebooklm-manifest.mjs` — a pure-filesystem helper that maintains `~/vault/.notebooklm-sync.json`, a local cache mapping vault filepaths to their SHA-256 content hash and NotebookLM source ID. This lets Phase 4's sync pipeline skip unchanged files without any API calls and recover cleanly from a corrupt or missing manifest. The phase also ensures `.notebooklm-sync.json` is in the vault's `.gitignore` via idempotent migration on first run.

**In scope:** manifest reader/writer, SHA-256 hashing of vault files, atomic write via `.tmp + rename`, corrupt-file recovery policy, `.gitignore` migration, test coverage for all success criteria.

**Out of scope:** actual walking of `vault/projects/*/**/*.md` to decide what to sync (Phase 4), any API calls or NotebookLM CLI invocation (Phase 4), cron/periodic sync (deferred to v2 per REQUIREMENTS.md), cross-machine manifest sync (deferred), manifest compaction or vacuum (deferred).

**Non-goals:** file-system watching, content normalization before hashing, alternative hash algorithms, per-project manifest files.

</domain>

<decisions>
## Implementation Decisions

### A. Manifest schema — versioned wrapper
- **D-01:** Top-level shape is a **versioned wrapper**, not a flat file→entry map:
  ```json
  {
    "version": 1,
    "generated_at": "2026-04-10T16:30:00.000Z",
    "files": {
      "projects/claude-dev-stack/sessions/2026-04-10-example.md": {
        "hash": "a3f5...64-hex-chars",
        "notebook_source_id": "abc123de-...",
        "uploaded_at": "2026-04-10T16:30:00.000Z"
      }
    }
  }
  ```
- **D-02:** The `version` field is a **hard constant** set to `1` for v0.8 MVP. Readers MUST check it — if missing or not `1`, treat as corrupt (see D-11). This is a cheap forward-compat hook: when v2 adds fields (e.g. per-project notebooks), we bump to `version: 2` and migration code can detect the old shape.
- **D-03:** `generated_at` is the ISO 8601 timestamp of the most recent `writeManifest` call. It's a debugging aid, NOT used by sync logic. Humans eyeballing the file can answer "when was last sync?" without running the status command.
- **D-04:** The `files` key uses **vault-relative paths** (e.g. `"projects/claude-dev-stack/sessions/2026-04-10-example.md"`), not absolute paths. Rationale: the manifest must be deterministic regardless of which user account or `$HOME` ran the sync. Phase 4 will construct these paths using `relative(vaultRoot, absolutePath)` from `node:path`.
- **D-05:** Filepath keys are **POSIX-style forward slashes** even on Windows, for stability across platforms. The manifest should not change content if synced on macOS vs synced on Windows for the same files.

### B. Hash encoding & timestamp format
- **D-06:** Content hash is **hex-encoded SHA-256** — 64 lowercase hex characters. Produced via `crypto.createHash('sha256').update(bytes).digest('hex')`. No truncation, no base64.
- **D-07:** All timestamps (`generated_at`, per-file `uploaded_at`) are **ISO 8601 UTC strings** with millisecond precision: `new Date().toISOString()`. Not Unix epoch, not seconds. Rationale: ISO strings are diff-friendly (git diff of manifest shows human-readable changes), sortable as strings, and unambiguous across timezones.
- **D-08:** Hash computation reads the **raw file bytes** without normalization. No line-ending conversion, no whitespace stripping. Users who touch a file's whitespace and save will trigger a re-sync — predictable behavior, matches their intuition about "I edited this file". Normalization belongs higher up the stack if ever needed (not in scope).
- **D-09:** Hash is computed via `readFileSync` + full-buffer hash, NOT streaming. Vault markdown files are typically <100KB; the added complexity of streaming would pay off only for files in the tens-of-MB range, which don't exist in a vault. If a user somehow puts a huge binary in `vault/projects/*/docs/`, Phase 4 should filter it out anyway — hash complexity doesn't need to.

### C. Atomic write + implicit validation
- **D-10:** Write uses the **POSIX atomic rename pattern**: serialize manifest to JSON string, `writeFileSync(manifestPath + '.tmp', json)`, then `renameSync(manifestPath + '.tmp', manifestPath)`. Node 18's `fs.renameSync` is atomic for same-filesystem renames on macOS, Linux, and Windows. The `.tmp` sibling is always on the same filesystem as the target, so atomicity holds.
- **D-11:** **No separate checksum/CRC field in the file.** The `version: 1` field from D-02 serves double duty as a **magic number for implicit validation**: on read, if `JSON.parse` fails OR the parsed object lacks `version === 1` OR lacks the `files` field, the file is declared corrupt. This gives us two validation layers (parseability + shape) without adding yet another field that could itself get out of sync with content.
- **D-12:** JSON is serialized with `JSON.stringify(manifest, null, 2)` (2-space indent). Pretty-printing costs ~30% more disk space but makes git diffs readable (if users ever accidentally track the file outside the .gitignore migration). Trade-off is worth it for ~1000 entries.
- **D-13:** The `.tmp` filename is `${manifestPath}.tmp` — not timestamped, not PID-scoped. Rationale: only one sync runs per vault at a time (enforced by Phase 5's detached-spawn trigger, which Phase 4 assumes). Multiple concurrent writers would be a bug anyway. A fixed `.tmp` name is fine.

### D. Corrupt manifest recovery policy
- **D-14:** On read failure (missing file, JSON parse error, version mismatch, missing `files` field), the reader does **all three**:
  1. Rename the offending file to `${manifestPath}.corrupt-${timestamp}` (or delete if rename fails — don't block the sync)
  2. Log a warning to stderr via `warn()` from `lib/shared.mjs`
  3. Return an **empty manifest** (`{ version: 1, generated_at: now, files: {} }`) to the caller
- **D-15:** The caller (Phase 4 sync pipeline) treats an empty manifest as "re-sync everything" — that's the natural consequence of the `hash` comparison always missing. This aligns with Phase 5 NBLM-23's "best-effort" philosophy: corruption never surfaces as a terminal error, it just causes a one-time extra sync. Worst case is an API quota spike, which NBLM-05 rate-limit handling already tolerates.
- **D-16:** The `.corrupt-{ISO-timestamp}` sibling file is NEVER automatically cleaned up. Users who want to clean their vault of old corrupt manifests can `rm -f ~/vault/.notebooklm-sync.corrupt-*` manually. The files are preserved for debugging if a bug report comes in.
- **D-17:** A missing manifest (never-before-synced vault) is **not considered corrupt** — it's the expected initial state. `readManifest` returns the same empty manifest shape as the corrupt-recovery path, but without the rename/warn side effects. Callers cannot distinguish "corrupted" from "fresh vault" from their return value — both are "empty manifest, start over".

### E. `.gitignore` migration — idempotent with comment header
- **D-18:** On first call to a new helper like `ensureManifestGitignored(vaultRoot)`, the module:
  1. Read `${vaultRoot}/.gitignore` if it exists (create empty string if not)
  2. If the file's content already contains a line exactly matching `.notebooklm-sync.json` or `.notebooklm-sync.json.tmp`, **no-op and return**
  3. Otherwise, append a block to the end:
     ```
     
     # Claude Dev Stack — NotebookLM sync state (do not commit)
     .notebooklm-sync.json
     .notebooklm-sync.json.tmp
     .notebooklm-sync.corrupt-*
     ```
  4. If `.gitignore` did not exist, create it with just that block (no leading blank line)
- **D-19:** The check at step 2 is **line-exact** — `/^\.notebooklm-sync\.json$/m`. We don't try to detect partial matches (e.g. someone added `*.sync.json`) because that's their prerogative. If our entry is already absent, we add it; we don't second-guess their globs.
- **D-20:** We do NOT use the `@claude-dev-stack:gitignore:start/end` marker pattern. Markers are warranted for files with complex managed sections (like CLAUDE.md), not for a 6-line append to `.gitignore`. A comment header is sufficient annotation for discoverability (users reading their `.gitignore` will see the attribution).
- **D-21:** The function ensures the appended block is preceded by a blank line (if the existing file didn't end with `\n`, one is added before the header). The block itself ends with a trailing `\n`. This produces a clean diff for users who commit `.gitignore` changes separately.
- **D-22:** The `.corrupt-*` glob (D-16) is also listed in the `.gitignore` block — if users get unlucky and corruption happens, the `.corrupt-{timestamp}` sibling files also stay out of git.

### Claude's Discretion
- Exact module filename: `lib/notebooklm-manifest.mjs` proposed. Planner may pick `lib/sync-manifest.mjs` if they prefer scoping the name away from NotebookLM (since the manifest is technically "sync state" and Phase 4 is where NotebookLM-specifics happen). Not a strong preference.
- The exported function names: `readManifest(vaultRoot)`, `writeManifest(vaultRoot, manifest)`, `hashFile(absolutePath)`, `ensureManifestGitignored(vaultRoot)` proposed. Planner may split or merge as feels natural.
- Whether to export the manifest path computation (`manifestPath(vaultRoot)`) as a separate utility or keep it internal. Planner's call.
- Whether `readManifest` returns `{ manifest, wasCorrupt: boolean }` or just `manifest` (with corruption signaled only via `warn()`). Planner decides based on whether Phase 4 needs to know.
- Whether the `.corrupt-*` timestamp uses ISO 8601 (`2026-04-10T16:30:00.000Z`) or filesystem-safe format (`2026-04-10-163000`). Filesystem-safe is probably wiser — colons in filenames break Windows. Planner's call.

### Folded Todos
None — `cross_reference_todos` returned zero matches for Phase 3.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 3 — goal and 5 success criteria
- `.planning/REQUIREMENTS.md` §Change Detection (Manifest) — NBLM-14..18
- `.planning/PROJECT.md` §Constraints — JavaScript single-dep constraint, `node:test` only

### Codebase integration points
- `lib/projects.mjs::findVault()` — resolves vault root path via candidate list (`~/vault`, `~/Vault`, etc.). Phase 3 module imports this to locate `.notebooklm-sync.json`. Do NOT reimplement vault discovery.
- `lib/shared.mjs` — exports `warn()`, `ok()`, `info()`, `fail()` for logging; `c.*` for color constants. Phase 3 module uses `warn()` for corrupt-manifest notices per D-14.
- `tests/project-setup.test.mjs` — reference for testing file-manipulation modules with temp-dir fixtures. Phase 3 test will follow the same pattern: `mkdtemp()` for isolated vault fixture, direct `import` of the manifest module, assertions on both return values and side-effected files.
- `tests/hooks.test.mjs` — reference for the general `describe`/`it` test structure used throughout this codebase

### Builtin Node.js APIs (no new deps)
- `node:crypto` — `createHash('sha256')` for D-06 hash computation. Built into Node 18+, no npm dep.
- `node:fs` — `readFileSync`, `writeFileSync`, `renameSync`, `existsSync`, `statSync`. All the file operations use synchronous variants to match the rest of `lib/*.mjs` patterns.
- `node:path` — `join`, `relative`, `dirname`. For D-04 vault-relative path computation.

### Downstream consumers (for contract awareness)
- **Phase 4** (`.planning/phases/04-.../04-CONTEXT.md` — not yet written) will import Phase 3's exports. Phase 4's walk logic will call `hashFile(absPath)` for each vault file, look up the path in the manifest's `files` map, and skip if hash matches. On upload success, Phase 4 updates the manifest in-memory and calls `writeManifest` once per sync run (not per file — batched for atomicity).
- **Phase 5** will expose `claude-dev-stack notebooklm status` which reads the manifest and prints `generated_at`, file count, and last sync stats. It's a pure read, no writes.

### System-level research hint (from ROADMAP)
- ROADMAP.md line 139 notes: "Confirm Node 18 `fs.rename` atomicity guarantees across platforms (macOS/Linux); verify SHA-256 via `node:crypto` has no hidden cost on large files." — planner should validate this during phase research, but D-10 is based on the assumption that same-filesystem rename IS atomic on Node 18 (which it is per Node docs).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/projects.mjs::findVault()`** — the canonical vault locator. Phase 3 module never hardcodes `~/vault`, always calls this. If vault is missing, `findVault()` returns null — Phase 3 functions should handle this by throwing a descriptive error (e.g. `VaultNotFoundError`) since a missing vault means the whole feature is not usable.
- **`lib/shared.mjs` logging helpers (`warn`, `info`, `ok`, `fail`)** — uniform output style. Phase 3 uses `warn` for corrupt-manifest recovery messages.
- **`lib/shared.mjs::mkdirp`** — directory creation helper. May be needed if `.gitignore` migration needs to ensure parent directory exists (unlikely — vault root always exists before Phase 3 runs).

### Established Patterns
- **Synchronous fs APIs everywhere** — existing `lib/*.mjs` modules use `readFileSync`/`writeFileSync`/`existsSync` rather than `fs.promises`. Phase 3 follows the same pattern. Rationale: CLI tools don't benefit from async I/O concurrency; sync code is simpler to read and test.
- **`node:test` + `node:assert/strict`** — all tests. No mocking libraries. For Phase 3, tests use temp directories via `node:os.tmpdir()` + `fs.mkdtempSync()` to create isolated fixtures.
- **Module exports are plain functions** — no classes, no factories. See `lib/projects.mjs` for the canonical style.
- **Errors propagate via `throw`** — functions either return a valid result or throw. No null returns, no `{ok, err}` tuples.

### Integration Points
- **New module:** `lib/notebooklm-manifest.mjs` — exports `readManifest`, `writeManifest`, `hashFile`, `ensureManifestGitignored`, and a `MANIFEST_VERSION` constant.
- **New test:** `tests/notebooklm-manifest.test.mjs` — covers: write-then-read round trip, atomic rename survives simulated kill (test writes `.tmp`, deletes `.tmp`, verifies target unchanged), corrupt file recovery (write invalid JSON then call `readManifest`, assert `.corrupt-*` exists and return value is empty), `.gitignore` idempotency (call twice, assert single entry), hash determinism (same file bytes produce same hash across calls).
- **No modifications to existing files** in Phase 3 scope. Phase 4 will do the integration.
- **`package.json`** — no changes. All APIs used are Node.js builtins.

### Cross-Platform Notes
- **`fs.renameSync` atomicity**: POSIX-atomic on macOS/Linux for same-filesystem renames. On Windows (Node 18+), atomic for same-volume renames with overwrite semantics. Both behaviors are what we want. Planner should cite Node docs in plan to document the assumption.
- **POSIX forward slashes in manifest keys** (D-05): computed via `pathKey.split(sep).join('/')` where `sep` is `node:path.sep`. This ensures the manifest content is deterministic across platforms.

</code_context>

<specifics>
## Specific Ideas

- User accepted all 5 gray-area recommendations in a single turn. No deviations, no custom follow-ups.
- Phase 3 is **architecturally the simplest phase in the milestone**. No external APIs, no CLI wrappers, no skill modifications — just a manifest file read/write helper. The complexity is in the defensive-coding details (atomic write, corrupt recovery, idempotent migration), not in abstractions.
- Phase 4 is the direct consumer of Phase 3. The planner of Phase 3 should be mindful that `readManifest` + `hashFile` + `writeManifest` get called potentially hundreds of times per sync run (once per vault file for `hashFile`, once or twice for manifest I/O). Performance isn't a concern for vault markdown, but the function shapes should be pleasant to call in a loop.
- The user's vault `.gitignore` currently has 5 lines, no `.notebooklm-*` entries. The first Phase 3 sync on this vault will exercise the migration path (D-18 first-time flow) — it's an organic integration test that will run during the user's actual first sync. The automated tests (D-18 unit test + end-to-end smoke in Phase 4) are still required, but this real-world run is a nice additional validation.
- The user also flagged during the Phase 2 pivot that the vault `decisions/` folder is an unused parallel to GSD `.planning/`. Phase 3's manifest at `~/vault/.notebooklm-sync.json` is notably NOT in `decisions/` — it's in the vault root. This is deliberate: the manifest is **cache state**, not a decision record. The distinction reinforces that `decisions/` should stay human-curated architectural memory.

</specifics>

<deferred>
## Deferred Ideas

- **Schema version `2` with per-project notebook IDs** — v2 requirement NBLM-V2-02 will eventually need to track which notebook each file went to. D-02's version bump mechanism is the intended migration path.
- **Manifest compaction / vacuum** — over time, files deleted from the vault will leave stale entries in the manifest. For MVP, we don't clean them up — they just sit there using a few KB. A `claude-dev-stack notebooklm manifest vacuum` command could be added in v2 if users complain about manifest growth.
- **Streaming hash for large files** — currently `readFileSync` + full-buffer hash. If a user puts a 100MB file in their vault, Node will spike memory. Deferred because vault is meant for markdown, not binaries. Phase 4's file filter should enforce this.
- **Cross-machine manifest sync** — the manifest is per-machine (like pointed out in PROJECT.md constraints). If a user syncs from laptop AND desktop to the same NotebookLM notebook, both machines will have independent manifests and may attempt redundant uploads. Mitigated by replace-by-filename semantics in Phase 4 (duplicates overwrite). Full multi-machine dedup is deferred to v2.
- **Manifest encryption at rest** — manifest contains SHA-256 hashes of file contents but NO source content. Hashes alone are not privacy-sensitive. No encryption needed for MVP.
- **Configurable manifest location** via env var (`NOTEBOOKLM_MANIFEST_PATH=/custom/path.json`) — not in scope. `~/vault/.notebooklm-sync.json` is fine for 99% of cases; advanced users can symlink if they need custom placement.
- **Compressing old `.corrupt-*` files** into a single archive — not in scope. Users can rm them manually.
- **Manifest-level metadata: last_error, retry_count per file** — Phase 4/5 might want these for observability. Not in scope for Phase 3; if needed, we bump to `version: 2` and add fields.
- **Cron-based sync scheduling** — REQUIREMENTS v2 (NBLM-V2-04). Not now.

</deferred>

---

*Phase: 03-sync-manifest-change-detection*
*Context gathered: 2026-04-10*
