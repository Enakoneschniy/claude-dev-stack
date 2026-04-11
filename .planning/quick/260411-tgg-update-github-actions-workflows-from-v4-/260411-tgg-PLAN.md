# Quick Task 260411-tgg — Update GitHub Actions workflows v4 → v5

**Date:** 2026-04-11
**Type:** Tech debt — backlog P2 #1 from 2026-04-11-v0.8.1-hotfix-shipped session log
**Trigger:** Node 20 deprecation warning observed on v0.8.1 publish run (run id 24289179199). Hard deadline June 2026.

## Goal

Replace `actions/checkout@v4` and `actions/setup-node@v4` with `@v5` in both workflows so the GitHub Actions runtime no longer trips the Node 20 deprecation warning.

## Research summary

- **`actions/checkout@v5`** — latest v5.0.1 (released 2024-11-17). Breaking changes: requires runner v2.327.1+, internally uses Node 24.
- **`actions/setup-node@v5`** — latest v5.0.0 (released 2024-09-04). Breaking changes:
  1. Requires runner v2.327.1+ (irrelevant — GitHub-hosted `ubuntu-latest` always current).
  2. Auto-caches deps when `packageManager` field exists in `package.json` — **our `package.json` has no `packageManager` field** (verified), so this is a no-op for us.
  3. Internally uses Node 24.

**Conclusion:** Pure deps bump. No workflow logic changes required.

## Changes

### `.github/workflows/ci.yml`

```diff
-      - uses: actions/checkout@v4
+      - uses: actions/checkout@v5

       - name: Use Node.js ${{ matrix.node-version }}
-        uses: actions/setup-node@v4
+        uses: actions/setup-node@v5
```

### `.github/workflows/publish.yml`

```diff
-      - uses: actions/checkout@v4
+      - uses: actions/checkout@v5

-      - uses: actions/setup-node@v4
+      - uses: actions/setup-node@v5
```

## Verification

1. `node --check .github/workflows/*.yml` — N/A (YAML, not JS). Skip.
2. `npm test` — must pass locally (sanity check, workflows don't affect runtime).
3. CI matrix on PR — must go green on Node 18/20/22 (CI-side test, runs after push).
4. Optional: trigger publish workflow on next release and verify no deprecation warning in logs.

## Out of scope

- Bumping `node-version: 24` for the publish job (separate decision — consistency with current setup).
- Bumping the CI matrix beyond `[18, 20, 22]` (separate decision — driven by `engines.node` policy).
- Any other actions in the workflows (we don't have any third-party actions).

## Risk

**Low.** Both v5 releases are 5+ months old (Sept/Nov 2024 → April 2026), have no logic-affecting breaking changes for our setup, and the rollback is `git revert`.
