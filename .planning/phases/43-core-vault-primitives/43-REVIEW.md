---
phase: 43-core-vault-primitives
status: clean
depth: standard
files_reviewed: 4
findings: 0
date: 2026-04-17
---

# Phase 43 Code Review

## Scope

| File | Lines | Role |
|------|-------|------|
| packages/cds-core/src/vault/backend.ts | 59 | VaultBackend interface + FsBackend class |
| packages/cds-core/src/vault/graph.ts | 101 | getEntityGraph function |
| packages/cds-core/src/vault/multi-search.ts | 200 | searchAllProjects function |
| packages/cds-core/src/vault/index.ts | 34 | Barrel exports |

## Findings

No issues found.

## Analysis

### Security
- All SQL queries use parameterized statements (`db.prepare().all(param)`) -- no string interpolation
- `query_only = ON` pragma set on read connections in multi-search
- All DB connections wrapped in try/finally for guaranteed cleanup
- `readdirSync` for filesystem discovery operates on known vault directory, not user input
- `readonly: true` flag on all read-only Database connections

### Code Quality
- Clean separation: interface (backend.ts), data primitive (graph.ts), search (multi-search.ts)
- Consistent patterns with existing sessions.ts (same import style, error handling, path resolution)
- Regular `enum` used for ConflictStrategy (not `const enum`) -- preserves runtime values
- JSDoc comments on all public exports
- Type-safe row mapping with explicit interfaces (EntityRow, EdgeRow, SearchRow)

### Architecture
- FTS5 schema-qualification limitation documented in module comment with empirical confirmation reference
- Batch-of-9 grouping preserved despite per-DB approach (bounds open FDs)
- Silent error handling in searchSingleDb for DBs without FTS5 tables (graceful degradation)
- No modifications to existing code -- all additive

### Potential Improvements (advisory, not blocking)
- `JSON.parse(row.entities)` in mapRow could throw on malformed data. Current risk is minimal since entities are written by the same codebase, but a try/catch with fallback to `[]` would be more defensive.
