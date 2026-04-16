---
plan_id: 33-04-github-actions-matrix
phase: 33
plan: 04
type: execute
wave: 3
depends_on:
  - 33-01-monorepo-scaffolding
  - 33-02-typescript-project-references
  - 33-03-vitest-migration
files_modified:
  - .github/workflows/ci.yml
  - .gitignore
autonomous: true
requirements:
  - MONO-04
user_setup: []
must_haves:
  truths:
    - "A push to a feature branch triggers GitHub Actions matrix [node 18, 20, 22] running install + build + test (ROADMAP SC#4)"
    - "Workflow has two jobs: packages-job (runs pnpm --filter ...[origin/main] -r test) and root-tests-job (guarded by dorny/paths-filter@v4 on lib/bin/hooks/tests/config changes)"
    - "packages-job: install → build → test (compiled deps required for package tests)"
    - "root-tests-job: install → test (skips build by design — root .mjs files have no imports from packages/*/dist/ in Phase 33 per D-01; build is not a dependency of root tests until Phase 34+)"
    - "actions/checkout@v4 uses fetch-depth 0 so pnpm --filter [origin/main] can resolve git history (D-10)"
    - "permissions stanza restricts GITHUB_TOKEN to contents read + pull-requests read (T-33-02 mitigation)"
    - "Workflow replaces .github/workflows/ci.yml in-place (not duplicated — D-12)"
    - "Dot-gitignore excludes monorepo dist, tsbuildinfo, packages per-package node_modules, GSD bounce files"
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "CI workflow replacing existing — matrix [18,20,22] × [packages-job, root-tests-job]"
      contains: "fetch-depth: 0"
    - path: ".gitignore"
      provides: "Build artifacts + per-package node_modules + GSD bounce files excluded"
      contains: "dist"
  key_links:
    - from: ".github/workflows/ci.yml packages-job"
      to: "pnpm --filter [origin/main] -r test"
      via: "pnpm native affected detection"
      pattern: "pnpm --filter"
    - from: ".github/workflows/ci.yml root-tests-job"
      to: "dorny/paths-filter@v4 (lib|bin|hooks|tests|config changes)"
      via: "conditional job execution"
      pattern: "dorny/paths-filter@v4"
    - from: "matrix.node-version"
      to: "actions/setup-node@v4 cache pnpm"
      via: "Node matrix + pnpm store cache"
      pattern: "node-version"
---

<objective>
Replace `.github/workflows/ci.yml` in-place with a pnpm + monorepo-aware workflow that runs matrix `[node 18, 20, 22] × [packages-job, root-tests-job]` using pnpm native affected detection for packages and `dorny/paths-filter@v4` for root tests. Restrict `GITHUB_TOKEN` scope to read-only. Append `.gitignore` entries for build artifacts (`**/dist/`, `**/*.tsbuildinfo`, `packages/*/node_modules/`, GSD bounce files).

Purpose: satisfy MONO-04 (GitHub Actions CI on Node 18/20/22, pnpm cache, `--frozen-lockfile`, fails on TS or test error, existing workflow migrated not duplicated).

Output: rewritten `.github/workflows/ci.yml` (replaces the v0.12 `npm ci`-based file), appended `.gitignore`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/33-monorepo-foundation/33-CONTEXT.md
@.planning/phases/33-monorepo-foundation/33-RESEARCH.md
@.planning/phases/33-monorepo-foundation/33-PATTERNS.md
@.planning/phases/33-monorepo-foundation/33-VALIDATION.md
@.planning/phases/33-monorepo-foundation/33-01-monorepo-scaffolding-PLAN.md
@.planning/phases/33-monorepo-foundation/33-02-typescript-project-references-PLAN.md
@.planning/phases/33-monorepo-foundation/33-03-vitest-migration-PLAN.md
@./CLAUDE.md
@./.gitignore
@./.github/workflows/ci.yml

