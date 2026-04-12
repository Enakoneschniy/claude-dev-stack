---
phase: 06-git-conventions-skill-ecosystem
verified: 2026-04-12T14:30:00Z
status: human_needed
score: 5/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Doctor reports WARN (existing projects) OR ERROR (new installs post-wizard) for missing .claude/git-scopes.json"
    status: partial
    reason: "Doctor only reports WARN for all cases. The ERROR path for new installs post-wizard was explicitly deferred by the RESEARCH doc but is not covered by any later phase in ROADMAP."
    artifacts:
      - path: "lib/doctor.mjs"
        issue: "Only increments warnings++ for missing git-scopes.json; no issues++ path for new installs post-wizard. Lines 338-342."
    missing:
      - "Add install-receipt mechanism to distinguish new vs existing installs and emit issues++ for new-install case"
      - "Or: explicitly accept WARN-only as acceptable deviation for GIT-09 via override"
human_verification:
  - test: "Run claude-dev-stack scopes init --quick in a real pnpm-workspace repo"
    expected: "Valid .claude/git-scopes.json populated, git-conventions SKILL.md installed, no npm install spawned, co_authored_by defaults false"
    why_human: "SC 1 requires end-to-end interactive wizard with actual TTY prompts against a real project"
  - test: "In a live Claude session on a project with git-conventions installed, say commit this as a fix"
    expected: "Claude auto-triggers skill, reads .claude/git-scopes.json, produces type(scope): subject format, no Co-Authored-By line"
    why_human: "SC 4 requires a live Claude Code session to verify skill auto-trigger behavior"
---

# Phase 6: Git-Conventions Skill Ecosystem Verification Report

**Phase Goal:** Every mapped project gets a git-conventions skill wired to a validated .claude/git-scopes.json config, auto-detected from the project stack, with a scopes CLI for post-install maintenance. Also ships the cross-cutting tests/helpers/fixtures.mjs and lib/shared.mjs::atomicWriteJson() infrastructure that later phases depend on.
**Verified:** 2026-04-12T14:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | atomicWriteJson writes JSON atomically; fixtures.mjs exports 4 test helpers (INFRA-01, INFRA-02) | VERIFIED | lib/shared.mjs:134 exports atomicWriteJson using renameSync; tests/helpers/fixtures.mjs exports all 4 helpers; 19+13 tests pass |
| 2 | detectStack identifies 7+ stack types; scopes CLI dispatches 5 subcommands (GIT-01 thru GIT-07) | VERIFIED | lib/git-scopes.mjs 9-step cascade (pnpm, npm, lerna, nx, turbo, cargo, go, python-uv, fallback); all 5 subcommands in lib/git-conventions.mjs; 23+7 tests pass |
| 3 | Setup wizard installs git-conventions per mapped project; co_authored_by defaults false; commitlint print-only (GIT-08, GIT-10) | VERIFIED | bin/install.mjs:935 has installGitConventions(); createDefaultConfig sets co_authored_by:false; printCommitlintInstructions is console.log-only; no spawnSync npm install |
| 4 | git-conventions skill auto-triggers via description; reads .claude/git-scopes.json at invoke time (GIT-05, SC 4) | VERIFIED (needs human for live session) | SKILL.md.tmpl lines 3-6 trigger description present; lines 11+48 instruct reading config before git ops |
| 5 | Doctor shows WARN or ERROR for missing git-scopes.json; git-scopes writes use atomicWriteJson (GIT-09, SC 5) | PARTIAL | WARN path at lib/doctor.mjs:339 works; writeScopes uses atomicWriteJson. FAIL: no ERROR path for new installs post-wizard as required by GIT-09 and SC 5 |
| 6 | Test helpers in tests/helpers/fixtures.mjs available for all phases; all /tmp/cds-* cleaned up (INFRA-01, SC 6) | VERIFIED | 4 helpers confirmed; cleanup in finally blocks; 13 self-tests confirm cleanup |

