# Phase 19: Project-Level Hooks & Wizard Bug Fixes - Research

**Researched:** 2026-04-14
**Domain:** Claude Code settings.json hooks architecture, bash patch survival, npm package publishing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hook migration strategy (BUG-01)**
- D-01: Global hooks in `~/.claude/settings.json` are left UNTOUCHED — no auto-migration, no removal, no warning to user.
- D-02: Wizard writes new hooks (SessionStart, Stop) only to project `.claude/settings.json` — never to global settings.
- D-03: If project `.claude/settings.json` already exists, wizard merges hooks into it (idempotent, does not overwrite user content).

**allowedTools scope (BUG-02)**
- D-04: allowedTools written to project `.claude/settings.json` includes:
  - `Bash` patterns covering `~/vault/**` read/write (and `~/Vault/**` for macOS case-insensitive FS)
  - Safe git commands: `git status`, `git branch -d`, `git remote prune`, `git log`, `git diff`
- D-05: Patterns must be specific enough to not allow arbitrary bash — follow principle of least privilege.

**GSD patch survival (BUG-06)**
- D-06: `patches/` directory shipped inside the claude-dev-stack npm package. Contains `transition.md` — the patched version with TeamCreate always-on execution.
- D-07: Install wizard copies patches to `~/.claude/gsd-local-patches/` (idempotent copy — only overwrite if source is newer).
- D-08: SessionStart hook checks if `~/.claude/get-shit-done/workflows/transition.md` hash differs from `~/.claude/gsd-local-patches/transition.md`. If different, overwrites GSD file with patch and prints `GSD patches auto-reapplied`.
- D-09: User sees the "GSD patches auto-reapplied" message in SessionStart output (only shown when reapply actually happened).

### Claude's Discretion
- Exact allowedTools pattern syntax (glob vs regex — whatever Claude Code settings.json supports)
- How to detect if hooks are already present before writing (to ensure idempotency)
- Hash comparison implementation in session-start-context.sh (md5/sha1/checksum)

### Deferred Ideas (OUT OF SCOPE)
- Auto-migration of existing global hooks to project-level (add to backlog — would help users with existing setups)
- Per-project allowedTools customization UI in wizard (backlog)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Wizard writes session hooks to project `.claude/settings.json` instead of global `~/.claude/settings.json` | Implementation already exists in `lib/install/hooks.mjs` — verified working, all tests pass. Fallback-to-global remains for zero-projects edge case. |
| BUG-02 | Wizard writes `allowedTools` (vault patterns + safe git commands) to project `.claude/settings.json` | Implementation already exists in `_writeSettingsFile` via `permissions.allow`. Pattern uses `permissions.allow` key (not `allowedTools`). |
| BUG-06 | GSD transition.md patch survives `/gsd-update`. Package ships patches/, wizard copies to gsd-local-patches/, SessionStart hook auto-reapplies. | Infrastructure exists: `patches/transition.md` shipped, `hooks/gsd-auto-reapply-patches.sh` exists, `session-start-context.sh` already invokes it. D-07 (wizard copies to `~/.claude/gsd-local-patches/`) is NOT yet implemented. |
</phase_requirements>

---

## Summary

Phase 19 addresses three bugs in the v0.12 milestone. Research reveals that BUG-01 and BUG-02 are **already implemented** in `lib/install/hooks.mjs` — the code writes hooks and `permissions.allow` entries to per-project `.claude/settings.json` with idempotent merge logic. All structural tests for these bugs pass (715+ tests green). The implementation uses `permissions.allow` (not `allowedTools`) per a fix documented in the source comments as "v0.11 DX-01 bug".

BUG-06 is **partially implemented**. The npm package already ships `patches/transition.md`, `hooks/gsd-auto-reapply-patches.sh` exists with sha256 hash comparison logic, and `session-start-context.sh` already invokes the patch script on SessionStart. The **missing piece** is D-07: the install wizard does not yet copy patches to `~/.claude/gsd-local-patches/`. The current `gsd-auto-reapply-patches.sh` instead resolves the patch source directory at runtime via npm global paths and dev location heuristics — which is a workable alternative to D-07 but differs from the locked decision.

Note: BUG-03, BUG-04, BUG-05 are explicitly out of scope (done in Phase 23 per CONTEXT.md).