<interfaces>
Plans 01–03 have delivered pnpm workspace, TS build, vitest migration.
This plan wires CI around `pnpm install --frozen-lockfile && pnpm tsc --build && pnpm ... test`.

From Plans 01–03 (already on disk):
- `pnpm-workspace.yaml`, `pnpm-lock.yaml` exist
- `tsconfig.base.json`, root `tsconfig.json`, 4 per-package tsconfigs exist
- `vitest.config.ts` has `projects: [{ name: 'root', ... }, 'packages/*']`
- Root `package.json` `scripts` = `{ "test": "vitest run", "build": "tsc --build" }`
- Root tests pass (928/931 with 3 pre-existing detect.test.mjs failures preserved per D-06)
- Per-package sanity tests pass

Existing `.github/workflows/ci.yml` (to be replaced in-place):
- Single job `test` on ubuntu-latest
- Matrix `[18, 20, 22]`
- Steps: `actions/checkout@v5`, `actions/setup-node@v5`, `npm ci`, `node --check`, `npm test`
- No pnpm cache, no affected detection, no paths filter, no `permissions:` stanza

Existing `.gitignore` (4 entries to preserve):
- `node_modules/`
- `.DS_Store`
- `*.log`
- `.claude/` (per-developer Claude Code files)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite .github/workflows/ci.yml in-place with pnpm + matrix + paths-filter + restricted permissions</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md section ".github/workflows/ci.yml (replace in-place)" — existing structure vs replacement, D-12 action version list
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md section "Pattern 6: GitHub Actions CI workflow (D-10/D-11/D-12)" — full workflow source (lines 371–449)
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md section "Pitfall 5: pnpm-lock.yaml not committed / frozen-lockfile fails in CI"
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md section decisions D-10, D-11, D-12 — exact action versions, paths filter globs, matrix shape
    - ./.github/workflows/ci.yml (existing v0.12.x workflow — the file being replaced)
  </read_first>
  <files>
    - .github/workflows/ci.yml (replace in-place)
  </files>
  <action>
  Replace the entire content of `.github/workflows/ci.yml` with the workflow below. This is verbatim from RESEARCH.md Pattern 6 + guidance-prescribed `permissions:` stanza and `-r` (recursive) flag on the packages test invocation.

  **Full file content (write byte-for-byte):**

  ```yaml
  name: CI

  on:
    pull_request:
      branches: [main]
    push:
      branches: [main]

  # Restrict GITHUB_TOKEN scope to minimum needed (T-33-02 mitigation).
  # detect-changes needs pull-requests: read for paths-filter on PR events.
  # Test jobs need contents: read only (checkout + run tests).
  permissions:
    contents: read
    pull-requests: read

  jobs:
    detect-changes:
      runs-on: ubuntu-latest
      outputs:
        packages: ${{ steps.filter.outputs.packages }}
        root: ${{ steps.filter.outputs.root }}
      steps:
        - uses: actions/checkout@v4
        - uses: dorny/paths-filter@v4
          id: filter
          with:
            filters: |
              packages:
                - 'packages/**'
                - 'pnpm-workspace.yaml'
                - 'tsconfig.base.json'
                - 'tsconfig.json'
              root:
                - 'lib/**'
                - 'bin/**'
                - 'hooks/**'
                - 'tests/**'
                - 'package.json'
                - 'pnpm-lock.yaml'
                - 'vitest.config.ts'

    packages-job:
      needs: detect-changes
      if: ${{ needs.detect-changes.outputs.packages == 'true' || github.event_name == 'push' }}
      runs-on: ubuntu-latest
      strategy:
        fail-fast: false
        matrix:
          node-version: [18, 20, 22]
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0
        - uses: pnpm/action-setup@v4
          with:
            version: 10
        - uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node-version }}
            cache: 'pnpm'
        - run: pnpm install --frozen-lockfile
        - run: pnpm tsc --build
        - run: pnpm --filter "...[origin/main]" -r run test

    root-tests-job:
      needs: detect-changes
      if: ${{ needs.detect-changes.outputs.root == 'true' || github.event_name == 'push' }}
      runs-on: ubuntu-latest
      strategy:
        fail-fast: false
        matrix:
          node-version: [18, 20, 22]
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0
        - uses: pnpm/action-setup@v4
          with:
            version: 10
        - uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node-version }}
            cache: 'pnpm'
        - run: pnpm install --frozen-lockfile
        - run: pnpm -w vitest run --project root
  ```

  **Key design notes (for executor context):**

  1. **Why two jobs, not one:** D-11/D-12 split CI so that changes to `packages/**` only run packages-job and changes to `lib/bin/hooks/tests/**` only run root-tests-job. A full-repo change (or a push to main) runs both. This minimizes CI minutes without losing coverage.

  2. **Why `fetch-depth: 0`:** pnpm's `--filter "...[origin/main]"` syntax needs the full git history to diff against the main branch. With shallow clone (default `fetch-depth: 1`), pnpm errors with "cannot resolve origin/main".

  3. **Why `pnpm/action-setup@v4` before `setup-node@v4`:** `setup-node@v4` with `cache: 'pnpm'` requires the pnpm binary to already be available to compute the store path. Order matters.

  4. **Why `--frozen-lockfile`:** CI must use the exact dependency versions in `pnpm-lock.yaml`. If the lockfile is outdated, fail loudly rather than auto-regenerate. Plan 01 Task 3 commits the lockfile.

  5. **Why `-r run test` (recursive):** `pnpm --filter "...[origin/main]" -r run test` recursively runs the `test` script in each affected package. Without `-r`, only the top-level project's test script runs.

  6. **Why `pnpm -w vitest run --project root` in root-tests-job:** The root-tests-job doesn't need to build packages or run per-package tests — it just needs to validate the 48 root `.mjs` tests still pass. Using `vitest run --project root` directly scopes to the root project only.

  7. **Why `permissions: contents: read` at workflow level + explicit `pull-requests: read` for paths-filter:** T-33-02 mitigation. Default `GITHUB_TOKEN` has more permissions than needed. Reducing to read-only prevents a compromised workflow from mutating the repo. `pull-requests: read` is required by `dorny/paths-filter` to read PR metadata.

  8. **Why NO fork PR protection needed:** Public repos on GitHub Actions already restrict fork PRs from using repo secrets and from having write token — this is GitHub's default. Our workflow doesn't use any secrets (no `${{ secrets.* }}` anywhere), so fork PRs can safely run read-only tests. If future phases add secrets (e.g. for `npm publish`), revisit this.

  9. **`fail-fast: false` in matrix:** When Node 18 fails but Node 20 passes (or vice-versa), we want to see both results, not abort the matrix on first failure. This improves debugging signal.

  10. **Action versions locked to v4 (NOT v6):** D-10 explicitly says `actions/checkout@v4`. RESEARCH.md Standard Stack notes v4/v6 both work but D-10's verbatim lock wins. Do NOT upgrade to v5/v6 in this plan — that's a follow-up if ever needed.

  **Supply-chain note for pnpm cache in CI:** `setup-node@v4` `cache: 'pnpm'` hashes `pnpm-lock.yaml` to derive the cache key. If the lockfile changes, the cache is invalidated and a fresh download happens (with integrity hashes verified). This is the standard pnpm-on-GitHub-Actions posture; no additional supply chain controls needed.
  </action>
  <verify>
    <automated>test -f .github/workflows/ci.yml && grep -q "fetch-depth: 0" .github/workflows/ci.yml && grep -q "pnpm/action-setup@v4" .github/workflows/ci.yml && grep -q "dorny/paths-filter@v4" .github/workflows/ci.yml && grep -qE "node-version:.*18.*20.*22" .github/workflows/ci.yml && grep -q "permissions:" .github/workflows/ci.yml && grep -q "contents: read" .github/workflows/ci.yml && grep -q "pnpm install --frozen-lockfile" .github/workflows/ci.yml && grep -q "pnpm --filter" .github/workflows/ci.yml && grep -q "pnpm -w vitest run --project root" .github/workflows/ci.yml && python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert 'detect-changes' in d['jobs']; assert 'packages-job' in d['jobs']; assert 'root-tests-job' in d['jobs']; print('YAML valid, 3 jobs present')"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .github/workflows/ci.yml` exits 0
    - YAML parses successfully: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exits 0
    - Workflow has exactly 3 jobs: `detect-changes`, `packages-job`, `root-tests-job` — `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert set(d['jobs'].keys()) == {'detect-changes', 'packages-job', 'root-tests-job'}"`
    - Matrix `node-version: [18, 20, 22]` present in both test jobs (VALIDATION.md 33-04-01): grep matches 2 occurrences of the array (one per job)
    - `fetch-depth: 0` present in both checkout steps: `grep -c "fetch-depth: 0" .github/workflows/ci.yml` equals 2
    - `dorny/paths-filter@v4` used: `grep -c "dorny/paths-filter@v4" .github/workflows/ci.yml` equals 1
    - `actions/checkout@v4` used in all 3 jobs: `grep -c "actions/checkout@v4" .github/workflows/ci.yml` equals 3
    - `pnpm/action-setup@v4` with version 10: present twice (packages-job + root-tests-job)
    - `actions/setup-node@v4` with `cache: 'pnpm'`: present twice
    - `permissions:` stanza restricts to read-only: workflow contains `contents: read` at workflow level
    - Paths filter `packages` globs contain `packages/**`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`
    - Paths filter `root` globs contain `lib/**`, `bin/**`, `hooks/**`, `tests/**`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`
    - `packages-job` runs `pnpm install --frozen-lockfile && pnpm tsc --build && pnpm --filter "...[origin/main]" -r run test` (all three commands present)
    - `root-tests-job` runs `pnpm install --frozen-lockfile && pnpm -w vitest run --project root`
    - NO occurrence of `npm ci` in the new workflow (old v0.12.x invocation is fully replaced)
    - NO occurrence of `${{ secrets.*` — no secrets used in CI (fork PR safety)
  </acceptance_criteria>
  <done>
  `.github/workflows/ci.yml` fully replaced with the pnpm + matrix + paths-filter + restricted-permissions workflow. YAML is valid. All acceptance criteria met. Awaiting live push verification (VALIDATION.md 33-04-02 is manual — documented in that file, not a blocker for this plan's completion).
  </done>
</task>

<task type="auto">
  <name>Task 2: Append .gitignore with monorepo build artifacts + GSD bounce files</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md section ".gitignore (append — do NOT rewrite)" — exact lines to append + what NOT to add (Pitfall 5: pnpm-lock.yaml MUST stay tracked)
    - ./.gitignore (current — 4 entries, leave intact and append to end)
  </read_first>
  <files>
    - .gitignore (modified — append only, do NOT rewrite existing 4 entries)
  </files>
  <action>
  Append (do NOT replace) the .gitignore file. Preserve all existing entries (`node_modules/`, `.DS_Store`, `*.log`, `.claude/`).

  **Lines to append to the end of `.gitignore`** (per PATTERNS.md + guidance — `*.pre-bounce.md` is a GSD bounce artifact per guidance note):

  ```
  # Monorepo build artifacts (Phase 33+)
  **/dist/
  **/*.tsbuildinfo
  packages/*/node_modules/
  pnpm-debug.log*

  # GSD bounce artifacts (should already be globally gitignored, confirm locally)
  *.pre-bounce.md
  ```

  **Do NOT add:**
  - `pnpm-lock.yaml` — MUST stay tracked (Pitfall 5: frozen-lockfile CI requires it committed)
  - `package-lock.json` — leave untracked status unchanged; it may still exist from v0.12.x, pnpm ignores it. If it exists in the repo today it stays; if not, .gitignore does not need to mention it.
  - `packages/*/dist/` specifically — already covered by `**/dist/` glob. No need for a package-specific entry.

  **Preserving existing structure:**

  The file BEFORE this task is:
  ```
  node_modules/
  .DS_Store
  *.log

  # Claude Code local files (per-developer, not committed)
  .claude/
  ```

  The file AFTER this task should be:
  ```
  node_modules/
  .DS_Store
  *.log

  # Claude Code local files (per-developer, not committed)
  .claude/

  # Monorepo build artifacts (Phase 33+)
  **/dist/
  **/*.tsbuildinfo
  packages/*/node_modules/
  pnpm-debug.log*

  # GSD bounce artifacts (should already be globally gitignored, confirm locally)
  *.pre-bounce.md
  ```

  Use the Edit tool or append via Write (read current file, concat new lines, write back). Do NOT lose the existing entries.

  **Verification of gitignore effectiveness:**

  After appending, run `git status` — the `packages/*/dist/` directories (created by Plan 02's `pnpm tsc --build`) should NOT appear as untracked files. If they do appear, the glob isn't matching; check for syntax error in the appended lines.
  </action>
  <verify>
    <automated>test -f .gitignore && grep -q "^node_modules/$" .gitignore && grep -q "^\.claude/$" .gitignore && grep -q "dist/" .gitignore && grep -q "tsbuildinfo" .gitignore && grep -q "packages/\*/node_modules/" .gitignore && grep -q "pre-bounce" .gitignore && (! grep -q "^pnpm-lock\.yaml$" .gitignore) && git check-ignore -q packages/cds-core/dist 2>/dev/null && echo "gitignore matches packages/*/dist"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .gitignore` exits 0
    - Existing entries preserved: `grep -c "^node_modules/$" .gitignore` equals 1, `grep -c "^\.claude/$" .gitignore` equals 1, `grep -c "^\.DS_Store$" .gitignore` equals 1, `grep -c "^\*\.log$" .gitignore` equals 1
    - New entries present: `grep -c "\*\*/dist/" .gitignore` equals 1, `grep -c "\*\*/\*\.tsbuildinfo" .gitignore` equals 1, `grep -c "packages/\*/node_modules/" .gitignore` equals 1, `grep -c "pnpm-debug\.log" .gitignore` equals 1, `grep -c "\*\.pre-bounce\.md" .gitignore` equals 1
    - `pnpm-lock.yaml` is NOT in .gitignore (Pitfall 5): `grep -c "^pnpm-lock\.yaml$" .gitignore` equals 0
    - `git check-ignore packages/cds-core/dist` exits 0 (the directory would be matched by the ignore rule if it existed)
    - `git status` output does NOT list `packages/cds-core/dist/` or `packages/cds-cli/dist/` etc. as untracked (if Plan 02 has already been executed and `dist/` directories exist locally)
    - Full .gitignore line count is 12–15 (original 6 lines + blank + 6 new lines + blank separators)
  </acceptance_criteria>
  <done>
  `.gitignore` appended with monorepo artifacts + GSD bounce pattern. Existing entries preserved. `pnpm-lock.yaml` explicitly NOT ignored. Build artifacts from Plan 02 will no longer pollute `git status`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions runner → GITHUB_TOKEN | Runner environment has access to the workflow token; default scope is broader than needed. Mitigated by explicit `permissions:` stanza. |
