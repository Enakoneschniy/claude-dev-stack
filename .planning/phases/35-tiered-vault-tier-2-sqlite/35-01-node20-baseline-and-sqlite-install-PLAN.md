---
phase: 35-tiered-vault-tier-2-sqlite
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/ci.yml
  - package.json
  - NOTICES.md
  - packages/cds-core/package.json
  - pnpm-lock.yaml
autonomous: true
requirements:
  - VAULT-01
user_setup: []

must_haves:
  truths:
    - "CI matrix in .github/workflows/ci.yml no longer tests Node 18 — it tests Node 20 and higher"
    - "Root package.json engines.node is >=20 (not >=18)"
    - "packages/cds-core/package.json declares better-sqlite3@^12.9.0 as a dependency"
    - "packages/cds-core/package.json declares @types/better-sqlite3 (^7.x) as a devDependency"
    - "NOTICES.md contains a section or bullet for better-sqlite3 with MIT license and source URL"
    - "pnpm install completes with --frozen-lockfile on a Node 20 runner after lockfile regen"
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "CI matrix without Node 18"
      contains: "node-version: [20"
    - path: "package.json"
      provides: "Root engines bumped"
      contains: "\"node\": \">=20\""
    - path: "packages/cds-core/package.json"
      provides: "better-sqlite3 dependency declaration"
      contains: "better-sqlite3"
    - path: "NOTICES.md"
      provides: "MIT attribution for better-sqlite3"
      contains: "better-sqlite3"
    - path: "pnpm-lock.yaml"
      provides: "Regenerated lockfile containing better-sqlite3 resolution"
      contains: "better-sqlite3"
  key_links:
    - from: ".github/workflows/ci.yml"
      to: "package.json engines.node"
      via: "Matrix node-version values must all satisfy root engines constraint"
      pattern: "node-version: \\[20"
    - from: "packages/cds-core/package.json dependencies"
      to: "pnpm-lock.yaml"
      via: "Lockfile regen after dependency add"
      pattern: "better-sqlite3"
---

<objective>
Bump the CDS baseline from Node 18 to Node 20+, install `better-sqlite3@^12.9.0` as a `@cds/core` dependency, and record the new dependency in NOTICES.md. Amends Phase 33 Plan 04's CI matrix so downstream plans in Phase 35 execute against a Node 20+ CI.

Purpose: Per CONTEXT.md D-33/D-34, this is the prerequisite wave for Phase 35. All subsequent plans (02/03/04) assume Node 20+ runtime and better-sqlite3 availability.
Output: Amended CI workflow, updated root + package-level package.json files, new NOTICES.md entry, regenerated pnpm-lock.yaml.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-PATTERNS.md

# Phase 33 carry-forward (source of truth for current CI + package.json state)
@.planning/phases/33-monorepo-foundation/33-04-SUMMARY.md

@.github/workflows/ci.yml
@package.json
@packages/cds-core/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drop Node 18 from CI matrix in both `packages-job` and `root-tests-job`</name>
  <files>.github/workflows/ci.yml</files>
  <read_first>.github/workflows/ci.yml, .planning/phases/33-monorepo-foundation/33-04-SUMMARY.md, .planning/phases/35-tiered-vault-tier-2-sqlite/35-PATTERNS.md</read_first>
  <action>Open `.github/workflows/ci.yml`. Locate BOTH `strategy.matrix.node-version` lines (there are exactly two — one under `packages-job`, one under `root-tests-job`). Each currently reads `node-version: [18, 20, 22]`. Replace BOTH occurrences with `node-version: [20, 22]`. Do NOT add Node 24 unless the planner verifies it is GA as an LTS at execution time. Do NOT touch any other part of the workflow (permissions block, detect-changes job, steps, paths-filter). Do NOT change `pnpm/action-setup@v4 with: version: 10` or `actions/setup-node@v4`. Commit message template: `chore(ci): drop node 18 from matrix for v1.0 baseline (D-33)`.</action>
  <verify>Run: `grep -n "node-version:" .github/workflows/ci.yml` and confirm exactly two lines remain, both reading `node-version: [20, 22]`. Run: `yq '.jobs."packages-job".strategy.matrix."node-version"' .github/workflows/ci.yml` (or manual parse) returns `[20, 22]`. Run: `grep -c "18" .github/workflows/ci.yml` and confirm no remaining `18` reference where it would be interpreted as a Node major (acceptable: `@v18` in action versions, e.g., `cache@v18` — none currently exist, but tolerate if present).</verify>
  <acceptance_criteria>
    - .github/workflows/ci.yml contains exactly two occurrences of `node-version: [20, 22]`
    - .github/workflows/ci.yml does NOT contain the string `node-version: [18` anywhere
    - No other block in ci.yml is modified — `permissions`, `detect-changes`, `paths-filter` patterns, `pnpm/action-setup@v4`, `actions/setup-node@v4 with: cache: 'pnpm'` all remain unchanged
  </acceptance_criteria>
  <done>ci.yml matrix reads `[20, 22]` in both jobs; no other diff in the file.</done>