**Score:** 5/6 truths fully verified (truth 5 is partial — WARN implemented, ERROR path for post-wizard missing)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| lib/shared.mjs | atomicWriteJson export | VERIFIED | Line 134; renameSync imported; 452 lines |
| tests/helpers/fixtures.mjs | 4 exports | VERIFIED | Lines 12, 20, 35, 100 |
| tests/helpers/fixtures.test.mjs | Self-tests, min 80 lines | VERIFIED | 13 tests pass |
| lib/git-scopes.mjs | 8 exports, min 150 lines | VERIFIED | 8 exports, 452 lines |
| lib/git-conventions.mjs | main(args) export, min 100 lines | VERIFIED | 315 lines; main at line 34 |
| templates/skills/git-conventions/SKILL.md.tmpl | 4 token placeholders | VERIFIED | All 4 tokens: SCOPES_LIST, MAIN_BRANCH, TICKET_FORMAT, CO_AUTHORED_BY_SECTION |
| tests/git-scopes.test.mjs | Detection + schema + installSkill, min 120 lines | VERIFIED | 321 lines; 23 tests pass |
| tests/git-conventions.test.mjs | CLI dispatch tests, min 60 lines | VERIFIED | 194 lines; 7 tests pass |
| bin/install.mjs | installGitConventions() wizard step | VERIFIED | Lines 935, 1398 |
| lib/doctor.mjs | Git Conventions health section | PARTIAL | Section at line 300; WARN path works; ERROR path for post-wizard missing |
| tests/install.test.mjs | git-conventions structural tests | VERIFIED | 20 tests pass (9 new) |
| tests/doctor.test.mjs | Git Conventions section tests | VERIFIED | 17 tests pass (5 new) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| lib/shared.mjs | node:fs | renameSync for atomic write | WIRED | Line 7 imports renameSync; line 139 calls renameSync |
| tests/helpers/fixtures.mjs | node:child_process | execSync for git init | WIRED | execSync('git init') confirmed |
| lib/git-conventions.mjs | lib/git-scopes.mjs | import detectStack, readScopes etc | WIRED | Line 24: from './git-scopes.mjs' |
| lib/git-scopes.mjs | templates/skills/git-conventions/SKILL.md.tmpl | readFileSync in installSkill | WIRED | Line 371 reads template |
| bin/cli.mjs | lib/git-conventions.mjs | dynamic import in case 'scopes' | WIRED | Lines 148-150 confirmed |
| bin/install.mjs | lib/git-scopes.mjs | import detectStack, installSkill etc | WIRED | Lines 19-21 confirmed |
| lib/doctor.mjs | lib/git-scopes.mjs | import validateScopes | WIRED | Line 10 confirmed |
| lib/git-scopes.mjs | lib/shared.mjs | atomicWriteJson for writeScopes | WIRED | Line 78: atomicWriteJson(scopesPath, config) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| readScopes | parsed config object | JSON.parse(readFileSync(scopesPath)) | Yes — reads filesystem | FLOWING |
| detectStack | scopes array | readdirSync on project dirs | Yes — reads actual directory entries | FLOWING |
| writeScopes | config written | atomicWriteJson(scopesPath, config) | Yes — writes .claude/git-scopes.json | FLOWING |
| installSkill | rendered SKILL.md | readFileSync(template) + replaceAll tokens | Yes — reads template, token-replaces, writes file | FLOWING |
| doctor Git Conventions | projectMap | JSON.parse(readFileSync(mapPath)) | Yes — reads actual vault project-map.json | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| shared.test.mjs | node --test tests/shared.test.mjs | 19 tests, 0 fail | PASS |
| fixtures.test.mjs | node --test tests/helpers/fixtures.test.mjs | 13 tests, 0 fail | PASS |
| git-scopes.test.mjs | node --test tests/git-scopes.test.mjs | 23 tests, 0 fail | PASS |
| git-conventions.test.mjs | node --test tests/git-conventions.test.mjs | 7 tests, 0 fail | PASS |
| install.test.mjs | node --test tests/install.test.mjs | 20 tests, 0 fail | PASS |
| doctor.test.mjs | node --test tests/doctor.test.mjs | 17 tests, 0 fail | PASS |
| Full npm test | npm test | 313 tests, 0 fail | PASS |
| No npm install spawn | grep bin/install.mjs | 0 matches for spawnSync npm install | PASS |
| cli.mjs routes scopes | grep bin/cli.mjs | case scopes + dynamic import confirmed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | 06-01 | tests/helpers/fixtures.mjs with 4 exports | SATISFIED | All 4 helpers exported and tested |
| INFRA-02 | 06-01 | atomicWriteJson in lib/shared.mjs | SATISFIED | Exported, wired, tested |
| GIT-01 | 06-02 | git-scopes.json v1 schema with read/write/validate | SATISFIED | validateScopes, readScopes, writeScopes functional |
| GIT-02 | 06-02 | 7-stack auto-detection via sentinel files | SATISFIED | 9-step cascade covers all required stacks |
| GIT-03 | 06-02 | scopes subcommands: list, refresh, add, remove, init | SATISFIED | All 5 in lib/git-conventions.mjs |
| GIT-04 | 06-02 | scopes init --quick (4 questions) and --full modes | SATISFIED | cmdInit handles quick/full flags |
| GIT-05 | 06-02 | git-conventions skill at .claude/skills/git-conventions/SKILL.md | SATISFIED | installSkill writes to that path; template present |
| GIT-06 | 06-02 | co_authored_by defaults to false | SATISFIED | createDefaultConfig line 448 confirmed |
| GIT-07 | 06-02 | main-branch detection via git symbolic-ref + fallback | SATISFIED | detectMainBranch implements 3-step chain |
| GIT-08 | 06-03 | installGitConventions wizard step | SATISFIED | bin/install.mjs:935 and :1398 |
| GIT-09 | 06-03 | Doctor WARN (existing) / ERROR (new install post-wizard) | PARTIAL | WARN path implemented; ERROR path for post-wizard deferred in RESEARCH but not addressed in any later phase |
| GIT-10 | 06-03 | Commitlint opt-in, print-only, guarded by package.json | SATISFIED (minor deviation) | Print-only confirmed. Guard uses existsSync(package.json), not the stricter package.json-with-devDependencies from REQUIREMENTS.md — plan explicitly simplified this |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 06-01-SUMMARY.md | commits section | Claims commits 1587f5d and be0fafb which do not exist in repo | Info | Worktree commits were squash-merged; actual commits are 29c7840 and 7570c28. Code is correct, hashes in SUMMARY are stale |

