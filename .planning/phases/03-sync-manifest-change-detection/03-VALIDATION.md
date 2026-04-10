---
phase: 3
slug: sync-manifest-change-detection
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
updated: 2026-04-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Based on `03-RESEARCH.md` §Validation Architecture (lines 203-251).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node.js native) |
| **Config file** | None |
| **Quick run command** | `node --test tests/notebooklm-manifest.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~1-3 seconds (pure filesystem unit tests, no CLI spawning) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/notebooklm-manifest.test.mjs`
- **After every plan wave:** Run `npm test` (must stay at 96+ passing after Phase 2 — current baseline)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

Populated by planner 2026-04-10. One row per behavior-bearing assertion across the 3 tasks in plan 03-01.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T1-01 | 03-01 | 1 | NBLM-14 | T-03-03 | `MANIFEST_VERSION` exported as integer `1` — readers use constant, not hardcoded literal | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T1-02 | 03-01 | 1 | NBLM-14 | — | `hashFile(absPath)` returns a 64-char lowercase hex string | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T1-03 | 03-01 | 1 | NBLM-15 | — | `hashFile` is deterministic — same bytes → same hash across calls (skip-unchanged primitive) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T1-04 | 03-01 | 1 | NBLM-14 | — | Empty-file hash equals the well-known SHA-256 constant `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T1-05 | 03-01 | 1 | NBLM-15 | — | Different bytes → different hash (change detection primitive for Phase 4 re-sync logic) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T1-06 | 03-01 | 1 | NBLM-14 | — | `hashFile` does NOT normalize line endings — CRLF and LF of same logical content produce different hashes (D-08 raw-bytes policy) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-01 | 03-01 | 1 | NBLM-14, NBLM-16 | T-03-01 | `writeManifest` writes `{version: 1, generated_at: ISO, files: {...}}` to `${vaultRoot}/.notebooklm-sync.json` | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-02 | 03-01 | 1 | NBLM-17 | T-03-07 | After `writeManifest` succeeds, no `.tmp` sibling remains (atomic rename consumed it) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-03 | 03-01 | 1 | NBLM-16 | — | `writeManifest` serializes with 2-space indentation (D-12 pretty-print) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-04 | 03-01 | 1 | NBLM-14 | T-03-03 | `writeManifest(null, ...)` and `writeManifest('/missing', ...)` throw `Error('Vault not found at: ...')` | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-05 | 03-01 | 1 | NBLM-16 | — | `writeManifest` rejects malformed input (`files` missing, `files` not a plain object, manifest null) with descriptive errors | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-06 | 03-01 | 1 | NBLM-14 | — | `readManifest` on a fresh vault (no manifest file) returns `{version: 1, generated_at, files: {}}` with NO side effects (D-17) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-07 | 03-01 | 1 | NBLM-14, NBLM-16 | — | Round-trip: `writeManifest` → `readManifest` preserves `files` entries exactly (deep equal) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-08 | 03-01 | 1 | NBLM-17 | T-03-01, T-03-02 | Invalid JSON → `.corrupt-<timestamp>` rename + `warn()` + empty manifest returned; original `.notebooklm-sync.json` absent after recovery (D-14) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-09 | 03-01 | 1 | NBLM-17 | T-03-01 | `version: 2` in manifest treated as corrupt (D-11 magic-number validation) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-10 | 03-01 | 1 | NBLM-17 | T-03-01 | Missing `files` field treated as corrupt | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-11 | 03-01 | 1 | NBLM-17 | T-03-01 | `files` being an array (not a plain object) treated as corrupt | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-12 | 03-01 | 1 | NBLM-17 | T-03-07 | Crash simulation: `.tmp` written manually then deleted without rename → target manifest unchanged (SC4) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T2-13 | 03-01 | 1 | NBLM-14 | T-03-03 | `readManifest(null)` and `readManifest('/missing')` throw `Error('Vault not found at: ...')` | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-01 | 03-01 | 1 | NBLM-18 | T-03-05 | `ensureManifestGitignored` creates `.gitignore` with only the managed block when none exists, no leading blank line, ends with `\n` (D-18 step 4) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-02 | 03-01 | 1 | NBLM-18 | T-03-05 | Appends managed block to existing `.gitignore` that ends with `\n`, preserving all prior content byte-for-byte (D-21) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-03 | 03-01 | 1 | NBLM-18 | T-03-05 | Repairs missing trailing newline on existing `.gitignore` (matches real `~/vault/.gitignore` state per research) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-04 | 03-01 | 1 | NBLM-18 | T-03-06 | Idempotent: second call is byte-for-byte identical to first (D-19 line-exact match) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-05 | 03-01 | 1 | NBLM-18 | T-03-06 | N calls → exactly one occurrence of `.notebooklm-sync.json` entry (SC5) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-06 | 03-01 | 1 | NBLM-18 | T-03-06 | Recognizes existing CRLF-formatted entry as already-present (idempotency with Windows line endings) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-07 | 03-01 | 1 | NBLM-18 | — | All three managed entries present after migration: `.notebooklm-sync.json`, `.notebooklm-sync.json.tmp`, `.notebooklm-sync.corrupt-*` (D-22) | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-08 | 03-01 | 1 | NBLM-18 | T-03-03 | `ensureManifestGitignored(null)` and `ensureManifestGitignored('/missing')` throw `Error('Vault not found at: ...')` | unit | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ Wave 0 | ⬜ pending |
| T3-99 | 03-01 | 1 | All NBLM-14..18 | — | Full repo test suite green after plan ships — TEST-04 continuous gate | smoke | `npm test` | ⬜ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*File Exists column: ⬜ Wave 0 means the test file will be created by Task 1 of plan 03-01, then extended by Tasks 2 and 3. No pre-existing fixtures required.*

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-manifest.test.mjs` — new test file covering NBLM-14..18 (created in Task 1, extended in Tasks 2 and 3)
- [ ] `lib/notebooklm-manifest.mjs` — the deliverable module itself (created in Task 1, extended in Tasks 2 and 3)
- [ ] No new fixtures needed — `mkdtempSync` + temp dirs are self-contained (no bash stubs like Phase 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| True atomic-write crash recovery | NBLM-17 | Cannot deterministically kill a process mid-`renameSync`. The test simulates a crash by writing `.tmp` then deleting it without renaming, then asserting target unchanged — this tests the *recovery path* but not the atomicity guarantee itself. | On dev machine: create manifest, start `writeManifest` with a large input, SIGKILL the process mid-write (requires a sleep injection), then verify previous manifest intact and `.tmp` still exists (will be cleaned up on next write). Alternatively, trust POSIX rename atomicity guarantee. |
| Cross-platform `fs.renameSync` (Windows antivirus EPERM) | NBLM-17 | Only reproduces on Windows with antivirus active | Phase 5 doctor could surface this; deferred |
| Real-vault migration run | NBLM-18 | Exercises the trailing-newline-repair path against `~/vault/.gitignore` (5 lines, no trailing newline per research). Automated tests cover the equivalent logic in a temp-dir fixture. | On first Phase 4 sync run, observe that `~/vault/.gitignore` gains the managed block cleanly (blank-line separator, correct entries, one occurrence). |

---

## Success Criteria Observability

From ROADMAP.md §Phase 3 Success Criteria:

| SC | Observable Proof | Task Covering |
|----|-----------------|---------------|
| SC1: First sync creates manifest with per-file entries | Write manifest with multiple entries, read it back, assert `files` keys + values match | T2-01, T2-07 |
| SC2: Second sync makes zero upload calls (all unchanged) | `hashFile` determinism test — same file → same hash → Phase 4's "unchanged" branch | T1-03 |
| SC3: Editing single file re-uploads only that file | `hashFile` change-detection test — different bytes → different hash | T1-05 |
| SC4: Kill mid-write leaves previous manifest intact | Simulated crash test: `.tmp` written, deleted without rename, target preserved | T2-12 |
| SC5: Fresh vault's `.gitignore` gets `.notebooklm-sync.json` entry idempotently | Call `ensureManifestGitignored` N times, assert entry appears exactly once | T3-04, T3-05 |

---

## Boundary Conditions → Error Types

From `03-RESEARCH.md` §Corrupt JSON Recovery Sequence + §Integration with findVault():

| Condition | Expected Behavior | Detection Method | Task |
|-----------|-------------------|------------------|------|
| Manifest file missing (fresh vault) | `readManifest` returns empty `{version, generated_at, files: {}}`, no `.corrupt-*` file created | `assert(readdirSync(vaultRoot).filter(f => f.startsWith('.notebooklm-sync.corrupt-')).length === 0)` | T2-06 |
| Manifest JSON parse error | `readManifest` returns empty manifest, renames corrupt file to `.corrupt-<timestamp>`, logs warn | File rename check + sibling filename regex | T2-08 |
| Manifest missing `version` field | Treated as corrupt (same as parse error) | Same as above | T2-10 (covered by missing `files`) / T2-09 (version=2) |
| Manifest missing `files` field | Treated as corrupt | Same as above | T2-10 |
| `files` being an array | Treated as corrupt | Same as above | T2-11 |
| `vaultRoot` null/missing | Throws plain `Error` with descriptive message | `assert.throws(..., /Vault not found at:/)` | T2-04, T2-13, T3-08 |
| Hash of empty file | Returns SHA-256 of zero bytes (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`) | Exact string equality | T1-04 |
| Atomic write crash simulation | Previous manifest unchanged when `.tmp` deleted without rename | File content deep equal | T2-12 |
| Existing CRLF `.gitignore` with marker | Idempotent no-op — file byte-for-byte preserved | String equality | T3-06 |

---

## Invariants

1. `package.json` dependencies remains `{prompts: "^2.4.2"}` after Phase 3 — no new npm packages
2. `lib/notebooklm-manifest.mjs` imports only Node builtins (`fs`, `path`, `crypto`, `os`) and `lib/shared.mjs` — no npm packages
3. `hashFile` is deterministic: same bytes → same hex string
4. `writeManifest` leaves NO `.tmp` file behind on success
5. `readManifest` never throws for corrupt/missing manifests; always returns valid manifest shape
6. `readManifest` throws ONLY when vaultRoot is null/undefined/non-existent
7. `ensureManifestGitignored` is idempotent: N calls → exactly one entry in `.gitignore`
8. `MANIFEST_VERSION` is exported as `1` (integer constant)
9. Vault-relative paths in manifest keys use POSIX forward slashes even on Windows (D-05 — Phase 4's responsibility when writing keys; Phase 3 stores whatever it gets)
10. All timestamps are ISO 8601 UTC strings (`new Date().toISOString()`)
11. `.corrupt-<timestamp>` format is Windows-safe: `YYYY-MM-DDTHH-mm-ss` (hyphens, no colons)

---

## Known Gotchas (from 03-RESEARCH.md)

1. **`~/vault/.gitignore` has no trailing newline** — `ensureManifestGitignored` must check and prepend `\n` before the blank-line separator. Line-exact idempotency check uses `split(/\r?\n/)` for CRLF safety. Handled by Task 3 implementation.
2. **Corrupt recovery doesn't write new manifest** — after `.corrupt-*` rename, return in-memory empty manifest; Phase 4 will write the manifest after its first successful sync run. Don't double-write. Handled by Task 2 `recoverCorruptManifest` helper.
3. **`.corrupt-{timestamp}` format must be Windows-safe** — use `2026-04-10T16-30-00` (colons replaced with hyphens). Handled by Task 2 `filesystemSafeTimestamp` helper.
4. **`findVault()` null handling is a throw, NOT a `skipped` action** — diverges from Phase 1's `lib/session-context.mjs` pattern. CONTEXT.md D-14 locks this: missing vault at manifest-operation time is a caller bug, not a recoverable edge case. Handled by Task 1 `assertVaultRoot` helper.
5. **Corrupt sibling basename must strip `.json`** — the `.gitignore` glob is `.notebooklm-sync.corrupt-*`, so the sibling file must be `.notebooklm-sync.corrupt-<ts>`, NOT `.notebooklm-sync.json.corrupt-<ts>`. Task 2 uses `path.replace(/\.json$/, '')` before appending `.corrupt-<ts>`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task's verify block runs `node --test tests/notebooklm-manifest.test.mjs` (Task 3 also runs full `npm test`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task has direct automated verify
- [x] Wave 0 covers all MISSING references (`tests/notebooklm-manifest.test.mjs`, `lib/notebooklm-manifest.mjs`) — both created in Task 1
- [x] No watch-mode flags
- [x] Feedback latency < 3 seconds per task commit
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — per-task verification map populated by planner 2026-04-10.