**Primary recommendation:** Phase 19 planning should focus on (1) verifying BUG-01/BUG-02 are acceptance-complete against REQUIREMENTS.md criteria, (2) implementing D-07 (wizard copies patches to `~/.claude/gsd-local-patches/` on install), and (3) auditing that the acceptance criteria in REQUIREMENTS.md are fully covered by existing tests.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`fs`, `path`, `os`, `child_process`) | Node >=18 | File I/O, path resolution, shell invocation | No external deps constraint — single-dep rule |
| `prompts` | ^2.4.2 | Interactive wizard prompts | Only allowed JS dependency per project constraint |
| `shasum` (CLI) | macOS built-in | SHA256 hash comparison in bash | Available on all macOS/Linux targets, no install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shasum -a 256` | macOS/Linux built-in | Hash files in bash | Comparing patch vs target file in shell hooks |
| `cpSync` (Node.js fs) | Node >=18 | Recursive directory copy | Copying patches/ directory to `~/.claude/gsd-local-patches/` |
| `JSON.parse` / `JSON.stringify` | Built-in | Idempotent settings.json merge | Read → merge → write settings without clobbering user content |

**Installation:** No new dependencies needed. [VERIFIED: package.json]

---

## Architecture Patterns

### How `lib/install/hooks.mjs` Currently Works [VERIFIED: codebase]

```
installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath, projectsData)
  ├── Copies hook scripts from pkgRoot/hooks/ → ~/.claude/hooks/
  ├── Resolves projects from projectsData.projects (filters by existsSync)
  ├── For each project:
  │     projectClaudeDir = project.path + '/.claude'
  │     settingsPath = projectClaudeDir + '/settings.json'
  │     → _writeSettingsFile(settingsPath, ...)
  └── Fallback: if no projects found → writes to ~/.claude/settings.json (with warn)
