---
phase: 43-core-vault-primitives
plan: 02
status: complete
started: 2026-04-17
completed: 2026-04-17
---

# Plan 43-02 Summary: Cross-Project Search & Barrel Exports

## What Was Built

1. **searchAllProjects()** (`vault/multi-search.ts`) — Cross-project FTS5 search that discovers all sessions.db files under vault/projects/, batches DB connections in groups of 9, queries FTS5 per DB, and merges results sorted by BM25 rank. Returns flat `CrossSearchHit[]` with project attribution.

2. **Barrel exports** (`vault/index.ts`) — All Phase 43 exports wired through the vault barrel: VaultBackend (type), FsBackend, ConflictStrategy, getEntityGraph, GraphNode/GraphEdge/EntityGraph (types), searchAllProjects, CrossSearchHit (type). All importable from `@cds/core`.

3. **Boundary test extension** (`vault.boundary.test.ts`) — New test verifying Phase 43 public symbols are present and correctly typed in the @cds/core surface.

## Key Files

### Created
- `packages/cds-core/src/vault/multi-search.ts` — searchAllProjects function, CrossSearchHit type
- `packages/cds-core/src/vault/multi-search.test.ts` — 7 tests (empty vault, cross-project, rank sorting, limit, 11-project batch boundary, VAULT_PATH env, FD leak)

### Modified
- `packages/cds-core/src/vault/index.ts` — Added Phase 43 re-exports
- `packages/cds-core/src/vault/vault.boundary.test.ts` — Extended expected array + new Phase 43 primitives test

## Decisions Made
- Used per-DB connections instead of ATTACH for FTS5 queries. FTS5 MATCH does not support schema-qualified table names (`p0.observations_fts MATCH ?` fails with "no such column"). This was flagged as RESEARCH.md Assumption A2 and confirmed empirically. Batching in groups of 9 is preserved to bound concurrent open file descriptors.
- CrossSearchHit is a flat interface (not extending SearchHit) for simpler consumer access.

## Self-Check: PASSED
- All 7 multi-search tests pass including the 11-project batch boundary test
- All 6 boundary tests pass (including new Phase 43 test)
- No FD leaks (connections closed in finally blocks)
- Full @cds/core test suite green (except pre-existing agent-dispatcher.test.ts issue)

## Deviations
- **ATTACH not used for FTS5** — Plan specified ATTACH batching with per-schema FTS5 queries. Empirical testing proved schema-qualified FTS5 MATCH is not supported by SQLite. Switched to per-DB connections while preserving batch-of-9 grouping for FD management. This is a documented deviation from D-07's ATTACH approach, but achieves the same goal (bounded connections, correct results).
