---
plan_id: 40-02-gsd-execute-phase-bypassperms-patch
phase: 40
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - patches/gsd-execute-phase-bypassperms.patch
  - lib/install/gsd.mjs
  - tests/install-gsd-patches.test.mjs
autonomous: true
requirements:
  - GSD-PATCH-BYPASSPERMS
user_setup: []
must_haves:
  truths:
    - "`patches/gsd-execute-phase-bypassperms.patch` exists at repo root and is checked into git"
    - "The patch is a unified diff against `~/.claude/get-shit-done/workflows/execute-phase.md` that adds `permission_mode=\"bypassPermissions\"` (or equivalent — exact key matches GSD's Task() schema) to every `Task(subagent_type=\"gsd-executor\", ...)` invocation block"
    - "`lib/install/gsd.mjs` (post-Plan-02) detects `patches/*.patch` files in the package root and applies them to `~/.claude/get-shit-done/` after the npx GSD install step succeeds, idempotently (re-applying an already-applied patch is a no-op)"
    - "Patch application is fail-soft: if the target file's SHA doesn't match the diff's expected hunk context, the wizard prints a warning and continues (does NOT abort the install) — matches the existing Phase 27 SHA-diff infrastructure philosophy"
    - "A regression test asserts the patch FILE is well-formed (parseable as a unified diff, references the correct target path, and contains the bypassPermissions string)"
    - "The patch is NOT applied at plan-time; it is shipped as a file, copied to `~/.claude/gsd-local-patches/` by the existing hooks installer (already done — see lib/install/hooks.mjs lines 41-48), and re-applied by `gsd-auto-reapply-patches.sh` on each session start"
  artifacts:
    - path: "patches/gsd-execute-phase-bypassperms.patch"
      provides: "Unified-diff patch adding bypassPermissions arg to Task() calls in execute-phase.md"
      contains: "bypassPermissions"
    - path: "lib/install/gsd.mjs"
      provides: "GSD installer with patches/*.patch application step appended after npx success"
      contains: "patches"
    - path: "tests/install-gsd-patches.test.mjs"
      provides: "Vitest unit test asserting the patch file is well-formed and references the expected target"
      contains: "gsd-execute-phase-bypassperms"
  key_links:
    - from: "patches/gsd-execute-phase-bypassperms.patch"
      to: "~/.claude/get-shit-done/workflows/execute-phase.md (Task subagent_type=gsd-executor block)"
      via: "unified diff hunk"
      pattern: "subagent_type=\"gsd-executor\""
    - from: "lib/install/gsd.mjs (new applyPatches helper)"
      to: "patches/*.patch files"
      via: "fs.readdirSync + spawnSync('patch', [...])"
      pattern: "patches"
    - from: "lib/install/hooks.mjs (existing patches/ -> ~/.claude/gsd-local-patches/ copy)"
      to: "hooks/gsd-auto-reapply-patches.sh"
      via: "copy at install time + re-apply at session start"
      pattern: "gsd-local-patches"
---

<objective>
Author the GSD workflow patch that auto-passes `permission_mode="bypassPermissions"` to every `Task(subagent_type="gsd-executor", ...)` call in `~/.claude/get-shit-done/workflows/execute-phase.md`, ship it under `patches/` per the Phase 27 SHA-diff infrastructure, and wire `lib/install/gsd.mjs` so the wizard idempotently applies the patch after the GSD install step.

Per D-126: we do NOT modify `~/.claude/get-shit-done/` directly from this project — the user's local GSD install is shared across all projects. The patch infrastructure already handles SHA-diff survival across `/gsd-update`. The patch is checked into the repo, copied to `~/.claude/gsd-local-patches/` by the existing hooks installer (lib/install/hooks.mjs lines 41-48), and re-applied on each session start by `hooks/gsd-auto-reapply-patches.sh`.

Purpose: eliminate the silent Bash-permission failure that breaks `gsd-executor` spawns under Claude Code 2.1.x (root cause from Phase 39 Wave 2 retro — promoted from backlog item 999.2).

Output: 1 new patch file, 1 modified installer module, 1 new test file.

response_language: ru — обоснования и комментарии в репо на английском, общение в чате на русском.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md
@./CLAUDE.md
@./lib/install/gsd.mjs
@./lib/install/hooks.mjs
@./hooks/gsd-auto-reapply-patches.sh
@~/.claude/get-shit-done/workflows/execute-phase.md