```

`_writeSettingsFile` logic [VERIFIED: lib/install/hooks.mjs]:
1. Reads existing settings.json if present (JSON.parse, handles corrupt JSON with early return)
2. Checks for hook presence via `.some()` scan before adding (idempotent)
3. Writes hooks: SessionStart (session-start-context), Stop (session-end-check), PostToolUse/Write|Edit (vault-auto-push), SessionStart (budget-reset), PostToolUse/multi (budget-check)
4. Writes `permissions.allow` array with Read, Glob, Grep, Write(vault/sessions), Read(~/.claude/**), and safe Bash patterns
5. Only calls `writeFileSync` if `changed === true` (pure idempotency)

### Pattern: Idempotent JSON Merge
```javascript
// Source: lib/install/hooks.mjs _writeSettingsFile()
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    warn(`settings.json is corrupt or invalid JSON — skipping hook installation`);
    return;
  }
}
// ... build up settings object ...
if (changed) {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
```
[VERIFIED: lib/install/hooks.mjs]

### Pattern: Hook Presence Check (Idempotency)
```javascript
// Source: lib/install/hooks.mjs
const hasStart = settings.hooks.SessionStart.some(entry =>
  entry.hooks?.some(h => h.command?.includes('session-start-context'))
);
if (!hasStart) {
  settings.hooks.SessionStart.push({ hooks: [{ type: 'command', command: `bash ${startDest}` }] });
  changed = true;
}
```
[VERIFIED: lib/install/hooks.mjs]

### Pattern: SHA256 Hash Comparison in Bash [VERIFIED: hooks/gsd-auto-reapply-patches.sh]
```bash
PATCH_SHA=$(shasum -a 256 "$PATCH_FILE" 2>/dev/null | awk '{print $1}')
TARGET_SHA=$(shasum -a 256 "$TARGET_FILE" 2>/dev/null | awk '{print $1}')
if [ "$PATCH_SHA" != "$TARGET_SHA" ]; then
  cp "$PATCH_FILE" "$TARGET_FILE"
  APPLIED=$((APPLIED + 1))
fi
```

### Pattern: SessionStart Patch Invocation [VERIFIED: hooks/session-start-context.sh]
```bash
# BUG-06: Auto-reapply GSD patches after /gsd-update (silent on no-op)
HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HOOKS_DIR/gsd-auto-reapply-patches.sh" ]; then
  bash "$HOOKS_DIR/gsd-auto-reapply-patches.sh" 2>/dev/null || true
fi
```

### Pattern: PATCHES_DIR Resolution in gsd-auto-reapply-patches.sh [VERIFIED: hooks/gsd-auto-reapply-patches.sh]
Current implementation resolves the patches source directory at RUNTIME from:
1. `$(npm root -g)/claude-dev-stack/patches` (npm global)
2. `$HOME/.npm/_npx/*/node_modules/claude-dev-stack/patches` (npx cache)
3. `$HOME/.local/share/npm/lib/node_modules/claude-dev-stack/patches`
4. Dev locations: `~/Projects/claude-dev-stack/patches`, `~/projects/claude-dev-stack/patches`, `~/code/claude-dev-stack/patches`

D-07 calls for wizard to copy patches to `~/.claude/gsd-local-patches/` at install time so the patch hook has a stable, version-pinned source regardless of npm cache state.

### Anti-Patterns to Avoid
- **Writing to global `~/.claude/settings.json` as primary path:** Already fixed — code only uses global as explicit fallback when `projects.length === 0`.
- **Using `allowedTools` key instead of `permissions.allow`:** Already fixed per v0.11 DX-01 bug note in source.
- **Hash comparison with `md5` instead of `shasum`:** `md5` is BSD-only; `shasum -a 256` is available on macOS and Linux. [VERIFIED: existing implementation uses shasum correctly]
- **Overwriting settings.json without reading first:** Existing code always reads before writing.

---

## Implementation Gap Analysis (What Still Needs Building)

### BUG-01 Status: IMPLEMENTED [VERIFIED: lib/install/hooks.mjs, tests/install.test.mjs]
All structural tests pass. The implementation correctly:
- Writes hooks to per-project `.claude/settings.json`
- Merges idempotently (does not overwrite user content)
- Falls back to global only if no projects found (with explicit warning)

**What to verify:** Does REQUIREMENTS.md acceptance criteria state something beyond what's tested? Review BUG-01 criteria vs. existing test coverage.

### BUG-02 Status: IMPLEMENTED [VERIFIED: lib/install/hooks.mjs]
`permissions.allow` patterns written per project settings. Current patterns:
- `'Read'`, `'Glob'`, `'Grep'` (broad read auto-approve)
- `Write(${vaultPath}/**/sessions/*.md)` (vault sessions only)
- `Read(~/.claude/**)` (claude config read)
- `Bash(git status)`, `Bash(git branch *)`, `Bash(git log *)`, `Bash(git diff *)`, `Bash(git remote *)`
- `Bash(ls *)`, `Bash(cat *)`, `Bash(node *)`, `Bash(npm test*)`

**Note:** CONTEXT.md D-04 mentions `~/vault/**` and `~/Vault/**` write patterns — current implementation uses `Write(${vaultPath}/**/sessions/*.md)` which is more restrictive. Planner should check if the REQUIREMENTS.md acceptance criteria require broader vault write patterns beyond sessions.

### BUG-06 Status: PARTIALLY IMPLEMENTED
| Sub-requirement | Status | Notes |
|----------------|--------|-------|
| D-06: `patches/transition.md` shipped in npm package | DONE | `files` in package.json includes `patches/` [VERIFIED] |
| D-07: Wizard copies patches to `~/.claude/gsd-local-patches/` | MISSING | Not in `lib/install/hooks.mjs` or any install step |
| D-08: SessionStart checks hash, reapplies if different | DONE | `gsd-auto-reapply-patches.sh` uses sha256 comparison |
| D-09: Prints "GSD patches auto-reapplied" on reapply only | DONE | Script prints message only when `APPLIED > 0` |

**D-07 implementation needed in `installSessionHook`:**
```javascript
// Copy patches/ directory to ~/.claude/gsd-local-patches/
const patchesSrc = join(pkgRoot, 'patches');
const patchesDest = join(homedir(), '.claude', 'gsd-local-patches');
if (existsSync(patchesSrc)) {
  mkdirp(patchesDest);
  // Idempotent copy: only overwrite if source is newer (use cpSync per-file with mtime check)
  // or simpler: always overwrite (patches are small, version-pinned)
  cpSync(patchesSrc, patchesDest, { recursive: true });
}
```

**Then update `gsd-auto-reapply-patches.sh` to prefer `~/.claude/gsd-local-patches/`** over the runtime npm resolution chain. This makes patch application version-pinned to the install that ran the wizard, which is the intent of D-07.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent JSON merge | Custom deep merge | Read → `.some()` check → push if absent | Already in `_writeSettingsFile`, established pattern |
| Hash comparison | Custom diff | `shasum -a 256` | Already in `gsd-auto-reapply-patches.sh`, universally available |
| File copy with idempotency | Custom mtime comparison | `cpSync` (always overwrite patches — they're small and version-pinned) | Simplest correct approach |

---

## Common Pitfalls

### Pitfall 1: D-07 Patch Copy Timing
**What goes wrong:** Wizard copies patches AFTER hook scripts are already installed. Hook script reads from `~/.claude/gsd-local-patches/` on next SessionStart but directory doesn't exist yet on first session after install.
**Why it happens:** Step ordering issue in `installSessionHook`.
**How to avoid:** Copy patches to `~/.claude/gsd-local-patches/` BEFORE or at the same time as copying hook scripts. Both happen in `installSessionHook`.
**Warning signs:** SessionStart runs but no reapply message, first session misses patches.

### Pitfall 2: gsd-auto-reapply-patches.sh Patch Source Priority
**What goes wrong:** After D-07 is implemented, `gsd-auto-reapply-patches.sh` still uses the npm runtime resolution chain first, ignoring the wizard-copied `~/.claude/gsd-local-patches/`.
**Why it happens:** Current PATCHES_DIR resolution doesn't check `~/.claude/gsd-local-patches/`.
**How to avoid:** Add `~/.claude/gsd-local-patches` as the FIRST candidate in the resolution chain (highest priority — it's the wizard-pinned version).
**Warning signs:** After `/gsd-update`, reapply uses wrong (old npm-cached) patch version.

### Pitfall 3: permissions.allow Pattern Syntax
**What goes wrong:** Using glob patterns that Claude Code doesn't support, or overly broad `Bash(*)` patterns.
**Why it happens:** Claude Code's `permissions.allow` syntax is internal and not externally documented.
**How to avoid:** Use established patterns already in the codebase (current working patterns: `Bash(git status)`, `Bash(git branch *)`, `Write(path/**/pattern.md)`).
**Warning signs:** Permissions not applying on Claude Code launch, prompts still appearing.

### Pitfall 4: Corrupt settings.json During Merge
**What goes wrong:** User's `.claude/settings.json` has non-JSON content (JSONC with comments, or truncated file).
**Why it happens:** Other tools may write JSONC or file may be corrupt.
**How to avoid:** `_writeSettingsFile` already handles this — `try/catch` around JSON.parse returns early with `warn()`. Preserve this guard.
**Warning signs:** Hook silently skipped on a specific project.

---

## Code Examples

### Claude Code settings.json Format [VERIFIED: CONTEXT.md canonical_refs, lib/install/hooks.mjs]
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "bash /path/to/hook.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash /path/to/end.sh", "timeout": 5 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "bash /path/to/push.sh", "timeout": 10 }]
      }
    ]
  },
  "permissions": {
    "allow": [
      "Read",
      "Bash(git status)",
      "Write(/path/to/vault/**/sessions/*.md)"
    ]
  }
}
```

