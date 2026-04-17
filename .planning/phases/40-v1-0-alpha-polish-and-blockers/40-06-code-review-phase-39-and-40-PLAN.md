---
plan_id: 40-06-code-review-phase-39-and-40
phase: 40
plan: 06
type: execute
wave: 4
depends_on: ["01", "02", "03", "04", "05"]
files_modified: []
autonomous: true
requirements:
  - CODE-REVIEW-GATE
user_setup: []
must_haves:
  truths:
    - "A REVIEW.md file exists at `.planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` summarizing code review findings for Phase 39 + Phase 40 new code"
    - "All severity-high findings from the review have been fixed via /gsd-code-review-fix (or documented as false positives with rationale)"
    - "Low/medium findings are deferred to v1.0 GA per D-132 (noted in REVIEW.md but not blocking)"
  artifacts:
    - path: ".planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md"
      provides: "Code review findings for Phase 39 + Phase 40 code"
      contains: "Findings"
  key_links:
    - from: "40-06-REVIEW.md"
      to: "packages/cds-cli/src/quick.ts"
      via: "review scope entry"
      pattern: "quick.ts"
    - from: "40-06-REVIEW.md"
      to: "packages/cds-cli/src/capture-standalone.ts"
      via: "review scope entry"
      pattern: "capture-standalone.ts"
---

<objective>
Run `/gsd-code-review` as the final plan of Phase 40, covering all Phase 39 new code and Phase 40's own changes. If any severity-high findings surface, apply fixes via `/gsd-code-review-fix`. Low/medium findings are documented but deferred to v1.0 GA per D-132.

This is a META-plan: it invokes the /gsd-code-review skill rather than writing production code directly. The output is a REVIEW.md file and optional fix commits.

Purpose: satisfy Phase 40 SC#3 ("clean REVIEW.md with no severity-blocking findings for Phase 39 code").

Output: REVIEW.md + optional fix commits for high-severity findings.

response_language: ru — REVIEW.md content in English, общение в чате на русском.
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

Files in review scope (PRIMARY — Phase 39 code per D-132):
@./packages/cds-cli/src/quick.ts
@./packages/cds-cli/src/capture-standalone.ts
@./lib/install/hooks.mjs (registerCaptureHook block only)
@./bin/install.mjs (Node check wiring)
@./bin/cli.mjs (migrate exit-code + resolveDistPath block — Phase 39 Plan 01)