<interfaces>
**Existing patch infrastructure (Phase 27):**
- `patches/` directory at repo root — currently empty (only `manager.md` and `transition.md` precedents existed in earlier phases for other GSD files; for execute-phase.md this is the first patch).
- `lib/install/hooks.mjs` lines 41-48 already copies the entire `patches/` dir to `~/.claude/gsd-local-patches/` during the hooks step — so the new `.patch` file is automatically delivered to user's machine the first time they re-run the wizard.
- `hooks/gsd-auto-reapply-patches.sh` runs on session start and re-applies patches from `~/.claude/gsd-local-patches/`. Read this script to confirm its expected patch format (likely standard `patch -p1` unified diff).

**Plan 02 adds two NEW behaviors:**
1. The patch FILE itself (no equivalent for execute-phase.md exists yet).
2. An additional install-time application step in `lib/install/gsd.mjs` so first-time installers get the patch applied immediately, not only after their first session triggers `gsd-auto-reapply-patches.sh`.

**Source-of-truth file to diff against:**
`~/.claude/get-shit-done/workflows/execute-phase.md` — currently 1500+ lines. Key blocks containing `Task(subagent_type="gsd-executor", ...)`:
- Lines ~420-520: the main worktree-mode Task block
- Lines ~525+: the sequential-mode Task block (uses `<sequential_execution>` instead of `<parallel_execution>`)

The patch must add `permission_mode="bypassPermissions"` (or whatever the current Task() schema accepts — confirm by grepping for `permission_mode` or `bypass` in the file before authoring) to BOTH Task blocks. If a `mode=` arg already exists on those Task calls, modify it; otherwise insert as a new keyword arg.

**Patch format constraints:**
- Standard unified diff (`diff -u`), `patch -p1` compatible.
- Hunk context must reference enough surrounding lines (5+ lines on each side per Phase 27 convention) so the patch survives minor upstream edits. If the hunks are too tight, `gsd-auto-reapply-patches.sh` will start failing after any GSD upstream churn.
- File path in the diff header should be relative: `--- a/workflows/execute-phase.md` / `+++ b/workflows/execute-phase.md` (so the existing reapply script's `patch -p1` invocation works regardless of where in the user's filesystem GSD lives).

**Wiring in lib/install/gsd.mjs:**
The current `installGSD()` function returns early on success/failure of the npx step. Plan 02 adds a `applyShippedPatches(pkgRoot)` helper that:
1. Reads `${pkgRoot}/patches/*.patch`.
2. For each patch, computes its target path inside `~/.claude/get-shit-done/` (the diff header tells us — `workflows/execute-phase.md` -> `~/.claude/get-shit-done/workflows/execute-phase.md`).
3. Runs `patch --dry-run -p1 -d ~/.claude/get-shit-done < patch_file`. If dry-run says "already applied" (patch exit 1 with "Reversed (or previously applied) patch detected" in stderr): skip silently — idempotent. If dry-run succeeds: run the real apply. If neither: print warning, continue.
4. Called from `installGSD()` after the npx step's success branch (BEFORE the `return true`).

The helper also runs even if GSD was already up-to-date (the early-skip branch at line 33), so re-installs of the same GSD version still get the patch applied.