### D-07 Implementation Pattern (wizard side)
```javascript
// In installSessionHook(), after mkdirp(hooksDir) and before project loop:
const patchesSrc = join(pkgRoot, 'patches');
const patchesDest = join(homedir(), '.claude', 'gsd-local-patches');
if (existsSync(patchesSrc)) {
  mkdirp(patchesDest);
  cpSync(patchesSrc, patchesDest, { recursive: true });
  // No separate ok() message needed — silent copy
}
```

### D-07 Hook Side (gsd-auto-reapply-patches.sh preferred source)
```bash
# Check wizard-pinned copy first (D-07 — highest priority)
GSD_LOCAL_PATCHES="$HOME/.claude/gsd-local-patches"
if [ -d "$GSD_LOCAL_PATCHES" ]; then
  PATCHES_DIR="$GSD_LOCAL_PATCHES"
fi
# Fall through to existing npm resolution only if not found
```

---

## Existing Test Coverage

### Tests Already Passing for Phase 19 Requirements [VERIFIED: node --test tests/install.test.mjs → 115 pass, 0 fail]

**BUG-01 coverage (in `tests/install.test.mjs`):**
- `installSessionHook accepts projectsData as 5th argument`
- `writes to project .claude/settings.json not global settings (BUG-01)`

**BUG-02 coverage:**
- `writes permissions.allow with vault patterns (BUG-02)`
- `writes safe bash permissions.allow entries (BUG-02)`

**BUG-06 coverage:**
- `copies gsd-auto-reapply-patches.sh to hooksDir (BUG-06)`
- `patches/transition.md exists in package (BUG-06)`
- `patches/transition.md contains TeamCreate parallel execution content`
- `hooks/gsd-auto-reapply-patches.sh exists (BUG-06)`
- `gsd-auto-reapply-patches.sh is valid bash syntax`
- `gsd-auto-reapply-patches.sh exits 0 when GSD not installed (graceful)`
- `gsd-auto-reapply-patches.sh prints reapply message when patch differs`
- `session-start-context.sh invokes gsd-auto-reapply-patches.sh (BUG-06)`

