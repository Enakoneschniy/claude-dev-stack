---
phase: 43-core-vault-primitives
plan: 01
status: complete
started: 2026-04-17
completed: 2026-04-17
---

# Plan 43-01 Summary: VaultBackend Interface & EntityGraph Primitive

## What Was Built

Created the two foundational vault primitives that unblock all downstream v1.1 phases:

1. **VaultBackend abstraction** (`vault/backend.ts`) — Interface with `pull()`/`push()` async methods, `ConflictStrategy` enum (MergeByUuid, LastWriteWins), and `FsBackend` no-op class. Phase 44 (S3Backend) imports and implements this interface.

2. **Entity graph data API** (`vault/graph.ts`) — `getEntityGraph(projectPath)` returns framework-agnostic `EntityGraph` with `GraphNode[]` and `GraphEdge[]`. Opens sessions.db in read-only mode (no migrations), queries entities/relations tables, computes frequency-based edge weights via SQL GROUP BY.

## Key Files

### Created
- `packages/cds-core/src/vault/backend.ts` — VaultBackend interface, ConflictStrategy enum, FsBackend class
- `packages/cds-core/src/vault/backend.test.ts` — 6 tests (enum values, no-op behavior, structural typing)
- `packages/cds-core/src/vault/graph.ts` — getEntityGraph function, GraphNode/GraphEdge/EntityGraph types
- `packages/cds-core/src/vault/graph.test.ts` — 5 tests (empty graph, node mapping, edge weights, relationType, displayName)

### Modified
None — all new files.

## Decisions Made
- Used `new Database(path, { readonly: true })` for graph.ts instead of `openRawDb` (avoids running migrations on read-only operations)
- Edge weight is frequency-based: COUNT(*) GROUP BY from_entity, to_entity, relation_type
- Used regular `enum` (not `const enum`) for ConflictStrategy to preserve runtime values

## Self-Check: PASSED
- All 11 new tests pass
- No modifications to existing files
- VaultBackend interface is importable and structurally implementable by external classes
- getEntityGraph correctly returns empty arrays for empty DBs and populated data for seeded DBs

## Deviations
None — implementation matches plan exactly.
