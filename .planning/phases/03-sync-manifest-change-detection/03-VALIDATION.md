---
phase: 3
slug: sync-manifest-change-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
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

*Populated by planner during `/gsd-plan-phase` — one row per task.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-manifest.test.mjs` — new test file covering NBLM-14..18
- [ ] `lib/notebooklm-manifest.mjs` — the deliverable module itself (imported by tests)
- [ ] No new fixtures needed — `mkdtempSync` + temp dirs are self-contained (no bash stubs like Phase 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| True atomic-write crash recovery | NBLM-17 | Cannot deterministically kill a process mid-`renameSync`. The test simulates a crash by writing `.tmp` then deleting it without renaming, then asserting target unchanged — this tests the *recovery path* but not the atomicity guarantee itself. | On dev machine: create manifest, start `writeManifest` with a large input, SIGKILL the process mid-write (requires a sleep injection), then verify previous manifest intact and `.tmp` still exists (will be cleaned up on next write). Alternatively, trust POSIX rename atomicity guarantee. |
| Cross-platform `fs.renameSync` (Windows antivirus EPERM) | NBLM-17 | Only reproduces on Windows with antivirus active | Phase 5 doctor could surface this; deferred |

---

## Success Criteria Observability

From ROADMAP.md §Phase 3 Success Criteria:

| SC | Observable Proof |
|----|-----------------|
| SC1: First sync creates manifest with per-file entries | Write manifest with 3 entries, read it back, assert `files` keys match |
| SC2: Second sync makes zero upload calls (all unchanged) | Test: hash matches → function returns "unchanged" signal (Phase 4 uses this) |
| SC3: Editing single file re-uploads only that file | Test: change file contents, re-hash, assert new hash differs from stored |
| SC4: Kill mid-write leaves previous manifest intact | Simulated crash test: write `.tmp`, delete without rename, assert target preserved |
| SC5: Fresh vault's `.gitignore` gets `.notebooklm-sync.json` entry idempotently | Call `ensureManifestGitignored` twice, assert entry appears exactly once |

---

## Boundary Conditions → Error Types

From `03-RESEARCH.md` §Corrupt JSON Recovery Sequence + §Integration with findVault():

| Condition | Expected Behavior | Detection Method |
|-----------|-------------------|------------------|
| Manifest file missing (fresh vault) | `readManifest` returns empty `{version, generated_at, files: {}}`, no `.corrupt-*` file created | `assert(existsSync('.corrupt-*') === false)` |
| Manifest JSON parse error | `readManifest` returns empty manifest, renames corrupt file to `.corrupt-{timestamp}`, logs warn | File rename check + `warn()` spy via stderr capture |
| Manifest missing `version` field | Treated as corrupt (same as parse error) | Same as above |
| Manifest missing `files` field | Treated as corrupt | Same as above |
| `findVault()` returns null | Throws plain `Error` with descriptive message | `assert.throws()` |
| Hash of empty file | Returns SHA-256 of zero bytes (well-known constant `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`) | `assert.equal(hashFile(emptyPath), 'e3b0c44...')` |
| Atomic write crash simulation | Previous manifest unchanged when `.tmp` deleted without rename | File content diff |

---

## Invariants

1. `package.json` dependencies remains `{prompts: "^2.4.2"}` after Phase 3 — no new npm packages
2. `lib/notebooklm-manifest.mjs` imports only Node builtins (`fs`, `path`, `crypto`, `os`) and `lib/shared.mjs` — no npm packages
3. `hashFile` is deterministic: same bytes → same hex string
4. `writeManifest` leaves NO `.tmp` file behind on success
5. `readManifest` never throws; always returns valid manifest shape
6. `ensureManifestGitignored` is idempotent: N calls → exactly one entry in `.gitignore`
7. `MANIFEST_VERSION` is exported as `1` (integer constant)
8. Vault-relative paths in manifest keys use POSIX forward slashes even on Windows (D-05)
9. All timestamps are ISO 8601 UTC strings (`new Date().toISOString()`)

---

## Known Gotchas (from 03-RESEARCH.md)

1. **`~/vault/.gitignore` has no trailing newline** — `ensureManifestGitignored` must check and prepend `\n` before the blank-line separator. Line-exact idempotency check uses `split(/\r?\n/)` for CRLF safety. Resolved by planner in Task assigning the gitignore migration function.
2. **Corrupt recovery doesn't write new manifest** — after `.corrupt-*` rename, return in-memory empty manifest; Phase 4 will write the manifest after its first successful sync run. Don't double-write.
3. **`.corrupt-{timestamp}` format must be Windows-safe** — use `2026-04-10T16-30-00` (colons replaced with hyphens). Planner picks exact format; Windows POSIX rule is "no colons in filenames".
4. **`findVault()` null handling is a throw, NOT a `skipped` action** — diverges from Phase 1's `lib/session-context.mjs` pattern. CONTEXT.md D-14 locks this: missing vault at manifest-operation time is a caller bug, not a recoverable edge case.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/notebooklm-manifest.test.mjs`, `lib/notebooklm-manifest.mjs`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 3 seconds per task commit
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills per-task map)

**Approval:** pending — awaiting planner to populate per-task verification map