**What's NOT yet tested (gap for D-07):**
- `installSessionHook copies patches to ~/.claude/gsd-local-patches/`
- `gsd-auto-reapply-patches.sh prefers ~/.claude/gsd-local-patches/ over npm resolution`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `shasum` | gsd-auto-reapply-patches.sh hash comparison | ✓ | macOS built-in | `md5sum` on Linux (already using shasum correctly) |
| `bash` | Hook scripts | ✓ | zsh + bash | — |
| Node.js >= 18 | install wizard, budget hooks | ✓ | macOS built-in check via engines field | — |
| `npm root -g` | PATCHES_DIR resolution in hook | ✓ | npm built-in | Dev location fallback already in script |
| `cpSync` | Patch copy in wizard | ✓ | Node >=18 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none (run via `node --test tests/*.test.mjs`) |
| Quick run command | `node --test tests/install.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | Hooks written to project .claude/settings.json | structural | `node --test tests/install.test.mjs` | ✅ |
| BUG-02 | permissions.allow written with vault + git patterns | structural | `node --test tests/install.test.mjs` | ✅ |
| BUG-06 | Patches copied, hash-compared, auto-reapplied | structural + integration | `node --test tests/install.test.mjs` | ✅ (partial) |

### Sampling Rate
- **Per task commit:** `node --test tests/install.test.mjs`
- **Per wave merge:** `node --test tests/*.test.mjs`
- **Phase gate:** Full suite green (currently 716 pass) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/install.test.mjs` — needs D-07 test: `installSessionHook copies patches/ to ~/.claude/gsd-local-patches/`
- [ ] `tests/install.test.mjs` — needs D-07 test: `gsd-auto-reapply-patches.sh checks ~/.claude/gsd-local-patches/ first`

---

## Project Constraints (from CLAUDE.md)

- **Single-dep constraint preserved:** `prompts@^2.4.2` only — no new JS dependencies [VERIFIED: STATE.md]
- **Test baseline:** 558 (v0.11.0), currently 716 (post Phase 23). Every new `lib/*.mjs` needs matching `tests/*.test.mjs`
- **Branching strategy:** `phase` → `gsd/phase-{phase}-{slug}` branches
- **Commit format:** conventional commits (feat:, fix:, chore:)
- **Code language:** English (comments and code)
- **Communication language:** Russian

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `permissions.allow` is the correct Claude Code settings key (not `allowedTools`) | Architecture Patterns | Permissions won't apply — test on actual Claude Code instance |
| A2 | `cpSync` with `{ recursive: true }` correctly copies patches/ subdirectory | D-07 Implementation | Patches not copied, BUG-06 D-07 incomplete |
| A3 | `shasum -a 256` is available on target Linux machines (not just macOS) | Common Pitfalls | Hash comparison fails silently, patches never reapplied on Linux |

---

## Open Questions

1. **REQUIREMENTS.md BUG-01/02 acceptance criteria vs. current implementation**
   - What we know: Structural tests pass, code is implemented
   - What's unclear: Whether REQUIREMENTS.md acceptance criteria includes runtime/functional tests (not just structural source checks)
   - Recommendation: Planner should read BUG-01/02 acceptance criteria verbatim and check if existing tests satisfy them or if functional tests (actually writing settings.json in a temp dir and verifying content) are required

2. **D-07: Should wizard overwrite patches unconditionally or check mtimes?**
   - What we know: CONTEXT.md says "idempotent copy — only overwrite if source is newer"
   - What's unclear: `cpSync` doesn't have built-in mtime checking; would require per-file `statSync` comparison
   - Recommendation: Use unconditional `cpSync` — patches are small, version-pinned, and the "only if newer" check adds complexity without user-visible benefit. Simpler is safer.

---

## Sources

### Primary (HIGH confidence)
- `lib/install/hooks.mjs` — verified implementation of BUG-01/02 and D-07 gap
- `hooks/gsd-auto-reapply-patches.sh` — verified BUG-06 implementation (D-06, D-08, D-09)
- `hooks/session-start-context.sh` — verified SessionStart hook invokes patch script
- `tests/install.test.mjs` — verified test coverage and pass state (115 pass, 0 fail)
- `package.json` — verified `patches/` in `files` array and single-dep constraint
- `patches/transition.md` — verified file exists with TeamCreate content

### Secondary (MEDIUM confidence)
- `.planning/phases/19-project-level-hooks-wizard-bug-fixes/19-CONTEXT.md` — locked decisions and scope
- `.planning/REQUIREMENTS.md` — BUG-01/02/06 requirement text

---

## Metadata

**Confidence breakdown:**
- BUG-01/02 implementation status: HIGH — directly verified from source code and test results
- BUG-06 implementation gap (D-07): HIGH — absence of gsd-local-patches copy is clearly absent from codebase
- Claude Code settings.json format: MEDIUM — inferred from working implementation, no official spec
- `permissions.allow` vs `allowedTools` key: MEDIUM — documented in source comments as a prior bug fix, not externally verified

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain)