| PR from fork → workflow invocation | Fork PRs run with read-only token by GitHub default; additional mitigation via no-secrets posture. |
| `dorny/paths-filter@v4` (third-party action) → workflow permissions | Action needs `pull-requests: read` only. If action were compromised, the damage is bounded by the restricted token scope. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-33-01 | Tampering / Supply chain | Third-party GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`, `dorny/paths-filter@v4`) | mitigate | Pin to major version tags (`@v4`) published by trusted first-party (GitHub, pnpm.io, dorny who is a well-known GitHub Actions contributor). Alternative of pinning to exact SHAs is a future hardening step (defer to v1.1+ as per guidance which does not require SHA pinning for Phase 33). Acceptance criteria verify action names and versions match the locked decision (D-10) byte-for-byte. Supply chain surface for tooling deps (vitest, typescript, @types/node) already mitigated in Plan 01 via lockfile + `pnpm audit`. |
| T-33-02 | Elevation of privilege / Token abuse | `GITHUB_TOKEN` scope | mitigate | Workflow-level `permissions: { contents: read, pull-requests: read }` reduces default write-access-to-most-things down to read-only. Paths-filter needs `pull-requests: read` for PR metadata; test jobs need only `contents: read`. No jobs run with more than read permission. No secrets are referenced anywhere in the workflow (`grep -c "secrets\." .github/workflows/ci.yml` must be 0), so fork PRs can safely run without granting write or secret access. If future phases add publish jobs (Phase 39 RELEASE-01), those jobs will need separate elevated permissions and MUST be in a separate workflow file with tighter triggers (e.g. `on: release`). |
| T-33-03 | Spoofing / Dependency confusion | `@cds/*` workspace deps in CI install | mitigate | Plan 01 already mitigated at the source level (private scope, workspace:* protocol, lockfile-recorded symlink resolution). CI additionally runs `pnpm install --frozen-lockfile`, which fails loudly if any dependency's integrity hash doesn't match the lockfile. If a rogue public `@cds/core` were ever published, the lockfile hash mismatch would block the install. Acceptance criteria for Task 1 verify `--frozen-lockfile` is present in both test jobs. |
</threat_model>

<verification>
Phase-level checks for Plan 04 contribution to MONO-04:

1. `.github/workflows/ci.yml` is valid YAML and declares exactly 3 jobs (detect-changes, packages-job, root-tests-job).
2. Matrix `[node 18, 20, 22]` present in both test jobs.
3. All `actions/*` references pin to `@v4` major version (D-10 lock).
4. `permissions:` stanza restricts workflow to `contents: read` + `pull-requests: read`.
5. `pnpm install --frozen-lockfile` used in both test jobs (supply chain integrity via lockfile).
6. No secrets referenced (fork PR safety).
7. `.gitignore` preserves all existing entries and adds `**/dist/`, `**/*.tsbuildinfo`, `packages/*/node_modules/`, `pnpm-debug.log*`, `*.pre-bounce.md`.
8. `pnpm-lock.yaml` NOT in .gitignore (explicitly — Pitfall 5).
9. Manual/live verification (VALIDATION.md §Manual-Only Verifications): pushing branch `gsd/phase-33-monorepo-foundation` triggers GitHub Actions UI showing 6 test-job runs (2 jobs × 3 node versions) all green. This verification happens AFTER the plan commits via the existing GSD PR flow.
</verification>

<success_criteria>
MONO-04 satisfied: "A push to a feature branch triggers GitHub Actions matrix `[node 18, 20, 22]` running install + build + test, and fails on any TS or test error." Plan 04 is the sole contributor; the live-push verification is tracked in VALIDATION.md §Manual-Only Verifications and confirmed via the phase PR to main.
</success_criteria>

<output>
After completion, create `.planning/phases/33-monorepo-foundation/33-04-SUMMARY.md` listing:
- Files modified (`.github/workflows/ci.yml` rewritten; `.gitignore` appended)
- Workflow jobs: 3 (detect-changes, packages-job, root-tests-job)
- Action versions used (checkout@v4, setup-node@v4, pnpm/action-setup@v4, dorny/paths-filter@v4)
- Permissions scope (contents: read + pull-requests: read)
- Whether a test push to `gsd/phase-33-monorepo-foundation` was executed and the Actions UI outcome (pass/fail counts per job × Node version)
- Any deviation from spec
- Phase-level sign-off: all 4 MONO requirements now covered across Plans 01–04
</output>
