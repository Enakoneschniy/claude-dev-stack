---
plan_id: 33-02-typescript-project-references
phase: 33
plan: 02
status: complete
completed: 2026-04-16
commits:
  - "3683803 feat(33-02): wire TypeScript project references for 4-package build"
---

# Plan 33-02: TypeScript Project References — SUMMARY

## Outcome

MONO-02 satisfied. `pnpm tsc --build` compiles all 4 packages in dependency order with zero errors and ESM-only output.

## Files Created (6)

- `tsconfig.base.json` — shared compiler options (ESM NodeNext, composite, declaration, strict, noUncheckedIndexedAccess)
- `tsconfig.json` — root solution file (`files: []`, `references: [cds-core, cds-cli, cds-migrate, cds-s3-backend]`)
- `packages/cds-core/tsconfig.json` — composite, no references (dep root)
- `packages/cds-cli/tsconfig.json` — composite, references `../cds-core`
- `packages/cds-migrate/tsconfig.json` — composite, references `../cds-core`
- `packages/cds-s3-backend/tsconfig.json` — composite, references `../cds-core`

## Files Modified (1)

- `packages/cds-s3-backend/src/index.ts` — fix JSDoc comment: `vault/projects/*/sessions.db` contained a literal `*/` mid-comment that terminated the JSDoc block early and produced parser errors (TS1005/TS1161). Changed to `vault/projects sessions.db` to avoid the embedded `*/`.

## Reference Graph

From `pnpm tsc --build --dry --verbose`:
```
Projects in this build:
  * packages/cds-core/tsconfig.json      ← built first (no refs)
  * packages/cds-cli/tsconfig.json       ← refs ../cds-core
  * packages/cds-migrate/tsconfig.json   ← refs ../cds-core
  * packages/cds-s3-backend/tsconfig.json ← refs ../cds-core
  * tsconfig.json                        ← solution file (no emit)
```

## Emitted Artifacts (16 files total)

Per package (cds-core, cds-cli, cds-migrate, cds-s3-backend):
- `dist/index.js` — ESM output with `export const CDS_{pkg}_VERSION = '0.0.0-stub'`
- `dist/index.d.ts` — declarations: `export declare const CDS_{pkg}_VERSION = "0.0.0-stub"`
- `dist/index.js.map` + `dist/index.d.ts.map` — source maps

ESM-only verified: `grep -r "module.exports" packages/*/dist/` returns zero matches.

## Deviations

- **Added `ignoreDeprecations: "6.0"`** to `tsconfig.base.json` because TypeScript 6.0.2 warns that `esModuleInterop: false` will be removed in TS 7.0. The plan locked the option but didn't foresee this warning. The `ignoreDeprecations` flag is the officially supported escape hatch. Full removal in TS 7.0 will require revisiting `esModuleInterop` — tracked implicitly via the `6.0` scope.
- **`cds-s3-backend` JSDoc fix** (described above) — not a planner omission, just a planning-time text artifact in the stub content.

## Compiler Version

`pnpm tsc --version` → `Version 6.0.2` (pinned in root devDependencies).

## Ready For

- Plan 03 (vitest migration) — TypeScript infrastructure independent of vitest, both can coexist
- Plan 04 (CI) — `pnpm tsc --build` works in CI runner with `--frozen-lockfile`
