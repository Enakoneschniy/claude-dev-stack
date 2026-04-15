---
phase: 260415-pga-fix-adr-bridge-test-traversal-assertion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/adr-bridge-session.test.mjs
autonomous: true
requirements:
  - QUICK-FIX-TRAVERSAL-ASSERTION
must_haves:
  truths:
    - "Test `bridgeSession() — topic path traversal / sanitizes topic; no file outside decisionsDir` passes on Linux Node 18/20/22"
    - "Test still passes locally on macOS Node 20"
    - "Test still fails (correctly) if a future regression causes bridgeSession to write any file outside decisionsDir or the session log's directory"
    - "No assertion references any absolute system path (no `/etc/`, no `/tmp/`, no hardcoded OS paths)"
    - "Pre-existing sanitization assertions (startsWith(t.decisionsDir) and topic regex) remain unchanged"
  artifacts:
    - path: "tests/adr-bridge-session.test.mjs"
      provides: "Rewritten outside-locations assertion using recursive walk of t.dir"
      contains: "readdirSync"
  key_links:
    - from: "tests/adr-bridge-session.test.mjs (Test 10 outer-files assertion)"
      to: "t.dir recursive walk -> t.decisionsDir / dirname(t.sessionLogPath)"
      via: "fs.readdirSync + path.join"
      pattern: "readdirSync.*withFileTypes"
---

<objective>
Replace the broken absolute-path assertion in Test 10 of
`tests/adr-bridge-session.test.mjs` with a robust recursive-walk check that
verifies no file was created outside the two legitimate locations
(`t.decisionsDir` and the directory holding `t.sessionLogPath`).

Purpose: the current assertion dereferences `join(t.vault, '..', '..', '..',
'etc', 'passwd')`, which on Linux CI resolves to the real `/etc/passwd`, a
system file that always exists — so the assertion fails through no fault of
the code under test. macOS passes only because `tmpdir()` is nested deeper
(`/var/folders/...`). The new assertion is platform-independent and actually
verifies the sanitization property it claims to verify.

Output: single edit to the test file, lines ~334–336 replaced. All 16
subtests pass on Linux Node 18/20/22 and macOS Node 20.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@tests/adr-bridge-session.test.mjs
@lib/adr-bridge-session.mjs

<interfaces>
<!-- The test's `t` object, produced by makeTmp() at tests/adr-bridge-session.test.mjs:18-27. -->
<!-- Executor uses these fields directly — no exploration needed. -->

```js
// makeTmp() returns:
{
  dir: string,            // e.g. /tmp/adr-bridge-session-XXXX        (test tmp root)
  vault: string,          // `${dir}/vault`
  decisionsDir: string,   // `${vault}/projects/test-proj/decisions`
  sessionLogPath: string, // `${vault}/projects/test-proj/sessions/2026-04-15-test.md`
}
```

Node builtins already imported at top of file (line 3):

```js
import {
  mkdirSync, rmSync, writeFileSync, readFileSync,
  readdirSync, existsSync, mkdtempSync
} from 'node:fs';
import { join } from 'node:path';
```

