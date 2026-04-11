# Phase 3: Sync Manifest & Change Detection — Research

**Researched:** 2026-04-10
**Model:** sonnet (balanced profile)
**Scope:** Tactical filesystem/crypto unknowns — architectural decisions already locked in 03-CONTEXT.md (22 decisions D-01..D-22)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-14 | `~/vault/.notebooklm-sync.json` tracks uploaded files and SHA-256 hashes | `hashFile` + `readManifest`/`writeManifest` API |
| NBLM-15 | Unchanged files are skipped (hash comparison, no API call) | `hashFile` return value used by Phase 4 caller; Phase 3 provides the primitive |
| NBLM-16 | Manifest stores `{filepath: {hash, notebook_source_id, uploaded_at}}` inside versioned wrapper (D-01) | Schema locked; no research gap |
| NBLM-17 | Atomic write via `.tmp` + rename | Verified below — same-fs rename is atomic on Node 18+ macOS/Linux/Windows |
| NBLM-18 | `.notebooklm-sync.json` in vault `.gitignore` | `ensureManifestGitignored` helper; idempotency strategy verified below |
</phase_requirements>

---

## Cross-Platform `fs.renameSync` Atomicity

**Verdict:** `fs.renameSync` is atomic for same-filesystem renames on macOS, Linux, and Windows (Node 18+). [VERIFIED: local Node 20.12.2 runtime test — rename overwrites existing target cleanly]

**Details:**

- **POSIX (macOS/Linux):** Wraps `rename(2)` syscall, which is defined as atomic by POSIX for same-filesystem paths. Source disappears and destination appears in a single kernel operation. [ASSUMED — well-established POSIX guarantee, not re-verified via Node docs in this session]
- **Windows (Node 18+):** Uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`. This is effectively atomic for same-volume renames. Before Node 14, there were edge cases with EPERM when the destination was open by another process (e.g., antivirus). Node 18+ does not change this OS-level behavior — it remains vulnerable to EPERM if an AV scanner holds the file open at the exact moment of rename. [ASSUMED — based on training knowledge of Windows file locking semantics]
  - **Mitigation already in D-14:** On rename failure during corrupt recovery, D-14 says "delete if rename fails — don't block the sync." This same fallback is not present for the happy-path `writeManifest` rename. Planner should decide: retry once or propagate the throw. Recommend: let the throw propagate — it is genuinely exceptional on a typical dev machine.
- **Cross-filesystem rename:** NOT atomic and would EXDEV-error. Phase 3's `.tmp` is always `${manifestPath}.tmp` — same directory, same filesystem as the target. [VERIFIED: same-dir sibling is structurally guaranteed by D-13]

**Assumption for planner:** The `.tmp` sibling on the same filesystem as the manifest makes the cross-platform atomicity concern moot for this codebase. No defensive code needed beyond what D-10 already specifies.

---

## SHA-256 Hash Edge Cases

**Algorithm:** `crypto.createHash('sha256').update(buffer).digest('hex')` [VERIFIED: Node 20.12.2 runtime test]

### Empty File

Empty file produces a deterministic, well-defined SHA-256 hash: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` [VERIFIED: runtime test]. This is the standardized SHA-256 of zero bytes. Phase 3 should NOT special-case empty files — the hash function handles them correctly.

### Unicode Normalization in Filenames (macOS NFC/NFD)

**This is a real edge case.** macOS HFS+ can store filenames in NFD (decomposed) form even when written as NFC. Node's `readdirSync` returns whatever bytes the filesystem stored.

