# Phase 43: Core Vault Primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 43-core-vault-primitives
**Areas discussed:** VaultBackend scope, Graph data shape, Project discovery, Code organization

---

## VaultBackend Scope

### Sync Unit

| Option | Description | Selected |
|--------|-------------|----------|
| Whole file (Recommended) | pull()/push() sync entire sessions.db. Simple, atomic. WAL checkpoint before push. | ✓ |
| Row-level merge | pull()/push() sync individual rows. Complex but enables real-time multi-device. | |
| You decide | Claude picks based on research. | |

**User's choice:** Whole file (Recommended)
**Notes:** Atomic file transfer is simpler and sufficient for single-user cross-device sync.

### Conflict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Interface-level (Recommended) | VaultBackend defines ConflictStrategy enum. Backends implement the chosen strategy. | ✓ |
| Backend-specific | VaultBackend just has pull()/push(). Each backend handles conflicts its own way. | |
| You decide | Claude picks based on research. | |

**User's choice:** Interface-level (Recommended)
**Notes:** Consistent conflict handling across all backends.

---

## Graph Data Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Generic nodes+edges | Custom TS types: GraphNode + GraphEdge. Framework-agnostic. | ✓ |
| Cytoscape-native JSON | Return cytoscape ElementDefinition[] directly. Couples to cytoscape. | |
| You decide | Claude picks the format. | |

**User's choice:** Generic nodes+edges
**Notes:** Dashboard (Phase 48) adapts to cytoscape. Core stays framework-agnostic.

---

## Project Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| Filesystem scan (Recommended) | Scan ~/vault/projects/*/sessions.db. Zero config. | ✓ |
| Registry lookup | Read project-map.json for explicit list. | |
| Both with fallback | Try registry first, fall back to scan. | |

**User's choice:** Filesystem scan (Recommended)
**Notes:** Works with existing vault structure. No config needed.

---

## Code Organization

| Option | Description | Selected |
|--------|-------------|----------|
| New files (Recommended) | vault/graph.ts + vault/multi-search.ts. sessions.ts stays focused. | ✓ |
| Extend sessions.ts | Add to existing single file. Consistent with v1.0 pattern. | |
| You decide | Claude picks based on complexity. | |

**User's choice:** New files (Recommended)
**Notes:** Clean separation. sessions.ts stays focused on single-project operations.

---

## Claude's Discretion

- Graph edge weight computation method
- Exact TypeScript generic signatures for VaultBackend
- searchAllProjects return type (array vs map)
- Test strategy

## Deferred Ideas

None — discussion stayed within phase scope.