</task>

<task type="auto">
  <name>Task 2: Bump root `package.json` engines.node to `>=20`</name>
  <files>package.json</files>
  <read_first>package.json, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md</read_first>
  <action>Open root `package.json`. Locate the `"engines"` object — it currently reads `"engines": { "node": ">=18" }`. Change `">=18"` to `">=20"`. Do NOT change `"packageManager": "pnpm@10.6.3"`. Do NOT change `"version"` (Phase 39 handles the 1.0.0-alpha.1 bump). Do NOT touch any other field.</action>
  <verify>Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf-8')).engines.node)"` — expected output `>=20`. Run: `git diff --stat package.json` — expected 1 line changed (one `-`, one `+`).</verify>
  <acceptance_criteria>
    - package.json contains the exact string `"node": ">=20"` inside the engines object
    - package.json does NOT contain `"node": ">=18"` anywhere
    - package.json `"version"` field is unchanged (still `"0.12.1"` or whatever Phase 34 set; do not re-bump)
    - package.json `"packageManager"` field is unchanged
  </acceptance_criteria>
  <done>engines.node reads ">=20"; no other fields changed.</done>
</task>

<task type="auto">
  <name>Task 3: Add `better-sqlite3` dependency and `@types/better-sqlite3` devDependency to `@cds/core`</name>
  <files>packages/cds-core/package.json, pnpm-lock.yaml</files>
  <read_first>packages/cds-core/package.json, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md, .planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md</read_first>
  <action>Run these two commands IN THE REPO ROOT (not in the package subdirectory) so pnpm resolves the filter correctly:
  1. `pnpm --filter @cds/core add better-sqlite3@^12.9.0`
  2. `pnpm --filter @cds/core add -D @types/better-sqlite3`
  (The second command installs the latest `^7.x` available at time of execution per RESEARCH.md A1. If the registry resolves a non-`^7.x` major, stop and log the resolved range to SUMMARY — do NOT auto-downgrade.)
  Both commands update `packages/cds-core/package.json` in-place and regenerate `pnpm-lock.yaml`. Do NOT hand-edit either file — use pnpm commands only so lockfile integrity holds. After the commands complete, confirm `packages/cds-core/package.json` now contains a `"dependencies"` object with `"better-sqlite3": "^12.9.0"` and a `"devDependencies"` object with `"@types/better-sqlite3": "^7.x.x"` (exact patch).</action>
  <verify>Run: `node -e "const p=JSON.parse(require('fs').readFileSync('packages/cds-core/package.json','utf-8')); console.log(p.dependencies['better-sqlite3'], p.devDependencies['@types/better-sqlite3'])"` — expect both to print non-empty version strings. Run: `grep -c "better-sqlite3" pnpm-lock.yaml` — expect at least 2 (one under `@cds/core` dependencies, one in the `packages:` block with the resolved tarball). Run: `pnpm install --frozen-lockfile` — must exit 0.</verify>
  <acceptance_criteria>
    - packages/cds-core/package.json has `"better-sqlite3"` under `"dependencies"` with version starting `"^12."`
    - packages/cds-core/package.json has `"@types/better-sqlite3"` under `"devDependencies"` with version starting `"^7."`
    - pnpm-lock.yaml contains at least one entry matching `better-sqlite3@` (resolved tarball spec)
    - `pnpm install --frozen-lockfile` exits with status 0 on Node 20+
  </acceptance_criteria>
  <done>@cds/core package.json + lockfile updated; frozen-lockfile install succeeds.</done>
</task>