Note: `readdirSync` is already imported. `dirname` from `node:path` is NOT
currently imported and must be added to the existing `node:path` import.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Replace path-traversal assertion with recursive walk</name>
  <files>tests/adr-bridge-session.test.mjs</files>
  <behavior>
    - After the `for (const adr of res.newAdrs)` loop (ends line 333), recursively
      walk every file under `t.dir`.
    - For every file encountered, assert its absolute path starts with either
      `t.decisionsDir` or `dirname(t.sessionLogPath)`.
    - If bridgeSession writes a file anywhere else inside `t.dir` (simulating a
      real traversal escape into a sibling folder under the test tmp root),
      the assertion MUST fail with a clear message naming the stray path.
    - No reference to `/etc/`, `/tmp/`, or any absolute OS path.
    - No new dependencies — uses `readdirSync({ withFileTypes: true, recursive: true })`
      OR a small inline recursive helper (both are Node builtins; prefer the
      built-in `recursive: true` option available since Node 18.17 / stable in 20+).
  </behavior>
  <action>
    1. In the existing `node:path` import (line 4), add `dirname`:
       ```js
       import { join, dirname } from 'node:path';
       ```

    2. Locate Test 10 at lines 307–338 (describe `bridgeSession() — topic path
       traversal`).

    3. Delete the two broken lines (currently 334–336):
       ```js
       // No file written outside decisionsDir
       const etcPasswd = join(t.vault, '..', '..', '..', 'etc', 'passwd');
       assert.ok(!existsSync(etcPasswd), 'no file outside vault');
       ```
       (The comment on line 334, the `etcPasswd` const on 335, and the
       `assert.ok` on 336. Leave everything above — including the
       `for (const adr of res.newAdrs)` loop at 330–333 — untouched.)

    4. Insert in their place a recursive walk of `t.dir`. Use the Node 18+
       `readdirSync(path, { withFileTypes: true, recursive: true })` signature.
       The two legal path prefixes are `t.decisionsDir` and
       `dirname(t.sessionLogPath)`. A directory entry itself is fine (we only
       check files). The session log file itself (created by `makeTmp`) lives
       under the sessions dir and therefore inside an allowed prefix, so it
       passes naturally.

       Example implementation (verbatim, to paste in place of the deleted
       lines — indentation matches the surrounding `it(...)` body, two spaces):

       ```js
           // No file written outside decisionsDir or the session log's directory.
           // Walk t.dir recursively — every file found must live under one of
           // the two legitimate locations. This catches any traversal escape
           // without depending on absolute system paths.
           const allowedPrefixes = [t.decisionsDir, dirname(t.sessionLogPath)];
           const entries = readdirSync(t.dir, { withFileTypes: true, recursive: true });
           for (const entry of entries) {
             if (!entry.isFile()) continue;
             const full = join(entry.parentPath ?? entry.path, entry.name);
             const ok = allowedPrefixes.some((p) => full === p || full.startsWith(p + '/'));
             assert.ok(ok, `file written outside allowed dirs: ${full}`);
           }
       ```

       Notes:
       - `entry.parentPath` is the Node 20+ field; `entry.path` is the
         deprecated-but-still-present alias. The `??` fallback keeps this
         compatible with Node 18 where only `entry.path` existed before
         `parentPath` landed. Both point to the directory containing the entry.
       - `full === p || full.startsWith(p + '/')` prevents the false positive
         where `t.decisionsDir` itself would NOT startWith `t.decisionsDir + '/'`.
         (The path separator is always `/` here because we build the paths via
         `join` and `mkdtempSync` on POSIX; Windows is not a CI target for this
         project per the v0.12 roadmap.)

    5. Do NOT touch the `for (const adr of res.newAdrs)` block at lines 330–333.
       Do NOT touch any other test. Do NOT touch `lib/adr-bridge-session.mjs`.

    6. Save the file.
  </action>
  <verify>
    <automated>node --test tests/adr-bridge-session.test.mjs</automated>
  </verify>
  <done>
    - `dirname` imported from `node:path`.
    - Lines 334–336 replaced with the recursive walk block described above.
    - `node --test tests/adr-bridge-session.test.mjs` reports all 16 subtests passing.
    - `git diff tests/adr-bridge-session.test.mjs` shows edits ONLY inside
      Test 10 (describe `bridgeSession() — topic path traversal`) plus the
      one-line `node:path` import addition.
    - No other file in the repo is modified.
  </done>
</task>

</tasks>

<verification>
Run the full test file and confirm green:

```bash
node --test tests/adr-bridge-session.test.mjs
```

Expected: all 16 subtests pass. Specifically, `bridgeSession() — topic path
traversal > sanitizes topic; no file outside decisionsDir` must pass on both
Linux (Node 18/20/22) and macOS (Node 20).

Sanity-check the diff is narrow:

```bash
git diff --stat tests/adr-bridge-session.test.mjs
```

Expected: `1 file changed, <~15 insertions(+), 3 deletions(-)` — no changes
to any other file.
</verification>

<success_criteria>
- All 16 subtests in `tests/adr-bridge-session.test.mjs` pass locally.
- The traversal assertion no longer references any absolute system path.
- The assertion correctly validates that `bridgeSession` writes only under
  `t.decisionsDir` or `dirname(t.sessionLogPath)`.
- `lib/adr-bridge-session.mjs` is unchanged.
- No other test file is modified.
</success_criteria>

<output>
After completion, create `.planning/quick/260415-pga-fix-adr-bridge-test-traversal-assertion-/260415-pga-01-SUMMARY.md`
summarizing the diff and the verification run.
</output>
