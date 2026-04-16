# Phase 37 Plan 03 — Summary

**Commit:** e20c4f6
**Tasks completed:** 7 of 7

## Tools delivered

| Module                                                   | Purpose                                                                       |
|----------------------------------------------------------|-------------------------------------------------------------------------------|
| `packages/cds-cli/src/mcp-tools/docs-search.ts`          | Ripgrep wrapper with POSIX grep fallback; path-traversal guard; streaming ND-JSON parser. |
| `packages/cds-cli/src/mcp-tools/planning-parsers.ts`     | 5 lenient pure parsers (frontmatter, milestone, phases, current_phase, critical_risks).   |
| `packages/cds-cli/src/mcp-tools/planning-status.ts`      | Project resolver (project-map → vault dir → cwd) + parser orchestration + plan_count enrichment. |
| `packages/cds-cli/src/mcp-tools/__fixtures__/vault-tree.ts` | Shared fixture vault builder (docs + `.planning/{ROADMAP,STATE}.md` + project-map.json). |

## rg vs grep notes

- The dev environment used to run the suite has **no ripgrep on PATH**, so
  the rg-dependent `'finds matches in current project with ripgrep path'`
  test skipped (`it.skipIf(!RG_AVAILABLE)`). All other docs.search tests
  exercised the **POSIX grep fallback path** end-to-end:
  vault-relative paths, traversal rejection, cross-project scope=all,
  empty-result handling, VaultNotFoundError, default scope=current.
- The fallback warning `"ripgrep not found, using POSIX grep (slower on
  large vaults)"` is emitted exactly once per process (gate via
  `loggedFallback`). Tests assert it does not throw.

## Parser fixture strategies

Inline string fixtures in `planning-parsers.test.ts` cover three axes:

1. **Format style** — markdown-table vs bullet list (`- [x]` / `◆` / `- [ ]`).
2. **Completeness** — full (all fields populated), minimal (only
   frontmatter), empty, malformed (unclosed YAML string).
3. **Fuzz coverage** — 20 hand-crafted "weird" inputs (`'---'`, `'\x00\x01\x02'`,
   `'Phase:'` alone, malformed tables, ambiguous bullets) looped through
   every parser asserting no throws.

`planning-status.test.ts` uses `buildFixtureVault` to compose whole project
trees (alpha with full planning, beta with roadmap only, gamma with empty
`.planning/`, plus `broken` and `delta` sub-fixtures for the lenient-parser
and plan_count tests).

## Path-traversal rejection coverage

Threat **T-37-01** is verified by the `docs.search` test suite (rejects
`..`, absolute paths, `~/...` prefix, scope-with-slash). Additionally
`planning.status` reuses `assertValidScopeBasename` from `shared.ts` and
has its own rejection test (`'../etc'` → `InvalidFilterError`). Validated
at the input-validation layer, **before** any filesystem access.

## Test counts

| File                                                    | Tests | Status                   |
|---------------------------------------------------------|-------|--------------------------|
| `src/mcp-tools/docs-search.test.ts`                     | 13    | 12 passing, 1 skipped (rg)|
| `src/mcp-tools/planning-parsers.test.ts`                | 13    | passing                   |
| `src/mcp-tools/planning-status.test.ts`                 | 9     | passing                   |

Plan 03 total: **34 passing, 1 skipped** (rg-dependent).
Cumulative across Plans 01 + 02 + 03: **70 passing, 1 skipped** in
`pnpm --filter @cds/cli test`.

## Deviations from plan

- **`docs-search.ts` uses only `spawn` + `spawnSync`** (no `exec`). Both
  subprocess names are static literals (`'rg'`, `'grep'`); user input flows
  only through argv placeholders, which are shell-quoting-safe because
  `spawn` bypasses the shell entirely. No command-injection surface.
- **Ripgrep context parser** tracks pending matches in a small queue with
  `remainingAfter` counters rather than the "collapse context_before /
  context_after from a single buffer" approach the plan sketched —
  cleaner semantics when two matches share overlapping context windows
  (common on small markdown files).
- **POSIX grep fallback** shares the exact same hit shape as the rg path.
  Used regex `/^(.+?)([-:])(\d+)([-:])(.*)$/` to classify lines
  independent of locale / filename-with-colon edge cases; group separator
  `--` resets the pending queue.
- **Planning parser's `parseRoadmapPhases`** reads the final non-empty
  status cell of each table row (rather than a fixed column index) so
  roadmap-table variants with extra leading pipes or trailing notes
  columns still classify rows correctly.
- **`planning.status` resolves project via three-tier lookup**
  (project-map → `vault/projects/{name}` → cwd fallback if `name` was
  derived from cwd). The cwd fallback is useful when the test harness
  sets `deps.cwd` to a project outside the fixture vault tree.
- **`plan_count` matches directories whose name **starts with**
  `{phaseNumber}-`** (e.g. `37-mcp-adapter` or `037-…`). Plan 03 tests
  pin on `37-mcp/37-01-PLAN.md` / `37-02-PLAN.md` — both style variants
  counted.