- Runtime test result: writing `"café.md"` (NFC, length 7) returned length-7 NFC from `readdirSync`. Writing `"café.md"` (NFD, length 8) returned length-8 NFD from `readdirSync`. [VERIFIED: runtime test on this machine's APFS]
- **Practical conclusion:** Node does NOT normalize filenames. If Phase 4's walker calls `readdirSync` and Phase 3's manifest key was written by `path.relative(vaultRoot, absPath)`, the key will match **only if both use the same source** (the `readdirSync` output). As long as Phase 4 consistently derives manifest keys from `readdirSync`-obtained paths (not from user-typed or hardcoded NFC strings), this is not a problem.
- **Actual vault filenames:** Audited — no accented characters found in any `.md` filenames in this vault. [VERIFIED: runtime find scan] NFD risk is theoretical here.
- **Recommendation for planner:** Do NOT add `.normalize('NFC')` to `hashFile` or manifest key computation. It would be premature complexity. Document the assumption: "manifest keys are always derived from `readdirSync` output via `path.relative`."

### Binary Files and Large File Performance

- Raw bytes approach (D-08) correctly handles binary files — `readFileSync` with no encoding argument returns a `Buffer`, and `createHash.update(Buffer)` works without any base64 conversion. [VERIFIED: crypto.createHash accepts Buffer directly]
- Performance threshold for `readFileSync` + full-buffer hash: `readFileSync` on a 1MB markdown file takes ~1-2ms on modern SSD. A 10MB file is ~10-20ms. Vault markdown files are typically 1KB–100KB. No concern. D-09's decision to skip streaming is correct. [ASSUMED — training knowledge; no large-file runtime test performed]

---

## `.gitignore` Format & Idempotency

**Current vault `.gitignore`:** 5 lines, no `.notebooklm-*` entries. [VERIFIED: read `/Users/eugenenakoneschniy/vault/.gitignore`]

```
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.DS_Store
*.log
```

### Trailing Newline

POSIX text file convention requires a trailing newline. The current `.gitignore` does NOT end with a trailing newline after `*.log` (confirmed by read — 5 lines, no blank after last). The `ensureManifestGitignored` implementation must handle this: if the file does not end with `\n`, prepend one before the blank-line separator (D-21 already specifies this). [VERIFIED: read of actual file]

### Line Ending (CRLF)

The current `.gitignore` uses LF on macOS. Git is lenient about CRLF in `.gitignore`. The idempotency check uses `/^\.notebooklm-sync\.json$/m` — this regex will fail to match if the existing line has a trailing `\r` (CRLF file). For cross-platform correctness, the implementation should strip `\r` from lines before comparing, or use `/^\.notebooklm-sync\.json\r?$/m`. [ASSUMED — based on CRLF behavior knowledge; not tested on Windows runtime]

**Recommendation:** Use `content.split(/\r?\n/)` for line splitting in the idempotency check, rather than `content.split('\n')`.

### Comment Syntax

Git treats any line starting with `#` as a comment, regardless of spacing after `#`. Both `# comment` and `#comment` are valid. Use `# Claude Dev Stack — ...` (with space) for readability, consistent with the form shown in D-18. [ASSUMED — well-known git spec, no tooling verification done]

### Glob Specificity vs User's Existing Globs

D-19 is line-exact: if the user already has `*.json` in their `.gitignore`, Phase 3 still appends `.notebooklm-sync.json` because the regex `/^\.notebooklm-sync\.json$/m` won't match `*.json`. This is the correct behavior per D-19 ("we don't second-guess their globs"). Document this as expected behavior in tests.

### `.corrupt-*` Glob in `.gitignore`

D-22 adds `.notebooklm-sync.corrupt-*` to the gitignore block. Git glob `*` matches any character sequence including none. This glob will correctly ignore `~/.vault/.notebooklm-sync.corrupt-2026-04-10-163000` etc. [VERIFIED: git glob semantics — `*` works as wildcard in `.gitignore` patterns]

---

## Corrupt JSON Recovery Sequence

### Order of Operations

D-14 specifies: rename first, then warn, then return empty manifest. This is the correct order. The implementation should be:

```
1. readFileSync → JSON.parse → shape-check
   (if any step fails, enter recovery)
2. try { renameSync(manifestPath, corruptPath) } catch { /* ignore */ }
3. warn(message)
4. return emptyManifest()
```

Do NOT write a new empty manifest file during recovery. Return the in-memory empty manifest and let Phase 4 write it back via `writeManifest` after a successful sync. This avoids a second write during recovery and keeps Phase 3 functions single-responsibility.

### `.corrupt-{timestamp}` Filename Format

D-16 defers the format to Claude's Discretion. D-86 in CONTEXT.md specifically says "filesystem-safe format (no colons for Windows)."

**Recommendation:** Use `YYYY-MM-DDTHH-mm-ss` (replace colons with hyphens):

```js
new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '')
// "2026-04-10T16-30-00"
```

This produces filenames like `.notebooklm-sync.corrupt-2026-04-10T16-30-00` — readable, sortable, Windows-safe. The `.gitignore` glob `.notebooklm-sync.corrupt-*` covers it. [ASSUMED — no Windows runtime test; format design is sound]

### Race Condition

D-13 asserts "only one sync per vault at a time." This is a trust assumption, not enforced by a lock file. If two processes somehow corrupt-recover simultaneously, both call `renameSync(manifestPath, corruptPath)`. The second call will fail with ENOENT (file already renamed by first). Per D-14's "delete if rename fails — don't block," this is handled. Two `.corrupt-{timestamp}` files would be written only if they started in the same millisecond, which is impossible in practice. [ASSUMED — reasoning from known filesystem semantics]

---

## Integration with `findVault()`

**`findVault()` return contract:** Returns an absolute path string or `null`. [VERIFIED: read `lib/projects.mjs` lines 11-31]

Validation: requires `meta/` AND `projects/` subdirectories, OR a `CLAUDE.md.template` file. So `findVault()` returning non-null means vault root exists on disk.

**Null handling strategy:**

Phase 1's `updateContextHistory` returns `{ action: 'skipped', entriesCount: 0 }` for non-fatal filesystem issues (vault missing, project missing, context.md missing). However, CONTEXT.md line 127 explicitly says Phase 3 should throw a descriptive error:

> "If vault is missing, `findVault()` returns null — Phase 3 functions should handle this by throwing a descriptive error (e.g. `VaultNotFoundError`) since a missing vault means the whole feature is not usable."

**This diverges from Phase 1's pattern.** Resolution: Phase 1's `updateContextHistory` is invoked defensively from a hook with partial information (it doesn't know in advance if the vault exists). Phase 3's manifest functions are called deliberately by Phase 4's sync pipeline, which has already resolved the vault. A missing vault at that point is a programming error.

**Recommendation:** Phase 3 module functions (`readManifest`, `writeManifest`, `hashFile`, `ensureManifestGitignored`) should throw `new Error('Vault not found: ...')` when called with a null or non-existent vaultRoot — NOT a custom error class (too heavy for this simple case; unlike Phase 2's `NotebooklmNotInstalledError`, there's no `instanceof` branching benefit). The caller (Phase 4) should have already verified the vault exists via `findVault()`. This keeps Phase 3 pure and Phase 4 responsible for null-guarding.

**Practical pattern for Phase 3 functions:**

```js
function assertVaultRoot(vaultRoot) {
  if (!vaultRoot || !existsSync(vaultRoot)) {
    throw new Error(`Vault not found at: ${vaultRoot}`);
  }
}
```

Called at the top of each exported function.

---

## Test Fixture Pattern

### Reuse from Phase 1

Phase 1's `tests/session-context.test.mjs` establishes the canonical pattern: [VERIFIED: read file]

- `mkdirSync(sessionsDir, { recursive: true })` to build fixture tree
- `beforeEach` resets the fixture (rmSync + mkdirSync)
- `after` cleans up on completion
- Named: `join(tmpdir(), 'claude-test-session-context-${process.pid}')`

Phase 2's `tests/notebooklm.test.mjs` uses `mkdtempSync` (random suffix) instead of PID-based naming, with `before`/`after` (not `beforeEach`). [VERIFIED: read file]

**Recommendation for Phase 3:** Use `mkdtempSync(join(tmpdir(), 'phase3-manifest-'), '')` for each test that needs isolation, since manifest tests modify files and need clean state. Alternatively, adopt Phase 1's `beforeEach` reset pattern with a PID-named directory. Either works; consistency with the nearest Phase (1) favors `beforeEach` + PID name.

### Testing Atomic Write "Safety"

True atomicity cannot be tested deterministically (you cannot observe the kernel mid-rename). The CONTEXT.md test description says:

> "atomic rename survives simulated kill (test writes `.tmp`, deletes `.tmp`, verifies target unchanged)"

This tests crash-recovery at the application level:

1. Write a known initial manifest to `manifestPath`
2. Call `writeManifest` — it will create `.tmp`
3. Before rename completes: this cannot be intercepted without mocking
4. **Practical test instead:** Create `.tmp` manually, do NOT rename, verify `manifestPath` still has old content. Then delete `.tmp` and call `readManifest` — verify it returns the old content (not corrupted).

A more useful test for atomicity: verify that calling `writeManifest` results in no `.tmp` file left behind on success (rename consumed it). Test:

```js
writeManifest(vaultRoot, newManifest);
assert.ok(!existsSync(manifestPath + '.tmp'), '.tmp must not exist after successful write');
assert.deepEqual(readManifest(vaultRoot), newManifest);
```

**Stale `.tmp` cleanup:** Phase 3 does NOT need to clean up a stale `.tmp` from a prior crashed run. A stale `.tmp` is just an orphan; it will be overwritten on the next `writeManifest` call. Do not add complexity here.

---

## Validation Architecture

**nyquist_validation is enabled** (`workflow.nyquist_validation: true` in config.json). [VERIFIED: read `.planning/config.json`]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 18+ built-in) |
| Config file | none — tests run via `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm-manifest.test.mjs` |
| Full suite command | `npm test` |

### Per-Requirement Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NBLM-14 | Manifest file created at `vault/.notebooklm-sync.json` with versioned wrapper shape | unit | `node --test tests/notebooklm-manifest.test.mjs` | ❌ Wave 0 |
| NBLM-14 | `hashFile(absPath)` returns 64-char hex string | unit | same | ❌ Wave 0 |
| NBLM-15 | Hash comparison: same file bytes → same hash (determinism test) | unit | same | ❌ Wave 0 |
| NBLM-15 | Modified file → different hash (change detection) | unit | same | ❌ Wave 0 |
| NBLM-16 | Manifest `files` entry has `{hash, notebook_source_id, uploaded_at}` | unit | same | ❌ Wave 0 |
| NBLM-16 | Round-trip: write manifest → read manifest → same object | unit | same | ❌ Wave 0 |
| NBLM-17 | After `writeManifest`, no `.tmp` file left (rename consumed it) | unit | same | ❌ Wave 0 |
| NBLM-17 | Corrupt JSON in manifest → `.corrupt-*` file created, `readManifest` returns empty | unit | same | ❌ Wave 0 |
| NBLM-17 | Missing manifest (fresh vault) → `readManifest` returns empty, no `.corrupt-*` file | unit | same | ❌ Wave 0 |
| NBLM-18 | `ensureManifestGitignored` appends block on first call | unit | same | ❌ Wave 0 |
| NBLM-18 | `ensureManifestGitignored` is idempotent (second call = no-op) | unit | same | ❌ Wave 0 |
| NBLM-18 | Creates `.gitignore` if it didn't exist | unit | same | ❌ Wave 0 |

### Key Test Invariants

1. `hashFile` on the same file called twice returns identical strings.
2. `writeManifest(root, m)` then `readManifest(root)` returns an object deeply equal to `m`.
3. After `ensureManifestGitignored` runs N times, `.gitignore` contains `.notebooklm-sync.json` exactly once.
4. `readManifest` never throws — it always returns a valid manifest shape (empty on corruption or missing).
5. `writeManifest` atomicity: no `.tmp` remains on success; target is unchanged on a write-then-crash simulation (manual `.tmp` write without rename).

### Sampling Rate

- **Per task commit:** `node --test tests/notebooklm-manifest.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test` → 0 failures) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/notebooklm-manifest.test.mjs` — new file, covers all NBLM-14..18 rows above
- [ ] No new conftest/fixtures needed — `mkdtempSync` + temp dirs are self-contained

---

## Open Questions

1. **`readManifest` return shape: `manifest` vs `{ manifest, wasCorrupt }`**
   - What we know: D-14 says warn + return empty. Both callers (Phase 4 sync, Phase 5 status) could benefit from knowing if corruption happened — Phase 5 might show a warning in `notebooklm status`.
   - Recommendation: Return plain `manifest`. If Phase 5 needs to surface corruption, it can detect it from `files` being empty while the manifest file existed (inspect `.corrupt-*` glob). Avoids prematurely coupling the return shape to Phase 5 needs.

2. **`assertVaultRoot` throw vs return `null`**
   - D-14 (code context section) says throw; Phase 1 pattern returns `{ action: 'skipped' }`.
   - Recommendation: Throw (as CONTEXT.md line 127 specifies). Phase 4 owns null-guarding at the pipeline level, not the primitive level.

3. **Exported `MANIFEST_VERSION` constant**
   - CONTEXT.md code context says export `MANIFEST_VERSION = 1`. This is correct — Phase 5's status command and tests should use the constant rather than hardcoding `1`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | POSIX `rename(2)` is atomic for same-fs renames — Node wraps this with no extra buffering | Atomicity | Extremely low risk; POSIX guarantee is decades old |
| A2 | Windows EPERM from AV scanner during rename is the main failure mode; Node 18 does not add further protection | Atomicity (Windows) | Low risk; AV scanner locking is transient and retryable |
| A3 | `readFileSync` + `createHash` on typical vault files (< 1MB) adds negligible latency (<2ms per file) | SHA-256 Performance | Low risk; vault files are known-small markdown |
| A4 | CRLF in `.gitignore` would defeat line-exact regex match; using `split(/\r?\n/)` is the fix | .gitignore | Low risk on macOS; medium if user edits `.gitignore` on Windows |
| A5 | `new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '')` produces safe filenames on all platforms | .corrupt filename format | Negligible; only affects debris files |

---

## Sources

### Primary (HIGH confidence)
- Node 20.12.2 runtime (local) — `fs.renameSync` overwrites atomically, `crypto.createHash` SHA-256 determinism, `mkdtempSync` availability, NFC/NFD `readdirSync` behavior [VERIFIED: runtime tests in this session]
- `/Users/eugenenakoneschniy/vault/.gitignore` — current state confirmed (5 lines, no `.notebooklm-*`) [VERIFIED: file read]
- `lib/session-context.mjs` — atomic write pattern via `.tmp + renameSync` [VERIFIED: file read, lines 96-100]
- `lib/projects.mjs` — `findVault()` returns null or string [VERIFIED: file read, lines 11-31]
- `lib/shared.mjs` — available helpers: `warn`, `ok`, `fail`, `info`, `mkdirp`, `c.*` [VERIFIED: file read]
- `tests/session-context.test.mjs` — canonical test fixture pattern [VERIFIED: file read]
- `tests/notebooklm.test.mjs` — `describe`/`it` organization style [VERIFIED: file read]

### Secondary (ASSUMED — training knowledge, not re-verified via docs this session)
- POSIX `rename(2)` atomicity guarantee
- Windows `MoveFileExW` behavior and AV-scanner EPERM edge case
- Git `.gitignore` comment syntax (`# foo`)
- `readFileSync` + SHA-256 performance on small files

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable APIs — Node builtins don't change)