Files in review scope (SECONDARY — Phase 40 changes):
@./tests/detect.test.mjs (Plan 01 changes)
@./patches/gsd-execute-phase-bypassperms.patch (Plan 02)
@./lib/install/gsd.mjs (Plan 02 applyShippedPatches)
@./lib/install/permission-config.mjs (Plan 03)
@./lib/doctor.mjs (Plan 03 --gsd-permissions)
@./packages/cds-core/src/vault/sessions.busy-timeout.test.ts (Plan 04)
@./README.md (Plan 05 diff only)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run code review on Phase 39 primary files</name>
  <read_first>
    - packages/cds-cli/src/quick.ts
    - packages/cds-cli/src/capture-standalone.ts
    - lib/install/hooks.mjs (focus on registerCaptureHook export ~lines 344-397)
    - bin/install.mjs (focus on assertNodeVersion wiring ~line 34, setupGsdPermissions ~line 185+)
    - bin/cli.mjs (focus on 'migrate' case and resolveDistPath)
  </read_first>
  <files>
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md (new)
  </files>
  <action>
  Perform a manual code review of each file in scope. For each file, check:

  1. **Error handling** — are errors caught, logged, and non-fatal where appropriate? Are there unhandled promise rejections?
  2. **Type safety** — any `as any` casts, missing null checks, or loose type assertions?
  3. **Security** — any path traversal risks, user-controlled input reaching exec/spawn without sanitization, secret leakage?
  4. **Edge cases** — empty arrays, null/undefined inputs, concurrent access, timeout handling.
  5. **Code style** — conventional commits, consistent imports, no dead code.
  6. **Performance** — unnecessary re-reads, missing caching, blocking I/O in hot paths.

  Create `.planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` with the following structure:

  ```markdown
  # Code Review: Phase 39 + Phase 40

  **Reviewer:** Claude (Phase 40 Plan 06)
  **Date:** 2026-04-16
  **Scope:** Phase 39 new code (primary) + Phase 40 changes (secondary)

  ## Scope

  ### Primary (Phase 39)
  - packages/cds-cli/src/quick.ts
  - packages/cds-cli/src/capture-standalone.ts
  - lib/install/hooks.mjs::registerCaptureHook
  - bin/install.mjs (Node check + GSD permissions wiring)
  - bin/cli.mjs (migrate exit-code + resolveDistPath)

  ### Secondary (Phase 40)
  - tests/detect.test.mjs (Plan 01)
  - patches/gsd-execute-phase-bypassperms.patch (Plan 02)
  - lib/install/gsd.mjs (Plan 02)
  - lib/install/permission-config.mjs (Plan 03)
  - lib/doctor.mjs (Plan 03)
  - packages/cds-core/src/vault/sessions.busy-timeout.test.ts (Plan 04)
  - README.md (Plan 05)

  ## Findings

  | # | File | Severity | Category | Description | Disposition |
  |---|------|----------|----------|-------------|-------------|
  | 1 | ... | high/medium/low | error-handling/type-safety/security/edge-case/style | ... | fix/defer/accept |
  | ... | | | | | |

  ## High-Severity Fixes Applied

  (List commits if any high-severity findings were fixed.)

  ## Deferred to v1.0 GA

  (List medium/low findings deferred per D-132.)

  ## Summary

  - Total findings: N
  - High (fixed): N
  - Medium (deferred): N
  - Low (deferred): N
  - Verdict: PASS / PASS-WITH-DEFERRED
  ```

  For each finding, provide:
  - Exact file + line number
  - What the problem is
  - Why it matters (impact)
  - Suggested fix (for high-severity: implement immediately)
  </action>
  <verify>
    <automated>test -f .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md && grep -q "## Findings" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md && grep -q "Verdict" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` -> exits 0
    - `grep -c "## Findings" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` -> 1
    - `grep -c "Verdict" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` -> >= 1
    - `grep -c "quick.ts" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` -> >= 1
    - `grep -c "capture-standalone" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` -> >= 1
  </acceptance_criteria>
  <done>
  REVIEW.md created with findings table, severity classification, and overall verdict.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix any high-severity findings</name>
  <read_first>
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md (post-Task-1)
  </read_first>
  <files>
    - (depends on findings — may modify Phase 39/40 source files)
  </files>
  <action>
  Read REVIEW.md from Task 1. For each finding with `severity: high`:

  1. Implement the fix as described in the "Suggested fix" column.
  2. Commit with `fix(40-06): {brief description of the fix}`.
  3. Update REVIEW.md's "High-Severity Fixes Applied" section with the commit hash.

  If there are NO high-severity findings, this task is a no-op — just confirm and update REVIEW.md's "High-Severity Fixes Applied" section to "None."

  Run `pnpm test` after all fixes to confirm no regressions.
  </action>
  <verify>
    <automated>grep "Verdict" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md | grep -qiE "pass"</automated>
  </verify>
  <acceptance_criteria>
    - REVIEW.md "Verdict" line contains "PASS" or "PASS-WITH-DEFERRED"
    - If high-severity fixes were applied: `pnpm test` exits 0 after fixes
    - REVIEW.md "High-Severity Fixes Applied" section is populated (either fix commits or "None")
  </acceptance_criteria>
  <done>
  All high-severity findings fixed (or confirmed none exist). REVIEW.md verdict is PASS or PASS-WITH-DEFERRED.
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. REVIEW.md exists and has the right structure
test -f .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md
grep "Verdict" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md

# 2. No high-severity findings remaining
grep -i "high" .planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md | grep -iv "fixed\|none\|applied\|0"

# 3. Full test suite green (post-any-fixes)
pnpm test
```
</verification>
</content>
</invoke>