**Test (tests/install-gsd-patches.test.mjs):**
Vitest test that:
- Asserts `patches/gsd-execute-phase-bypassperms.patch` exists.
- Asserts the file parses as a unified diff (starts with `--- a/`, has `@@` hunk markers).
- Asserts the target file path in the diff header is `workflows/execute-phase.md`.
- Asserts the patch contains both the string `bypassPermissions` and the string `subagent_type="gsd-executor"` (the latter as anchor context).
- Asserts the patch hunks have ≥5 lines of context on each side (resilience guard).
- Does NOT actually run `patch` — that's manual verification by maintainer + the user-side `gsd-auto-reapply-patches.sh` runtime.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author patches/gsd-execute-phase-bypassperms.patch</name>
  <read_first>
    - ~/.claude/get-shit-done/workflows/execute-phase.md (full Task() blocks for gsd-executor — lines 420-520 and 525+; use Read with offset/limit)
    - hooks/gsd-auto-reapply-patches.sh (confirm patch invocation format)
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md §D-126
  </read_first>
  <files>
    - patches/gsd-execute-phase-bypassperms.patch (new)
  </files>
  <action>
  First, deeply inspect `~/.claude/get-shit-done/workflows/execute-phase.md` to find the exact `Task(subagent_type="gsd-executor", ...)` invocation. Use Read tool with offsets:

  ```
  Read execute-phase.md offset=420 limit=110   # Worktree-mode Task block
  Read execute-phase.md offset=520 limit=40    # Sequential-mode Task block
  ```

  Identify the precise insertion point. The current main Task() call (per gsd-tools view) looks like:

  ```
  Task(
    subagent_type="gsd-executor",
    description="Execute plan {plan_number} of phase {phase_number}",
    model="{executor_model}",
    isolation="worktree",
    prompt="..."
  )
  ```

  Add `permission_mode="bypassPermissions",` as a new keyword arg between `model=...` and `isolation=...` (alphabetical-ish but more importantly: place it consistently in both worktree and sequential variants).

  For the sequential variant (a few hundred lines later), the same insertion: between `model=...` and `prompt=...`.

  IMPORTANT: GSD's actual Task() schema may use `mode=` rather than `permission_mode=`. Confirm by grepping the GSD source first:

  ```bash
  grep -rn "permission_mode\|bypassPermissions\|mode=\"bypass" ~/.claude/get-shit-done/ | head -20
  ```

  If GSD already uses a different keyword (e.g. `mode="bypassPermissions"`), use the exact form GSD already understands. If neither exists in GSD, default to `permission_mode="bypassPermissions"` per the Anthropic Agent SDK convention used in CC 2.1.x — and document the expected schema in a comment ABOVE the patch file (`# Comment lines starting with # are allowed in unified diffs as preamble`).

  Author the patch with `diff -u` style:

  ```diff
  # patches/gsd-execute-phase-bypassperms.patch
  # Phase 40 Plan 02 (D-126): auto-pass bypassPermissions to gsd-executor Task()
  # calls so subagents inherit the parent's permission grants under CC 2.1.x.
  # Re-applied at session-start by hooks/gsd-auto-reapply-patches.sh.
  --- a/workflows/execute-phase.md
  +++ b/workflows/execute-phase.md
  @@ -<old_line>,<count> +<new_line>,<count> @@
   <5+ lines of context>
   Task(
     subagent_type="gsd-executor",
     description="Execute plan {plan_number} of phase {phase_number}",
     model="{executor_model}",
  +  permission_mode="bypassPermissions",
     isolation="worktree",
     prompt="
   <5+ lines of context>
  ```

  Followed by a SECOND hunk for the sequential-mode Task block.

  Author this patch BY HAND — do not run `git diff` against the upstream file (the user's GSD checkout isn't a git repo we can diff against directly). Use the line numbers from the Read calls above to compute correct `@@ -X,Y +A,B @@` headers.

  Verify the hand-authored patch by running `patch --dry-run -p1 -d ~/.claude/get-shit-done < patches/gsd-execute-phase-bypassperms.patch` — if it reports "patch failed", the hunk context is wrong; iterate.

  IMPORTANT: do NOT actually apply the patch (drop the `--dry-run` only when confident). The wizard handles application; manual application here would mutate the maintainer's GSD outside the GSD update mechanism.
  </action>
  <verify>
    <automated>test -f patches/gsd-execute-phase-bypassperms.patch && grep -q "^--- a/workflows/execute-phase.md" patches/gsd-execute-phase-bypassperms.patch && grep -q "bypassPermissions" patches/gsd-execute-phase-bypassperms.patch && grep -q 'subagent_type="gsd-executor"' patches/gsd-execute-phase-bypassperms.patch && patch --dry-run -p1 -d "$HOME/.claude/get-shit-done" < patches/gsd-execute-phase-bypassperms.patch</automated>
  </verify>
  <acceptance_criteria>
    - `test -f patches/gsd-execute-phase-bypassperms.patch` -> exits 0
    - `grep -c "^--- a/workflows/execute-phase.md" patches/gsd-execute-phase-bypassperms.patch` -> 1
    - `grep -c "^+++ b/workflows/execute-phase.md" patches/gsd-execute-phase-bypassperms.patch` -> 1
    - `grep -c "bypassPermissions" patches/gsd-execute-phase-bypassperms.patch` -> >= 2 (one per Task block)
    - `grep -c "@@" patches/gsd-execute-phase-bypassperms.patch` -> >= 2 (one per hunk header)
    - `grep -c 'subagent_type="gsd-executor"' patches/gsd-execute-phase-bypassperms.patch` -> >= 2 (anchor context for both blocks)
    - `patch --dry-run -p1 -d "$HOME/.claude/get-shit-done" < patches/gsd-execute-phase-bypassperms.patch` exits 0 (or exits 1 with "Reversed (or previously applied) patch" if maintainer has already been hand-patched — accept either)
    - Patch file size between 500 bytes and 4 KB (sanity: too small = missing hunks, too large = drifted into unrelated changes)
  </acceptance_criteria>
  <done>
  Patch file authored, parses as unified diff, dry-run applies cleanly against the maintainer's local GSD install.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire applyShippedPatches() into lib/install/gsd.mjs</name>
  <read_first>
    - lib/install/gsd.mjs (current full content)
    - lib/install/hooks.mjs lines 41-48 (existing patches/ copy logic — for awareness, NOT to duplicate)
    - hooks/gsd-auto-reapply-patches.sh (confirm patch invocation flags it uses)
  </read_first>
  <files>
    - lib/install/gsd.mjs (modify)
  </files>
  <action>
  Add a new exported helper `applyShippedPatches(pkgRoot)` and call it from inside `installGSD()` after both the "already up to date" early-return branch AND the "npx success" branch — so re-runs and fresh installs both apply the patch.

  Implementation skeleton:

  ```js
  import { readdirSync } from 'fs';
  // (existing imports stay)

  /**
   * Apply every `patches/*.patch` shipped in this package to the user's
   * ~/.claude/get-shit-done/ install. Idempotent: patches that are already
   * applied report "Reversed (or previously applied)" from `patch --dry-run`
   * and are skipped. Failed patches print a warning but do NOT abort the
   * wizard — matches Phase 27 SHA-diff fail-soft philosophy.
   *
   * Per Phase 40 D-126: GSD lives at ~/.claude/get-shit-done/ shared across
   * all projects. We never edit GSD directly from project install — patches
   * survive /gsd-update via re-application by hooks/gsd-auto-reapply-patches.sh.
   *
   * @param {string} pkgRoot Absolute path to claude-dev-stack repo root
   * @returns {{ applied: string[], skipped: string[], failed: string[] }}
   */
  export function applyShippedPatches(pkgRoot) {
    const patchesDir = join(pkgRoot, 'patches');
    const gsdDir = join(homedir(), '.claude', 'get-shit-done');
    const result = { applied: [], skipped: [], failed: [] };

    if (!existsSync(patchesDir) || !existsSync(gsdDir)) return result;

    let patchFiles;
    try {
      patchFiles = readdirSync(patchesDir).filter((f) => f.endsWith('.patch'));
    } catch {
      return result;
    }

    for (const name of patchFiles) {
      const patchPath = join(patchesDir, name);

      // Dry-run: detect already-applied vs cleanly-applicable
      const dry = spawnSync('patch', ['--dry-run', '-p1', '-d', gsdDir, '-i', patchPath], {
        stdio: 'pipe', encoding: 'utf8', timeout: 10000,
      });

      const stderrLower = (dry.stderr || '').toLowerCase();
      const alreadyApplied = stderrLower.includes('reversed') || stderrLower.includes('previously applied');

      if (alreadyApplied) {
        result.skipped.push(name);
        continue;
      }

      if (dry.status !== 0) {
        warn(`Patch ${name} no longer applies cleanly — skipping. The hooks/gsd-auto-reapply-patches.sh runner will retry on next session.`);
        result.failed.push(name);
        continue;
      }

      // Real apply
      const real = spawnSync('patch', ['-p1', '-d', gsdDir, '-i', patchPath], {
        stdio: 'pipe', encoding: 'utf8', timeout: 10000,
      });

      if (real.status === 0) {
        ok(`Applied GSD patch: ${name}`);
        result.applied.push(name);
      } else {
        warn(`Patch ${name} dry-run passed but real apply failed — investigate manually`);
        result.failed.push(name);
      }
    }

    return result;
  }
  ```

  Wire into `installGSD()` at the two return points:

  ```js
  // D-08: If already latest — auto-skip
  if (installed && latest && installed === latest) {
    ok(`GSD: up to date (v${installed})`);
    applyShippedPatches(pkgRoot);   // <-- NEW
    return true;
  }
  ```

  And after the npx success branch:

  ```js
  if (result.status === 0) {
    ok('GSD installed globally');
    applyShippedPatches(pkgRoot);   // <-- NEW
    return true;
  }
  ```

  Update `installGSD()` signature to accept `pkgRoot`:
  ```js
  export async function installGSD(stepNum, totalSteps, pkgRoot) { ... }
  ```

  Update the caller in `bin/install.mjs` (one line, around line 154) to pass `PKG_ROOT`:
  ```js
  if (await installGSD(n, t, PKG_ROOT)) installed.push('GSD (Get Shit Done)');
  ```

  Add `import { existsSync, readdirSync } from 'fs';` if not already present (the file currently imports `existsSync, readFileSync` — extend with `readdirSync`).
  </action>
  <verify>
    <automated>node --check lib/install/gsd.mjs && node --check bin/install.mjs && grep -c "applyShippedPatches" lib/install/gsd.mjs && grep -c "PKG_ROOT" bin/install.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --check lib/install/gsd.mjs` exits 0
    - `node --check bin/install.mjs` exits 0
    - `grep -c "export function applyShippedPatches" lib/install/gsd.mjs` -> 1
    - `grep -c "applyShippedPatches(pkgRoot)" lib/install/gsd.mjs` -> >= 2 (called in both branches)
    - `grep -c "installGSD(n, t, PKG_ROOT)" bin/install.mjs` -> 1
    - `grep -c "patch --dry-run\|patch.*-i" lib/install/gsd.mjs` -> >= 1 (dry-run usage)
    - `grep -c "Reversed\|previously applied" lib/install/gsd.mjs` -> >= 1 (idempotency check)
    - `grep -c "readdirSync" lib/install/gsd.mjs` -> >= 1 (new import wired)
  </acceptance_criteria>
  <done>
  applyShippedPatches helper authored and called from both code paths in installGSD; bin/install.mjs passes PKG_ROOT through; both files pass syntax check.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add tests/install-gsd-patches.test.mjs (patch file structural assertions)</name>
  <read_first>
    - patches/gsd-execute-phase-bypassperms.patch (post-Task-1)
    - lib/install/gsd.mjs (post-Task-2)
    - tests/install-node-check.test.mjs (Phase 39 Plan 04 — pattern reference for vitest unit test of an install/ helper)
  </read_first>
  <files>
    - tests/install-gsd-patches.test.mjs (new)
  </files>
  <action>
  Create `tests/install-gsd-patches.test.mjs` using `import { describe, it } from 'vitest'` (matches the vitest convention used by other tests/ files post Phase 33). Assertions:

  ```js
  import { describe, it } from 'vitest';
  import assert from 'node:assert/strict';
  import { readFileSync, statSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirname, '..');
  const patchPath = join(repoRoot, 'patches', 'gsd-execute-phase-bypassperms.patch');

  describe('patches/gsd-execute-phase-bypassperms.patch — structural', () => {
    it('exists', () => {
      const stat = statSync(patchPath);
      assert.ok(stat.isFile(), 'patch file must exist');
      assert.ok(stat.size > 200, 'patch file must be > 200 bytes (avoid empty stub)');
      assert.ok(stat.size < 8192, 'patch file must be < 8 KB (sanity bound — too large suggests drift)');
    });

    const body = readFileSync(patchPath, 'utf8');

    it('has unified-diff header pointing at workflows/execute-phase.md', () => {
      assert.match(body, /^--- a\/workflows\/execute-phase\.md$/m, 'must have --- a/ header');
      assert.match(body, /^\+\+\+ b\/workflows\/execute-phase\.md$/m, 'must have +++ b/ header');
    });

    it('contains bypassPermissions addition', () => {
      const additions = body.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      assert.ok(additions.some((l) => l.includes('bypassPermissions')), 'at least one + line must contain bypassPermissions');
    });

    it('anchors on subagent_type="gsd-executor" context (both blocks)', () => {
      const matches = body.match(/subagent_type="gsd-executor"/g) || [];
      assert.ok(matches.length >= 2, `expected >=2 anchor matches (worktree + sequential blocks), got ${matches.length}`);
    });

    it('has at least 2 hunks (one per Task block)', () => {
      const hunks = body.match(/^@@ /gm) || [];
      assert.ok(hunks.length >= 2, `expected >=2 hunks, got ${hunks.length}`);
    });

    it('hunks include adequate context (>= 3 unchanged lines per hunk side)', () => {
      // Quick heuristic: the body should contain plenty of unchanged-line markers.
      // Each unchanged line in unified diff starts with a single space.
      const contextLines = body.split(/\r?\n/).filter((l) => /^ \S/.test(l));
      assert.ok(contextLines.length >= 8, `unified diff must have >= 8 context lines total, got ${contextLines.length}`);
    });
  });

  describe('lib/install/gsd.mjs — applyShippedPatches export', () => {
    it('exports applyShippedPatches', async () => {
      const mod = await import('../lib/install/gsd.mjs');
      assert.equal(typeof mod.applyShippedPatches, 'function', 'must export applyShippedPatches');
    });

    it('returns shape { applied, skipped, failed }', async () => {
      const { applyShippedPatches } = await import('../lib/install/gsd.mjs');
      // Pass a temp pkgRoot with no patches/ dir so it returns empty arrays without side effects.
      const result = applyShippedPatches('/nonexistent-pkg-root-' + process.pid);
      assert.deepStrictEqual(Object.keys(result).sort(), ['applied', 'failed', 'skipped']);
      assert.ok(Array.isArray(result.applied));
      assert.ok(Array.isArray(result.skipped));
      assert.ok(Array.isArray(result.failed));
      assert.equal(result.applied.length, 0);
      assert.equal(result.skipped.length, 0);
      assert.equal(result.failed.length, 0);
    });
  });
  ```

  This test does NOT actually mutate `~/.claude/get-shit-done/` — it tests file structure + the helper's no-op-when-no-patches behavior.
  </action>
  <verify>
    <automated>pnpm vitest run tests/install-gsd-patches.test.mjs --reporter=basic</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/install-gsd-patches.test.mjs` -> exits 0
    - `pnpm vitest run tests/install-gsd-patches.test.mjs` exits 0 with all subtests passing
    - `grep -c 'describe' tests/install-gsd-patches.test.mjs` -> >= 2 (patch structural + helper export)
    - `grep -c 'applyShippedPatches' tests/install-gsd-patches.test.mjs` -> >= 2 (import + use)
  </acceptance_criteria>
  <done>
  Test file exists and all assertions pass against the Task-1 + Task-2 deliverables.
  </done>
</task>

<task type="auto">
  <name>Task 4: Verify hooks/gsd-auto-reapply-patches.sh handles the new patch correctly</name>
  <read_first>
    - hooks/gsd-auto-reapply-patches.sh (full content)
    - lib/install/hooks.mjs lines 41-48 (patches/ copy logic that delivers the patch)
  </read_first>
  <files>
    - (no source changes — pure verification, may add a 1-line comment to gsd-auto-reapply-patches.sh if it needs to enumerate patches by name)
  </files>
  <action>
  Open `hooks/gsd-auto-reapply-patches.sh` and confirm:

  1. It iterates over all `*.patch` files in `~/.claude/gsd-local-patches/` (NOT a hardcoded list of patch filenames). If it currently lists patches by name, it MUST be generalized to glob `*.patch` so the new file is auto-picked-up.
  2. The script targets `~/.claude/get-shit-done/` as the working dir for `patch -p1`.
  3. The script handles "already applied" gracefully (exit 1 with "Reversed" message → skip silently).

  If any of these are wrong, add the minimum fix. If all correct, this task ends with a no-op verification — print a short note in the SUMMARY.md confirming the runner is patch-discovery-correct.

  Do NOT bypass the existing patch file. The new gsd-execute-phase-bypassperms.patch should be auto-discovered the FIRST TIME a session starts after the user re-runs the wizard (which copies it via lib/install/hooks.mjs lines 41-48).

  No commit unless a 1-line generalization is needed.
  </action>
  <verify>
    <automated>grep -E "for.*\\*\\.patch|find.*-name.*patch|ls.*patch" hooks/gsd-auto-reapply-patches.sh | head -3 && bash -n hooks/gsd-auto-reapply-patches.sh</automated>
  </verify>
  <acceptance_criteria>
    - `bash -n hooks/gsd-auto-reapply-patches.sh` exits 0 (syntactically valid)
    - The script enumerates `*.patch` via a glob/find/ls (NOT hardcoded filenames)
    - The script targets `$HOME/.claude/get-shit-done` (NOT a hardcoded other path)
  </acceptance_criteria>
  <done>
  Script confirmed compatible with new patch (or minimum-fix applied + committed).
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. Patch file well-formed and dry-run applies
patch --dry-run -p1 -d "$HOME/.claude/get-shit-done" < patches/gsd-execute-phase-bypassperms.patch

# 2. Installer + caller syntactically valid
node --check lib/install/gsd.mjs
node --check bin/install.mjs

# 3. New tests green
pnpm vitest run tests/install-gsd-patches.test.mjs

# 4. Reapply script handles new patch via glob
grep -E "\\*\\.patch" hooks/gsd-auto-reapply-patches.sh

# 5. Full suite still green (regression guard for installer changes)
pnpm test
```
</verification>
</content>
</invoke>