<task type="auto">
  <name>Task 4: Record better-sqlite3 attribution in NOTICES.md</name>
  <files>NOTICES.md</files>
  <read_first>NOTICES.md, .planning/phases/35-tiered-vault-tier-2-sqlite/35-PATTERNS.md</read_first>
  <action>Open `NOTICES.md` (created in Phase 34). Append the following block at the end of the file, separated from the prior content by a blank line. Match the existing entry format if Phase 34 established one (e.g., if the @anthropic-ai/claude-agent-sdk entry uses a different heading level or bullet style, conform to that). Canonical block if no established format exists:

```markdown
## better-sqlite3

- **Package:** better-sqlite3
- **Version:** ^12.9.0
- **License:** MIT
- **Source:** https://github.com/WiseLibs/better-sqlite3
- **Used by:** @cds/core (vault/sessions SQLite backend — VAULT-01/02/03)
```

Do NOT modify any existing Phase 34 entry. Do NOT move existing entries. Appending only.</action>
  <verify>Run: `grep -n "better-sqlite3" NOTICES.md` — expect at least one match citing MIT and the WiseLibs URL. Run: `grep -c "^## " NOTICES.md` — expect the existing heading count incremented by 1 (or the equivalent if Phase 34 used `### ` / `- ` style). Run: `wc -l NOTICES.md` — expect the file length increased by at least 5 lines (header + 4 bullets).</verify>
  <acceptance_criteria>
    - NOTICES.md contains the string `better-sqlite3`
    - NOTICES.md contains the string `MIT` on the same or adjacent line as `better-sqlite3`
    - NOTICES.md contains the URL `https://github.com/WiseLibs/better-sqlite3`
    - Pre-existing NOTICES.md entries are unchanged (diff shows only appended lines)
  </acceptance_criteria>
  <done>NOTICES.md appended with a better-sqlite3 entry; no existing content modified.</done>
</task>

<task type="auto">
  <name>Task 5: Verify green build + test across the new baseline</name>
  <files></files>
  <read_first>.planning/phases/35-tiered-vault-tier-2-sqlite/35-VALIDATION.md</read_first>
  <action>Run the monorepo build + test sequence to prove Plan 01 landed cleanly and the monorepo still compiles + passes existing tests (Phase 33/34 test baseline):
  1. `pnpm install --frozen-lockfile` — must exit 0
  2. `pnpm -r run build` — must exit 0 (compiles all packages including cds-core which now has better-sqlite3 in its dep tree)
  3. `pnpm -r run test` — must exit 0 (root tests + each package's vitest run)
  If any step fails, STOP and escalate: do not silently patch, do not downgrade versions. Log the failing command and output to the eventual SUMMARY.md. Expected state: all existing tests (from Phase 33/34) continue to pass; no new tests introduced by this plan.</action>
  <verify>All three commands above exit 0. `pnpm -r run test` output shows the existing test counts (unchanged from Phase 34 baseline).</verify>
  <acceptance_criteria>
    - `pnpm install --frozen-lockfile` exits with status 0
    - `pnpm -r run build` exits with status 0
    - `pnpm -r run test` exits with status 0
    - No tests removed or skipped as a side effect of Plan 01
  </acceptance_criteria>
  <done>Full monorepo build + test suite green on the local Node 20+ environment.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `grep -n "node-version:" .github/workflows/ci.yml` shows only `[20, 22]` entries
- [ ] `node -e "console.log(require('./package.json').engines.node)"` prints `>=20`
- [ ] `node -e "console.log(require('./packages/cds-core/package.json').dependencies['better-sqlite3'])"` prints a `^12.` version
- [ ] `grep better-sqlite3 NOTICES.md` returns at least one match
- [ ] `pnpm install --frozen-lockfile && pnpm -r run build && pnpm -r run test` all exit 0
</verification>

<success_criteria>
- All 5 tasks completed
- CI matrix, root engines, NOTICES.md, and @cds/core package.json updated exactly as specified
- pnpm-lock.yaml regenerated via pnpm commands (not hand-edited)
- Full monorepo build + test pass on Node 20+
- No regressions in Phase 33/34 test counts
</success_criteria>

<output>
After completion, create `.planning/phases/35-tiered-vault-tier-2-sqlite/35-01-SUMMARY.md` documenting: resolved better-sqlite3 version, resolved @types/better-sqlite3 version, test count before/after, any prebuild warnings from pnpm install.
</output>