No code anti-patterns found. The return null statements in readScopes and detectMainBranch are legitimate early-returns on file-not-found or parse-error conditions, not stubs.

### Human Verification Required

#### 1. End-to-end scopes init --quick flow (SC 1)

**Test:** In a real pnpm-workspace repository, run `claude-dev-stack scopes init --quick` and answer the 4 prompts
**Expected:** Within 60 seconds: `.claude/git-scopes.json` written with auto-detected scopes and `co_authored_by: false`; `.claude/skills/git-conventions/SKILL.md` installed with no unreplaced {{ tokens; no npm install spawned
**Why human:** SC 1 requires an interactive wizard with actual TTY prompts against a real project directory. Cannot simulate full interactive session programmatically.

#### 2. Live Claude session skill invocation (SC 4)

**Test:** Open a project with git-conventions installed and in a Claude session say "commit this as a fix"
**Expected:** Claude auto-triggers git-conventions skill (no explicit /invoke needed), reads `.claude/git-scopes.json`, produces `type(scope): subject` commit message using a scope from the config, no Co-Authored-By line
**Why human:** Skill auto-trigger behavior in a live Claude session cannot be verified programmatically.

### Gaps Summary

**One partial gap (GIT-09 ERROR path):** ROADMAP success criterion 5 and REQUIREMENTS.md GIT-09 both require doctor to emit ERROR (not just WARN) when `.claude/git-scopes.json` is missing for a project installed via the wizard. The implementation only emits WARN for all cases. The RESEARCH doc notes this was intentional ("always WARN in Phase 6; ERROR path can be added later by checking an install-receipt file") but this deferral is not reflected in any later phase's roadmap requirements — GIT-09 is assigned to Phase 6 only.

The gap is low severity: WARN vs ERROR is a UX distinction, not a functional failure. The implementation path is clear (write an install-receipt file after installGitConventions completes; check it in doctor). To formally close this, either add the ERROR path or add an override accepting WARN-only.

**Two items need human verification** before status can move to passed: SC 1 (interactive wizard flow in a real project) and SC 4 (live Claude session skill auto-trigger).

---

_Verified: 2026-04-12T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
